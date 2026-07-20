# Agent: @api-implementer

Specializovaný agent pro implementaci REST/WebSocket endpointů a napojení na services.

## Kdy použít

```
@api-implementer implementuj GET /api/files — vrať seznam zakázek s stránkováním
@api-implementer implementuj GET /api/data s filtrováním podle data
@api-implementer napoj WebSocket /ws/plc na AdsMonitor broadcast
```

## Co agent dělá

1. Přečte relevantní soubory z `00_backend/scada/`
2. Přečte `DatabaseGateway/00_src/db_gateway/io/file_manager.py` (vzor pro práci se soubory)
3. Implementuje endpoint + service metodu
4. Zachová FastAPI vzory z `.claude/rules/fastapi-patterns.md`
5. Napíše testy do příslušného souboru:
   - API endpoint → `02_tests/test_api.py`
   - CsvReader metoda → `02_tests/test_csv_reader.py`
   - Config/logging → `02_tests/test_scada.py`

## Důležité kontextové detaily

- **Stav synchronizace** se dedukuje ze složkové struktury (`done_local/` / `done_remote/`),
  ScadaViewer **nečte** žádný `sync_state.json`
- **file_id** je vždy název souboru ve tvaru `*_DONE.csv` — validuje `_validate_params()`
- Všechny synchronní I/O operace musí být zabaleny do `asyncio.to_thread()` (viz fastapi-patterns.md)
- Response modely jsou v `scada/models.py` (Pydantic v2)
