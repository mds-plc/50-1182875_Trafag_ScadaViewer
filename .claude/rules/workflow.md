# Workflow — po každé úpravě kódu

Po **každé** implementaci nebo opravě (bez ohledu na rozsah) se vždy zeptej uživatele
na tyto věci — v jedné zprávě, jako stručný checklist:

```
Úprava hotova. Chceš:
1. **Testy** — spustit `pytest 02_tests/` (+ frontend `npm run test`, `tsc`, `lint`)?
2. **Dokumentace** — zanést změny do audit_log.md / architecture.md?
3. **Nápověda** — zkontrolovat nápovědu dotčených stránek (help.cs.ts / help.en.ts)?
4. **Architektura** — ověřit, že úprava sedí do stávající struktury kódu?
```

## Nápověda stránek (PageHelp) — stejně závazná jako dokumentace

Každá stránka má ikonu „?" s nápovědou „k čemu stránka slouží / co na ní je"
(`01_frontend/src/i18n/help.cs.ts` + `help.en.ts`, komponenta `components/PageHelp.tsx`).

- Změnil-li se **viditelný prvek** stránky (záložka, filtr, tlačítko, sloupec, graf, pravidlo — např. kdo smí
  mazat), uprav nápovědu té stránky **v obou jazycích** se stejným pořadím položek.
- Nová stránka = nový `HelpPageId` (`i18n/types.ts`) + `<PageHelp page="…" />` v `h1.page-title` + texty.
- Hlídá to:
  - **hook** `.claude/settings.json` → `.claude/hooks/help_reminder.py` — po Edit / Write souboru v
    `01_frontend/src/pages/` nebo `components/` připomene, kterou nápovědu zkontrolovat;
  - **test** `01_frontend/src/test/PageHelp.test.tsx` — každá stránka s nadpisem má `PageHelp`, každé `HelpPageId`
    je použité a má texty v CS i EN se stejným počtem položek (`i18n.test.ts` hlídá prázdné texty a diakritiku v EN).
- Obsah nápovědy (zda text odpovídá obrazovce) test neověří — zkontrolovat ručně při každé změně stránky.

## Kdy se neptáme

- Pokud uživatel sám řekl „spusť testy" / „zadokumentuj" — rovnou to udělej, neptej se znovu.
- Pokud jde o čistě dokumentační nebo konfigurační změnu (žádný runtime kód).
- Pokud uživatel výslovně řekl, že checklist nechce.

## Pořadí kroků (pokud uživatel odsouhlasí vše)

1. Testy — nejdřív ověř, že nic nebylo rozbito
2. Architektura — zhodnoť fit (stačí 2–3 věty; pokud nesedí, upozorni)
3. Nápověda — dotčené stránky v `help.cs.ts` + `help.en.ts` (frontend změna → `npm run build`)
4. Dokumentace — audit_log.md + případně architecture.md + MEMORY.md
