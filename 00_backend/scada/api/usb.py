"""
Flashka na PC u stroje (/api/usb) — uložení CSV / XLSX zakázky na flashku a bezpečné odebrání.

Účel: V kiosku u stroje se soubory nestahují do prohlížeče (složka Stažené na PC), ale na zasunutou flashku
      (rozhodnutí uživatele 2026-10-27). Jen administrátor (i přihlášení přes PLC) a jen u stroje.

Rozhraní:
  GET  /api/usb          → UsbStatus {supported, drives[{letter, label, total_bytes, free_bytes}]}
  POST /api/usb/export   → UsbExportResult {drive, path, bytes}  — {file_id, location, type, format csv|xlsx, drive}
                           404 soubor / flashka není, 507 málo místa, 503 úložiště / zápis selhal
  POST /api/usb/eject    → 204 — {drive}; 409 = na flashce je otevřený soubor

Napojení:
  Závisí na: services/usb_service, DataReader (resolve_path, export_xlsx), dependencies.{require_local, require_role}
  Používá: frontend context/UsbContext.tsx
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response

from scada.api.dependencies import require_local, require_role
from scada.models import UsbDriveModel, UsbEjectRequest, UsbExportRequest, UsbExportResult, UsbStatus
from scada.services import usb_service
from scada.services.io_pool import NasBusyError, run_io
from scada.services.protocols import DataReader

router = APIRouter()
log = logging.getLogger(__name__)

_ADMIN = [Depends(require_local), Depends(require_role("admin"))]


@router.get("/usb", response_model=UsbStatus, dependencies=_ADMIN)
async def usb_status() -> UsbStatus:
    """Připojené flashky (USB svazky) — frontend se ptá po pár sekundách, dokud je admin u stroje."""
    drives = await asyncio.to_thread(usb_service.list_drives)
    return UsbStatus(supported=usb_service.supported(),
                     drives=[UsbDriveModel(letter=d.letter, label=d.label, total_bytes=d.total_bytes,
                                           free_bytes=d.free_bytes) for d in drives])


async def _check_drive(letter: str) -> str:
    drives = await asyncio.to_thread(usb_service.list_drives)
    letter = letter.upper()
    if letter not in {d.letter for d in drives}:
        raise HTTPException(status_code=404, detail=f"Flashka {letter}: není připojená")
    return letter


@router.post("/usb/export", response_model=UsbExportResult)
async def usb_export(body: UsbExportRequest, request: Request,
                     session: dict = Depends(require_role("admin")), _: None = Depends(require_local)) -> UsbExportResult:
    """Uloží originální CSV nebo XLSX zakázky / testu na flashku (složka Trafag_ScadaViewer)."""
    letter = await _check_drive(body.drive)
    reader: DataReader = request.app.state.csv_reader
    loc, ftype = body.location, body.file_type
    timeout = 120.0 if loc == "remote" else 60.0
    try:
        if body.format == "xlsx":
            data = await asyncio.wait_for(run_io(loc, reader.export_xlsx, body.file_id, loc, ftype), timeout=timeout)
            if data is None:
                raise HTTPException(status_code=404, detail="Soubor nenalezen")
            stem = body.file_id[:-4] if body.file_id.lower().endswith(".csv") else body.file_id
            source: bytes | object = data
            name = stem + ".xlsx"
        else:
            path = await asyncio.wait_for(run_io(loc, reader.resolve_path, body.file_id, loc, ftype), timeout=timeout)
            if path is None:
                raise HTTPException(status_code=404, detail="Soubor nenalezen")
            source, name = path, body.file_id
        # Zápis na flashku: NAS soubor se čte během kopírování → přes run_io (NAS pool s timeoutem)
        target = await asyncio.wait_for(
            run_io(loc if body.format == "csv" else "local", usb_service.write_file, letter, name, source),
            timeout=timeout)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=503, detail=f"Úložiště nebo flashka neodpovídá — timeout ({timeout:.0f} s)") from None
    except NasBusyError:
        raise
    except usb_service.UsbSpaceError as exc:
        raise HTTPException(status_code=507, detail=str(exc)) from exc
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Soubor nenalezen") from None
    except (usb_service.UsbError, OSError) as exc:
        log.error("[API]   usb export %s → %s: %s", body.file_id, letter, exc)
        raise HTTPException(status_code=503, detail=f"Zápis na flashku selhal: {exc}") from exc
    size = target.stat().st_size if target.exists() else 0
    log.info("[API]   usb export %s (%s, %s) → %s (%s)", body.file_id, loc, body.format, target,
             session.get("username", "?"))
    return UsbExportResult(drive=letter, path=str(target), bytes=size)


@router.post("/usb/eject", status_code=204, dependencies=_ADMIN)
async def usb_eject(body: UsbEjectRequest) -> Response:
    """Bezpečné odebrání flashky (zápis na disk, odpojení svazku, vysunutí)."""
    letter = await _check_drive(body.drive)
    try:
        await asyncio.wait_for(asyncio.to_thread(usb_service.eject, letter), timeout=30.0)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=503, detail="Odebrání flashky neodpovídá — zkuste znovu") from None
    except usb_service.UsbBusyError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except (usb_service.UsbError, OSError) as exc:
        log.error("[API]   usb eject %s: %s", letter, exc)
        raise HTTPException(status_code=503, detail=f"Bezpečné odebrání selhalo: {exc}") from exc
    return Response(status_code=204)
