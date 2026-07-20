"""
Strukturované JSON logování pro ScadaViewer.

PROČ EXISTUJE:
  Textové logy (např. "[CSV]   načteno 5 záznamů") jsou přátelské pro člověka,
  ale těžko parsovatelné nástrojem. JSON logy umožňují:
    - filtrování: `python main.py 2>&1 | jq 'select(.level=="ERROR")'`
    - agregaci:   `jq '.msg' app.log | sort | uniq -c`
    - monitoring: Grafana Loki, ELK stack přijímají JSON nativně
    - debugging:  `jq 'select(.mod | startswith("scada.csv"))' app.log`

ARCHITEKTURA:
  Konfigurujeme pouze `scada.*` logger a jeho potomky (`scada.api.*`, `scada.services.*`).
  Uvicorn má vlastní konfiguraci (access logy, startup zprávy) — tu neměníme.
  Logy z `main.py` (logger `__main__`) jdou přes root logger v text formátu.

  Tok logů:
    scada.api.files  → scada (náš handler → JSON → stderr)
    uvicorn.access   → uvicorn logger (uvicorn handler → text → stdout)
    __main__         → root logger (uvicorn handler → text → stdout)

VÝSTUP — jeden řádek JSON na log záznam:
  {"ts":"2026-07-19T08:23:44+00:00","level":"INFO","mod":"scada.services.csv_reader","msg":"[CSV]   načteno 5 záznamů"}
  {"ts":"2026-07-19T08:23:45+00:00","level":"ERROR","mod":"scada.api.files","msg":"[API]   I/O chyba","exc":"Traceback..."}

JAK ROZŠÍŘIT:
  1. Přidat pole do JSON záznamu: rozšířit dict v JsonFormatter.format()
       entry["host"] = socket.gethostname()    # pro multi-node deployment
       entry["req_id"] = getattr(record, "req_id", None)  # Request ID middleware
  2. Logovat do souboru (vedle stderr):
       file_handler = logging.FileHandler("03_output/logs/scada.log")
       file_handler.setFormatter(JsonFormatter())
       scada.addHandler(file_handler)
  3. Zakázat JSON (dev mode) — předat `json_logs=False` do setup_logging():
       if json_logs: handler.setFormatter(JsonFormatter())
       else:         handler.setFormatter(logging.Formatter(...))
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    """
    Formátuje log záznamy jako jednořádkový JSON.
    Jedno volání log.info() = jeden řádek JSON na výstupu.
    """

    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, str | None] = {
            "ts":    datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "mod":   record.name,
            "msg":   record.getMessage(),
        }
        # Výjimky — stack trace jako string (komprimovaný do JSON stringu)
        if record.exc_info:
            entry["exc"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False)


def setup_logging(debug: bool = False) -> None:
    """
    Nakonfiguruje `scada.*` logger s JSON výstupem na stderr.

    Volat z main.py před uvicorn.run() — jinak logy ze startu aplikace
    (config validace, AdsMonitor start) nejsou zachyceny.

    Args:
        debug: True → log level DEBUG (verbose), False → INFO (produkce)
    """
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())

    scada = logging.getLogger("scada")
    scada.setLevel(logging.DEBUG if debug else logging.INFO)
    # Odeber případné starší handlery (ochrana před duplikáty při re-importu)
    scada.handlers.clear()
    scada.addHandler(handler)
    # propagate=False: záznamy nepropagovat do root loggeru (vyhne se
    # textovým duplikátům pokud uvicorn přidal handler na root)
    scada.propagate = False
