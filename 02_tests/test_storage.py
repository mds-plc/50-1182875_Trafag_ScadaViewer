"""
Testy zaplnění lokálního úložiště a čištění synchronizovaných souborů (/api/storage).

POKRYTÍ:
  - storage_usage: součet wip/done_local/done_remote, úrovně ok/warning/critical, synced_*
  - POST /api/storage/cleanup: maže jen done_remote/ ověřené na NAS (název + velikost),
    done_local/ a wip/ nikdy; NAS nedostupný → 503 a nic se nesmaže; bez tokenu 401
  - PATCH /api/config/storage: zápis/vložení local_max_gb do Config.toml, admin+
"""
from __future__ import annotations

import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from scada.app import create_app
from scada.config import AppConfig, AdsConfig, DataConfig, ServerConfig, load_config
from scada.services.storage_service import storage_usage

_TOKEN = "test-storage-token"


def _write(path: Path, size: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"x" * size)


def _cfg(tmp_path: Path, remote: str = "", max_gb: float = 5.0) -> AppConfig:
    local = tmp_path / "local"
    local.mkdir(exist_ok=True)
    return AppConfig(
        server=ServerConfig(host="127.0.0.1", port=8080),
        ads=AdsConfig(net_id="1.2.3.4.1.1", port=851),
        data=DataConfig(local_path=local, remote_path=remote, csv_separator=";",
                        csv_encoding="utf-8-sig", local_max_gb=max_gb),
    )


_open_clients: list[TestClient] = []


def _client(cfg: AppConfig, role: str = "operator", config_path: Path | None = None) -> TestClient:
    """TestClient se spuštěným lifespanem (app.state.sessions) — ukončí ho fixture _close_clients."""
    app = create_app(cfg, config_path=config_path)
    c = TestClient(app)
    c.__enter__()
    _open_clients.append(c)
    app.state.sessions[_TOKEN] = {"username": "u", "role": role, "display_name": "U", "created_at": time.time()}
    c.headers.update({"Authorization": f"Bearer {_TOKEN}"})
    return c


@pytest.fixture(autouse=True)
def _close_clients():
    yield
    while _open_clients:
        _open_clients.pop().__exit__(None, None, None)


# ── storage_usage ────────────────────────────────────────────────────────────

class TestStorageUsage:
    def test_sums_all_subfolders_and_synced(self, tmp_path: Path) -> None:
        cfg = _cfg(tmp_path)
        base = cfg.data.local_path
        _write(base / "production/wip/A_WIP.csv", 100)
        _write(base / "production/done_local/B_DONE.csv", 200)
        _write(base / "production/done_remote/C_DONE.csv", 300)
        _write(base / "testing/done_remote/D_DONE.csv", 400)
        _write(base / "testing/done_remote/ignore.txt", 999)      # ne-CSV se nepočítá
        u = storage_usage(cfg.data)
        assert u["used_bytes"] == 1000
        assert u["file_count"] == 4
        assert u["synced_bytes"] == 700
        assert u["synced_count"] == 2
        assert u["limit_bytes"] == 5 * 1024 ** 3

    @pytest.mark.parametrize("used,level", [(700, "ok"), (800, "warning"), (950, "critical")])
    def test_levels(self, tmp_path: Path, used: int, level: str, monkeypatch) -> None:
        cfg = _cfg(tmp_path, max_gb=1000 / 1024 ** 3)            # limit = 1000 B
        _write(cfg.data.local_path / "production/done_local/A_DONE.csv", used)
        u = storage_usage(cfg.data)
        assert u["level"] == level

    def test_empty_or_missing_local(self, tmp_path: Path) -> None:
        cfg = _cfg(tmp_path)
        cfg.data.local_path = tmp_path / "neexistuje"
        u = storage_usage(cfg.data)
        assert u["used_bytes"] == 0 and u["level"] in ("ok", "warning", "critical")


# ── API ──────────────────────────────────────────────────────────────────────

class TestStorageApi:
    def test_get_storage(self, tmp_path: Path) -> None:
        cfg = _cfg(tmp_path)
        _write(cfg.data.local_path / "production/done_remote/C_DONE.csv", 300)
        c = _client(cfg)
        r = c.get("/api/storage")
        assert r.status_code == 200
        body = r.json()
        assert body["used_bytes"] == 300 and body["synced_count"] == 1 and body["level"] == "ok"

    def test_requires_auth(self, tmp_path: Path) -> None:
        c = _client(_cfg(tmp_path))
        c.headers.pop("Authorization")
        assert c.get("/api/storage").status_code == 401
        assert c.post("/api/storage/cleanup").status_code == 401

    def test_cleanup_deletes_only_verified_synced(self, tmp_path: Path) -> None:
        nas = tmp_path / "nas"
        cfg = _cfg(tmp_path, remote=str(nas))
        base = cfg.data.local_path
        _write(base / "production/done_remote/OK_DONE.csv", 300)
        _write(nas / "production/OK_DONE.csv", 300)
        _write(base / "production/done_remote/SIZE_DONE.csv", 300)
        _write(nas / "production/SIZE_DONE.csv", 299)              # nesedí velikost → ponechat
        _write(base / "testing/done_remote/MISSING_DONE.csv", 50)   # na NAS chybí → ponechat
        _write(base / "production/done_local/LOCAL_DONE.csv", 10)   # nesynchronizováno → nikdy
        _write(nas / "production/LOCAL_DONE.csv", 10)
        _write(base / "production/wip/W_WIP.csv", 10)

        r = _client(cfg).post("/api/storage/cleanup")
        assert r.status_code == 200
        assert r.json() == {"deleted": 1, "freed_bytes": 300, "skipped": 2, "failed": 0}
        assert not (base / "production/done_remote/OK_DONE.csv").exists()
        assert (base / "production/done_remote/SIZE_DONE.csv").exists()
        assert (base / "testing/done_remote/MISSING_DONE.csv").exists()
        assert (base / "production/done_local/LOCAL_DONE.csv").exists()
        assert (base / "production/wip/W_WIP.csv").exists()
        assert (nas / "production/OK_DONE.csv").exists()            # NAS se nikdy nemaže

    @pytest.mark.parametrize("remote", ["", "__missing__"])
    def test_cleanup_nas_unavailable_deletes_nothing(self, tmp_path: Path, remote: str) -> None:
        remote_path = str(tmp_path / "nas_offline") if remote else ""
        cfg = _cfg(tmp_path, remote=remote_path)
        f = cfg.data.local_path / "production/done_remote/OK_DONE.csv"
        _write(f, 300)
        r = _client(cfg).post("/api/storage/cleanup")
        assert r.status_code == 503
        assert f.exists()


class TestForceCleanup:
    def test_force_deletes_unverified_synced_only(self, tmp_path: Path) -> None:
        nas = tmp_path / "nas"
        cfg = _cfg(tmp_path, remote=str(nas))
        base = cfg.data.local_path
        _write(base / "production/done_remote/SIZE_DONE.csv", 300)
        _write(nas / "production/SIZE_DONE.csv", 299)
        _write(base / "testing/done_remote/MISSING_DONE.csv", 50)
        _write(base / "production/done_local/LOCAL_DONE.csv", 10)
        _write(base / "production/wip/W_WIP.csv", 10)

        r = _client(cfg).post("/api/storage/cleanup?force=true")
        assert r.status_code == 200
        assert r.json() == {"deleted": 2, "freed_bytes": 350, "skipped": 0, "failed": 0}
        assert not list((base / "production/done_remote").iterdir())
        assert not list((base / "testing/done_remote").iterdir())
        assert (base / "production/done_local/LOCAL_DONE.csv").exists()   # nesynchronizované nikdy
        assert (base / "production/wip/W_WIP.csv").exists()
        assert (nas / "production/SIZE_DONE.csv").exists()

    @pytest.mark.parametrize("remote", ["", "offline"])
    def test_force_works_without_nas(self, tmp_path: Path, remote: str) -> None:
        cfg = _cfg(tmp_path, remote=str(tmp_path / "nas_offline") if remote else "")
        f = cfg.data.local_path / "production/done_remote/A_DONE.csv"
        _write(f, 100)
        r = _client(cfg).post("/api/storage/cleanup?force=true")
        assert r.status_code == 200 and r.json()["deleted"] == 1
        assert not f.exists()

    def test_force_requires_auth(self, tmp_path: Path) -> None:
        c = _client(_cfg(tmp_path))
        c.headers.pop("Authorization")
        assert c.post("/api/storage/cleanup?force=true").status_code == 401


class TestStorageLimitConfig:
    _TOML = (
        '[server]\nhost = "127.0.0.1"\nport = 8080\n\n'
        '[ads]\nnet_id = "1.2.3.4.1.1"\nport = 851\n\n'
        '[data]\nlocal_path = "{local}"\nremote_path = ""\n'
        'csv_separator = ";"\ncsv_encoding  = "utf-8-sig"  # komentář\n'
    )

    def _setup(self, tmp_path: Path, extra: str = "") -> tuple[AppConfig, Path]:
        cfg = _cfg(tmp_path)
        p = tmp_path / "Config.toml"
        p.write_text(self._TOML.format(local=cfg.data.local_path.as_posix()) + extra, encoding="utf-8")
        return cfg, p

    def test_insert_missing_key(self, tmp_path: Path) -> None:
        cfg, p = self._setup(tmp_path)
        c = _client(cfg, role="admin", config_path=p)
        assert c.patch("/api/config/storage", json={"local_max_gb": 12.5}).status_code == 204
        assert load_config(p).data.local_max_gb == 12.5
        assert c.get("/api/config").json()["data"]["local_max_gb"] == 12.5
        assert c.get("/api/storage").json()["limit_bytes"] == int(12.5 * 1024 ** 3)

    def test_replace_existing_key(self, tmp_path: Path) -> None:
        cfg, p = self._setup(tmp_path, extra="local_max_gb = 5.0\n")
        c = _client(cfg, role="admin", config_path=p)
        assert c.patch("/api/config/storage", json={"local_max_gb": 20}).status_code == 204
        text = p.read_text(encoding="utf-8")
        assert text.count("local_max_gb") == 1
        assert load_config(p).data.local_max_gb == 20

    def test_forbidden_for_operator_and_invalid_value(self, tmp_path: Path) -> None:
        cfg, p = self._setup(tmp_path)
        assert _client(cfg, role="operator", config_path=p).patch(
            "/api/config/storage", json={"local_max_gb": 10}).status_code == 403
        assert _client(cfg, role="admin", config_path=p).patch(
            "/api/config/storage", json={"local_max_gb": 0}).status_code == 422

    def test_default_when_key_missing(self, tmp_path: Path) -> None:
        _, p = self._setup(tmp_path)
        assert load_config(p).data.local_max_gb == 5.0
