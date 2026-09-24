# /run-tests — spuštění testů

```bash
cd "10.Scada program\ScadaViewer"

# Všechny testy (bez ADS, bez PLC):
pytest 02_tests/ -v

# Konkrétní sada:
pytest 02_tests/test_scada.py -v        # config + logging
pytest 02_tests/test_api.py -v          # REST API integration + security + regrese auditů
pytest 02_tests/test_ads_monitor.py -v  # AdsMonitor (mock pyads)
pytest 02_tests/test_performance.py -v  # io_pool, signal parser/cache, prefetch, gzip
pytest 02_tests/test_wip_live.py -v     # rozpracovaná zakázka + auto-refresh (FilesWatcher)

# Frontend (Vitest):
cd 01_frontend && npm run test

# Konkrétní test:
pytest 02_tests/test_api.py::TestHealth::test_returns_200 -v
```

Testy nevyžadují ADS ani PLC — spustitelné offline.
Aktuálně: **199 backend** + **77 frontend** testů.
