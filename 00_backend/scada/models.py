"""
Pydantic response a request modely pro ScadaViewer API.

Účel: Definuje datové kontrakty mezi backendem a frontendem. Každý endpoint
      deklaruje response_model — FastAPI validuje výstup a generuje OpenAPI schéma
      pro Swagger UI a případnou auto-generaci TypeScript typů.

Zodpovědnost:
  - Definuje modely pro všechny API endpointy (/api/files, /api/data, /api/auth,
    /api/users, /api/health, /api/status, /api/config, /api/wip, batch-delete).
  - Pydantic v2 ConfigDict: extra='allow' pro CsvRecordModel (zachová budoucí CSV
    sloupce bez změny modelu), extra='ignore' pro OrderFileModel (striktní kontrakt).
  - Není zodpovědný za business logiku ani transformaci dat — jen datový kontrakt.
  - Změna pole v modelu vyžaduje synchronizaci s 01_frontend/src/types/index.ts.

Rozhraní:
  /api/files:        OrderFileModel, FilesResponse
  /api/data:         CsvRecordModel, DataResponse
  /api/auth:         LoginRequest, LoginResponse, LogoutRequest, ChangePasswordRequest
  /api/users:        UserModel, CreateUserRequest, ChangeUserPasswordRequest
  /api/health:       HealthResponse, HealthChecks
  /api/status:       StatusResponse
  /api/config:       ConfigResponse, ConfigServerInfo, ConfigAdsInfo, ConfigDataInfo, ConfigAuthInfo
  /api/config/paths: UpdatePathsRequest
  batch-delete:      BatchDeleteRequest, BatchDeleteResult
  /api/wip:          WipResponse

Napojení:
  Závisí na: pydantic (BaseModel, ConfigDict, Field)
  Používáno: všechny api/*.py soubory jako response_model= a request body typy
  Frontendový protějšek: 01_frontend/src/types/index.ts (synchronizovat ručně)
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


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
    microswitch_id:   str | None = None   # None v novém dvoudílném formátu (je v metadata sekci)
    microswitch_name: str | None = None   # None v novém dvoudílném formátu (je v metadata sekci)
    order:            str | None = None   # jen production; testing sloupec Order nemá
    group:            int | None = None   # skupina třídění 1–6
    expected_count:   int | None = None   # očekávaný počet mikrospínačů v zakázce


class DataResponse(BaseModel):
    """Odpověď GET /api/data."""
    records:              list[CsvRecordModel]
    total:                int    # celkový počet záznamů po filtrech
    page:                 int = 1
    pages:                int = 1
    per_page:             int = 0   # 0 = vše (bez stránkování)
    group_counts:         dict[str, int] | None = None   # agregace skupin přes celý soubor
    file_expected_count:  int | None            = None   # expected_count z CSV (celá zakázka)
    has_signal:           bool                  = False  # True pokud CSV obsahuje [SignalData]


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
    username: str = Field(max_length=150)    # DoS prevence — PBKDF2 na MB stringu
    password: str = Field(max_length=1000)   # limit hesla — realisticky max 128 znaků


class LoginResponse(BaseModel):
    """Odpověď POST /api/auth/login při úspěchu."""
    token:        str
    role:         str   # operator | technician | admin | manufacturer
    display_name: str


# ======================================================================
# /api/users — správa uživatelů
# ======================================================================

class UserModel(BaseModel):
    """Uživatel — response bez hash."""
    username:     str
    display_name: str
    role:         str


class CreateUserRequest(BaseModel):
    """Tělo požadavku POST /api/users."""
    username:     str
    display_name: str
    password:     str
    role:         str


class ChangeUserPasswordRequest(BaseModel):
    """Tělo požadavku POST /api/users/{username}/password."""
    new_password:     str
    current_password: str | None = None   # povinné jen při změně vlastního hesla


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
# /api/files/batch-delete — hromadné mazání souborů
# ======================================================================

class BatchDeleteRequest(BaseModel):
    """Tělo požadavku POST /api/files/batch-delete."""
    file_ids:  list[str] = Field(max_length=200)   # max 200 souborů najednou (DoS prevence)
    location:  str
    file_type: str = Field(alias="type")

    model_config = ConfigDict(populate_by_name=True)


class BatchDeleteResult(BaseModel):
    """Odpověď POST /api/files/batch-delete."""
    deleted: int
    failed:  int
    errors:  list[dict]


# ======================================================================
# /api/wip — aktuální WIP záznamy z otevřené zakázky
# ======================================================================

class WipResponse(BaseModel):
    """Odpověď GET /api/wip."""
    file:    str | None              # název WIP souboru (bez cesty); None pokud žádný soubor
    records: list[CsvRecordModel]    # záznamy nejstarší → nejnovější
    total:   int                     # počet záznamů
