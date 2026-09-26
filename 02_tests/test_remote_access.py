"""
Testy vzdáleného přístupu (klient mimo PC u stroje — např. kancelář přes firemní síť).

POKRYTÍ:
  - GET /api/auth/client: localhost → local=true, jiná adresa → false; IPv4-mapped IPv6
  - PLC auto-login jen z PC u stroje (vzdáleně 403 i při přihlášené obsluze)
  - vzdáleně jen prohlížení: čtení OK; mazání, čištění, nastavení, správa uživatelů → 403
  - vzdáleně smí uživatel změnit VLASTNÍ heslo, cizí ne
  - server.local_clients: vlastní rozsah (CIDR) = klient u stroje; neplatná položka → ValueError
"""
from __future__ import annotations

import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from scada.app import create_app
from scada.config import AppConfig, AdsConfig, DataConfig, ServerConfig, UserEntry, _validate_config, hash_password

_TOKEN  = "remote-test-token"
_REMOTE = ("10.45.124.77", 51000)   # PC v kanceláři (firemní síť)


def _cfg(tmp_path: Path, local_clients: list[str] | None = None) -> AppConfig:
    local = tmp_path / "local"
    (local / "production" / "done_local").mkdir(parents=True, exist_ok=True)
    (local / "production" / "done_local" / "A_DONE.csv").write_text("Timestamp;Order\n2026-07-20T08:00:00;1\n", encoding="utf-8-sig")
    server = ServerConfig(host="0.0.0.0", port=8080)
    if local_clients is not None:
        server.local_clients = local_clients
    return AppConfig(
        server=server,
        ads=AdsConfig(net_id="1.2.3.4.1.1", port=851),
        data=DataConfig(local_path=local, remote_path="", csv_separator=";", csv_encoding="utf-8-sig"),
    )


@pytest.fixture
def make_client(tmp_path: Path):
    opened: list[TestClient] = []

    def factory(client=None, role: str = "admin", local_clients: list[str] | None = None) -> TestClient:
        app = create_app(_cfg(tmp_path, local_clients))
        c = TestClient(app, client=client) if client else TestClient(app)
        c.__enter__()
        opened.append(c)
        app.state.users_path = None
        app.state.users = [
            UserEntry("admin", "Admin", hash_password("pw-admin"), "admin"),
            UserEntry("tech",  "Tech",  hash_password("pw-tech"),  "technician"),
        ]
        app.state.sessions[_TOKEN] = {"username": "admin", "role": role, "display_name": "Admin",
                                      "created_at": time.time()}
        c.headers.update({"Authorization": f"Bearer {_TOKEN}"})
        return c

    yield factory
    for c in opened:
        c.__exit__(None, None, None)


def test_client_info_local_vs_remote(make_client) -> None:
    assert make_client().get("/api/auth/client").json() == {"local": True}
    assert make_client(client=_REMOTE).get("/api/auth/client").json() == {"local": False}
    assert make_client(client=("::1", 1)).get("/api/auth/client").json() == {"local": True}
    assert make_client(client=("::ffff:127.0.0.1", 1)).get("/api/auth/client").json() == {"local": True}


def test_plc_login_only_local(make_client) -> None:
    local = make_client()
    local.app.state.monitor.current_values["plc_operator_login"] = True
    assert local.post("/api/auth/plc-login").status_code == 200

    remote = make_client(client=_REMOTE)
    remote.app.state.monitor.current_values["plc_operator_login"] = True
    r = remote.post("/api/auth/plc-login")
    assert r.status_code == 403
    assert "u stroje" in r.json()["detail"]


def test_remote_can_read(make_client) -> None:
    c = make_client(client=_REMOTE)
    assert c.get("/api/files", params={"location": "local", "type": "production"}).status_code == 200
    assert c.get("/api/data", params={"file": "A_DONE.csv", "location": "local", "type": "production"}).status_code == 200
    assert c.get("/api/storage").status_code == 200
    assert c.get("/api/config").status_code == 200
    assert c.get("/api/users").status_code == 200
    assert c.get("/api/files/A_DONE.csv/download", params={"location": "local", "type": "production"}).status_code == 200


@pytest.mark.parametrize("method,url,body", [
    ("delete", "/api/files/A_DONE.csv?location=local&type=production", None),
    ("post",   "/api/files/batch-delete", {"file_ids": ["A_DONE.csv"], "location": "local", "type": "production"}),
    ("post",   "/api/storage/cleanup", None),
    ("patch",  "/api/config/paths", {"local_path": ".", "remote_path": ""}),
    ("patch",  "/api/config/storage", {"local_max_gb": 3}),
    ("post",   "/api/users", {"username": "x", "display_name": "X", "password": "p", "role": "operator"}),
    ("delete", "/api/users/tech", None),
    ("post",   "/api/users/tech/password", {"new_password": "new"}),
    ("get",    "/api/config/fs?path=", None),          # procházení disků serveru
])
def test_remote_writes_forbidden(make_client, method: str, url: str, body) -> None:
    c = make_client(client=_REMOTE)
    r = c.request(method.upper(), url, json=body)
    assert r.status_code == 403, (url, r.status_code, r.text)
    assert "jen pro prohlížení" in r.json()["detail"]
    assert (c.app.state.config.data.local_path / "production/done_local/A_DONE.csv").exists()


def test_remote_own_password_allowed(make_client) -> None:
    c = make_client(client=_REMOTE)
    r = c.post("/api/users/admin/password", json={"new_password": "new-pw", "current_password": "pw-admin"})
    assert r.status_code == 204


def test_local_writes_still_work(make_client) -> None:
    c = make_client()
    r = c.delete("/api/files/A_DONE.csv", params={"location": "local", "type": "production"})
    assert r.status_code == 204


def test_custom_local_clients_cidr(make_client) -> None:
    c = make_client(client=("192.168.50.20", 1), local_clients=["127.0.0.1", "192.168.50.0/24"])
    assert c.get("/api/auth/client").json() == {"local": True}
    other = make_client(client=("192.168.51.20", 1), local_clients=["127.0.0.1", "192.168.50.0/24"])
    assert other.get("/api/auth/client").json() == {"local": False}


def test_invalid_local_clients_rejected(tmp_path: Path) -> None:
    cfg = _cfg(tmp_path, ["127.0.0.1", "stroj-pc"])
    with pytest.raises(ValueError, match="local_clients"):
        _validate_config(cfg)
