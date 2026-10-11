"""
Regrese kompletního auditu 2026-10-10 (K1–K42, viz 04_docs/audit_log.md).

Každý test odpovídá jednomu opravenému nálezu — číslo v názvu / docstringu.
"""
from __future__ import annotations

import asyncio
import os
import time
from pathlib import Path

import pyads
import pytest
from fastapi.testclient import TestClient

from scada.app import create_app
from scada.config import AdsConfig, AppConfig, DataConfig, ServerConfig, UserEntry
from scada.logging_setup import prune_old_logs
from scada.models import CsvRecordModel
from scada.services import signal_reader as sr
from scada.services import ws_manager as wm
from scada.services.ads_monitor import _decode_read
from scada.services.repositories import csv_repository as repo_mod
from scada.services.repositories.csv_repository import CsvRepository
from scada.services.storage_service import cleanup_synced

_TOKEN = "audit-20261010-token"
_HASH  = "64d6f2afde7dc156ace2427674d00673:ec3364dc4a3578a6f425495851e663636710cd712b3ca8797827e423bcc1ea43"
HEAD   = "Timestamp;OF_OperatingForce [N];Status [-];SortingCategory [-]"


def _two_part(path: Path, order: str, n: int = 3) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = [f"2026-10-01T08:00:{i:02d};1.5;2;1" for i in range(n)]
    path.write_text("\n".join(["Order;Microswitch_ID;Microswitch_Name", f"{order};0;M", "", HEAD, *rows]) + "\n",
                    encoding="utf-8-sig")


def _cfg(tmp_path: Path, remote: str = "") -> AppConfig:
    local = tmp_path / "local"
    local.mkdir(exist_ok=True)
    return AppConfig(
        server=ServerConfig(host="127.0.0.1", port=8080),
        ads=AdsConfig(net_id="1.2.3.4.1.1", port=851),
        data=DataConfig(local_path=local, remote_path=remote, csv_separator=";", csv_encoding="utf-8-sig"),
    )


@pytest.fixture
def app_client(tmp_path: Path):
    def make(remote: str = "", role: str = "admin"):
        app = create_app(_cfg(tmp_path, remote))
        c = TestClient(app)
        c.__enter__()
        made.append(c)
        app.state.sessions[_TOKEN] = {"username": "admin", "role": role, "display_name": "A",
                                      "created_at": time.time()}
        c.headers.update({"Authorization": f"Bearer {_TOKEN}"})
        return app, c
    made: list[TestClient] = []
    yield make
    for c in made:
        c.__exit__(None, None, None)


# ── K1 — přechodná chyba dopočtu soubor neskryje ─────────────────────────────

def _repo_with_one(tmp_path: Path, monkeypatch) -> tuple[CsvRepository, str]:
    f = tmp_path / "local" / "production" / "done_local" / "PROD_A_M_20261001_080000_DONE.csv"
    _two_part(f, "A")
    repo = CsvRepository(DataConfig(local_path=tmp_path / "local", remote_path="",
                                    csv_separator=";", csv_encoding="utf-8-sig"), background_counts=True)
    monkeypatch.setattr(repo, "_ensure_count_threads", lambda: None)
    monkeypatch.setattr(repo._count_queues["local"], "put", lambda k: None)
    metas = repo.list_local("production")
    assert len(metas) == 1 and metas[0].record_count is None
    return repo, str(f)


def test_k1_io_error_during_count_keeps_file_visible(tmp_path: Path, monkeypatch) -> None:
    repo, key = _repo_with_one(tmp_path, monkeypatch)
    try:
        def boom(*a, **k):
            raise PermissionError("zamčeno antivirem")
        monkeypatch.setattr(repo, "read_file_meta", boom)
        repo._count_job(key)
        assert repo._meta[key][2] is not None                 # NEskrytý
        assert repo._meta[key][2].record_count is None        # dopočítá se později
        assert len(repo.list_local("production")) == 1
        # odklad: hned znovu se nezařadí (frontend se nebude ptát donekonečna)
        with repo._count_lock:
            repo._count_pending.clear()
        repo.request_counts(repo.list_local("production"))
        assert not repo.counts_pending()
        # po odkladu se zkusí znovu
        monkeypatch.setattr(repo_mod, "_COUNT_RETRY_S", 0.0)
        repo.request_counts(repo.list_local("production"))
        assert repo.counts_pending()
    finally:
        repo.close()


def test_k1_corrupt_content_still_hidden(tmp_path: Path, monkeypatch) -> None:
    repo, key = _repo_with_one(tmp_path, monkeypatch)
    try:
        def bad(*a, **k):
            raise UnicodeDecodeError("utf-8", b"\xff", 0, 1, "invalid start byte")
        monkeypatch.setattr(repo, "read_file_meta", bad)
        repo._count_job(key)
        assert repo._meta[key][2] is None                     # poškozený obsah → skrýt
    finally:
        repo.close()


def test_k16_stalled_count_not_reported_pending(tmp_path: Path, monkeypatch) -> None:
    repo, key = _repo_with_one(tmp_path, monkeypatch)
    try:
        with repo._count_lock:
            repo._count_pending.update({key, "x"})
            repo._count_started.update({key: 0.0, "x": 0.0})   # běží „odjakživa" (zaseknutý NAS)
        assert not repo.counts_pending()
    finally:
        repo.close()


# ── K7 — prázdná / nečíselná Group nesmí shodit /api/data ────────────────────

def test_k7_model_tolerates_bad_group() -> None:
    assert CsvRecordModel(group="", timestamp=None).group is None
    assert CsvRecordModel(group="x", expected_count="?").group is None
    assert CsvRecordModel(group="3", expected_count="50000").expected_count == 50000


def test_k7_api_data_with_empty_group(app_client, tmp_path: Path) -> None:
    app, c = app_client()
    f = tmp_path / "local" / "production" / "done_local" / "OLD_2026-07-01_DONE.csv"
    f.parent.mkdir(parents=True)
    f.write_text("Timestamp;Order;Microswitch_ID;Microswitch_Name;Group\n"
                 "2026-07-01T08:00:00;O;1;M;\n2026-07-01T08:00:01;O;2;M;3\n", encoding="utf-8-sig")
    r = c.get("/api/data", params={"file": f.name, "location": "local", "type": "production"})
    assert r.status_code == 200, r.text
    assert [rec.get("group") for rec in r.json()["records"]] == [None, 3]


# ── K8 — I/O chyba čtení = 503 / 404, ne prázdná zakázka ─────────────────────

@pytest.mark.parametrize("exc, status", [(PermissionError("zámek"), 503), (FileNotFoundError("pryč"), 404)])
def test_k8_io_error_not_swallowed(app_client, tmp_path: Path, monkeypatch, exc, status) -> None:
    app, c = app_client()
    f = tmp_path / "local" / "production" / "done_local" / "PROD_A_M_20261001_080000_DONE.csv"
    _two_part(f, "A")

    def raise_(*a, **k):
        raise exc
    monkeypatch.setattr(CsvRepository, "_order_index", raise_)
    r = c.get("/api/data", params={"file": f.name, "location": "local", "type": "production"})
    assert r.status_code == status


# ── K6 / K9 / K22 — správa uživatelů ─────────────────────────────────────────

def _users(app) -> None:
    app.state.users = [UserEntry(username="admin", display_name="A", password_hash=_HASH, role="admin"),
                       UserEntry(username="op1", display_name="O", password_hash=_HASH, role="operator")]


def test_k6_delete_user_invalidates_sessions(app_client) -> None:
    app, c = app_client()
    _users(app)
    app.state.users_path = None
    app.state.sessions["op1-tok"] = {"username": "op1", "role": "operator", "display_name": "O",
                                     "created_at": time.time()}
    assert c.delete("/api/users/op1").status_code == 204
    assert "op1-tok" not in app.state.sessions
    r = c.get("/api/files", headers={"Authorization": "Bearer op1-tok"})
    assert r.status_code == 401


def test_k9_users_toml_write_failure_reports_and_rolls_back(app_client, tmp_path: Path) -> None:
    app, c = app_client()
    _users(app)
    app.state.users_path = tmp_path / "neexistuje" / "users.toml"      # zápis selže (chybí složka)
    r = c.post("/api/users", json={"username": "novy", "display_name": "N", "password": "x", "role": "operator"})
    assert r.status_code == 500
    assert [u.username for u in app.state.users] == ["admin", "op1"]
    old_hash = app.state.users[1].password_hash
    r = c.post("/api/users/op1/password", json={"new_password": "jine"})
    assert r.status_code == 500
    assert app.state.users[1].password_hash == old_hash
    assert c.delete("/api/users/op1").status_code == 500
    assert [u.username for u in app.state.users] == ["admin", "op1"]


def test_k22_create_user_duplicate_after_strip(app_client) -> None:
    app, c = app_client()
    _users(app)
    app.state.users_path = None
    r = c.post("/api/users", json={"username": " op1 ", "display_name": "", "password": "x", "role": "operator"})
    assert r.status_code == 409


# ── K10 / K19 / K20 — WebSocket manager ──────────────────────────────────────

class _FakeWS:
    def __init__(self, slow: bool = False) -> None:
        self.sent: list[str] = []
        self.closed: int | None = None
        self.slow = slow

    async def accept(self) -> None:
        pass

    async def send_text(self, text: str) -> None:
        if self.slow:
            await asyncio.sleep(10)
        self.sent.append(text)

    async def close(self, code: int) -> None:
        self.closed = code


def test_k10_slow_client_closed_others_unaffected(monkeypatch) -> None:
    monkeypatch.setattr(wm, "_SEND_TIMEOUT", 0.1)

    async def run() -> tuple:
        m = wm.ConnectionManager()
        await m.broadcast({"symbol": "a", "value": 1})
        await m.broadcast({"type": "files_changed", "types": ["production"]})   # K19 — necachovat
        ok, slow = _FakeWS(), _FakeWS(slow=True)
        await m.connect(ok)
        await m.connect(slow)
        await m.broadcast({"symbol": "a", "value": 2})
        await asyncio.sleep(0.4)
        return ok, slow, m
    ok, slow, m = asyncio.run(run())
    assert ok.sent == ['{"symbol": "a", "value": 1}', '{"symbol": "a", "value": 2}']   # K20 — pořadí
    assert slow.closed == 1011                                   # prohlížeč dostane onclose → reconnect
    assert m._active == [ok]
    assert "files_changed" not in m._cache


# ── K2 — STRING z PLC s diakritikou ─────────────────────────────────────────

def test_k2_string_read_decodes_cp1250() -> None:
    buf = (pyads.pyads_ex.STRING_BUFFER * pyads.PLCTYPE_STRING)()
    buf.value = "Zakázka ř".encode("cp1250")
    assert _decode_read(buf, pyads.PLCTYPE_STRING) == "Zakázka ř"


# ── K4 / K26 — signálová data po blocích, NaN ────────────────────────────────

def test_k4_signal_parsed_in_blocks_with_bad_row_and_next_section(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(sr, "_PARSE_BLOCK", 3)
    f = tmp_path / "TEST_M_20261001_080000_DONE.csv"
    rows = [f"{i * 1000};{i}.5;{i}" for i in range(8)]
    rows[4] = "4000;x;4"                                          # vadná hodnota ve 2. bloku
    f.write_text("[Metadata]\nTimestamp\n2026-10-01T08:00:00\n\n[SignalData]\n"
                 "ts [ns];position [um];force [N]\n" +"\n".join(rows) + "\n[Dalsi]\na;b\n",
                 encoding="utf-8-sig")
    cols = sr.read_signal_data(f)
    assert list(cols["ts"]) == [i * 1000.0 for i in range(8)]
    assert list(cols["position"]) == [0.5, 1.5, 2.5, 3.5, 0.0, 5.5, 6.5, 7.5]   # vadná → 0.0, zarovnáno
    assert list(cols["force"]) == [i * 1000.0 for i in range(8)]              # [N] → mN (audit X1)


def test_k26_non_finite_values_become_null() -> None:
    out = sr._convert_units({"ts": [0.0, 1e6], "position": [float("nan"), 1.0],
                             "r_nc": [float("nan"), 2.0]}, {})
    assert out["position"] == [None, 1.0]
    assert out["r_nc_mohm"] == [None, 2.0]


# ── K15 — čištění ověřuje cíleně (stat), ne výpisem celé NAS složky ──────────

def test_k15_cleanup_verifies_by_stat(tmp_path: Path) -> None:
    cfg = _cfg(tmp_path, remote=str(tmp_path / "nas")).data
    local = tmp_path / "local" / "production" / "done_remote"
    nas   = tmp_path / "nas" / "production"
    local.mkdir(parents=True)
    nas.mkdir(parents=True)
    for name, local_size, nas_size in (("same.csv", 10, 10), ("diff.csv", 10, 11), ("missing.csv", 10, None)):
        (local / name).write_bytes(b"x" * local_size)
        if nas_size is not None:
            (nas / name).write_bytes(b"x" * nas_size)
    r = cleanup_synced(cfg)
    assert (r["deleted"], r["skipped"]) == (1, 2)
    assert sorted(p.name for p in local.iterdir()) == ["diff.csv", "missing.csv"]


# ── K16 — stažení souboru jen z NAS přes NAS pool ────────────────────────────

def test_k16_remote_download_streams(app_client, tmp_path: Path) -> None:
    nas = tmp_path / "nas"
    f = nas / "production" / "PROD_A_M_20261001_080000_DONE.csv"
    _two_part(f, "A", n=50)
    app, c = app_client(remote=str(nas))
    r = c.get(f"/api/files/{f.name}/download", params={"location": "remote", "type": "production"})
    assert r.status_code == 200
    assert r.content == f.read_bytes()
    assert "attachment" in r.headers["content-disposition"]


# ── K12 — staré rotované logy se mažou ───────────────────────────────────────

def test_k12_prune_old_logs(tmp_path: Path) -> None:
    old, new, cur = (tmp_path / n for n in ("nssm_stdout-20250101.log", "nssm_stdout-20261009.log", "nssm_stdout.log"))
    for p in (old, new, cur):
        p.write_text("x")
    past = time.time() - 40 * 86400
    os.utime(old, (past, past))
    os.utime(cur, (past, past))                                   # aktuální log se nemaže nikdy
    assert prune_old_logs(tmp_path) == 1
    assert not old.exists() and new.exists() and cur.exists()
