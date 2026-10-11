# Uživatelský manuál — generátor

Výstup: `04_docs/manual/ScadaViewer_Uzivatelsky_manual_CS.docx|pdf` a `ScadaViewer_User_Manual_EN.docx|pdf`.

Po změně vzhledu aplikace nebo textů se manuál přegeneruje — screenshoty se nafotí znovu
z ukázkového serveru, text je v `build_manual.js` (obě jazykové verze vedle sebe, `t(cs, en)`).

## Požadavky (build PC)

- Python + Playwright (`pip install playwright`) a nainstalovaný Chrome (`channel='chrome'`)
- Node.js + balíček `docx` (`npm install docx` v této složce)
- Microsoft Word (doplnění obsahu a export do PDF přes COM), `pdftoppm` (Poppler, jen pro kontrolu)
- Sestavený frontend (`01_frontend/dist`)

## Postup

```bat
:: 1. Ukázková data (z reálné zakázky v 05_user_data, hodnoty s rozptylem) → demo\local, demo\nas
python make_demo_data.py

:: 2. Ukázkový server — VLASTNÍ konfigurace s fiktivním ADS net_id (127.0.0.254.1.1), port 8099,
::    local_path = demo\local, remote_path = demo\nas; users.toml vedle s účtem novak / demo1234 (admin)
::    NIKDY reálný Config.toml — připojil by se k PLC a zapisoval heartbeat.
python ..\..\main.py --config srv\Config.toml

:: 3. Screenshoty (img\cs, img\en)
python shots.py cs
python shots.py en

:: 4. Parametry z paramMeta.ts → params.json (příloha A); konzole cp1250 → nutné UTF-8 (znak Ω)
set PYTHONIOENCODING=utf-8
python extract_params.py

:: 5. Dokumenty + obsah + PDF
node build_manual.js cs out_cs.docx
node build_manual.js en out_en.docx
powershell -File word_finish.ps1 -In "%CD%\out_cs.docx" -Pdf "%CD%\out_cs.pdf"
powershell -File word_finish.ps1 -In "%CD%\out_en.docx" -Pdf "%CD%\out_en.pdf"
```

Poznámky:
- Verze v manuálu se bere z `00_backend/scada/__init__.py` (`__version__`).
- `shots.py` skrývá toasty jen přes CSS — mazání jejich DOM uzlů shodí React (`removeChild`).
- V Nastavení → Připojení se dočasné cesty a fiktivní Net ID na snímku nahradí typickými
  produkčními hodnotami (jen vzhled, nic se neukládá).
- Grafy se do tiskového protokolu zakázky záměrně netisknou; ukázka tisku je proto z detailu záznamu.
