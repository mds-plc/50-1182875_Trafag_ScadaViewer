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

from pydantic import BaseModel, ConfigDict, Field, field_validator


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
    switch_name:  str                                                   # název mikrospínače (Microswitch_Name)
    switch_id:    str = ''                                              # ID mikrospínače (SAP, Gateway 2.3.0+)
    created_at:   str                                                   # ISO datetime
    record_count: int | None   # None = ještě se dopočítává (přehled jde nejdřív z názvů souborů)
    sync_status:  Literal['wip', 'done_local', 'done_remote'] | None = None   # None pro remote; 'wip' = rozpracovaná


class FilesResponse(BaseModel):
    """Odpověď GET /api/files."""
    files: list[OrderFileModel]
    total: int   # celkový počet souborů (před stránkováním)
    page:  int   # aktuální stránka (od 1)
    pages: int   # celkový počet stránek
    wip:   list[OrderFileModel] = []   # rozpracované zakázky (jen local) — mimo stránkování a filtry
    hidden_by_filter:  int = 0            # filtr skryl vše: počet souborů mimo datumový filtr
    latest_created_at: str | None = None  # … a datum nejnovějšího z nich
    counts_pending:    bool = False       # počty kusů se dopočítávají — klient obnoví za chvíli


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

    timestamp:        str = ''            # chybí-li (vadný / cizí soubor) — prázdný, ne HTTP 500
    microswitch_id:   str | None = None   # None v novém dvoudílném formátu (je v metadata sekci)
    microswitch_name: str | None = None   # None v novém dvoudílném formátu (je v metadata sekci)
    order:            str | None = None   # jen production; testing sloupec Order nemá
    group:            int | None = None   # skupina třídění 1–6
    expected_count:   int | None = None   # očekávaný počet mikrospínačů v zakázce

    @field_validator('timestamp', mode='before')
    @classmethod
    def _timestamp_or_empty(cls, v: object) -> object:
        return '' if v is None else v

    @field_validator('group', 'expected_count', mode='before')
    @classmethod
    def _int_or_none(cls, v: object) -> int | None:
        """Prázdná / nečíselná buňka v CSV → None (jeden vadný řádek nesmí shodit celou stránku)."""
        if v is None or isinstance(v, bool):
            return None
        if isinstance(v, int):
            return v
        try:
            f = float(str(v).strip())
        except ValueError:
            return None
        return int(f) if f.is_integer() else None


class OrderParam(BaseModel):
    """Jedna hodnota z [TestingParameters] — název a jednotka z hlavičky CSV."""
    key:   str
    name:  str
    unit:  str = ''
    value: str | None = None


class SortingGroup(BaseModel):
    group: int
    min:   str | None = None    # None = skupina se nepoužívá
    max:   str | None = None


class SortingCategories(BaseModel):
    grouping_value: str | None = None   # parametr, podle kterého se třídí (např. MD)
    unit:           str = ''
    groups:         list[SortingGroup] = Field(default_factory=list)


class SortingLimit(BaseModel):
    """Limit parametru — Trafag (max/min) a výrobce (max_supplier/min_supplier); None = neaktivní."""
    key:          str
    name:         str
    unit:         str = ''
    max:          str | None = None
    min:          str | None = None
    max_supplier: str | None = None
    min_supplier: str | None = None


class OrderInfo(BaseModel):
    """Údaje zakázky z bloků PROD_ souboru (DatabaseGateway 2.3.0+)."""
    recipe:             str | None = None
    lots:               list[str] = Field(default_factory=list)   # šarže výrobce v pořadí výskytu
    testing_parameters: list[OrderParam] = Field(default_factory=list)
    sorting_categories: SortingCategories | None = None
    sorting_limits:     list[SortingLimit] = Field(default_factory=list)


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
    total_all:            int | None            = None   # počet záznamů bez filtru status/category
    # Souřadnice poloh (FP/OP/RP/TTP): 'customer' = zákazník P = C − x (od 10/2026),
    # 'encoder' = stupnice enkodéru (starší soubory), None = nelze určit. Hodnoty jsou
    # v jednotkách zákazníka (mN, µm, mΩ, µs) — převedené podle hlavičky CSV.
    position_scale:       str | None            = None
    # Údaje zakázky (receptura, šarže, testovací parametry, kategorie, limity) — jen blokový
    # PROD_ soubor z DatabaseGateway 2.3.0+, jinak None
    order_info:           OrderInfo | None      = None


# ======================================================================
# /api/timeline — časový průběh zakázky
# ======================================================================

class TimelineResponse(BaseModel):
    """Odpověď GET /api/timeline — sloupcový formát (menší JSON než pole objektů)."""
    timestamps: list[str]          # ISO 8601, seřazeno vzestupně
    categories: list[int | None]   # kategorie 1–6 ke každé časové značce (None = neznámá)


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


class ClientInfoResponse(BaseModel):
    """Odpověď GET /api/auth/client — je tento prohlížeč na PC u stroje?"""
    local: bool   # False = vzdálený přístup (jen prohlížení, bez PLC auto-loginu)


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
    local_path:   str
    remote_path:  str
    local_max_gb: float


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


class UpdateStorageLimitRequest(BaseModel):
    """Tělo požadavku PATCH /api/config/storage."""
    local_max_gb: float = Field(ge=0.1, le=100_000)    # < 0,1 GB → limit 0 B = varování potichu vypnuté (audit Q24)


# ======================================================================
# /api/storage — zaplnění lokálního úložiště + čištění synchronizovaných
# ======================================================================

class NasStorage(BaseModel):
    """Zaplnění sdílené složky NAS (s kvótou na Synology = kvóta, jinak celý svazek)."""
    available:   bool
    total_bytes: int | None = None
    used_bytes:  int | None = None
    free_bytes:  int | None = None
    percent:     float | None = None
    level:       Literal["ok", "warning", "critical"] | None = None


class StorageResponse(BaseModel):
    """Odpověď GET /api/storage."""
    used_bytes:       int
    limit_bytes:      int
    percent:          float                 # zaplnění limitu [%]
    level:            Literal["ok", "warning", "critical"]
    file_count:       int
    synced_bytes:     int                   # done_remote/ — kandidáti na vyčištění
    synced_count:     int
    disk_total_bytes: int | None = None
    disk_free_bytes:  int | None = None
    disk_low:         bool = False          # na disku zbývá < 10 % (pojistka nezávislá na limitu)
    nas:              NasStorage | None = None   # None = NAS není nastavený (remote_path prázdný)


class CleanupResponse(BaseModel):
    """Odpověď POST /api/storage/cleanup."""
    deleted:     int
    freed_bytes: int
    skipped:     int                        # na NAS chybí / nesedí velikost — ponecháno
    failed:      int


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
