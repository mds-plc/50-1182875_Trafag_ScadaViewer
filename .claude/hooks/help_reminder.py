"""PostToolUse hook (Edit / Write / MultiEdit): po úpravě stránky nebo komponenty frontendu připomene
Claudovi zkontrolovat nápovědu stránky (PageHelp — 01_frontend/src/i18n/help.cs.ts + help.en.ts).

Vstup: JSON na stdin (tool_input.file_path). Výstup: JSON s additionalContext jen pro relevantní
soubory; jinak nic. Nikdy neblokuje (chyba = tiché ukončení).
"""
import json
import re
import sys

# Soubor stránky → nápověda, které se týká (HelpPageId)
PAGE_HELP = {
    "Database.tsx": "database",
    "ChartView.tsx": "order, record, testing",
    "Settings.tsx": "settings",
    "Info.tsx": "info",
}


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        return
    path = str((data.get("tool_input") or {}).get("file_path") or "").replace("\\", "/")
    m = re.search(r"01_frontend/src/(pages|components)/([^/]+\.tsx)$", path)
    if not m:
        return
    folder, name = m.groups()
    if folder == "pages":
        pages = PAGE_HELP.get(name)
        if not pages:          # odpojené stránky (Overview, Wip) nápovědu nemají
            return
        target = f"nápovědu stránky ({pages})"
    else:
        if name in ("PageHelp.tsx",):
            return
        target = "nápovědu stránek, které komponentu " + name + " zobrazují"
    msg = (
        f"Upravil jsi {folder}/{name}. Zkontroluj {target} v 01_frontend/src/i18n/help.cs.ts a help.en.ts "
        "(PageHelp): popisuje text stále přesně, co na stránce je a k čemu slouží? Změnil-li se viditelný "
        "prvek (záložka, filtr, tlačítko, sloupec, pravidlo), uprav obě jazykové verze se stejným pořadím položek "
        "(.claude/rules/workflow.md bod Nápověda)."
    )
    # ensure_ascii — konzole Windows (cp1250) by českou diakritiku rozbila; \u escapy JSON dekóduje správně
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": msg}}))


if __name__ == "__main__":
    main()
