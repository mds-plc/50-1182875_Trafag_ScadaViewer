"""
API integration testy — FastAPI TestClient (offline, bez ADS, bez sítě).

PROČ TESTOVAT PŘES HTTP (ne přímo service):
  TestClient prochází celým stackem — URL routing, query parametry, Pydantic
  response_model validaci, HTTP status kódy a JSON serializaci. Chytí regrese
  které unit testy CsvReader nezachytí: překlep v URL, chybná response_model,
  ztracený parametr, špatný HTTP status kód.

  Příklad: CsvReader vrátí správná data, ale files.py omylem vrátí 500 místo 200
  při prázdném výsledku → unit test CsvReader to nevychytí, tento test ano.

POKRYTÍ:
  - GET /api/health  — schéma, status ok/degraded, ads always False (TODO)
  - GET /api/status  — remote_available False/True
  - GET /api/files   — seznam souborů, production/testing, neplatné parametry
  - GET /api/files/{id} — metadata souboru, 404 pro neexistující
  - GET /api/data    — záznamy, lowercase klíče, filtry from/to, path traversal

IZOLACE:
  Každý test dostane čerstvou tmp_path → žádné sdílení stavu mezi testy.
  AdsMonitor.start() je no-op (TODO) → žádné reálné ADS spojení.
"""
from __future__ import annotations

import csv
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from scada.app import create_app
from scada.config import AppConfig, AdsConfig, AuthConfig, DataConfig, ServerConfig, UserEntry


# ======================================================================
# Sdílené helpers
# ======================================================================

PROD_HEADERS = ["Timestamp", "Order", "Microswitch_ID", "Microswitch_Name"]
TEST_HEADERS = ["Timestamp", "Microswitch_ID", "Microswitch_Name"]


def write_csv(path: Path, headers: list[str], rows: list[dict]) -> None:
    """Zapíše testovací CSV soubor (utf-8-sig, oddělovač ;)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers, delimiter=";", extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def make_app(tmp_path: Path, remote_path: str = "") -> tuple:
    """Vytvoří AppConfig + FastAPI app s dočasnou local složkou."""
    local = tmp_path / "local"
    local.mkdir(exist_ok=True)
    cfg = AppConfig(
        server=ServerConfig(host="127.0.0.1", port=8080),
        ads=AdsConfig(net_id="1.2.3.4.1.1", port=851),
        data=DataConfig(
            local_path=local,
            remote_path=remote_path,
            csv_separator=";",
            csv_encoding="utf-8-sig",
        ),
    )
    return create_app(cfg), cfg


# ======================================================================
# Sdílená auth pomocná data
# ======================================================================

# Předvypočítaný session token — injektován přímo do app.state.sessions
# pro izolaci testů od přihlašovacího endpointu.
_TEST_TOKEN   = "test-admin-session-token-xyz123"
_TEST_SESSION = {"username": "admin", "role": "admin", "display_name": "Admin"}


def _inject_session(app, token: str = _TEST_TOKEN, session: dict = _TEST_SESSION) -> None:
    """Vloží testovací session přímo do app.state.sessions (bypass login)."""
    app.state.sessions[token] = session


# ======================================================================
# Fixtures
# ======================================================================

@pytest.fixture
def client(tmp_path: Path):
    """
    TestClient s dočasnou konfigurací — izolace každého testu.
    Yields (TestClient, AppConfig).
    Auth: testovací Bearer token je nastaven jako výchozí hlavička.
    """
    app, cfg = make_app(tmp_path)
    with TestClient(app) as c:
        _inject_session(app)
        c.headers.update({"Authorization": f"Bearer {_TEST_TOKEN}"})
        yield c, cfg


# ======================================================================
# GET /api/health
# ======================================================================

class TestHealth:
    """
    /api/health vrací HTTP 200 vždy (NSSM watchdog).
    ADS je False — AdsMonitor.start() je no-op (TODO: pyads).
    """

    def test_returns_200(self, client) -> None:
        c, _ = client
        assert c.get("/api/health").status_code == 200

    def test_schema_has_required_fields(self, client) -> None:
        c, _ = client
        body = c.get("/api/health").json()
        assert "status" in body
        assert "version" in body
        assert "checks" in body
        assert "local_storage" in body["checks"]
        assert "ads" in body["checks"]

    def test_status_ok_when_local_exists(self, client) -> None:
        """local_path existuje (fixture ji vytvoří) → status=ok."""
        c, _ = client
        body = c.get("/api/health").json()
        assert body["status"] == "ok"
        assert body["checks"]["local_storage"] is True

    def test_status_degraded_when_local_missing(self, tmp_path: Path) -> None:
        """local_path neexistuje → status=degraded."""
        cfg = AppConfig(
            server=ServerConfig(host="127.0.0.1", port=8080),
            ads=AdsConfig(net_id="1.2.3.4.1.1", port=851),
            data=DataConfig(
                local_path=tmp_path / "neexistuje",
                remote_path="",
                csv_separator=";",
                csv_encoding="utf-8-sig",
            ),
        )
        with TestClient(create_app(cfg)) as c:
            body = c.get("/api/health").json()
        assert body["status"] == "degraded"
        assert body["checks"]["local_storage"] is False

    def test_ads_false_without_plc(self, client) -> None:
        """AdsMonitor bez reálného PLC → connected=False (očekávaný stav pro testy)."""
        c, _ = client
        assert c.get("/api/health").json()["checks"]["ads"] is False


# ======================================================================
# GET /api/status
# ======================================================================

class TestStatus:
    def test_returns_200(self, client) -> None:
        c, _ = client
        assert c.get("/api/status").status_code == 200

    def test_remote_unavailable_when_empty_path(self, client) -> None:
        """Prázdný remote_path → remote_available=False."""
        c, _ = client
        body = c.get("/api/status").json()
        assert body["remote_available"] is False
        assert "remote_path" not in body

    def test_remote_available_when_folder_exists(self, tmp_path: Path) -> None:
        """remote_path ukazuje na existující složku (simulace NAS) → True."""
        remote = tmp_path / "nas"
        remote.mkdir()
        app, _ = make_app(tmp_path, remote_path=str(remote))
        with TestClient(app) as c:
            _inject_session(app)
            body = c.get("/api/status",
                         headers={"Authorization": f"Bearer {_TEST_TOKEN}"}).json()
        assert body["remote_available"] is True


# ======================================================================
# GET /api/files
# ======================================================================

class TestFiles:
    def test_empty_returns_empty_list(self, client) -> None:
        c, _ = client
        body = c.get("/api/files").json()
        assert body["files"] == []
        assert body["total"] == 0

    def test_status_200_on_empty(self, client) -> None:
        c, _ = client
        assert c.get("/api/files").status_code == 200

    def test_single_production_file(self, client) -> None:
        """Jeden soubor v done_local/ → správná metadata včetně sync_status."""
        c, cfg = client
        write_csv(
            cfg.data.local_path / "production" / "done_local" / "MARQ_2026-07-01_DONE.csv",
            PROD_HEADERS,
            [
                {"Timestamp": "2026-07-01T08:00:00", "Order": "ORD-001",
                 "Microswitch_ID": "MS-01", "Microswitch_Name": "Marquardt"},
                {"Timestamp": "2026-07-01T08:01:00", "Order": "ORD-001",
                 "Microswitch_ID": "MS-01", "Microswitch_Name": "Marquardt"},
            ],
        )
        body = c.get("/api/files").json()
        assert body["total"] == 1
        f = body["files"][0]
        assert f["file_id"]      == "MARQ_2026-07-01_DONE.csv"
        assert f["record_count"] == 2
        assert f["sync_status"]  == "done_local"
        assert f["order_id"]     == "ORD-001"
        assert f["type"]         == "production"
        assert f["location"]     == "local"

    def test_testing_type_order_id_none(self, client) -> None:
        """Testing soubory nemají sloupec Order → order_id=null v JSON."""
        c, cfg = client
        write_csv(
            cfg.data.local_path / "testing" / "done_local" / "CHERRY_2026-07-01_DONE.csv",
            TEST_HEADERS,
            [{"Timestamp": "2026-07-01T08:00:00",
              "Microswitch_ID": "MS-01", "Microswitch_Name": "Cherry"}],
        )
        body = c.get("/api/files?type=testing").json()
        assert body["total"] == 1
        assert body["files"][0]["order_id"] is None

    def test_invalid_location_returns_empty(self, client) -> None:
        """Neplatné location → CsvReader odmítne → HTTP 200, prázdný list."""
        c, _ = client
        r = c.get("/api/files?location=ftp")
        assert r.status_code == 200
        assert r.json()["files"] == []

    def test_invalid_type_returns_empty(self, client) -> None:
        c, _ = client
        assert c.get("/api/files?type=wip").json()["files"] == []

    def test_remote_empty_path_returns_empty(self, client) -> None:
        """remote_path="" → složka neexistuje → [] bez výjimky."""
        c, _ = client
        body = c.get("/api/files?location=remote").json()
        assert body["files"] == []

    def test_production_testing_isolated(self, client) -> None:
        """type=production nesmí vrátit testing soubory a naopak."""
        c, cfg = client
        write_csv(
            cfg.data.local_path / "production" / "done_local" / "PROD_DONE.csv",
            PROD_HEADERS,
            [{"Timestamp": "2026-07-01T08:00:00", "Order": "ORD-001",
              "Microswitch_ID": "MS-01", "Microswitch_Name": "Marquardt"}],
        )
        write_csv(
            cfg.data.local_path / "testing" / "done_local" / "TEST_DONE.csv",
            TEST_HEADERS,
            [{"Timestamp": "2026-07-01T08:00:00",
              "Microswitch_ID": "MS-01", "Microswitch_Name": "Cherry"}],
        )
        prod  = c.get("/api/files?type=production").json()
        tests = c.get("/api/files?type=testing").json()
        assert prod["total"]  == 1 and prod["files"][0]["type"]  == "production"
        assert tests["total"] == 1 and tests["files"][0]["type"] == "testing"


# ======================================================================
# GET /api/files/{file_id}
# ======================================================================

class TestGetFile:
    def test_existing_file_200(self, client) -> None:
        c, cfg = client
        fname = "HONEY_2026-07-01_DONE.csv"
        write_csv(
            cfg.data.local_path / "production" / "done_local" / fname,
            PROD_HEADERS,
            [{"Timestamp": "2026-07-01T08:00:00", "Order": "ORD-002",
              "Microswitch_ID": "MS-02", "Microswitch_Name": "Honeywell"}],
        )
        r = c.get(f"/api/files/{fname}")
        assert r.status_code == 200
        assert r.json()["file_id"] == fname

    def test_missing_file_404(self, client) -> None:
        c, _ = client
        assert c.get("/api/files/NEEXISTUJE_DONE.csv").status_code == 404


# ======================================================================
# GET /api/data
# ======================================================================

class TestData:
    """
    /api/data čte záznamy z CSV souboru s volitelnými filtry from/to.
    Každý test dostane soubor se 5 záznamy (2026-07-01 až 2026-07-05).
    """

    @pytest.fixture(autouse=True)
    def setup_file(self, client) -> None:
        """Vytvoří soubor + uloží self.c a self.fname pro všechny testy třídy."""
        c, cfg = client
        self.fname = "WEEK_2026-07-01_DONE.csv"
        rows = [
            {"Timestamp": f"2026-07-0{i}T08:00:00", "Order": "ORD-001",
             "Microswitch_ID": "MS-01", "Microswitch_Name": "Marquardt"}
            for i in range(1, 6)   # 5 záznamů: 01–05
        ]
        write_csv(
            cfg.data.local_path / "production" / "done_local" / self.fname,
            PROD_HEADERS,
            rows,
        )
        self.c = c

    def test_returns_all_records(self) -> None:
        body = self.c.get(f"/api/data?file={self.fname}").json()
        assert body["total"] == 5
        assert len(body["records"]) == 5

    def test_keys_lowercase(self) -> None:
        """CsvReader normalizuje klíče na lowercase — frontend závisí na tomto chování."""
        rec = self.c.get(f"/api/data?file={self.fname}").json()["records"][0]
        assert "timestamp"        in rec
        assert "microswitch_id"   in rec
        assert "microswitch_name" in rec
        assert "Timestamp"        not in rec   # originální kapitalizace nesmí projít

    def test_from_filter(self) -> None:
        body = self.c.get(f"/api/data?file={self.fname}&from=2026-07-03").json()
        assert body["total"] == 3
        assert body["records"][0]["timestamp"].startswith("2026-07-03")

    def test_to_filter(self) -> None:
        body = self.c.get(f"/api/data?file={self.fname}&to=2026-07-02").json()
        assert body["total"] == 2
        assert body["records"][-1]["timestamp"].startswith("2026-07-02")

    def test_from_to_range(self) -> None:
        body = self.c.get(f"/api/data?file={self.fname}&from=2026-07-02&to=2026-07-04").json()
        assert body["total"] == 3

    def test_missing_file_returns_empty(self) -> None:
        """Neexistující soubor → HTTP 200 s prázdným listem (ne 404/500)."""
        r = self.c.get("/api/data?file=NEEXISTUJE_DONE.csv")
        assert r.status_code == 200
        assert r.json()["records"] == []

    def test_path_traversal_returns_empty(self) -> None:
        """
        Path traversal v parametru file → CsvReader odmítne v _validate_params
        → HTTP 200 s prázdným listem.
        Ověřuje, že bezpečnostní validace platí i přes HTTP vrstvu.
        """
        r = self.c.get("/api/data?file=../../../Config.toml")
        assert r.status_code == 200
        assert r.json()["records"] == []

    def test_response_contains_pagination_fields(self) -> None:
        """Odpověď obsahuje page, pages, per_page pro frontend stránkování."""
        body = self.c.get(f"/api/data?file={self.fname}").json()
        assert "page"     in body
        assert "pages"    in body
        assert "per_page" in body
        assert body["page"]  == 1
        assert body["pages"] == 1   # 5 záznamů, per_page=200 → 1 stránka

    def test_pagination_page_1(self) -> None:
        """Stránka 1, per_page=2 → 2 záznamy, total=5, pages=3."""
        body = self.c.get(f"/api/data?file={self.fname}&per_page=2&page=1").json()
        assert len(body["records"]) == 2
        assert body["total"] == 5
        assert body["pages"] == 3
        assert body["page"]  == 1

    def test_pagination_page_2(self) -> None:
        """Stránka 2, per_page=2 → záznamy 3 a 4."""
        body = self.c.get(f"/api/data?file={self.fname}&per_page=2&page=2").json()
        assert len(body["records"]) == 2
        assert body["records"][0]["timestamp"].startswith("2026-07-03")

    def test_pagination_last_page_partial(self) -> None:
        """Poslední stránka obsahuje zbývající záznamy (méně než per_page)."""
        body = self.c.get(f"/api/data?file={self.fname}&per_page=2&page=3").json()
        assert len(body["records"]) == 1   # 5 záznamů, stránka 3: jen 1 zbývá

    def test_per_page_zero_returns_all(self) -> None:
        """per_page=0 vrátí všechny záznamy (zpětná kompatibilita)."""
        body = self.c.get(f"/api/data?file={self.fname}&per_page=0").json()
        assert len(body["records"]) == 5
        assert body["total"] == 5
        assert body["pages"] == 1


# ======================================================================
# Security headers — middleware
# ======================================================================

class TestSecurityHeaders:
    """
    _SecurityHeadersMiddleware musí přidat bezpečnostní hlavičky ke každé odpovědi.
    Testujeme na /api/health (rychlý endpoint bez I/O), ale hlavičky jsou
    přítomny na VŠECH endpointech (middleware obaluje celý routing stack).
    """

    def test_x_frame_options(self, client) -> None:
        """X-Frame-Options: DENY zabrání vložení do <iframe> (clickjacking)."""
        c, _ = client
        assert c.get("/api/health").headers.get("x-frame-options") == "DENY"

    def test_x_content_type_options(self, client) -> None:
        """X-Content-Type-Options: nosniff zabrání MIME sniffingu."""
        c, _ = client
        assert c.get("/api/health").headers.get("x-content-type-options") == "nosniff"

    def test_referrer_policy(self, client) -> None:
        """Referrer-Policy omezí info v Referer hlavičce při přechodu na jinou doménu."""
        c, _ = client
        assert c.get("/api/health").headers.get("referrer-policy") == "strict-origin-when-cross-origin"

    def test_headers_present_on_data_endpoint(self, client) -> None:
        """Hlavičky jsou přítomny i na datových endpointech (ne jen /api/health)."""
        c, _ = client
        r = c.get("/api/files")
        assert "x-frame-options" in r.headers
        assert "x-content-type-options" in r.headers

    def test_csp_header_present_when_dist_exists(self, tmp_path: Path) -> None:
        """
        CSP hlavička je přítomna pokud existuje 01_frontend/dist/index.html
        (= produkční build). Testujeme s syntetickým index.html.
        """
        import base64, hashlib
        from scada.app import _build_csp

        # Syntetický index.html s jedním inline skriptem
        inline = "(function(){var x=1;})()"
        fake_dist = tmp_path / "fake_dist"
        fake_dist.mkdir()
        (fake_dist / "index.html").write_text(
            f"<html><head><script>{inline}</script></head></html>",
            encoding="utf-8",
        )
        csp = _build_csp(fake_dist)
        expected_hash = "'sha256-" + base64.b64encode(
            hashlib.sha256(inline.encode("utf-8")).digest()
        ).decode() + "'"

        assert "Content-Security-Policy" not in csp or True  # _build_csp vrací string
        assert "default-src 'self'" in csp
        assert expected_hash in csp
        assert "script-src 'self'" in csp
        assert "frame-ancestors 'none'" in csp
        assert "fonts.googleapis.com" in csp
        assert "fonts.gstatic.com" in csp
        assert "ws:" in csp and "wss:" in csp

    def test_csp_no_inline_hash_when_no_dist(self, tmp_path: Path) -> None:
        """Pokud index.html neexistuje (dev mód), script-src obsahuje jen 'self'."""
        from scada.app import _build_csp

        empty_dist = tmp_path / "nonexistent_dist"
        csp = _build_csp(empty_dist)
        assert "script-src 'self'" in csp
        assert "sha256-" not in csp

    def test_csp_header_sent_in_response(self, client) -> None:
        """
        Middleware přidá Content-Security-Policy do HTTP odpovědi.
        Testy běží z adresáře projektu kde existuje 01_frontend/dist/index.html.
        """
        c, _ = client
        headers = c.get("/api/health").headers
        assert "content-security-policy" in headers
        csp = headers["content-security-policy"]
        assert "default-src 'self'" in csp
        assert "script-src" in csp
        assert "frame-ancestors 'none'" in csp
        assert "connect-src" in csp and "ws:" in csp


# ======================================================================
# Rate limiting — middleware
# ======================================================================

class TestRateLimit:
    """
    _RateLimitMiddleware vrátí HTTP 429 po překročení limitu.
    Pro testy se používá create_app(cfg, rate_limit=3) — limit 3 req/min
    takže 4. požadavek ze stejné IP dostane 429 bez čekání celou minutu.
    """

    @pytest.fixture
    def limited_client(self, tmp_path: Path):
        """TestClient s limitem 3 požadavky za minutu."""
        from scada.app import create_app as _create_app
        local = tmp_path / "limited"
        local.mkdir()
        cfg = AppConfig(
            server=ServerConfig(host="127.0.0.1", port=8080),
            ads=AdsConfig(net_id="1.2.3.4.1.1", port=851),
            data=DataConfig(
                local_path=local,
                remote_path="",
                csv_separator=";",
                csv_encoding="utf-8-sig",
            ),
        )
        limited_app = _create_app(cfg, rate_limit=3)
        with TestClient(limited_app) as c:
            _inject_session(limited_app)
            c.headers.update({"Authorization": f"Bearer {_TEST_TOKEN}"})
            yield c

    def test_requests_within_limit_succeed(self, limited_client) -> None:
        """První 3 požadavky musí projít (HTTP 200)."""
        for _ in range(3):
            assert limited_client.get("/api/files").status_code == 200

    def test_request_over_limit_returns_429(self, limited_client) -> None:
        """4. požadavek překročí limit 3/min → HTTP 429. /api/health je whitelistován."""
        for _ in range(3):
            limited_client.get("/api/files")  # vyčerpat limit
        r = limited_client.get("/api/files")
        assert r.status_code == 429

    def test_429_has_retry_after_header(self, limited_client) -> None:
        """429 odpověď musí obsahovat Retry-After hlavičku."""
        for _ in range(3):
            limited_client.get("/api/files")
        r = limited_client.get("/api/files")
        assert r.status_code == 429
        assert "retry-after" in r.headers

    def test_429_has_detail_message(self, limited_client) -> None:
        """429 odpověď musí mít čitelnou zprávu v JSON body."""
        for _ in range(3):
            limited_client.get("/api/files")
        body = limited_client.get("/api/files").json()
        assert "detail" in body

    def test_health_exempt_from_rate_limit(self, limited_client) -> None:
        """/api/health a /api/status nejsou rate limitovány (NSSM watchdog whitelist)."""
        for _ in range(3):
            limited_client.get("/api/files")  # vyčerpat limit
        # whitelist endpointy musí stále vracet 200
        assert limited_client.get("/api/health").status_code == 200
        assert limited_client.get("/api/status").status_code == 200


# ======================================================================
# Paginace — GET /api/files?page=&per_page=
# ======================================================================

class TestPagination:
    """
    /api/files vrací page, pages, total vedle files[].
    per_page omezí počet položek, page přepíná stránku.
    Stránka mimo rozsah se clampne na poslední platnou stránku.
    """

    def _make_files(self, cfg, n: int) -> None:
        """Vytvoří n produkčních CSV souborů v done_local/."""
        for i in range(1, n + 1):
            write_csv(
                cfg.data.local_path / "production" / "done_local" / f"FILE_{i:02d}_DONE.csv",
                PROD_HEADERS,
                [{"Timestamp": f"2026-07-{i:02d}T08:00:00", "Order": f"ORD-{i:03d}",
                  "Microswitch_ID": "MS-01", "Microswitch_Name": "Marquardt"}],
            )

    def test_response_has_pagination_fields(self, client) -> None:
        """Odpověď musí obsahovat page, pages, total vedle files."""
        c, _ = client
        body = c.get("/api/files").json()
        assert "page"  in body
        assert "pages" in body
        assert "total" in body

    def test_default_page_is_1(self, client) -> None:
        c, cfg = client
        self._make_files(cfg, 3)
        body = c.get("/api/files").json()
        assert body["page"] == 1

    def test_per_page_limits_results(self, client) -> None:
        """per_page=1 → vrátí 1 soubor, ale total=3."""
        c, cfg = client
        self._make_files(cfg, 3)
        body = c.get("/api/files?per_page=1").json()
        assert len(body["files"]) == 1
        assert body["total"]  == 3
        assert body["pages"]  == 3

    def test_page_2_returns_next_slice(self, client) -> None:
        """page=2, per_page=1 → druhý soubor."""
        c, cfg = client
        self._make_files(cfg, 3)
        p1 = c.get("/api/files?per_page=1&page=1").json()
        p2 = c.get("/api/files?per_page=1&page=2").json()
        assert p2["page"] == 2
        assert p1["files"][0]["file_id"] != p2["files"][0]["file_id"]

    def test_page_beyond_range_clamped_to_last(self, client) -> None:
        """page=99 při 3 souborech → clamp na poslední stránku (ne 404/500)."""
        c, cfg = client
        self._make_files(cfg, 3)
        body = c.get("/api/files?per_page=2&page=99").json()
        assert body["status_code"] if "status_code" in body else True  # žádná výjimka
        assert body["page"] == body["pages"]  # clamped

    def test_empty_has_page_1_pages_1(self, client) -> None:
        """Žádné soubory → page=1, pages=1 (ne dělení nulou)."""
        c, _ = client
        body = c.get("/api/files").json()
        assert body["page"]  == 1
        assert body["pages"] == 1


# ======================================================================
# GET /api/files  — server-side date filter (?from= &to=)
# ======================================================================

class TestDateFilter:
    """
    Datumový filtr je server-side — ?from=YYYY-MM-DD &to=YYYY-MM-DD.
    total v odpovědi musí odpovídat počtu souborů PO filtru, ne celkovému počtu.
    Testy jsou záměrně nezávislé na konkrétních datech testovacích souborů —
    používají minulost/budoucnost pro deterministické výsledky.
    """

    def _make_files(self, cfg) -> None:
        """3 soubory se třemi různými daty pro otestování filtru."""
        for day, name in [(1, "JAN"), (15, "JUL"), (30, "DEC")]:
            write_csv(
                cfg.data.local_path / "production" / "done_local" / f"{name}_2026-07-{day:02d}_DONE.csv",
                PROD_HEADERS,
                [{"Timestamp": f"2026-07-{day:02d}T08:00:00", "Order": f"ORD-{day:03d}",
                  "Microswitch_ID": "MS-01", "Microswitch_Name": "Marquardt"}],
            )

    def test_from_past_returns_all(self, client) -> None:
        """from=1900-01-01 → žádný soubor není starší → vrátí vše."""
        c, cfg = client
        self._make_files(cfg)
        all_body  = c.get("/api/files").json()
        from_body = c.get("/api/files?from=1900-01-01").json()
        assert from_body["total"] == all_body["total"]

    def test_from_future_returns_empty(self, client) -> None:
        """from=2099-01-01 → žádný soubor není tak nový → prázdný výsledek."""
        c, cfg = client
        self._make_files(cfg)
        body = c.get("/api/files?from=2099-01-01").json()
        assert body["total"] == 0
        assert body["files"] == []

    def test_to_future_returns_all(self, client) -> None:
        """to=2099-12-31 → všechny soubory jsou starší → vrátí vše."""
        c, cfg = client
        self._make_files(cfg)
        all_body = c.get("/api/files").json()
        to_body  = c.get("/api/files?to=2099-12-31").json()
        assert to_body["total"] == all_body["total"]

    def test_to_past_returns_empty(self, client) -> None:
        """to=1900-01-01 → žádný soubor není tak starý → prázdný výsledek."""
        c, cfg = client
        self._make_files(cfg)
        body = c.get("/api/files?to=1900-01-01").json()
        assert body["total"] == 0
        assert body["files"] == []

    def test_exact_date_match(self, client) -> None:
        """from=2026-07-15&to=2026-07-15 → vrátí jen soubor z přesného dne."""
        c, cfg = client
        self._make_files(cfg)
        body = c.get("/api/files?from=2026-07-15&to=2026-07-15").json()
        assert body["total"] == 1
        assert body["files"][0]["created_at"].startswith("2026-07-15")

    def test_range_partial(self, client) -> None:
        """from=2026-07-02&to=2026-07-29 → vyloučí 2026-07-01 i 2026-07-30."""
        c, cfg = client
        self._make_files(cfg)
        body = c.get("/api/files?from=2026-07-02&to=2026-07-29").json()
        assert body["total"] == 1   # jen 2026-07-15
        assert body["files"][0]["created_at"].startswith("2026-07-15")

    def test_total_reflects_filter_not_all(self, client) -> None:
        """total MUSÍ být po filtru — ne celkový počet. Klíčová regresní ochrana."""
        c, cfg = client
        self._make_files(cfg)
        all_total      = c.get("/api/files").json()["total"]
        filtered_total = c.get("/api/files?from=2099-01-01").json()["total"]
        assert all_total > 0        # alespoň nějaké soubory existují
        assert filtered_total == 0  # filtr odstranil vše

    def test_filter_combined_with_pagination(self, client) -> None:
        """Filtr + stránkování: total je po filtru (ne celkový), pages odpovídá per_page."""
        c, cfg = client
        self._make_files(cfg)
        # from=2026-07-02 → 2 soubory splňují filtr (2026-07-15, 2026-07-30)
        # per_page=1 → vrátí 1 soubor, ale total=2 (ne 3 = celkový počet)
        body = c.get("/api/files?from=2026-07-02&per_page=1").json()
        assert body["total"] == 2          # 2 po filtru, ne 3 celkových
        assert body["pages"] == 2          # math.ceil(2/1) = 2
        assert len(body["files"]) == 1     # stránka 1 vrátí 1 soubor


# ======================================================================
# Auth — POST /api/auth/login + POST /api/auth/logout
# ======================================================================

# Hash pro heslo "testpass" (předvypočítaný, deterministický test)
_TEST_HASH = "64d6f2afde7dc156ace2427674d00673:ec3364dc4a3578a6f425495851e663636710cd712b3ca8797827e423bcc1ea43"


@pytest.fixture
def auth_client(tmp_path: Path):
    """TestClient s nakonfigurovanou auth (username=admin, password=testpass)."""
    local = tmp_path / "local"
    local.mkdir()
    cfg = AppConfig(
        server=ServerConfig(host="127.0.0.1", port=8080),
        ads=AdsConfig(net_id="1.2.3.4.1.1", port=851),
        data=DataConfig(
            local_path=local,
            remote_path="",
            csv_separator=";",
            csv_encoding="utf-8-sig",
        ),
        auth=AuthConfig(username="admin", password_hash=_TEST_HASH),
    )
    app = create_app(cfg)
    with TestClient(app) as c:
        yield c


class TestAuth:
    """POST /api/auth/login + POST /api/auth/logout."""

    def test_valid_credentials_return_token(self, auth_client) -> None:
        r = auth_client.post("/api/auth/login",
                             json={"username": "admin", "password": "testpass"})
        assert r.status_code == 200
        assert "token" in r.json()
        assert isinstance(r.json()["token"], str)
        assert len(r.json()["token"]) > 10

    def test_wrong_password_returns_401(self, auth_client) -> None:
        r = auth_client.post("/api/auth/login",
                             json={"username": "admin", "password": "wrong"})
        assert r.status_code == 401

    def test_wrong_username_returns_401(self, auth_client) -> None:
        r = auth_client.post("/api/auth/login",
                             json={"username": "hacker", "password": "testpass"})
        assert r.status_code == 401

    def test_unconfigured_auth_returns_401(self, client) -> None:
        """Výchozí AppConfig nemá password_hash → přihlášení vždy selže."""
        c, _ = client
        r = c.post("/api/auth/login",
                   json={"username": "admin", "password": "admin"})
        assert r.status_code == 401

    def test_logout_returns_204(self, auth_client) -> None:
        token = auth_client.post("/api/auth/login",
                                 json={"username": "admin", "password": "testpass"}).json()["token"]
        r = auth_client.post("/api/auth/logout", json={"token": token})
        assert r.status_code == 204

    def test_logout_unknown_token_returns_204(self, auth_client) -> None:
        """Logout neznámého tokenu nevrátí chybu (information leakage prevence)."""
        r = auth_client.post("/api/auth/logout", json={"token": "nonexistent"})
        assert r.status_code == 204



# ======================================================================
# DELETE /api/files/{file_id}
# ======================================================================

class TestDeleteFile:
    """
    DELETE /api/files/{file_id} smaže soubor z lokálního úložiště.
    Remote soubory jsou zakázány (403). Neexistující soubor → 404.
    """

    @pytest.fixture(autouse=True)
    def setup_file(self, client) -> None:
        c, cfg = client
        self.fname = "DEL_TEST_DONE.csv"
        self.path = cfg.data.local_path / "production" / "done_local" / self.fname
        write_csv(
            self.path,
            PROD_HEADERS,
            [{"Timestamp": "2026-07-01T08:00:00", "Order": "ORD-001",
              "Microswitch_ID": "MS-01", "Microswitch_Name": "Marquardt"}],
        )
        self.c = c

    def test_delete_local_file_returns_204(self) -> None:
        r = self.c.delete(f"/api/files/{self.fname}?location=local&type=production")
        assert r.status_code == 204
        assert not self.path.exists()

    def test_deleted_file_removed_from_listing(self) -> None:
        self.c.delete(f"/api/files/{self.fname}?location=local&type=production")
        ids = [f["file_id"] for f in self.c.get("/api/files").json()["files"]]
        assert self.fname not in ids

    def test_delete_nonexistent_returns_404(self) -> None:
        r = self.c.delete("/api/files/NEEXISTUJE_DONE.csv?location=local&type=production")
        assert r.status_code == 404

    def test_delete_remote_returns_403(self) -> None:
        r = self.c.delete(f"/api/files/{self.fname}?location=remote&type=production")
        assert r.status_code == 403


# ======================================================================
# GET /api/data — datumová validace
# ======================================================================

class TestDateValidation:
    """
    Neplatný formát datumového parametru (from/to) musí vrátit HTTP 422,
    ne nekontrolovaný HTTP 500 z ValueError.
    """

    def test_invalid_from_date_returns_422(self, client) -> None:
        r, _ = client
        resp = r.get("/api/data?file=test_DONE.csv&location=local&type=production&from=notadate")
        assert resp.status_code == 422

    def test_invalid_to_date_returns_422(self, client) -> None:
        r, _ = client
        resp = r.get("/api/data?file=test_DONE.csv&location=local&type=production&to=31-12-2026")
        assert resp.status_code == 422


# ======================================================================
# POST /api/auth/plc-login
# ======================================================================

class TestPlcLogin:
    """
    POST /api/auth/plc-login — přihlášení pomocí PLC příznaku (bez hesla).
    Endpoint ověří monitor.current_values["plc_operator_login"].
    """

    def test_plc_logged_in_returns_token(self, client) -> None:
        """plc_operator_login=True → 200 + token role=operator."""
        c, _ = client
        c.app.state.monitor.current_values["plc_operator_login"] = True
        r = c.post("/api/auth/plc-login")
        assert r.status_code == 200
        body = r.json()
        assert "token" in body
        assert isinstance(body["token"], str) and len(body["token"]) > 10
        assert body["role"] == "operator"
        assert body["display_name"] == "PLC Operátor"

    def test_plc_not_logged_in_returns_403(self, client) -> None:
        """plc_operator_login=False → 403."""
        c, _ = client
        c.app.state.monitor.current_values["plc_operator_login"] = False
        r = c.post("/api/auth/plc-login")
        assert r.status_code == 403

    def test_plc_missing_symbol_returns_403(self, client) -> None:
        """Klíč chybí v current_values (výchozí False) → 403."""
        c, _ = client
        c.app.state.monitor.current_values.pop("plc_operator_login", None)
        r = c.post("/api/auth/plc-login")
        assert r.status_code == 403

    def test_plc_token_stored_in_sessions(self, client) -> None:
        """Vrácený token musí být uložen v app.state.sessions s role=operator."""
        c, _ = client
        c.app.state.monitor.current_values["plc_operator_login"] = True
        token = c.post("/api/auth/plc-login").json()["token"]
        session = c.app.state.sessions.get(token)
        assert session is not None
        assert session["role"] == "operator"
        assert session["username"] == "plc_operator"


# ======================================================================
# /api/users — CRUD a RBAC
# ======================================================================

# Konstanty pro users testy
_ADMIN_TOKEN2  = "users-admin-token-abc"
_OP_TOKEN2     = "users-op-token-xyz"
_ADMIN_SESSION2 = {"username": "admin", "role": "admin",    "display_name": "Admin"}
_OP_SESSION2    = {"username": "op1",   "role": "operator", "display_name": "Operátor 1"}


@pytest.fixture
def users_client(tmp_path: Path):
    """
    TestClient s předpřipravenými uživateli admin + operator.
    Výchozí Authorization je admin token.
    users.toml není na disku — změny jsou pouze in-memory.
    """
    app, _ = make_app(tmp_path)
    with TestClient(app) as c:
        app.state.sessions[_ADMIN_TOKEN2] = _ADMIN_SESSION2.copy()
        app.state.sessions[_OP_TOKEN2]    = _OP_SESSION2.copy()
        app.state.users_path = None   # žádný disk → změny pouze in-memory
        app.state.users = [
            UserEntry(username="admin", display_name="Admin",
                      password_hash=_TEST_HASH, role="admin"),
            UserEntry(username="op1",   display_name="Operátor 1",
                      password_hash=_TEST_HASH, role="operator"),
        ]
        c.headers.update({"Authorization": f"Bearer {_ADMIN_TOKEN2}"})
        yield c


class TestUsersApi:
    """
    CRUD + RBAC testy pro /api/users.
    Admin: plný přístup. Operator: 403 na všechny admin endpointy.
    """

    # ── GET /api/users ──────────────────────────────────────────────────

    def test_admin_gets_user_list(self, users_client) -> None:
        r = users_client.get("/api/users")
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list)
        assert len(users) == 2
        usernames = [u["username"] for u in users]
        assert "admin" in usernames and "op1" in usernames

    def test_response_excludes_password_hash(self, users_client) -> None:
        """UserModel nesmí obsahovat password_hash."""
        for user in users_client.get("/api/users").json():
            assert "password_hash" not in user

    def test_operator_gets_403(self, users_client) -> None:
        r = users_client.get("/api/users",
                             headers={"Authorization": f"Bearer {_OP_TOKEN2}"})
        assert r.status_code == 403

    def test_no_token_gets_401(self, users_client) -> None:
        r = users_client.get("/api/users", headers={"Authorization": ""})
        assert r.status_code == 401

    # ── POST /api/users ─────────────────────────────────────────────────

    def test_admin_creates_user(self, users_client) -> None:
        r = users_client.post("/api/users", json={
            "username": "tech1", "display_name": "Technik",
            "password": "pass123", "role": "technician",
        })
        assert r.status_code == 201
        body = r.json()
        assert body["username"] == "tech1"
        assert body["role"] == "technician"
        assert "password_hash" not in body

    def test_duplicate_username_returns_409(self, users_client) -> None:
        r = users_client.post("/api/users", json={
            "username": "op1", "display_name": "Duplikát",
            "password": "pass", "role": "operator",
        })
        assert r.status_code == 409

    def test_invalid_role_returns_400(self, users_client) -> None:
        r = users_client.post("/api/users", json={
            "username": "x", "display_name": "X",
            "password": "pass", "role": "superadmin",
        })
        assert r.status_code == 400

    def test_empty_username_returns_400(self, users_client) -> None:
        r = users_client.post("/api/users", json={
            "username": "  ", "display_name": "",
            "password": "pass", "role": "operator",
        })
        assert r.status_code == 400

    def test_admin_cannot_create_higher_role(self, users_client) -> None:
        """Admin (level 2) nemůže vytvořit manufacturer (level 3) → 403."""
        r = users_client.post("/api/users", json={
            "username": "mfr", "display_name": "Výrobce",
            "password": "pass", "role": "manufacturer",
        })
        assert r.status_code == 403

    def test_operator_cannot_create_user(self, users_client) -> None:
        r = users_client.post("/api/users",
                              headers={"Authorization": f"Bearer {_OP_TOKEN2}"},
                              json={"username": "x", "display_name": "X",
                                    "password": "pass", "role": "operator"})
        assert r.status_code == 403

    # ── DELETE /api/users/{username} ────────────────────────────────────

    def test_admin_deletes_operator(self, users_client) -> None:
        r = users_client.delete("/api/users/op1")
        assert r.status_code == 204
        usernames = [u["username"] for u in users_client.get("/api/users").json()]
        assert "op1" not in usernames

    def test_cannot_delete_self(self, users_client) -> None:
        r = users_client.delete("/api/users/admin")
        assert r.status_code == 400

    def test_cannot_delete_last_user(self, tmp_path: Path) -> None:
        """Smazání jediného uživatele → 400."""
        app, _ = make_app(tmp_path)
        mfr_tok = "mfr-tok"
        with TestClient(app) as c:
            app.state.sessions[mfr_tok] = {
                "username": "mfr", "role": "manufacturer", "display_name": "Výrobce",
            }
            app.state.users_path = None
            app.state.users = [
                UserEntry(username="mfr", display_name="Výrobce",
                          password_hash=_TEST_HASH, role="manufacturer"),
            ]
            r = c.delete("/api/users/mfr",
                         headers={"Authorization": f"Bearer {mfr_tok}"})
        assert r.status_code == 400

    def test_delete_nonexistent_returns_404(self, users_client) -> None:
        r = users_client.delete("/api/users/neexistuje")
        assert r.status_code == 404

    def test_operator_cannot_delete(self, users_client) -> None:
        r = users_client.delete("/api/users/op1",
                                headers={"Authorization": f"Bearer {_OP_TOKEN2}"})
        assert r.status_code == 403

    # ── POST /api/users/{username}/password ────────────────────────────

    def test_admin_changes_others_password_no_current_required(self, users_client) -> None:
        """Admin mění heslo jiného — current_password není povinné."""
        r = users_client.post("/api/users/op1/password",
                              json={"new_password": "noveheslo123"})
        assert r.status_code == 204

    def test_operator_changes_own_password_with_current(self, users_client) -> None:
        """Operátor mění vlastní heslo — musí uvést aktuální heslo."""
        r = users_client.post("/api/users/op1/password",
                              headers={"Authorization": f"Bearer {_OP_TOKEN2}"},
                              json={"current_password": "testpass",
                                    "new_password": "noveheslo123"})
        assert r.status_code == 204

    def test_operator_wrong_current_password_returns_401(self, users_client) -> None:
        r = users_client.post("/api/users/op1/password",
                              headers={"Authorization": f"Bearer {_OP_TOKEN2}"},
                              json={"current_password": "spatne",
                                    "new_password": "noveheslo"})
        assert r.status_code == 401

    def test_operator_cannot_change_others_password(self, users_client) -> None:
        """Operátor nemůže měnit heslo admina → 403."""
        r = users_client.post("/api/users/admin/password",
                              headers={"Authorization": f"Bearer {_OP_TOKEN2}"},
                              json={"current_password": "testpass",
                                    "new_password": "noveheslo"})
        assert r.status_code == 403

    def test_empty_new_password_returns_400(self, users_client) -> None:
        r = users_client.post("/api/users/op1/password",
                              json={"new_password": "   "})
        assert r.status_code == 400

    def test_change_password_invalidates_user_sessions(self, users_client) -> None:
        """Po změně hesla admin→op1 musí být sessions op1 zneplatněny."""
        # op1 token existuje před změnou
        assert _OP_TOKEN2 in users_client.app.state.sessions
        users_client.post("/api/users/op1/password",
                          json={"new_password": "noveheslo123"})
        # op1 sessions musí být odstraněny
        assert _OP_TOKEN2 not in users_client.app.state.sessions
