"""
FileService — business logika nad CSV daty.

Odpovědnost:
  - datumové filtrování souborů (business pravidlo: které soubory zobrazit)
  - stránkování (business pravidlo: kolik najednou)
  - určení sync_status ze složkové struktury (business pravidlo)
  - koordinace volání CsvRepository

Co zde NENÍ:
  - I/O operace (soubory, disk) → CsvRepository
  - HTTP routing, parametry, response modely → api/*.py
"""
from __future__ import annotations

import logging
import math
from datetime import date as _date

from scada.services.protocols import PagedResult
from scada.services.repositories.csv_repository import CsvRepository

log = logging.getLogger(__name__)


class FileService:
    """Service vrstva — business logika nad CSV daty."""

    def __init__(self, repo: CsvRepository) -> None:
        self._repo = repo

    # ------------------------------------------------------------------
    # Seznam souborů
    # ------------------------------------------------------------------

    def list_files(
        self,
        location:  str = 'local',
        file_type: str = 'production',
        from_date: str | None = None,
        to_date:   str | None = None,
    ) -> list[dict]:
        """
        Vrátí seznam souborů s volitelným datumovým filtrem.

        Datumový filtr je BUSINESS PRAVIDLO — rozhodnutí, které soubory
        uživatel vidí. Proto patří sem, ne do repozitáře.
        """
        if not self._repo.validate_params(None, location, file_type):
            return []

        files = (
            self._repo.list_remote(file_type)
            if location == 'remote'
            else self._repo.list_local(file_type)
        )

        if from_date or to_date:
            from_day = _date.fromisoformat(from_date) if from_date else None
            to_day   = _date.fromisoformat(to_date)   if to_date   else None
            filtered = []
            for f in files:
                try:
                    ca = _date.fromisoformat(f['created_at'][:10])
                except (ValueError, TypeError):
                    filtered.append(f)  # neparsovatelné datum vždy projde
                    continue
                if from_day and ca < from_day:
                    continue
                if to_day   and ca > to_day:
                    continue
                filtered.append(f)
            files = filtered

        return files

    def list_files_paginated(
        self,
        location:  str = 'local',
        file_type: str = 'production',
        page:      int = 1,
        per_page:  int = 50,
        from_date: str | None = None,
        to_date:   str | None = None,
    ) -> PagedResult:
        """
        Vrátí stránkovaný seznam souborů.

        Stránkování je BUSINESS PRAVIDLO (kolik záznamů uživatel vidí najednou),
        proto patří do service vrstvy, ne do API vrstvy.
        """
        all_files = self.list_files(location, file_type, from_date, to_date)
        total = len(all_files)
        pages = max(1, math.ceil(total / per_page))
        page  = min(page, pages)          # clamp — stránka mimo rozsah → poslední
        start = (page - 1) * per_page
        return PagedResult(
            files=all_files[start : start + per_page],
            total=total,
            page=page,
            pages=pages,
        )

    # ------------------------------------------------------------------
    # Jednotlivý soubor
    # ------------------------------------------------------------------

    def get_file(
        self,
        file_id:   str,
        location:  str = 'local',
        file_type: str = 'production',
    ) -> dict | None:
        """
        Vrátí metadata jednoho souboru — O(1) (přímý _resolve_path, ne scan všech).

        Určení sync_status ze složkové struktury je BUSINESS PRAVIDLO:
          done_remote/ → 'done_remote' (synchronizováno na NAS)
          done_local/  → 'done_local'  (čeká na sync)
        """
        path = self._repo.resolve_path(file_id, location, file_type)
        if path is None or not path.exists():
            return None

        sync_status: str | None
        if location == 'remote':
            sync_status = None
        else:
            sync_status = 'done_remote' if 'done_remote' in path.parts else 'done_local'

        try:
            return self._repo.read_file_meta(path, file_type, location, sync_status)
        except Exception as exc:
            log.error("[SVC]   get_file %s chyba: %s", file_id, exc)
            return None

    # ------------------------------------------------------------------
    # Smazání souboru
    # ------------------------------------------------------------------

    def delete_file(
        self,
        file_id:   str,
        location:  str = 'local',
        file_type: str = 'production',
    ) -> str:
        """
        Smaže soubor z lokálního úložiště.

        Returns:
          'ok'               — soubor smazán
          'not_found'        — soubor neexistuje
          'remote_forbidden' — remote soubory nelze smazat
        """
        if location != 'local':
            return 'remote_forbidden'
        path = self._repo.resolve_path(file_id, location, file_type)
        if path is None or not path.exists():
            return 'not_found'
        self._repo.delete_file(path)
        log.info("[SVC]   delete_file %s (%s/%s)", file_id, location, file_type)
        return 'ok'

    # ------------------------------------------------------------------
    # Záznamy
    # ------------------------------------------------------------------

    def read_records(
        self,
        file_id:   str,
        location:  str = 'local',
        file_type: str = 'production',
        from_date: str | None = None,
        to_date:   str | None = None,
    ) -> list[dict]:
        """Načte záznamy z daného souboru — deleguje na repozitář."""
        path = self._repo.resolve_path(file_id, location, file_type)
        if path is None or not path.exists():
            log.warning("[SVC]   soubor nenalezen: %s (%s/%s)", file_id, location, file_type)
            return []
        records = self._repo.read_records(path, from_date, to_date)
        log.debug("[SVC]   read_records %s → %d řádků", file_id, len(records))
        return records
