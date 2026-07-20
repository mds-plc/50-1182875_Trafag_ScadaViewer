# Frontend architektura — ScadaViewer

## Technologie

| Vrstva | Technologie |
|--------|-------------|
| Framework | React 18 + TypeScript |
| Bundler | Vite 5 |
| Routing | React Router v6 |
| Grafy | Recharts |
| Ikony | lucide-react |
| CSS | Vanilla CSS + design tokeny (bez frameworku) |

---

## Struktura složek

```
src/
├── context/
│   ├── PlcContext.tsx     ← jeden WebSocket pro celou app
│   └── AuthContext.tsx    ← přihlašovací stav (PLC + lokální)
├── hooks/
│   └── useData.ts         ← REST volání na /api/files + /api/data
├── components/
│   ├── AppLogo.tsx        ← SVG logo (sdílené)
│   ├── AdsStatus.tsx      ← indikátor PLC připojení (sdílený)
│   ├── ErrorBoundary.tsx  ← zachytí runtime chyby komponent
│   ├── LoadingSpinner.tsx ← loading UI
│   ├── LoginOverlay.tsx   ← přihlašovací overlay
│   ├── Sidebar.tsx        ← navigace
│   ├── Topbar.tsx         ← horní lišta
│   ├── PlcStatus.tsx      ← tabulka PLC symbolů
│   ├── DataTable.tsx      ← generická tabulka
│   └── Chart.tsx          ← Recharts wrapper
├── pages/
│   ├── Overview.tsx       ← hlavní dashboard (PLC stav, aktuální zakázka)
│   ├── Database.tsx       ← seznam CSV souborů (local / remote)
│   ├── ChartView.tsx      ← graf + filtry + tabulka záznamů
│   ├── Settings.tsx       ← nastavení aplikace
│   └── Info.tsx           ← informace o aplikaci
├── styles/
│   ├── variables.css      ← design tokeny (barvy, spacing, typography)
│   ├── reset.css          ← browser reset
│   ├── layout.css         ← app shell grid (sidebar + topbar + content)
│   ├── sidebar.css        ← tmavý sidebar
│   ├── topbar.css         ← tmavý topbar
│   ├── components.css     ← badge, button, divider, stat
│   ├── tiles.css          ← 12-sloupcový tile grid
│   ├── login.css          ← login overlay + formulář
│   └── ui.css             ← spinner, error boundary, filter bar
├── types/
│   └── index.ts           ← PlcStatus, OrderFile, CsvRecord, DataFilter
├── App.tsx                ← provider strom + routing
├── index.css              ← import všech CSS souborů
└── main.tsx               ← React entry point
```

---

## Provider strom

```
<BrowserRouter>
  <PlcProvider>          ← jeden WebSocket, sdílí status + connected
    <PlcAuth>            ← čte PLC login symbol, předá do AuthProvider
      <AuthProvider>     ← isLoggedIn, login(), logout(), sessionStorage
        <AppShell>       ← layout + LoginOverlay
          <ErrorBoundary>
            <Routes>     ← stránky
```

### Proč takhle?

- **PlcProvider** musí být nad **AuthProvider** — `PlcAuth` čte PLC stav a předá ho jako prop `plcLoggedIn`
- **AuthProvider** pak kombinuje PLC login + lokální login
- **ErrorBoundary** obaluje pouze `<Routes>` — pokud stránka crashne, sidebar a topbar zůstanou funkční

---

## Kontext — PlcContext

**Soubor:** `context/PlcContext.tsx`

Jeden WebSocket `/ws/plc` pro celou aplikaci. Komponenty konzumují `usePlc()`.

```tsx
const { status, connected } = usePlc()
// status: Record<symbol, PlcStatus>  — snapshot všech PLC hodnot
// connected: boolean                  — WebSocket připojení
```

**Proč Context a ne hook?**
Hook `usePlcSocket()` by otevřel nové WebSocket připojení pro každou komponentu která ho zavolá. Context otevře připojení jednou v `PlcProvider` a všichni sdílejí stejný stav.

---

## Kontext — AuthContext

**Soubor:** `context/AuthContext.tsx`

Spravuje stav přihlášení. Dvě cesty přihlášení:

| Typ | Mechanismus | Persistuje? |
|-----|-------------|-------------|
| PLC přihlášení | ADS symbol `in_ready = true` | Ne (závisí na PLC stavu) |
| Lokální přihlášení | Formulář username + heslo | `sessionStorage` (do zavření prohlížeče) |

```tsx
const { isLoggedIn, isLocalLogin, login, logout } = useAuth()
```

### Budoucí rozšíření — serverová autentizace

Funkce `login()` v `AuthContext.tsx` je připravena na napojení serveru:

```tsx
// AuthContext.tsx — TODO blok pro server auth
function login(username: string, password: string): boolean {
  if (!username.trim() || !password.trim()) return false
  // TODO: nahradit fetch voláním:
  // const res = await fetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })
  // if (!res.ok) return false
  sessionStorage.setItem(SESSION_KEY, 'true')
  setLocalLogin(true)
  return true
}
```

Změny při napojení serveru:
1. `login()` → `async login()` + fetch na `/api/auth/login`
2. Odpověď serveru vrátí token nebo session cookie
3. `sessionStorage` nahradit cookie (server-side session) nebo JWT v `localStorage`
4. Přidat refresh token logiku pokud bude potřeba

---

## Data flow — PLC → UI

```
TwinCAT PLC (ADS)
    ↓
FastAPI /ws/plc  (WebSocket broadcast)
    ↓
PlcContext (onmessage handler)
    ↓
status: Record<symbol, PlcStatus>
    ↓
usePlc() hook → konzumenti:
    ├── PlcAuth       → detekce PLC login symbolu
    ├── AdsStatus     → indikátor Connected / Disconnected
    ├── LoginOverlay  → zobrazení stavu při přihlašování
    └── Overview      → tabulka PLC hodnot
```

---

## Data flow — CSV soubory → UI

```
DatabaseGateway (píše CSV)
    ↓
Filesystém (done_local / done_remote)
    ↓
FastAPI /api/files  →  useFiles()  →  Database stránka
FastAPI /api/data   →  useData()   →  ChartView stránka
```

**Error handling** v `useData.ts`:
- HTTP status check (`res.ok`)
- Validace response formátu (`Array.isArray`)
- `error` state vrácen z hooku, stránka ho zobrazí přes `<p className="error-text">`

---

## Layout — CSS Grid

```
┌─────────────────────────────────────────────┐
│  TOPBAR  (56px, #2d3748)                    │  grid-area: topbar
├──────────┬──────────────────────────────────┤
│          │                                  │
│ SIDEBAR  │  CONTENT                         │
│ (180px,  │  (overflow-y: auto)              │  grid-area: content
│ #1f2937) │                                  │
│          │  <page-title>                    │
│          │  <tile-grid>                     │
│          │    <div class="tile tile--6">    │
│          │    <div class="tile tile--6">    │
└──────────┴──────────────────────────────────┘
```

**Tile grid:** 12 sloupců, `tile--N` = `grid-column: span N`

---

## Přidání nové stránky

1. Vytvořit `src/pages/NovaStraanka.tsx`
2. Přidat `<Route>` do `App.tsx`
3. Přidat položku do `NAV_ITEMS` v `Sidebar.tsx`
4. Pokud stránka potřebuje PLC data: `const { status } = usePlc()`
5. Pokud stránka potřebuje REST data: `const { ... } = useFiles()` nebo `useData()`

---

## Přidání nového PLC symbolu

1. Backend: přidat do `constants.py` → `SYM` dict
2. Backend: `AdsMonitor.start()` ho zaregistruje automaticky
3. Frontend: symbol přijde přes WebSocket do `status` v `usePlc()`
4. Konzumovat: `const { status } = usePlc()` → `status['nazev_symbolu']?.value`

---

## Dev spuštění

```bash
cd 01_frontend
npm install
npm run dev      # Vite dev server na :5173
                 # proxy /api a /ws → backend :8080
```

Backend musí běžet odděleně:
```bash
python main.py --config Config.toml --debug   # FastAPI na :8080
```

---

## Build

```bash
cd 01_frontend
npm run build    # → dist/
```

V produkci FastAPI servíruje `dist/` jako StaticFiles (odkomentovat v `app.py`).
