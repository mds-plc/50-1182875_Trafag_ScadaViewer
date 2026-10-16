# /audit [kategorie] — audit kódu

Proveď hloubkový audit ScadaViewer projektu.

Kategorie:
- `backend`    — FastAPI vzory, lifespan, routers, services
- `frontend`   — React hooks, typy, komponenty
- `ads`        — ADS notifikace, asyncio bridge, thread safety
- `security`   — CORS, WebSocket origin, path traversal v CSV čtení, pravidla mazání (role × `done_local` × rozpracovaná
                 zakázka `*_WIP.csv`, batch nikdy WIP) a jejich kontrakt s DatabaseGateway (`FileManager._wip_path`)
- `docs`       — CLAUDE.md, architecture.md aktuálnost **+ nápověda stránek** (`01_frontend/src/i18n/help.cs.ts`
                 / `help.en.ts`): projít každou stránku a ověřit, že nápověda popisuje skutečné prvky obrazovky
                 (záložky, filtry, tlačítka, sloupce, pravidla mazání / rolí) a nic, co na stránce není
- (prázdné)    — vše výše

## Výstup

Záznamy zapsat do `04_docs/audit_log.md` (nový záznam NA ZAČÁTEK).

Formát:
```markdown
## [DATUM] Audit — [kategorie]

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 1 | ⚠️ MEDIUM | ... | ... | ✅ Opraveno / ⬜ Otevřeno |

**Celkem:** X nálezů | Y opraveno | Z otevřeno
```
