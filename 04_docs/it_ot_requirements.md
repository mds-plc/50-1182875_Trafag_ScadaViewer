# PC u stroje — podklad pro Trafag IT (směrnice IT zdrojů v prostředí OT)

> Odpověď dodavatele na směrnici *„Pořizování, uvádění do provozu a provoz IT zdrojů v prostředí OT"*
> (Trafag AG, index a, 26. 6. 2025 — koncept). Popisuje, jak PC u stroje a tři aplikace (Analyzing,
> DatabaseGateway, ScadaViewer) komunikují, pod jakými účty běží a co potřebujeme od Trafag IT.
> Stav k 2026-10-23 (vydání 2.6.1). Položky **„k ověření"** doplníme na stroji.

---

## 1. Architektura — dvě oddělené sítě, PC je jediný styčný bod

```
 Síť stroje (interní, mimo síť Trafag)                 Síť Trafag (OT VLAN)
 192.168.1.x                                           síťovka 2 (DHCP / pevná IP od IT)
 ┌───────┐  ┌───────┐  ┌──────────────┐                ┌──────────┐   ┌──────────────┐
 │  PLC  │  │  IPC  │  │ servisní     │   ┌────────┐   │   NAS    │   │ jump host /  │
 │TwinCAT│  │       │  │ router (opt.)│───│   PC   │───│ (SMB)    │   │ kancelář     │
 └───┬───┘  └───┬───┘  └──────┬───────┘   │u stroje│   └──────────┘   └──────────────┘
     └──────────┴─────────────┴───────────│        │── AD, WSUS, antivirus (řídí IT)
            síťovka 1                     └────────┘
```

- **Síť stroje** (PLC, IPC, případně switch v rozvaděči a servisní router) je interní součást stroje,
  **s sítí Trafag se fyzicky nepropojuje**. Do sítě Trafag vede jen druhá síťovka PC.
- **PC mezi sítěmi nesměruje:** IP forwarding vypnutý, bez síťového mostu, bez sdílení připojení (ICS).
  *(k ověření na stroji — kontrolu doplníme do nasazovacího skriptu)*
- MAC adresa pro IT = jen **síťovka do sítě Trafag** *(k ověření: `Get-NetAdapter`)*.

## 2. Komunikace (podklad pro firewall)

### Síťovka do sítě Trafag

| # | Směr | Odkud → kam | Port | Aplikace | Účel |
|---|------|-------------|------|----------|------|
| T1 | ven | PC → NAS | TCP 445 (SMB) | DatabaseGateway | odesílání uzavřených zakázek a testů (CSV) |
| T2 | ven | PC → NAS | TCP 445 (SMB) | ScadaViewer | čtení archivu (jen čtení) |
| T3 | dovnitř | jump host / povolená PC → PC | TCP 8080 (HTTP) | ScadaViewer | prohlížení dat v prohlížeči; **vzdáleně jen čtení**, mazání a nastavení jen přímo u stroje |
| T4 | dovnitř | jump host → PC | TCP 3389 (RDP) | Windows | servis (pokud IT povolí) |
| — | obojí | PC ↔ AD, WSUS, antivirus | dle IT | Windows | požadavky směrnice — nastavuje IT |

### Síťovka do sítě stroje (do sítě Trafag nevede)

| # | Směr | Odkud → kam | Port | Účel |
|---|------|-------------|------|------|
| M1 | obojí | PC ↔ PLC | TCP 48898 (ADS), UDP 48899 | Analyzing / DatabaseGateway / ScadaViewer ↔ TwinCAT PLC |
| M2 | dovnitř | IPC → PC | UDP 123 (NTP) | PC je zdroj času pro IPC stroje |
| M3 | dovnitř | servisní router → PC | TCP 3389, TCP 8080 | vzdálená správa dodavatele (volitelně, viz bod 6) |
| — | lokálně | PC → PC (localhost) | TCP 8080, 1010 | kiosk: ScadaViewer + TwinCAT HMI — firewall se netýká |

Pravidla firewallu omezujeme **podle síťovky i podle vzdálené adresy** (příchozí jen uvedené porty
z uvedených adres). Aplikace nepotřebuje internet.

## 3. Účty Windows

| Účel | Dnes | Navrhujeme (směrnice 3.1, 3.3) | Potřebujeme od IT |
|------|------|-------------------------------|-------------------|
| Obsluha / kiosk | lokální `admin` (slabé heslo), automatické přihlášení | **doménový kiosk účet bez práv správce**, automatické přihlášení | účet + **výjimka z automatického odhlášení / zámku obrazovky** (kiosk běží trvale, obsluha se přihlašuje na PLC terminálu) |
| Služby (3 aplikace) | LocalSystem *(k ověření — vypisuje `deploy.ps1`)* | **servisní účet** (doménový nebo lokální bez interaktivního přihlášení) | účet; práva: *Přihlásit se jako služba*, *Změna systémového času* (NTP server), zápis do `C:\apps\…` (logy, data); přístup na NAS (bod 4) |
| Servis / nasazení nových verzí | lokální `admin` | lokální admin **se silným heslem v 1Password Trafag**, použití jen se souhlasem IT — nebo doménový servisní účet s dočasnými právy | rozhodnutí IT, kdo spouští nasazení (`deploy.bat` potřebuje práva správce) |
| Ostatní lokální účty | k ověření | vypnout | — |

**Okamžitě (dodavatel):** změna hesla účtu `admin` na silné a předání IT; aplikace přesunuty
z `C:\Users\admin\Desktop` do `C:\apps` (nasazovací skript, práva: Administrators + SYSTEM plná,
účty služeb zápis, **běžní uživatelé bez přístupu** — Config.toml obsahuje heslo k NAS a hash admina) — nezávisí
už na profilu účtu admin. Servisní účet nastavený před nasazením dostane zápis automaticky, později přidaný
ručně: `icacls C:\apps /grant "<účet>:(OI)(CI)M"`.

**Přihlášení do aplikace ScadaViewer** (role operátor / technik / admin) je samostatné od Windows — účty
v `users.toml`, hesla PBKDF2, zámek po 5 chybných pokusech, relace 8 h. Výchozí heslo správce aplikace
před předáním změníme.

## 4. NAS

- Jeden účet na NAS pro DatabaseGateway (zápis) i ScadaViewer (čtení) — Windows nedovolí jednomu účtu
  dvě různá přihlášení ke stejnému serveru (chyba 1219).
- Dnes lokální účet NAS uložený v konfiguraci Gateway / Správci přihlašovacích údajů.
  **Otázka pro IT:** doménový servisní účet s právy na sdílenou složku? Pak služby poběží pod ním a heslo
  k NAS nebude v konfiguraci.

## 5. Software (whitelist, směrnice 3.5)

| Software | Výrobce | Podpis | Poznámka |
|----------|---------|--------|----------|
| TwinCAT 3 (runtime, ADS router, HMI server) | Beckhoff | ano | řízení stroje |
| Analyzing (`ads_analyzer.exe`) | dodavatel | **ne** | vyhodnocení měření, služba |
| DatabaseGateway (`db_gateway.exe`) | dodavatel | **ne** | ukládání dat → NAS, služba |
| ScadaViewer (`scada_viewer.exe`) | dodavatel | **ne** | webová vizualizace, služba |
| NSSM | open source | **ne** | spouštění aplikací jako služeb Windows |
| Google Chrome | Google | ano | **jen kiosk** — otevírá pouze `localhost` (ScadaViewer, TwinCAT HMI); nutný pro obsluhu |

- Aplikace dodavatele jsou sestavené PyInstallerem (Python + knihovny uvnitř), bez instalace, bez internetu.
  **Otázka pro IT:** stačí výjimka / whitelist podle cesty a hashe, nebo vyžadujete podpis kódu (certifikát)?
- Instalační balíčky všech verzí archivujeme (`06_build/releases`), nasazení skriptem s rollbackem.
- Aktualizace: bezpečnostní kontrola závislostí při každém vydání (`npm audit`, pevné verze knihoven);
  nové verze nasazujeme po dohodě s IT a provozem.
- **Antivirus:** prosíme výjimku pro skenování za běhu na složku lokální databáze (`C:\Data\DtbLoc` — nasazovací skript
  ji tam přesune z profilu admin; dosud `C:\Users\admin\Desktop\DtbLoc`) —
  aplikace průběžně zapisují a přesouvají CSV soubory; zámek skeneru dokáže zápis zdržet.

## 6. Vzdálená správa dodavatele (volitelné)

Servisní router (LTE / VPN) by byl **jen v síti stroje**. Dostane se na PLC / IPC a na PC (RDP, ScadaViewer
jen ke čtení), **do sítě Trafag ne** — PC nesměruje (bod 1). Směrnice 3.4 požaduje přístup přes jump hosty
Trafag → **ke schválení IT**; navrhujeme: router fyzicky vypínatelný / aktivovaný jen na vyžádání, přístupy
logované.

## 7. Body směrnice — stav

| Bod | Požadavek | Stav | Kdo |
|-----|-----------|------|-----|
| 3.1 | Windows 10 IoT LTSC 2021 / Windows 11 IoT LTSC | k ověření na stroji | dodavatel PC / IT |
| 3.1 | nepotřebné služby (Wi-Fi, Bluetooth), autorun vypnuté, Secure Boot | k ověření | dodavatel PC / IT |
| 3.1 | lokální správce / účet Administrator vypnutý | dnes používán `admin` → plán v bodě 3 | dodavatel + IT |
| 3.1 | jen podepsané ovladače a software | aplikace dodavatele + NSSM nepodepsané → výjimka nebo podpis | IT rozhodne |
| 3.1 | antivirus dle Trafag | instaluje IT; prosíme výjimku bod 5 | IT |
| 3.1 | jen určený účel, žádný e-mail / internet | splněno — kiosk jen `localhost` | — |
| 3.2 | aktualizace přes WSUS, testované, řídí IT | řídí IT; aplikace nevyžadují internet | IT |
| 3.2 | komponenty aktuální po dobu provozu | vydání s kontrolou závislostí, nasazovací skript | dodavatel |
| 3.3 | doména, GPO, doménoví uživatelé bez práv správce | plán v bodě 3 | IT |
| 3.3 | složitost hesla, automatické odhlášení | výjimka pro kiosk účet (bod 3) | IT |
| 3.3 | lokální admin nahlášen, heslo v 1Password | po změně hesla předáme | dodavatel |
| 3.3 | přístup lokálními účty auditován | Windows audit — GPO | IT |
| 3.4 | OT VLAN, MAC adresa nahlášena | síťovka do sítě Trafag — MAC dodáme | dodavatel |
| 3.4 | jen switche Trafag / NAC | síť stroje je oddělená, do sítě Trafag nevede (bod 1) | — |
| 3.4 | firewall, příchozí jen nutné porty | bod 2 | dodavatel + IT |
| 3.4 | přístup přes jump hosty | T3 / T4 jen z jump hostu (adresu dodá IT); servisní router bod 6 | IT |
| 3.5 | jen schválený software, instalační soubory k dispozici | bod 5 | dodavatel + IT |
| 3.5 | žádný prohlížeč, pokud není nutný | Chrome nutný pro kiosk (jen `localhost`) | IT schválí |

## 8. Otázky pro Trafag IT

1. Připojení PC do domény — kdy a kdo; jaký účet pro kiosk a jaká výjimka z odhlášení / zámku obrazovky?
2. Servisní účet pro služby — doménový (i pro NAS), nebo lokální?
3. Kdo bude spouštět nasazení nových verzí (práva správce) — IT, nebo dodavatel s dočasnými právy?
4. Adresa jump hostu / povolených PC pro TCP 8080 a RDP; pevná IP nebo DNS jméno PC u stroje v OT VLAN.
5. Nepodepsané aplikace — whitelist podle cesty / hashe, nebo podpis kódu?
6. Výjimka antiviru pro datovou složku.
7. Servisní router v síti stroje — přípustný, za jakých podmínek?
8. Provoz bez HTTPS v OT VLAN (port 8080, přihlášení do aplikace) — přijatelné, nebo dodáte certifikát
   (připraveno: TLS přímo v aplikaci s certifikátem firemní CA)?
9. USB flashka (od ScadaViewer 2.6.7): administrátor u stroje ukládá CSV / XLSX zakázky na zasunutou flashku
   (služba ScadaViewer pod LocalSystem zapisuje do `X:\Trafag_ScadaViewer` a flashku bezpečně odebere). Je zápis
   na USB disky na PC u stroje povolen (GPO „Removable Storage Access“), případně jen pro schválené flashky?

## 9. Postup přechodu

1. **Dodavatel, hned:** silné heslo účtu `admin` (předat IT); nasazení s přesunem do `C:\apps`
   (`deploy.bat` se zeptá); výchozí heslo správce ScadaViewer změnit.
2. **S IT:** doména, kiosk účet + výjimka, servisní účet (služby, NAS, právo změny času), firewall dle bodu 2,
   whitelist + antivirus.
3. **Ověření na stroji:** kiosk pod novým účtem, služby pod servisním účtem (data na NAS, Nastavení → Čas / NTP),
   TwinCAT s omezenými účty, vzdálený přístup z jump hostu.
4. **Pak:** lokální admin vypnout nebo jen pro nouzi (heslo v 1Password).
