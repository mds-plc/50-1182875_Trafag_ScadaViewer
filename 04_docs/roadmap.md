# ScadaViewer — Roadmap a plán dodělávek

> Dokument pro vývojáře. Popisuje co zbývá před nasazením do produkce a v jakém pořadí to dělat.
> Aktualizovat při každé změně stavu.
>
> Poslední aktualizace: 2026-09-24 (hloubkový audit, výkon, úklid dokumentace a kódu)

---

## Aktuální stav

| Oblast | Stav | Poznámka |
|--------|------|---------|
| Backend (FastAPI, API, ADS) | ✅ Hotovo | Viz CLAUDE.md sekce 13 |
| Frontend (všechny stránky) | ✅ Hotovo | Database (hlavní), ChartView (+ record detail, Signal Data), Settings, Info; Overview odpojen (2026-09-23), kód zachován |
| Autentizace (PBKDF2, multi-user) | ✅ Hotovo | users.toml, role, Bearer tokeny, PLC auto-login |
| Security middleware | ✅ Hotovo | CSP (SHA-256 hash), SecurityHeaders, RateLimit, CORS, WS origin |
| Build pipeline (exe) | ✅ Hotovo | `06_build/exe/build.bat` + `scada.spec` + `kiosk_start.bat` |
| NSSM installer | ✅ Hotovo | `06_build/exe/nssm_install.bat` |
| Kritický audit + opravy | ✅ Hotovo | Session TTL (8 h), sessions.clear() scope, privilege escalation — viz audit_log.md 2026-07-31 |
| Self-hosted fonty | ✅ Hotovo | @fontsource — DM Sans + DM Mono bundlovány do buildu; aplikace funguje bez internetu |
| Backend testy | ✅ Hotovo | **199 testů** (config, API, security, ADS monitor, users, výkon/cache); `pytest 02_tests/ -v` |
| Frontend testy | ✅ Hotovo | **77 testů**, 10 souborů Vitest; `npm run test` |
| Hloubkový audit 2026-09-24 | ✅ Hotovo | 28 nálezů uzavřeno (M14 přijaté riziko) — viz audit_log.md |
| Výkon | ✅ Hotovo | cache metadat + signálových dat, numpy parser, prefetch, NAS pool, gzip, code-splitting |
| Dokumentace kódu | ✅ Hotovo | Strukturované hlavičky (Účel/Zodpovědnost/Rozhraní/Napojení) + Google/TypeDoc tagy |
| Řazení sloupců (Database) | ✅ Hotovo | Klik na záhlaví → server-side sort |
| Hromadné mazání (Database) | ✅ Hotovo | Checkboxy + batch-delete endpoint + potvrzovací modal |
| XLSX export | ✅ Hotovo | Database i ChartView; SheetJS (xlsx) |
| ADS mock testy | ✅ Hotovo | `02_tests/test_ads_monitor.py` — 27 testů bez reálného PLC |
| **AnalyzedParams (ChartView)** | ⏳ Čeká | Zákaznické CSV sloupce — čeká na odpovědi od Trafag |
| **Produkční konfigurace** | ⏳ Čeká | cors_origins, Config.toml, HTTPS rozhodnutí — čeká na Trafag |
| **Test na produkčním PC** | ⏳ Čeká | exe bez Pythonu, ADS připojení, NAS přístup |

---

## Co zbývá před předáním Trafag

### 1. Odpovědi od Trafag (blokující)

Bez těchto informací nelze finalizovat nasazení:

| # | Otázka | Dopad |
|---|--------|-------|
| 1 | Jaké zákaznické sloupce (AnalyzedParams) bude production CSV obsahovat? | ChartView graf a tabulka |
| 2 | Jaká je produkční cesta k datům? (`local_path`) | Config.toml |
| 3 | Jaká je finální UNC cesta k NAS? | Config.toml `remote_path` |
| 4 | Z jakých IP/strojů bude aplikace dostupná? | `cors_origins` — teď `["*"]` |
| 5 | HTTPS potřeba (přístup přes WAN nebo více VLAN)? | Deployment architektura |
| 6 | Jaký AMS Net ID má produkční PLC runtime? | Config.toml `ads.net_id` |

### 2. AnalyzedParams — zákaznické CSV sloupce

Po obdržení odpovědí od Trafag:

- [ ] Doplnit zákaznické sloupce do grafu v `ChartView.tsx` (nebo přidat do `EXCLUDE_KEYS`)
- [ ] Rozšířit `DataTable` o nové sloupce
- [ ] Přidat překlady do `i18n/cs.ts` + `i18n/en.ts`
- [ ] Synchronizovat typy v `src/types/index.ts`

### 3. Produkční Config.toml

Vyplnit před nasazením (vzor v `Config.toml.example`):

```toml
[server]
host = "0.0.0.0"
port = 8080
cors_origins = ["http://10.45.124.X:8080"]   # konkrétní IP terminálů, ne "*"

[ads]
net_id = "X.X.X.X.1.1"   # AMS Net ID produkčního PLC runtime

[data]
local_path  = "C:/apps/scada_data"
remote_path = "\\\\10.45.124.20\\trafag"
csv_separator = ";"
csv_encoding  = "utf-8-sig"
```

### 4. HTTPS rozhodnutí

- **LAN-only bez HTTPS** — vědomé rozhodnutí, zdokumentovat v `deployment.md`
- **Caddy reverse proxy** — doporučeno pokud přístup z více VLAN nebo WAN

Viz `04_docs/deployment.md` pro detaily.

### 5. Test na produkčním PC

- [ ] Spustit `build.bat` → `ScadaViewer_vX.Y.Z.zip`
- [ ] Rozbalit a spustit `scada_viewer.exe --config Config.toml` na čistém Windows PC
- [ ] Ověřit: HTTP :8080, frontend, ADS připojení, NAS přístup, login
- [ ] Nainstalovat NSSM service (`nssm_install.bat`) a otestovat restart po pádu

---

## Definice "hotovo" pro předání Trafag

- [x] Build pipeline: `build.bat` → exe funguje *(✅ 2026-07-29)*
- [x] Security: CSP, SecurityHeaders, RateLimit, CORS, WS origin check *(✅ 2026-07-30)*
- [x] Testy: 199 backend + 77 frontend, vše zelené *(✅ 2026-09-24)*
- [x] Dokumentace kódu: strukturované hlavičky ve všech klíčových souborech *(✅ 2026-07-31)*
- [ ] AnalyzedParams: zákaznické sloupce zobrazeny dle dohody s Trafag
- [ ] Produkční Config.toml: cors_origins, ADS net_id, cesty k datům
- [ ] Test na produkčním PC: ADS připojení, NAS přístup, login, NSSM service
- [ ] HTTPS rozhodnutí zdokumentováno v `deployment.md`

---

## Nice-to-have (po předání, v dalším cyklu)

| Funkce | Náročnost | Přínos |
|--------|-----------|--------|
| Alerting (email/webhook při výpadku ADS nebo NAS) | L | Provoz |
| Vyhledávání v Database (fulltext filtr) | M | UX |
| Tmavý/světlý motiv per-user (ne per-prohlížeč) | S | UX |
| Podpora více PLC (multi-AMS) | XL | Enterprise |
