# Dokumentace EOL testeru — generátor (ScadaViewer, DatabaseGateway, Analyzing)

Každý produkt má dvě verze dokumentace (rozhodnutí 2026-10-28), obě se společným rámcem z `lib.js` (titulní strana,
záhlaví, zápatí, styly, kapitola „O tomto dokumentu“) a strukturou podle **IEC/IEEE 82079-1**:

| Typ (`docType`) | Pro koho | Obsah | Soubory v `04_docs/manual` |
|-----------------|----------|-------|----------------------------|
| `user` — **Návod k použití** / Instructions for Use | zákazník (kvalita, technologie, vedení, IT) | co produkt dělá, co znamenají data, chování při výpadku, vzorové soubory | `<Produkt>_Navod_k_pouziti_<verze>_<datum>_CS`, `…_Instructions_for_Use_…_EN` |
| `tech` — **Technický manuál** / Technical Manual | servis, programátor PLC, vývojář | rozhraní, algoritmy, konfigurace, instalace, diagnostika | `<Produkt>_Technicky_manual_<verze>_<datum>_CS`, `…_Technical_Manual_…_EN` |

| Produkt | Návod k použití (obsluhuje zákazník: ScadaViewer, HMI) | Technický manuál |
|---------|-----------------|------------------|
| ScadaViewer | `build_manual.js` (vydání 2.1) | `build_scadaviewer_tech.js` (1.0) |
| DatabaseGateway | — (zákaznická verze = **Technický popis**, `build_gateway_user.js`, `docType: 'description'`) | `build_gateway.js` (1.1) |
| Analyzing | — (zákaznická verze = **Technický popis**, `build_analyzing_user.js`, `docType: 'description'`) | `build_analyzing.js` (1.1) |
| **Architektura softwaru** | — | `build_architecture.js` — souhrnný Technický popis (součásti, tok dat, rozhraní, sítě, nasazení, mapa dokumentace); schéma `diagrams.py arch` |
| HMI | `build_hmi.js` (rozpracováno) | — |
| Analogový měřicí obvod 1AD01 | — | `build_afe.js` — **jeden** dokument „Technický popis“ (`docType: 'description'`; popis stavu a vysvětlení, zákazník s deskou nepracuje) |

Vzorové soubory (`vzory/`: PROD_ CSV + XLSX, TEST_ ZIP + XLSX — z ukázkových dat `demo/`, XLSX funkcemi ScadaViewer
`build_blocks_xlsx` / `build_xlsx`) jdou do `04_docs/manual/vzorove_soubory` DatabaseGateway a ScadaViewer; popisuje je
příloha Návodu k použití DatabaseGateway. Kopírování dokumentů i vzorů pod správnými názvy: **`python publish.py`**.
Název souboru = `<Produkt>_<Typ>_<verze>_<RRRR-MM-DD>_<CS|EN>` (verze softwaru z `__init__.py`, HMI `rev<datum>` z `HMI_Config.js`;
datum = den publikování); předchozí verze téhož dokumentu se v cíli smaže. Cíle: `04_docs/manual` projektu (HMI: jeho
`04_docs/manual`) a souhrnná složka **`17.Dokumentace`** v kořeni projektu Trafag (`1.Architektura softwaru`, `2.HMI`, `3.ScadaViewer`,
`4.DatabaseGateway`, `5.Analyzing`, `6.Analogový měřící obvod`, `7.Vzorové soubory`).

**Sazba (`lib.js`, `build_manual.js`):** řádky tabulky se nedělí, všechny řádky kromě posledního jsou „svázat s dalším“ →
tabulka, která se vejde na stranu, je vždy celá na jedné straně (delší má opakované záhlaví); nadpisy, obrázek s popiskem
a úvodní věta končící dvojtečkou drží s následujícím obsahem; kontrola vdov a sirotků. Před vydáním ověřit:
`powershell -File check_layout.ps1 -In "C:\…\out_cs.docx;C:\…\gw_cs.docx"` — hlásí rozdělené tabulky a nadpisy na konci
strany (kód 1 = problém); tabulky delší než strana jen jako informaci.

Poslední přegenerování: 2026-10-28 — ScadaViewer 2.6.10, DatabaseGateway 2.6.2, Analyzing 2.6.3.

## Názvosloví (závazné pro všechny tři dokumenty, rozhodnutí 2026-10-28)

| Pojem | CS | EN |
|-------|----|----|
| Stroj | **EOL tester mikrospínačů**, dále „tester“ (ne „linka“, „stroj“) | **microswitch EOL tester**, then “tester” (not “line”, “machine”) |
| PC u stroje | **PC testeru**; „u testeru“ = práce přímo na tomto PC | **tester PC**; “at the tester” |
| Typ dokumentu | **Návod k použití** / **Technický manuál**; v textu „dokument“ | **Instructions for Use** / **Technical Manual**; “document” in the text |
| Odkaz na kapitolu | „kapitola 3.4“ v textu, „(kap. 3.4)“ v závorce | “section 3.4”, “chapter 5” |
| Angličtina | — | britská (colour, behaviour, synchronisation) |

Texty citované z aplikace (popisky tlačítek, hlášky v „…“) zůstávají doslova — aplikace sama používá „u stroje“ /
“at the machine”; vysvětluje to heslo **PC testeru** v Pojmech. Kostra kapitol DatabaseGateway a Analyzing je stejná:
1 Úvod · 2 Princip činnosti (2.3 Poruchy a výpadky) · 3 Rozhraní s PLC · specifické kapitoly · Konfigurace ·
Instalace a aktualizace · (Analyzing: Uvedení do provozu) · 8 Provoz a diagnostika · 9 Řešení problémů · Příloha A Pojmy a zkratky.
Popisky ve schématech (`diagrams.py`) se řídí stejnými pravidly.

Po změně vzhledu aplikace nebo textů se manuál přegeneruje — screenshoty se nafotí znovu
z ukázkového serveru, text je v `build_manual.js` (obě jazykové verze vedle sebe, `t(cs, en)`).
Popisky tlačítek v textu musí odpovídat `01_frontend/src/i18n/cs.ts` / `en.ts`, pravidla oprávnění kódu
(`api/dependencies.py`, `users_api.py`, `UsbContext.tsx`) — manuál je technický dokument, ověřovat proti kódu.

## Požadavky (build PC)

- Python + Playwright (`pip install playwright`) a nainstalovaný Chrome (`channel='chrome'`), Pillow (jen kontrola)
- Node.js + balíček `docx` (`npm install docx` v této složce)
- Microsoft Word (doplnění obsahu a export do PDF přes COM), `pdftoppm` (Poppler — tiskový protokol, kontrola)
- Sestavený frontend (`01_frontend/dist`, `npm run build`)

## Postup

```bat
:: 1. Ukázková data ve formátu DatabaseGateway 2.6.x (blokový PROD_ 37 sloupců, C = 9400 µm, nová definice RT,
::    šarže, limity; NOK kusy konzistentní s limity) + Testing z reálného měření 12.Database (2026-10-22) → demo\local, demo\nas
python make_demo_data.py

:: 2. Ukázkový server (srv\Config.toml: fiktivní ADS net_id 127.0.0.254.1.1, port 8099, data demo\;
::    srv\users.toml: novak / demo1234, role admin). run_demo.py navíc: atrapa flashky E: → demo\usb,
::    stav Čas / NTP a zaplnění NAS jako na PC u stroje (ne údaje tohoto počítače).
::    NIKDY reálný Config.toml — připojil by se k PLC a zapisoval heartbeat.
python run_demo.py

:: 3. Screenshoty (img\cs, img\en) — prohlížeč na stejném PC = „u stroje“ (flashka, mazání, nastavení času)
python shots.py cs
python shots.py en
::    jen vybrané: python shots.py cs 03b_search,24_info

:: 4. Parametry z paramMeta.ts → params.json (příloha A); konzole cp1250 → nutné UTF-8 (znak Ω)
set PYTHONIOENCODING=utf-8
python extract_params.py

:: 5. Dokumenty + obsah + PDF, kopie do 04_docs\manual
node build_manual.js cs out_cs.docx
node build_manual.js en out_en.docx
powershell -File word_finish.ps1 -In "%CD%\out_cs.docx" -Pdf "%CD%\out_cs.pdf"
powershell -File word_finish.ps1 -In "%CD%\out_en.docx" -Pdf "%CD%\out_en.pdf"
```

## Dokumenty DatabaseGateway a Analyzing

Výstup: `11.Parallel scripts\DatabaseGateway\04_docs\manual\` a `11.Parallel scripts\Analyzing\04_docs\manual\`
(názvy souborů viz výše). Text ověřen proti kódu obou služeb (podklad:
rozbor kódu se zdroji `soubor:řádek`); verze se čte z jejich `__init__.py`. Při změně služby text zkontrolovat.

```bat
:: schémata (tok dat, handshake, životní cyklus souborů, průběh analýzy) → img\eco\<jazyk>
python diagrams.py
:: výřezy diagramů síla–dráha a spínacích časů ze snímků ScadaViewer (img\<jazyk>\13_record.png, krok 3 výše)
python crop_an.py
node build_gateway.js cs gw_cs.docx   &  node build_gateway.js en gw_en.docx
node build_analyzing.js cs an_cs.docx &  node build_analyzing.js en an_en.docx
:: PDF jako u manuálu ScadaViewer (word_finish.ps1), pak kopie do 04_docs\manual obou projektů
```

## Dokument HMI (rozpracovaný — kostra 2026-10-28, vydání 0.1)

`node build_hmi.js cs hmi_cs.docx` / `en hmi_en.docx` (+ `word_finish.ps1`). Zatím jen v této složce, do HMI projektu se
kopíruje až hotový. Zdroje: kapitoly obrazovek z vestavěné nápovědy HMI (`9.HMI Program\…\MDS_JavaScripts\01_Config\HMI_Help.js`),
názvy režimů z `HMI_Config.js` (`ValueToText.MachineMode`), role z `accessLocks`, ovládací panel +P01 z elektroschématu
(list 18 rozložení, 32 / 44 vstupy a kontrolky). Růžové poznámky **Doplnit** (`NOTE('todo', …)`) = chybějící podklady
(snímky, fotka panelu, chování kontrolek a přechody režimů z PLC, alarmy) — ve vydaném dokumentu nesmí zůstat.
Texty převzaté z nápovědy HMI používají slovo „stroj“ jako obrazovka HMI.

Sdílená úprava dokumentů: `lib.js` (titulní strana, záhlaví, zápatí, obsah, tabulky, poznámky, kód, obrázky; `DOC_TYPE`, `MACHINE`).

Poznámky:
- Verze v manuálu se bere z `00_backend/scada/__init__.py` (`__version__`); vydání dokumentu = `ISSUE` v `build_manual.js`, u Gateway / Analyzing `issue` v jejich generátoru.
- `shots.py` skrývá toasty jen přes CSS — mazání jejich DOM uzlů shodí React (`removeChild`). U výřezů skryje přilepenou
  horní lištu (jinak se překreslí přes obsah); klávesnice na obrazovce je vypnutá kromě snímku `21b_osk`.
- V Nastavení → Připojení se cesty ukázkového serveru a fiktivní Net ID na snímku nahradí typickými
  produkčními hodnotami (jen vzhled, nic se neukládá).
- Hromadné stažení na snímku `05c_bulk_done` skutečně zapíše soubory do `demo\usb` (atrapa flashky).
- Grafy se do tiskového protokolu zakázky záměrně netisknou; ukázka tisku je proto z detailu kusu.
- Kontrola sazby: PDF → náhledy stran (`pdftoppm -r 60`) a projít všechny strany.
