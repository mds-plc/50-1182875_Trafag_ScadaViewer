"""
Ruční dokončení rozpracované zakázky — POST /api/files/{file_id}/finish (rozhodnutí uživatele 2026-10-26).

POKRYTÍ:
  - admin u stroje: wip/…_WIP.csv → done_local/…_DONE.csv, neúplný poslední řádek odříznut
  - zakázka běží na stroji (PLC Order.Valid + Order.Name) → 409 running, soubor zůstává
  - PLC nepřipojeno → bez potvrzení 409 plc_unknown, s potvrzením projde
  - technik 403, vzdálený přístup 403, DONE stejného jména → 409 exists, jiný než WIP → 400, neexistující → 404
"""
from __future__ import annotations

import time
from pathlib import Path

from fastapi.testclient import TestClient

from test_api import make_app, _inject_session

ORDER = "ZAK777"
WIP   = f"PROD_{ORDER}_E01389-C_20261026_090000_WIP.csv"
DONE  = WIP.replace("_WIP.csv", "_DONE.csv")


class _Monitor:
    def __init__(self, connected: bool, values: dict | None = None) -> None:
        self._c = connected
        self.current_values = values or {}

    @property
    def connected(self) -> bool:
        return self._c

    async def start(self) -> None: ...

    async def stop(self) -> None: ...


def _setup(tmp_path: Path, role: str = "admin", client=("127.0.0.1", 50000), partial: bool = False):
    app, cfg = make_app(tmp_path)
    base = Path(cfg.data.local_path) / "production"
    (base / "wip").mkdir(parents=True, exist_ok=True)
    text = "[Data]\nTimestamp;Status [-]\n2026-10-26T09:00:00;2\n2026-10-26T09:00:05;2\n"
    if partial:
        text += "2026-10-26T09:00:1"                     # nedopsaný řádek (výpadek proudu)
    (base / "wip" / WIP).write_text(text, encoding="utf-8-sig")
    c = TestClient(app, client=client)
    c.__enter__()
    _inject_session(app, "tok", {"username": "boss", "role": role, "display_name": "B", "created_at": time.time()})
    c.headers.update({"Authorization": "Bearer tok"})
    return c, app, base


def _finish(c, confirm: bool | None = None):
    body = None if confirm is None else {"plc_unknown_confirmed": confirm}
    return c.post(f"/api/files/{WIP}/finish", params={"location": "local", "type": "production"}, json=body)


def test_admin_finishes_wip_when_plc_idle(tmp_path: Path) -> None:
    c, app, base = _setup(tmp_path, partial=True)
    try:
        app.state.monitor = _Monitor(True, {"order_valid": True, "order_name": "JINA-ZAKAZKA"})
        r = _finish(c)
        assert r.status_code == 200 and r.json()["file_id"] == DONE
        assert not (base / "wip" / WIP).exists()
        done = (base / "done_local" / DONE).read_text(encoding="utf-8-sig")
        assert done.endswith("2026-10-26T09:00:05;2\n")                 # neúplný řádek odříznut
        files = c.get("/api/files", params={"location": "local", "type": "production", "from": "2026-01-01"}).json()
        assert files["wip"] == [] and any(f["file_id"] == DONE for f in files["files"])
    finally:
        c.__exit__(None, None, None)


def test_running_order_cannot_be_finished(tmp_path: Path) -> None:
    c, app, base = _setup(tmp_path)
    try:
        app.state.monitor = _Monitor(True, {"order_valid": True, "order_name": ORDER})
        r = _finish(c, confirm=True)                                     # ani potvrzení nepomůže
        assert r.status_code == 409 and r.json()["detail"]["code"] == "running"
        assert (base / "wip" / WIP).exists()
    finally:
        c.__exit__(None, None, None)


def test_plc_unknown_requires_confirmation(tmp_path: Path) -> None:
    c, app, base = _setup(tmp_path)                                      # offline atrapa ADS (conftest)
    try:
        r = _finish(c)
        assert r.status_code == 409 and r.json()["detail"]["code"] == "plc_unknown"
        assert (base / "wip" / WIP).exists()
        assert _finish(c, confirm=True).status_code == 200
        assert (base / "done_local" / DONE).exists()
    finally:
        c.__exit__(None, None, None)


def test_plc_login_can_finish(tmp_path: Path) -> None:
    """PLC přihlášení = nejvyšší autorita na PLC → role admin, smí dokončit zakázku (2026-10-26)."""
    c, app, base = _setup(tmp_path)
    try:
        app.state.monitor.current_values["plc_operator_login"] = True
        c.headers["Authorization"] = "Bearer " + c.post("/api/auth/plc-login").json()["token"]
        assert _finish(c, confirm=True).status_code == 200
        assert (base / "done_local" / DONE).exists()
    finally:
        c.__exit__(None, None, None)


def test_technician_and_remote_forbidden(tmp_path: Path) -> None:
    c, _, base = _setup(tmp_path, role="technician")
    try:
        assert _finish(c, confirm=True).status_code == 403
    finally:
        c.__exit__(None, None, None)
    (tmp_path / "r").mkdir()
    c, _, base = _setup(tmp_path / "r", client=("10.45.124.77", 51000))
    try:
        assert _finish(c, confirm=True).status_code == 403
        assert (base / "wip" / WIP).exists()
    finally:
        c.__exit__(None, None, None)


def test_existing_done_and_bad_names(tmp_path: Path) -> None:
    c, _, base = _setup(tmp_path)
    try:
        (base / "done_remote").mkdir(parents=True, exist_ok=True)
        (base / "done_remote" / DONE).write_text("x", encoding="utf-8")
        r = _finish(c, confirm=True)
        assert r.status_code == 409 and r.json()["detail"]["code"] == "exists"
        assert (base / "wip" / WIP).exists()
        r = c.post(f"/api/files/{DONE}/finish", params={"location": "local", "type": "production"},
                   json={"plc_unknown_confirmed": True})
        assert r.status_code == 400
        r = c.post("/api/files/PROD_X_E1_20261026_090000_WIP.csv/finish",
                   params={"location": "local", "type": "production"}, json={"plc_unknown_confirmed": True})
        assert r.status_code == 404
    finally:
        c.__exit__(None, None, None)
