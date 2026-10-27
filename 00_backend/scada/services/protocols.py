"""
Protokol DataReader + datová třída PagedResult.

DataReader — abstrakce nad zdrojem dat (PEP 544 structural subtyping).
  FileService ho implementuje implicitně — bez dědičnosti, bez importu tohoto modulu.
  Výhoda: API vrstva závisí na abstrakci, ne na konkrétní implementaci.
  Budoucí implementace (SqliteReader, RestReader) stačí mít správné signatury.

PagedResult — výstup list_files_paginated(); sdílený datový kontejner
  (service vrstva ho vrací, API vrstva ho rozbalí do FilesResponse).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol


#: Hromadné stažení — nejvýš tolik souborů najednou (rozhodnutí uživatele 2026-10-27); víc → zúžit filtr
BULK_LIMIT = 500


@dataclass(frozen=True, slots=True)
class BulkItem:
    """Jeden soubor hromadného stažení (FileService.bulk_items)."""
    file_id:   str
    location:  str
    file_type: str
    path:      Path            # cesta ke čtení (NAS soubor s lokální kopií → lokální kopie)
    size:      int             # velikost CSV [B] (u XLSX jen odhad)


@dataclass
class PagedResult:
    """Výsledek stránkovaného dotazu na seznam souborů."""
    files: list[dict]
    total: int
    page:  int
    pages: int
    wip:   list[dict] = field(default_factory=list)   # rozpracované zakázky (mimo stránkování)
    # Jen když datumový filtr skryl vše: kolik souborů je mimo filtr a datum nejnovějšího
    # (UI pak místo „žádné soubory" nabídne „Zobrazit vše")
    hidden_by_filter: int = 0
    latest_created_at: str | None = None
    # Některým souborům se ještě dopočítává počet kusů (record_count None) — klient se brzy zeptá znovu
    counts_pending: bool = False


class DataReader(Protocol):
    """Rozhraní pro čtení zakázkových souborů a jejich záznamů."""

    def list_files(
        self,
        location:  str = 'local',
        file_type: str = 'production',
        from_date: str | None = None,
        to_date:   str | None = None,
    ) -> list[dict]: ...

    def list_files_paginated(
        self,
        location:  str = 'local',
        file_type: str = 'production',
        page:      int = 1,
        per_page:  int = 50,
        from_date: str | None = None,
        to_date:   str | None = None,
        sort_by:   str = 'created_at',
        sort_dir:  str = 'desc',
        query:     str | None = None,
    ) -> PagedResult: ...

    def get_file(
        self,
        file_id:   str,
        location:  str = 'local',
        file_type: str = 'production',
    ) -> dict | None: ...

    def resolve_path(
        self,
        file_id:   str,
        location:  str = 'local',
        file_type: str = 'production',
    ) -> Path | None: ...

    def finish_wip(self, file_id: str, location: str = 'local', file_type: str = 'production') -> tuple[str, str | None]:
        """Ručně dokončí rozpracovanou zakázku (wip → done_local); viz FileService.finish_wip."""
        ...

    def delete_file(
        self,
        file_id:   str,
        location:  str = 'local',
        file_type: str = 'production',
        allow_unsynced: bool = False,
        sync: str | None = None,
        allow_wip: bool = False,
    ) -> str: ...

    def read_records(
        self,
        file_id:   str,
        location:  str = 'local',
        file_type: str = 'production',
        from_date: str | None = None,
        to_date:   str | None = None,
        page:     int = 1,
        per_page: int = 0,
        categories: frozenset[str] | None = None,
        status:     str | None = None,
        stats:      dict[str, Any] | None = None,
        order:      str = 'asc',
        nok:        frozenset[str] | None = None,
    ) -> tuple[list[dict], int, dict[str, int], int | None]: ...

    def read_order_info(
        self,
        file_id:   str,
        location:  str = 'local',
        file_type: str = 'production',
    ) -> dict | None: ...

    def export_xlsx(
        self,
        file_id:   str,
        location:  str = 'local',
        file_type: str = 'production',
    ) -> bytes | None: ...

    def bulk_items(
        self,
        location:  str = 'local',
        file_type: str = 'production',
        from_date: str | None = None,
        to_date:   str | None = None,
        query:     str | None = None,
        selection: list[tuple[str, str | None]] | None = None,
        limit:     int = BULK_LIMIT,
    ) -> tuple[list[BulkItem], int]:
        """Soubory pro hromadné stažení (filtr přehledu / výběr) a jejich počet; nad limit ([], počet)."""
        ...

    def read_timeline(
        self,
        file_id:   str,
        location:  str = 'local',
        file_type: str = 'production',
    ) -> tuple[list[str], list[int | None]] | None: ...
