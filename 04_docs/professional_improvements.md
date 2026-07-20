# ScadaViewer — Roadmapa profesionálního projektu

> Přehled vylepšení, která posunují projekt z "funkčního prototypu" na "produkční software".
> Každá položka obsahuje: **proč je důležitá**, **co implementovat** a **odhadovanou náročnost**.

Prioritní kategorie:
- 🔴 **MUST** — blocker pro produkci (bezpečnost, stabilita)
- 🟡 **SHOULD** — výrazně zlepšuje profesionalitu
- 🟢 **NICE** — zvyšuje komfort uživatele nebo vývojáře

---

## 1. Bezpečnost 🔴 MUST

### 1.1 Serverová autentizace (JWT)

**Proč:** Aktuálně login() v `AuthContext` přijme jakékoli neprázdné heslo — ověření probíhá jen na klientovi.
Kdokoli s přístupem do sítě může zobrazit všechna data.

**Co implementovat:**
- `POST /api/auth/login` → přijme `{username, password}`, vrátí JWT token
- `POST /api/auth/logout` → invalidace tokenu
- Middleware pro ověření tokenu na chráněných endpointech
- Frontend: uložit token do `sessionStorage`, posílat jako `Authorization: Bearer <token>`
- Timeout tokenu (např. 8 hodin — směna operátora)

**Technologie:** PyJWT (`pip install pyjwt`), bcrypt pro hashování hesel.

**Náročnost:** ~2 dny

---

### 1.2 HTTPS

**Proč:** WebSocket na `ws://` přes nešifrovanou síť posílá PLC data plaintext. Na HTTPS je `wss://` automaticky — kód již připraven (PlcContext.tsx).

**Co implementovat:**
- Vygenerovat self-signed certifikát pro intranet SCADA (nebo firemní CA)
- Uvicorn: `uvicorn.run(app, ssl_keyfile="key.pem", ssl_certfile="cert.pem")`
- Alternativa: reverzní proxy (nginx/Caddy) s TLS terminací před Uvicorn

**Náročnost:** ~0.5 dne

---

### 1.3 Security hlavičky HTTP ✅ Implementováno (2026-07-19)

**Proč:** Bez hlaviček je aplikace zranitelná na clickjacking, XSS přes injektovaný obsah apod.

**Co implementovat:**
```python
# app.py — přidat middleware
from fastapi.middleware import Middleware
from starlette.middleware.base import BaseHTTPMiddleware

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response
```

**Náročnost:** 1 hodina

---

### 1.4 CORS whitelist

**Proč:** Aktuálně žádný CORS — v produkci (same-origin) nevadí, ale pro budoucí mobilní/tablet klient nebo API přístup z jiné domény je nutný.

**Co implementovat:**
```python
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://scada.firma.cz"],   # konkrétní origen, ne "*"
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
```

**Náročnost:** 30 minut

---

### 1.5 Rate limiting ✅ Implementováno (2026-07-19)

**Proč:** Bez limitu může útočník nebo chybný klient zahlcovat /api/auth tisíci pokusy za sekundu.

**Co implementovat:**
```bash
pip install slowapi
```
```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.post("/auth/login")
@limiter.limit("5/minute")   # max 5 pokusů za minutu
async def login(...): ...
```

**Náročnost:** 2 hodiny

---

## 2. Stabilita & Spolehlivost 🟡 SHOULD

### 2.1 Pydantic response modely ✅ Implementováno (2026-07-19)

**Proč:** Aktuálně API vrací raw Python dicts bez validace. Pokud backend vrátí neočekávaná data, frontend dostane nesprávný typ bez chyby. Pydantic zaručí typy na API hranici.

**Co implementovat:**
```python
# 00_backend/scada/models.py — nový soubor
from pydantic import BaseModel

class OrderFileModel(BaseModel):
    file_id:      str
    name:         str
    type:         str
    location:     str
    order_id:     str | None
    switch_name:  str
    created_at:   str
    record_count: int
    sync_status:  str | None = None

class FilesResponse(BaseModel):
    files: list[OrderFileModel]
    total: int

# api/files.py
@router.get("/files", response_model=FilesResponse)
async def list_files(...) -> FilesResponse:
    ...
```

**Výhoda:** Swagger UI automaticky zobrazí kompletní schéma. TypeScript typy lze generovat z OpenAPI (`openapi-typescript`).

**Náročnost:** 1 den

---

### 2.2 Health check endpoint ✅ Implementováno (2026-07-19)

**Proč:** NSSM Windows service umí periodicky volat URL a restartovat proces pokud nedostane
HTTP 200 — bez tohoto endpointu watchdog nefunguje. Navíc umožňuje okamžitou diagnostiku
stavu aplikace (disk dostupný? ADS připojen?) bez přístupu k logům.

**Implementováno:**
- `api/health.py` — `GET /api/health` → `{ status, version, checks }`
- `AdsMonitor.connected` property pro čistý interface
- Registrováno v `app.py` jako první router (health se musí dotazovat i při problémech s ostatními endpointy)
- HTTP 200 vždy — rozlišení `status: "ok"` vs `"degraded"` na aplikační úrovni
- Lokální I/O v `asyncio.to_thread()`, žádná kontrola NAS (byla by pomalá)

**Nastavení NSSM watchdog (volitelné):**
```
AppThrottle     = http://localhost:8080/api/health
AppThrottleStatus = 200
```

**Náročnost:** 2 hodiny

---

### 2.3 Testy — rozšíření test suite

**Proč:** Aktuálně 1 test (`load_config`). Bez testů se regresi neodhalí při dalším vývoji.

**Co přidat:**

```
02_tests/
├── test_config.py        ← load_config, _validate_config
├── test_csv_reader.py    ← list_files, read_records, _validate_params
│                            (testovací data v 05_user_data/test_db_output)
├── test_api_files.py     ← FastAPI TestClient — GET /api/files, /api/data
└── test_csv_edge.py      ← prázdný soubor, neplatné kódování, path traversal
```

```python
# test_csv_reader.py (příklad)
from scada.services.csv_reader import CsvReader
from scada.config import DataConfig
from pathlib import Path

def test_list_files_local(tmp_path):
    # Setup: vytvořit testovací CSV soubory
    ...
    reader = CsvReader(DataConfig(local_path=tmp_path, ...))
    files = reader.list_files('local', 'production')
    assert len(files) == 1
    assert files[0]['record_count'] == 3

def test_path_traversal_rejected():
    ...
    result = reader._validate_params('../etc/passwd', 'local', 'production')
    assert result is False
```

**Náročnost:** 2 dny (pokrytí ~80% csv_reader.py)

---

### 2.4 Strukturované logování ✅ Implementováno (2026-07-19)

**Proč:** Aktuální textové logy jsou těžko parsovatelné nástrojem. JSON logy umožňují filtrování v Grafana Loki, ELK stack, nebo i prostý `jq`.

**Co implementovat:**
```python
# 00_backend/scada/logging_setup.py
import logging, json

class JsonFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({
            "ts":    self.formatTime(record),
            "level": record.levelname,
            "mod":   record.name,
            "msg":   record.getMessage(),
        })

def setup_logging(debug: bool = False):
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    logging.basicConfig(level=logging.DEBUG if debug else logging.INFO, handlers=[handler])
```

**Náročnost:** 0.5 dne

---

### 2.5 Graceful shutdown

**Proč:** Při `Ctrl+C` nebo SIGTERM (NSSM) může Uvicorn ukončit request uprostřed zpracování. Lifespan `try/finally` already handles monitor.stop() — ale WebSocket klienti dostanou nečistý disconnect.

**Co implementovat:**
```python
# app.py lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    await monitor.start()
    yield
    # Na shutdown — počkat na dokončení aktivních requestů (max 5 s)
    await asyncio.sleep(0)       # dát čas na dokončení running coroutines
    await monitor.stop()
    log.info("[APP]   shutdown dokončen")
```

Plus v Uvicorn: `--timeout-graceful-shutdown 5`

**Náročnost:** 2 hodiny

---

## 3. UX & Frontend 🟢 NICE

### 3.1 Loading skeletons místo spinneru

**Proč:** Spinner způsobuje "content flash" — tabulka zmizí a objeví se znovu. Skeleton zachová layout.

**Co implementovat:**
```tsx
// components/TableSkeleton.tsx
function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="skeleton-table">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-row" />
      ))}
    </div>
  )
}
```
```css
.skeleton-row {
  height: 40px;
  background: linear-gradient(90deg, var(--color-surface-2) 25%, var(--color-border) 50%, var(--color-surface-2) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s infinite;
  border-radius: var(--radius-sm);
  margin-bottom: 4px;
}
```

**Náročnost:** 1 den

---

### 3.2 Stránkování (pagination)

**Proč:** Pokud je zakázek stovky (produkční prostředí), tabulka bude pomalá. Backend by měl stránkovat.

**Co implementovat:**

Backend:
```python
@router.get("/files")
async def list_files(
    ...
    page:     int = Query(1,  ge=1, description="Číslo stránky"),
    per_page: int = Query(50, ge=1, le=200, description="Položek na stránku"),
):
    all_files = await asyncio.to_thread(reader.list_files, ...)
    start = (page - 1) * per_page
    return {
        "files": all_files[start:start + per_page],
        "total": len(all_files),
        "page":  page,
        "pages": math.ceil(len(all_files) / per_page),
    }
```

Frontend: přidat pagination komponentu s `<` / `>` tlačítky.

**Náročnost:** 1.5 dne

---

### 3.3 Export dat z ChartView ✅ Implementováno (2026-07-19)

**Proč:** Operátoři chtějí aktuálně zobrazená (filtrovaná) data předat do Excelu nebo jiného
nástroje bez nutnosti ručního kopírování z tabulky.

**Implementováno:**
- `src/utils/exportCsv.ts` — znovupoužitelná utilita; oddělovač `;`, UTF-8 BOM pro Excel
- Tlačítko "Stáhnout CSV" / "Download CSV" v záhlaví tile se záznamy — viditelné jen pokud jsou data
- `i18n/types.ts` + `cs.ts` + `en.ts` — přeložený text tlačítka
- `tiles.css` — nová třída `.tile__header-actions` (flex wrapper pro badge + tlačítka)

**Jak to funguje:** Export proběhne čistě v prohlížeči — data jsou již načtena v paměti,
žádný extra request na backend. Soubor se jmenuje stejně jako zdrojový soubor (fileId).

**Náročnost:** 2 hodiny

---

### 3.4 Offline indikátor ✅ Implementováno (2026-07-19)

**Proč:** Pokud backend spadne (restart, výpadek sítě), uživatel vidí jen "nepřipojeno" na PLC ikoně. Chybí jasné sdělení "backend nedostupný".

**Implementováno:**
- `hooks/useBackendOnline.ts` — polling `/api/health` každých 10 s; výchozí `true` (bez úvodního bliknutí); AbortController pro cleanup
- `App.tsx` — červený fixed banner `<div class="offline-banner">` s ikonou WifiOff + přeloženou zprávou
- `i18n` — `common.backendOffline` (CS: "Server nedostupný — kontroluji spojení…")
- `layout.css` — `.offline-banner` s `position: fixed; z-index: 9999` + slide-in animace

**Náročnost:** 3 hodiny

---

### 3.5 Klávesové zkratky pro operátory ✅ Implementováno (2026-07-19)

**Proč:** Operátoři ovládající myší + klávesnicí jsou produktivnější. Standardní SCADA konvence.

**Implementováno:**
- `hooks/useKeyShortcuts.ts` — generický hook: `useKeyShortcuts({ F5: cb, Escape: cb })`
  - listener se přidá jednou (mount), useRef zajistí aktuální callbacks bez re-registrace
  - F5 / ostatní klávesy ignorovány při psaní v `<input>` / `<textarea>` / `<select>`
  - Escape funguje i při zaměřeném inputu (zavřít modal)
  - `e.preventDefault()` zabrání výchozí akci prohlížeče (F5 = reload)
- `Database.tsx` — `F5` → `fetchFiles()`, `Escape` → zavřít expanded řádek + delete modal

**Náročnost:** 2 hodiny

---

### 3.6 Dark mode ✅ Implementováno (2026-07-19)

**Proč:** Výrobní hala — monitory v tmavém prostředí. Tmavý režim snižuje únavu očí při noční směně.

**Implementováno:**
- `variables.css` — 2 sady dark tokenů: `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` + `:root[data-theme="dark"]` (manuální override)
- Přepsáno 16 tokenů: bg, surface, surface-2, border, border-strong, text (primary/secondary/muted), accent (4×), status-light (3×), shadows (4×)
- Sidebar + Topbar zůstávají beze změny (jsou již tmavé — #161c2d / #1e2433)
- `Topbar.tsx` — `useTheme()` hook: `useState` init z localStorage nebo `matchMedia`; `useEffect` nastaví `data-theme` na `<html>`; přepínač Moon/Sun; persistuje v `localStorage('scada_theme')`
- `topbar.css` — `.topbar__theme-btn` (30×30px, hover highlight)

**Náročnost:** 1 den (závisí na komplexitě stávajících komponent)

---

## 4. Observability & Provoz 🟡 SHOULD

### 4.1 Request ID v logování

**Proč:** Při debugování v produkci chceš sledovat jeden request přes všechny logy. Request ID umožňuje filtrovat `grep REQUEST_ID app.log`.

**Co implementovat:**
```python
# middleware v app.py
import uuid
from starlette.middleware.base import BaseHTTPMiddleware

class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request_id = str(uuid.uuid4())[:8]
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
```

**Náročnost:** 1 hodina

---

### 4.2 Prometheus metriky

**Proč:** Grafana + Prometheus → dashboardy s request latency, error rates, aktivními WebSocket klienty.

**Co implementovat:**
```bash
pip install prometheus-fastapi-instrumentator
```
```python
from prometheus_fastapi_instrumentator import Instrumentator
Instrumentator().instrument(app).expose(app)
# → /metrics endpoint pro Prometheus scraping
```

**Náročnost:** 2 hodiny

---

### 4.3 Docker nasazení ✅ Implementováno (2026-07-19)

**Proč:** Reprodukovatelné nasazení na jakýkoli Windows/Linux stroj bez instalace Pythonu a Node.js.

**Implementováno:**
- `Dockerfile` — multi-stage build (Node:20 → Python:3.11-slim); finální image neobsahuje node_modules
- `docker-compose.yml` — port 8080, bind-mount Config.toml (read-only) + ./data, healthcheck na /api/health
- `.dockerignore` — vylučuje .git, node_modules, 02_tests/, 05_user_data/ → rychlejší build context
- `app.py` — auto-detekce `01_frontend/dist/`; pokud existuje → StaticFiles mount (produkce/Docker); pokud ne → API-only (dev)

**Jak spustit:**
```bash
# 1. Upravit Config.toml: local_path = "/data"
# 2. Build a start
docker compose up -d --build
# Aplikace: http://localhost:8080
```

**Náročnost:** 0.5 dne (+ testování na Windows)

---

### 4.4 Verzovaná API (/api/v1/)

**Proč:** Pokud přibude mobilní klient nebo třetí strana konzumuje API, změna formátu odezvy nesmí rozbít existující klienty.

**Co implementovat:**
```python
# app.py
app.include_router(files.router, prefix="/api/v1", tags=["files"])
# Starý prefix /api/ ponechat jako alias pro zpětnou kompatibilitu:
app.include_router(files.router, prefix="/api",   tags=["files (compat)"])
```

**Náročnost:** 2 hodiny

---

## 5. Dokumentace & Vývojový proces 🟢 NICE

### 5.1 OpenAPI anotace — kompletní Swagger

**Proč:** Aktuálně Swagger UI zobrazuje endpointy bez popisů odpovědí. Kompletní dokumentace pomáhá novým vývojářům a zákazníkovi.

**Co implementovat:**
```python
@router.get(
    "/files",
    summary="Seznam CSV souborů",
    description="Vrátí seznam uzavřených zakázkových souborů na lokálním nebo vzdáleném úložišti.",
    response_model=FilesResponse,
    responses={
        200: {"description": "OK — seznam souborů"},
        503: {"description": "Úložiště dočasně nedostupné"},
    }
)
```

**Náročnost:** 0.5 dne

---

### 5.2 Changelog (CHANGELOG.md)

**Proč:** Zákazník i tým vidí co se změnilo v každé verzi. Profesionální standard.

```markdown
# Changelog

## [0.2.0] — 2026-08-xx
### Added
- JWT autentizace (POST /api/auth)
- Paginace na /api/files

### Fixed
- Blocking I/O v async endpointech (načítání trvalo minutu)
- WebSocket protokol wss:// pro HTTPS

## [0.1.0] — 2026-07-18
- Počáteční verze
```

**Náročnost:** 30 minut (pak udržovat průběžně)

---

### 5.3 Pre-commit hooks — automatické lintování

**Proč:** Zajistí konzistentní styl kódu bez manuální kontroly při code review.

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.5.0
    hooks:
      - id: ruff        # Python linter (rychlejší flake8)
      - id: ruff-format # Python formatter (alternativa k black)
  - repo: https://github.com/pre-commit/mirrors-eslint
    rev: v9.0.0
    hooks:
      - id: eslint
        files: \.tsx?$
```

```bash
pip install pre-commit
pre-commit install
```

**Náročnost:** 1 hodina

---

## Prioritní pořadí pro produkci

| Priorita | Položka | Odhadovaný čas |
|----------|---------|----------------|
| 1 | 1.2 HTTPS certifikát | 0.5 dne |
| 2 | 1.1 JWT autentizace | 2 dny |
| 3 | ~~2.2 Health check endpoint~~ | ✅ hotovo |
| - | ~~3.3 Export CSV z ChartView~~ | ✅ hotovo |
| - | ~~2.1 Pydantic response modely~~ | ✅ hotovo |
| - | ~~2.3 Testy (CsvReader + API)~~ | ✅ hotovo |
| - | ~~1.3 Security hlavičky~~ | ✅ hotovo |
| - | ~~1.5 Rate limiting~~ | ✅ hotovo |
| - | ~~2.4 Strukturované logování~~ | ✅ hotovo |
| - | ~~3.2 Stránkování~~ | ✅ hotovo |
| - | ~~4.3 Docker~~ | ✅ hotovo |

**Celkem do produkce:** ~10 pracovních dní

---

## Co projekt UŽ dělá správně (referenční architektura)

| Oblast | Status |
|--------|--------|
| asyncio.to_thread() pro všechno I/O | ✅ |
| AbortController v React hooks | ✅ |
| Exponential backoff WebSocket reconnect | ✅ |
| Config validace při startu | ✅ |
| Path traversal ochrana | ✅ |
| i18n s typovanými překlady | ✅ |
| BEM CSS s design tokeny | ✅ |
| Čitelné error zprávy (ne raw traceback) | ✅ |
| Audit log v dokumentaci | ✅ |
| Průvodce rozšiřováním | ✅ |
