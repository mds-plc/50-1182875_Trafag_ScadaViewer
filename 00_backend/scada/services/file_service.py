"""
FileService — business logika nad CSV daty.

Odpovědnost:
  - datumové filtrování souborů (business pravidlo: které soubory zobrazit)
  - hledání zakázky podle části čísla / názvu (_order_matches — bez diakritiky a velikosti písmen,
    z order_id v názvu souboru → bez čtení souborů, i nad NAS archivem)
  - stránkování (business pravidlo: kolik najednou)
  - určení sync_status ze složkové struktury (business pravidlo)
  - koordinace volání CsvRepository
  - dopočet počtu kusů pro zobrazenou stránku (request_counts — NAS jen to, co uživatel vidí)
  - čtení souboru z NAS přes lokální kopii, je-li (_read_path → CsvRepository.prefer_local)
  - XLSX celé zakázky (export_xlsx → services/xlsx_export)

Co zde NENÍ:
  - I/O operace (soubory, disk) → CsvRepository
  - HTTP routing, parametry, response modely → api/*.py
"""
from __future__ import annotations

import logging
import math
import unicodedata
from datetime import date as _date
from datetime import datetime as _dt
from pathlib import Path
from typing import Any

from scada.services.protocols import PagedResult
from scada.services.xlsx_export import build_xlsx
from scada.services.repositories.csv_repository import CsvRepository

log = logging.getLogger(__name__)


def _chronological_except_dst(times: list[_dt]) -> bool:
    """
    Je pořadí v souboru chronologické až na nejvýš jeden zpětný skok v hodině 02:00–03:00
    poslední říjnové neděle (konec letního času, pravidlo EU)?

    PROČ: časové značky jsou místní čas bez zóny — 25. 10. se hodina 02:00–03:00 zopakuje.
    Seřazení podle textu by kusy z obou průchodů hodinou promíchalo a zakázka by se zkrátila
    o hodinu. Gateway zapisuje kusy v pořadí výroby, takové pořadí proto zůstane a frontend
    skok srovná (utils/orderTimeline.ts → normalizeClockShift). Jiné nepořádky → seřadit.
    """
    shifts = 0
    for a, b in zip(times, times[1:]):
        if b >= a:
            continue
        try:
            back = (a - b).total_seconds()
        except TypeError:               # smíšené časy s / bez zóny
            return False
        if (shifts == 0 and back <= 3600 and a.hour == 2 and b.hour == 2
                and b.month == 10 and b.day >= 25 and b.weekday() == 6):   # poslední neděle října
            shifts += 1
            continue
        return False
    return True


def _fold(text: str) -> str:
    """Pro hledání: bez diakritiky a velikosti písmen ('Zakázka-Č1' → 'zakazka-c1')."""
    return ''.join(c for c in unicodedata.normalize('NFKD', text) if not unicodedata.combining(c)).casefold()


def _order_matches(f, query: str) -> bool:
    """Hledání zakázky v přehledu: zadaný text je částí čísla / názvu zakázky (order_id z názvu
    souboru — známé hned, bez čtení souboru, i u NAS archivu)."""
    return _fold(query.strip()) in _fold(str(f.get('order_id') or ''))


class FileService:
    """Service vrstva — business logika nad CSV daty."""

    def __init__(self, repo: CsvRepository) -> None:
        self._repo = repo

    # ------------------------------------------------------------------
    # Seznam souborů
    # ------------------------------------------------------------------

    def list_files(
        self,
        location:  str = 'local',
        file_type: str = 'production',
        from_date: str | None = None,
        to_date:   str | None = None,
        sort_by:   str = 'created_at',
        sort_dir:  str = 'desc',
        query:     str | None = None,
    ) -> list[dict]:
        """
        Vrátí seznam souborů s volitelným datumovým filtrem a hledáním zakázky.

        Datumový filtr a hledání jsou BUSINESS PRAVIDLO — rozhodnutí, které soubory
        uživatel vidí. Proto patří sem, ne do repozitáře.
        query: část čísla / názvu zakázky (bez ohledu na velikost písmen a diakritiku) — viz _order_matches.
        """
        if not self._repo.validate_params(None, location, file_type):
            return []

        files = (
            self._repo.list_remote(file_type)
            if location == 'remote'
            else self._repo.list_local(file_type)
        )
        if query and query.strip():
            files = [f for f in files if _order_matches(f, query)]

        if from_date or to_date:
            from_day = _date.fromisoformat(from_date) if from_date else None
            to_day   = _date.fromisoformat(to_date)   if to_date   else None
            filtered = []
            for f in files:
                try:
                    ca = _date.fromisoformat(f['created_at'][:10])
                except (ValueError, TypeError):
                    filtered.append(f)  # neparsovatelné datum vždy projde
                    continue
                if from_day and ca < from_day:
                    continue
                if to_day   and ca > to_day:
                    continue
                filtered.append(f)
            files = filtered

        # Řazení — BUSINESS PRAVIDLO (pořadí závisí na sortovací volbě uživatele)
        _SORT_KEYS = {'created_at', 'switch_name', 'switch_id', 'record_count', 'order_id'}
        if sort_by in _SORT_KEYS:
            reverse = (sort_dir == 'desc')
            # Neznámá hodnota (None — např. počet kusů se ještě dopočítává) vždy na konec.
            # ID / typ spínače jsou před přečtením souboru jen odhad z názvu ('' / SAP číslo) —
            # také neznámé; jinak by dopočtené soubory odskakovaly a na 1. stránku chodily
            # další nedopočtené → dopočet celého NAS archivu kaskádou (audit Q6).
            def _unknown(f) -> bool:
                if sort_by in ('switch_id', 'switch_name') and f.get('record_count') is None:
                    return True
                return f.get(sort_by) is None or f.get(sort_by) == ''
            known   = [f for f in files if not _unknown(f)]
            unknown = [f for f in files if _unknown(f)]
            files = sorted(known, key=lambda f: f[sort_by], reverse=reverse) + unknown

        return files

    def list_files_paginated(
        self,
        location:  str = 'local',
        file_type: str = 'production',
        page:      int = 1,
        per_page:  int = 50,
        from_date: str | None = None,
        to_date:   str | None = None,
        sort_by:   str = 'created_at',
        sort_dir:  str = 'desc',
        query:     str | None = None,
    ) -> PagedResult:
        """
        Vrátí stránkovaný seznam souborů.

        Stránkování je BUSINESS PRAVIDLO (kolik záznamů uživatel vidí najednou),
        proto patří do service vrstvy, ne do API vrstvy. Hledání (query) platí i pro
        rozpracované zakázky (wip) a pro nápovědu „skryto datumovým filtrem".
        """
        all_files = self.list_files(location, file_type, from_date, to_date, sort_by, sort_dir, query)
        total = len(all_files)
        pages = max(1, math.ceil(total / per_page))
        page  = min(page, pages)          # clamp — stránka mimo rozsah → poslední
        start = (page - 1) * per_page
        page_files = all_files[start : start + per_page]
        # Počty kusů dopočítat pro zobrazenou stránku (NAS jen ty — dopočet stahuje celé soubory)
        self._repo.request_counts(page_files)
        return PagedResult(
            files=[dict(f) for f in page_files],
            total=total,
            page=page,
            pages=pages,
            wip=[dict(f) for f in self.list_wip(location, file_type)
                 if not (query and query.strip()) or _order_matches(f, query)],
            # Jen skutečně čekající dopočty — ne soubory v odkladu po chybě ani zaseknuté (K1, K16)
            counts_pending=self._repo.counts_pending(page_files),
            **self._hidden_by_filter(location, file_type, total, from_date, to_date, query),
        )

    def _hidden_by_filter(
        self, location: str, file_type: str, total: int, from_date: str | None, to_date: str | None,
        query: str | None = None,
    ) -> dict:
        """Datumový filtr nic nenašel → kolik souborů (odpovídajících hledání) existuje mimo něj
        a kdy vznikl nejnovější.

        Metadata jdou z cache repozitáře — druhý průchod bez filtru je levný.
        """
        if total > 0 or not (from_date or to_date):
            return {}
        everything = self.list_files(location, file_type, query=query)
        if not everything:
            return {}
        latest = max((f.get('created_at') or '' for f in everything), default='') or None
        return {'hidden_by_filter': len(everything), 'latest_created_at': latest}

    def list_wip(self, location: str = 'local', file_type: str = 'production') -> list[dict]:
        """
        Rozpracované zakázky (wip/) — BUSINESS PRAVIDLO: jen lokální úložiště, bez datumového
        filtru, řazení a stránkování (zobrazují se vždy nahoře, dokud se měří).
        """
        if location != 'local' or not self._repo.validate_params(None, location, file_type):
            return []
        return self._repo.list_wip(file_type)

    # ------------------------------------------------------------------
    # Jednotlivý soubor
    # ------------------------------------------------------------------

    def get_file(
        self,
        file_id:   str,
        location:  str = 'local',
        file_type: str = 'production',
    ) -> dict | None:
        """
        Vrátí metadata jednoho souboru — O(1) (přímý _resolve_path, ne scan všech).

        Určení sync_status ze složkové struktury je BUSINESS PRAVIDLO:
          done_remote/ → 'done_remote' (synchronizováno na NAS)
          done_local/  → 'done_local'  (čeká na sync)
        """
        path = self._repo.resolve_path(file_id, location, file_type)
        if path is None or not path.exists():
            return None

        sync_status: str | None
        if location == 'remote':
            sync_status = None
        elif path.parent.name == 'wip':
            sync_status = 'wip'
        else:
            sync_status = 'done_remote' if 'done_remote' in path.parts else 'done_local'

        try:
            return self._repo.read_file_meta(path, file_type, location, sync_status,
                                             allow_empty=(sync_status == 'wip'))
        except Exception as exc:
            log.error("[SVC]   get_file %s chyba: %s", file_id, exc)
            return None

    def resolve_path(
        self,
        file_id:   str,
        location:  str = 'local',
        file_type: str = 'production',
    ) -> Path | None:
        """Vrátí fyzickou cestu k souboru (delegace na repository)."""
        p = self._read_path(file_id, location, file_type)
        return p if p and p.exists() else None

    def _read_path(self, file_id: str, location: str, file_type: str) -> Path | None:
        """Cesta pro ČTENÍ: soubor z NAS, který leží i na PC u stroje (stejný název a velikost),
        se čte z lokálního disku — rychleji a bez zátěže sítě."""
        p = self._repo.resolve_path(file_id, location, file_type)
        if p is not None and location == 'remote':
            p = self._repo.prefer_local(p, file_type)
        return p

    def close(self) -> None:
        """Ukončení aplikace — zastaví dopočet na pozadí."""
        self._repo.close()

    def export_xlsx(
        self,
        file_id:   str,
        location:  str = 'local',
        file_type: str = 'production',
    ) -> bytes | None:
        """Celý soubor jako XLSX (originální sloupce, čísla jako čísla). None = soubor neexistuje."""
        path = self._read_path(file_id, location, file_type)
        if path is None or not path.exists():
            return None
        header, rows = self._repo.read_table(path)
        data = build_xlsx(header, rows, sheet_name='Data')
        log.info("[SVC]   export_xlsx %s → %.1f MB", file_id, len(data) / 1e6)
        return data

    # ------------------------------------------------------------------
    # Smazání souboru
    # ------------------------------------------------------------------

    def delete_file(
        self,
        file_id:   str,
        location:  str = 'local',
        file_type: str = 'production',
        allow_unsynced: bool = False,
        sync: str | None = None,
        allow_wip: bool = False,
    ) -> str:
        """
        Smaže soubor z lokálního úložiště.

        allow_unsynced: smí se smazat i soubor z done_local/ (ještě NENÍ na NAS — jediná kopie
                        dat)? Jen admin+ (rozhodnutí uživatele 2026-10-15, audit Q5).
        sync:           'done_local' / 'done_remote' — kterou kopii smazat, leží-li soubor v obou
                        složkách (řádek v UI). Bez něj platí done_local (bezpečnější — chráněná).
        allow_wip:      smí se smazat rozpracovaná zakázka (wip/)? Jen admin+, jednotlivě, po potvrzení
                        rizika v UI (rozhodnutí uživatele 2026-10-16). DatabaseGateway chybějící WIP
                        soubor pozná a další kus zakázky odmítne (Rejected) — soubor nezaloží znovu.

        Returns:
          'ok'                 — soubor smazán
          'not_found'          — soubor neexistuje
          'remote_forbidden'   — remote soubory nelze smazat
          'wip_forbidden'      — rozpracovanou zakázku smí smazat jen admin (DatabaseGateway do ní zapisuje)
          'unsynced_forbidden' — soubor ještě není na NAS a volající nemá právo ho smazat
        """
        if location != 'local':
            return 'remote_forbidden'
        if file_id.endswith('_WIP.csv') and not allow_wip:
            return 'wip_forbidden'
        path = self._repo.resolve_path(file_id, location, file_type)
        if path is None or not path.exists():
            return 'not_found'
        if sync in ('done_local', 'done_remote') and path.parent.name != sync:
            alt = path.parent.parent / sync / file_id
            if alt.exists():
                path = alt
        if path.parent.name == 'done_local' and not allow_unsynced:
            return 'unsynced_forbidden'
        self._repo.delete_file(path)
        log.info("[SVC]   delete_file %s (%s/%s)", file_id, location, file_type)
        return 'ok'

    # ------------------------------------------------------------------
    # Časový průběh zakázky
    # ------------------------------------------------------------------

    def read_timeline(
        self,
        file_id:   str,
        location:  str = 'local',
        file_type: str = 'production',
    ) -> tuple[list[str], list[int | None]] | None:
        """
        Časové značky a kategorie všech záznamů souboru, seřazené podle času
        (pořadí souboru zůstane, je-li jediným nepořádkem konec letního času — viz _chronological_except_dst).

        BUSINESS PRAVIDLO: jen production (testing soubor = jeden záznam). Záznamy bez
        parsovatelného času se vynechají — do časové osy nepatří.

        Returns:
            (timestamps ISO, kategorie 1–6 | None) nebo None, pokud soubor neexistuje.
        """
        path = self._read_path(file_id, location, file_type)
        if path is None or not path.exists():
            return None
        points: list[tuple[str, str]] = []
        self._repo.read_records(path, page=1, per_page=1, timeline=points)
        valid: list[tuple[str, int | None]] = []
        parsed: list[_dt] = []
        for ts, grp in points:
            try:
                dt = _dt.fromisoformat(ts)
            except (ValueError, TypeError):
                continue
            try:
                cat: int | None = int(grp) if grp else None
            except ValueError:
                cat = None
            valid.append((ts, cat))
            parsed.append(dt)
        if not _chronological_except_dst(parsed):
            valid.sort(key=lambda p: p[0])
        return [p[0] for p in valid], [p[1] for p in valid]

    # ------------------------------------------------------------------
    # Záznamy
    # ------------------------------------------------------------------

    def read_order_info(self, file_id: str, location: str = 'local', file_type: str = 'production') -> dict | None:
        """Údaje zakázky z bloků blokového PROD_ souboru — viz CsvRepository.read_order_info. None = nejsou."""
        if file_type != 'production':
            return None
        path = self._read_path(file_id, location, file_type)
        if path is None or not path.exists():
            return None
        return self._repo.read_order_info(path)

    def read_records(
        self,
        file_id:   str,
        location:  str = 'local',
        file_type: str = 'production',
        from_date: str | None = None,
        to_date:   str | None = None,
        page:     int = 1,
        per_page: int = 0,     # 0 = všechny záznamy
        categories: frozenset[str] | None = None,
        status:     str | None = None,
        stats:      dict[str, Any] | None = None,
        order:      str = 'asc',
        nok:        frozenset[str] | None = None,
    ) -> tuple[list[dict], int, dict[str, int], int | None]:
        """Načte záznamy z daného souboru — deleguje na repozitář.
        Vrátí (records, total, group_counts, file_expected_count).
        categories / status / nok / stats / order — filtr a řazení detailu zakázky, viz CsvRepository.read_records."""
        path = self._read_path(file_id, location, file_type)
        if path is None or not path.exists():
            log.warning("[SVC]   soubor nenalezen: %s (%s/%s)", file_id, location, file_type)
            return [], 0, {}, None
        records, total, group_counts, file_expected_count = self._repo.read_records(
            path, from_date, to_date, page=page, per_page=per_page,
            categories=categories, status=status, stats=stats, order=order, nok=nok,
        )
        log.debug("[SVC]   read_records %s → %d/%d záznamů (str. %d)", file_id, len(records), total, page)
        return records, total, group_counts, file_expected_count
