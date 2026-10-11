"""
Regrese nejhlubšího auditu 2026-10-10 (nálezy X, Z, N, F, R, C, T, E — viz 04_docs/audit_log.md).

Každý test odpovídá jednomu opravenému nálezu — číslo v názvu / docstringu.
"""
from __future__ import annotations

import ast
import json
import pathlib
import time
from pathlib import Path

from scada.services import signal_reader as sr

from test_audit_20261010 import _two_part, app_client  # noqa: F401 — fixture

ROOT = Path(__file__).resolve().parents[1]


# ── N1 — counts_pending přes API nehlásí soubor v odkladu po chybě dopočtu ───

def test_n1_api_counts_pending_ignores_failed_count(app_client, tmp_path: Path) -> None:
    f = tmp_path / "local" / "production" / "done_local" / "PROD_A_M_20261001_080000_DONE.csv"
    _two_part(f, "A")
    app, c = app_client()
    repo = app.state.csv_reader._repo
    repo._count_failed[str(f)] = time.monotonic()          # dopočet právě selhal (zámek, NAS)
    r = c.get("/api/files", params={"location": "local", "type": "production"})
    assert r.status_code == 200
    body = r.json()
    assert body["files"][0]["record_count"] is None         # počet zatím neznámý …
    assert body["counts_pending"] is False                  # … ale klient se nemá ptát donekonečna


def test_n1_api_counts_pending_ignores_stalled_count(app_client, tmp_path: Path, monkeypatch) -> None:
    f = tmp_path / "local" / "production" / "done_local" / "PROD_A_M_20261001_080000_DONE.csv"
    _two_part(f, "A")
    app, c = app_client()
    repo = app.state.csv_reader._repo
    monkeypatch.setattr(repo, "_ensure_count_threads", lambda: None)
    monkeypatch.setattr(repo._count_queues["local"], "put", lambda k: None)
    body = c.get("/api/files", params={"location": "local", "type": "production"}).json()
    assert body["counts_pending"] is True                   # zařazeno, čeká
    with repo._count_lock:                                  # všechna vlákna visí (zaseknutý NAS)
        for i in range(4):
            repo._count_started[f"x{i}"] = 0.0
        repo._count_started[str(f)] = 0.0
    body = c.get("/api/files", params={"location": "local", "type": "production"}).json()
    assert body["counts_pending"] is False


# ── Z5 — stažení z NAS s lokální kopií bez Path.resolve() (SMB v event loopu) ─

def test_z5_remote_download_without_resolve(app_client, tmp_path: Path, monkeypatch) -> None:
    nas = tmp_path / "nas"
    name = "PROD_A_M_20261001_080000_DONE.csv"
    _two_part(nas / "production" / name, "A", n=20)
    twin = tmp_path / "local" / "production" / "done_remote" / name
    twin.parent.mkdir(parents=True)
    twin.write_bytes((nas / "production" / name).read_bytes())
    app, c = app_client(remote=str(nas))

    def no_resolve(self, strict=False):
        raise AssertionError("Path.resolve() v download endpointu")
    monkeypatch.setattr(pathlib.Path, "resolve", no_resolve)
    r = c.get(f"/api/files/{name}/download", params={"location": "remote", "type": "production"})
    assert r.status_code == 200
    assert r.content == twin.read_bytes()


# ── R3 — uvicorn s wsproto (flow control) a omezeným graceful shutdown ───────

def test_r3_uvicorn_ws_flow_control_and_shutdown_timeout() -> None:
    import wsproto  # noqa: F401 — závislost musí být nainstalovaná (requirements.txt)
    tree = ast.parse((ROOT / "main.py").read_text(encoding="utf-8"))
    calls = [n for n in ast.walk(tree) if isinstance(n, ast.Call)
             and isinstance(n.func, ast.Attribute) and n.func.attr == "run"]
    kw = {k.arg: k.value for k in calls[0].keywords}
    assert isinstance(kw["ws"], ast.Constant) and kw["ws"].value == "wsproto"
    assert isinstance(kw["timeout_graceful_shutdown"], ast.Constant)
    assert 0 < kw["timeout_graceful_shutdown"].value <= 5


# ── C3 — NaN v klíčových bodech a parametrech signálu → null, ne HTTP 500 ────

def test_c3_non_finite_key_points_and_params_serializable() -> None:
    nan = float("nan")
    out = sr._convert_units(
        {"ts": [0.0, 1e6], "position": [nan, 1.0]},
        {"fp": {"idx": 0, "ts_ms": 0.0, "position": nan, "force": float("inf"), "source": "position"},
         "threshold_v": nan},
        {"fp_freeposition": nan, "of_operatingforce": 1.5},
    )
    json.dumps(out, allow_nan=False)                        # jinak ValueError → HTTP 500
    assert out["key_points"]["fp"]["position"] is None
    assert out["key_points"]["fp"]["force"] is None
    assert out["key_points"]["fp"]["source"] == "position"
    assert out["switch_threshold_v"] == sr._SWITCH_THRESHOLD_V
    assert out["params"] == {"of_operatingforce": 1.5}


# ── X2 — čtení ve ScadaViewer nebrání přesunu souboru v DatabaseGateway ───────

def test_x2_open_shared_allows_move_while_reading(tmp_path: Path) -> None:
    import shutil
    from scada.services.shared_open import open_shared
    src, dst = tmp_path / "wip.csv", tmp_path / "done.csv"
    src.write_bytes(b"a;b\n1;2\n")
    with open_shared(src, "rb") as f:
        shutil.move(str(src), str(dst))                     # jako Gateway close_order — bez WinError 32
        assert f.read() == b"a;b\n1;2\n"                    # otevřený handle čte dál
    assert not src.exists() and dst.exists()                 # žádný duplikát
    with open_shared(dst, encoding="utf-8", newline="") as f:
        assert f.read() == "a;b\n1;2\n"


def test_x2_open_shared_errors_like_open(tmp_path: Path) -> None:
    import pytest
    from scada.services.shared_open import open_shared
    with pytest.raises(FileNotFoundError):
        open_shared(tmp_path / "nic.csv")
    with pytest.raises(ValueError):
        open_shared(tmp_path / "x.csv", "w")


def test_x2_readers_and_download_use_open_shared(app_client, tmp_path: Path, monkeypatch) -> None:
    """Přehled, záznamy i stažení otevírají CSV přes open_shared (ne builtins.open)."""
    from scada.api import files as files_api
    from scada.services import shared_open
    from scada.services.repositories import csv_repository as repo_mod
    seen: list[str] = []
    orig = shared_open.open_shared

    def spy(path, mode="r", **kw):
        seen.append(Path(path).name)
        return orig(path, mode, **kw)
    for mod in (repo_mod, files_api, sr):
        monkeypatch.setattr(mod, "open_shared", spy)
    f = tmp_path / "local" / "production" / "done_local" / "PROD_A_M_20261001_080000_DONE.csv"
    _two_part(f, "A")
    app, c = app_client()
    q = {"location": "local", "type": "production"}
    assert c.get("/api/data", params={**q, "file": f.name}).status_code == 200
    r = c.get(f"/api/files/{f.name}/download", params=q)
    assert r.status_code == 200 and r.content == f.read_bytes()
    assert seen.count(f.name) >= 2


# ── R1 / R2 — ADS: úklid callback_store, heartbeat pozná STOP a nový program ──

def _ads_monitor():
    from unittest.mock import MagicMock
    from scada.config import AdsConfig, AppConfig, DataConfig, ServerConfig
    from scada.services.ads_monitor import AdsMonitor
    cfg = AppConfig(server=ServerConfig(host="127.0.0.1", port=8080),
                    ads=AdsConfig(net_id="1.2.3.4.1.1", port=851),
                    data=DataConfig(local_path=Path("."), remote_path="", csv_separator=";",
                                    csv_encoding="utf-8-sig"))
    return AdsMonitor(cfg, MagicMock())


def _plc(state: int = 5):
    from unittest.mock import MagicMock
    conn = MagicMock()
    conn._adr = object()                                   # klíč callback_store (identita)
    conn.read_by_name.return_value = False
    conn.read_state.return_value = (state, 0)
    conn.read.return_value = 3
    conn.get_handle.return_value = 77
    return conn


def test_r1_release_purges_callback_store_without_network() -> None:
    import pyads
    m, plc, other = _ads_monitor(), _plc(), object()
    store = pyads.pyads_ex.callback_store
    store[(plc._adr, 1)] = store[(plc._adr, 2)] = store[(other, 9)] = lambda *a: None
    try:
        m._plc, m._handles = plc, [(1, 11), (2, 12)]
        m._disconnect(graceful=False)
        assert (plc._adr, 1) not in store and (plc._adr, 2) not in store
        assert (other, 9) in store                          # cizí spojení zůstane
        plc.del_device_notification.assert_not_called()     # PLC neodpovídá — bez timeoutů
        assert m._handles == [] and m.connected is False
    finally:
        store.pop((other, 9), None)


def test_r1_graceful_release_stops_after_first_failure() -> None:
    m, plc = _ads_monitor(), _plc()
    plc.del_device_notification.side_effect = OSError("timeout")
    m._plc, m._handles, m._hb_handle = plc, [(1, 11), (2, 12), (3, 13)], 77
    m._disconnect(graceful=True)
    plc.release_handle.assert_called_once_with(77)
    assert plc.del_device_notification.call_count == 1     # ne 3 × timeout 2 s
    plc.close.assert_called_once()


def test_r1_failed_connect_cleans_up(monkeypatch) -> None:
    import pyads
    m, plc = _ads_monitor(), _plc()
    plc.add_device_notification.side_effect = lambda *a, **k: (len(plc.add_device_notification.mock_calls), 0)
    plc.get_handle.side_effect = pyads.ADSError(err_code=0x745)             # jiná chyba → selhání
    monkeypatch.setattr(pyads, "Connection", lambda *a: plc)
    store = pyads.pyads_ex.callback_store
    store[(plc._adr, 1)] = lambda *a: None
    import pytest
    with pytest.raises(pyads.ADSError):
        m._connect()
    assert (plc._adr, 1) not in store and m._handles == [] and m.connected is False
    plc.close.assert_called_once()


def test_r1_missing_heartbeat_symbol_keeps_connection(monkeypatch) -> None:
    import pyads
    m, plc = _ads_monitor(), _plc()
    plc.add_device_notification.side_effect = lambda *a, **k: (1, 0)
    plc.get_handle.side_effect = pyads.ADSError(err_code=0x710)             # PLC bez In symbolů
    monkeypatch.setattr(pyads, "Connection", lambda *a: plc)
    m._connect()
    assert m.connected and m._hb_handle is None
    m._write_hb(True)                                       # jen čtení stavu — žádná chyba
    assert not any(c.kwargs.get("handle") for c in plc.write_by_name.mock_calls)


def test_r2_heartbeat_detects_stop_and_new_program() -> None:
    import pytest
    from scada.services.ads_monitor import _PlcChanged
    m, plc = _ads_monitor(), _plc()
    m._plc, m._hb_handle, m._sym_version = plc, 77, 3
    m._write_hb(True)
    assert plc.write_by_name.call_args.kwargs["handle"] == 77
    plc.read.return_value = 4                               # download programu
    with pytest.raises(_PlcChanged):
        m._write_hb(False)
    plc.read.return_value = 3
    plc.read_state.return_value = (6, 0)                    # ADSSTATE_STOP
    with pytest.raises(_PlcChanged):
        m._write_hb(True)


def test_r2_ready_rewritten_periodically() -> None:
    from scada.constants import SYM_WRITE
    from scada.services import ads_monitor as am
    m, plc = _ads_monitor(), _plc()
    m._plc, m._hb_handle, m._sym_version = plc, 77, 3
    for i in range(am._READY_EVERY):
        m._write_hb(bool(i % 2))
    ready = [c for c in plc.write_by_name.mock_calls if c.args and c.args[0] == SYM_WRITE["sv_ready"]]
    assert len(ready) == 1 and ready[0].args[1] is True


def test_r2_plc_change_reconnects_without_waiting_for_3_failures(monkeypatch) -> None:
    import asyncio
    import pytest
    from scada.services import ads_monitor as am
    m, plc = _ads_monitor(), _plc(state=6)
    m._plc, m._hb_handle = plc, 77
    real_sleep = asyncio.sleep
    monkeypatch.setattr(am.asyncio, "sleep", lambda s: real_sleep(0))
    with pytest.raises(am._PlcChanged):
        asyncio.run(m._heartbeat_loop())
    assert plc.read_state.call_count == 1


def test_r8_write_offline_skipped_when_plc_unresponsive() -> None:
    m, plc = _ads_monitor(), _plc()
    m._plc, m._alive = plc, False
    m._write_offline()
    plc.write_by_name.assert_not_called()
    m._alive = True
    m._write_offline()
    assert plc.write_by_name.call_count == 2


# ── T1 — matice role × zápisový endpoint, TTL relace na běžném endpointu ─────

_ROLE_ORDER = ["operator", "technician", "admin", "manufacturer"]
_PROTECTED = [   # (metoda, cesta, json/params, minimální role)
    ("DELETE", "/api/files/X_DONE.csv?location=local&type=production", None, "technician"),
    ("POST",   "/api/files/batch-delete", {"file_ids": ["X_DONE.csv"], "location": "local",
                                           "type": "production"}, "technician"),
    ("PATCH",  "/api/config/paths", {}, "admin"),
    ("PATCH",  "/api/config/storage", {}, "admin"),
    ("GET",    "/api/config/fs?path=Z:/neexistuje", None, "admin"),
    ("GET",    "/api/users", None, "admin"),
    ("POST",   "/api/users", {}, "admin"),
    ("DELETE", "/api/users/nikdo", None, "admin"),
]


import pytest  # noqa: E402


@pytest.mark.parametrize("method, url, body, min_role", _PROTECTED)
def test_t1_role_matrix(app_client, method: str, url: str, body, min_role: str) -> None:
    level = _ROLE_ORDER.index(min_role)
    below = _ROLE_ORDER[level - 1]
    _, low = app_client(role=below)
    r = low.request(method, url, json=body)
    assert r.status_code == 403, f"{below} smí {method} {url}"
    _, ok = app_client(role=min_role)
    r = ok.request(method, url, json=body)
    assert r.status_code not in (401, 403), f"{min_role} nesmí {method} {url}: {r.status_code}"


def test_t1_expired_session_on_regular_endpoint(app_client) -> None:
    from test_audit_20261010 import _TOKEN
    from scada.api.dependencies import SESSION_TTL_SECS
    app, c = app_client()
    app.state.sessions[_TOKEN]["created_at"] = time.time() - SESSION_TTL_SECS - 1
    r = c.get("/api/files", params={"location": "local", "type": "production"})
    assert r.status_code == 401
    assert r.headers.get("www-authenticate") == "Bearer"
    assert _TOKEN not in app.state.sessions


# ── R4 — zrušená úloha ve frontě NAS poolu neuvolnila slot ───────────────────

def test_r4_cancelled_queued_nas_task_releases_slot(monkeypatch) -> None:
    import asyncio
    import threading
    from concurrent.futures import ThreadPoolExecutor
    from scada.services import io_pool

    monkeypatch.setattr(io_pool, "_NAS_WORKERS", 3)
    monkeypatch.setattr(io_pool, "_nas_executor", ThreadPoolExecutor(max_workers=2))   # fronta > vlákna
    monkeypatch.setattr(io_pool, "_nas_active", 0)
    gate = threading.Event()

    async def scenario() -> None:
        busy = [asyncio.ensure_future(io_pool.run_io("remote", gate.wait, 5)) for _ in range(2)]
        await asyncio.sleep(0.05)
        try:                                            # 3. úloha čeká ve frontě executoru → timeout → zrušena
            await asyncio.wait_for(io_pool.run_io("remote", gate.wait, 5), timeout=0.05)
        except asyncio.TimeoutError:
            pass
        gate.set()
        await asyncio.gather(*busy)
        await asyncio.sleep(0.05)

    asyncio.run(scenario())
    assert io_pool._nas_active == 0


# ── N2 — výpadek NAS během výpisu složky ≠ prázdný archiv ────────────────────

def test_n2_nas_outage_during_listing_keeps_last_state(tmp_path: Path, monkeypatch) -> None:
    import pytest
    from scada.config import DataConfig
    from scada.services.repositories import csv_repository as repo_mod
    from scada.services.repositories.csv_repository import CsvRepository

    nas = tmp_path / "nas"
    for k in range(3):
        _two_part(nas / "production" / f"PROD_{k}_M_2026100{k + 1}_080000_DONE.csv", str(k))
    repo = CsvRepository(DataConfig(local_path=tmp_path / "local", remote_path=str(nas),
                                    csv_separator=";", csv_encoding="utf-8-sig"))
    try:
        assert len(repo.list_remote("production")) == 3
        n_meta = len(repo._meta)
        for key in list(repo._listing):                    # TTL vypršelo → nové skenování
            repo._listing[key] = (0.0, repo._listing[key][1])

        def down(_path):
            raise FileNotFoundError(2, "Síťová cesta nebyla nalezena")   # WinError 53 / 67
        monkeypatch.setattr(repo_mod.os, "scandir", down)
        assert len(repo.list_remote("production")) == 3    # poslední známý stav, ne prázdno
        assert len(repo._meta) == n_meta                   # cache se nesmazala
        assert not repo._moved                             # NAS soubory nejsou „přesunuté"

        repo._listing.clear()                              # bez známého stavu → chyba (API 503)
        with pytest.raises(OSError):
            repo.list_remote("production")
    finally:
        repo.close()
