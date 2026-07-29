# ScadaViewer — Roadmap a plán dodělávek

> Dokument pro vývojáře. Popisuje co zbývá před nasazením do produkce a v jakém pořadí to dělat.
> Aktualizovat při každé změně stavu.
>
> Poslední aktualizace: 2026-07-29

---

## Aktuální stav

| Oblast | Stav | Poznámka |
|--------|------|---------|
| Backend (FastAPI, API, ADS) | ✅ Hotovo | Viz CLAUDE.md sekce 13 |
| Frontend (všechny stránky) | ✅ Hotovo | 5 stránek, i18n CS/EN |
| Autentizace (PBKDF2) | ✅ Hotovo | Login, logout, change-password |
| Security middleware | ✅ Hotovo | SecurityHeaders, RateLimit, CORS, WS origin |
| NSSM installer | ✅ Hotovo | `06_build/exe/nssm_install.bat` |
| Dokumentace kódu | ✅ Hotovo | pdoc + TypeDoc, 19 souborů doplněno |
| Backend testy | ✅ Hotovo | Config, API integration, security, DateValidation; spustit: `pytest 02_tests/ -v` |
| **Build pipeline (exe)** | ❌ Chybí | `build.bat` + `scada.spec` neexistují |
| Frontend testy | ✅ Hotovo | 7 souborů Vitest; spustit: `npm run test` |
| **CSP hlavička** | ❌ Chybí | `Content-Security-Policy` v middleware |
| AnalyzedParams (ChartView) | ⏳ Čeká | Zákaznické CSV sloupce — upřesnit s Trafag |
| TimeDiagram — NC/NO layout | ✅ Hotovo | RecordDiagram.tsx — ForceTravelDiagram (screen 29) + TimeDiagram (screen 30); ParamTable 5 skupin; maximize modal |
| Řazení sloupců (Database) | 🔵 Nice-to-have | Klik na záhlaví → sort na serveru |

---

## Sprint 1 — Build pipeline *(blokuje nasazení)*

**Cíl:** Vytvořit nasaditelný balíček bez nutnosti instalace Pythonu na cílovém PC.

### Úkoly

#### 1.1 `06_build/exe/scada.spec` — PyInstaller specifikace

Vzor: `DatabaseGateway/06_build/exe/db_gateway.spec`

```python
# scada.spec (kostra)
block_cipher = None

a = Analysis(
    ['../../main.py'],
    pathex=['../../00_backend'],
    binaries=[],
    datas=[
        ('../../01_frontend/dist', 'frontend_dist'),  # React build
        ('../../00_backend/scada', 'scada'),           # Python balíček
    ],
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.loops.auto',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets.auto',
        'pyads',
    ],
    ...
)
```

> **Pozor:** `main.py` musí po buildu správně najít frontend dist a Config.toml.
> `_FRONTEND_DIST` v `app.py` je relativní k working directory — v exe kontextu
> bude working directory adresář exe souboru.

#### 1.2 `06_build/exe/build.bat` — build skript

Vzor: `Analyzing/06_build/exe/build.bat`

```bat
@echo off
:: 1. Načíst verzi z __init__.py
:: 2. npm run build (v 01_frontend/)
:: 3. pyinstaller scada.spec
:: 4. Zkopírovat Config.toml.example + nssm_install.bat do dist/
:: 5. ZIP balíček → 06_build/releases/ScadaViewer_v{verze}.zip
:: 6. (Volitelně) git tag v{verze} + gh release create
```

#### 1.3 Úprava `main.py` — cesty v exe kontextu

```python
# main.py — přidat před load_config()
import sys
if getattr(sys, 'frozen', False):
    # PyInstaller exe — working directory = adresář exe
    BASE_DIR = Path(sys.executable).parent
else:
    BASE_DIR = Path(__file__).parent
```

#### 1.4 Test na čistém PC (bez Pythonu)

- [ ] Spustit `scada_viewer.exe --config Config.toml`
- [ ] Ověřit, že se spustí HTTP na portu 8080
- [ ] Ověřit, že frontend (React dist) se servíruje
- [ ] Ověřit, že logy jdou do `03_output/logs/`

**Akceptační kritérium:** exe běží na čistém Windows 10/11 bez instalace Pythonu nebo Node.js.

---

## Sprint 2 — Security hardening

**Cíl:** Aplikace je bezpečná pro provoz v průmyslovém prostředí.

### Úkoly

#### 2.1 CSP hlavička (`Content-Security-Policy`)

Soubor: `00_backend/scada/app.py` → `_SecurityHeadersMiddleware.dispatch()`

Postup:
1. Spustit `npm run build` a prohlédnout `01_frontend/dist/assets/` — identifikovat hash inline skriptů
2. Sestavit CSP direktivu:

```
Content-Security-Policy:
  default-src 'self';
  script-src  'self';
  style-src   'self' 'unsafe-inline';   ← Vite generuje inline styly
  img-src     'self' data:;
  connect-src 'self' ws: wss:;          ← WebSocket
  font-src    'self';
  frame-ancestors 'none';               ← nahradí X-Frame-Options: DENY
```

> `'unsafe-inline'` pro styly je akceptovatelné. Pro skripty NESMÍ být `'unsafe-inline'`.
> Pokud Vite generuje inline skripty, použít nonce nebo `'unsafe-inline'` jen dočasně.

#### 2.2 Produkční `Config.toml`

Vyplnit před nasazením (viz `Config.toml.example`):

```toml
[server]
host = "0.0.0.0"          # nebo konkrétní IP stroje
port = 8080
cors_origins = ["http://10.45.124.X:8080"]   # konkrétní IP operátorských terminálů

[auth]
password_hash = "..."      # nový hash — vygenerovat přes /api/auth/change-password

[ads]
net_id = "X.X.X.X.1.1"   # AMS Net ID cílového PLC runtime

[data]
local_path  = "C:/apps/scada_data"           # produkční výstupní složka DatabaseGateway
remote_path = "\\\\10.45.124.20\\trafag"     # NAS UNC cesta
csv_separator = ";"
csv_encoding  = "utf-8-sig"
```

#### 2.3 Rozhodnutí o HTTPS

Viz `04_docs/deployment.md` sekce HTTPS. Nutné rozhodnutí před nasazením:
- LAN-only bez HTTPS (vědomé rozhodnutí, zdokumentovat)
- Caddy reverse proxy (doporučeno pokud přístup z více VLAN)

---

## Sprint 3 — Frontend testy

**Cíl:** Klíčové komponenty mají testy. Pokrytí frontendu > 60 %.

### Úkoly

#### 3.1 Konfigurace Vitest

`01_frontend/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
  },
})
```

`01_frontend/src/test-setup.ts`:
```ts
import '@testing-library/jest-dom'
```

#### 3.2 Testy k napsání (priorita)

| Soubor | Co testovat |
|--------|------------|
| `FileTable.test.tsx` | Render tabulky, expand/collapse, delete modal, download tlačítko |
| `ChartView.test.tsx` | Order detail, record detail (?record=N), navigace zpět |
| `Database.test.tsx` | Filtry datum, přepínání local/remote, stránkování |
| `useData.test.ts` | Mock fetch, AbortController, error state |
| `LangContext.test.tsx` | Přepnutí CS/EN, localStorage persistence |

#### 3.3 Mock strategie

```ts
// Mock fetch pro testy
vi.mock('../hooks/useData', () => ({
  useFiles: vi.fn(() => ({ files: [], loading: false, error: null })),
}))

// Mock React Router
import { MemoryRouter } from 'react-router-dom'
render(<FileTable {...props} />, { wrapper: MemoryRouter })
```

**Akceptační kritérium:** `npm run test` prochází. Pokrytí klíčových komponent > 60 %.

---

## Sprint 4 — Trafag specifics *(čeká na odpovědi)*

**Cíl:** Aplikace zobrazuje zákaznické CSV sloupce tak, jak Trafag potřebuje.

### Blokující otázky pro Trafag

> ⚠️ Tyto odpovědi jsou nutné před zahájením Sprintu 4.

| # | Otázka | Dopad |
|---|--------|-------|
| 1 | Jaké zákaznické sloupce (AnalyzedParams) bude production CSV obsahovat? | ChartView graf, DataTable sloupce |
| 2 | Jaká je produkční cesta k datům? (`local_path`) | Config.toml |
| 3 | Jaká je finální UNC cesta k NAS? | Config.toml `remote_path` |
| 4 | Z jakých IP/strojů bude aplikace dostupná? | `cors_origins` |
| 5 | HTTPS potřeba (přístup přes WAN)? Nebo pouze LAN? | Deployment architektura |
| 6 | Jeden sdílený účet nebo individuální přihlášení operátorů? | Auth architektura |
| 7 | Jaký AMS Net ID má produkční PLC runtime? | Config.toml `ads.net_id` |

### Úkoly (po obdržení odpovědí)

- [ ] Doplnit zákaznické sloupce do `EXCLUDE_KEYS` v `Chart.tsx` (nebo zobrazit v grafu)
- [ ] Rozšířit `DataTable` v ChartView o zákaznické sloupce
- [ ] Přidat překlady nových polí do `cs.ts` + `en.ts`
- [ ] Aktualizovat `OrderFile` / `CsvRecord` typy v `types/index.ts`

---

## Nice-to-have (po předání, v dalším cyklu)

| Funkce | Odhadovaná náročnost | Přínos |
|--------|---------------------|--------|
| Řazení sloupců v Database (klik na záhlaví) | M | UX |
| Hromadné mazání (checkbox + batch DELETE) | M | UX |
| ADS mock testy (bez PLC) | L | Testovatelnost |
| Alerting (email/webhook při výpadku ADS) | L | Provoz |
| Více uživatelů s různými oprávněními | XL | Enterprise |
| Export do Excel (xlsx) | S | UX |

---

## Definice "hotovo" pro předání Trafag

Aplikace je připravena k předání pokud:

- [ ] Sprint 1: `build.bat` + `scada.spec` → exe funguje na čistém PC
- [ ] Sprint 2: CSP nasazena, produkční Config.toml připraven, HTTPS rozhodnutí zdokumentováno
- [x] Sprint 3: Frontendové testy procházejí, pokrytí > 60 % *(✅ 2026-07-29, `npm run test`)*
- [ ] Sprint 4: AnalyzedParams sloupce zobrazeny dle dohody s Trafag
- [ ] Testy na produkčním PC: ADS připojení, NAS přístup, login
- [ ] NSSM služba nainstalována a testována (restart po pádu, log rotation)
- [ ] Operátorská dokumentace (`04_docs/deployment.md`) předána IT správci Trafag
