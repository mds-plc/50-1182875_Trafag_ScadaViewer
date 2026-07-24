# ScadaViewer — Průvodce produkčním nasazením

> Krok za krokem: od zdrojového kódu po běžící Windows službu.
> Určeno pro IT správce nebo vývojáře provádějící nasazení.
>
> Poslední aktualizace: 2026-07-24

---

## Přehled — dvě cesty nasazení

| Cesta | Kdy zvolit | Předpoklady na cílovém PC |
|-------|-----------|--------------------------|
| **A — Spustitelný soubor (exe)** | Trafag nemá IT správce pro Python; chceš předat hotový balíček | Nic (Python zabalený v exe) |
| **B — Python přímo** | Ty nebo kolega budeš spravovat a aktualizovat | Python 3.11+, pip |

Obě cesty sdílejí stejnou konfiguraci, NSSM instalaci a provozní postup.

---

## Předpoklady (build PC)

Toto je stroj, na kterém **sestavuješ balíček** (ne nutně cílový PC):

```
✅ Python 3.11+       python --version
✅ Node.js 20+        node --version
✅ pip dependencies   pip install -r 00_backend/requirements.txt
✅ npm dependencies   cd 01_frontend && npm install
```

---

## Cesta A — Sestavení exe (PyInstaller)

### Krok A1: Sestavit balíček

```bat
:: Spustit z kořene projektu jako Administrator není nutné
06_build\exe\build.bat
```

Skript provede:
1. `npm run build` → `01_frontend/dist/` (React build)
2. `pyinstaller 06_build/exe/scada.spec` → `06_build/dist/scada_viewer.exe`
3. ZIP balíček → `06_build/releases/ScadaViewer_vX.Y.Z.zip`

### Krok A2: Obsah release balíčku

```
ScadaViewer_v0.1.0.zip
├── scada_viewer.exe        ← spustitelný soubor (Python + React uvnitř)
├── Config.toml.example     ← vzor konfigurace — přejmenovat a vyplnit
├── nssm_install.bat        ← instalátor Windows služby
└── 03_output/logs/         ← složka pro logy (prázdná)
```

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

## Konfigurace (společné pro obě cesty)

### Krok K1: Vytvořit `Config.toml`

Zkopírovat vzor a vyplnit produkční hodnoty:

```bat
copy Config.toml.example Config.toml
notepad Config.toml
```

Povinné položky k vyplnění:

```toml
[server]
host = "0.0.0.0"                      # přístupné z celé LAN; "127.0.0.1" = jen localhost
port = 8080
# POZOR: ["*"] povoluje přístup z LIBOVOLNÉ domény — nastavit konkrétní IP pro produkci
cors_origins = ["http://10.45.124.X:8080"]   # IP operátorských terminálů

[ads]
net_id = "X.X.X.X.1.1"               # AMS Net ID PLC runtime (zjistit v TwinCAT → System → Routes)
port   = 851                           # TwinCAT PLC runtime port (výchozí)

[data]
local_path    = "C:/apps/scada_data"  # absolutní cesta — výstupní složka DatabaseGateway
remote_path   = "\\\\10.45.124.20\\trafag_data"  # NAS UNC cesta (prázdná = remote tab nedostupný)
csv_separator = ";"
csv_encoding  = "utf-8-sig"

[auth]
# Vygenerovat NOVÉ heslo přes: python -c "import hashlib,secrets,os; ..."
# NEBO spustit aplikaci dočasně a změnit heslo přes UI (Nastavení → Účet)
password_hash = "pbkdf2_hmac$sha256$..."
```

### Krok K2: Nastavit heslo

Při prvním nasazení změnit výchozí heslo přes webové rozhraní:

1. Spustit aplikaci dočasně: `scada_viewer.exe --config Config.toml`
2. Otevřít `http://localhost:8080`
3. Přihlásit se výchozím heslem
4. Nastavení → Účet → Změnit heslo
5. Zastavit aplikaci (Ctrl+C) — Config.toml je aktualizován

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

### Krok N3: Ověřit službu

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

Aplikace dostupná na: `http://localhost:8080`

---

## HTTPS (volitelné, doporučeno)

### Varianta 1 — LAN-only bez HTTPS *(pro izolovanou průmyslovou síť)*

Akceptovatelné pokud:
- Přístup POUZE z interní LAN Trafag
- Síť segmentována od internetu (VLAN)
- Operátoři se přihlašují z terminálu ve stejné síti

Zdokumentovat vědomé rozhodnutí: datum, kdo schválil, podmínky.

### Varianta 2 — Caddy reverse proxy *(doporučeno)*

[Caddy](https://caddyserver.com) — jeden exe, automatický self-signed certifikát.

```bat
:: Stáhnout caddy.exe z caddyserver.com → umístit do C:\apps\Caddy\

:: Caddyfile (C:\apps\Caddy\Caddyfile)
:443 {
    tls internal              # self-signed; nebo: tls email@trafag.com (Let's Encrypt)
    reverse_proxy localhost:8080
}
```

```bat
:: Spustit Caddy jako Windows službu
nssm install Caddy "C:\apps\Caddy\caddy.exe"
nssm set     Caddy AppParameters "run --config C:\apps\Caddy\Caddyfile"
nssm start   Caddy
```

Po nasazení Caddy:
- Aktualizovat `Config.toml`: `cors_origins = ["https://10.45.124.X"]`
- Otevřít port 443 v firewallu (místo 8080)
- Operátoři přistupují na `https://10.45.124.X`

---

## Firewall

Otevřít port pro přístup z LAN:

```bat
:: Cesta A/B bez HTTPS — port 8080
netsh advfirewall firewall add rule ^
  name="ScadaViewer" ^
  dir=in action=allow protocol=TCP localport=8080

:: S Caddy (HTTPS) — port 443
netsh advfirewall firewall add rule ^
  name="ScadaViewer HTTPS" ^
  dir=in action=allow protocol=TCP localport=443
```

---

## Ověřovací checklist po nasazení

### Základní funkce

- [ ] `http://localhost:8080` (nebo HTTPS URL) se otevře → zobrazí login
- [ ] Přihlášení s produkčním heslem funguje
- [ ] Stránka Overview se načte (i bez ADS — zobrazí "offline" stav)
- [ ] Stránka Database zobrazí CSV soubory ze `local_path`

### ADS (PLC připojení)

- [ ] TwinCAT ADS router běží na cílovém PC (`TwinCAT\3.1\Runtimes\...`)
- [ ] Správný `net_id` v Config.toml (zkontrolovat v TwinCAT → System → Routes)
- [ ] Po startu aplikace se Overview zobrazí live hodnoty (zelený ADS indikátor)
- [ ] `/api/health` vrátí `"checks": {"ads": true}` po připojení

### NAS / vzdálené úložiště

- [ ] `\\remote_path\` je přístupné z cílového PC (`net use \\10.45.124.20\trafag_data`)
- [ ] Database stránka → záložka Remote zobrazí CSV soubory z NAS

### Provozní test

- [ ] Zastavit a spustit Windows službu → aplikace se restartuje
- [ ] Zkusit přistoupit z operátorského terminálu (jiné PC v síti)
- [ ] Ověřit logy v `03_output\logs\nssm_stdout.log`

---

## Provoz a správa

### Aktualizace aplikace

**Cesta A (exe):**
```bat
nssm stop ScadaViewer
:: Přepsat scada_viewer.exe novou verzí
:: Config.toml PONECHAT (obsahuje heslo a produkční nastavení)
nssm start ScadaViewer
```

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

Log rotace: automatická při 10 MB (NSSM `AppRotateBytes`).

JSON log — ukázka záznamu:
```json
{"ts": "2026-07-24T10:23:44+02:00", "level": "INFO", "mod": "scada.app", "msg": "[APP]   ScadaViewer start"}
{"ts": "2026-07-24T10:23:45+02:00", "level": "INFO", "mod": "scada.services.ads_monitor", "msg": "[ADS]   připojen k PLC 5.80.201.232.1.1"}
```

### Zdravotní stav (monitoring)

```
GET http://localhost:8080/api/health

Odpověď:
{
  "status":  "ok",           ← "degraded" pokud local_path neexistuje
  "version": "0.1.0",
  "checks": {
    "local_storage": true,   ← false = local_path nenalezena
    "ads":           true    ← false = ADS odpojeno
  }
}
```

NSSM watchdog je nastaven na volání `/api/health` — aplikace se automaticky restartuje
pokud nedostane HTTP 200 odpověď.

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
- `Config.toml` chybí nebo má chybnou syntaxi → `KeyError: ...`
- `local_path` neexistuje → varování v logu, aplikace běží v "degraded" režimu
- Port 8080 obsazen → `OSError: [Errno 98] Address already in use`

### ADS se nepřipojí

```bat
:: Ověřit TwinCAT runtime
sc query TcSystemService

:: Ověřit ADS dostupnost (z příkazové řádky PLC stroje)
ping 127.0.0.1        ← loopback musí fungovat

:: Zkontrolovat net_id v Config.toml
:: TwinCAT → System → Routes → Local Net ID
```

Typické příčiny:
- Špatný `net_id` v Config.toml
- TwinCAT runtime není v RUN módu
- Firewall blokuje ADS port (TCP 48898)

### NAS není dostupný

```bat
:: Test přístupu na NAS
net use \\10.45.124.20\trafag_data /user:guest

:: Pokud NAS nedostupný — Database Remote záložka zobrazí "nedostupné"
:: Aplikace dále funguje (local záložka není ovlivněna)
```

### Zapomenuté heslo

```bat
:: V Config.toml smazat řádek password_hash nebo nastavit výchozí
:: Výchozí heslo je v Config.toml.example (komentář)
:: Spustit aplikaci, přihlásit se výchozím heslem, změnit v UI
```

---

## Kontakty a zdroje

| Dokument | Popis |
|----------|-------|
| `04_docs/architecture.md` | Detailní architektura, API formáty, datový tok |
| `04_docs/roadmap.md` | Plán dodělávek a sprint backlog |
| `04_docs/audit_log.md` | Záznamy bezpečnostních auditů |
| `Config.toml.example` | Vzor produkční konfigurace s komentáři |
| `06_build/exe/nssm_install.bat` | Skript pro instalaci Windows služby |
| `06_build/docs/backend/` | API dokumentace (pdoc) — vygenerovat přes `generate-docs.bat` |
| `06_build/docs/frontend/` | Frontend dokumentace (TypeDoc) |
