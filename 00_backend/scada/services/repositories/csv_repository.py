"""
CsvRepository — čistá I/O vrstva (Data Access Layer).

Odpovědnost: přístup k souborovému systému a CSV souborům.
Bez business pravidel — nerozhoduje co filtrovat, co zobrazit, jak stránkovat.
Všechna taková rozhodnutí jsou v FileService (services/file_service.py).

Lokální úložiště:
  {local_path}/{file_type}/wip/          ← rozpracovaná zakázka (*_WIP.csv, jen production)
  {local_path}/{file_type}/done_local/   ← uzavřené, čeká na upload
  {local_path}/{file_type}/done_remote/  ← uploadováno na NAS

Vzdálené úložiště (NAS — přímá UNC cesta):
  {remote_path}/{file_type}/   ← flat složka

Výkon a škálování (architecture.md → „Výkon, paměť a škálovatelnost"):
  - Přehled souborů z NÁZVŮ (FileMeta, _quick_meta) — soubor se neotevírá. Počet kusů se dopočítá
    na pozadí (request_counts → fronta → _count_job): lokálně vše, z NAS jen zobrazená stránka.
  - FileMeta — neměnná kompaktní metadata (Mapping); cache je vrací bez kopie (~1 kB / soubor).
  - _MetaStore — SQLite cache metadat (03_output/cache/file_meta.sqlite), zapisují se jen změny;
    tabulka known = počty kusů podle názvu + velikosti, přežije smazání lokální kopie.
  - Výpis NAS složky se drží _REMOTE_LISTING_TTL s; během skenování se vrací poslední známý stav.
  - _OrderIndex — zakázka v paměti (surové řádky + čas / kategorie / stav), LRU 3 soubory / 256 MB;
    stránky, filtry, detail kusu, časový průběh a XLSX bez opětovného čtení souboru.
"""
from __future__ import annotations

import csv
import logging
import os
import queue
import re
import sqlite3
import sys
import threading
import time
from collections import OrderedDict
from collections.abc import Iterable, Iterator, Mapping
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import date as _date
from datetime import datetime
from pathlib import Path
from typing import Any

from scada.config import DataConfig
from scada.services.shared_open import open_shared   # čtení nebrání přesunu v Gateway (X2)
from scada.services.units import (
    canonical_header, export_header, export_value, position_scale, scale_text, unit_factor,
)

log = logging.getLogger(__name__)

_READ_WORKERS_REMOTE  = 32   # paralelní čtení metadat z NAS (latence, ne CPU)
_READ_WORKERS_LOCAL   = 4
# Index zakázky v paměti — nejvýše tolik naposledy otevřených souborů a tolik paměti celkem
# (50 000 kusů ≈ 20 MB; větší soubor než limit se obslouží, jen se nedrží v paměti)
_INDEX_CACHE_FILES    = 3
_INDEX_CACHE_BYTES    = 256 * 1024 * 1024
# Strop velikosti zakázky pro zobrazení v aplikaci (index v paměti ≈ 2,3 × velikost souboru).
# Běžná zakázka 50 000 kusů ≈ 13 MB; větší soubor = poškozený / cizí → stáhnout originál (audit Q7).
_MAX_ORDER_FILE_BYTES = 200 * 1024 * 1024


class FileTooLargeError(Exception):
    """Soubor zakázky je příliš velký na zobrazení v aplikaci (API → 413)."""

    def __init__(self, size: int) -> None:
        super().__init__(f"soubor má {size / 1e6:.0f} MB (strop {_MAX_ORDER_FILE_BYTES / 1e6:.0f} MB)")
        self.size = size
# Dopočet počtu kusů na pozadí (přehled se zobrazí hned z názvů souborů) — vláken na lokalitu.
# NAS záměrně málo: dopočet stahuje celé soubory a nesmí vytížit linku (upload DatabaseGateway,
# kancelář). Z NAS se navíc dopočítávají jen právě zobrazené soubory (request_counts).
_COUNT_WORKERS        = 2
# Dopočet selhal I/O chybou (NAS nedostupný, soubor zamčený) → znovu nejdřív za tolik sekund.
# Soubor se NESKRÝVÁ — přechodná chyba nesmí zakázku vyřadit z přehledu (DONE soubor se už nezmění).
_COUNT_RETRY_S        = 60.0
# Dopočet běží déle (zaseknutý NAS — čtení UNC nejde přerušit) → přestat hlásit counts_pending,
# jinak by se frontend ptal každých 1,5 s donekonečna. Vlákno dopočtu doběhne, až NAS odpoví.
_COUNT_STALL_S        = 120.0
# Výpis NAS složky držený v paměti [s] — 100 000 souborů se po síti vypisuje sekundy
_REMOTE_LISTING_TTL   = 15.0
# Mazání souboru, který právě drží DatabaseGateway (WinError 32) — opakovat ~1 s, pak 409
_DELETE_ATTEMPTS      = 5
_DELETE_DELAY_S       = 0.2

# Název souboru od DatabaseGateway: PROD_{zakázka}_{typ}_{RRRRMMDD}_{HHMMSS}_DONE.csv,
# TEST_{typ}_{RRRRMMDD}_{HHMMSS}_DONE.csv; starší soubory bez prefixu PROD_.
# Typ spínače bez podtržítka; kdyby ho zakázka / typ měly, přesné hodnoty doplní dopočet z metadat.
def order_id_from_name(name: str) -> str | None:
    """Číslo zakázky z názvu PROD_{zakázka}_{typ}_{datum}_{čas}_DONE|WIP.csv (None = jiný formát)."""
    m = _NAME_PROD.match(name)
    return m.group('order') if m else None


def _truncate_partial_line(f, name: str) -> None:
    """Odřízne neukončený poslední řádek binárně otevřeného souboru (r+b) — stejně jako DatabaseGateway."""
    size = f.seek(0, os.SEEK_END)
    if size == 0:
        return
    f.seek(size - 1)
    if f.read(1) == b"\n":
        return
    pos, block = size, 1 << 16
    while pos > 0:
        start = max(0, pos - block)
        f.seek(start)
        chunk = f.read(pos - start)
        nl = chunk.rfind(b"\n")
        if nl >= 0:
            f.truncate(start + nl + 1)
            log.warning("[CSV]   %s končil neúplným řádkem (%d B) — odříznut.", name, size - (start + nl + 1))
            return
        pos = start


_NAME_PROD = re.compile(r'^(?:PROD_)?(?P<order>.+)_(?P<switch>[^_]+)_(?P<d>\d{8})_(?P<t>\d{6})_(?:DONE|WIP)\.csv$')
_NAME_TEST = re.compile(r'^(?:TEST_)?(?P<switch>.+)_(?P<d>\d{8})_(?P<t>\d{6})_DONE\.csv$')


def _name_ts(d: str, t: str) -> str | None:
    """'20261007', '123100' → '2026-10-07T12:31:00' (None = nesmyslné datum / čas).

    Ručně, ne strptime — u 100 000 souborů ~1,6 s → ~0,1 s.
    """
    mo, dd, hh, mi, ss = int(d[4:6]), int(d[6:8]), int(t[0:2]), int(t[2:4]), int(t[4:6])
    if not (1 <= mo <= 12 and 1 <= dd <= 31 and hh < 24 and mi < 60 and ss < 60):
        return None
    return f"{d[0:4]}-{d[4:6]}-{d[6:8]}T{t[0:2]}:{t[2:4]}:{t[4:6]}"


@dataclass(slots=True)
class _OrderIndex:
    """Production soubor připravený pro opakované dotazy (stránky, filtry, detail kusu).

    Datové řádky zůstávají jako surový text — dict se staví jen pro řádky vrácené klientovi.
    Pro filtrování stačí předpočítané sloupce (čas, den, kategorie, stav). Jedno přečtení
    souboru tak obslouží všechny další požadavky, dokud se soubor nezmění (mtime / size).
    """
    meta_header: list[str]          # originální názvy metadat (řádek 1); [] = starý formát
    meta_vals:   list[str]
    meta_inject: dict[str, str]     # metadata doplňovaná do záznamů (klíče lowercase)
    fieldnames:  list[str]          # originální hlavička datové části (s jednotkami)
    lines:       list[str]          # surové datové řádky (bez prázdných)
    ts:          list[str]
    days:        list[int]          # date.toordinal(); -1 = neparsovatelný čas (projde filtrem)
    grp:         list[str]          # kategorie 1–6 ('' = chybí)
    status:      list[str]
    ec:          list[str] | None   # expected_count po řádcích (None = sloupec v datech není)
    nbytes:      int = 0            # odhad paměti indexu (limit _INDEX_CACHE_BYTES)
    # klíč → násobek na jednotky zákazníka (N → mN, Ω → mΩ); jen sloupce, které převod potřebují
    scales:      dict[str, float] | None = None
    # Údaje zakázky z bloků před [Data] (blokový formát, Gateway 2.3.0+) — viz _order_info()
    order_info:  dict | None = None
    # Maska NOK kategorií po řádcích (bit podle NOK_CATEGORIES; NokCategory_* = 1) — filtr „NOK oblast";
    # None = soubor sloupce NokCategory_* nemá (starší formát)
    nok:         list[int] | None = None


# NOK kategorie kusu (sloupce NokCategory_Force … _Process z Gateway) — pořadí = bit v _OrderIndex.nok
NOK_CATEGORIES: tuple[str, ...] = ('force', 'position', 'electric', 'times', 'process')
_NOK_BIT = {c: 1 << i for i, c in enumerate(NOK_CATEGORIES)}


def _record_matches(
    rec: dict[str, str], grp: str, categories: frozenset[str] | None, status: str | None,
) -> bool:
    """Filtr detailu zakázky: kategorie 1–6 a stav OK (1–4) / NOK (5–6).

    Bez kategorie se stav bere ze sloupce Status (2 = OK, 5 / 6 = NOK) — stejně jako frontend.
    """
    if categories and grp not in categories:
        return False
    if status in ('ok', 'nok'):
        try:
            cat = int(grp)
        except ValueError:
            cat = 0
        if 1 <= cat <= 6:
            is_ok = cat <= 4
        else:
            st = str(rec.get('status', '') or '').strip()
            if st == '2':
                is_ok = True
            elif st in ('5', '6'):
                is_ok = False
            else:
                return False
        if is_ok != (status == 'ok'):
            return False
    return True


def _normalize_key(k: str) -> str:
    """Normalize CSV header: strip unit suffix and lowercase.

    'OF_OperatingForce [N]' → 'of_operatingforce'
    'Timestamp'             → 'timestamp'

    Jednotku hodnot převádí na jednotky zákazníka volající (units.unit_factor podle hlavičky).
    """
    bracket = k.find('[')
    if bracket >= 0:
        k = k[:bracket]
    return k.strip().lower()


def _parse_sectioned(
    f,
    separator: str,
) -> dict[str, dict[str, str]]:
    """Parse multi-section TEST CSV format.

    Sections are delimited by ``[SectionName]`` lines.
    Each section has a header row followed by a values row.
    Stops at ``[SignalData]`` to avoid reading ~400k signal rows.

    Returns ``{section_name_lower: {normalized_key: value, ...}, ...}``.
    If ``[SignalData]`` section is present, a sentinel key ``_has_signal``
    is added to the top-level dict with value ``{'_flag': 'true'}``.
    """
    sections: dict[str, dict[str, str]] = {}
    current_section: str | None = None
    header: list[str] | None = None

    for raw_line in f:
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith('[') and line.endswith(']'):
            current_section = line[1:-1].lower()
            if current_section == 'signaldata':
                sections['_has_signal'] = {'_flag': 'true'}
                break  # skip signal data — too large
            header = None
            continue
        if current_section is None:
            continue
        if header is None:
            # First non-empty line after section header = column names
            header = [c.strip() for c in line.split(separator)]
        else:
            # Second non-empty line = values
            vals = [v.strip() for v in line.split(separator)]
            sections[current_section] = {
                _normalize_key(h): scale_text(v, unit_factor(h))   # N → mN, Ω → mΩ (units.py)
                for h, v in zip(header, vals)
                if v  # skip empty values
            }
            current_section = None  # section done (1 row per section)
            header = None

    return sections


def _sectioned_pairs(f, separator: str) -> list[tuple[str, str]]:
    """Sekční formát (TEST) pro export: (originální hlavička, hodnota) všech sekcí kromě [SignalData].

    Na rozdíl od _parse_sectioned zachová hlavičky s jednotkami i prázdné hodnoty — sloupce XLSX
    jsou pak u všech souborů stejné.
    """
    pairs: list[tuple[str, str]] = []
    header: list[str] | None = None
    in_section = False
    for raw_line in f:
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith('[') and line.endswith(']'):
            if line[1:-1].lower() == 'signaldata':
                break
            in_section, header = True, None
            continue
        if not in_section:
            continue
        if header is None:
            header = [c.strip() for c in line.split(separator)]
        else:
            vals = [v.strip() for v in line.split(separator)]
            pairs.extend((h, vals[i] if i < len(vals) else '') for i, h in enumerate(header))
            in_section, header = False, None
    return pairs


# Blokový PROD_ soubor (DatabaseGateway 2.3.0+): [Metadata], [TestingParameters], [SortingCategories],
# [SortingLimits], [Data]. Sekční TEST soubor začíná také [Metadata] / [TestingParameters] — rozliší je
# první blok, který má jen jeden z nich.
_PROD_ONLY_BLOCKS = frozenset({'data', 'sortingcategories', 'sortinglimits'})
_TEST_ONLY_BLOCKS = frozenset({'analyzedparameters', 'nokinfo', 'measuredinfo', 'signaldata'})
# Šarže v [Metadata] (Supplier_Order-LOT#1..n) = seznam za celou zakázku bez vazby na kus →
# do záznamů ani do exportu se nevkládá (kompatibilní čtení; zobrazení šarží je samostatný krok).
_LOT_PREFIX = 'supplier_order-lot'


def _prod_blocks_metadata(
    f, separator: str, blocks: dict[str, list[list[str]]] | None = None,
) -> tuple[list[str], list[str]] | None:
    """Blokový PROD_ soubor: přečte bloky před [Data] a vrátí (hlavička, hodnoty) bloku [Metadata].

    f stojí na začátku souboru; po návratu stojí za řádkem ``[Data]`` — další neprázdný řádek je
    datová hlavička (stejně jako u dvoudílného formátu). Vrácená metadata jsou bez šarží (vkládají
    se do záznamů). blocks: je-li předán slovník, doplní se do něj řádky (buňky) každého bloku
    před [Data] — {název bloku lowercase: [řádky]}, pro _order_info(). None = není blokový
    production soubor (sekční TEST nebo chybí [Data]) — volající vrátí f na začátek.
    """
    section: str | None = None
    meta_header: list[str] = []
    meta_vals:   list[str] = []
    rows = 0
    while True:
        raw = f.readline()
        if not raw:
            return None
        line = raw.strip()
        if not line:
            continue
        if line.startswith('[') and line.endswith(']'):
            section = line[1:-1].strip().lower()
            if section == 'data':
                keep = [i for i, h in enumerate(meta_header) if not h.lower().startswith(_LOT_PREFIX)]
                return ([meta_header[i] for i in keep],
                        [meta_vals[i] if i < len(meta_vals) else '' for i in keep])
            if section in _TEST_ONLY_BLOCKS:
                return None
            rows = 0
            continue
        if blocks is not None and section is not None:
            blocks.setdefault(section, []).append([c.strip() for c in line.split(separator)])
        if section == 'metadata':
            if rows == 0:
                meta_header = [c.strip() for c in line.split(separator)]
            elif rows == 1:
                meta_vals = [v.strip() for v in line.split(separator)]
            rows += 1


_UNIT_RE      = re.compile(r'^(?P<name>.*?)\s*\[(?P<unit>[^\]]*)\]\s*$')
_GROUP_COL_RE = re.compile(r'^group(?P<n>\d+)_(?P<side>min|max)$', re.IGNORECASE)
_LIMIT_ROWS   = {'max': 'max', 'min': 'min', 'max_supplier': 'max_supplier', 'min_supplier': 'min_supplier'}


def _split_unit(header: str) -> tuple[str, str]:
    """'Actuation_Speed [mm/s]' → ('Actuation_Speed', 'mm/s'); bez jednotky → (název, '')."""
    m = _UNIT_RE.match(header)
    return (m['name'].strip(), m['unit'].strip()) if m else (header.strip(), '')


def _modern_drive_params(testing: list[dict]) -> list[dict]:
    """Parametry pohonu ze souborů Gateway 2.3.0 (do 2026-10-15) pod současnými názvy jako v PLC.

    Gateway 2.3.0 zapisovala `Actuation_Speed;Acceleration;Jerk_Up;Jerk_Down` — Jerk_Up a Jerk_Down byly
    stejná hodnota (`Parameters.Drive.Jerk`), zpomalení (`Drive.Decceleration`) se nečetlo. Od 2.4.0
    `Velocity;Acceleration;Deceleration;Jerk`. Starý soubor se zobrazí stejně jako nový: Actuation_Speed →
    Velocity, Jerk_Up / Jerk_Down → Jerk, Deceleration bez hodnoty („—" — nevymýšlí se). Liší-li se
    Jerk_Up a Jerk_Down (nemělo by nastat), zůstanou oba beze změny. Nový formát se nemění.
    """
    by_key = {p['key']: p for p in testing}
    if 'actuation_speed' not in by_key and 'jerk_up' not in by_key:
        return testing
    up, down = by_key.get('jerk_up'), by_key.get('jerk_down')
    merge_jerk = up is not None and down is not None and up['value'] == down['value'] and 'jerk' not in by_key
    out: list[dict] = []
    for p in testing:
        k = p['key']
        if k == 'actuation_speed' and 'velocity' not in by_key:
            out.append({**p, 'key': 'velocity', 'name': 'Velocity'})
        elif k == 'acceleration':
            out.append(p)
            if 'deceleration' not in by_key:
                out.append({'key': 'deceleration', 'name': 'Deceleration', 'unit': p['unit'], 'value': None})
        elif merge_jerk and k == 'jerk_up':
            out.append({**p, 'key': 'jerk', 'name': 'Jerk'})
        elif merge_jerk and k == 'jerk_down':
            continue
        else:
            out.append(p)
    return out


def _order_info(blocks: dict[str, list[list[str]]]) -> dict:
    """Údaje zakázky z bloků blokového PROD_ souboru (Gateway 2.3.0+) pro detail zakázky.

    Hodnoty zůstávají textem jako v CSV (jednotky zákazníka — Gateway je zapisuje převedené);
    prázdná buňka = None (limit neaktivní / skupina se nepoužívá). Šarže v pořadí výskytu.
    """
    def pair(name: str) -> tuple[list[str], list[str]]:
        rows = blocks.get(name) or [[]]
        return rows[0], (rows[1] if len(rows) > 1 else [])

    def cell(vals: list[str], i: int) -> str | None:
        return (vals[i] or None) if i < len(vals) else None

    head, vals = pair('metadata')
    meta = {h: cell(vals, i) for i, h in enumerate(head)}
    lots = [v for h, v in meta.items() if h.lower().startswith(_LOT_PREFIX) and v]

    head, vals = pair('testingparameters')
    testing = []
    for i, h in enumerate(head):
        name, unit = _split_unit(h)
        testing.append({'key': _normalize_key(h), 'name': name, 'unit': unit, 'value': cell(vals, i)})
    testing = _modern_drive_params(testing)

    head, vals = pair('sortingcategories')
    categories: dict | None = None
    if head:
        groups: dict[int, dict] = {}
        unit = ''
        grouping = None
        for i, h in enumerate(head):
            name, u = _split_unit(h)
            m = _GROUP_COL_RE.match(name)
            if m:
                unit = unit or u
                groups.setdefault(int(m['n']), {'group': int(m['n']), 'min': None, 'max': None})[m['side'].lower()] = cell(vals, i)
            elif name.lower() == 'grouping_value':
                grouping = cell(vals, i)
        categories = {'grouping_value': grouping, 'unit': unit, 'groups': [groups[k] for k in sorted(groups)]}

    rows = blocks.get('sortinglimits') or []
    limits = []
    if rows:
        head = rows[0]
        by_kind = {_LIMIT_ROWS[r[0].strip().lower()]: r for r in rows[1:] if r and r[0].strip().lower() in _LIMIT_ROWS}
        for i, h in enumerate(head[1:], start=1):
            name, unit = _split_unit(h)
            item = {'key': _normalize_key(h), 'name': name, 'unit': unit}
            for kind in _LIMIT_ROWS.values():
                item[kind] = cell(by_kind.get(kind, []), i)
            limits.append(item)

    return {
        'recipe': meta.get('Recipe'),
        'lots': lots,
        'testing_parameters': testing,
        'sorting_categories': categories,
        'sorting_limits': limits,
    }


class FileMeta(Mapping):
    """Metadata jednoho souboru v přehledu — neměnná, kompaktní (__slots__), čte se jako dict.

    Cache drží přímo tyto objekty a výpis je vrací bez kopírování (neměnné → bezpečné).
    100 000 souborů ≈ desítky MB místo ~160 MB pro dict na soubor. Změna = nový objekt (replace).
    Klíče jako dřívější dict: file_id, name, type, location, order_id, switch_name, switch_id,
    created_at, record_count (None = dopočítává se) a sync_status (jen lokální soubory).
    switch_name = název mikrospínače (Microswitch_Name), switch_id = ID mikrospínače (Microswitch_ID,
    SAP číslo — jen blokový PROD_ soubor Gateway 2.3.0+, jinak ''). Rozlišovat: tři různé údaje
    (+ ID receptury v detailu zakázky). Dokud se soubor nepřečte (record_count None), je switch_name
    jen druhé pole názvu souboru — u nových souborů to je ID → frontend ukazuje „…".
    """
    __slots__ = ('file_id', 'type', 'location', 'order_id', 'switch_name', 'switch_id', 'created_at',
                 'record_count', 'sync_status', 'ts_final', 'path')
    _KEYS = ('file_id', 'name', 'type', 'location', 'order_id', 'switch_name', 'switch_id', 'created_at',
             'record_count')

    def __init__(self, file_id: str, type: str, location: str, order_id: str | None, switch_name: str,
                 created_at: str, record_count: int | None, sync_status: str | None = None,
                 ts_final: bool = True, path: str = '', switch_id: str = '') -> None:
        self.file_id      = file_id
        self.type         = sys.intern(type)
        self.location     = sys.intern(location)
        self.order_id     = order_id
        self.switch_name  = sys.intern(switch_name or '')
        self.switch_id    = switch_id or ''
        self.created_at   = created_at
        self.record_count = record_count
        self.sync_status  = sys.intern(sync_status) if sync_status else None
        self.ts_final     = ts_final          # created_at je konečný (z názvu / ze souboru)
        self.path         = path              # plná cesta (klíč cache)

    def __getitem__(self, key: str):
        if key == 'name':
            return self.file_id.rsplit('.', 1)[0]           # = Path.stem
        if key in self._KEYS or (key == 'sync_status' and self.sync_status is not None):
            return getattr(self, key)
        raise KeyError(key)

    def __iter__(self) -> Iterator[str]:
        yield from self._KEYS
        if self.sync_status is not None:
            yield 'sync_status'

    def __len__(self) -> int:
        return len(self._KEYS) + (self.sync_status is not None)

    def __repr__(self) -> str:
        return f"FileMeta({dict(self)!r})"

    def replace(self, **changes) -> FileMeta:
        vals = {s: getattr(self, s) for s in self.__slots__}
        vals.update(changes)
        return FileMeta(**vals)

    @classmethod
    def from_dict(cls, d: dict, path: str, ts_final: bool = True) -> FileMeta:
        return cls(d['file_id'], d['type'], d['location'], d.get('order_id'), d.get('switch_name', ''),
                   d.get('created_at', ''), d.get('record_count'), d.get('sync_status'), ts_final, path,
                   d.get('switch_id', ''))


class _MetaStore:
    """Cache metadat na disku (SQLite) — zapisují se jen změny, ne celý soubor.

    Tabulka known: trvalá znalost zakázek (název + velikost → počet kusů, zakázka, typ). Přežije
    smazání lokální kopie — archiv na NAS pak počty zná bez stahování celých souborů.

    Dřív JSON: 100 000 souborů = 42 MB přepisovaných při každé změně (~4 s s drženým GIL — server
    mezitím stál) a ~2,5 s načítání po startu. Poškozený / cizí soubor se zahodí a založí znovu.
    """
    _SCHEMA = '4'                    # 4: switch_id (ID mikrospínače, Gateway 2.3.0+)
    _COLS = ('path', 'mtime_ns', 'size', 'hidden', 'file_id', 'type', 'location', 'order_id',
             'switch_name', 'created_at', 'record_count', 'sync_status', 'ts_final', 'switch_id')

    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = threading.Lock()
        self._conn: sqlite3.Connection | None = self._open()

    def _open(self) -> sqlite3.Connection | None:
        for _ in range(2):
            conn = None
            try:
                self._path.parent.mkdir(parents=True, exist_ok=True)
                conn = sqlite3.connect(str(self._path), check_same_thread=False, isolation_level=None, timeout=5)
                conn.execute('PRAGMA journal_mode=WAL')
                conn.execute('PRAGMA synchronous=NORMAL')
                conn.execute('CREATE TABLE IF NOT EXISTS info (k TEXT PRIMARY KEY, v TEXT)')
                # Celá kontrola / migrace schématu v jedné transakci se zámkem zápisu — souběžný
                # start druhé instance ani přerušení uprostřed nenechá napůl migrovanou cache.
                conn.execute('BEGIN IMMEDIATE')
                row = conn.execute("SELECT v FROM info WHERE k='schema'").fetchone()
                keep_known = False
                if row is not None and row[0] == '3':
                    # 3 → 4 bez ztráty počtů kusů NAS archivu (audit Q14): known dostane sloupec
                    # switch_id (NULL = neznámé — lokální soubor se přečte znovu, NAS soubor si počet
                    # ponechá bez stahování); meta (lokální, levné) se založí znovu.
                    cols = {r[1] for r in conn.execute('PRAGMA table_info(known)')}
                    if 'switch_id' not in cols:
                        conn.execute('ALTER TABLE known ADD COLUMN switch_id TEXT')
                    conn.execute('DROP TABLE IF EXISTS meta')
                    row = None
                    keep_known = True
                if row is None or row[0] != self._SCHEMA:
                    conn.execute('DROP TABLE IF EXISTS meta')
                    if not keep_known:
                        conn.execute('DROP TABLE IF EXISTS known')
                        conn.execute('CREATE TABLE known (name TEXT PRIMARY KEY, size INTEGER, '
                                     'record_count INTEGER, order_id TEXT, switch_name TEXT, switch_id TEXT)')
                    conn.execute('CREATE TABLE meta (path TEXT PRIMARY KEY, mtime_ns INTEGER, size INTEGER, '
                                 'hidden INTEGER, file_id TEXT, type TEXT, location TEXT, order_id TEXT, '
                                 'switch_name TEXT, created_at TEXT, record_count INTEGER, sync_status TEXT, '
                                 'ts_final INTEGER, switch_id TEXT)')
                    conn.execute("INSERT OR REPLACE INTO info VALUES ('schema', ?)", (self._SCHEMA,))
                conn.execute('COMMIT')
                return conn
            except (sqlite3.Error, OSError) as exc:
                if isinstance(exc, sqlite3.OperationalError) and 'locked' in str(exc).lower():
                    # Cache drží jiná instance (druhý server) — nemazat jí ji, běžet jen v paměti
                    log.warning("[CSV]   cache metadat zamčená jinou instancí — jen v paměti")
                    if conn is not None:
                        conn.close()
                    return None
                log.warning("[CSV]   cache metadat nečitelná (%s) — zakládám novou", exc)
                if conn is not None:
                    conn.close()
                for suffix in ('', '-wal', '-shm'):
                    try:
                        Path(str(self._path) + suffix).unlink(missing_ok=True)
                    except OSError:
                        pass
        return None

    def load(self) -> list[tuple]:
        if self._conn is None:
            return []
        with self._lock:
            try:
                return self._conn.execute(f"SELECT {', '.join(self._COLS)} FROM meta").fetchall()
            except sqlite3.Error as exc:
                log.warning("[CSV]   cache metadat nelze načíst: %s", exc)
                return []

    def load_known(self) -> list[tuple]:
        if self._conn is None:
            return []
        with self._lock:
            try:
                return self._conn.execute("SELECT name, size, record_count, order_id, switch_name, switch_id FROM known").fetchall()
            except sqlite3.Error as exc:
                log.warning("[CSV]   tabulku známých zakázek nelze načíst: %s", exc)
                return []

    def write(self, upserts: list[tuple], deletes: list[str], known: list[tuple] | None = None) -> None:
        if not (upserts or deletes or known):
            return
        with self._lock:
            if self._conn is None:                       # cache zavřená (ukončení aplikace)
                return
            try:
                self._conn.execute('BEGIN')
                if upserts:
                    self._conn.executemany(
                        f"INSERT OR REPLACE INTO meta VALUES ({', '.join('?' * len(self._COLS))})", upserts)
                if deletes:
                    self._conn.executemany("DELETE FROM meta WHERE path = ?", [(p,) for p in deletes])
                if known:
                    self._conn.executemany("INSERT OR REPLACE INTO known VALUES (?, ?, ?, ?, ?, ?)", known)
                self._conn.execute('COMMIT')
            except sqlite3.Error as exc:
                log.warning("[CSV]   cache metadat nelze uložit: %s", exc)
                try:
                    self._conn.execute('ROLLBACK')
                except sqlite3.Error:
                    pass

    def close(self) -> None:
        with self._lock:
            if self._conn is not None:
                self._conn.close()
                self._conn = None


class CsvRepository:
    """Data Access Layer pro CSV soubory — otevírá soubory, vrací surová data."""

    def __init__(self, cfg: DataConfig, cache_file: Path | None = None,
                 background_counts: bool = False) -> None:
        """
        cache_file:        SQLite cache metadat na disku (None = jen v paměti — testy).
        background_counts: True = přehled souborů jen z názvů, počet kusů se dopočítá na pozadí
                           (aplikace); False = metadata se přečtou hned celá (testy, nástroje).
        """
        self._cfg = cfg
        # Cache metadat: cesta (str) → (mtime_ns, size, FileMeta | None). None = soubor bez
        # datových řádků (skrytý). Soubory DONE se po uzavření nemění; změna mtime/size cache zneplatní.
        self._meta: dict[str, tuple[int, int, FileMeta | None]] = {}
        self._folder_keys: dict[str, list[str]] = {}      # složka → klíče z posledního výpisu
        self._dirty: dict[str, tuple | None] = {}         # změny čekající na zápis do SQLite
        # Trvalá znalost zakázek: název → (size, record_count, order_id, switch_name, switch_id)
        # switch_id None = záznam z cache schématu 3 (ID ještě neznámé, audit Q14)
        self._known: dict[str, tuple[int, int, str | None, str, str | None]] = {}
        self._dirty_known: dict[str, tuple] = {}
        self._dirty_lock = threading.Lock()
        # Vyzvednutí dávky i zápis do SQLite naráz — dvě vlákna (skenování, dopočet) by jinak mohla zapsat v opačném
        # pořadí a starší řádek přepsat novější (record_count NULL → soubor z NAS se znovu stahuje). A26-41
        self._flush_lock = threading.Lock()
        self._store = _MetaStore(cache_file) if cache_file is not None else None
        self._load_store()
        # Index otevřených zakázek: cesta → ((mtime_ns, size), _OrderIndex) — LRU s limitem paměti
        self._index_cache: OrderedDict[Path, tuple[tuple[int, int], _OrderIndex]] = OrderedDict()
        self._index_lock = threading.Lock()
        # Stavba indexu jednoho souboru naráz — kiosk + kancelář / XLSX nad stejnou nenacachovanou zakázkou by ji
        # jinak stavěly dvakrát (2× CPU a stovky MB RAM); druhý počká a vezme hotový index (A26-39)
        self._build_locks: dict[Path, threading.Lock] = {}
        # Jedno skenování složky naráz — souběžné požadavky (auto-refresh, files_changed, druhé okno)
        # počkají na výsledek / dostanou poslední známý stav místo dalšího čtení
        self._scan_locks: dict[str, threading.Lock] = {}
        self._scan_locks_guard = threading.Lock()
        # Výpis NAS složky držený v paměti: složka → (čas, klíče) — 100 000 souborů = sekundy po síti
        self._listing: dict[str, tuple[float, list[str]]] = {}
        # Soubory, které zmizely ze složky (přesun done_local → done_remote po synchronizaci):
        # název → (mtime_ns, size, FileMeta) — v nové složce se metadata převezmou bez čtení souboru
        self._moved: OrderedDict[str, tuple[int, int, FileMeta]] = OrderedDict()
        # Dopočet počtu kusů na pozadí — fronta po lokalitách, bez duplicit
        self._bg_counts = background_counts
        self._count_pending: set[str] = set()
        self._count_lock = threading.Lock()
        self._count_queues: dict[str, queue.Queue] = {'local': queue.Queue(), 'remote': queue.Queue()}
        self._count_threads: list[threading.Thread] = []
        self._count_failed: dict[str, float] = {}          # klíč → čas selhání (monotonic) — odklad
        self._count_started: dict[str, float] = {}         # klíč → začátek běžícího dopočtu
        self._closed = False

    def close(self) -> None:
        """Ukončení aplikace — dopočet zastavit (nedokončený se při dalším startu naváže), cache uložit."""
        self._closed = True
        for q in self._count_queues.values():
            for _ in range(_COUNT_WORKERS):
                q.put(None)
        self._flush()
        if self._store is not None:
            self._store.close()

    # ------------------------------------------------------------------
    # Perzistentní cache metadat (SQLite)
    # ------------------------------------------------------------------

    def _load_store(self) -> None:
        if self._store is None:
            return
        for name, size, count, order_id, switch_name, switch_id in self._store.load_known():
            self._known[name] = (size, count, order_id, switch_name or '', switch_id)
        for (path, mtime_ns, size, hidden, file_id, ftype, location, order_id, switch_name,
             created_at, record_count, sync_status, ts_final, switch_id) in self._store.load():
            meta = None if hidden else FileMeta(file_id, ftype, location, order_id, switch_name or '',
                                                created_at or '', record_count, sync_status,
                                                bool(ts_final), path, switch_id or '')
            self._meta[path] = (mtime_ns, size, meta)
            self._folder_keys.setdefault(os.path.dirname(path), []).append(path)
        if self._meta:
            log.info("[CSV]   cache metadat načtena: %d souborů", len(self._meta))

    def _put(self, key: str, mtime_ns: int, size: int, meta: FileMeta | None, persist: bool = True) -> None:
        self._meta[key] = (mtime_ns, size, meta)
        if (meta is not None and persist and meta.type == 'production' and meta.record_count is not None):
            entry = (size, meta.record_count, meta.order_id, meta.switch_name, meta.switch_id)
            if self._known.get(meta.file_id) != entry:
                self._known[meta.file_id] = entry
                with self._dirty_lock:
                    self._dirty_known[meta.file_id] = (meta.file_id, *entry)
        if persist and self._store is not None:
            row = (key, mtime_ns, size, 1, '', '', '', None, '', '', None, None, 1, '') if meta is None else (
                key, mtime_ns, size, 0, meta.file_id, meta.type, meta.location, meta.order_id,
                meta.switch_name, meta.created_at, meta.record_count, meta.sync_status, int(meta.ts_final),
                meta.switch_id)
            with self._dirty_lock:
                self._dirty[key] = row

    def _drop(self, key: str) -> None:
        self._meta.pop(key, None)
        if self._store is not None:
            with self._dirty_lock:
                self._dirty[key] = None

    def _flush(self) -> None:
        if self._store is None:
            return
        with self._flush_lock:
            with self._dirty_lock:
                if not (self._dirty or self._dirty_known):
                    return
                dirty, self._dirty = self._dirty, {}
                known, self._dirty_known = self._dirty_known, {}
            self._store.write([r for r in dirty.values() if r is not None],
                              [k for k, r in dirty.items() if r is None], list(known.values()))

    # ------------------------------------------------------------------
    # Skenování složek
    # ------------------------------------------------------------------

    def list_local(self, file_type: str) -> list[FileMeta]:
        """Skenuje done_local/ + done_remote/ — vrátí metadata bez datumového filtru."""
        base = Path(self._cfg.local_path)
        results: list[FileMeta] = []
        for sync_status in ('done_local', 'done_remote'):
            results.extend(self._scan_folder(base / file_type / sync_status, file_type, 'local', sync_status))
        results.sort(key=lambda x: x['created_at'], reverse=True)
        log.debug("[CSV]   list_local %s → %d souborů", file_type, len(results))
        return results

    def list_wip(self, file_type: str) -> list[FileMeta]:
        """Rozpracované zakázky ve wip/ — soubor může být i bez datových řádků (právě založený)."""
        folder  = Path(self._cfg.local_path) / file_type / 'wip'
        results = self._scan_folder(folder, file_type, 'local', 'wip', suffix='_WIP.csv')
        results.sort(key=lambda x: x['created_at'], reverse=True)
        return results

    def list_remote(self, file_type: str) -> list[FileMeta]:
        """Čte přímo z NAS — flat složka (žádné done_local/done_remote podadresáře)."""
        if not self._cfg.remote_path:
            return []
        folder = Path(self._cfg.remote_path) / file_type
        # Bez předchozího folder.exists(): u nedostupného share vrací False (WinError 53/67) →
        # prázdný archiv s HTTP 200 místo posledního známého stavu / 503 (audit Q3, oprava N2).
        try:
            results = self._scan_folder(folder, file_type, 'remote', None)
        except (FileNotFoundError, NotADirectoryError) as exc:
            # WinError 53 / 67 / 64 (síťová cesta / share nenalezen, spojení ztraceno) = výpadek NAS —
            # rovnou 503, žádné další síťové volání (u visícího NAS by se čekání zdvojilo)
            if getattr(exc, 'winerror', None) in (53, 64, 67):
                raise
            if Path(self._cfg.remote_path).is_dir() and not folder.exists():   # share OK, podsložka chybí
                log.warning("[CSV]   NAS složka neexistuje: %s", folder)
                return []
            raise                                          # NAS nedostupný → 503 v API
        log.debug("[CSV]   list_remote %s → %d souborů", file_type, len(results))
        return results

    def _local_twin(self, name: str, file_type: str, size: int) -> Path | None:
        """Lokální kopie NAS souboru (done_remote / done_local) se stejnou velikostí, jinak None."""
        base = Path(self._cfg.local_path) / file_type
        for sub in ('done_remote', 'done_local'):
            candidate = base / sub / name
            try:
                if candidate.stat().st_size == size:
                    return candidate
            except OSError:
                continue
        return None

    def prefer_local(self, path: Path, file_type: str) -> Path:
        """NAS soubor, který leží i na PC u stroje (stejný název a velikost) → číst lokální kopii."""
        try:
            twin = self._local_twin(path.name, file_type, path.stat().st_size)
        except OSError:
            return path
        return twin or path

    def _collect(self, keys: list[str]) -> list[FileMeta]:
        out: list[FileMeta] = []
        for k in keys:
            e = self._meta.get(k)
            if e is not None and e[2] is not None:
                out.append(e[2])
        return out

    def _scan_folder(
        self,
        folder:      Path,
        file_type:   str,
        location:    str,
        sync_status: str | None,
        suffix:      str = '_DONE.csv',
    ) -> list[FileMeta]:
        """Výpis složky pod zámkem — jedno skenování naráz.

        NAS: výpis se drží _REMOTE_LISTING_TTL s; když skenování právě běží, dostane požadavek
        poslední známý stav (nečeká). Lokálně se čeká na výsledek (rychlé).
        """
        fkey = str(folder)
        with self._scan_locks_guard:
            lock = self._scan_locks.setdefault(fkey, threading.Lock())
        if location != 'remote':
            with lock:
                return self._scan_folder_locked(folder, file_type, location, sync_status, suffix)

        cached = self._listing.get(fkey)
        if cached is not None and time.monotonic() - cached[0] < _REMOTE_LISTING_TTL:
            return self._collect(cached[1])
        if not lock.acquire(blocking=False):
            if cached is not None:
                return self._collect(cached[1])            # skenování běží — poslední známý stav
            lock.acquire()
            cached = self._listing.get(fkey)               # mezitím naskenoval jiný požadavek
            if cached is not None and time.monotonic() - cached[0] < _REMOTE_LISTING_TTL:
                lock.release()
                return self._collect(cached[1])
        try:
            return self._scan_folder_locked(folder, file_type, location, sync_status, suffix)
        except OSError as exc:
            # NAS vypadl během výpisu — poslední známý stav (cache beze změny), jinak 503 v API.
            # Dřív se výpadek bral jako prázdná složka: smazaná cache a prázdný archiv s HTTP 200 (N2).
            if cached is not None:
                log.warning("[CSV]   výpis NAS %s selhal (%s) — poslední známý stav", folder, exc)
                return self._collect(cached[1])
            raise
        finally:
            lock.release()

    def _scan_folder_locked(
        self,
        folder:      Path,
        file_type:   str,
        location:    str,
        sync_status: str | None,
        suffix:      str = '_DONE.csv',
    ) -> list[FileMeta]:
        """Metadata všech souborů *suffix ve složce — z cache, soubor čte jen při změně mtime/size.

        Výkon (hlavně NAS):
          - os.scandir: velikost a mtime přijdou s výpisem složky (Windows FindFirstFile) —
            žádný samostatný stat() dotaz po síti pro každý soubor
          - background_counts: nové soubory jen z názvu (bez otevření); jinak se čtou paralelně
        WIP soubory (sync_status='wip') se čtou vždy celé (živý počet kusů) a neukládají se na disk.
        """
        fkey = str(folder)
        is_wip = sync_status == 'wip'
        entries: list[tuple[str, str, int, int, float]] = []     # (klíč, název, mtime_ns, size, mtime)
        try:
            with os.scandir(folder) as it:
                for e in it:
                    if e.name.endswith(suffix) and e.is_file():
                        st = e.stat()
                        entries.append((e.path, e.name, st.st_mtime_ns, st.st_size, st.st_mtime))
        except (FileNotFoundError, NotADirectoryError):
            if location == 'remote':
                raise           # NAS: WinError 53/67 = FileNotFoundError — výpadek, ne prázdná složka (N2)
            entries = []
        entries.sort(key=lambda x: x[1], reverse=True)

        changed = False
        misses: list[tuple[str, str, int, int, float]] = []
        for item in entries:
            key, name, mtime_ns, size, _ = item
            hit = self._meta.get(key)
            if hit is not None and hit[0] == mtime_ns and hit[1] == size:
                continue
            # Přesun done_local → done_remote (rename zachová mtime i velikost) — metadata převzít
            moved = self._moved.get(name) if (location == 'local' and not is_wip) else None
            if moved is not None and moved[0] == mtime_ns and moved[1] == size:
                self._put(key, mtime_ns, size, moved[2].replace(sync_status=sync_status, path=key))
                self._moved.pop(name, None)
                changed = True
                continue
            misses.append(item)

        if misses:
            quick = self._bg_counts and not is_wip
            to_read: list[tuple[str, str, int, int, float]] = []
            for item in misses:
                meta = self._quick_meta(item, file_type, location, sync_status) if quick else None
                if meta is not None:
                    self._put(item[0], item[2], item[3], meta)
                else:
                    to_read.append(item)                       # název bez času / bez background_counts

            def load(item: tuple[str, str, int, int, float]) -> tuple[tuple, FileMeta | None, bool]:
                key, name, mtime_ns, size, mtime = item
                try:
                    if quick:                                   # jen hlavička + první záznam
                        meta = self.read_file_meta(Path(key), file_type, location, sync_status, count=False)
                    else:
                        # NAS soubor je kopie lokálního done_remote/ — shodný název + velikost → lokálně
                        source = self._local_twin(name, file_type, size) if location == 'remote' else None
                        meta = self.read_file_meta(source or Path(key), file_type, location, sync_status,
                                                   allow_empty=is_wip)
                    if meta is not None and not meta.get('created_at'):
                        meta['created_at'] = datetime.fromtimestamp(mtime).isoformat(timespec='seconds')
                    return item, (FileMeta.from_dict(meta, key) if meta is not None else None), True
                except Exception as exc:
                    log.warning("[CSV]   přeskočen %s: %s", name, exc)
                    return item, None, False                    # necachovat — zkusit znovu příště

            if to_read:
                workers = min(len(to_read), _READ_WORKERS_REMOTE if location == 'remote' else _READ_WORKERS_LOCAL)
                if workers > 1:
                    with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="csv-meta") as ex:
                        loaded = list(ex.map(load, to_read))
                else:
                    loaded = [load(m) for m in to_read]
                for item, meta, ok in loaded:
                    if ok:
                        self._put(item[0], item[2], item[3], meta, persist=not is_wip)
            changed = True
            log.debug("[CSV]   %s: nových / změněných %d z %d souborů", folder.name, len(misses), len(entries))

        keys = [item[0] for item in entries]
        results = self._collect(keys)

        # Úklid: smazané / přesunuté soubory (done_local → done_remote) z cache odstranit
        prev = self._folder_keys.get(fkey)
        if prev:
            current = set(keys)
            for k in prev:
                if k in current:
                    continue
                gone = self._meta.get(k)
                self._drop(k)
                changed = True
                # přesun done_local → done_remote je jen lokální; zmizelý soubor z NAS sem nepatří (N5)
                if gone is not None and gone[2] is not None and not is_wip and location == 'local':
                    self._moved[os.path.basename(k)] = gone
                    while len(self._moved) > 2000:
                        self._moved.popitem(last=False)
        self._folder_keys[fkey] = keys
        if location == 'remote':
            self._listing[fkey] = (time.monotonic(), keys)

        # Lokálně dopočítat všechno (složku omezuje limit úložiště); NAS jen zobrazené (request_counts)
        if self._bg_counts and location == 'local' and not is_wip:
            self.request_counts([m for m in results if m.record_count is None])
        if changed and not is_wip:
            self._flush()
        return results

    # ------------------------------------------------------------------
    # Přehled z názvů souborů + dopočet na pozadí
    # ------------------------------------------------------------------

    def _quick_meta(self, item: tuple[str, str, int, int, float], file_type: str, location: str,
                    sync_status: str | None) -> FileMeta | None:
        """Metadata bez otevření souboru — z názvu (zakázka, typ, čas založení) a složky (sync).

        Testing = vždy 1 záznam (hotovo). Production: record_count None → dopočet na pozadí.
        None = název nenese čas (starší / ručně pojmenovaný soubor) → přečte se jen hlavička.
        """
        key, name, _, size, _ = item
        m = (_NAME_TEST if file_type == 'testing' else _NAME_PROD).match(name)
        created = _name_ts(m['d'], m['t']) if m else None
        if created is None:
            return None
        order_id = m['order'] if file_type == 'production' else None
        switch   = m['switch']                  # název (≤ 2.2.0) nebo ID mikrospínače (2.3.0+) — z názvu nepoznat
        switch_id = ''
        count    = 1 if file_type == 'testing' else None
        known = self._known.get(name) if file_type == 'production' else None
        # Zakázka už jednou spočítaná (i když kopie zmizela). Záznam bez ID (cache schématu 3):
        # lokální soubor raději přečíst znovu (levné), NAS soubor si ponechá počet bez stahování.
        if known is not None and known[0] == size and (known[4] is not None or location == 'remote'):
            count, order_id, switch, switch_id = known[1], known[2], known[3], known[4] or ''
        return FileMeta(
            file_id=name, type=file_type, location=location, order_id=order_id,
            switch_name=switch, created_at=created, record_count=count,
            sync_status=sync_status, ts_final=True, path=key, switch_id=switch_id,
        )

    def request_counts(self, metas: Iterable[Mapping]) -> None:
        """Zařadit dopočet počtu kusů (jen soubory bez počtu, bez duplicit)."""
        if not self._bg_counts or self._closed:
            return
        now = time.monotonic()
        for meta in metas:
            if not isinstance(meta, FileMeta) or meta.record_count is not None or not meta.path:
                continue
            with self._count_lock:
                if meta.path in self._count_pending:
                    continue
                failed = self._count_failed.get(meta.path)
                if failed is not None:
                    if now - failed < _COUNT_RETRY_S:
                        continue                               # nedávno selhalo — počkat
                    del self._count_failed[meta.path]
                self._count_pending.add(meta.path)
                self._ensure_count_threads()
            self._count_queues[meta.location].put(meta.path)

    def _ensure_count_threads(self) -> None:
        if self._count_threads:
            return
        for loc in ('local', 'remote'):
            for i in range(_COUNT_WORKERS):
                t = threading.Thread(target=self._count_worker, args=(loc,), daemon=True,
                                     name=f"csv-count-{loc}-{i}")
                t.start()
                self._count_threads.append(t)

    def _count_worker(self, location: str) -> None:
        q = self._count_queues[location]
        while True:
            key = q.get()
            if key is None or self._closed:
                return
            with self._count_lock:
                self._count_started[key] = time.monotonic()
            try:
                self._count_job(key)
            finally:
                with self._count_lock:
                    self._count_started.pop(key, None)
                    self._count_pending.discard(key)
                    drained = not self._count_pending
                if drained or q.qsize() % 25 == 0:
                    self._flush()

    def _count_job(self, key: str) -> None:
        """Přesná metadata (počet kusů, zakázka a typ z metadat souboru) do cache."""
        e = self._meta.get(key)
        if e is None or e[2] is None or e[2].record_count is not None:
            return
        mtime_ns, size, meta = e
        path = Path(key)
        try:
            source = self._local_twin(path.name, meta.type, size) if meta.location == 'remote' else None
            full = self.read_file_meta(source or path, meta.type, meta.location, meta.sync_status)
        except (UnicodeDecodeError, csv.Error) as exc:               # poškozený obsah — trvale
            log.warning("[CSV]   dopočet %s: nečitelný soubor, skryt: %s", path.name, exc)
            full = None
        except Exception as exc:                                     # I/O (NAS, zámek) — přechodné
            log.warning("[CSV]   dopočet %s selhal, zopakuje se za %d s: %s",
                        path.name, _COUNT_RETRY_S, exc)
            with self._count_lock:
                self._count_failed[key] = time.monotonic()
                if len(self._count_failed) > 10_000:                 # strop — nejstarší pryč
                    oldest = min(self._count_failed, key=self._count_failed.__getitem__)
                    del self._count_failed[oldest]
            return
        now = self._meta.get(key)
        if now is None or now[0] != mtime_ns or now[1] != size:      # soubor se mezitím změnil / zmizel
            return
        if full is None:                                             # bez datových řádků / nečitelný — skrýt
            self._put(key, mtime_ns, size, None)
            return
        changes = dict(order_id=full.get('order_id'), switch_name=full.get('switch_name', ''),
                       switch_id=full.get('switch_id', ''), record_count=full.get('record_count'))
        if not meta.ts_final:                                        # čas z názvu nešel → ze souboru
            changes.update(created_at=full.get('created_at') or meta.created_at, ts_final=True)
        self._put(key, mtime_ns, size, meta.replace(**changes))

    def counts_pending(self, metas: Iterable[Mapping] | None = None) -> bool:
        """Čeká-li nějaký dopočet (s `metas` jen pro tyto soubory, např. zobrazenou stránku).

        Nepočítají se zaseknuté (> _COUNT_STALL_S) ani soubory v odkladu po selhání
        (`_count_failed` — `request_counts` je do fronty nezařadí), jinak by se klient ptal donekonečna.
        """
        with self._count_lock:
            if metas is None:
                waiting = set(self._count_pending)
            else:
                waiting = {m.path for m in metas
                           if isinstance(m, FileMeta) and m.record_count is None and m.path}
                waiting &= self._count_pending
            if not waiting:
                return False
            limit = time.monotonic() - _COUNT_STALL_S
            stalled = {k for k, t in self._count_started.items() if t < limit}
            if len(stalled) >= _COUNT_WORKERS:     # všechna vlákna visí (NAS) — fronta nepostoupí
                return False
            return bool(waiting - stalled)

    # ------------------------------------------------------------------
    # Čtení jednotlivého souboru
    # ------------------------------------------------------------------

    def read_file_meta(
        self,
        path:        Path,
        file_type:   str,
        location:    str,
        sync_status: str | None,   # 'wip' | 'done_local' | 'done_remote' | None (remote)
        allow_empty: bool = False, # True = vrátit metadata i bez datových řádků (WIP soubor)
        count:       bool = True,  # False = jen hlavička + první záznam, record_count None (rychlé)
    ) -> dict | None:
        """
        Přečte metadata jednoho CSV souboru — první řádek + počet řádků.
        Čistá I/O operace: otevři soubor → přečti → zavři.
        O(1) paměť (nepočítá záznamy do listu).

        Podporuje formáty:
          Starý (jednodílný): Timestamp;Order;Microswitch_ID;...  → data od řádku 1
          Dvoudílný (≤ 2.2.0): metadata sekce (řádky 1–3) + data sekce (řádek 4+)
            Řádek 1: Order;Microswitch_ID;Microswitch_Name
            Řádek 2: {hodnoty}
            Řádek 3: (prázdný)
            Řádek 4: Timestamp;OF_OperatingForce;...  ← data header
          Blokový (Gateway 2.3.0+): [Metadata] … [Data] — switch_name = Microswitch_Name,
            switch_id = Microswitch_ID (SAP číslo, i v názvu souboru), viz _prod_blocks_metadata
          Sekční TEST: [Metadata] + [AnalyzedParameters] + …
        """
        with open_shared(path, encoding=self._cfg.csv_encoding, newline='') as f:
            line1 = f.readline().strip()
            first_col = line1.split(self._cfg.csv_separator)[0].strip()

            blocks = None
            switch_id = ''                              # ID mikrospínače — jen blokový formát
            if line1.startswith('['):
                f.seek(0)
                blocks = _prod_blocks_metadata(f, self._cfg.csv_separator)
                if blocks is None:
                    f.seek(0)

            if blocks is not None:
                # Blokový production soubor — f stojí na datové hlavičce
                meta_row    = dict(zip(*blocks))
                order_id    = meta_row.get('Order')
                switch_name = meta_row.get('Microswitch_Name', '')
                switch_id   = meta_row.get('Microswitch_ID', '')
            elif line1.startswith('['):
                # Sekční formát (TEST) — [Metadata] + [AnalyzedParameters] + …
                sections = _parse_sectioned(f, self._cfg.csv_separator)
                md = sections.get('metadata', {})
                meta: dict = {
                    'file_id':      path.name,
                    'name':         path.stem,
                    'type':         file_type,
                    'location':     location,
                    'order_id':     None,
                    'switch_name':  md.get('microswitch_name', ''),
                    'created_at':   md.get('timestamp', ''),
                    'record_count': 1,
                }
                if sync_status is not None:
                    meta['sync_status'] = sync_status
                return meta

            elif first_col.lower() == 'timestamp':
                # Starý jednodílný formát — první řádek je datový header
                f.seek(0)
                order_id    = None
                switch_name = ''
            else:
                # Nový dvoudílný formát — přečíst metadata sekci
                meta_header = [c.strip() for c in line1.split(self._cfg.csv_separator)]
                meta_vals   = [v.strip() for v in f.readline().strip().split(self._cfg.csv_separator)]
                meta_row    = dict(zip(meta_header, meta_vals))
                f.readline()   # přeskočit prázdný oddělovací řádek
                order_id    = meta_row.get('Order')
                switch_name = meta_row.get('Microswitch_Name', '')
                # f je nyní na datovém headeru (řádek 4) — DictReader ho použije jako sloupce

            reader = csv.DictReader(f, delimiter=self._cfg.csv_separator)
            raw_first = next(iter(reader), None)
            if raw_first is None:
                if not allow_empty:
                    return None
                raw_first = {}                          # WIP bez záznamů — jen metadata
            first = {_normalize_key(k): v for k, v in raw_first.items() if k}

            # Ve starém formátu jsou Order/Microswitch_Name v datových řádcích
            if first_col.lower() == 'timestamp':
                order_id    = first.get('order') if file_type == 'production' else None
                switch_name = first.get('microswitch_name', '')

            # Zbylé řádky jen spočítat — bez stavby dict pro každý řádek (50 000 kusů: ~0,3 s → ~0,02 s).
            # Prázdný řádek DictReader přeskakuje → nepočítat; vícařádkové hodnoty v CSV nejsou.
            record_count = ((1 if raw_first else 0) + sum(1 for line in f if line.strip('\r\n'))
                            if count else None)

        meta = {
            'file_id':      path.name,
            'name':         path.stem,
            'type':         file_type,
            'location':     location,
            'order_id':     order_id if file_type == 'production' else None,
            'switch_name':  switch_name,
            'switch_id':    switch_id if file_type == 'production' else '',
            'created_at':   first.get('timestamp', ''),
            'record_count': record_count,
        }
        if sync_status is not None:
            meta['sync_status'] = sync_status
        return meta

    def finish_wip(self, path: Path) -> Path:
        """
        Ručně dokončí rozpracovanou zakázku: wip/…_WIP.csv → done_local/…_DONE.csv (jako Op3 v DatabaseGateway).

        Neúplný poslední řádek (výpadek proudu při zápisu kusu) se odřízne, data na disk (fsync), pak atomický
        přesun ve svazku (os.replace — nikdy kopie). Gateway soubor v done_local/ převezme do fronty pro NAS sama
        (register_untracked, do ~1,5 min); chybějící WIP pozná a další kus zakázky odmítne (Rejected).
        Gateway drží soubor (zápis kusu) → krátké opakování, trvalý zámek → PermissionError (API 409).

        Raises:
            FileExistsError: DONE soubor stejného jména už existuje (done_local / done_remote).
        """
        done_name = path.name[: -len('_WIP.csv')] + '_DONE.csv'
        base = path.parent.parent
        dst = base / 'done_local' / done_name
        if dst.exists() or (base / 'done_remote' / done_name).exists():
            raise FileExistsError(done_name)
        dst.parent.mkdir(parents=True, exist_ok=True)
        for attempt in range(_DELETE_ATTEMPTS):
            try:
                with open(path, 'r+b') as f:
                    _truncate_partial_line(f, path.name)
                    f.flush()
                    os.fsync(f.fileno())
                os.replace(path, dst)
                break
            except PermissionError:
                if attempt == _DELETE_ATTEMPTS - 1:
                    raise
                time.sleep(_DELETE_DELAY_S)
        log.warning("[CSV]   rozpracovaná zakázka dokončena ručně: %s → done_local/%s", path.name, done_name)
        return dst

    def delete_file(self, path: Path) -> None:
        """Smaže CSV soubor z lokálního úložiště.

        DatabaseGateway může soubor právě držet (zápis kusu do rozpracované zakázky, přesun) → WinError 32.
        Krátce zopakovat (~1 s); trvalý zámek propustí PermissionError → API 409 „soubor se právě používá".
        """
        for attempt in range(_DELETE_ATTEMPTS):
            try:
                path.unlink()
                break
            except PermissionError:
                if attempt == _DELETE_ATTEMPTS - 1:
                    raise
                time.sleep(_DELETE_DELAY_S)
        log.info("[CSV]   smazán soubor: %s", path.name)

    def read_records(
        self,
        path:      Path,
        from_date: str | None = None,
        to_date:   str | None = None,
        page:     int = 1,
        per_page: int = 0,     # 0 = všechny záznamy
        timeline: list[tuple[str, str]] | None = None,
        categories: frozenset[str] | None = None,
        status:     str | None = None,
        stats:      dict[str, Any] | None = None,
        order:      str = 'asc',
        nok:        frozenset[str] | None = None,
    ) -> tuple[list[dict], int, dict[str, int], int | None]:
        """
        Přečte záznamy z CSV souboru.
        Vrátí (records, total_matching, group_counts, file_expected_count).

        categories / status: filtr detailu zakázky (production) — kategorie '1'–'6' a/nebo
        'ok' / 'nok'. nok: NOK oblasti z NOK_CATEGORIES ('force', 'electric', …) — kus projde, když
        nevyhověl ALESPOŇ v jedné vybrané (NokCategory_* = 1); soubor bez těchto sloupců → nic.
        Filtry se kombinují (A ZÁROVEŇ). total_matching a stránkování platí pro vyfiltrované záznamy; group_counts,
        timeline a expected_count dál pro celý soubor. Při aktivním filtru nese každý záznam
        `_idx` = pořadí v nefiltrovaném souboru (odkaz na detail záznamu `?record=N`).
        stats: je-li předán slovník, doplní se `total_all` = počet záznamů bez filtru kategorií,
        `order_info` = údaje zakázky z bloků blokového PROD_ souboru (ze stejného indexu —
        bez druhého čtení souboru; audit Q7) a `nok_counts` = počet kusů s NOK v každé oblasti
        za celý soubor (po filtru data; None = soubor sloupce NokCategory_* nemá).

        order: 'asc' = od nejstaršího (pořadí výroby), 'desc' = od nejnovějšího. Řadí se podle
        pořadí v souboru, ne podle textu času — Gateway zapisuje kusy tak, jak vznikají, a při
        posunu hodin (konec letního času) by řazení podle času pořadí výroby rozházelo.
        Při 'desc' nese každý záznam `_idx` (stránka už neodpovídá pořadí v zakázce).

        timeline: je-li předán seznam, doplní se do něj (timestamp, kategorie) KAŽDÉHO záznamu
        celého souboru (po filtru) — časový průběh zakázky bez přenášení všech parametrů.

        per_page=0: vrátí všechny záznamy (zpětná kompatibilita).
        per_page>0: stránkování; group_counts + file_expected_count se agregují přes celý
        soubor ve stejné smyčce.

        Výkon: production soubor se čte jen jednou — _OrderIndex (surové řádky + předpočítaný
        čas / kategorie / stav) zůstává v paměti (LRU _INDEX_CACHE_FILES), dokud se soubor
        nezmění. Další stránky, filtry, detail kusu a časový průběh jdou z paměti a dict se
        staví jen pro vrácené řádky (50 000 kusů: ~1,2 s → setiny sekundy).
        """
        from_day = _date.fromisoformat(from_date) if from_date else None
        to_day   = _date.fromisoformat(to_date)   if to_date   else None
        try:
            ix = self._order_index(path)
            if ix is None:                                   # sekční formát (TEST)
                with open_shared(path, encoding=self._cfg.csv_encoding, newline='') as f:
                    return self._read_sectioned(f, from_day, to_day)
        except (UnicodeDecodeError, csv.Error) as exc:
            # csv.Error: NUL byte, překročený field_size_limit — poškozený soubor ≠ HTTP 500.
            # OSError (NAS nedostupný, zámek) propadne do API → 503 / 404, ne „prázdná zakázka".
            log.error("[CSV]   chyba čtení %s: %s", path.name, exc)
            return [], 0, {}, None

        records: list[dict] = []
        total = 0
        group_counts: dict[str, int] = {}
        file_expected_count: int | None = None
        ec_const = ix.meta_inject.get('expected_count', '') if ix.ec is None else ''
        from_o   = from_day.toordinal() if from_day else None
        to_o     = to_day.toordinal()   if to_day   else None
        offset   = (page - 1) * per_page if per_page > 0 else 0
        nok_sel  = 0
        for c in nok or ():
            nok_sel |= _NOK_BIT.get(c, 0)
        filtering = bool(categories) or status in ('ok', 'nok') or bool(nok)
        descending = order == 'desc'
        picked: list[tuple[int, int]] = []                   # (řádek v indexu, pořadí v zakázce)

        # 1) filtr data + souhrny za celý soubor — vždy v pořadí výroby (timeline, expected_count)
        days, grps, noks = ix.days, ix.grp, ix.nok
        nok_counts = [0] * len(NOK_CATEGORIES) if noks is not None else None
        rows: list[int] = []                                 # řádky v indexu po filtru data
        for i in range(len(ix.lines)):
            d = days[i]
            if d >= 0:                                       # neparsovatelný čas projde filtrem
                if from_o is not None and d < from_o:
                    continue
                if to_o is not None and d > to_o:
                    continue
            grp = grps[i]
            rows.append(i)
            if grp:
                group_counts[grp] = group_counts.get(grp, 0) + 1
            if nok_counts is not None and noks[i]:
                m = noks[i]
                for b in range(len(NOK_CATEGORIES)):
                    if m >> b & 1:
                        nok_counts[b] += 1
            if timeline is not None:
                timeline.append((ix.ts[i], grp))
            if file_expected_count is None:
                ec = ix.ec[i] if ix.ec is not None else ec_const
                if ec:
                    try:
                        file_expected_count = int(ec)
                    except (ValueError, TypeError):
                        pass
        total_all = len(rows)

        # 2) filtr kusů + stránka v požadovaném pořadí (idx = pořadí v zakázce)
        for idx in (range(total_all - 1, -1, -1) if descending else range(total_all)):
            i = rows[idx]
            if filtering and not _record_matches({'status': ix.status[i]}, grps[i], categories, status):
                continue
            if nok_sel and (noks is None or not noks[i] & nok_sel):
                continue
            total += 1
            if per_page == 0 or offset < total <= offset + per_page:
                picked.append((i, idx))

        # dict jen pro vrácené řádky — stejná podoba jako dřív z csv.DictReader nad celým souborem
        reader = csv.DictReader((ix.lines[i] for i, _ in picked),
                                fieldnames=ix.fieldnames, delimiter=self._cfg.csv_separator)
        scales = ix.scales or {}
        for row, (_, idx) in zip(reader, picked):
            rec = {_normalize_key(k): v for k, v in row.items() if k}
            for sk, factor in scales.items():                    # N → mN, Ω → mΩ (units.py)
                if sk in rec:
                    rec[sk] = scale_text(rec[sk], factor)
            for mk, mv in ix.meta_inject.items():
                if mk not in rec:
                    rec[mk] = mv
            if filtering or descending:
                rec['_idx'] = str(idx)
            records.append(rec)
        if stats is not None:
            stats['total_all'] = total_all
            stats['order_info'] = ix.order_info
            stats['nok_counts'] = (dict(zip(NOK_CATEGORIES, nok_counts)) if nok_counts is not None else None)
        return records, total, group_counts, file_expected_count

    def _read_sectioned(self, f, from_day: _date | None, to_day: _date | None,
                        ) -> tuple[list[dict], int, dict[str, int], int | None]:
        """Sekční formát (TEST) — sekce sloučené do jednoho záznamu, [SignalData] se nečte."""
        sections = _parse_sectioned(f, self._cfg.csv_separator)
        rec: dict[str, str] = {}
        for sec_name in ('metadata', 'testingparameters', 'analyzedparameters', 'nokinfo', 'measuredinfo'):
            rec.update(sections.get(sec_name, {}))
        if '_has_signal' in sections:
            rec['_has_signal'] = 'true'
        if from_day or to_day:
            try:
                ts_day = _date.fromisoformat(rec.get('timestamp', '')[:10])
            except ValueError:
                pass
            else:
                if (from_day and ts_day < from_day) or (to_day and ts_day > to_day):
                    return [], 0, {}, None
        return [rec], 1, {}, None

    # ------------------------------------------------------------------
    # Index zakázky (production) — cache v paměti
    # ------------------------------------------------------------------

    def _order_index(self, path: Path) -> _OrderIndex | None:
        """Index souboru z cache, při změně (mtime / size) nebo poprvé ho postaví.

        None = sekční formát (TEST) — ten se neindexuje (jeden záznam, signál se čte zvlášť).
        """
        st  = os.stat(path)
        sig = (st.st_mtime_ns, st.st_size)
        with self._index_lock:
            hit = self._index_cache.get(path)
            if hit is not None and hit[0] == sig:
                self._index_cache.move_to_end(path)
                return hit[1]
            build_lock = self._build_locks.setdefault(path, threading.Lock())
        with build_lock:
            with self._index_lock:                      # mezitím ho postavil jiný požadavek
                hit = self._index_cache.get(path)
                if hit is not None and hit[0] == sig:
                    self._index_cache.move_to_end(path)
                    return hit[1]
            try:
                ix = self._build_index(path, st.st_size)
                if ix is not None and ix.nbytes <= _INDEX_CACHE_BYTES:
                    with self._index_lock:
                        self._index_cache[path] = (sig, ix)
                        self._index_cache.move_to_end(path)
                        while (len(self._index_cache) > _INDEX_CACHE_FILES
                               or sum(v[1].nbytes for v in self._index_cache.values()) > _INDEX_CACHE_BYTES):
                            self._index_cache.popitem(last=False)
            finally:
                with self._index_lock:
                    self._build_locks.pop(path, None)
        return ix

    def _build_index(self, path: Path, size: int = 0) -> _OrderIndex | None:
        """Jedno přečtení souboru → _OrderIndex. Formát a pravidla jako csv.DictReader nad souborem.

        Production soubor nad _MAX_ORDER_FILE_BYTES → FileTooLargeError (dřív index celý v paměti
        a nad 256 MB bez cache → každý klik nové čtení, 290 MB soubor = 660 MB RAM; audit Q7).
        TEST (sekční, signál až 40 MB+) se neindexuje — strop se ho netýká.
        """
        sep = self._cfg.csv_separator
        with open_shared(path, encoding=self._cfg.csv_encoding, newline='') as f:
            line1 = f.readline().strip()
            first_col = line1.split(sep)[0].strip()
            meta_header: list[str] = []
            meta_vals:   list[str] = []
            order_info:  dict | None = None
            if line1.startswith('['):
                f.seek(0)                                    # blokový formát (Gateway 2.3.0+)
                raw_blocks: dict[str, list[list[str]]] = {}
                blocks = _prod_blocks_metadata(f, sep, raw_blocks)
                if blocks is None:
                    return None                              # sekční TEST — neindexuje se
                meta_header, meta_vals = blocks
                order_info = _order_info(raw_blocks)
            elif first_col.lower() == 'timestamp':
                f.seek(0)                                    # starý jednodílný formát
            else:
                meta_header = [c.strip() for c in line1.split(sep)]
                meta_vals   = [v.strip() for v in f.readline().strip().split(sep)]
                f.readline()                                 # prázdný oddělovací řádek
            meta_inject = {k.lower(): v for k, v in zip(meta_header, meta_vals) if v}
            if size > _MAX_ORDER_FILE_BYTES:
                raise FileTooLargeError(size)

            buf: list[str] = []                              # surové řádky aktuálního záznamu

            def source() -> Iterator[str]:
                for line in f:
                    buf.append(line)
                    yield line

            rd = csv.reader(source(), delimiter=sep)
            fieldnames: list[str] = []
            for row in rd:                                   # hlavička = první neprázdný řádek
                buf.clear()
                if row:
                    fieldnames = row
                    break
            # poslední sloupec se stejným klíčem vyhrává — stejně jako při stavbě dict
            pos = {_normalize_key(k): i for i, k in enumerate(fieldnames)}

            def cell(row: list[str], key: str, meta_default: str = '') -> str | None:
                i = pos.get(key)
                if i is None:
                    return meta_inject.get(key, meta_default)
                return row[i] if i < len(row) else None

            has_ec = 'expected_count' in pos
            nok_idx = [(pos[f'nokcategory_{c}'], _NOK_BIT[c]) for c in NOK_CATEGORIES if f'nokcategory_{c}' in pos]
            intern = sys.intern
            lines: list[str] = []
            ts_l: list[str] = []
            days: list[int] = []
            grp_l: list[str] = []
            st_l: list[str] = []
            ec_l: list[str] | None = [] if has_ec else None
            nok_l: list[int] | None = [] if nok_idx else None
            for row in rd:
                raw = ''.join(buf)
                buf.clear()
                if not row:                                  # prázdný řádek (DictReader ho přeskočí)
                    continue
                lines.append(raw)
                ts = cell(row, 'timestamp') or ''
                ts_l.append(ts)
                try:
                    days.append(_date.fromisoformat(ts[:10]).toordinal())
                except ValueError:
                    days.append(-1)
                grp_l.append(intern(str(cell(row, 'group') or cell(row, 'sortingcategory') or '').strip()))
                st_l.append(intern(cell(row, 'status') or ''))
                if ec_l is not None:
                    ec_l.append(cell(row, 'expected_count') or '')
                if nok_l is not None:
                    mask = 0
                    for ci, bit in nok_idx:
                        if ci < len(row) and row[ci].strip() == '1':
                            mask |= bit
                    nok_l.append(mask)                       # malé int — sdílené objekty, paměť ~8 B / řádek
        nbytes = sum(len(x) for x in lines) + len(lines) * 260      # text + seznamy, časy, objekty
        scales = {_normalize_key(k): unit_factor(k) for k in fieldnames if unit_factor(k) != 1.0}
        return _OrderIndex(meta_header, meta_vals, meta_inject, fieldnames,
                           lines, ts_l, days, grp_l, st_l, ec_l, nbytes, scales, order_info, nok_l)

    def read_order_info(self, path: Path) -> dict | None:
        """Údaje zakázky (receptura, šarže, testovací parametry, kategorie, limity) — jen blokový
        PROD_ soubor (Gateway 2.3.0+), jinak None. Z indexu zakázky v paměti (stejný jako read_records)."""
        try:
            ix = self._order_index(path)
        except (UnicodeDecodeError, csv.Error) as exc:
            log.error("[CSV]   chyba čtení %s: %s", path.name, exc)
            return None
        return ix.order_info if ix is not None else None

    def read_blocks_export(
        self, path: Path,
    ) -> tuple[list[tuple[str, list[list[str]]]], list[str], Iterator[list[str]]] | None:
        """Blokový PROD_ soubor pro XLSX podle vzoru Gateway (sample_production.xlsx).

        Returns: (bloky před [Data] v pořadí souboru jako (název, řádky buněk) — i šarže, datová hlavička,
        datové řádky) nebo None, není-li soubor blokový production. Datová část jako read_table (jednotky
        zákazníka, rozepnutý kontakt 9999.9), ale bez vložených metadat — ta jsou v bloku [Metadata].
        """
        sep = self._cfg.csv_separator
        blocks: list[tuple[str, list[list[str]]]] = []
        with open_shared(path, encoding=self._cfg.csv_encoding, newline='') as f:
            for raw in f:
                line = raw.strip()
                if not line:
                    continue
                if line.startswith('[') and line.endswith(']'):
                    title = line[1:-1].strip()
                    if title.lower() == 'data':
                        break
                    if title.lower() in _TEST_ONLY_BLOCKS:
                        return None
                    blocks.append((title, []))
                elif blocks:
                    blocks[-1][1].append([c.strip() for c in line.split(sep)])
                else:
                    return None                              # nezačíná blokem — starší formát
            else:
                return None                                  # bez [Data]
        ix = self._order_index(path)
        if ix is None or not ix.meta_header:
            return None
        header, rows = self._export_data(ix)
        return blocks, header, rows

    def _export_data(self, ix: _OrderIndex) -> tuple[list[str], Iterator[list[str]]]:
        """Datová část zakázky pro export: hlavička a řádky v jednotkách zákazníka (export_header / export_value)."""
        heads  = list(ix.fieldnames)
        pos    = {_normalize_key(k): i for i, k in enumerate(heads)}
        scale  = None
        for row in csv.reader(iter(ix.lines), delimiter=self._cfg.csv_separator):
            cell = lambda k: row[pos[k]] if k in pos and pos[k] < len(row) else None  # noqa: E731
            scale = position_scale(cell('fp_freeposition'), cell('ttp_totaltravelposition'))
            if scale is not None:
                break
        convert = [i for i, k in enumerate(heads) if export_value(k, '1') != '1' or k.lower().startswith('r_')]

        def converted(row: list[str]) -> list[str]:
            for i in convert:
                if i < len(row):
                    row[i] = export_value(heads[i], row[i])
            return row
        rows = (converted(row) for row in csv.reader(iter(ix.lines), delimiter=self._cfg.csv_separator) if row)
        return [export_header(k, scale) for k in heads], rows

    def read_table(self, path: Path) -> tuple[list[str], Iterator[list[str]]]:
        """Celý soubor jako tabulka pro export (XLSX): originální názvy sloupců i hodnoty.

        Production: metadata (Order, Microswitch_ID, …) jako první sloupce + datová část.
        Testing (sekční): jeden řádek se sloučenými sekcemi, originální hlavičky (bez [SignalData]).
        Hodnoty i jednotky v hlavičce v jednotkách zákazníka (N → mN, Ω → mΩ), jako na obrazovce;
        rozepnutý kontakt jednotně 9999.9; polohy na stupnici enkodéru (starší soubory) mají v hlavičce
        „[um, encoder]" (units.export_header / export_value).
        """
        ix = self._order_index(path)
        if ix is None:
            with open_shared(path, encoding=self._cfg.csv_encoding, newline='') as f:
                pairs = _sectioned_pairs(f, self._cfg.csv_separator)
            vals  = {_normalize_key(h): v for h, v in pairs}
            scale = position_scale(vals.get('fp_freeposition'), vals.get('ttp_totaltravelposition'))
            return ([export_header(h, scale) for h, _ in pairs],
                    iter([[export_value(h, v) for h, v in pairs]]))
        n_meta = len(ix.meta_header)
        meta   = (list(ix.meta_vals) + [''] * n_meta)[:n_meta]
        header, data = self._export_data(ix)
        return list(ix.meta_header) + header, (meta + row for row in data)

    # ------------------------------------------------------------------
    # Vyhledání cesty + validace vstupů
    # ------------------------------------------------------------------

    def resolve_path(self, file_id: str, location: str, file_type: str) -> Path | None:
        """Najde fyzickou cestu k souboru podle location a file_type."""
        if not self.validate_params(file_id, location, file_type):
            return None
        if location == 'remote':
            return Path(self._cfg.remote_path) / file_type / file_id
        base = Path(self._cfg.local_path)
        subfolders = ('wip',) if file_id.endswith('_WIP.csv') else ('done_local', 'done_remote')
        for subfolder in subfolders:
            p = base / file_type / subfolder / file_id
            if p.exists():
                return p
        return None

    _SAFE_LOCATION  = frozenset({'local', 'remote'})
    _SAFE_FILE_TYPE = frozenset({'production', 'testing'})

    def validate_params(self, file_id: str | None, location: str, file_type: str) -> bool:
        """Ověří, že parametry neobsahují path traversal sekvence ani nebezpečné znaky."""
        if location not in self._SAFE_LOCATION:
            log.warning("[CSV]   odmítnuto neplatné location: %r", location)
            return False
        if file_type not in self._SAFE_FILE_TYPE:
            log.warning("[CSV]   odmítnuto neplatné file_type: %r", file_type)
            return False
        if file_id is not None:
            # ':' — Windows drive-relative cesta ("D:x_DONE.csv" přeskočí base adresář)
            #       nebo NTFS alternate data stream ("a.csv:x_DONE.csv")
            if '/' in file_id or '\\' in file_id or '..' in file_id or ':' in file_id:
                log.warning("[CSV]   odmítnuto neplatné file_id (path traversal): %r", file_id)
                return False
            if '\x00' in file_id:
                log.warning("[CSV]   odmítnuto neplatné file_id (null byte): %r", file_id[:40])
                return False
            if len(file_id) > 255:
                log.warning("[CSV]   odmítnuto příliš dlouhé file_id: %d znaků", len(file_id))
                return False
            if not file_id.endswith(('_DONE.csv', '_WIP.csv')):
                log.warning("[CSV]   odmítnuto neplatné file_id (formát — musí být *_DONE.csv / *_WIP.csv): %r", file_id[:60])
                return False
            if file_id.endswith('_WIP.csv') and location != 'local':
                return False                            # WIP existuje jen lokálně
        return True
