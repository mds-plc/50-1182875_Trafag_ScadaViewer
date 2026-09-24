"""
Signal data reader — parsuje [SignalData] sekci z testovacích CSV souborů.

Účel: Čte surová signálová data (20 kHz vzorkování, ~400k řádků × 11 sloupců),
      decimuje je na zvládnutelný počet bodů pro zobrazení v prohlížeči (Recharts)
      a extrahuje klíčové body (FP, OP, RP, TTP) z AnalyzedParameters.

Zodpovědnost:
  - read_signal_data() — parsuje [SignalData] sekci, vrací sloupcová data
  - decimate_minmax() — min-max bucketing (zachová píky/propadliny)
  - extract_zoom_window() — nedecimovaný výřez kolem bodu
  - find_key_points() — FP/OP/RP/TTP indexy z AnalyzedParameters

Napojení:
  Závisí na: csv_repository._parse_sectioned (pro AnalyzedParameters)
  Používáno: api/signal.py (GET /api/signal)
"""
from __future__ import annotations

import csv
import logging
import math
from io import StringIO
from pathlib import Path

log = logging.getLogger(__name__)

# Sloupce SignalData (pořadí v CSV)
_SIGNAL_COLS = [
    'ts', 'position', 'force',
    'u_nc', 'u_no', 'u_shunt_nc', 'u_shunt_no',
    'i_nc', 'i_no', 'r_nc', 'r_no',
]


def read_signal_data(
    path: Path,
    encoding: str = 'utf-8-sig',
    separator: str = ';',
) -> dict[str, list[float]] | None:
    """Parsuje [SignalData] sekci z CSV souboru.

    Vrací dict se sloupcovými daty: {'ts': [...], 'position': [...], ...}
    Vrátí None pokud soubor neobsahuje [SignalData] sekci.
    """
    found = False
    header: list[str] | None = None
    columns: dict[str, list[float]] = {col: [] for col in _SIGNAL_COLS}

    with open(path, encoding=encoding, newline='') as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line:
                continue
            if line.startswith('[') and line.endswith(']'):
                section = line[1:-1].lower()
                if section == 'signaldata':
                    found = True
                    header = None
                    continue
                elif found:
                    break  # hit next section after SignalData
                continue
            if not found:
                continue
            if header is None:
                # Parse header — strip [unit] suffixes, lowercase
                raw_headers = [h.strip() for h in line.split(separator)]
                header = []
                for h in raw_headers:
                    bracket = h.find('[')
                    name = h[:bracket].strip().lower() if bracket >= 0 else h.strip().lower()
                    header.append(name)
                continue
            # Data row
            vals = line.split(separator)
            for i, col_name in enumerate(header):
                if col_name in columns:
                    # Chybějící / neparsovatelná hodnota → 0.0; všechny sloupce musí mít
                    # stejnou délku, jinak decimate_minmax() indexuje mimo rozsah.
                    try:
                        columns[col_name].append(float(vals[i]))
                    except (ValueError, IndexError):
                        columns[col_name].append(0.0)

    if not found or len(columns.get('ts', [])) == 0:
        return None

    # Sloupce, které soubor neobsahuje, vynechat (prázdný list by rozbil decimaci)
    columns = {col: data for col, data in columns.items() if data}

    log.debug("[SIG]   read_signal_data: %d řádků z %s", len(columns['ts']), path.name)
    return columns


def decimate_minmax(
    columns: dict[str, list[float]],
    n_buckets: int = 1000,
) -> dict[str, list[float]]:
    """Min-max bucketing — pro každý bucket zachová (min, max) → 2× body.

    Výsledek má max 2 * n_buckets bodů. Zachovává extrémní hodnoty
    (píky/propadliny), které by průměrování ztratilo.
    """
    n = len(columns.get('ts', []))
    if n <= n_buckets * 2:
        return columns  # data jsou dost malá, vrátit beze změny

    bucket_size = n / n_buckets
    result: dict[str, list[float]] = {col: [] for col in columns}

    for b in range(n_buckets):
        start = int(b * bucket_size)
        end = int((b + 1) * bucket_size)
        if end > n:
            end = n
        if start >= end:
            continue

        # Najdi indexy min a max podle force (nejzajímavější signál pro píky)
        # ale zachováme synchronizované hodnoty ostatních sloupců
        min_idx = start
        max_idx = start
        force = columns.get('force', [])
        if force:
            for i in range(start, end):
                if force[i] < force[min_idx]:
                    min_idx = i
                if force[i] > force[max_idx]:
                    max_idx = i
        else:
            min_idx = start
            max_idx = end - 1

        # Emituj oba body (min first if earlier index)
        idx_a, idx_b = (min_idx, max_idx) if min_idx <= max_idx else (max_idx, min_idx)
        for idx in (idx_a, idx_b):
            for col in columns:
                result[col].append(columns[col][idx])

    return result


def extract_zoom_window(
    columns: dict[str, list[float]],
    center_idx: int,
    half_width: int = 500,
) -> dict[str, list[float]]:
    """Vrátí nedecimovaný výřez ±half_width vzorků kolem center_idx."""
    n = len(columns.get('ts', []))
    start = max(0, center_idx - half_width)
    end = min(n, center_idx + half_width)
    return {col: columns[col][start:end] for col in columns}


def find_key_points(
    analyzed: dict[str, str],
    signal: dict[str, list[float]],
) -> dict[str, dict]:
    """Extrahuje klíčové body FP/OP/RP/TTP z AnalyzedParameters + signal dat.

    Args:
        analyzed: dict z _parse_sectioned() — 'fp_freeposition': '898.0000' atd.
        signal: dict ze read_signal_data() — surová (nedecimovaná) data.

    Returns:
        dict s klíči 'fp', 'op', 'rp', 'ttp', každý obsahuje {idx, ts_ms, position}.
    """
    position = signal.get('position', [])
    ts = signal.get('ts', [])
    n = len(position)
    if n == 0:
        return {}

    def _get_pos(key: str) -> float | None:
        """Hledá pozici v AnalyzedParameters — zkusí různé varianty klíče.

        Vylučuje klíče začínající na 'r_' (resistance) — ty obsahují
        'operatingposition'/'releasingposition' ale jde o odpor, ne pozici.
        """
        for k, v in analyzed.items():
            if k.startswith('r_'):
                continue  # skip resistance keys
            if key in k:
                try:
                    return float(v)
                except (ValueError, TypeError):
                    pass
        return None

    def _argmin_abs(arr: list[float], target: float, start: int = 0, end: int | None = None) -> int:
        """Najde index nejbližší hodnoty k target v rozsahu [start, end)."""
        if end is None:
            end = len(arr)
        best_idx = start
        best_diff = abs(arr[start] - target)
        for i in range(start + 1, end):
            diff = abs(arr[i] - target)
            if diff < best_diff:
                best_diff = diff
                best_idx = i
        return best_idx

    points: dict[str, dict] = {}

    # TTP — Total Travel Point — maximální pozice (argmax)
    ttp_idx = 0
    for i in range(1, n):
        if position[i] > position[ttp_idx]:
            ttp_idx = i

    # Preferuj analyzovanou hodnotu pokud existuje
    ttp_val = _get_pos('totaltravelposition')
    if ttp_val is not None:
        ttp_idx = _argmin_abs(position, ttp_val)

    points['ttp'] = {
        'idx': ttp_idx,
        'ts_ms': ts[ttp_idx] / 1_000_000 if ttp_idx < len(ts) else 0,
        'position': position[ttp_idx],
    }

    # FP — Free Position
    fp_val = _get_pos('freeposition')
    if fp_val is not None:
        fp_idx = _argmin_abs(position, fp_val, 0, ttp_idx + 1) if ttp_idx > 0 else 0
        points['fp'] = {
            'idx': fp_idx,
            'ts_ms': ts[fp_idx] / 1_000_000 if fp_idx < len(ts) else 0,
            'position': position[fp_idx],
        }

    # OP — Operating Position (v první polovině — sestupná část)
    op_val = _get_pos('operatingposition')
    if op_val is not None:
        op_idx = _argmin_abs(position, op_val, 0, ttp_idx + 1) if ttp_idx > 0 else 0
        points['op'] = {
            'idx': op_idx,
            'ts_ms': ts[op_idx] / 1_000_000 if op_idx < len(ts) else 0,
            'position': position[op_idx],
        }

    # RP — Releasing Position (v druhé polovině — vzestupná část)
    # Tolerujeme překlep: 'realeasingposition' i 'releasingposition'
    rp_val = _get_pos('releasingposition') or _get_pos('realeasingposition')
    if rp_val is not None and ttp_idx < n - 1:
        rp_idx = _argmin_abs(position, rp_val, ttp_idx, n)
        points['rp'] = {
            'idx': rp_idx,
            'ts_ms': ts[rp_idx] / 1_000_000 if rp_idx < len(ts) else 0,
            'position': position[rp_idx],
        }

    return points


def has_signal_data(
    path: Path,
    encoding: str = 'utf-8-sig',
) -> bool:
    """Rychlá kontrola — obsahuje CSV soubor [SignalData] sekci?"""
    try:
        with open(path, encoding=encoding) as f:
            for raw_line in f:
                line = raw_line.strip()
                if line.lower() == '[signaldata]':
                    return True
        return False
    except OSError:
        return False


def prepare_signal_response(
    path: Path,
    analyzed: dict[str, str],
    mode: str = 'overview',
    n_buckets: int = 1000,
    encoding: str = 'utf-8-sig',
    separator: str = ';',
) -> dict | None:
    """Připraví kompletní response pro GET /api/signal.

    Args:
        path: cesta k CSV souboru
        analyzed: AnalyzedParameters dict (z _parse_sectioned)
        mode: 'overview' | 'results' | 'hysteresis' | 'zoom_op' | 'zoom_rp'
        n_buckets: počet bucketů pro decimaci
        encoding: kódování CSV
        separator: oddělovač CSV

    Returns:
        dict s daty pro frontend, nebo None pokud signal data chybí.
    """
    raw = read_signal_data(path, encoding, separator)
    if raw is None:
        return None

    key_points = find_key_points(analyzed, raw)

    if mode in ('zoom_op', 'zoom_rp'):
        point_key = 'op' if mode == 'zoom_op' else 'rp'
        point = key_points.get(point_key)
        if point is None:
            return None
        zoomed = extract_zoom_window(raw, point['idx'], half_width=500)
        # Konverze jednotek
        return _convert_units(zoomed, key_points)

    # Pro overview/results/hysteresis — decimovat
    decimated = decimate_minmax(raw, n_buckets)
    return _convert_units(decimated, key_points)


def _convert_units(
    data: dict[str, list[float]],
    key_points: dict[str, dict],
) -> dict:
    """Konvertuje jednotky pro frontend: ns→ms, A→mA, R→log10(R)."""
    n = len(data.get('ts', []))
    result: dict = {
        'ts_ms':     [v / 1_000_000 for v in data.get('ts', [])],
        'position':  data.get('position', []),
        'force':     data.get('force', []),
        'u_nc':      data.get('u_nc', []),
        'u_no':      data.get('u_no', []),
        'i_nc_ma':   [v * 1000 for v in data.get('i_nc', [])],
        'i_no_ma':   [v * 1000 for v in data.get('i_no', [])],
        'r_nc_log':  [_safe_log10(v) for v in data.get('r_nc', [])],
        'r_no_log':  [_safe_log10(v) for v in data.get('r_no', [])],
        'key_points': key_points,
        'total_raw':  n,
    }
    return result


def _safe_log10(v: float) -> float | None:
    """Bezpečný log10 — clip na rozsah [1e-4, 1e7], None pro nuly."""
    if v <= 0:
        return None
    v = max(1e-4, min(1e7, v))
    return math.log10(v)
