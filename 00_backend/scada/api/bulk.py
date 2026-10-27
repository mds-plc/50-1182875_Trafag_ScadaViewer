"""
Hromadné stažení (/api/bulk) — všechny zakázky podle filtru přehledu Databáze nebo vybrané soubory (2026-10-27).

Účel: Náhled (počet, velikost) a ZIP do prohlížeče. U stroje se ukládá na flashku — POST /api/usb/bulk (api/usb.py).

Zodpovědnost:
  - collect(): soubory podle filtru / výběru přes FileService.bulk_items (NAS přes run_io s timeoutem), strop
    BULK_LIMIT (500) — nad něj 413 (frontend dialog vyzve k zúžení filtru).
  - Jednorázový odkaz (ticket): POST /api/bulk/ticket ověří přihlášení a připraví stažení; prohlížeč pak stáhne
    GET /api/bulk/zip?ticket=… nativně (bez hlavičky Authorization, bez načtení celého ZIPu do paměti záložky).
    Odkaz platí TICKET_TTL_S a jen jednou; při stažení se ověří, že relace, která ho vydala, stále platí.

Rozhraní:
  POST /api/bulk/plan    → BulkPlan {count, bytes, limit, over_limit}      (každý přihlášený)
  POST /api/bulk/ticket  → BulkTicket {url, name, count}                   (každý přihlášený; 413 nad limit, 404 nic)
  GET  /api/bulk/zip     → ZIP (StreamingResponse)                         (?ticket=…; 404 neplatný / použitý)

Napojení:
  Závisí na: DataReader.bulk_items / export_xlsx, services/bulk_export, io_pool.run_io
  Používá: frontend components/BulkExportModal.tsx
"""
from __future__ import annotations

import asyncio
import logging
import queue
import secrets
import time
from collections.abc import AsyncIterator
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from scada.api.dependencies import require_auth
from scada.models import BulkExportRequest, BulkPlan, BulkRequest, BulkTicket
from scada.services import bulk_export
from scada.services.io_pool import NasBusyError, run_io
from scada.services.protocols import BULK_LIMIT, BulkItem, DataReader

router = APIRouter()
log = logging.getLogger(__name__)

TICKET_TTL_S = 120.0
_TICKETS_MAX = 50
_ZIP_IDLE_TIMEOUT_S = 120.0          # bez dalšího bloku tak dlouho = zaseknuté čtení (NAS) → přerušit


async def collect(request: Request, body: BulkRequest) -> tuple[list[BulkItem], int]:
    """Soubory hromadného stažení (filtr / výběr); NAS ve vlastním poolu s timeoutem."""
    reader: DataReader = request.app.state.csv_reader
    timeout = 60.0 if body.location == 'remote' else 30.0
    try:
        return await asyncio.wait_for(
            run_io(body.location, reader.bulk_items, body.location, body.file_type, body.from_date or None,
                   body.to_date or None, body.q or None, body.selection(), BULK_LIMIT),
            timeout=timeout)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=503, detail=f"Úložiště nedostupné — timeout ({timeout:.0f} s)") from None
    except NasBusyError:
        raise
    except OSError as exc:
        raise HTTPException(status_code=503, detail=f"Úložiště dočasně nedostupné: {exc}") from exc


def check_count(items: list[BulkItem], total: int) -> None:
    """Nad limit → 413, nic ke stažení → 404."""
    if total > BULK_LIMIT:
        raise HTTPException(status_code=413, detail={
            "code": "over_limit", "count": total, "limit": BULK_LIMIT,
            "message": f"Souborů je {total} — najednou nejvýš {BULK_LIMIT}. Zužte filtr."})
    if not items:
        raise HTTPException(status_code=404, detail={"code": "empty", "message": "Žádné soubory ke stažení"})


@router.post("/bulk/plan", response_model=BulkPlan)
async def bulk_plan(body: BulkRequest, request: Request, _: dict = Depends(require_auth)) -> BulkPlan:
    """Kolik souborů a jak velkých by se stáhlo (dialog před potvrzením)."""
    items, total = await collect(request, body)
    return BulkPlan(count=total if total > BULK_LIMIT else len(items), bytes=sum(i.size for i in items),
                    limit=BULK_LIMIT, over_limit=total > BULK_LIMIT)


@router.post("/bulk/ticket", response_model=BulkTicket)
async def bulk_ticket(body: BulkExportRequest, request: Request,
                      session: dict = Depends(require_auth)) -> BulkTicket:
    """Připraví jednorázový odkaz na ZIP (prohlížeč ho pak stáhne sám — i velký, bez paměti záložky)."""
    items, total = await collect(request, body)
    check_count(items, total)
    tickets: dict = request.app.state.bulk_tickets
    now = time.time()
    for t in [t for t, v in tickets.items() if v['expires'] < now]:
        tickets.pop(t, None)
    if len(tickets) >= _TICKETS_MAX:
        tickets.pop(next(iter(tickets)))
    name = bulk_export.bulk_name(body.file_type, body.from_date, body.to_date, body.q, body.files is not None) + '.zip'
    ticket = secrets.token_urlsafe(24)
    token = (request.headers.get("authorization") or "")[len("Bearer "):].strip()
    tickets[ticket] = {'items': items, 'format': body.format, 'name': name, 'expires': now + TICKET_TTL_S,
                       'token': token, 'user': session.get("username", "?")}
    return BulkTicket(url=f"/api/bulk/zip?ticket={ticket}", name=name, count=len(items))


@router.get("/bulk/zip")
async def bulk_zip(request: Request, ticket: str = Query(..., min_length=10, max_length=100)) -> StreamingResponse:
    """ZIP podle jednorázového odkazu — proudově (soubory se čtou postupně, žádný celý ZIP v paměti)."""
    entry = request.app.state.bulk_tickets.pop(ticket, None)
    if entry is None or entry['expires'] < time.time() or entry['token'] not in request.app.state.sessions:
        raise HTTPException(status_code=404, detail="Odkaz ke stažení vypršel nebo už byl použit — spusťte stažení znovu")
    reader: DataReader = request.app.state.csv_reader
    q, cancel = bulk_export.start_zip(entry['items'], entry['format'], reader.export_xlsx, entry['user'])

    async def chunks() -> AsyncIterator[bytes]:
        try:
            while True:
                try:
                    chunk = await asyncio.to_thread(q.get, True, _ZIP_IDLE_TIMEOUT_S)
                except queue.Empty:
                    log.error("[API]   hromadné stažení ZIP: čtení se zaseklo (NAS?) — přerušeno")
                    return
                if chunk is None:
                    return
                if isinstance(chunk, Exception):
                    return
                yield chunk
        finally:
            cancel.set()                               # odpojený klient → skládání ZIPu skončí

    name = entry['name']
    return StreamingResponse(
        chunks(), media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=\"{name}\"; filename*=UTF-8''{quote(name)}",
                 "Content-Encoding": "identity", "Cache-Control": "no-store"})
