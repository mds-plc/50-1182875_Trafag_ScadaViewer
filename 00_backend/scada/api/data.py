"""
REST endpoint pro čtení záznamů z CSV souboru (/api/data).

Účel: Poskytuje filtrovaná a stránkovaná data z jednoho CSV souboru zakázky.
      Slouží pro zobrazení záznamů v Database (rozbalený řádek) a ChartView (detail zakázky,
      filtr kusů, detail záznamu). per_page=0 = všechny záznamy najednou se stropem
      _ALL_RECORDS_CAP (20 000) — celé velké zakázky jdou přes /api/files/{id}/xlsx nebo CSV.

Zodpovědnost:
  - Validuje formát datumových parametrů (from/to) explicitně před voláním service.
    Důvod: ValueError ze service by mohl mít více příčin — explicitní validace
    vrátí HTTP 422 s přesnou zprávou o špatném datu dřív než začneme číst soubor.
  - Deleguje čtení na DataReader service (run_io — NAS ve vlastním poolu).
  - Počítá počet stránek ze serveru — klient nezná total a per_page zároveň.

Rozhraní:
  GET /api/data → DataResponse (records[], total, page, pages, group_counts, file_expected_count,
                                has_signal, total_all — počet bez filtru status/category,
                                order_info — údaje zakázky z bloků PROD_ souboru, Gateway 2.3.0+,
                                nok_counts — kusy s NOK v každé oblasti za celý soubor)
  GET /api/timeline → TimelineResponse (timestamps[], categories[]) — časový průběh zakázky
  Parametry: file (povinný), location, type, from, to, page, per_page (0 = vše),
             status (ok | nok), category (např. "1,3"), nok (např. "force,electric") — filtr detailu
             zakázky (kombinace = A ZÁROVEŇ; v rámci nok = aspoň jedna oblast),
             order (asc | desc) — řazení kusů od nejstaršího / nejnovějšího
  Vyžaduje autentizaci: Depends(require_auth)

Napojení:
  Závisí na: services (DataReader protokol), models.DataResponse, api/dependencies.require_auth
  Datový zdroj: CSV soubory zapsané DatabaseGateway (lokální disk nebo NAS)
  Používáno: frontend hooks/useData.ts {useFileRecords, useData} (Database, ChartView)
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any
from datetime import date as _date

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from scada.api.dependencies import require_auth
from scada.models import DataResponse, TimelineResponse
from scada.services.io_pool import NasBusyError, run_io
from scada.services.protocols import DataReader
from scada.services.repositories.csv_repository import NOK_CATEGORIES
from scada.services.signal_reader import prepare_signal_response
from scada.services.units import position_scale

router = APIRouter()
log = logging.getLogger(__name__)

_ALL_RECORDS_CAP = 20_000      # strop pro per_page=0

# Běžící prefetch úlohy — silná reference, jinak by je GC mohl zrušit před dokončením
_prefetch_tasks: set[asyncio.Task] = set()
# Buckety musí odpovídat frontendu (SignalCharts.tsx: fetchSignal(..., 'overview', 1000))
_PREFETCH_BUCKETS = 1000


def _warm_signal(reader: DataReader, file: str, location: str, file_type: str,
                 encoding: str, separator: str) -> None:
    """Naplní cache signálových dat (overview + zoom) — běží na pozadí po /api/data."""
    path = reader.resolve_path(file, location, file_type)
    if path is None:
        return
    for mode in ('overview', 'zoom_op', 'zoom_rp'):
        prepare_signal_response(path, mode, _PREFETCH_BUCKETS, encoding, separator)


async def _prefetch_signal(*args) -> None:
    location = args[2]
    try:
        await run_io(location, _warm_signal, *args)
    except NasBusyError:
        pass                                   # NAS visí — prefetch přeskočit, není kritický
    except Exception as exc:                   # prefetch nesmí shodit nic dalšího
        log.debug("[API]   signal prefetch %s selhal: %s", args[1], exc)


@router.get("/data", response_model=DataResponse, dependencies=[Depends(require_auth)])
async def get_data(
    request:   Request,
    file:      str        = Query(...,           description="Název souboru (file_id)"),
    location:  str        = Query('local',       description="local | remote"),
    file_type: str        = Query('production',  description="production | testing", alias="type"),
    from_date: str | None = Query(None,          alias="from", description="ISO datum od (YYYY-MM-DD)"),
    to_date:   str | None = Query(None,          alias="to",   description="ISO datum do (YYYY-MM-DD)"),
    page:      int        = Query(1,   ge=1,           description="Stránka (od 1)"),
    per_page:  int        = Query(200, ge=0, le=5000,  description="Počet záznamů na stránku; 0 = vše"),
    status:    str | None = Query(None, pattern="^(ok|nok)$", description="Filtr stavu: ok (kategorie 1–4) | nok (5–6)"),
    category:  str | None = Query(None, max_length=20,       description="Filtr kategorií, čárkami: např. 1,3,5"),
    order:     str        = Query('asc', pattern="^(asc|desc)$", description="Řazení kusů: asc = od nejstaršího, desc = od nejnovějšího"),
    nok:       str | None = Query(None, max_length=60,
                                  description="Filtr NOK oblastí, čárkami: force,position,electric,times,process (kus nevyhověl aspoň v jedné)"),
) -> DataResponse:
    """
    Vrátí záznamy z CSV souboru s volitelným filtrováním a stránkováním.

    Filtry from/to jsou inclusive, porovnávají se s Timestamp sloupcem. per_page=0 vrátí
    všechny záznamy najednou — slouží pro CSV/XLSX export, kde stránkování nedává smysl.
    group_counts a file_expected_count jsou dostupné jen pro production soubory.

    Args:
        file: Identifikátor souboru (bez přípony .csv).
        location: 'local' nebo 'remote' (NAS/UNC cesta).
        file_type: 'production' nebo 'testing'.
        from_date: Filtr od data (YYYY-MM-DD, inclusive). Volitelný.
        to_date: Filtr do data (YYYY-MM-DD, inclusive). Volitelný.
        page: Číslo stránky (od 1).
        per_page: Počet záznamů na stránku; 0 = vrátit vše najednou.
        status: Filtr stavu 'ok' / 'nok'. total a stránkování pak platí pro vyfiltrované záznamy.
        category: Filtr kategorií 1–6 (čárkami). group_counts zůstávají za celý soubor.
        order: 'asc' (pořadí výroby) / 'desc' (od nejnovějšího); při 'desc' nesou záznamy `_idx`.

    Returns:
        DataResponse — záznamy, total, stránkování a volitelné skupinové statistiky.

    Raises:
        HTTPException(422): neplatný formát datumu (from/to).
        HTTPException(503): I/O chyba na disku nebo nedostupné úložiště.
    """
    # Validace formátu datumových parametrů — HTTP 422 pro neplatný vstup
    # (dříve než zavoláme service, kde by neexistující soubor zkratoval logiku)
    for _pname, _pval in (('from', from_date), ('to', to_date)):
        if _pval is not None:
            try:
                _date.fromisoformat(_pval)
            except ValueError:
                raise HTTPException(
                    status_code=422,
                    detail=f"Neplatný formát parametru '{_pname}', očekáváno YYYY-MM-DD: {_pval!r}",
                ) from None
    categories: frozenset[str] | None = None
    if category:
        parts = frozenset(c.strip() for c in category.split(',') if c.strip())
        if not parts or not parts <= {'1', '2', '3', '4', '5', '6'}:
            raise HTTPException(status_code=422, detail=f"Neplatný parametr 'category' (1–6): {category!r}")
        categories = parts
    nok_areas: frozenset[str] | None = None
    if nok:
        parts = frozenset(c.strip().lower() for c in nok.split(',') if c.strip())
        if not parts or not parts <= set(NOK_CATEGORIES):
            raise HTTPException(status_code=422,
                                detail=f"Neplatný parametr 'nok' ({', '.join(NOK_CATEGORIES)}): {nok!r}")
        nok_areas = parts
    filtering = categories is not None or status is not None or nok_areas is not None
    stats: dict[str, Any] = {}       # total_all + order_info ze stejného indexu (jedno čtení, audit Q7)
    # per_page=0 = všechny záznamy najednou. Strop 20 000 řádků (~100 MB dočasně v paměti) chrání
    # server před vyčerpáním paměti — celé velké zakázky jdou přes XLSX / CSV (bez dictů po řádcích).
    effective_per_page = per_page if per_page > 0 else _ALL_RECORDS_CAP

    reader: DataReader = request.app.state.csv_reader
    # Timeout: remote (NAS/UNC) může blokovat desítky sekund při nedostupném disku;
    # local disk je rychlý, ale stále limitujeme pro ochranu event loopu.
    timeout = 30.0 if location == 'remote' else 10.0
    try:
        records, total, group_counts, file_expected_count = await asyncio.wait_for(
            run_io(
                location,
                reader.read_records,
                file_id=file, location=location, file_type=file_type,
                from_date=from_date, to_date=to_date,
                page=page, per_page=effective_per_page,
                categories=categories, status=status, stats=stats, order=order, nok=nok_areas,
            ),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        log.error("[API]   /api/data timeout (%s, %s, %.0f s)", file, location, timeout)
        raise HTTPException(status_code=504, detail="Čtení dat trvá příliš dlouho — úložiště může být nedostupné.") from None
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Neplatný formát data, očekáváno YYYY-MM-DD: {exc}",
        ) from exc
    except FileNotFoundError:
        # soubor mezitím přesunut (done_local → done_remote) nebo smazán
        raise HTTPException(status_code=404, detail="Soubor nenalezen") from None
    except OSError as exc:
        log.error("[API]   /api/data I/O chyba (%s): %s", file, exc)
        raise HTTPException(status_code=503, detail=f"Úložiště dočasně nedostupné: {exc}") from exc
    pages = max(1, (total + effective_per_page - 1) // effective_per_page) if per_page > 0 else 1
    # Detekce přítomnosti signálových dat (sectioned CSV propaguje _has_signal flag)
    has_signal = any(r.get('_has_signal') == 'true' for r in records)
    if has_signal:
        # Uživatel typicky otevře záložku Signal — parsování (~0,4 s / 40 MB) proběhne
        # na pozadí hned teď, grafy se pak zobrazí z cache okamžitě.
        cfg  = request.app.state.config.data
        task = asyncio.create_task(_prefetch_signal(
            reader, file, location, file_type, cfg.csv_encoding, cfg.csv_separator,
        ))
        _prefetch_tasks.add(task)
        task.add_done_callback(_prefetch_tasks.discard)
    return DataResponse(
        records=records, total=total, page=page, pages=pages, per_page=per_page,
        group_counts=group_counts or None,
        file_expected_count=file_expected_count,
        has_signal=has_signal,
        total_all=stats.get('total_all') if filtering else None,
        position_scale=_position_scale(records),
        order_info=stats.get('order_info') if file_type == 'production' else None,
        nok_counts=stats.get('nok_counts') if file_type == 'production' else None,
    )


def _position_scale(records: list[dict]) -> str | None:
    """Souřadnice poloh v souboru podle prvního záznamu s FP a TTP (units.position_scale)."""
    for rec in records:
        scale = position_scale(rec.get('fp_freeposition'), rec.get('ttp_totaltravelposition'))
        if scale is not None:
            return scale
    return None


@router.get("/timeline", response_model=TimelineResponse, dependencies=[Depends(require_auth)])
async def get_timeline(
    request:   Request,
    file:      str = Query(...,          description="Název souboru (file_id)"),
    location:  str = Query('local',      description="local | remote"),
    file_type: str = Query('production', description="production | testing", alias="type"),
) -> TimelineResponse:
    """
    Časové značky a kategorie VŠECH záznamů zakázky (bez stránkování, bez parametrů).

    Frontend (ChartView → Časový průběh) ho načte až po přepnutí na graf — běžné otevření
    detailu zakázky nezatěžuje. Testing soubory → 404 (jeden záznam, časová osa nedává smysl).
    """
    if file_type != 'production':
        raise HTTPException(status_code=404, detail="Časový průběh je jen pro production zakázky")
    reader: DataReader = request.app.state.csv_reader
    timeout = 30.0 if location == 'remote' else 10.0
    try:
        result = await asyncio.wait_for(
            run_io(location, reader.read_timeline, file, location, file_type),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        log.error("[API]   /api/timeline timeout (%s, %s, %.0f s)", file, location, timeout)
        raise HTTPException(status_code=504, detail="Čtení dat trvá příliš dlouho — úložiště může být nedostupné.") from None
    except FileNotFoundError:
        # soubor mezitím přesunut (done_local → done_remote) nebo smazán
        raise HTTPException(status_code=404, detail="Soubor nenalezen") from None
    except OSError as exc:
        log.error("[API]   /api/timeline I/O chyba (%s): %s", file, exc)
        raise HTTPException(status_code=503, detail=f"Úložiště dočasně nedostupné: {exc}") from exc
    if result is None:
        raise HTTPException(status_code=404, detail="Soubor nenalezen")
    timestamps, categories = result
    return TimelineResponse(timestamps=timestamps, categories=categories)
