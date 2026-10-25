"""
Regrese celkového auditu ekosystému A26 (2026-10-25) — nízké nálezy ScadaViewer (viz 04_docs/audit_log.md).

POKRYTÍ:
  - A26-39: souběžná stavba indexu stejné zakázky → jedna stavba, druhý požadavek dostane hotový index
  - A26-41: _flush — vyzvednutí dávky i zápis do SQLite pod jedním zámkem (pořadí zápisů)
  - A26-42: nečitelný users.toml → nouzový admin, změny uživatelů 409, /api/health users_file_error; záloha .bak
  - A26-43: hromadné mazání s kopií (items[].sync) — soubor v done_local i done_remote
  - A26-45: atomic_write_text (tmp + fsync + replace)
(A26-17 / A26-18 / A26-40 — test_df_fpr_c.py, test_remote_access.py, test_api.py)
"""
from __future__ import annotations

import threading
import time
from pathlib import Path

from fastapi.testclient import TestClient

from scada.config import AuthConfig, UserEntry, atomic_write_text, hash_password, load_users_checked, save_users
from scada.config import DataConfig
from scada.services.repositories import csv_repository as repo_mod
from scada.services.repositories.csv_repository import CsvRepository


def _prod_file(base: Path, name: str, rows: int = 3) -> Path:
    p = base / "production" / "done_local" / name
    p.parent.mkdir(parents=True, exist_ok=True)
    lines = ["Timestamp;Order;Status [-]"] + [f"2026-10-25T08:00:{i:02d};A;2" for i in range(rows)]
    p.write_text("\n".join(lines) + "\n", encoding="utf-8-sig")
    return p


def _cfg(tmp_path: Path) -> DataConfig:
    return DataConfig(local_path=tmp_path, remote_path="", csv_separator=";", csv_encoding="utf-8-sig")


class TestA26_39IndexBuiltOnce:
    def test_concurrent_requests_build_index_once(self, monkeypatch, tmp_path: Path) -> None:
        path = _prod_file(tmp_path, "PROD_A_M_20261025_080000_DONE.csv", rows=50)
        repo = CsvRepository(_cfg(tmp_path))
        builds: list[int] = []
        orig = repo_mod.CsvRepository._build_index

        def slow_build(self, p, size=0):
            builds.append(1)
            time.sleep(0.2)                       # druhý požadavek přijde během stavby
            return orig(self, p, size)
        monkeypatch.setattr(repo_mod.CsvRepository, "_build_index", slow_build)
        results: list = []
        threads = [threading.Thread(target=lambda: results.append(repo._order_index(path))) for _ in range(3)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        assert len(builds) == 1
        assert len({id(r) for r in results}) == 1 and results[0] is not None


class TestA26_41FlushOrdered:
    def test_second_flush_waits_for_first_write(self, tmp_path: Path) -> None:
        repo = CsvRepository(_cfg(tmp_path), cache_file=tmp_path / "c.sqlite")
        order: list[str] = []
        real_write = repo._store.write

        def write(rows, drops, known):
            order.append(f"start{len(order)}")
            time.sleep(0.15)
            real_write(rows, drops, known)
            order.append("end")
        repo._store.write = write                 # type: ignore[method-assign]
        repo._dirty["a"] = None
        t = threading.Thread(target=repo._flush)
        t.start()
        time.sleep(0.05)
        repo._dirty["b"] = None
        repo._flush()                              # musí počkat, než první zápis doběhne
        t.join()
        assert order == ["start0", "end", "start2", "end"]


class TestA26_42UsersFile:
    def test_unreadable_users_toml_flagged(self, tmp_path: Path) -> None:
        p = tmp_path / "users.toml"
        p.write_text("[[users]\nusername = ", encoding="utf-8")          # poškozený TOML
        users, error = load_users_checked(p, AuthConfig(username="admin", password_hash="x"))
        assert error is True and [u.username for u in users] == ["admin"]
        users, error = load_users_checked(tmp_path / "chybi.toml", AuthConfig(username="admin", password_hash="x"))
        assert error is False

    def test_save_users_keeps_backup(self, tmp_path: Path) -> None:
        p = tmp_path / "users.toml"
        save_users([UserEntry("a", "A", hash_password("x"), "admin")], p)
        save_users([UserEntry("b", "B", hash_password("x"), "admin")], p)
        assert 'username     = "a"' in (tmp_path / "users.toml.bak").read_text(encoding="utf-8")
        assert 'username     = "b"' in p.read_text(encoding="utf-8")

    def test_user_changes_blocked_and_health_flag(self, tmp_path: Path) -> None:
        from test_api import make_app, _inject_session
        app, _ = make_app(tmp_path)
        with TestClient(app) as c:
            app.state.users_path = tmp_path / "users.toml"
            app.state.users_read_error = True
            _inject_session(app, "tok", {"username": "admin", "role": "admin", "display_name": "A",
                                         "created_at": time.time()})
            r = c.post("/api/users", headers={"Authorization": "Bearer tok"},
                       json={"username": "novy", "display_name": "N", "password": "pw-123456", "role": "operator"})
            assert r.status_code == 409 and "users.toml" in r.json()["detail"]
            assert all(u.username != "novy" for u in app.state.users)        # stav v paměti vrácen
            assert c.get("/api/health").json()["checks"]["users_file_error"] is True


class TestA26_43BatchDeleteCopies:
    NAME = "PROD_9_M_20261025_090000_DONE.csv"

    def test_technician_deletes_synced_copy_of_duplicate(self, tmp_path: Path) -> None:
        from test_api import make_app, _inject_session
        app, cfg = make_app(tmp_path)
        base = Path(cfg.data.local_path) / "production"
        for folder in ("done_local", "done_remote"):
            p = base / folder / self.NAME
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text("Timestamp;Status [-]\n2026-10-25T09:00:00;2\n", encoding="utf-8-sig")
        with TestClient(app) as c:
            _inject_session(app, "tok", {"username": "t", "role": "technician", "display_name": "T",
                                         "created_at": time.time()})
            body = c.post("/api/files/batch-delete", headers={"Authorization": "Bearer tok"}, json={
                "items": [{"file_id": self.NAME, "sync": "done_remote"}, {"file_id": self.NAME, "sync": "done_local"}],
                "location": "local", "type": "production"}).json()
        assert body["deleted"] == 1 and body["errors"] == [{"file_id": self.NAME, "error": "unsynced_forbidden"}]
        assert not (base / "done_remote" / self.NAME).exists()
        assert (base / "done_local" / self.NAME).exists()


def test_a26_45_atomic_write_text(tmp_path: Path) -> None:
    p = tmp_path / "Config.toml"
    atomic_write_text(p, "[a]\nb = 1\n")
    assert p.read_text(encoding="utf-8") == "[a]\nb = 1\n"
    assert not (tmp_path / "Config.toml.tmp").exists()
