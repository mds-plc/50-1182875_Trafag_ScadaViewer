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
from typing import Protocol


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

    def delete_file(
        self,
        file_id:   str,
        location:  str = 'local',
        file_type: str = 'production',
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
    ) -> tuple[list[dict], int, dict[str, int], int | None]: ...
