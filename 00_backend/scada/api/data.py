"""
REST endpoint pro čtení záznamů z CSV souboru (/api/data).

Účel: Poskytuje filtrovaná a stránkovaná data z jednoho CSV souboru zakázky.
      Slouží pro zobrazení záznamů v Database (rozbalený řádek), ChartView (graf)
      a pro CSV/XLSX export (per_page=0 = všechny záznamy najednou).

Zodpovědnost:
  - Validuje formát datumových parametrů (from/to) explicitně před voláním service.
    Důvod: ValueError ze service by mohl mít více příčin — explicitní validace
    vrátí HTTP 422 s přesnou zprávou o špatném datu dřív než začneme číst soubor.
  - Deleguje čtení na DataReader service (run_io — NAS ve vlastním poolu).
  - Počítá počet stránek ze serveru — klient nezná total a per_page zároveň.

Rozhraní:
  GET /api/data → DataResponse (records[], total, page, pages, group_counts, file_expected_count)
  Parametry: file (povinný), location, type, from, to, page, per_page (0 = vše)
  Vyžaduje autentizaci: Depends(require_auth)

Napojení:
  Závisí na: services (DataReader protokol), models.DataResponse, api/dependencies.require_auth
  Datový zdroj: CSV soubory zapsané DatabaseGateway (lokální disk nebo NAS)
  Používáno: frontend hooks/useData.ts {useFileRecords, useData},
             hooks/useDatabaseState.ts {downloadCsv, downloadXlsx}
"""
from __future__ import annotations

import asyncio
import logging
from datetime import date as _date

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from scada.api.dependencies import require_auth
from scada.models import DataResponse
from scada.services.io_pool import NasBusyError, run_io
from scada.services.protocols import DataReader
from scada.services.signal_reader import prepare_signal_response

router = APIRouter()
log = logging.getLogger(__name__)

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
                )
    # per_page=0 = všechny záznamy (export). Limit na 100 000 řádků
    # zabraňuje neomezenému růstu paměti při obrovském CSV (DoS prevence).
    effective_per_page = per_page if per_page > 0 else 100_000

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
            ),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        log.error("[API]   /api/data timeout (%s, %s, %.0f s)", file, location, timeout)
        raise HTTPException(status_code=504, detail="Čtení dat trvá příliš dlouho — úložiště může být nedostupné.")
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Neplatný formát data, očekáváno YYYY-MM-DD: {exc}",
        ) from exc
    except (OSError, PermissionError) as exc:
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
    )
