"""
Hledání zakázky v přehledu Databáze — GET /api/files?q= (Production, lokální i NAS).

POKRYTÍ:
  - část čísla / názvu zakázky, bez ohledu na velikost písmen a diakritiku
  - total / stránkování platí pro výsledek hledání
  - rozpracovaná zakázka (wip) se filtruje stejně
  - hledání + datumový filtr bez výsledku → hidden_by_filter počítá jen odpovídající zakázky
  - remote (NAS) stejně jako local; prázdné / mezery = bez hledání; příliš dlouhý dotaz → 422
"""
from __future__ import annotations

import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from test_api import _inject_session, make_app

ROWS = "Order;Microswitch_ID;Microswitch_Name\n{order};E01;M\n\nTimestamp;Status [-];SortingCategory [-]\n2026-10-01T08:00:00;2;1\n"
ORDERS = [
    ("Zakázka-Č1", "20261016_080000"),
    ("ABC-77",     "20261001_080000"),
    ("abc-78",     "20261015_080000"),
    ("XYZ",        "20261016_100000"),
]


def _write(folder: Path, order: str, ts: str, suffix: str = "DONE") -> None:
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"PROD_{order}_E01_{ts}_{suffix}.csv").write_text(ROWS.format(order=order), encoding="utf-8-sig")


@pytest.fixture
def client(tmp_path: Path):
    nas = tmp_path / "nas"
    app, cfg = make_app(tmp_path, remote_path=str(nas))
    base = Path(cfg.data.local_path) / "production"
    for order, ts in ORDERS:
        _write(base / "done_local", order, ts)
        _write(nas / "production", order, ts)
    _write(base / "wip", "ABC-99", "20261016_120000", "WIP")
    with TestClient(app) as c:
        _inject_session(app, "tok", {"username": "u", "role": "operator", "display_name": "U",
                                     "created_at": time.time()})
        c.headers.update({"Authorization": "Bearer tok"})
        yield c


def _files(c: TestClient, **params) -> dict:
    return c.get("/api/files", params={"location": "local", "type": "production", **params}).json()


def _orders(body: dict) -> list[str]:
    return sorted(f["order_id"] for f in body["files"])


def test_case_and_diacritics_insensitive(client) -> None:
    assert _orders(_files(client, q="abc")) == ["ABC-77", "abc-78"]
    assert _orders(_files(client, q="zakazka-c")) == ["Zakázka-Č1"]           # bez diakritiky
    assert _orders(_files(client, q="ZAKÁZKA")) == ["Zakázka-Č1"]
    assert _files(client, q="nic-takoveho")["total"] == 0


def test_total_and_paging_follow_search(client) -> None:
    body = _files(client, q="abc", per_page=1)
    assert body["total"] == 2 and body["pages"] == 2 and len(body["files"]) == 1


def test_wip_filtered_too(client) -> None:
    assert [w["order_id"] for w in _files(client)["wip"]] == ["ABC-99"]
    assert [w["order_id"] for w in _files(client, q="abc-9")["wip"]] == ["ABC-99"]
    assert _files(client, q="xyz")["wip"] == []


def test_hidden_by_filter_counts_only_matches(client) -> None:
    body = _files(client, q="abc", **{"from": "2026-10-16", "to": "2026-10-16"})
    assert body["total"] == 0
    assert body["hidden_by_filter"] == 2                                       # ABC-77 + abc-78, ne všechny 4
    assert body["latest_created_at"].startswith("2026-10-15")


def test_remote_same_as_local(client) -> None:
    assert _orders(_files(client, location="remote", q="ABC")) == ["ABC-77", "abc-78"]


def test_blank_query_means_no_search(client) -> None:
    assert _files(client, q="   ")["total"] == 4
    assert client.get("/api/files", params={"q": "x" * 101}).status_code == 422


def test_search_whole_archive_is_fast() -> None:
    """Hledání bez datumového filtru přes 100 000 zakázek (velký NAS archiv) — jen průchod metadaty
    v paměti (číslo zakázky je v názvu souboru), nic se nečte ani nestahuje."""
    from scada.services.file_service import FileService

    files = [{"file_id": f"PROD_Z{i:06d}_E01_20260101_080000_DONE.csv", "order_id": f"Z{i:06d}",
              "created_at": "2026-01-01T08:00:00", "record_count": 10} for i in range(100_000)]

    class _Repo:
        def validate_params(self, *_a): return True
        def list_remote(self, _t): return files
        list_local = list_remote
        def list_wip(self, _t): return []
        def request_counts(self, _f): pass
        def counts_pending(self, _f): return False

    svc = FileService(_Repo())  # type: ignore[arg-type]
    t0 = time.perf_counter()
    res = svc.list_files_paginated("remote", "production", per_page=50, query="z0999")
    assert time.perf_counter() - t0 < 1.0
    assert res.total == 100 and len(res.files) == 50                 # Z099900–Z099999
