"""
Pydantic response modely pro ScadaViewer API.

PROČ EXISTUJE:
  Bez response_model FastAPI vrací raw Python dicts bez validace struktury.
  Pydantic zaručí na API hranici:
    1. Správné typy — int zůstane int, None zůstane None (ne prázdný string)
    2. Swagger UI zobrazí kompletní schéma každého endpointu (pole, typy, nullable)
    3. TypeScript typy lze vygenerovat přímo z OpenAPI schématu pomocí
       `npx openapi-typescript http://localhost:8080/openapi.json` místo ručního
       psaní v src/types/index.ts — schéma je pak single source of truth
    4. Chyba v datech (překlep klíče, změna typu) se odhalí okamžitě při restartu,
       ne až v UI operátora za provozu

PYDANTIC V2 syntaxe (FastAPI ≥ 0.111):
  - model_config = ConfigDict(...) místo zastaralého class Config
  - extra='allow'  → zachová neznámá pole (CsvRecordModel pro budoucí CSV sloupce)
  - extra='ignore' → ořízne neznámá pole (OrderFileModel — definovaný kontrakt)

JAK ROZŠÍŘIT:
  1. Nové pole v CsvReader._file_meta() → přidat sem do OrderFileModel
     + aktualizovat OrderFile v 01_frontend/src/types/index.ts (synchronizovat ručně)
  2. Nový endpoint → přidat nový Response model zde, použít jako response_model v api/*.py
  3. Nové CSV sloupce (AnalyzedParams) → CsvRecordModel s extra='allow' je zachová automaticky,
     stačí přidat volitelná pole pro dokumentaci/Swagger (order: str | None = None vzor)
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict


# ======================================================================
# /api/files — seznam souborů / metadata zakázky
# ======================================================================

class OrderFileModel(BaseModel):
    """
    Metadata jednoho CSV souboru (zakázky).
    Odpovídá rozhraní OrderFile v 01_frontend/src/types/index.ts.
    """
    model_config = ConfigDict(extra='ignore')  # neznámá pole z dictu ignorovat

    file_id:      str
    name:         str
    type:         Literal['production', 'testing']
    location:     Literal['local', 'remote']
    order_id:     str | None                                            # None pro testing
    switch_name:  str
    created_at:   str                                                   # ISO datetime
    record_count: int
    sync_status:  Literal['done_local', 'done_remote'] | None = None   # None pro remote


class FilesResponse(BaseModel):
    """Odpověď GET /api/files."""
    files: list[OrderFileModel]
    total: int   # celkový počet souborů (před stránkováním)
    page:  int   # aktuální stránka (od 1)
    pages: int   # celkový počet stránek


# ======================================================================
# /api/data — záznamy z CSV souboru
# ======================================================================

class CsvRecordModel(BaseModel):
    """
    Jeden řádek z CSV souboru (klíče normalizovány na lowercase v CsvReader).

    extra='allow' zachová všechna pole z CSV automaticky:
      - production má 'order', testing nemá
      - budoucí zákaznické sloupce (AnalyzedParams) budou zahrnuty bez změny modelu
    Povinná pole jsou deklarována pro Swagger dokumentaci a type checking.
    """
    model_config = ConfigDict(extra='allow')

    timestamp:        str
    microswitch_id:   str
    microswitch_name: str
    order:            str | None = None   # jen production; testing sloupec Order nemá
    group:            int | None = None   # skupina třídění 1–6
    expected_count:   int | None = None   # očekávaný počet mikrospínačů v zakázce


class DataResponse(BaseModel):
    """Odpověď GET /api/data."""
    records: list[CsvRecordModel]
    total:   int


# ======================================================================
# /api/status — dostupnost vzdáleného úložiště
# ======================================================================

class StatusResponse(BaseModel):
    """Odpověď GET /api/status."""
    remote_available: bool


# ======================================================================
# /api/auth — lokální přihlášení
# ======================================================================

class LoginRequest(BaseModel):
    """Tělo požadavku POST /api/auth/login."""
    username: str
    password: str


class LoginResponse(BaseModel):
    """Odpověď POST /api/auth/login při úspěchu."""
    token: str


class LogoutRequest(BaseModel):
    """Tělo požadavku POST /api/auth/logout."""
    token: str


# ======================================================================
# /api/health — zdravotní stav aplikace
# ======================================================================

class HealthChecks(BaseModel):
    """Dílčí kontroly zdraví aplikace (vnořený objekt v HealthResponse)."""
    local_storage: bool   # True pokud lokální disk s daty existuje
    ads:           bool   # True pokud ADS spojení s PLC je aktivní


class HealthResponse(BaseModel):
    """Odpověď GET /api/health. HTTP status je vždy 200 — viz health.py."""
    status:  Literal['ok', 'degraded']
    version: str
    checks:  HealthChecks


# ======================================================================
# /api/config — bezpečná podmnožina konfigurace
# ======================================================================

class ConfigServerInfo(BaseModel):
    host:    str
    port:    int
    version: str


class ConfigAdsInfo(BaseModel):
    net_id: str
    port:   int


class ConfigDataInfo(BaseModel):
    local_path:  str
    remote_path: str


class ConfigAuthInfo(BaseModel):
    username:   str
    configured: bool   # True pokud password_hash je nastaven


class ConfigResponse(BaseModel):
    """Odpověď GET /api/config — bezpečná podmnožina konfigurace (bez hash)."""
    server: ConfigServerInfo
    ads:    ConfigAdsInfo
    data:   ConfigDataInfo
    auth:   ConfigAuthInfo


# ======================================================================
# /api/auth/change-password — změna hesla
# ======================================================================

class ChangePasswordRequest(BaseModel):
    """Tělo požadavku POST /api/auth/change-password."""
    token:            str
    current_password: str
    new_password:     str


# ======================================================================
# /api/config/paths — aktualizace cest k úložišti
# ======================================================================

class UpdatePathsRequest(BaseModel):
    """Tělo požadavku PATCH /api/config/paths."""
    local_path:  str
    remote_path: str


# ======================================================================
# /api/wip — aktuální WIP záznamy z otevřené zakázky
# ======================================================================

class WipResponse(BaseModel):
    """Odpověď GET /api/wip."""
    file:    str | None              # název WIP souboru (bez cesty); None pokud žádný soubor
    records: list[CsvRecordModel]    # záznamy nejstarší → nejnovější
    total:   int                     # počet záznamů
