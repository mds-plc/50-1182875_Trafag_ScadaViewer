# ScadaViewer — Průvodce produkčním nasazením

> Krok za krokem: od zdrojového kódu po běžící Windows službu na PC u stroje,
> včetně přístupu z kanceláře přes firemní síť a připojení k NAS.
> Určeno pro IT správce nebo vývojáře provádějící nasazení.
>
> Poslední aktualizace: 2026-09-25 (síť se dvěma síťovkami, vzdálený přístup jen pro prohlížení,
> NAS pod servisním účtem, uživatelé, omezený firewall)

---

## Obsah

1. [Přehled nasazení](#přehled--dvě-cesty-nasazení)
2. [Sestavení balíčku](#cesta-a--sestavení-exe-pyinstaller) (cesta A exe / cesta B Python)
3. [Síťová architektura](#síťová-architektura--pc-u-stroje-se-dvěma-síťovkami)
4. [Konfigurace](#konfigurace-společné-pro-obě-cesty) — `Config.toml`, uživatelé
5. [Windows služba (NSSM)](#nssm--windows-service) + servisní účet
6. [NAS](#nas--připojení-přes-firemní-síť)
7. [Vzdálený přístup z kanceláře](#vzdálený-přístup-z-kanceláře)
8. [Firewall](#firewall)
9. [HTTPS](#https-volitelné)
10. [Checklist pro IT](#checklist-pro-it--co-zajistit-před-nasazením) · [Ověřovací checklist](#ověřovací-checklist-po-nasazení)
11. [Provoz a správa](#provoz-a-správa) · [Řešení problémů](#řešení-problémů)

---

## Přehled — dvě cesty nasazení

| Cesta | Kdy zvolit | Předpoklady na cílovém PC |
|-------|-----------|--------------------------|
| **A — Spustitelný soubor (exe)** | Trafag nemá IT správce pro Python; chceš předat hotový balíček | Nic — Python i všechny knihovny (vč. numpy) jsou ve složce `_internal/` |
| **B — Python přímo** | Ty nebo kolega budeš spravovat a aktualizovat | Python 3.11+, pip |

Obě cesty sdílejí stejnou konfiguraci, NSSM instalaci a provozní postup.

---

## Předpoklady (build PC)

Toto je stroj, na kterém **sestavuješ balíček** (ne nutně cílový PC):

```
✅ Python 3.11+       python --version
✅ Node.js 20+        node --version
✅ pip dependencies   pip install -r 00_backend/requirements.txt   (vč. numpy, pyinstaller)
✅ npm dependencies   cd 01_frontend && npm install
```

> PyInstaller balí knihovny z prostředí build PC — co tam chybí, nebude ani v exe.
> numpy je volitelná (bez ní funguje pomalejší parser signálových dat), ale build ji má obsahovat.

---

## Cesta A — Sestavení exe (PyInstaller)

### Krok A1: Sestavit balíček

```bat
:: Spustit z kořene projektu jako Administrator není nutné
06_build\exe\build.bat
```

Skript provede:
1. `npm install` + `npm run build` → `01_frontend/dist/` (React build)
2. `pyinstaller 06_build/exe/scada.spec` → `06_build/dist/scada_viewer/` (**složka**: exe + `_internal/`)
3. Kopie do `06_build/releases/v<verze>_<datum>/scada_viewer/` + ZIP `v<verze>_<datum>.zip`
   (ZIP až 5 pokusů po 8 s — Windows Defender krátce drží čerstvé soubory; při selhání `[WARN]`)
   Před releasem zvednout `__version__` v `00_backend/scada/__init__.py` (+ `01_frontend/package.json`) —
   existující tag = build proběhne, ale tag ani GitHub release se nevytvoří.
4. Git tag `v<verze>` + (volitelně) GitHub release přes `gh`

### Krok A2: Obsah release balíčku

```
v2.x.x_<datum>.zip
└── scada_viewer/
    ├── scada_viewer.exe        ← spouštěč
    ├── _internal/              ← Python, knihovny (FastAPI, pyads, numpy…), React build — NUTNÉ
    ├── Config.toml.example     ← vzor konfigurace — přejmenovat a vyplnit
    ├── nssm_install.bat        ← instalátor Windows služby
    ├── kiosk_start.bat         ← kiosk: 2 obrazovky (ScadaViewer + TcHmiClient)
    ├── start.bat               ← ruční spuštění
    └── 03_output/logs/         ← složka pro logy (prázdná)
```

> ⚠️ `scada_viewer.exe` **nefunguje samostatně** — vždy přenášet celou složku včetně `_internal/`.
> Release **neobsahuje `Config.toml`** (záměrně) — při první instalaci vytvořit z `Config.toml.example`,
> při aktualizaci zůstává původní `Config.toml` i `users.toml` na cílovém PC.

### Krok A3: Přenést na cílový PC

Rozbalit ZIP do cílové složky, např. `C:\apps\ScadaViewer\`.

---

## Cesta B — Python přímo

### Krok B1: Připravit prostředí na cílovém PC

```bat
:: Nainstalovat Python 3.11+ z python.org (přidat do PATH)
python --version

:: Klonovat nebo rozbalit zdrojový kód
:: git clone https://github.com/mds-plc/50-1182875_Trafag_ScadaViewer.git C:\apps\ScadaViewer
cd C:\apps\ScadaViewer

:: Závislosti
pip install -r 00_backend\requirements.txt
```

### Krok B2: Sestavit frontend (na build PC nebo cílovém PC pokud má Node.js)

```bat
cd 01_frontend
npm install
npm run build
cd ..
```

Výsledek: `01_frontend/dist/` — React aplikace jako statické soubory.
FastAPI je automaticky servíruje (detekce `01_frontend/dist/` v `app.py`).

---

## Síťová architektura — PC u stroje se dvěma síťovkami

```
                        ┌──────────────────────── PC u stroje ────────────────────────┐
                        │                                                              │
 Síť stroje ── síťovka 1│  ScadaViewer server  :8080  (host = "0.0.0.0" → všechny karty)│
 192.168.1.x (PLC)      │        ▲                                                     │
                        │        │  http://localhost:8080                              │
                        │  Hlavní klient (kiosk_start.bat)          DatabaseGateway    │
                        │                                                  │           │
 Firemní síť ─ síťovka 2│──────────────────────────────────────────────────┼───────────│
 10.40.84.x (DHCP)      └──────────────────────────────────────────────────┼───────────┘
      ▲          ▲                                                        │ SMB (445)
      │          │                                                        ▼
 [PC v kanceláři] │  http://<IP nebo DNS jméno síťovky 2>:8080        [Synology NAS]
                  │                                                  ScadaViewer čte,
             [VPN / další PC]                                        DatabaseGateway zapisuje
```

### Jak server rozlišuje klienty

Rozhoduje **adresa, ze které spojení přichází** — ne síťová karta serveru:

| Klient | Adresa | Režim |
|--------|--------|-------|
| Hlavní klient na PC u stroje (kiosk) | `127.0.0.1` / `::1` (localhost) | **U stroje** — plná práva dle role, PLC auto-login |
| Kancelář, VPN, jiné PC ve firemní síti | např. `10.40.84.x` | **Vzdálený přístup** — přihlášení vlastním účtem, **jen prohlížení** |
| Notebook připojený do sítě stroje | např. `192.168.1.50` | **Vzdálený přístup** — stejně jako kancelář |

Seznam adres „u stroje" = `Config.toml [server] local_clients` (výchozí jen localhost).

> ⚠️ **Síť stroje do `local_clients` nepřidávat.** Kdokoli si může do sítě stroje připojit notebook
> se statickou adresou — s `192.168.1.0/24` v `local_clients` by dostal plná práva a **automatické
> přihlášení bez hesla** vždy, když je obsluha přihlášená na PLC terminálu. Totéž platí pro jednu
> konkrétní IP (statickou adresu si nastaví kdokoli). Plná práva má jen PC u stroje.

> ⚠️ Kiosk (`kiosk_start.bat`, `open_browser.bat`, `start.bat`) musí otevírat **`http://localhost:8080`**,
> ne IP adresu PC — jinak by ho server bral jako vzdálený přístup (bez PLC auto-loginu, bez mazání).

---

## Konfigurace (společné pro obě cesty)

### Krok K1: Vytvořit `Config.toml`

Zkopírovat vzor a vyplnit produkční hodnoty:

```bat
copy Config.toml.example Config.toml
notepad Config.toml
```

```toml
[server]
host = "0.0.0.0"          # naslouchat na všech síťovkách (síť stroje i firemní síť) — NEMĚNIT
port = 8080
cors_origins = ["*"]      # doporučeno při DHCP ve firemní síti (viz níže)
# local_clients = ["127.0.0.1", "::1"]   # výchozí — klíč lze vynechat; síť stroje NEPŘIDÁVAT

[ads]
net_id = "X.X.X.X.1.1"    # AMS Net ID PLC runtime (TwinCAT → System → Routes)
port   = 851              # TwinCAT PLC runtime port (výchozí)

[data]
local_path    = "C:/apps/scada_data"                 # výstupní složka DatabaseGateway (absolutní cesta)
remote_path   = "\\\\10.45.124.20\\trafag_test"      # NAS — UNC cesta, stejný share jako DatabaseGateway
csv_separator = ";"
csv_encoding  = "utf-8-sig"
local_max_gb  = 5.0       # limit lokálního úložiště [GB] — dle velikosti disku; varování ≥ 80 %, kritické ≥ 95 %
```

**`cors_origins`** — podle něj server povoluje i živé spojení (WebSocket: stav PLC, automatická
aktualizace seznamu souborů). Kontroluje se přesná adresa, kterou má uživatel v prohlížeči:

| Hodnota | Chování |
|---------|---------|
| `["*"]` ✅ | Funguje s libovolnou IP i DNS jménem — **při DHCP ve firemní síti doporučeno** |
| `["http://10.40.84.25:8080", "http://stroj-trafag.firma.local:8080"]` | Musí obsahovat **každou** adresu/jméno, přes které lidé aplikaci otevírají. Po změně IP (DHCP) přestanou vzdáleně fungovat živé aktualizace — stránka se načte, ale stav PLC a automatické obnovení ne |

Kiosk na PC u stroje (`localhost`) záznam nepotřebuje.

**Cesty:** vždy UNC (`\\server\share`), **nikdy písmeno jednotky** (`Z:\`) — služba namapované
jednotky přihlášeného uživatele nevidí. V TOML se každé `\` píše jako `\\`.

### Krok K2: Uživatelé a hesla

Uživatelé jsou v `users.toml` vedle `Config.toml` (vytvoří se automaticky při prvním uložení z UI).
Dokud `users.toml` neexistuje, platí jediný účet z `Config.toml [auth]` — **výchozí `admin` / `admin`**.

**Postup při první instalaci (na PC u stroje — správa uživatelů vzdáleně nejde):**
1. Spustit aplikaci (službu), otevřít `http://localhost:8080`, přihlásit se `admin` / `admin`
2. **Nastavení → Uživatelé** → přidat účty pro konkrétní lidi (každý vlastní jméno a heslo, žádné sdílené účty)
3. Změnit heslo účtu `admin` (Uživatelé → Změnit heslo u vlastního účtu)
4. Ověřit, že `users.toml` vznikl ve složce aplikace

| Role | U stroje | Vzdáleně |
|------|----------|----------|
| `operator` | prohlížení, export, tisk | jen prohlížení |
| `technician` | + mazání souborů | jen prohlížení |
| `admin` | + nastavení cest, limitu úložiště, správa uživatelů | jen prohlížení |
| `manufacturer` | vše | jen prohlížení |

Čištění synchronizovaných souborů (Database → Lokální úložiště) smí u stroje každý přihlášený.

> ⚠️ Před zpřístupněním z firemní sítě **musí být změněno heslo `admin`** — jinak se kdokoli
> ve firemní síti přihlásí výchozím heslem (vzdáleně sice jen prohlížení, ale k datům ano).

---

## NSSM — Windows Service

### Krok N1: Stáhnout NSSM

Stáhnout z [nssm.cc](https://nssm.cc) → rozbalit `nssm.exe` do složky aplikace
nebo do `C:\Windows\System32` (pak bude v PATH).

### Krok N2: Spustit instalátor

```bat
:: Spustit jako Administrator (pravé tlačítko → Spustit jako správce)
nssm_install.bat
```

Skript automaticky:
- Odinstaluje předchozí verzi služby (pokud existuje)
- Nainstaluje `ScadaViewer` jako Windows službu s auto-start
- Nakonfiguruje log soubory a rotaci (10 MB)
- Spustí službu

### Krok N3: Servisní účet (kvůli přístupu k NAS)

`nssm_install.bat` službu spouští pod účtem **LocalSystem**. Windows si ale přihlašovací údaje k NAS
pamatuje **pro každý účet zvlášť** — pod LocalSystem se ScadaViewer k NAS spolehlivě nepřihlásí
(„přibere" jen připojení, které udělal DatabaseGateway, a po restartu záleží na pořadí startu).
DatabaseGateway má ve svém návodu stejný požadavek (`DatabaseGateway/04_docs/deployment.md` —
služba pod uživatelským účtem kvůli přístupu k síti).

**Doporučeno:** obě služby (ScadaViewer i DatabaseGateway) pod **jedním** servisním účtem Windows
a s **jedním** účtem na NAS — tím, který má DatabaseGateway v `Config.toml [server] username / password`:

```bat
:: 1. Vytvořit lokální účet (jako Administrator) — heslo bez expirace
net user svc_trafag <SILNE_HESLO> /add /passwordchg:no
powershell -Command "Set-LocalUser -Name svc_trafag -PasswordNeverExpires $true"

:: 2. Služby spouštět pod tímto účtem (NSSM udělí právo „Přihlásit se jako služba")
nssm set ScadaViewer     ObjectName .\svc_trafag <SILNE_HESLO>
nssm set DatabaseGateway ObjectName .\svc_trafag <SILNE_HESLO>

:: 3. Uložit údaje k NAS do Správce přihlašovacích údajů TOHOTO účtu (jednorázově)
::    = STEJNÝ host, jméno a heslo jako DatabaseGateway [server] host / username / password
runas /user:.\svc_trafag "cmdkey /add:10.45.124.20 /user:<username z DatabaseGateway> /pass:<password z DatabaseGateway>"

:: 4. Restart služeb
nssm restart DatabaseGateway
nssm restart ScadaViewer
```

> ⚠️ **Pro NAS vždy stejné přihlašovací údaje v obou aplikacích.** Windows nedovolí jednomu
> uživateli připojit se ke stejnému serveru dvěma různými účty — druhé připojení skončí chybou
> **1219** („Více připojení k serveru… jedním uživatelem s více uživatelskými jmény není povoleno").
> Proto nelze mít pro ScadaViewer zvláštní účet jen pro čtení, pokud obě služby běží pod stejným
> účtem Windows. ScadaViewer na NAS stejně nikdy nezapisuje (hlídá kód, ne práva na NAS).
>
> S uloženým `cmdkey` lze v DatabaseGateway ponechat `[server] host / username / password`
> (jeho `net use` použije stejné údaje — nevadí), nebo `host` vyprázdnit — pak se DatabaseGateway
> automaticky nepřipojuje a použije údaje z `cmdkey`, a heslo k NAS nemusí ležet v jeho `Config.toml`.

Pokud služba po změně účtu nenaběhne s chybou **1069** (selhání přihlášení), účtu chybí právo
„Přihlásit se jako služba": `secpol.msc` → Místní zásady → Přiřazení uživatelských práv →
Přihlásit se jako služba → přidat `svc_trafag` (nebo nastavit účet přes `services.msc` → Vlastnosti →
Přihlášení, které právo udělí samo).

Účet `svc_trafag` potřebuje:
- **zápis** do složky aplikace (`03_output\logs`, `03_output\cache`, `Config.toml`, `users.toml`)
- **čtení** složky `local_path` + **zápis** do ní kvůli mazání a čištění (ScadaViewer) / zápisu CSV (DatabaseGateway)

> Alternativa bez servisního účtu: služba zůstane pod LocalSystem a údaje k NAS se uloží do
> Správce přihlašovacích údajů účtu SYSTEM (`psexec -s cmdkey /add:…` — nástroj PsExec od Microsoftu).
> Funguje, ale hůř se spravuje; servisní účet je přehlednější.

### Krok N4: Ověřit službu

```bat
:: Stav
nssm status ScadaViewer

:: Logy
type 03_output\logs\nssm_stdout.log

:: Správa
nssm start   ScadaViewer
nssm stop    ScadaViewer
nssm restart ScadaViewer
```

Aplikace dostupná na: `http://localhost:8080` (u stroje) a `http://<IP/DNS síťovky 2>:8080` (z kanceláře).

---

## NAS — připojení přes firemní síť

> Nastavení NAS je **společné s DatabaseGateway** — ten na NAS zapisuje, ScadaViewer z něj jen čte.
> Hodnoty přebírat z `DatabaseGateway/Config.toml [server]`, ne vymýšlet zvlášť.

| Aplikace | Přístup k NAS |
|----------|---------------|
| **DatabaseGateway** | **zápis** — nahrává uzavřené zakázky (`done_local/` → NAS → `done_remote/`); na NAS nejdřív `*.part`, po dokončení přejmenuje na finální název |
| **ScadaViewer** | **jen čtení** — záložka Vzdálená, kontrola dostupnosti NAS, ověření souborů před čištěním lokálního úložiště. Na NAS nikdy nezapisuje ani nemaže; soubory `*.part` (rozpracovaný upload) ignoruje |

Uživatelé v kanceláři přístup k NAS **nepotřebují** — záložku Vzdálená jim zobrazí server.

### Mapování konfigurace DatabaseGateway → ScadaViewer

| DatabaseGateway `Config.toml [server]` | Aktuální hodnota | ScadaViewer `Config.toml` |
|----------------------------------------|------------------|---------------------------|
| `host` + `share` | `10.45.124.20` + `trafag_test` | `[data] remote_path = "\\\\10.45.124.20\\trafag_test"` |
| `production_path` | `\\10.45.124.20\trafag_test\Production` | odvozeno: `{remote_path}\production` |
| `testing_path` | `\\10.45.124.20\trafag_test\Testing` | odvozeno: `{remote_path}\testing` |
| `username` / `password` | účet na NAS (čtení + zápis) | **stejný účet** — přes `cmdkey` pro servisní účet (Krok N3) |

Pravidla, aby obě aplikace pracovaly se stejnými soubory:
- `production_path` a `testing_path` DatabaseGateway musí ležet **přímo v `remote_path`** a jmenovat se
  `Production` / `Testing` (velikost písmen nevadí — SMB ji nerozlišuje). Pokud se v DatabaseGateway
  změní umístění nebo název složek, ScadaViewer je nenajde — `remote_path` upravit současně.
- **Adresu NAS psát v obou konfiguracích stejně** (obě IP, nebo obě DNS jméno) — Windows bere IP
  a jméno jako dva různé servery.
- Složky `Production` a `Testing` musí na NAS **existovat předem** (DatabaseGateway je nezakládá).

### Požadavky

| Oblast | Požadavek |
|--------|-----------|
| Síť | Z PC u stroje (firemní síťovka) na NAS **TCP 445** (SMB); při oddělených VLAN povolit u IT |
| Adresa NAS | Pevná IP nebo DNS jméno — stejná v obou aplikacích |
| Účet na NAS | **Jeden společný** s právy čtení + zápis do `Production` a `Testing` (zapisuje DatabaseGateway) |
| Protokol | SMB2 / SMB3 (výchozí na Synology); SMB1 Windows nepoužívají |
| Přihlášení | Obě služby pod servisním účtem + `cmdkey` — viz [Krok N3](#krok-n3-servisní-účet-kvůli-přístupu-k-nas) |

### Ověření (pod servisním účtem)

```bat
runas /user:.\svc_trafag "cmd /k dir \\10.45.124.20\trafag_test\Production && dir \\10.45.124.20\trafag_test\Testing"
```

- DatabaseGateway: v logu `[SYNC]` bez chyb, uzavřená zakázka se přesune do `done_remote/`
- ScadaViewer: Nastavení → Připojení → „NAS / vzdálené úložiště: Dostupný"; Database → záložka
  Vzdálená má zelenou tečku a zobrazí stejné soubory, jaké jsou na NAS v `Production` / `Testing`
- Při výpadku NAS běží obě aplikace dál: DatabaseGateway nahraje soubory po obnovení spojení,
  ScadaViewer hlásí nedostupnost v záložce Vzdálená

---

## Vzdálený přístup z kanceláře

### Jak funguje

- Kdokoli, kdo se síťově dostane na port 8080 PC u stroje, uvidí **přihlašovací obrazovku** —
  **o přístupu rozhodují účty** (`users.toml`).
- Vzdáleně: přihlášení **jen jménem a heslem** (PLC auto-login funguje jen u stroje), **jen prohlížení** —
  procházení dat, grafy, export CSV/XLSX, tisk. Mazání, čištění úložiště, změny nastavení a správu
  uživatelů server vzdáleně odmítne (HTTP 403) a UI tyto ovládací prvky skryje.
  V topbaru svítí „Vzdálený přístup · jen prohlížení".
- Uživatel v kanceláři otevírá `http://<IP nebo DNS jméno síťovky 2>:8080`.

### DHCP ve firemní síti

| Co | Vadí? | Řešení |
|----|-------|--------|
| DHCP u **PC v kanceláři** | ne | Server kancelářské adresy nerozlišuje (vše mimo localhost = vzdálený přístup) |
| DHCP u **PC u stroje** (síťovka 2) | **ano** — změní se adresa, kterou lidé otevírají | 1. **DNS jméno** (`http://stroj-trafag.firma.local:8080`), 2. **rezervace v DHCP** (IT přidělí podle MAC vždy stejnou IP), 3. pevná IP |

S `cors_origins = ["*"]` nemá změna IP vliv na živé aktualizace; s konkrétním seznamem ano (viz K1).

### Síťová nastavení PC u stroje

- **Výchozí brána** jen na firemní síťovce (10.40.84.x), na síťovce stroje (192.168.1.x) **ne** —
  jinak může Windows posílat provoz špatnou kartou.
- Ověřit s IT, že rozsah sítě stroje (192.168.1.x) **nekoliduje** s žádnou podsítí firmy.
- Profil sítě firemní síťovky (Doména / Soukromá / Veřejná) — pravidlo firewallu musí platit pro něj.

### Firemní proxy

Pokud prohlížeče v kanceláři používají proxy, musí být adresa (nebo DNS jméno) PC u stroje ve
**výjimkách proxy** — jinak se požadavek pokusí jít přes proxy a neprojde.

### Zabezpečení — vědomá rozhodnutí

| Téma | Stav | Poznámka |
|------|------|----------|
| Šifrování (HTTPS) | ❌ zatím ne | Hesla jdou firemní sítí nešifrovaně — odsouhlasit s IT |
| Živý stav PLC (`/ws/plc`) | bez přihlášení | Mód stroje, zakázka, boxy — přijaté riziko pro firemní síť (audit M14) |
| Výchozí heslo `admin` | **musí se změnit** | viz K2 |

---

## Firewall

Port 8080 povolit **jen z firemní sítě** (ne ze sítě stroje, pokud tam přístup nepotřebujete).
Kiosk na PC u stroje jde přes localhost a firewall ho neovlivní.

```bat
:: Spustit jako Administrator — rozsah upravit dle firemní sítě (s IT)
netsh advfirewall firewall add rule ^
  name="ScadaViewer (firemni sit)" ^
  dir=in action=allow protocol=TCP localport=8080 ^
  remoteip=10.40.0.0/16 profile=any

:: Kontrola
netsh advfirewall firewall show rule name="ScadaViewer (firemni sit)"
```

> Bez parametru `remoteip` by byl port otevřený ze všech sítí včetně sítě stroje
> (přihlašovací obrazovka dosažitelná z notebooku připojeného ke stroji).

S HTTPS přes reverzní proxy (viz níže) místo 8080 povolit 443.

---

## HTTPS (volitelné)

### Varianta 1 — bez HTTPS *(aktuální rozhodnutí)*

Akceptovatelné pokud:
- přístup POUZE z interní sítě Trafag (bez přístupu z internetu)
- síť segmentována od internetu
- rozhodnutí zdokumentováno: datum, kdo schválil, podmínky

### Varianta 2 — Caddy reverse proxy

> ⚠️ **Nelze použít beze změny aplikace, pokud Caddy běží na stejném PC.** Server by pak viděl
> všechny klienty (i kancelář) jako `localhost` → **vzdálení uživatelé by dostali plná práva
> a PLC auto-login**. Před nasazením HTTPS je nutné aplikaci doplnit o předávání adresy klienta
> z proxy (hlavička `X-Forwarded-For` jen od důvěryhodné proxy) — samostatný úkol.

[Caddy](https://caddyserver.com) — jeden exe, automatický self-signed certifikát:

```
:: Caddyfile (C:\apps\Caddy\Caddyfile)
:443 {
    tls internal              # self-signed; nebo firemní certifikát od IT
    reverse_proxy localhost:8080
}
```

```bat
nssm install Caddy "C:\apps\Caddy\caddy.exe"
nssm set     Caddy AppParameters "run --config C:\apps\Caddy\Caddyfile"
nssm start   Caddy
```

---

## Checklist pro IT — co zajistit před nasazením

- [ ] **Pevná adresa PC u stroje ve firemní síti** — DNS jméno, nebo rezervace v DHCP, nebo pevná IP
- [ ] **Kancelář → PC u stroje:** průchod na TCP **8080** (VLAN / směrování)
- [ ] **PC u stroje → NAS:** průchod na TCP **445**
- [ ] **Účet na NAS** (jeden společný pro DatabaseGateway i ScadaViewer, čtení + zápis do `Production` / `Testing`)
- [ ] **Výjimka v proxy** prohlížečů pro adresu PC u stroje
- [ ] **Rozsah firemní sítě** pro pravidlo firewallu (`remoteip=…`)
- [ ] Rozsah sítě stroje (192.168.1.x) nekoliduje s firemními podsítěmi
- [ ] Schválení provozu **bez HTTPS** ve firemní síti (nebo zadání certifikátu)

---

## Ověřovací checklist po nasazení

### Základní funkce (na PC u stroje)

- [ ] `http://localhost:8080` se otevře → přihlašovací obrazovka s „Čekám na přihlášení operátora na PLC terminálu…"
- [ ] Přihlášení produkčním účtem funguje; heslo `admin` je změněné, `users.toml` existuje
- [ ] Database zobrazí CSV soubory z `local_path` (záložky Production / Testing)
- [ ] Detail zakázky: Rozložení kategorií / Časový průběh; detail záznamu; Testing detail se Signal Data
- [ ] Tisk (tlačítko nebo Ctrl+P) — protokol obsahuje tabulky i grafy Signal Data

### ADS (PLC)

- [ ] V topbaru „PLC připojeno"; `/api/health` → `"checks": {"ads": true}`
- [ ] Přihlášení obsluhy na PLC terminálu → aplikace u stroje se přihlásí automaticky

### NAS a lokální úložiště

- [ ] Nastavení → Připojení: „NAS / vzdálené úložiště: Dostupný"
- [ ] Database → záložka Vzdálená zobrazí soubory z NAS (i po restartu PC — služby pod servisním účtem)
- [ ] Ukazatel „Lokální úložiště" v hlavičce Database odpovídá `local_max_gb` (nastavit dle disku)
- [ ] „Vyčistit synchronizované" smaže jen soubory ověřené na NAS

### Vzdálený přístup (z PC v kanceláři)

- [ ] `http://<IP/DNS síťovky 2>:8080` se otevře → přihlašovací obrazovka „Vzdálený přístup — přihlaste se svým účtem"
- [ ] Po přihlášení v topbaru „Vzdálený přístup · jen prohlížení" a jméno uživatele
- [ ] Nejsou vidět tlačítka mazání ani koš u úložiště; Nastavení jen pro čtení, bez záložky Uživatelé
- [ ] Živé aktualizace fungují (stav PLC v topbaru, nový soubor se objeví sám) — jinak zkontrolovat `cors_origins`
- [ ] PLC auto-login se v kanceláři **nespustí**, i když je obsluha přihlášená na terminálu
- [ ] Z notebooku v síti stroje (192.168.1.x) se chová stejně jako kancelář, nebo je blokován firewallem

### Provozní test

- [ ] Restart PC → obě služby naběhnou samy, kiosk se otevře, NAS dostupný
- [ ] Ověřit logy v `03_output\logs\nssm_stdout.log`

---

## Provoz a správa

### Aktualizace aplikace

**Cesta A (exe):** na cílovém PC se nic neinstaluje — jen se vymění soubory.
```bat
nssm stop ScadaViewer
:: 1. Zálohovat Config.toml a users.toml (produkční nastavení, hesla uživatelů)
:: 2. Nahradit CELÝ obsah složky novou verzí — scada_viewer.exe I _internal\
::    (samotné exe se starým _internal\ nefunguje)
:: 3. Config.toml a users.toml z nové verze NEKOPÍROVAT / vrátit ze zálohy
nssm start ScadaViewer
```
Ověřit `http://localhost:8080/api/health`. Prohlížeč si nové JS/CSS načte sám (soubory mají hash
v názvu); `index.html` se revaliduje při každém načtení. Servisní účet služby se aktualizací nemění.

**Cesta B (Python):**
```bat
nssm stop ScadaViewer
git pull
pip install -r 00_backend\requirements.txt  # pouze pokud přibyly závislosti
cd 01_frontend && npm run build && cd ..    # rebuild frontendu
nssm start ScadaViewer
```

### Logy

```
03_output\logs\nssm_stdout.log    ← aplikační výstup (JSON strukturovaný)
03_output\logs\nssm_stderr.log    ← chybový výstup
```

Log rotace: automatická při 10 MB (NSSM `AppRotateBytes`). Odmítnuté vzdálené zápisy se logují
jako `[AUTH]  vzdálený zápis odmítnut: … z <IP>`.

JSON log — ukázka záznamu:
```json
{"ts": "2026-07-24T10:23:44+02:00", "level": "INFO", "mod": "scada.app", "msg": "[APP]   ScadaViewer start"}
{"ts": "2026-07-24T10:23:45+02:00", "level": "INFO", "mod": "scada.services.ads_monitor", "msg": "[ADS]   připojen k PLC 5.80.201.232.1.1"}
```

### Zdravotní stav (monitoring)

```
GET http://localhost:8080/api/health

{
  "status":  "ok",           ← "degraded" pokud local_path neexistuje
  "version": "2.x.x",
  "checks": {
    "local_storage": true,   ← false = local_path nenalezena
    "ads":           true    ← false = ADS odpojeno
  }
}
```

Endpoint vrací vždy HTTP 200 a je určen pro externí monitoring. NSSM restartuje službu, pokud
proces skončí; stav `/api/health` sám nekontroluje.

---

## Řešení problémů

### Aplikace nefunguje po startu

```bat
:: Zkontrolovat chybový log
type 03_output\logs\nssm_stderr.log

:: Spustit ručně pro okamžitý výpis chyb
scada_viewer.exe --config Config.toml
```

Typické příčiny:
- `Config.toml` chybí nebo má chybnou syntaxi (např. `\` místo `\\` v cestě) → chyba při startu v logu
- `[server] local_clients` obsahuje neplatnou položku → `ValueError: [server] local_clients: …`
- `local_path` neexistuje → aplikace běží v režimu „degraded"
- Port 8080 obsazen → `[WinError 10048]` (jiná aplikace nebo druhá instance)

### ADS se nepřipojí

```bat
sc query TcSystemService       :: TwinCAT runtime běží?
:: TwinCAT → System → Routes → Local Net ID = [ads] net_id v Config.toml
```

Typické příčiny: špatný `net_id`, TwinCAT runtime není v RUN, firewall blokuje ADS (TCP 48898).

### NAS není dostupný

```bat
:: Test pod účtem služby (ne pod přihlášeným uživatelem!)
runas /user:.\svc_trafag "cmd /k dir \\10.45.124.20\trafag_test"

:: Uložené údaje k NAS pro servisní účet
runas /user:.\svc_trafag "cmd /k cmdkey /list"
```

Typické příčiny:
- Služba běží pod LocalSystem místo servisního účtu → viz Krok N3
- Chybí `cmdkey` záznam pro servisní účet / změnilo se heslo účtu na NAS
- V `remote_path` je písmeno jednotky (`Z:\`) místo UNC cesty
- Firewall / VLAN blokuje TCP 445
- Chyba **1219** v logu DatabaseGateway (`net use selhalo`) → `cmdkey` a DatabaseGateway `[server]`
  mají pro NAS **jiné** jméno / heslo — sjednotit (Krok N3)
- DatabaseGateway nahrává, ale ScadaViewer v záložce Vzdálená soubory nevidí → `remote_path` neodpovídá
  `production_path` / `testing_path` DatabaseGateway (viz mapování v kapitole NAS)

Aplikace při výpadku NAS dál funguje (lokální záložka není ovlivněna).

### Vzdálený přístup nefunguje

| Příznak | Příčina / řešení |
|---------|------------------|
| Z kanceláře se stránka vůbec neotevře | Firewall na PC u stroje (pravidlo pro 8080 / `remoteip` / profil sítě), VLAN, proxy výjimka, změnila se IP (DHCP) |
| Stránka se otevře, ale nefunguje stav PLC a automatická aktualizace | `cors_origins` neobsahuje adresu, přes kterou se otevírá → nastavit `["*"]` nebo adresu doplnit |
| Vzdálený uživatel vidí mazání / Nastavení a PLC auto-login | Server ho nevidí jako vzdáleného: reverzní proxy na stejném PC (viz HTTPS) nebo jeho adresa je v `local_clients` |
| U stroje nefunguje PLC auto-login a chybí mazání | Kiosk neotevírá `http://localhost:8080`, ale IP adresu → opravit URL v `kiosk_start.bat` |

### Zapomenuté heslo

- **Běžný uživatel:** admin mu nastaví nové heslo v Nastavení → Uživatelé (na PC u stroje).
- **Admin zapomněl své heslo** (a není jiný admin / výrobce):
  1. `nssm stop ScadaViewer`
  2. Vygenerovat nový hash (na PC s Pythonem):
     ```bat
     python -c "import hashlib,secrets; s=secrets.token_hex(16); print(s+':'+hashlib.pbkdf2_hmac('sha256',b'NOVE_HESLO',bytes.fromhex(s),260000).hex())"
     ```
  3. V `users.toml` u účtu `admin` přepsat `password_hash = "…"` vygenerovanou hodnotou
  4. `nssm start ScadaViewer`

---

## Kontakty a zdroje

| Dokument | Popis |
|----------|-------|
| `04_docs/architecture.md` | Detailní architektura, API formáty, datový tok |
| `04_docs/roadmap.md` | Plán dodělávek a sprint backlog |
| `04_docs/audit_log.md` | Záznamy auditů a vědomá bezpečnostní rozhodnutí |
| `Config.toml.example` | Vzor produkční konfigurace s komentáři |
| `users.toml.example` | Vzor uživatelů a rolí |
| `06_build/exe/nssm_install.bat` | Skript pro instalaci Windows služby |
| `06_build/docs/backend/` | API dokumentace (pdoc) — vygenerovat přes `generate-docs.bat` |
| `06_build/docs/frontend/` | Frontend dokumentace (TypeDoc) |
