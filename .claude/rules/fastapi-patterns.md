# FastAPI vzory pro ScadaViewer

## Lifespan — startup/shutdown (NE @app.on_event)

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    await ads_monitor.start()
    yield
    # shutdown
    await ads_monitor.stop()

app = FastAPI(lifespan=lifespan)
```

## Router struktura

```python
# api/files.py
from fastapi import APIRouter
router = APIRouter()

@router.get("/files")
async def list_files(): ...

# app.py
app.include_router(files.router, prefix="/api", tags=["files"])
```

## ADS callback → asyncio bridge (KRITICKÉ)

ADS notifikace přicházejí z jiného vlákna. WebSocket broadcast je coroutine.
Nesmíš volat `await` z ne-async kontextu — použij bridge:

```python
import asyncio

class AdsMonitor:
    async def start(self):
        self._loop = asyncio.get_running_loop()   # uložit loop při startu

    def _ads_callback(self, notification, name):
        # Toto je voláno z ADS vlákna — nelze použít await!
        payload = {"symbol": name, "value": ...}
        asyncio.run_coroutine_threadsafe(
            manager.broadcast(payload),
            self._loop                             # bridge do asyncio
        )
```

## StaticFiles — servírování React buildu

```python
from fastapi.staticfiles import StaticFiles

# Přidat AŽ PO všech routerech, jinak zachytí všechny requesty
app.mount("/", StaticFiles(directory="01_frontend/dist", html=True), name="static")
```

## WebSocket — správný pattern

```python
@router.websocket("/plc")
async def plc_ws(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()   # čekat na zprávy nebo disconnect
    except WebSocketDisconnect:
        manager.disconnect(websocket)
```

## Dependency injection — config

```python
# Předávat config přes app.state, ne globální proměnné
app.state.config = cfg

# V endpointu:
from fastapi import Request
@router.get("/files")
async def list_files(request: Request):
    cfg = request.app.state.config
```

## KRITICKÉ: Synchronní I/O v async endpointech blokuje event loop

**Nikdy** nevolej synchronní blokující operace přímo v `async def` — zablokují celý Uvicorn event loop
a žádný jiný request nemůže být zpracován.

Typické blokující operace:
- `Path.exists()` na UNC cestě (NAS) — může blokovat **desítky sekund** při nedostupném NAS
- `open()`, `csv.DictReader`, jakékoliv čtení souborů
- Síťová spojení, databázové dotazy (synchronní)

### Řešení: asyncio.to_thread()

```python
import asyncio

# ❌ ŠPATNĚ — blokuje event loop
@router.get("/files")
async def list_files(request: Request):
    files = reader.list_files(location=location)   # synchronní I/O!
    return {"files": files}

# ✅ SPRÁVNĚ — spustí v thread poolu
@router.get("/files")
async def list_files(request: Request):
    files = await asyncio.to_thread(reader.list_files, location=location)
    return {"files": files}
```

### NAS / UNC cesty — VŽDY `run_io()` + timeout

Vlákno visící na nedostupném NAS po timeoutu dál běží. Proto NAS I/O **nikdy** holým
`asyncio.to_thread` — jinak zaseknutý NAS vyčerpá výchozí pool a zpomalí celou aplikaci.

```python
from scada.services.io_pool import run_io

# ✅ location="remote" → vlastní NAS pool (4 vlákna); plný → NasBusyError → HTTP 503 okamžitě
#    location="local"  → asyncio.to_thread
result = await asyncio.wait_for(
    run_io(location, reader.read_records, file_id=file, location=location, ...),
    timeout=30.0 if location == "remote" else 10.0,
)
```

`NasBusyError` zachytává globální handler v `app.py` (→ 503). CPU-náročné operace
(PBKDF2 hash) → `asyncio.to_thread`.

## Výkon — zavedené mechanismy (nerozbíjet)

- `CsvRepository._meta_cache` — metadata souborů dle `(mtime_ns, size)`
- `signal_reader` — LRU cache naparsovaných souborů + cache hotových odpovědí; numpy parser
- `/api/data` spouští prefetch signálu na pozadí (`_prefetch_tasks`)
- Velké JSON odpovědi (`/api/signal`) → `JSONResponse(content=…)` (bez `jsonable_encoder`)
- `GZipMiddleware`, `Cache-Control: immutable` pro `/assets/*`

## Autentizace

- Chráněné endpointy: `dependencies=[Depends(require_auth)]` nebo `Depends(require_role("admin"))`
- 401 z `require_auth` nese `WWW-Authenticate: Bearer` — frontend podle ní odhlašuje.
  Jiné 401 (špatné heslo) hlavičku mít **nesmí**.
- Ověření hesla s lockoutem: `_is_locked` / `_record_failure` / `_clear_failures` z `api/auth.py`

## Error responses

```python
from fastapi import HTTPException

raise HTTPException(status_code=404, detail="Soubor nenalezen")
raise HTTPException(status_code=500, detail=str(exc))
```
