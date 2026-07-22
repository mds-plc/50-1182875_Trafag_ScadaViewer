"""
ScadaViewer — backend balíček pro webovou SCADA vizualizaci (Trafag AG).

Účel
----
ScadaViewer je webová aplikace pro **monitoring PLC (TwinCAT 3)** a vizualizaci
výrobních dat uložených v CSV souborech. Je součástí ekosystému tří aplikací:

- **DatabaseGateway** — čte PLC hodnoty přes ADS, zapisuje CSV soubory
- **Analyzing** — analytická pipeline nad CSV daty
- **ScadaViewer** (tento projekt) — webová vizualizace, čtení CSV, live WebSocket

Data do CSV **zapisuje DatabaseGateway**. ScadaViewer je **pouze čte** —
nikdy nezasahuje do dat ani do PLC.

Datový tok
----------
Aplikace má dva nezávislé kanály:

**1. Live monitoring PLC (ADS → WebSocket)**

::

    TwinCAT 3 PLC
        │  ADS notifikace (pyads, vlákno ADS runtime)
        ▼
    :class:`~scada.services.ads_monitor.AdsMonitor`
        │  asyncio.run_coroutine_threadsafe()   ← vlákno→asyncio bridge
        ▼
    :class:`~scada.services.ws_manager.ConnectionManager` .broadcast()
        │  JSON zpráva: {"symbol": "in_ready", "value": true, "ts": "..."}
        ▼
    Prohlížeče připojené na ws://host/ws/plc

**2. Historická data (CSV soubory → REST API)**

::

    CSV soubory z DatabaseGateway
        │  production/done_local/, production/done_remote/
        │  testing/done_local/,    testing/done_remote/
        ▼
    :class:`~scada.services.repositories.csv_repository.CsvRepository`
        │  list_files(), read_records(), path traversal validace
        ▼
    :class:`~scada.services.file_service.FileService`
        │  business logika, NAS timeout, stránkování
        ▼
    REST API: GET /api/files, GET /api/data

Moduly
------
:mod:`scada.app`
    FastAPI factory :func:`~scada.app.create_app`, lifespan (startup/shutdown),
    middleware stack (CORS, SecurityHeaders, RateLimit).

:mod:`scada.config`
    Načítá ``Config.toml`` do dataclassů :class:`~scada.config.AppConfig`.
    Validuje port, ADS net_id, csv_separator při startu. Chyba = okamžitý ``sys.exit(1)``.

:mod:`scada.models`
    Pydantic v2 response modely — zaručují správné typy na API hranici
    a generují Swagger UI schéma automaticky.

:mod:`scada.constants`
    ADS symboly pro GVL ``GV_IO_ADS_API.ScadaViewerApp`` (23 symbolů:
    mode, order_*, box_1–6_*, heartbeat, ready).

:mod:`scada.api`
    FastAPI routers — HTTP endpointy a WebSocket handlery.
    Viz :mod:`scada.api.files`, :mod:`scada.api.data`, :mod:`scada.api.plc_ws`.

:mod:`scada.services`
    Business logika — ADS monitor, CSV repozitář, WebSocket správce, OrderWatcher.

Spuštění
--------
::

    # Dev — backend + frontend najednou
    dev.bat

    # Ručně — jen backend
    python main.py --config Config.toml --debug

    # Swagger UI (API dokumentace)
    http://localhost:8080/docs

Konfigurace
-----------
Viz ``Config.toml`` (není v repozitáři) nebo ``Config.toml.example``:

.. code-block:: toml

    [server]
    host = "0.0.0.0"
    port = 8080

    [ads]
    net_id = "5.80.201.232.1.1"

    [data]
    local_path  = "05_user_data/test_db_output"
    remote_path = "\\\\\\\\synology\\\\orders"
    csv_separator = ";"
    csv_encoding  = "utf-8-sig"
"""

__version__ = "0.1.0"
