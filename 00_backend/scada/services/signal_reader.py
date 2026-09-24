"""
Signal data reader — parsuje [SignalData] sekci z testovacích CSV souborů.

Účel: Čte surová signálová data (20 kHz vzorkování, ~400k řádků × 11 sloupců),
      decimuje je na zvládnutelný počet bodů pro zobrazení v prohlížeči (Recharts)
      a extrahuje klíčové body (FP, OP, RP, TTP) z AnalyzedParameters.

Zodpovědnost:
  - read_signal_data() — parsuje [SignalData] sekci, vrací sloupcová data
  - decimate_minmax() — min-max bucketing (zachová píky/propadliny)
  - extract_zoom_window() — nedecimovaný výřez kolem bodu
  - extract_time_range() — výřez časového rozsahu (přiblížení grafu kolečkem / gestem)
  - find_key_points() — FP/OP/RP/TTP indexy z AnalyzedParameters
  - load_signal() — cache naparsovaných dat (max 2 soubory, invalidace dle mtime/size);
    souběžné požadavky na tentýž soubor (overview + zoom_op + zoom_rp) parsují jen jednou
  - prepare_signal_response() — sestaví odpověď pro GET /api/signal

Napojení:
  Závisí na: csv_repository._parse_sectioned (pro AnalyzedParameters)
  Používáno: api/signal.py (GET /api/signal)
"""
from __future__ import annotations

import bisect
import io
import logging
import math
import threading
from array import array
from collections import OrderedDict
from pathlib import Path

from scada.services.repositories.csv_repository import _parse_sectioned

try:                      # volitelné — rychlé parsování; bez numpy funguje Python cesta
    import numpy as _np
except ImportError:       # pragma: no cover
    _np = None

log = logging.getLogger(__name__)

# Práh napětí kontaktu pro detekci přepnutí (shodně s referenční analýzou — „Threshold 5V")
_SWITCH_THRESHOLD_V = 5.0
# Zoom okno kolem OP / RP: ±600 vzorků při 20 kHz = ±30 ms
_ZOOM_HALF_SAMPLES = 600

# Cache naparsovaných signálových dat. Jeden soubor ≈ 400k × 11 hodnot; v array('d')
# ~35 MB (Python list floatů by byl ~4× víc). Držíme max 2 soubory.
_CACHE_MAX = 2
_cache: OrderedDict[Path, tuple[tuple[int, int], dict[str, array] | None, dict[str, dict], dict[str, float]]] = OrderedDict()
_cache_lock = threading.Lock()                       # chrání _cache a _path_locks
_path_locks: dict[Path, threading.Lock] = {}         # jeden parser na soubor současně

# Cache hotových odpovědí (~100–200 kB každá): (path, mtime, size, varianta, buckets) → dict
_RESP_CACHE_MAX = 12
_resp_cache: OrderedDict[tuple, dict | None] = OrderedDict()

# Sloupce SignalData (pořadí v CSV)
# u_shunt_nc / u_shunt_no v souboru jsou, ale frontend je nezobrazuje → neparsují se
_SIGNAL_COLS = [
    'ts', 'position', 'force',
    'u_nc', 'u_no',
    'i_nc', 'i_no', 'r_nc', 'r_no',
]


_PARSE_BLOCK = 20_000   # řádků na blok (Python cesta) — kompromis rychlost / přechodná paměť


def _parse_numpy(text: str, separator: str, targets: list[tuple[int, array]]) -> bool:
    """Rychlá cesta — numpy.loadtxt (C parser, ~2× rychlejší než Python cesta).

    Vrátí False při vadných datech (chybějící / nečíselná hodnota) → volající použije
    Python cestu, která vadné hodnoty nahradí 0.0 a zachová zarovnání sloupců.
    """
    try:
        data = _np.loadtxt(
            io.StringIO(text), delimiter=separator, dtype=_np.float64, ndmin=2,
            usecols=[i for i, _ in targets], comments=None,
        )
    except ValueError:
        return False
    for k, (_, arr) in enumerate(targets):
        arr.frombytes(_np.ascontiguousarray(data[:, k]).tobytes())
    return True


def _parse_python(text: str, separator: str, targets: list[tuple[int, array]], n_cols: int) -> None:
    """Záložní cesta bez numpy — po blocích: split → zip(*rows) → map(float) (v C)."""
    lines = text.splitlines()
    for b in range(0, len(lines), _PARSE_BLOCK):
        rows = [ln.split(separator) for ln in lines[b:b + _PARSE_BLOCK] if ln.strip()]
        if rows:
            _append_rows(rows, targets, n_cols)


def _append_rows(rows: list[list[str]], targets: list[tuple[int, array]], n_cols: int) -> None:
    """Přidá blok řádků do sloupců. Rychlá cesta v C, pomalá jen pro vadný blok."""
    if all(len(r) >= n_cols for r in rows):
        cols = list(zip(*rows))
        try:
            converted = [(arr, array('d', map(float, cols[i]))) for i, arr in targets]
        except ValueError:
            pass                               # nečíselná hodnota → pomalá cesta
        else:
            for arr, values in converted:      # extend až po úspěchu všech → zarovnání drží
                arr.extend(values)
            return
    for r in rows:
        for i, arr in targets:
            try:
                arr.append(float(r[i]))
            except (ValueError, IndexError):
                arr.append(0.0)


def read_signal_data(
    path: Path,
    encoding: str = 'utf-8-sig',
    separator: str = ';',
) -> dict[str, array] | None:
    """Parsuje [SignalData] sekci z CSV souboru.

    Vrací dict se sloupcovými daty: {'ts': [...], 'position': [...], ...}
    Vrátí None pokud soubor neobsahuje [SignalData] sekci.
    """
    columns: dict[str, array] = {col: array('d') for col in _SIGNAL_COLS}

    with open(path, encoding=encoding, newline='') as f:
        # 1) Přeskočit na [SignalData]
        for raw_line in f:
            if raw_line.strip().lower() == '[signaldata]':
                break
        else:
            return None

        # 2) Hlavička — odstranit [jednotka], lowercase
        header: list[str] = []
        for raw_line in f:
            line = raw_line.strip()
            if line:
                for h in line.split(separator):
                    bracket = h.find('[')
                    header.append((h[:bracket] if bracket >= 0 else h).strip().lower())
                break

        # 3) Data — zbytek souboru najednou (~40 MB), oříznout na případnou další sekci
        rest = f.read()
    cut = rest.find('\n[')
    if cut >= 0:
        rest = rest[:cut]
    if not rest.strip():
        return None

    targets = [(i, columns[name]) for i, name in enumerate(header) if name in columns]
    if not targets:
        return None
    if not (_np is not None and _parse_numpy(rest, separator, targets)):
        _parse_python(rest, separator, targets, len(header))

    if len(columns['ts']) == 0:
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


def extract_time_range(
    columns: dict[str, list[float]],
    t0_ms: float,
    t1_ms: float,
) -> dict[str, list[float]]:
    """Vrátí výřez vzorků s časem v [t0_ms, t1_ms] (+ 1 vzorek na každé straně, aby čára
    navazovala na okraj grafu). Čas v datech je v ns a roste monotónně → bisect."""
    ts = columns.get('ts', [])
    n = len(ts)
    start = max(0, bisect.bisect_left(ts, t0_ms * 1_000_000) - 1)
    end = min(n, bisect.bisect_right(ts, t1_ms * 1_000_000) + 1)
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
        dict s klíči 'fp', 'op', 'rp', 'ttp', každý obsahuje
        {idx, ts_ms, position, force, source}.

    OP a RP se určují stejně jako v referenční analýze (Analyzing — grafy results /
    switching_detail): okamžik, kdy napětí U_NC projde prahem _SWITCH_THRESHOLD_V
    (OP: NC se rozepne → U_NC stoupne; RP: NC se sepne → U_NC klesne). Pokud U_NC
    chybí nebo práh nikdy nepřekročí, fallback = nejbližší poloha k analyzované hodnotě.
    """
    position = signal.get('position', [])
    force    = signal.get('force', [])
    u_nc     = signal.get('u_nc', [])
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

    def _point(idx: int, source: str = 'position') -> dict:
        return {
            'idx':      idx,
            'ts_ms':    ts[idx] / 1_000_000 if idx < len(ts) else 0,
            'position': position[idx],
            'force':    force[idx] if idx < len(force) else None,
            'source':   source,
        }

    def _edge(start: int, end: int, rising: bool) -> int | None:
        """První průchod U_NC prahem v [start, end) — rising: zdola nahoru, jinak shora dolů."""
        if len(u_nc) < end or start < 1:
            start = max(start, 1)
            if len(u_nc) < end:
                return None
        thr = _SWITCH_THRESHOLD_V
        for i in range(start, end):
            prev, cur = u_nc[i - 1], u_nc[i]
            if (rising and prev < thr <= cur) or (not rising and prev >= thr > cur):
                return i
        return None

    points['ttp'] = _point(ttp_idx)

    # FP — Free Position
    fp_val = _get_pos('freeposition')
    if fp_val is not None:
        fp_idx = _argmin_abs(position, fp_val, 0, ttp_idx + 1) if ttp_idx > 0 else 0
        points['fp'] = _point(fp_idx)

    # OP — Operating Position (v první polovině — sestupná část)
    op_edge = _edge(1, ttp_idx + 1, rising=True)
    op_val  = _get_pos('operatingposition')
    if op_edge is not None:
        points['op'] = _point(op_edge, 'electric')
    elif op_val is not None:
        op_idx = _argmin_abs(position, op_val, 0, ttp_idx + 1) if ttp_idx > 0 else 0
        points['op'] = _point(op_idx)

    # RP — Releasing Position (v druhé polovině — vzestupná část)
    # Tolerujeme překlep: 'realeasingposition' i 'releasingposition'
    rp_edge = _edge(ttp_idx + 1, n, rising=False) if ttp_idx < n - 1 else None
    rp_val  = _get_pos('releasingposition') or _get_pos('realeasingposition')
    if rp_edge is not None:
        points['rp'] = _point(rp_edge, 'electric')
    elif rp_val is not None and ttp_idx < n - 1:
        rp_idx = _argmin_abs(position, rp_val, ttp_idx, n)
        points['rp'] = _point(rp_idx)

    return points


def load_signal(
    path: Path,
    encoding: str = 'utf-8-sig',
    separator: str = ';',
) -> tuple[dict[str, array] | None, dict[str, dict], dict[str, float]]:
    """Vrátí (signal sloupce | None, klíčové body FP/OP/RP/TTP, AnalyzedParameters jako čísla)
    — z cache, nebo naparsuje soubor.

    Klíčové body se počítají jednou při načtení (argmin přes ~400k vzorků ≈ 40 ms).

    Cache se invaliduje změnou mtime/size. Per-path zámek zajistí, že souběžné
    požadavky na stejný soubor čekají na jedno parsování místo trojího.
    """
    st  = path.stat()
    sig = (st.st_mtime_ns, st.st_size)
    with _cache_lock:
        lock = _path_locks.setdefault(path, threading.Lock())
    with lock:
        with _cache_lock:
            hit = _cache.get(path)
            if hit is not None and hit[0] == sig:
                _cache.move_to_end(path)
                return hit[1], hit[2], hit[3]

        with open(path, encoding=encoding, newline='') as f:
            analyzed = _parse_sectioned(f, separator).get('analyzedparameters', {})
        raw        = read_signal_data(path, encoding, separator)
        key_points = find_key_points(analyzed, raw) if raw is not None else {}
        params     = _numeric_params(analyzed)

        with _cache_lock:
            _cache[path] = (sig, raw, key_points, params)
            _cache.move_to_end(path)
            while len(_cache) > _CACHE_MAX:
                evicted, _ = _cache.popitem(last=False)
                _path_locks.pop(evicted, None)
        return raw, key_points, params


def prepare_signal_response(
    path: Path,
    mode: str = 'overview',
    n_buckets: int = 1000,
    encoding: str = 'utf-8-sig',
    separator: str = ';',
    t0_ms: float | None = None,
    t1_ms: float | None = None,
) -> dict | None:
    """Připraví kompletní response pro GET /api/signal.

    Args:
        path: cesta k CSV souboru
        mode: 'overview' | 'results' | 'hysteresis' | 'zoom_op' | 'zoom_rp' | 'range'
              ('range' = výřez t0_ms…t1_ms, decimovaný na n_buckets — přiblížený graf)
        n_buckets: počet bucketů pro decimaci
        encoding: kódování CSV
        separator: oddělovač CSV

    Returns:
        dict s daty pro frontend, nebo None pokud signal data chybí.
        Hotové odpovědi se cachují (overview/results/hysteresis sdílí stejná decimovaná
        data) — opakované otevření / přepnutí záložky je bez výpočtu.
    """
    if mode == 'range':
        # Rozsahy se mění plynule s každým přiblížením → necachuje se odpověď,
        # jen surová data (load_signal); výřez + decimace okna je rychlá
        raw, key_points, params = load_signal(path, encoding, separator)
        if raw is None:
            return None
        lo, hi = sorted((t0_ms or 0.0, t1_ms or 0.0))
        window = decimate_minmax(extract_time_range(raw, lo, hi), n_buckets)
        return _convert_units(window, key_points, params)

    st      = path.stat()
    variant = mode if mode in ('zoom_op', 'zoom_rp') else 'decimated'
    key     = (path, st.st_mtime_ns, st.st_size, variant, n_buckets if variant == 'decimated' else 0)
    with _cache_lock:
        if key in _resp_cache:
            _resp_cache.move_to_end(key)
            return _resp_cache[key]

    result = _build_response(path, variant, n_buckets, encoding, separator)

    with _cache_lock:
        _resp_cache[key] = result
        _resp_cache.move_to_end(key)
        while len(_resp_cache) > _RESP_CACHE_MAX:
            _resp_cache.popitem(last=False)
    return result


def _build_response(
    path: Path, mode: str, n_buckets: int, encoding: str, separator: str,
) -> dict | None:
    """Vypočte odpověď z (cachovaných) surových dat — decimace nebo zoom výřez."""
    raw, key_points, params = load_signal(path, encoding, separator)
    if raw is None:
        return None

    if mode in ('zoom_op', 'zoom_rp'):
        point_key = 'op' if mode == 'zoom_op' else 'rp'
        point = key_points.get(point_key)
        if point is None:
            return None
        # ±30 ms (20 kHz → 600 vzorků): pokryje detail přepnutí (±20 ms) i časové
        # parametry (OP −5…+25 ms, RP −5…+10 ms) jako v referenční analýze
        zoomed = extract_zoom_window(raw, point['idx'], half_width=_ZOOM_HALF_SAMPLES)
        return _convert_units(zoomed, key_points, params)

    # Pro overview/results/hysteresis — decimovat
    decimated = decimate_minmax(raw, n_buckets)
    return _convert_units(decimated, key_points, params)


def _convert_units(
    data: dict[str, list[float]],
    key_points: dict[str, dict],
    params: dict[str, float] | None = None,
) -> dict:
    """Konvertuje jednotky pro frontend: ns→ms, A→mA; odpor v Ω (frontend: logaritmická osa)."""
    n = len(data.get('ts', []))
    result: dict = {
        'ts_ms':     [v / 1_000_000 for v in data.get('ts', [])],
        # list(): data mohou být array('d') (zoom / malý soubor) — JSON umí jen list
        'position':  list(data.get('position', [])),
        'force':     list(data.get('force', [])),
        'u_nc':      list(data.get('u_nc', [])),
        'u_no':      list(data.get('u_no', [])),
        'i_nc_ma':   [v * 1000 for v in data.get('i_nc', [])],
        'i_no_ma':   [v * 1000 for v in data.get('i_no', [])],
        'r_nc_ohm':  [_clip_ohm(v) for v in data.get('r_nc', [])],
        'r_no_ohm':  [_clip_ohm(v) for v in data.get('r_no', [])],
        'key_points': key_points,
        'params':     params or {},
        'total_raw':  n,
    }
    return result


def _clip_ohm(v: float) -> float | None:
    """Odpor pro logaritmickou osu — ořez na [1e-4, 1e7] Ω, None pro nekladné hodnoty."""
    if v <= 0:
        return None
    return max(1e-4, min(1e7, v))


def _numeric_params(analyzed: dict[str, str]) -> dict[str, float]:
    """AnalyzedParameters jako čísla (souhrn výsledků, časové úseky UT/RevT/BT v grafech)."""
    out: dict[str, float] = {}
    for k, v in analyzed.items():
        try:
            out[k] = float(v)
        except (TypeError, ValueError):
            continue
    return out
