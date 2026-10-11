"""
Testy velkých zakázek: index zakázky v paměti (CsvRepository) a XLSX export ze serveru.

POKRYTÍ:
  - index se postaví jednou; další stránky / filtry ho použijí znovu
  - změna souboru (nový kus ve WIP) index zneplatní — vrátí se aktuální data
  - LRU drží nejvýše _INDEX_CACHE_FILES souborů
  - starý jednodílný formát + prázdné řádky — stejné výsledky jako dřív
  - GET /api/files/{id}/xlsx: platný XLSX, hlavička s metadaty a jednotkami, čísla jako čísla,
    číslo zakázky s úvodní nulou jako text, čas jako datum, escapování, testing = 1 řádek,
    404 / 401
"""
from __future__ import annotations

import io
import time
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from scada.app import create_app
from scada.config import AppConfig, AdsConfig, DataConfig, ServerConfig
from scada.services.repositories import csv_repository as repo_mod
from scada.services.repositories.csv_repository import CsvRepository
from scada.services.xlsx_export import build_xlsx

_TOKEN = "test-big-order-token"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
HEAD = "Timestamp;OF_OperatingForce [N];Status [-];SortingCategory [-]"


def _two_part(path: Path, order: str, rows: list[str], switch: str = "Marquardt") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = "\n".join(["Order;Microswitch_ID;Microswitch_Name", f"{order};0;{switch}", "", HEAD, *rows]) + "\n"
    path.write_text(text, encoding="utf-8-sig")


def _rows(n: int) -> list[str]:
    return [f"2026-10-0{1 + i // 50000}T08:{(i // 60) % 60:02d}:{i % 60:02d};1.{i % 90:02d};"
            f"{'5' if i % 10 == 9 else '2'};{'6' if i % 10 == 9 else str(1 + i % 4)}" for i in range(n)]


def _cfg(local: Path) -> DataConfig:
    return DataConfig(local_path=local, remote_path="", csv_separator=";", csv_encoding="utf-8-sig")


# ── Index zakázky ──────────────────────────────────────────────────────────────

def test_index_reused_and_invalidated(tmp_path: Path, monkeypatch) -> None:
    f = tmp_path / "production/wip/PROD_1_M_20261001_080000_WIP.csv"
    _two_part(f, "1", _rows(500))
    repo = CsvRepository(_cfg(tmp_path))
    builds = []
    orig = repo._build_index
    monkeypatch.setattr(repo, "_build_index", lambda p: builds.append(p) or orig(p))

    recs, total, groups, _ = repo.read_records(f, page=1, per_page=200)
    assert total == 500 and len(recs) == 200 and recs[0]["order"] == "1"
    repo.read_records(f, page=3, per_page=200)
    repo.read_records(f, page=1, per_page=200, status="nok")
    assert len(builds) == 1                                   # jedno čtení souboru

    with open(f, "a", encoding="utf-8") as fh:                # nový kus ve WIP
        fh.write("2026-10-01T09:00:00;1.50;2;3\n")
    time.sleep(0.01)
    recs, total, _, _ = repo.read_records(f, page=3, per_page=200)
    assert total == 501 and recs[-1]["timestamp"] == "2026-10-01T09:00:00"
    assert len(builds) == 2


def test_index_lru_limit(tmp_path: Path) -> None:
    repo = CsvRepository(_cfg(tmp_path))
    files = []
    for k in range(repo_mod._INDEX_CACHE_FILES + 2):
        f = tmp_path / f"production/done_local/PROD_{k}_M_20261001_080000_DONE.csv"
        _two_part(f, str(k), _rows(10))
        repo.read_records(f, page=1, per_page=5)
        files.append(f)
    assert len(repo._index_cache) == repo_mod._INDEX_CACHE_FILES
    assert files[-1] in repo._index_cache and files[0] not in repo._index_cache


def test_old_format_and_blank_lines(tmp_path: Path) -> None:
    f = tmp_path / "production/done_local/0001_M_DONE.csv"
    f.parent.mkdir(parents=True)
    f.write_text("Timestamp;Order;Group\n2026-10-01T08:00:00;0001;2\n\n2026-10-01T08:00:10;0001;5\n",
                 encoding="utf-8-sig")
    repo = CsvRepository(_cfg(tmp_path))
    recs, total, groups, _ = repo.read_records(f, page=1, per_page=0)
    assert total == 2 and groups == {"2": 1, "5": 1}
    assert [r["group"] for r in recs] == ["2", "5"]
    recs, total, _, _ = repo.read_records(f, page=1, per_page=0, status="nok")
    assert total == 1 and recs[0]["_idx"] == "1"


# ── XLSX ──────────────────────────────────────────────────────────────────────

def _sheet(data: bytes) -> list[list[ET.Element]]:
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        names = set(zf.namelist())
        assert {"[Content_Types].xml", "xl/workbook.xml", "xl/styles.xml", "xl/worksheets/sheet1.xml"} <= names
        root = ET.fromstring(zf.read("xl/worksheets/sheet1.xml"))
    return [row.findall("m:c", NS) for row in root.find("m:sheetData", NS).findall("m:row", NS)]


def _val(c: ET.Element) -> str:
    if c.get("t") == "inlineStr":
        return c.find("m:is/m:t", NS).text or ""
    return c.find("m:v", NS).text


def test_build_xlsx_types_and_escaping() -> None:
    rows = _sheet(build_xlsx(["Order", "Timestamp", "Value", "Note"],
                             [["0003", "2026-10-01T08:00:00", "1.2500", "A & B <x>"],
                              ["12", "neplatný", "-3e2", ""]]))
    head, r1, r2 = rows
    assert [_val(c) for c in head] == ["Order", "Timestamp", "Value", "Note"]
    assert head[0].get("s") == "1"                            # tučná hlavička
    assert r1[0].get("t") == "inlineStr" and _val(r1[0]) == "0003"
    assert r1[1].get("s") == "2" and 46296 < float(_val(r1[1])) < 46297   # 1. 10. 2026 jako datum
    assert r1[2].get("t") is None and _val(r1[2]) == "1.2500"
    assert _val(r1[3]) == "A & B <x>"
    assert r2[0].get("t") is None and _val(r2[1]) == "neplatný" and _val(r2[2]) == "-3e2"
    assert len(r2) == 3                                       # prázdná buňka se nezapisuje


@pytest.fixture
def client(tmp_path: Path):
    local = tmp_path / "local"
    _two_part(local / "production/done_local/PROD_0042_M_20261001_080000_DONE.csv", "0042", _rows(1200),
              switch="Mar&quardt")
    t = local / "testing/done_local/TEST_M_20261001_080000_DONE.csv"
    t.parent.mkdir(parents=True)
    t.write_text("[Metadata]\nTimestamp;Microswitch_ID;Microswitch_Name\n2026-10-01T08:00:00;1;Marquardt\n\n"
                 "[AnalyzedParameters]\nOF_OperatingForce [N]\n1.11\n\n[SignalData]\nt;x\n0;1\n", encoding="utf-8-sig")
    cfg = AppConfig(server=ServerConfig(host="127.0.0.1", port=8080), ads=AdsConfig(net_id="1.2.3.4.1.1", port=851),
                    data=DataConfig(local_path=local, remote_path="", csv_separator=";", csv_encoding="utf-8-sig"))
    app = create_app(cfg)
    with TestClient(app) as c:
        app.state.sessions[_TOKEN] = {"username": "u", "role": "operator", "display_name": "U", "created_at": time.time()}
        c.headers.update({"Authorization": f"Bearer {_TOKEN}"})
        yield c


def test_xlsx_endpoint_production(client) -> None:
    r = client.get("/api/files/PROD_0042_M_20261001_080000_DONE.csv/xlsx", params={"location": "local", "type": "production"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    assert 'filename="PROD_0042_M_20261001_080000_DONE.xlsx"' in r.headers["content-disposition"]
    rows = _sheet(r.content)
    # jednotky zákazníka (audit X1): [N] ze starého souboru → [mN], hodnota × 1000
    assert [_val(c) for c in rows[0]] == ["Order", "Microswitch_ID", "Microswitch_Name",
                                          *HEAD.replace("[N]", "[mN]").split(";")]
    assert len(rows) == 1201
    first = rows[1]
    assert _val(first[0]) == "0042" and first[0].get("t") == "inlineStr"   # úvodní nula zůstane
    assert _val(first[2]) == "Mar&quardt"
    assert first[3].get("s") == "2"                                         # Timestamp → datum
    assert first[4].get("t") is None and float(_val(first[4])) == pytest.approx(1000.0)


def test_xlsx_endpoint_testing_and_errors(client) -> None:
    r = client.get("/api/files/TEST_M_20261001_080000_DONE.csv/xlsx", params={"type": "testing"})
    assert r.status_code == 200
    rows = _sheet(r.content)
    assert len(rows) == 2
    header = [_val(c) for c in rows[0]]
    # originální hlavičky v jednotkách zákazníka (ne normalizované klíče), bez interních „_" a [SignalData]
    assert "OF_OperatingForce [mN]" in header and not any(h.startswith("_") for h in header)
    assert client.get("/api/files/NENI_DONE.csv/xlsx").status_code == 404
    client.headers.pop("Authorization")
    assert client.get("/api/files/PROD_0042_M_20261001_080000_DONE.csv/xlsx").status_code == 401


# ── Výpis složky s mnoha velkými soubory ─────────────────────────────────────

def test_record_count_skips_blank_lines(tmp_path: Path) -> None:
    f = tmp_path / "production/done_local/PROD_7_M_20261001_080000_DONE.csv"
    _two_part(f, "7", _rows(1000) + ["", "2026-10-01T09:00:00;1.0;2;1", ""])
    meta = CsvRepository(_cfg(tmp_path)).read_file_meta(f, "production", "local", "done_local")
    assert meta["record_count"] == 1001


def test_moved_file_metadata_reused(tmp_path: Path, monkeypatch) -> None:
    """Přesun done_local → done_remote (synchronizace) soubor znovu nečte."""
    src = tmp_path / "production/done_local/PROD_8_M_20261001_080000_DONE.csv"
    _two_part(src, "8", _rows(300))
    (tmp_path / "production/done_remote").mkdir(parents=True)
    repo = CsvRepository(_cfg(tmp_path))
    reads = []
    orig = repo.read_file_meta
    monkeypatch.setattr(repo, "read_file_meta", lambda *a, **k: reads.append(a[0]) or orig(*a, **k))
    first = repo.list_local("production")
    assert [f["sync_status"] for f in first] == ["done_local"] and len(reads) == 1
    src.rename(tmp_path / "production/done_remote" / src.name)       # jako DatabaseGateway po uploadu
    after = repo.list_local("production")
    assert [f["sync_status"] for f in after] == ["done_remote"]
    assert after[0]["record_count"] == 300
    assert len(reads) == 1                                            # žádné nové čtení


def test_concurrent_scans_read_each_file_once(tmp_path: Path, monkeypatch) -> None:
    from concurrent.futures import ThreadPoolExecutor
    for k in range(6):
        _two_part(tmp_path / f"production/done_local/PROD_{k}_M_20261001_08000{k}_DONE.csv", str(k), _rows(2000))
    repo = CsvRepository(_cfg(tmp_path))
    reads = []
    orig = repo.read_file_meta

    def slow(*a, **k):
        reads.append(a[0]); time.sleep(0.05)
        return orig(*a, **k)
    monkeypatch.setattr(repo, "read_file_meta", slow)
    with ThreadPoolExecutor(4) as ex:
        results = list(ex.map(lambda _: repo.list_local("production"), range(4)))
    assert all(len(r) == 6 for r in results)
    assert len(reads) == 6                                            # ne 4 × 6


# ── Přehled z názvů souborů + dopočet na pozadí ──────────────────────────────

def _wait_counts(repo: CsvRepository, timeout: float = 5.0) -> None:
    t0 = time.time()
    while repo.counts_pending() and time.time() - t0 < timeout:
        time.sleep(0.02)


def test_listing_from_names_then_background_counts(tmp_path: Path, monkeypatch) -> None:
    d = tmp_path / "production/done_local"
    _two_part(d / "PROD_4500121_Marquardt_20261007_123100_DONE.csv", "4500121", _rows(700))
    _two_part(d / "PROD_A_B_Mar_qu_20261008_060000_DONE.csv", "A_B", _rows(5), switch="Mar_qu")   # podtržítka
    (d / "PROD_EMPTY_X_20261009_070000_DONE.csv").write_text(
        "Order;Microswitch_ID;Microswitch_Name\nEMPTY;0;X\n\n" + HEAD + "\n", encoding="utf-8-sig")
    repo = CsvRepository(_cfg(tmp_path), background_counts=True)
    try:
        reads = []
        orig = repo.read_file_meta
        gate = __import__("threading").Event()

        def slow(*a, **k):
            gate.wait(2)                                   # dopočet „visí", dokud ho nepustíme
            reads.append(a[0])
            return orig(*a, **k)
        monkeypatch.setattr(repo, "read_file_meta", slow)

        first = {f["file_id"]: f for f in repo.list_local("production")}
        assert len(first) == 3 and reads == []             # výpis bez čtení souborů
        f = first["PROD_4500121_Marquardt_20261007_123100_DONE.csv"]
        assert f["order_id"] == "4500121" and f["switch_name"] == "Marquardt"
        assert f["created_at"] == "2026-10-07T12:31:00" and f["record_count"] is None
        assert "_name_ok" not in f
        assert repo.counts_pending()

        gate.set()
        _wait_counts(repo)
        after = {f["file_id"]: f for f in repo.list_local("production")}
        assert after["PROD_4500121_Marquardt_20261007_123100_DONE.csv"]["record_count"] == 700
        amb = after["PROD_A_B_Mar_qu_20261008_060000_DONE.csv"]
        assert (amb["order_id"], amb["switch_name"], amb["record_count"]) == ("A_B", "Mar_qu", 5)   # z metadat
        assert "PROD_EMPTY_X_20261009_070000_DONE.csv" not in after                                 # bez kusů skryt
        assert after["PROD_4500121_Marquardt_20261007_123100_DONE.csv"]["created_at"] == "2026-10-07T12:31:00"
    finally:
        repo.close()


def test_api_counts_pending_and_sort(tmp_path: Path) -> None:
    local = tmp_path / "local"
    for k, n in enumerate((300, 100, 200)):
        _two_part(local / f"production/done_local/PROD_{k}_M_2026100{k + 1}_080000_DONE.csv", str(k), _rows(n))
    cfg = AppConfig(server=ServerConfig(host="127.0.0.1", port=8080), ads=AdsConfig(net_id="1.2.3.4.1.1", port=851),
                    data=DataConfig(local_path=local, remote_path="", csv_separator=";", csv_encoding="utf-8-sig"))
    app = create_app(cfg)
    with TestClient(app) as c:
        app.state.sessions[_TOKEN] = {"username": "u", "role": "operator", "display_name": "U", "created_at": time.time()}
        c.headers.update({"Authorization": f"Bearer {_TOKEN}"})
        params = {"location": "local", "type": "production", "from": "2026-01-01", "sort_by": "record_count", "sort_dir": "desc"}
        body = c.get("/api/files", params=params).json()
        for _ in range(100):
            if not body["counts_pending"]:
                break
            time.sleep(0.03)
            body = c.get("/api/files", params=params).json()
        assert body["counts_pending"] is False
        assert [f["record_count"] for f in body["files"]] == [300, 200, 100]


# ── Připravenost na velký archiv (NAS se 100 000 soubory) ─────────────────────

def _cfg_nas(tmp_path: Path) -> DataConfig:
    return DataConfig(local_path=tmp_path / "local", remote_path=str(tmp_path / "nas"),
                      csv_separator=";", csv_encoding="utf-8-sig")


def test_remote_listing_cached_and_counts_only_for_page(tmp_path: Path, monkeypatch) -> None:
    from scada.services.file_service import FileService
    for k in range(6):
        _two_part(tmp_path / f"nas/production/PROD_{k}_M_2026100{k + 1}_080000_DONE.csv", str(k), _rows(50))
    repo = CsvRepository(_cfg_nas(tmp_path), background_counts=True)
    try:
        scans = []
        orig_scandir = repo_mod.os.scandir
        monkeypatch.setattr(repo_mod.os, "scandir", lambda p: scans.append(p) or orig_scandir(p))
        queued = []
        monkeypatch.setattr(repo, "_ensure_count_threads", lambda: None)      # fronta se nezpracuje
        monkeypatch.setattr(repo._count_queues["remote"], "put", lambda k: queued.append(k))

        svc = FileService(repo)
        r = svc.list_files_paginated("remote", "production", page=1, per_page=2)
        assert r.total == 6 and r.counts_pending is True
        assert len(queued) == 2                                   # jen zobrazená stránka, ne celý archiv
        svc.list_files_paginated("remote", "production", page=1, per_page=2)
        assert len(scans) == 1                                    # výpis NAS z paměti (TTL)
        assert len(queued) == 2                                   # bez duplicit
        monkeypatch.setattr(repo_mod, "_REMOTE_LISTING_TTL", 0.0)
        svc.list_files_paginated("remote", "production", page=1, per_page=2)
        assert len(scans) == 2                                    # po TTL znovu
    finally:
        repo.close()


def test_remote_listing_returns_last_known_while_scanning(tmp_path: Path, monkeypatch) -> None:
    _two_part(tmp_path / "nas/production/PROD_1_M_20261001_080000_DONE.csv", "1", _rows(5))
    repo = CsvRepository(_cfg_nas(tmp_path), background_counts=True)
    try:
        assert len(repo.list_remote("production")) == 1
        monkeypatch.setattr(repo_mod, "_REMOTE_LISTING_TTL", 0.0)
        folder = str(tmp_path / "nas" / "production")
        lock = repo._scan_locks[folder]
        lock.acquire()                                            # jako by skenování právě běželo
        try:
            t0 = time.time()
            assert len(repo.list_remote("production")) == 1        # poslední známý stav, nečeká
            assert time.time() - t0 < 0.5
        finally:
            lock.release()
    finally:
        repo.close()


def test_remote_detail_reads_local_copy(tmp_path: Path, monkeypatch) -> None:
    from scada.services.file_service import FileService
    name = "PROD_9_M_20261001_080000_DONE.csv"
    _two_part(tmp_path / "local/production/done_remote" / name, "9", _rows(30))
    (tmp_path / "nas/production").mkdir(parents=True)
    (tmp_path / "nas/production" / name).write_bytes((tmp_path / "local/production/done_remote" / name).read_bytes())
    repo = CsvRepository(_cfg_nas(tmp_path))
    built = []
    orig = repo._build_index
    monkeypatch.setattr(repo, "_build_index", lambda p: built.append(p) or orig(p))
    recs, total, _, _ = FileService(repo).read_records(name, location="remote", file_type="production", per_page=10)
    assert total == 30 and built == [tmp_path / "local/production/done_remote" / name]


def test_index_memory_budget(tmp_path: Path, monkeypatch) -> None:
    f = tmp_path / "production/done_local/PROD_1_M_20261001_080000_DONE.csv"
    _two_part(f, "1", _rows(2000))
    repo = CsvRepository(_cfg(tmp_path))
    monkeypatch.setattr(repo_mod, "_INDEX_CACHE_BYTES", 1000)       # menší než index souboru
    recs, total, _, _ = repo.read_records(f, page=1, per_page=10)
    assert total == 2000 and len(recs) == 10                          # obslouženo …
    assert len(repo._index_cache) == 0                                # … ale v paměti se nedrží


def test_all_records_cap(client, monkeypatch) -> None:
    from scada.api import data as data_api
    monkeypatch.setattr(data_api, "_ALL_RECORDS_CAP", 100)
    body = client.get("/api/data", params={"file": "PROD_0042_M_20261001_080000_DONE.csv", "per_page": 0}).json()
    assert body["total"] == 1200 and len(body["records"]) == 100


def test_sqlite_cache_incremental(tmp_path: Path) -> None:
    """Změna jednoho souboru zapíše do cache jen jeho řádek; poškozená cache se založí znovu."""
    import sqlite3
    d = tmp_path / "production/done_local"
    for k in range(3):
        _two_part(d / f"PROD_{k}_M_2026100{k + 1}_080000_DONE.csv", str(k), _rows(10))
    cache = tmp_path / "cache" / "file_meta.sqlite"
    CsvRepository(_cfg(tmp_path), cache_file=cache).list_local("production")
    con = sqlite3.connect(cache)
    assert con.execute("SELECT COUNT(*) FROM meta").fetchone()[0] == 3
    con.close()
    (d / "PROD_1_M_20261002_080000_DONE.csv").unlink()
    repo = CsvRepository(_cfg(tmp_path), cache_file=cache)
    assert len(repo.list_local("production")) == 2
    repo.close()
    con = sqlite3.connect(cache)
    assert con.execute("SELECT COUNT(*) FROM meta").fetchone()[0] == 2
    con.close()


def test_known_counts_survive_local_deletion(tmp_path: Path, monkeypatch) -> None:
    """Zakázka spočítaná lokálně → na NAS má počet hned, i když lokální kopie už zmizela."""
    name = "PROD_77_M_20261001_080000_DONE.csv"
    local = tmp_path / "local/production/done_remote" / name
    _two_part(local, "77", _rows(40))
    (tmp_path / "nas/production").mkdir(parents=True)
    (tmp_path / "nas/production" / name).write_bytes(local.read_bytes())
    cache = tmp_path / "cache" / "file_meta.sqlite"

    repo = CsvRepository(_cfg_nas(tmp_path), cache_file=cache)            # lokálně spočítat
    assert repo.list_local("production")[0]["record_count"] == 40
    repo.close()
    local.unlink()                                                         # úklid po 30 dnech

    repo = CsvRepository(_cfg_nas(tmp_path), cache_file=cache, background_counts=True)   # restart
    try:
        monkeypatch.setattr(repo, "read_file_meta", lambda *a, **k: pytest.fail("nemělo se číst"))
        meta = repo.list_remote("production")[0]
        assert meta["record_count"] == 40 and meta["order_id"] == "77"
    finally:
        repo.close()
