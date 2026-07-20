# Workflow — po každé úpravě kódu

Po **každé** implementaci nebo opravě (bez ohledu na rozsah) se vždy zeptej uživatele
na tyto tři věci — v jedné zprávě, jako stručný checklist:

```
Úprava hotova. Chceš:
1. **Testy** — spustit `pytest 02_tests/`?
2. **Dokumentace** — zanést změny do audit_log.md / architecture.md?
3. **Architektura** — ověřit, že úprava sedí do stávající struktury kódu?
```

## Kdy se neptáme

- Pokud uživatel sám řekl „spusť testy" / „zadokumentuj" — rovnou to udělej, neptej se znovu.
- Pokud jde o čistě dokumentační nebo konfigurační změnu (žádný runtime kód).
- Pokud uživatel výslovně řekl, že checklist nechce.

## Pořadí kroků (pokud uživatel odsouhlasí vše)

1. Testy — nejdřív ověř, že nic nebylo rozbito
2. Architektura — zhodnoť fit (stačí 2–3 věty; pokud nesedí, upozorni)
3. Dokumentace — audit_log.md + případně architecture.md + MEMORY.md
