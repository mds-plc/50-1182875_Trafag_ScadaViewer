# /audit [kategorie] — audit kódu

Proveď hloubkový audit ScadaViewer projektu.

Kategorie:
- `backend`    — FastAPI vzory, lifespan, routers, services
- `frontend`   — React hooks, typy, komponenty
- `ads`        — ADS notifikace, asyncio bridge, thread safety
- `security`   — CORS, WebSocket origin, path traversal v CSV čtení
- `docs`       — CLAUDE.md, architecture.md aktuálnost
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
