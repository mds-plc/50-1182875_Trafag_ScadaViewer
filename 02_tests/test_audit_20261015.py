"""
Regrese hloubkové analýzy 2026-10-15 (nálezy Q*, viz 04_docs/audit_log.md).

POKRYTÍ:
  - Q6: řazení podle ID / typu spínače — nepřečtené soubory (record_count None) jsou neznámé → na konec
  (Q2 / Q27 — NasProbe — viz test_storage.py::TestNasProbe; Q1 — test_gateway_prod_format.py + Vitest)
"""
from __future__ import annotations

import sqlite3
import tomllib
from pathlib import Path

import pytest

from scada.api.config_api import _clean_path, _write_paths
from scada.config import DataConfig
from scada.services.file_service import FileService
from scada.services.repositories.csv_repository import CsvRepository


class _Repo:
    """Minimální repozitář pro FileService.list_files."""

    def __init__(self, files: list[dict]) -> None:
        self._files = files

    def validate_params(self, *_a) -> bool:
        return True

    def list_local(self, _t: str) -> list[dict]:
        return list(self._files)

    list_remote = list_local


def _f(name: str, switch_id: str, switch_name: str, count: int | None) -> dict:
    return {"filename": name, "created_at": "2026-10-15T10:00:00", "switch_id": switch_id,
            "switch_name": switch_name, "record_count": count, "order_id": name}


class TestQ6SortBySwitch:
    FILES = [
        _f("a", "",          "E00003-C", None),   # nepřečtený: ID neznámé, název = SAP z názvu souboru
        _f("b", "E00002-C",  "Mid",      5),
        _f("c", "",          "E00001-C", None),
        _f("d", "E00009-C",  "Low",      7),
    ]

    def _order(self, sort_by: str, sort_dir: str) -> list[str]:
        svc = FileService(_Repo(self.FILES))  # type: ignore[arg-type]
        return [f["filename"] for f in svc.list_files("remote", "production", sort_by=sort_by, sort_dir=sort_dir)]

    def test_unread_files_last_both_directions(self) -> None:
        assert self._order("switch_id", "asc")[:2] == ["b", "d"]
        assert self._order("switch_id", "desc")[:2] == ["d", "b"]
        assert set(self._order("switch_id", "asc")[2:]) == {"a", "c"}

    def test_switch_name_guess_not_mixed_with_real_names(self) -> None:
        assert self._order("switch_name", "asc")[:2] == ["d", "b"]          # Low < Mid; SAP odhad na konci
        assert set(self._order("switch_name", "asc")[2:]) == {"a", "c"}

    def test_created_at_unaffected(self) -> None:
        assert len(self._order("created_at", "desc")) == 4


class TestQ14CacheMigration:
    """Schéma 3 → 4: počty kusů NAS archivu (tabulka known) se nesmí ztratit."""

    NAME = "PROD_1268847_E01389-C_20260916_161723_DONE.csv"

    def _schema3(self, db: Path) -> None:
        conn = sqlite3.connect(str(db))
        conn.execute("CREATE TABLE info (k TEXT PRIMARY KEY, v TEXT)")
        conn.execute("INSERT INTO info VALUES ('schema', '3')")
        conn.execute("CREATE TABLE known (name TEXT PRIMARY KEY, size INTEGER, record_count INTEGER, "
                     "order_id TEXT, switch_name TEXT)")
        conn.execute("INSERT INTO known VALUES (?, 1234, 50000, '1268847', 'Marquardt')", (self.NAME,))
        conn.execute("CREATE TABLE meta (path TEXT PRIMARY KEY, x TEXT)")
        conn.commit()
        conn.close()

    def _repo(self, tmp_path: Path, db: Path) -> CsvRepository:
        cfg = DataConfig(local_path=str(tmp_path / "local"), remote_path=str(tmp_path / "nas"),
                         csv_separator=";", csv_encoding="utf-8-sig")
        return CsvRepository(cfg, cache_file=db, background_counts=True)

    def test_known_kept_and_meta_rebuilt(self, tmp_path: Path) -> None:
        db = tmp_path / "file_meta.sqlite"
        self._schema3(db)
        repo = self._repo(tmp_path, db)
        try:
            assert repo._known[self.NAME] == (1234, 50000, "1268847", "Marquardt", None)
            item = ("klic", self.NAME, 0, 1234, 0.0)          # (klíč, název, mtime_ns, size, …)
            remote = repo._quick_meta(item, "production", "remote", None)
            assert remote["record_count"] == 50000 and remote["switch_id"] == ""   # NAS: bez stahování
            local = repo._quick_meta(item, "production", "local", "done_remote")
            assert local["record_count"] is None                                  # lokál: přečíst znovu
        finally:
            repo.close()
        conn = sqlite3.connect(str(db))
        assert conn.execute("SELECT v FROM info WHERE k='schema'").fetchone()[0] == "4"
        cols = [r[1] for r in conn.execute("PRAGMA table_info(meta)")]
        assert "switch_id" in cols and "mtime_ns" in cols
        conn.close()

    def test_unknown_schema_still_rebuilt(self, tmp_path: Path) -> None:
        db = tmp_path / "file_meta.sqlite"
        conn = sqlite3.connect(str(db))
        conn.execute("CREATE TABLE info (k TEXT PRIMARY KEY, v TEXT)")
        conn.execute("INSERT INTO info VALUES ('schema', '2')")
        conn.execute("CREATE TABLE known (name TEXT PRIMARY KEY, size INTEGER)")
        conn.commit()
        conn.close()
        repo = self._repo(tmp_path, db)
        try:
            assert repo._known == {}
        finally:
            repo.close()


class TestQ4ConfigPaths:
    """Cesta vložená i s uvozovkami nesmí rozbít Config.toml (služba by po restartu nenastartovala)."""

    def _cfg(self, tmp_path: Path, remote_line: str = 'remote_path = "y"') -> Path:
        p = tmp_path / "Config.toml"
        p.write_text(f'[data]\nlocal_path = "x"\n{remote_line}\n# local_path = "komentar"\n', encoding="utf-8")
        return p

    @pytest.mark.parametrize("raw, expected", [
        ('"\\\\10.45.124.20\\trafag_test"', "\\\\10.45.124.20\\trafag_test"),
        ("  'C:\\data'  ", "C:\\data"),
        ("C:\\data", "C:\\data"),
        ("", ""),
    ])
    def test_clean_path_strips_wrapping_quotes(self, raw: str, expected: str) -> None:
        assert _clean_path(raw) == expected

    @pytest.mark.parametrize("raw", ['C:\\a"b', "C:\\a\tb", "C:\\a\x7fb"])
    def test_clean_path_rejects_quotes_and_control_chars(self, raw: str) -> None:
        with pytest.raises(ValueError):
            _clean_path(raw)

    def test_old_escaped_quote_value_rewritten_validly(self, tmp_path: Path) -> None:
        # stav po chybě před opravou: hodnota s \" uvnitř — dřív regex [^"]* skončil na \" → nevalidní TOML
        p = self._cfg(tmp_path, r'remote_path = "\"\\\\nas\\share\""')
        _write_paths(p, "C:\\data", "\\\\nas\\share")
        data = tomllib.loads(p.read_text(encoding="utf-8"))["data"]
        assert data == {"local_path": "C:\\data", "remote_path": "\\\\nas\\share"}
        assert '# local_path = "komentar"' in p.read_text(encoding="utf-8")       # komentář nedotčen

    def test_literal_string_value_rewritten(self, tmp_path: Path) -> None:
        p = self._cfg(tmp_path, r"remote_path = '\\nas\old'")
        _write_paths(p, "C:\\data", "\\\\nas\\new")
        assert tomllib.loads(p.read_text(encoding="utf-8"))["data"]["remote_path"] == "\\\\nas\\new"

    def test_api_strips_quotes(self, tmp_path: Path) -> None:
        from fastapi.testclient import TestClient
        from test_api import make_app, _inject_session
        import time
        app, _ = make_app(tmp_path)
        cfg_file = self._cfg(tmp_path)
        with TestClient(app) as c:
            app.state.config_path = cfg_file
            _inject_session(app, "adm", {"username": "a", "role": "admin", "display_name": "A",
                                         "created_at": time.time()})
            h = {"Authorization": "Bearer adm"}
            r = c.patch("/api/config/paths", headers=h,
                        json={"local_path": f'"{tmp_path}"', "remote_path": '"\\\\10.45.124.20\\trafag_test"'})
            assert r.status_code == 204
            r = c.patch("/api/config/paths", headers=h, json={"local_path": str(tmp_path), "remote_path": 'a"b'})
            assert r.status_code == 400
        data = tomllib.loads(cfg_file.read_text(encoding="utf-8"))["data"]
        assert data["remote_path"].rstrip("\\") == "\\\\10.45.124.20\\trafag_test"   # Path() přidá \ ke kořeni share


def test_q24_storage_limit_minimum() -> None:
    from pydantic import ValidationError
    from scada.models import UpdateStorageLimitRequest
    with pytest.raises(ValidationError):
        UpdateStorageLimitRequest(local_max_gb=1e-12)
    assert UpdateStorageLimitRequest(local_max_gb=0.1).local_max_gb == 0.1


class TestQ3NasOutageListing:
    """Skutečný výpadek share: Path.exists() vrací False (WinError 53/67) — archiv nesmí být prázdný 200."""

    def _repo(self, tmp_path: Path) -> tuple[CsvRepository, Path]:
        nas = tmp_path / "nas"
        f = nas / "production" / "PROD_1_M_20261001_080000_DONE.csv"
        f.parent.mkdir(parents=True)
        f.write_text("Order;Microswitch_ID;Microswitch_Name\n1;0;M\n\nTimestamp;Status [-]\n"
                     "2026-10-01T08:00:00;2\n", encoding="utf-8-sig")
        return CsvRepository(DataConfig(local_path=tmp_path / "local", remote_path=str(nas),
                                        csv_separator=";", csv_encoding="utf-8-sig")), nas

    def _outage(self, monkeypatch) -> None:
        from scada.services.repositories import csv_repository as repo_mod

        def down(_p):
            raise FileNotFoundError(2, "Síťová cesta nebyla nalezena")
        monkeypatch.setattr(repo_mod.os, "scandir", down)
        monkeypatch.setattr(Path, "exists", lambda self, **_k: False)
        monkeypatch.setattr(Path, "is_dir", lambda self, **_k: False)

    def test_last_state_then_error(self, tmp_path: Path, monkeypatch) -> None:
        repo, _ = self._repo(tmp_path)
        try:
            assert len(repo.list_remote("production")) == 1
            for key in list(repo._listing):
                repo._listing[key] = (0.0, repo._listing[key][1])
            self._outage(monkeypatch)
            assert len(repo.list_remote("production")) == 1      # poslední známý stav
            repo._listing.clear()
            with pytest.raises(OSError):                       # bez stavu → 503 v API
                repo.list_remote("production")
        finally:
            repo.close()

    def test_missing_subfolder_on_reachable_share_is_empty(self, tmp_path: Path) -> None:
        repo, _ = self._repo(tmp_path)
        try:
            assert repo.list_remote("testing") == []
        finally:
            repo.close()

    def test_no_remote_path(self, tmp_path: Path) -> None:
        repo = CsvRepository(DataConfig(local_path=tmp_path, remote_path="", csv_separator=";",
                                        csv_encoding="utf-8-sig"))
        try:
            assert repo.list_remote("production") == []
        finally:
            repo.close()


class TestQ5DeleteUnsynced:
    """Soubor z done_local/ (ještě není na NAS = jediná kopie) smí smazat jen admin+."""

    NAME_LOCAL  = "PROD_1_M_20261001_080000_DONE.csv"
    NAME_SYNCED = "PROD_2_M_20261002_080000_DONE.csv"

    def _client(self, tmp_path: Path, role: str):
        import time
        from fastapi.testclient import TestClient
        from test_api import make_app, _inject_session
        app, cfg = make_app(tmp_path)
        for folder, name in (("done_local", self.NAME_LOCAL), ("done_remote", self.NAME_SYNCED)):
            p = Path(cfg.data.local_path) / "production" / folder / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text("Timestamp;Status [-]\n2026-10-01T08:00:00;2\n", encoding="utf-8-sig")
        c = TestClient(app)
        c.__enter__()
        _inject_session(app, "tok", {"username": "u", "role": role, "display_name": "U", "created_at": time.time()})
        c.headers.update({"Authorization": "Bearer tok"})
        return c, Path(cfg.data.local_path) / "production"

    def _delete(self, c, name: str):
        return c.delete(f"/api/files/{name}", params={"location": "local", "type": "production"})

    def test_technician_cannot_delete_unsynced(self, tmp_path: Path) -> None:
        c, base = self._client(tmp_path, "technician")
        try:
            r = self._delete(c, self.NAME_LOCAL)
            assert r.status_code == 403 and "NAS" in r.json()["detail"]
            assert (base / "done_local" / self.NAME_LOCAL).exists()
            assert self._delete(c, self.NAME_SYNCED).status_code == 204     # synchronizovaný smí
        finally:
            c.__exit__(None, None, None)

    def test_admin_can_delete_unsynced(self, tmp_path: Path) -> None:
        c, base = self._client(tmp_path, "admin")
        try:
            assert self._delete(c, self.NAME_LOCAL).status_code == 204
            assert not (base / "done_local" / self.NAME_LOCAL).exists()
        finally:
            c.__exit__(None, None, None)

    def test_batch_technician_skips_unsynced(self, tmp_path: Path) -> None:
        c, base = self._client(tmp_path, "technician")
        try:
            body = c.post("/api/files/batch-delete", json={
                "file_ids": [self.NAME_LOCAL, self.NAME_SYNCED], "location": "local", "type": "production"}).json()
            assert body["deleted"] == 1 and body["failed"] == 1
            assert body["errors"] == [{"file_id": self.NAME_LOCAL, "error": "unsynced_forbidden"}]
            assert (base / "done_local" / self.NAME_LOCAL).exists()
        finally:
            c.__exit__(None, None, None)


class TestQ7OrderInfoSingleRead:
    """order_info ze stejného indexu jako záznamy; zakázka nad strop velikosti → 413."""

    def test_order_info_without_second_read(self, monkeypatch, tmp_path: Path) -> None:
        import test_prod_blocks as pb
        from scada.services.repositories import csv_repository as repo_mod

        builds = []
        orig = repo_mod.CsvRepository._build_index

        def counting(self, path, size=0):
            builds.append(path)
            return orig(self, path, size)
        monkeypatch.setattr(repo_mod.CsvRepository, "_build_index", counting)
        monkeypatch.setattr(repo_mod, "_INDEX_CACHE_BYTES", 0)      # index se necachuje (velký soubor)
        gen = pb.client.__wrapped__(tmp_path)
        c = next(gen)
        try:
            body = pb._data(c)
            assert body["order_info"]["recipe"] == "1" and body["total"] == 12
            assert len(builds) == 1                                   # dřív 2 (read_records + read_order_info)
            t = c.get("/api/data", params={"file": "TEST_M_20261001_080000_DONE.csv",
                                           "location": "local", "type": "testing"}).json()
            assert t["order_info"] is None
        finally:
            gen.close()

    def test_too_large_file_413(self, monkeypatch, tmp_path: Path) -> None:
        import test_prod_blocks as pb
        from scada.services.repositories import csv_repository as repo_mod

        monkeypatch.setattr(repo_mod, "_MAX_ORDER_FILE_BYTES", 100)
        gen = pb.client.__wrapped__(tmp_path)
        c = next(gen)
        try:
            r = c.get("/api/data", params={"file": pb._NAME, "location": "local", "type": "production"})
            assert r.status_code == 413 and "CSV" in r.json()["detail"]
            t = c.get("/api/data", params={"file": "TEST_M_20261001_080000_DONE.csv",
                                           "location": "local", "type": "testing"})
            assert t.status_code == 200                               # TEST se strop netýká
        finally:
            gen.close()


class TestQ13DaemonPool:
    """Visící NAS / ADS vlákno nesmí držet ukončení procesu (nssm stop, deploy)."""

    def test_process_exits_while_nas_thread_hangs(self) -> None:
        import subprocess
        import sys
        import time as _t
        code = (
            "import asyncio, sys, time\n"
            "sys.path.insert(0, '00_backend')\n"
            "from scada.services.io_pool import run_io\n"
            "async def main():\n"
            "    try:\n"
            "        await asyncio.wait_for(run_io('remote', time.sleep, 30), timeout=0.2)\n"
            "    except asyncio.TimeoutError:\n"
            "        pass\n"
            "asyncio.run(main())\n"
        )
        root = Path(__file__).resolve().parents[1]
        t0 = _t.monotonic()
        subprocess.run([sys.executable, "-c", code], cwd=root, check=True, timeout=25)
        assert _t.monotonic() - t0 < 10           # dřív čekal 30 s na doběhnutí vlákna

    def test_pool_semantics(self) -> None:
        import threading
        from scada.services.io_pool import DaemonThreadPool
        pool = DaemonThreadPool(2, "t")
        assert pool.submit(lambda a, b: a + b, 2, 3).result(timeout=2) == 5
        f = pool.submit(lambda: 1 / 0)
        with pytest.raises(ZeroDivisionError):
            f.result(timeout=2)
        gate = threading.Event()
        busy = [pool.submit(gate.wait, 5) for _ in range(2)]
        queued = pool.submit(lambda: "x")
        assert queued.cancel()                       # ve frontě → zrušitelná (R4)
        done = []
        queued.add_done_callback(lambda _f: done.append(1))
        assert done == [1]
        gate.set()
        assert all(b.result(timeout=2) for b in busy)
        assert len(pool._threads) == 2               # nejvýš max_workers vláken
        pool.shutdown(wait=True)
        with pytest.raises(RuntimeError):
            pool.submit(lambda: 1)


# ── Revize oprav 2026-10-16 (ekosystémová kontrola) ─────────────────────────────

class TestReviewFixes:
    def test_nasprobe_hanging_refresh_reports_default(self) -> None:
        """Visící obnova po vypršení TTL → po timeout_s výchozí (NAS nedostupný), ne starý „dostupný"."""
        import asyncio
        import threading
        from scada.services.io_pool import NasProbe

        gate = threading.Event()
        calls = []

        def probe():
            calls.append(1)
            if len(calls) > 1:
                gate.wait(5)                    # druhý dotaz visí (NAS vypadl)
            return True

        async def scenario():
            p = NasProbe(ttl_s=0.05, timeout_s=0.2, default=False)
            assert await p.get("nas", probe) is True
            await asyncio.sleep(0.1)            # TTL vypršelo → obnova na pozadí visí
            assert await p.get("nas", probe) is True       # ještě v rámci timeout_s → starý stav
            await asyncio.sleep(0.3)
            assert await p.get("nas", probe) is False      # visí déle než timeout_s → nedostupný
            assert len(calls) == 2                          # pořád jen jeden běžící dotaz
            gate.set()

        asyncio.run(scenario())

    def test_migration_repeatable_after_interrupt(self, tmp_path: Path) -> None:
        """Přerušená migrace 3→4 (sloupec už přidán, schéma pořád 3) nesmí smazat tabulku known."""
        db = tmp_path / "file_meta.sqlite"
        TestQ14CacheMigration()._schema3(db)
        conn = sqlite3.connect(str(db))
        conn.execute("ALTER TABLE known ADD COLUMN switch_id TEXT")      # stav po přerušení
        conn.commit()
        conn.close()
        repo = TestQ14CacheMigration()._repo(tmp_path, db)
        try:
            assert repo._known[TestQ14CacheMigration.NAME][1] == 50000
        finally:
            repo.close()

    def test_locked_cache_not_deleted(self, tmp_path: Path) -> None:
        """Cache zamčená jinou instancí se nesmaže — tato běží jen v paměti."""
        from scada.services.repositories import csv_repository as repo_mod
        db = tmp_path / "file_meta.sqlite"
        TestQ14CacheMigration()._schema3(db)
        other = sqlite3.connect(str(db), isolation_level=None)
        other.execute("BEGIN IMMEDIATE")                                  # druhá instance drží zámek
        try:
            store = repo_mod._MetaStore.__new__(repo_mod._MetaStore)
            store._path, store._lock = db, __import__("threading").Lock()
            import unittest.mock as um
            real_connect = sqlite3.connect
            with um.patch.object(repo_mod.sqlite3, "connect",
                                 lambda *a, **k: real_connect(*a, **{**k, "timeout": 0.1})):
                assert store._open() is None
            assert db.exists()
        finally:
            other.execute("ROLLBACK")
            other.close()

    def test_list_remote_outage_no_second_network_call(self, tmp_path: Path, monkeypatch) -> None:
        from scada.services.repositories import csv_repository as repo_mod
        repo, _ = TestQ3NasOutageListing()._repo(tmp_path)
        try:
            def down(_p):
                raise OSError(None, "Síťový název nebyl nalezen", None, 67)
            monkeypatch.setattr(repo_mod.os, "scandir", down)
            touched = []
            monkeypatch.setattr(Path, "is_dir", lambda self, **_k: touched.append(self) or True)
            with pytest.raises(OSError):
                repo.list_remote("production")
            assert touched == []                          # žádné is_dir() na NAS navíc
        finally:
            repo.close()

    def test_delete_targets_clicked_copy(self, tmp_path: Path) -> None:
        """Soubor v done_local i done_remote: technik smaže synchronizovanou kopii (řádek Synced),
        nesynchronizovaná zůstane; bez sync parametru se bere chráněná done_local."""
        q5 = TestQ5DeleteUnsynced()
        c, base = q5._client(tmp_path, "technician")
        try:
            name = q5.NAME_SYNCED
            (base / "done_local" / name).write_text("Timestamp;Status [-]\n", encoding="utf-8-sig")
            p = {"location": "local", "type": "production"}
            assert c.delete(f"/api/files/{name}", params=p).status_code == 403
            assert c.delete(f"/api/files/{name}", params={**p, "sync": "done_remote"}).status_code == 204
            assert not (base / "done_remote" / name).exists() and (base / "done_local" / name).exists()
            assert c.delete(f"/api/files/{name}", params={**p, "sync": "nesmysl"}).status_code == 422
        finally:
            c.__exit__(None, None, None)
