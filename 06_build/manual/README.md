# Uživatelský manuál — generátor

Výstup: `04_docs/manual/ScadaViewer_Uzivatelsky_manual_CS.docx|pdf` a `ScadaViewer_User_Manual_EN.docx|pdf`.
Poslední přegenerování: 2026-10-27, verze aplikace 2.6.10 (vydání manuálu 2.0).

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

## Příručky DatabaseGateway a Analyzing (ekosystém)

Výstup: `11.Parallel scripts\DatabaseGateway\04_docs\manual\DatabaseGateway_Provozni_prirucka_CS|Operation_Manual_EN.docx|pdf`
a `11.Parallel scripts\Analyzing\04_docs\manual\Analyzing_Provozni_prirucka_CS|Operation_Manual_EN.docx|pdf`
(vydání 1.0, 2026-10-27 — Gateway 2.6.2, Analyzing 2.6.3). Text ověřen proti kódu obou služeb (podklad:
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

Sdílená úprava dokumentů: `lib.js` (titulní strana, obsah, tabulky, poznámky, kód, obrázky).

Poznámky:
- Verze v manuálu se bere z `00_backend/scada/__init__.py` (`__version__`); vydání manuálu = `ISSUE` v `build_manual.js`.
- `shots.py` skrývá toasty jen přes CSS — mazání jejich DOM uzlů shodí React (`removeChild`). U výřezů skryje přilepenou
  horní lištu (jinak se překreslí přes obsah); klávesnice na obrazovce je vypnutá kromě snímku `21b_osk`.
- V Nastavení → Připojení se cesty ukázkového serveru a fiktivní Net ID na snímku nahradí typickými
  produkčními hodnotami (jen vzhled, nic se neukládá).
- Hromadné stažení na snímku `05c_bulk_done` skutečně zapíše soubory do `demo\usb` (atrapa flashky).
- Grafy se do tiskového protokolu zakázky záměrně netisknou; ukázka tisku je proto z detailu kusu.
- Kontrola sazby: PDF → náhledy stran (`pdftoppm -r 60`) a projít všechny strany.
