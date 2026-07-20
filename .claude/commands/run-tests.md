# /run-tests — spuštění testů

```bash
cd "10.Scada program\ScadaViewer"

# Všechny testy (bez ADS, bez PLC):
pytest 02_tests/ -v

# Konkrétní sada:
pytest 02_tests/test_scada.py -v      # config + logging
pytest 02_tests/test_csv_reader.py -v # CsvReader unit testy
pytest 02_tests/test_api.py -v        # REST API integration testy

# Konkrétní test:
pytest 02_tests/test_api.py::TestHealth::test_returns_200 -v
```

Testy nevyžadují ADS ani PLC — spustitelné offline.
Aktuálně: **128 testů**.
