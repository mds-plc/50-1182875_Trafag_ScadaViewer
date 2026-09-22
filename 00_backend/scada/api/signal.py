"""
REST endpoint pro signálová data z testovacích CSV souborů (/api/signal).

Účel: Poskytuje decimovaná signálová data pro interaktivní grafy v prohlížeči.
      Podporuje 5 režimů zobrazení: overview, results, hysteresis, zoom_op, zoom_rp.

Zodpovědnost:
  - Validuje vstupní parametry (file, location, type, mode)
  - Deleguje čtení a decimaci na signal_reader service (asyncio.to_thread)
  - Vrací sloupcová data + klíčové body (FP/OP/RP/TTP)

Rozhraní:
  GET /api/signal → dict (sloupcová data + key_points)
  Parametry: file (povinný), location, type, mode, buckets
  Vyžaduje autentizaci: Depends(require_auth)

Napojení:
  Závisí na: services/signal_reader.py, services/repositories/csv_repository.py
  Používáno: frontend hooks/useSignalData.ts
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from scada.api.dependencies import require_auth
from scada.services.signal_reader import prepare_signal_response
from scada.services.repositories.csv_repository import CsvRepository, _parse_sectioned

router = APIRouter()
log = logging.getLogger(__name__)

_VALID_MODES = frozenset({'overview', 'results', 'hysteresis', 'zoom_op', 'zoom_rp'})


@router.get("/signal", dependencies=[Depends(require_auth)])
async def get_signal(
    request:   Request,
    file:      str        = Query(...,           description="Název souboru (file_id)"),
    location:  str        = Query('local',       description="local | remote"),
    file_type: str        = Query('testing',     description="production | testing", alias="type"),
    mode:      str        = Query('overview',    description="overview | results | hysteresis | zoom_op | zoom_rp"),
    buckets:   int        = Query(1000, ge=100, le=5000, description="Počet bucketů decimace"),
) -> dict:
    """Vrátí decimovaná signálová data pro interaktivní grafy.

    Args:
        file: Identifikátor souboru (file_id).
        location: 'local' nebo 'remote'.
        file_type: 'production' nebo 'testing'.
        mode: Režim zobrazení — určuje co se vrací.
        buckets: Počet bucketů pro min-max decimaci.

    Returns:
        dict se sloupcovými daty a klíčovými body.

    Raises:
        HTTPException(400): neplatný mode parametr.
        HTTPException(404): soubor nenalezen nebo neobsahuje signal data.
        HTTPException(504): timeout při čtení.
    """
    if mode not in _VALID_MODES:
        raise HTTPException(status_code=400, detail=f"Neplatný mode: {mode!r}")

    reader: CsvRepository = request.app.state.csv_reader._repo
    path = reader.resolve_path(file, location, file_type)
    if path is None or not path.exists():
        raise HTTPException(status_code=404, detail="Soubor nenalezen")

    cfg = request.app.state.config.data
    timeout = 30.0 if location == 'remote' else 15.0

    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(
                _read_signal,
                path=path,
                mode=mode,
                n_buckets=buckets,
                encoding=cfg.csv_encoding,
                separator=cfg.csv_separator,
            ),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        log.error("[API]   /api/signal timeout (%s, %s, %.0f s)", file, location, timeout)
        raise HTTPException(status_code=504, detail="Čtení signálových dat trvá příliš dlouho.")
    except (OSError, PermissionError) as exc:
        log.error("[API]   /api/signal I/O chyba (%s): %s", file, exc)
        raise HTTPException(status_code=503, detail=f"Úložiště dočasně nedostupné: {exc}")

    if result is None:
        raise HTTPException(status_code=404, detail="Soubor neobsahuje signálová data")

    return result


def _read_signal(
    path, mode: str, n_buckets: int, encoding: str, separator: str,
) -> dict | None:
    """Synchronní čtení signálových dat — voláno přes asyncio.to_thread."""
    # Načíst AnalyzedParameters pro klíčové body
    analyzed: dict[str, str] = {}
    with open(path, encoding=encoding, newline='') as f:
        sections = _parse_sectioned(f, separator)
        analyzed = sections.get('analyzedparameters', {})

    return prepare_signal_response(
        path=path,
        analyzed=analyzed,
        mode=mode,
        n_buckets=n_buckets,
        encoding=encoding,
        separator=separator,
    )
