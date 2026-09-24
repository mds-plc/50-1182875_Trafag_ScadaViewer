"""
Testy výkonových a I/O mechanismů (audit 2026-09-24, navazující opravy).

POKRYTÍ:
  - io_pool.run_io — NAS operace ve vlastním poolu, plný pool → NasBusyError okamžitě,
    lokální I/O se zaseknutým NASem nečeká
  - signal_reader — numpy i Python parser dávají stejná data, vadné hodnoty → 0.0,
    cache hotových odpovědí, prefetch po /api/data
  - _update_config_file — všechny varianty TOML stringu, žádné duplicitní klíče (L2)
  - lockout změny vlastního hesla přes /api/users/{u}/password (L8)
  - HTTP cache hlavičky (Cache-Control)
"""
from __future__ import annotations

import asyncio
import threading
import time
import tomllib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from test_api import _TEST_TOKEN, _inject_session, make_app


def _signal_csv(rows: list[str]) -> str:
    return (
        "[Metadata]\nTimestamp;Microswitch_Name\n2026-09-21T10:00:00;Test\n\n"
        "[AnalyzedParameters]\nOP_OperatingPosition [um];RP_ReleasingPosition [um]\n2;1\n\n"
        "[SignalData]\n"
        "ts [ns];position [um];force [N];u_nc [V];u_no [V];u_shunt_nc [V];u_shunt_no [V];"
        "i_nc [A];i_no [A];r_nc [Ohm];r_no [Ohm]\n"
        + "".join(r + "\n" for r in rows)
    )


_GOOD_ROWS = [
    f"{i * 50000};{min(i, 10 - i)}.0;{i % 3}.5;0.1;0.2;9;9;0.001;0.002;{i + 1};1000000"
    for i in range(11)
]


# ======================================================================
# io_pool
# ======================================================================

class TestIoPool:

    def test_full_nas_pool_fails_fast_and_local_still_works(self) -> None:
        from scada.services import io_pool

        release = threading.Event()

        async def scenario() -> None:
            hung = [asyncio.create_task(io_pool.run_io("remote", release.wait, 5))
                    for _ in range(io_pool._NAS_WORKERS)]
            await asyncio.sleep(0.05)

            t0 = time.perf_counter()
            with pytest.raises(io_pool.NasBusyError):
                await io_pool.run_io("remote", lambda: None)
            assert time.perf_counter() - t0 < 0.1          # okamžitě, žádné čekání

            assert await io_pool.run_io("local", lambda: 42) == 42   # lokál nečeká na NAS

            release.set()
            await asyncio.gather(*hung)
            assert await io_pool.run_io("remote", lambda: "ok") == "ok"   # sloty uvolněny

        asyncio.run(scenario())
        assert io_pool._nas_active == 0


# ======================================================================
# signal_reader — parser + cache
# ======================================================================

class TestSignalParser:

    @pytest.fixture(autouse=True)
    def _clear_caches(self):
        from scada.services import signal_reader as sr
        sr._cache.clear(); sr._resp_cache.clear()
        yield
        sr._cache.clear(); sr._resp_cache.clear()

    def test_numpy_and_python_paths_identical(self, tmp_path: Path, monkeypatch) -> None:
        from scada.services import signal_reader as sr
        if sr._np is None:
            pytest.skip("numpy není nainstalováno")
        f = tmp_path / "S_DONE.csv"
        f.write_text(_signal_csv(_GOOD_ROWS), encoding="utf-8-sig")

        with_np = sr.read_signal_data(f)
        monkeypatch.setattr(sr, "_np", None)
        without = sr.read_signal_data(f)

        assert with_np is not None and without is not None
        assert {k: list(v) for k, v in with_np.items()} == {k: list(v) for k, v in without.items()}
        assert "u_shunt_nc" not in with_np                  # nezobrazované sloupce se neparsují
        assert list(with_np["position"]) == [float(min(i, 10 - i)) for i in range(11)]

    def test_bad_values_become_zero_and_columns_stay_aligned(self, tmp_path: Path) -> None:
        from scada.services import signal_reader as sr
        rows = list(_GOOD_ROWS)
        rows[3] = "150000;3.0;x;0.1;0.2;9;9;0.001;0.002;4;1000000"   # nečíselná síla
        rows[5] = "250000;5.0;1.5"                                  # krátký řádek
        f = tmp_path / "B_DONE.csv"
        f.write_text(_signal_csv(rows), encoding="utf-8-sig")

        data = sr.read_signal_data(f)
        assert data is not None
        assert len({len(v) for v in data.values()}) == 1           # všechny sloupce stejně dlouhé
        assert data["force"][3] == 0.0
        assert data["r_nc"][5] == 0.0

    def test_response_cache_returns_without_recompute(self, tmp_path: Path, monkeypatch) -> None:
        from scada.services import signal_reader as sr
        f = tmp_path / "C_DONE.csv"
        f.write_text(_signal_csv(_GOOD_ROWS), encoding="utf-8-sig")

        first = sr.prepare_signal_response(f, "overview", 100)
        monkeypatch.setattr(sr, "_build_response", lambda *a: pytest.fail("mělo jít z cache"))
        assert sr.prepare_signal_response(f, "results", 100) is first   # stejná decimace
        assert sr.prepare_signal_response(f, "hysteresis", 100) is first

    def test_data_endpoint_prefetches_signal(self, tmp_path: Path) -> None:
        from scada.services import signal_reader as sr
        app, cfg = make_app(tmp_path)
        f = cfg.data.local_path / "testing" / "done_local" / "T_DONE.csv"
        f.parent.mkdir(parents=True)
        f.write_text(_signal_csv(_GOOD_ROWS), encoding="utf-8-sig")
        with TestClient(app) as c:
            _inject_session(app)
            r = c.get("/api/data?file=T_DONE.csv&type=testing",
                      headers={"Authorization": f"Bearer {_TEST_TOKEN}"})
            assert r.json()["has_signal"] is True
            for _ in range(50):                                   # prefetch běží na pozadí
                if f in sr._cache:
                    break
                time.sleep(0.05)
        assert f in sr._cache


# ======================================================================
# L2 — zápis password_hash do Config.toml
# ======================================================================

@pytest.mark.parametrize("original", [
    '[auth]\npassword_hash = "old"\n',
    "[auth]\npassword_hash = 'old'\n",
    '[auth]\npassword_hash = """\nold\n"""\nusername = "a"\n',
    '[auth]\nusername = "a"\n',
    '[server]\nport = 1\n',
])
def test_update_config_file_all_toml_variants(tmp_path: Path, original: str) -> None:
    from scada.api.auth import _update_config_file
    p = tmp_path / "Config.toml"
    p.write_text(original, encoding="utf-8")
    assert _update_config_file(p, "salt:hash")
    assert _update_config_file(p, "salt:hash")                   # stejný hash 2× → bez duplicity
    text = p.read_text(encoding="utf-8")
    assert tomllib.loads(text)["auth"]["password_hash"] == "salt:hash"
    assert text.count("password_hash") == 1


# ======================================================================
# L8 — lockout pro změnu vlastního hesla
# ======================================================================

def test_own_password_change_is_locked_out(tmp_path: Path) -> None:
    from scada.api import auth
    from scada.config import UserEntry, hash_password
    auth._FAILURES.clear()
    app, _ = make_app(tmp_path)
    try:
        with TestClient(app) as c:
            app.state.users_path = None
            app.state.users = [UserEntry("u", "U", hash_password("spravne"), "operator")]
            _inject_session(app, "tok", {"username": "u", "role": "operator", "display_name": "U"})
            body = {"current_password": "spatne", "new_password": "x"}
            codes = [c.post("/api/users/u/password", json=body,
                            headers={"Authorization": "Bearer tok"}).status_code for _ in range(6)]
        assert codes[:5] == [401] * 5
        assert codes[5] == 429
    finally:
        auth._FAILURES.clear()


# ======================================================================
# HTTP cache + gzip
# ======================================================================

def test_cache_control_headers(tmp_path: Path) -> None:
    app, _ = make_app(tmp_path)
    with TestClient(app) as c:
        assert c.get("/api/health").headers.get("cache-control") is None     # API se necachuje
        assert c.get("/neexistuje").headers.get("cache-control") == "no-cache"


def test_gzip_for_large_api_responses(tmp_path: Path) -> None:
    from test_api import PROD_HEADERS, write_csv
    app, cfg = make_app(tmp_path)
    write_csv(cfg.data.local_path / "production" / "done_local" / "G_DONE.csv", PROD_HEADERS,
              [{"Timestamp": "2026-07-01T10:00:00", "Order": "1", "Microswitch_ID": str(i),
                "Microswitch_Name": "X"} for i in range(200)])
    with TestClient(app) as c:
        _inject_session(app)
        r = c.get("/api/data?file=G_DONE.csv", headers={
            "Authorization": f"Bearer {_TEST_TOKEN}", "Accept-Encoding": "gzip"})
        assert r.status_code == 200
        assert r.headers.get("content-encoding") == "gzip"
