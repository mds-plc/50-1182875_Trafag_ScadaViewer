# Frontend vzory pro ScadaViewer (React + TypeScript)

## Struktura komponent

```tsx
// Vždy props interface explicitně
interface Props {
  data: CsvRecord[]
  onSelect?: (id: string) => void
}

export default function MyComponent({ data, onSelect }: Props) {
  return <div>...</div>
}
```

## Hooks — pravidla

```ts
// useEffect dependency array VŽDY vyplnit
useEffect(() => {
  fetchData()
}, [fetchData])   // ← ne []!

// useCallback pro funkce předávané jako prop nebo v dependency array
const fetchData = useCallback(async () => {
  ...
}, [filter])
```

## AbortController — VŽDY v fetch hoocích

Zabrání race condition při rychlém přepínání záložek nebo Strict Mode double-invoke.

```ts
const abortRef = useRef<AbortController | null>(null)

const fetchData = useCallback(async () => {
  abortRef.current?.abort()
  const ctrl = new AbortController()
  abortRef.current = ctrl

  setLoading(true)
  try {
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
    const res = await apiFetch(url, { signal: ctrl.signal, headers })   // ne holý fetch!
    const data = await res.json()
    setData(data)
    setLoading(false)
  } catch (e) {
    if (ctrl.signal.aborted) return   // ignorovat — nevypisovat error
    setError('Chyba načítání')
    setLoading(false)
  }
}, [url])
```

## apiFetch — VŽDY pro autentizovaná volání

`utils/apiFetch.ts` — stejné API jako `fetch`. Při 401 + `WWW-Authenticate: Bearer` vyšle
událost `scada:unauthorized` → `AuthContext` odhlásí (lokální login) nebo obnoví PLC login.
Holý `fetch` jen pro veřejné endpointy (`/api/health`, `/api/auth/login`).
PLC token je jen v paměti (ne sessionStorage) a má roli admin; 401 po odhlášení na PLC → AuthContext token zahodí
a čeká na nové PLC přihlášení.

## Nápověda stránky — každá stránka

Každá stránka má v `h1.page-title` komponentu `<PageHelp page="…" />` (ikona → panel „k čemu stránka
slouží / co na ní je"). Texty v `i18n/help.cs.ts` + `help.en.ts` (stejné pořadí položek). **Změna stránky =
upravit i její nápovědu**; nová stránka = nový `HelpPageId` v `i18n/types.ts`.

## Code-splitting

Nová stránka (kromě hlavní Database) → `lazy(() => import('./pages/X'))` v `App.tsx`
+ přidat do `preloadPages()`. Těžké knihovny použité jen v akci → dynamický `await import('…')`
uvnitř funkce.

## Velká data — nerozbíjet

- **CSV / XLSX VŽDY přes `useFileDownload()`** (`context/UsbContext.tsx`) — u stroje uloží na flashku (jen admin;
  jinak tlačítko tlumené s `disabledReason`, klik = varování + zablikání `UsbStorageBar`), vzdáleně dialog „Uložit jako"
  → `GET /api/files/{id}/xlsx` / `download`. `exportFileXlsx` / `downloadOriginalCsv` nevolat přímo. **XLSX sestavuje
  server** — žádné skládání velkých souborů v prohlížeči (kiosk). Flashku zjišťuje jen `UsbContext` (`GET /api/usb`
  á 3 s, jen admin u stroje) — další polling flashky nepřidávat.
- Celé velké zakázky nikdy jako JSON (`per_page=0` má strop) — export / originální CSV.
- `DataTable`, `OrderTimelineChart`, graf kategorií jsou `memo` → předávat stabilní props (`useMemo`,
  `useCallback`); při změně stránky / filtru obsah nechat (spinner jen při prvním načtení).
- Skryté tiskové tabulky vykreslovat až při tisku — `hooks/usePrintMode.ts` (`printNow` / `beforeprint`).
- Přehled Databáze: `record_count` může být `null` (dopočítává se) — zobrazit „…", ptát se znovu, dokud
  `counts_pending` (`useDatabaseState`, `COUNTS_RETRY_MS`).
- Filtr kusů zakázky jde přes server (`DataFilter.status` / `categories` / `nok`) — stránkování a počty sedí.
  Nový filtr kusů = předpočítaný sloupec v `_OrderIndex` (`_build_index`) + parametr `/api/data` + skupina v
  `RecordFilterBar` (vzor: NOK oblast — maska `_OrderIndex.nok`, počty `nok_counts`, `test_nok_filter.py`).

## WebSocket — pattern s reconnect (PlcContext vzor)

> **Výkon:** mimo živý přehled číst PLC stav přes `usePlcConnection()` (`connected`, `adsConnected`,
> `plcLoggedIn`) — `usePlc().status` se mění s každou ADS notifikací a překreslil by vše pod sebou.


```ts
useEffect(() => {
  let destroyed = false

  function connect(attempt: number) {
    if (destroyed) return
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/plc`)

    ws.onopen  = () => setConnected(true)
    ws.onclose = () => {
      setConnected(false)
      setStatus({})   // reset stale dat — SCADA safety
      if (destroyed) return
      const delay = Math.min(1000 * 2 ** attempt, 30_000)
      setTimeout(() => connect(attempt + 1), delay)
    }
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      setStatus(prev => ({ ...prev, [msg.symbol]: msg }))
    }
  }

  connect(0)
  return () => { destroyed = true }
}, [])
```

## i18n — useLang()

```tsx
import { useLang } from '../context/LangContext'

function MyComponent() {
  const { t } = useLang()
  return <p>{t.common.loading}</p>
}
```

Nový přeložitelný řetězec → přidat do `i18n/types.ts` (Translations interface) + `i18n/cs.ts` + `i18n/en.ts`.
Žádné natvrdo zapsané texty v JSX ani v `title` / `aria-label` (ani `lang === 'cs' ? … : …`).
Terminologie (rozhodnutí uživatele 2026-09-25): odborné názvy parametrů, skupin, NOK kategorií a
Production/Testing anglicky v obou jazycích; třídění 1–6 = „Kategorie" / „Category"; odznaky Sync
anglicky (In progress / Local / Synced). Počty bez skloňování: „Souborů: 3", ne „3 souborů".
Kategorie 5 / 6 = **„NOK Trafag" / „NOK Supplier"** v obou jazycích (2026-10-16; ne „NOK výrobce" / „Manufacturer").
Class komponenty (ErrorBoundary) používají `LangContext.Consumer`, ne hook.

## Sidebar — aktivní stav pro vnořené cesty

NavLink nepozná `/chart` jako podcestu `/database`. Řešení přes `extraPaths` + `useLocation()`:

```tsx
import { NavLink, useLocation } from 'react-router-dom'

const location = useLocation()
const NAV_ITEMS = [
  { to: '/database', extraPaths: ['/chart'], ... },
]

<NavLink
  className={({ isActive }) => {
    const extra = extraPaths.some(p => location.pathname.startsWith(p))
    return 'sidebar__nav-item' + (isActive || extra ? ' active' : '')
  }}
>
```

## Routing — react-router-dom v7

```tsx
// App.tsx
<Routes>
  <Route path="/"         element={<Navigate to="/database" replace />} />   {/* Overview odpojen */}
  <Route path="/database" element={<Database />} />
  <Route path="/chart"    element={<ChartView />} />
  <Route path="/settings" element={<Settings />} />
  <Route path="/info"     element={<Info />} />
  <Route path="*"        element={<Navigate to="/database" replace />} />
</Routes>

// Navigace programaticky:
const navigate = useNavigate()
navigate(`/chart?file=${encodeURIComponent(id)}&location=${loc}&type=${type}`)

// Čtení query params:
const [searchParams] = useSearchParams()
const fileId = searchParams.get('file')
```

## Recharts — LineChart s auto-detekcí sloupců

```tsx
// Vyloučit metadata z automatické detekce numerických sloupců
const EXCLUDE_KEYS = new Set([
  'timestamp', 'microswitch_id', 'microswitch_name', 'order',
  'group', 'expected_count',   // kategorická metadata, ne měření
])

const numericKeys = useMemo(() => {
  if (records.length === 0) return []
  return Object.keys(records[0]).filter(key => {
    if (EXCLUDE_KEYS.has(key)) return false
    const v = records[0][key]
    return typeof v === 'string' && v !== '' && !isNaN(Number(v))
  })
}, [records])
```

## Parametry, grafy, tisk — sdílené stavební bloky (nerozbíjet)

- **Hodnoty měřených parametrů** VŽDY přes `formatParam()` / `paramUnit()` z `utils/paramMeta.ts`
  (mN celá, µm 0,1, µs celá, mΩ 0,1, odpor > 999,9 mΩ → ∞, 0 u polohy/síly/odporu → „—“ = nestanoveno
  Analyzing W5/W6). Převod jednotek podle hlavičky CSV dělá backend (`services/units.py`), `formatParam`
  už nepřevádí. Nikdy ruční `toFixed`.
  Nový parametr: `PARAM_LABELS` + `PARAM_TOOLTIPS` (anglicky, se vzorcem) + `PARAM_DESC` (česká nápověda)
  + `PARAM_DESC_EN` (anglická nápověda — hlídá `test/i18n.test.ts`); zobrazovat přes `paramDesc(key, lang)`
  + skupina v `PARAM_GROUPS` (nebo `EXTRA_FORMAT` pro vstupy testu).
- **Tabulka parametrů** = `components/ParamTable.tsx` (production detail záznamu i Testing detail).
- **Barvy boxů 1–6** = `CATEGORY_COLORS` / `categoryColor()` (`utils/groupColors.ts`) = `.db-cat-badge[data-cat]`
  = **barvy štítků fyzických třídicích krabic** (1 černá, 2 světle modrá, 3 magenta, 4 zelená, 5 žlutá NOK Trafag,
  6 červeno-oranžová NOK Supplier). TS a CSS měnit jen společně (hlídá `paramMeta.test.ts`). Text na barvě kategorie
  VŽDY `categoryTextColor()` (světle modrá a žlutá = tmavý text); černá potřebuje lem (tmavý režim).
- **Hodnoty mimo limity třídění** = `utils/limits.ts` (`buildLimitMap(limits, categories)` / `limitViolation` / `limitClass` /
  `limitTitle`) + `LimitLegend` — v nové tabulce s parametry zakázky použít totéž (DataTable `cellClassName`, ParamTable `limits`).
  Tři druhy: `trafag` (mimo Trafag nebo MD mimo kategorie 1–4 = kat. 5), `supplier` (kat. 6), `both` (mimo obojí).
- **Graf rozložení kategorií** = `components/CategoryChart.tsx` (detail zakázky i rozbalený řádek `compact`) — nový
  graf kategorií nepsat znovu; pásy OK / NOK Trafag / NOK Supplier, rozmezí MD z `order_info.sorting_categories`.
- **Grafy Signal Data** vždy uvnitř `<ZoomPanel>` (zoom osy X, celá obrazovka); render funkce dostane
  `(domain, hiRows)` — řádky filtrovat `sliceRows()`, osy Y přes autoscale z viditelných dat.
- **Recharts:** `XAxis type="number"` vždy (kategoriální osa = nevykreslené `ReferenceLine`);
  `ReferenceArea` s `ifOverflow="hidden"`; synchronizované grafy `syncMethod="value"`.
- **Široký obsah v buňce tabulky** (rozbalený řádek): obal `width: 0; min-width: 100%` + `overflow-x: auto`
  — jinak roztáhne celou tabulku přes obrazovku.
- **Přilepená hlavička** (`position: sticky` na `th`): buňce NIKDY nepřidávat `position: relative` (ani kvůli
  tooltipu) — přebije sticky a hlavička při posunu odjede (screens/39); sticky je výchozím bodem i pro absolutní potomky.
- **Mazání v Databázi:** done_local i rozpracovaná zakázka (`sync_status 'wip'`) jen admin+ (`canDeleteUnsynced` /
  `canDeleteWip`), WIP jen jednotlivě přes `DeleteModal` se zaškrtnutím rizika — nikdy hromadně (výběr WIP nemá).
  Dokončení rozpracované zakázky = `FinishWipModal` (stejné oprávnění, `onFinishRequest`); bez spojení s PLC zaškrtnutí
  „zakázka na stroji neběží" (`plc_unknown_confirmed`).
- **Tisk:** styly v bloku „PROTOKOL" na konci `styles/chart.css`; obrazovkové prvky `cv-screen-only`,
  tiskové `cv-print-only`; ověřit PDF přes Playwright `page.pdf()` (testovací server s fiktivním ADS).

## Klávesnice na obrazovce (kiosk) — nerozbíjet

Na PC u stroje je systémová klávesnice zakázaná; `components/OnScreenKeyboard.tsx` (v `AppShell`) se objeví u každého
textového pole automaticky. Nové pole: běžný `<input>` (text / search / password / number) s `onChange` funguje bez úprav;
pole, kde klávesnice být nemá, `data-osk="off"`. Klávesnice píše nativním setterem + `input` — nepoužívat v polích
logiku jen na `keydown` znaků (Enter klávesnice posílá `keydown` Enter + `form.requestSubmit()`). z-index 3000 —
nové překryvy držet pod ním. Režim: `utils/oskMode.ts` (Nastavení → Předvolby).

## Kontrola kódu — `npm run lint`

ESLint (`01_frontend/eslint.config.mjs`) hlídá `rules-of-hooks` (chyba), `exhaustive-deps`,
`no-explicit-any` (chyba) a `no-console`. Spustit po každé úpravě frontendu spolu s `npx tsc --noEmit`
a `npm run test`; výsledek musí být 0 chyb a 0 varování. Build (`npm run build`) lint nespouští.

## TypeScript — pravidla

- Vždy explicitní typy pro props, state, API response
- Importy typů: `import type { Foo } from './types'`
- Bez `any` — pokud neznáme typ, použít `unknown` a narrowing
- API response typy definovat v `src/types/index.ts`

## Vite proxy — dev mode

Vite 8 (Rolldown), `package.json` `"type": "module"`, Node.js ≥ 20.19; `npm audit` udržovat na 0.
V `vite.config.ts` jsou nastaveny proxy pravidla:
```
/api  → http://localhost:8080
/ws   → ws://localhost:8080 (WebSocket)
```
Frontend v dev módu běží na `:5173`, backend na `:8080`.
V produkci FastAPI servuje statický build — jeden port.
