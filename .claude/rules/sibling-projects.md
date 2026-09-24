# Pravidlo: čerpej ze sesterských projektů

Tento projekt je součástí ekosystému tří aplikací pro Trafag.
**Vždy** před implementací čti relevantní sesterské projekty a přebírej jejich vzory.

---

## Sesterské projekty

```
C:\MD_Personal\1.Projekty\1.Aktuální projekty\14.50-1182875_Trafag\11.Parallel scripts\
├── DatabaseGateway\   ← ADS handshake, FileManager, CSV formát, sync_state.json
└── Analyzing\         ← build pipeline, CLAUDE.md struktura, .claude/ složka, logging
```

---

## Co přebírat z DatabaseGateway

### Config pattern (VŽDY stejný vzor)
```python
# Soubor: 00_src/db_gateway/config.py
@dataclass class ServerConfig / AdsConfig / DataConfig / AppConfig
def load_config(path) → AppConfig  # tomllib / tomli fallback
```
→ ScadaViewer `config.py` musí mít **identický vzor**.

### ADS konstanty
```python
# Soubor: 00_src/db_gateway/constants.py
GVL_BASE = "GV_IO_ADS_API.DatabaseGateway"
SYM: dict[str, str] = { "in_ready": f"{GVL_BASE}.In.Status.Ready", ... }
```
→ ScadaViewer `constants.py` přebírá **vzor** (`GVL_… + SYM dict`), ale má **vlastní GVL**
  `GV_IO_ADS_API.ScadaViewerApp` — 23 Out symbolů (mode, zakázka, boxy 1–6, `plc_operator_login`)
  + 2 In symboly (`sv_heartbeat`, `sv_ready`). Struktura GVL: `05_user_data/plc_communication/*.xml`.

### CSV formát dat
```
# Soubor: DatabaseGateway/Config.toml
csv_separator = ";"
csv_encoding  = "utf-8-sig"
# Sloupce (production): Timestamp;Order;Microswitch_ID;Microswitch_Name
# Sloupce (testing):    Timestamp;Microswitch_ID;Microswitch_Name
# Klíče normalizovány v CsvRepository (_normalize_key: lowercase + bez [jednotky])
```
→ `services/repositories/csv_repository.py` čte **3 formáty**: jednodílný, dvoudílný (production)
  a sekční (testing — `[Metadata]`, `[AnalyzedParameters]`, …, `[SignalData]`).

### Složková struktura výstupů DatabaseGateway
```
[sdílená složka]/         ← mimo oba projekty (local_path v Config.toml)
├── production/
│   ├── wip/              ← aktuálně otevřená zakázka (ScadaViewer nečte)
│   ├── done_local/       ← uzavřená, čeká na sync na NAS
│   └── done_remote/      ← synchronizována na NAS
└── testing/
    ├── done_local/
    └── done_remote/
```
→ `csv_repository.py` scanuje `done_local/` a `done_remote/` (ne `wip/` — Overview/WIP je odpojený).

### sync_state.json
ScadaViewer tento soubor **nečte**. Stav synchronizace dedukuje ze složkové struktury:
- soubor v `done_local/` → `sync_status = "done_local"` (čeká na NAS)
- soubor v `done_remote/` → `sync_status = "done_remote"` (synchronizován)

### NSSM instalátor
Viz `DatabaseGateway/06_build/exe/nssm_install.bat` — identický vzor (AppStdout, AppStderr, AppRotateFiles, AppRotateBytes 10MB).

---

## Co přebírat z Analyzing

### Build pipeline
Viz `Analyzing/06_build/exe/build.bat` — verze z `__init__.py`, RELEASE_TAG, ZIP, git tag, gh release.
ScadaViewer `build.bat` musí nejdřív spustit `npm run build` v `01_frontend/`, pak PyInstaller.

### CLAUDE.md struktura
Viz `Analyzing/CLAUDE.md` — standard pro detailní sekce (stav implementace, TODO, Claude Code nástroje).

### .claude/ složka
Viz `Analyzing/.claude/` — rules/commands/agents vzor.

### Logging styl
```python
log = logging.getLogger(__name__)
log.info("[API]   ...")   # 7-char prefix: [API], [ADS], [WS], [CSV], [SVC]
log.debug("[WS]    klient připojen")
log.error("[ADS]   spojení selhalo: %s", exc)
```

### Python style
- `from __future__ import annotations` na začátku každého souboru
- Type hints všude
- `@dataclass` pro datové třídy
- Bez `Optional[X]` → `X | None` (Python 3.10+)

---

## Konkrétní workflow

Při implementaci **libovolné části** ScadaViewer:

1. Nejdřív přečti relevantní soubor ze sesterského projektu
2. Přepoužij vzor — nepiš od nuly co už existuje
3. Zachovej konzistenci (naming, logging prefix, error handling)

| ScadaViewer soubor | Čerpej z |
|--------------------|---------|
| `config.py` | `DatabaseGateway/00_src/db_gateway/config.py` |
| `constants.py` | `DatabaseGateway/00_src/db_gateway/constants.py` |
| `services/repositories/csv_repository.py` | `DatabaseGateway/00_src/db_gateway/io/file_manager.py` |
| `06_build/exe/build.bat` | `Analyzing/06_build/exe/build.bat` |
| `06_build/exe/nssm_install.bat` | `DatabaseGateway/06_build/exe/nssm_install.bat` |
| `06_build/exe/scada.spec` | `DatabaseGateway/06_build/exe/db_gateway.spec` |
