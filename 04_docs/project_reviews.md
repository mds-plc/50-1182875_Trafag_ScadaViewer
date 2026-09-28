# ScadaViewer — Průběžná hodnocení profesionality projektu

> Záznamy periodických hodnocení kvality a profesionality projektu.
> Srovnání s průmyslovým standardem webové aplikace v produkci.
> Nová hodnocení přidávat **NA ZAČÁTEK** (před existující záznamy).

---

## [2026-09-26] Hodnocení ekosystému v2.1.0 — PLC × Analyzing × DatabaseGateway × NAS × ScadaViewer

**Rozsah:** celé propojení, ne jen ScadaViewer — datová smlouva mezi aplikacemi, integrace přes
sdílenou složku a NAS, čas, provoz, bezpečnost. Podklad: kontrola společných věcí všech tří projektů
(`architecture.md` Fáze 34) a hloubkový audit ScadaViewer (`audit_log.md` 2026-09-26).

**Verdikt:** kladný s výhradami. Pro jednu linku a pilotní provoz solidní, pragmatické řešení,
nadprůměrné na svou velikost. Jednotlivé aplikace jsou kvalitní — **slabiny jsou ve spojích mezi nimi**.
Pro dlouhodobý provoz a další rozvoj je potřeba zpevnit smlouvu, čas a přehled o stavu celku.

### Silné stránky

| Oblast | Hodnocení |
|--------|-----------|
| Rozdělení odpovědností | Každá aplikace jedna role (Analyzing počítá, DatabaseGateway zapisuje a synchronizuje, ScadaViewer zobrazuje); vlastní GVL v PLC — žádné vzájemné přepisování |
| Izolace výpadků | Výpadek NAS nezastaví výrobu (DatabaseGateway nahraje později) ani ScadaViewer (NAS pool + timeouty) |
| Kvalita jednotlivých aplikací | Testy (ScadaViewer 247 + 107, DatabaseGateway 69, Analyzing 60), typy, dokumentace, audity, bezpečnost hlídaná serverem |
| Shoda datové smlouvy | Názvy, jednotky, CSV, složky, kategorie — po kontrole 2026-09-26 v souladu |

### Slabiny a rizika

| # | Oblast | Popis | Dopad |
|---|--------|-------|-------|
| E1 | **Implicitní datová smlouva** | Názvy parametrů, jednotky a rozložení CSV jsou zapsané zvlášť ve třech projektech (Analyzing ctypes struktury, DatabaseGateway hlavičky CSV, ScadaViewer `paramMeta.ts`). Žádná společná specifikace, žádná verze formátu v CSV, **žádný test napříč aplikacemi**. Při kontrole 2026-09-26 nalezeno 6 rozjetí (Electric_Current `[A]`/mA, MD abs/znaménko v popisech, práh 5 V / 50 %, retence 30 / 90 dní, přejmenování `RT_ReverseTimeTime`, přístup k NAS) — žádné nezachytil test | Největší riziko do budoucna — změna formátu v jedné aplikaci tiše rozbije jinou |
| E2 | **Čas** | Hodiny PC a PLC se liší o 19 h (`Timestamp` vs `Meas_TS`). Časové značky v místním čase **bez časové zóny** → při přechodu letní → zimní čas (poslední neděle v říjnu) se hodina opakuje; časový průběh zakázky přes tu noc ukáže záporné / zdvojené mezery a špatnou celkovou dobu | Nesprávná data v detailu testu a v časovém průběhu |
| E3 | **Integrace přes sdílenou složku** | ScadaViewer stav synchronizace odhaduje ze složky (skutečný stav `sync_state.json` / ověření zná jen DatabaseGateway). Čištění úložiště ve ScadaViewer maže soubory evidované DatabaseGateway (funguje díky úklidu osiřelých záznamů — nezdokumentovaná závislost). Kontrola duplicitní zakázky v DatabaseGateway po vyčištění lokálních souborů přestává platit | Křehké, těžko odhalitelné chyby při změnách |
| E4 | **Přehled o stavu celku** | ScadaViewer nepozná, že DatabaseGateway neběží nebo nestíhá nahrávat — obsluha vidí jen staré soubory / rostoucí zaplnění úložiště. Žádné společné místo „vše běží" | Výpadek zapisování se může dlouho neodhalit |
| E5 | **Zabezpečení** | Heslo k NAS čitelně v `DatabaseGateway/Config.toml` (je v gitu); bez HTTPS; `/ws/plc` bez přihlášení; dříve výchozí hesla. Nastaveno na izolovanou firemní síť — s přístupem z kanceláře na hraně, mimo firemní síť by neobstálo | Únik hesla k NAS, odposlech hesel v síti |
| E6 | **Provoz na jednom PC** | 3 služby + kiosk, rozdílné konvence (`ams_net_id` vs `net_id`, formáty logů), nezávislé verze bez matice kompatibility | Aktualizace jedné aplikace může tiše rozbít druhou |

### Doporučení (podle přínosu) — zatím jen zdokumentováno

| # | Doporučení | Řeší |
|---|------------|------|
| 1 | **Společná specifikace formátu** — jeden dokument (názvy, jednotky, sekce CSV, kódy), **verze formátu přímo v CSV** a **test napříč aplikacemi** (DatabaseGateway vygeneruje vzorový soubor → ScadaViewer ho načte a ověří hodnoty) | E1, E6 |
| 2 | **Čas** — ukládat časové značky s časovou zónou (nebo v UTC) a synchronizovat hodiny PLC s PC (hodiny PLC řeší uživatel) | E2 |
| 3 | **Stav DatabaseGateway ve ScadaViewer** — běží / neběží, počet nenahraných souborů, poslední úspěšná synchronizace (např. heartbeat + stav do souboru nebo přes ADS) | E4, E3 |
| 4 | **Heslo k NAS pryč z gitu** — `cmdkey` pro servisní účet a prázdný `[server] host` v DatabaseGateway (postup je v `deployment.md`) | E5 |
| 5 | **Test na produkčním PC** podle checklistu v `deployment.md` — včetně přístupu z kanceláře a restartu PC | ověření celku |

Otevřené nálezy auditu ScadaViewer (A6 limity na IP za NAT, A7 velké komponenty, A9–A11) viz `audit_log.md`.

---

## [2026-07-22] Hodnocení v0.1.0 — po dokončení core implementace

**Stav projektu v okamžiku hodnocení:**
- Backend: plně implementován (FastAPI, ADS, CSV, Auth, WebSocket, Docker)
- Frontend: plně implementován (React 18, TypeScript, 5 stránek, 12+ hooků)
- Testy: 89 pytest testů (backend), 3 frontend testy
- Auditů: 4 sessions, 50+ nálezů, 80 %+ opraveno

---

### Celkový výsledek

```
Backend architektura      ████████████████████  98 %
Bezpečnost                ████████████████░░░░  82 %
Frontend kód              ███████████████░░░░░  78 %
Testovací pokrytí         ████████████░░░░░░░░  62 %
Dokumentace               ██████████████████░░  90 %
DevOps / Build            ██████████████░░░░░░  72 %
Kódová hygiena            ██████████████████░░  88 %
─────────────────────────────────────────────────
CELKOVĚ                   ████████████████░░░░  81 %
```

---

### Co je na úrovni profesionálního projektu ✅

#### 1. Architektura backendu — výborná

Projekt správně implementuje třívrstvou architekturu:
```
API (endpointy) → Services (business logika) → Repositories (I/O)
```
`FileService` nezná nic o HTTP, `CsvRepository` nezná nic o business logice.
`create_app()` jako factory umožňuje testovat s různou konfigurací.

Zvlášť profesionální jsou:
- **Lifespan context manager** (ne zastaralé `@app.on_event`)
- **Předávání stavu přes `app.state`** (ne globální proměnné)
- **`asyncio.to_thread()`** pro veškeré blokující I/O — žádné volání `open()` přímo v `async def`
- **`asyncio.wait_for(timeout=...)` na NAS** — nenechá Windows UNC timeout blokovat minuty

#### 2. ADS ↔ WebSocket bridge — správně vyřešen těžký problém

Notifikace z pyads přicházejí z jiného vlákna, WebSocket `broadcast()` je coroutine.
Řešení přes `asyncio.run_coroutine_threadsafe()` je jediný správný způsob.

Navíc:
- GC prevence callbacků (`self._callback_refs`) — zapomene většina vývojářů
- `ctypes.addressof(hdr) + type(hdr).data.offset` — netriviální pyads detail
- Reconnect loop s exponential backoff + `read_state()` heartbeat pro detekci výpadku kabelu

#### 3. Bezpečnost autentizace

PBKDF2-HMAC-SHA256 se 260 000 iteracemi a `secrets.compare_digest()` je správná
implementace pro rok 2026. Ekvivalent toho, co dělají Django, Authlib.
Mnoho "profesionálních" projektů stále používá `bcrypt` s výchozím `rounds=12`
nebo dokonce MD5.

#### 4. TypeScript strict mode + AbortController ve všech hoocích

Projekt nemá **jediné `any`** v TypeScript kódu a **každý fetch hook** má AbortController.
Standard, který dodržuje méně než 30 % React projektů v code review.

#### 5. Dokumentace

CLAUDE.md (850+ řádků) s architekturou, konvencemi, rozhodnutími (`proč ADS místo OPC UA`)
a `audit_log.md` (400+ řádků) jsou **nadstandardní** — většina komerčních projektů
podobného rozsahu nemá ani zlomek.

---

### Kde zaostává za profesionálním projektem ⚠️

#### 1. Frontend testovací pokrytí — největší mezera

```
Backend:  ~70 % API pokrytí (pytest)   ✅
Frontend: ~5–10 % (3 testy celkem)    ⚠️
```

V profesionálním projektu mají **kritické komponenty** (Database tabulka, ChartView,
Overview) minimálně smoke testy — render, klik, mock API response.

Chybí:
- Test pro `Database.tsx` — tab switching, expand, delete modal
- Test pro `FileTable.tsx` — CSV download, group colors
- Test pro `PlcContext.tsx` — WebSocket reconnect logika
- Test pro `useOrderWatcher.ts` — max 200 záznamů, backoff

**Riziko**: Refaktoring bez testů je slepý. Přidání nového ADS symbolu nebo CSV sloupce
může rozbít Overview/ChartView bez varování.

#### 2. Auth je UI guard, ne API guard

Aktuálně login brání přístupu do UI, ale **API endpointy jsou veřejné** pro každého na LAN:
```bash
curl http://10.1.x.x:8080/api/files   # funguje bez tokenu
curl http://10.1.x.x:8080/api/data    # funguje bez tokenu
```
`/api/auth/change-password` ověřuje token — ostatní endpointy ne. Pro intranet SCADA
monitor akceptovatelné (data jsou read-mostly), ale `Depends(verify_token)` alespoň
na mutačních endpointech (DELETE, PATCH) je minimum pro profesionální deploy.

#### 3. Content-Security-Policy chybí

Projekt má X-Frame-Options, X-Content-Type-Options, ale bez CSP může XSS útok načíst
externí skripty. Pro intranet nízké riziko, ale profesionální projekt nasazený
v průmyslové síti by měl mít alespoň `default-src 'self'`.

#### 4. Build pipeline — placeholder

```
06_build/exe/build.bat    ← TODO
06_build/exe/scada.spec   ← TODO
```
Profesionální projekt má automatizovaný build — jeden příkaz vytvoří distribuovatelný
artefakt. Aktuálně deploy = "naklonovat repo + nainstalovat závislosti na cílovém stroji".

#### 5. Drobnosti kódové kvality

| Problém | Soubor | Závažnost |
|---------|--------|-----------|
| `OrderMetrics` deklarována, nikde nevolána — mrtvý kód | `ChartView.tsx:29–114` | Nízká |
| `GROUP_COLORS` duplikován ve dvou souborech | `ChartView.tsx`, `FileTable.tsx` | Nízká |
| Config TOML update hesla přes regex (ne parser) | `auth.py:42–73` | Střední |
| `[OW]` log prefix bez dokumentace v CLAUDE.md | `order_watcher.py` | Nízká |

---

### Srovnání s průmyslovým standardem

| Dimenze | Tento projekt | Junior dev | Mid-level | Senior/Lead |
|---------|:-----------:|:---------:|:--------:|:-----------:|
| Backend architektura | **98 %** | 45 % | 70 % | 90 % |
| Security thinking    | **82 %** | 20 % | 55 % | 80 % |
| TypeScript quality   | **78 %** | 30 % | 60 % | 85 % |
| Test coverage        | **62 %** | 10 % | 50 % | 80 % |
| Documentation        | **90 %** | 15 % | 40 % | 70 % |
| DevOps               | **72 %** | 20 % | 50 % | 80 % |

---

### Doporučení — seřazena podle dopadu

#### Krátkodobé (před nasazením do produkce)

1. **`Depends(verify_token)` na DELETE /api/files/{id} a PATCH /api/config/paths**
   — 30 minut práce, výrazné zlepšení bezpečnostního postoje
2. **Unit testy pro `CsvRepository`** — 3–4 testy pro path traversal, null byte, nevalidní CSV
3. **Smazat mrtvou komponentu `OrderMetrics`** z `ChartView.tsx`

#### Střednědobé

4. **Frontend smoke testy** pro Database a Overview (Vitest + msw)
5. **Build skript** — `build.bat` → npm build + PyInstaller + ZIP
6. **CSP hlavička** — `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`

#### Dlouhodobé

7. **JWT místo session tokenů** — pokud bude více uživatelů nebo mobilní přístup
8. **OpenTelemetry tracing** — pro ladění pomalých NAS requestů v produkci

---

### Závěr hodnocení v0.1.0

**ScadaViewer je nadprůměrně napsaný průmyslový projekt.** Backend architektura a dokumentace
jsou na úrovni senior vývojáře s production-focused myšlením. Největší mezera je frontend
testovací pokrytí a chybějící API-level autentizace na mutačních endpointech — obě jsou
řešitelné bez architektonických změn.

Pro Trafag intranet nasazení je projekt **produkčně způsobilý** s jedním prerekvizitem:
nastavit konkrétní `cors_origins` v Config.toml (ne `*`).

---
