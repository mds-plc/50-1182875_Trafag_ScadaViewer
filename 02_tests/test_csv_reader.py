"""
Testy pro CsvReader — offline, bez ADS, bez PLC, bez sítě.

PROČ TESTY EXISTUJÍ:
  CsvReader je jádro datové vrstvy — čte soubory z disku a NAS, validuje vstupy,
  normalizuje klíče. Chyba zde = špatná data v UI nebo bezpečnostní problém.
  Testy zachytí regresi při každé změně CsvReader nebo CSV formátu.

POKRYTÍ:
  - _validate_params: bezpečnostní validace vstupů (path traversal, null byte, délka)
  - list_files (local): výpis souborů, sync_status, record_count, řazení, filtrování
  - list_files (testing): production vs testing (přítomnost Order sloupce)
  - list_files (remote): flat struktura NAS, chybějící složka
  - list_files (neplatné parametry): neplatný location/file_type → []
  - read_records: základní čtení, lowercase klíče, filtry datumem, edge cases
  - read_records (bezpečnost): path traversal, null byte, příliš dlouhé file_id

SPUŠTĚNÍ:
  pytest 02_tests/test_csv_reader.py -v
"""
from __future__ import annotations

import csv
from pathlib import Path

import pytest

from scada.config import DataConfig
from scada.services.csv_reader import CsvReader


# ======================================================================
# Sdílené helpers
# ======================================================================

# Hlavičky CSV souborů dle DatabaseGateway formátu
PROD_HEADERS = ["Timestamp", "Order", "Microswitch_ID", "Microswitch_Name"]
TEST_HEADERS = ["Timestamp", "Microswitch_ID", "Microswitch_Name"]


def write_csv(
    path: Path,
    headers: list[str],
    rows: list[dict],
    encoding: str = "utf-8-sig",
    sep: str = ";",
) -> Path:
    """Zapíše testovací CSV soubor se správnou strukturou a kódováním."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding=encoding, newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers, delimiter=sep, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    return path


def prod_row(
    ts: str,
    order: str = "ORD-001",
    ms_id: str = "MS-01",
    ms_name: str = "Marquardt",
) -> dict:
    """Továrna na production CSV řádek."""
    return {"Timestamp": ts, "Order": order, "Microswitch_ID": ms_id, "Microswitch_Name": ms_name}


def make_test_row(ts: str, ms_id: str = "MS-01", ms_name: str = "Cherry") -> dict:
    """Továrna na testing CSV řádek (bez Order)."""
    return {"Timestamp": ts, "Microswitch_ID": ms_id, "Microswitch_Name": ms_name}


# ======================================================================
# Fixtures
# ======================================================================

@pytest.fixture
def cfg(tmp_path: Path) -> DataConfig:
    """DataConfig s dočasnými složkami — izolace každého testu."""
    return DataConfig(
        local_path=tmp_path / "local",
        remote_path=str(tmp_path / "remote"),
        csv_separator=";",
        csv_encoding="utf-8-sig",
    )


@pytest.fixture
def reader(cfg: DataConfig) -> CsvReader:
    return CsvReader(cfg)


# ======================================================================
# _validate_params — bezpečnostní validace vstupů
# ======================================================================

class TestValidateParams:
    """
    _validate_params je první obranná linie před path traversal útoky.
    Všechny public metody ji volají před jakýmkoli přístupem k disku.
    """

    def test_valid_params_local(self, reader: CsvReader) -> None:
        assert reader._validate_params(None, "local", "production") is True

    def test_valid_params_remote_testing(self, reader: CsvReader) -> None:
        assert reader._validate_params("FILE_DONE.csv", "remote", "testing") is True

    def test_valid_file_id_normal(self, reader: CsvReader) -> None:
        assert reader._validate_params("ORDER_001_2026-07-01_DONE.csv", "local", "production") is True

    # --- Neplatné location / file_type ---

    def test_invalid_location_rejected(self, reader: CsvReader) -> None:
        assert reader._validate_params(None, "nas", "production") is False
        assert reader._validate_params(None, "ftp", "production") is False
        assert reader._validate_params(None, "", "production") is False

    def test_invalid_file_type_rejected(self, reader: CsvReader) -> None:
        assert reader._validate_params(None, "local", "debug") is False
        assert reader._validate_params(None, "local", "wip") is False
        assert reader._validate_params(None, "local", "") is False

    # --- Path traversal ---

    def test_dotdot_rejected(self, reader: CsvReader) -> None:
        """.. v file_id umožňuje přechod do nadřazené složky — musí být odmítnuto."""
        assert reader._validate_params("../etc/passwd", "local", "production") is False
        assert reader._validate_params("../../Config.toml", "local", "production") is False
        assert reader._validate_params("file/../other.csv", "local", "production") is False

    def test_forward_slash_rejected(self, reader: CsvReader) -> None:
        assert reader._validate_params("sub/file.csv", "local", "production") is False

    def test_backslash_rejected(self, reader: CsvReader) -> None:
        assert reader._validate_params("sub\\file.csv", "local", "production") is False

    # --- Null byte ---

    def test_null_byte_rejected(self, reader: CsvReader) -> None:
        """Null byte v cestě může na některých OS způsobit předčasné ukončení cesty."""
        assert reader._validate_params("file\x00.csv", "local", "production") is False
        assert reader._validate_params("\x00", "local", "production") is False

    # --- Délka ---

    def test_file_id_max_length_accepted(self, reader: CsvReader) -> None:
        # 255 znaků celkem — suffix _DONE.csv (9 znaků) + 246 znaků prefix
        file_id = "A" * 246 + "_DONE.csv"
        assert len(file_id) == 255
        assert reader._validate_params(file_id, "local", "production") is True

    def test_file_id_over_max_length_rejected(self, reader: CsvReader) -> None:
        assert reader._validate_params("A" * 256, "local", "production") is False

    # --- None je povoleno (list_files volá _validate_params(None, ...)) ---

    def test_none_file_id_accepted(self, reader: CsvReader) -> None:
        assert reader._validate_params(None, "local", "production") is True
        assert reader._validate_params(None, "remote", "testing") is True


# ======================================================================
# list_files — lokální úložiště
# ======================================================================

class TestListFilesLocal:
    """
    list_files(location='local') skenuje done_local/ + done_remote/ a vrátí metadata.
    Výsledek je seřazen dle created_at (Timestamp prvního záznamu) sestupně.
    """

    def test_empty_returns_empty_list(self, reader: CsvReader) -> None:
        """Pokud složky neexistují, vrátit [] bez výjimky."""
        assert reader.list_files("local", "production") == []

    def test_done_local_file_detected(self, reader: CsvReader, cfg: DataConfig) -> None:
        """Soubor v done_local/ má sync_status='done_local'."""
        write_csv(
            cfg.local_path / "production" / "done_local" / "MARQUARDT_2026-07-01_DONE.csv",
            PROD_HEADERS,
            [prod_row("2026-07-01T08:00:00"), prod_row("2026-07-01T08:01:00")],
        )
        files = reader.list_files("local", "production")

        assert len(files) == 1
        f = files[0]
        assert f["file_id"] == "MARQUARDT_2026-07-01_DONE.csv"
        assert f["sync_status"] == "done_local"
        assert f["record_count"] == 2
        assert f["order_id"] == "ORD-001"
        assert f["switch_name"] == "Marquardt"
        assert f["location"] == "local"
        assert f["type"] == "production"

    def test_done_remote_file_detected(self, reader: CsvReader, cfg: DataConfig) -> None:
        """Soubor v done_remote/ má sync_status='done_remote'."""
        write_csv(
            cfg.local_path / "production" / "done_remote" / "HONEYWELL_2026-07-02_DONE.csv",
            PROD_HEADERS,
            [prod_row("2026-07-02T09:00:00", ms_name="Honeywell")],
        )
        files = reader.list_files("local", "production")

        assert len(files) == 1
        assert files[0]["sync_status"] == "done_remote"
        assert files[0]["switch_name"] == "Honeywell"

    def test_both_folders_merged_and_sorted(self, reader: CsvReader, cfg: DataConfig) -> None:
        """
        Soubory z done_local/ i done_remote/ jsou sloučeny.
        Seřazení: novější Timestamp první (desc).
        """
        write_csv(
            cfg.local_path / "production" / "done_local" / "A_2026-07-01_DONE.csv",
            PROD_HEADERS,
            [prod_row("2026-07-01T08:00:00")],
        )
        write_csv(
            cfg.local_path / "production" / "done_remote" / "B_2026-07-03_DONE.csv",
            PROD_HEADERS,
            [prod_row("2026-07-03T08:00:00")],
        )
        write_csv(
            cfg.local_path / "production" / "done_local" / "C_2026-07-02_DONE.csv",
            PROD_HEADERS,
            [prod_row("2026-07-02T08:00:00")],
        )
        files = reader.list_files("local", "production")

        assert len(files) == 3
        assert files[0]["file_id"] == "B_2026-07-03_DONE.csv"   # nejnovější
        assert files[1]["file_id"] == "C_2026-07-02_DONE.csv"
        assert files[2]["file_id"] == "A_2026-07-01_DONE.csv"   # nejstarší

    def test_record_count_correct(self, reader: CsvReader, cfg: DataConfig) -> None:
        write_csv(
            cfg.local_path / "production" / "done_local" / "COUNT_2026-07-01_DONE.csv",
            PROD_HEADERS,
            [prod_row(f"2026-07-01T0{i}:00:00") for i in range(7)],
        )
        files = reader.list_files("local", "production")
        assert files[0]["record_count"] == 7

    def test_non_done_csv_files_ignored(self, reader: CsvReader, cfg: DataConfig) -> None:
        """
        Glob pattern je *_DONE.csv.
        Jiné soubory (txt, csv bez _DONE, jiné csv) musí být ignorovány.
        """
        folder = cfg.local_path / "production" / "done_local"
        folder.mkdir(parents=True)
        (folder / "notes.txt").write_text("ignored", encoding="utf-8")
        (folder / "DATA_2026-07-01.csv").write_text("also ignored", encoding="utf-8")
        (folder / "wip_file.csv").write_text("ignored too", encoding="utf-8")
        write_csv(
            folder / "VALID_2026-07-01_DONE.csv",
            PROD_HEADERS,
            [prod_row("2026-07-01T08:00:00")],
        )

        files = reader.list_files("local", "production")
        assert len(files) == 1
        assert files[0]["file_id"] == "VALID_2026-07-01_DONE.csv"

    def test_empty_csv_file_skipped(self, reader: CsvReader, cfg: DataConfig) -> None:
        """
        Soubor s pouze hlavičkou (0 datových řádků) → _file_meta() vrátí None.
        Takový soubor musí být přeskočen bez výjimky.
        """
        folder = cfg.local_path / "production" / "done_local"
        folder.mkdir(parents=True)
        path = folder / "EMPTY_2026-07-01_DONE.csv"
        with open(path, "w", encoding="utf-8-sig", newline="") as f:
            f.write("Timestamp;Order;Microswitch_ID;Microswitch_Name\n")

        assert reader.list_files("local", "production") == []

    def test_corrupted_file_skipped_others_returned(self, reader: CsvReader, cfg: DataConfig) -> None:
        """
        Poškozený soubor je přeskočen (try/except v _list_local).
        Ostatní platné soubory musí být vráceny.
        """
        folder = cfg.local_path / "production" / "done_local"
        folder.mkdir(parents=True)
        # Poškozený: nevalidní UTF-8 sekvence
        broken = folder / "BROKEN_2026-07-01_DONE.csv"
        broken.write_bytes(
            b"Timestamp;Order;Microswitch_ID;Microswitch_Name\n"
            b"2026-07-01T08:00:00;ORD-001;MS-01;M\xe4rquardt\n"  # \xe4 = nevalidní v UTF-8
        )
        # Platný soubor
        write_csv(
            folder / "VALID_2026-07-02_DONE.csv",
            PROD_HEADERS,
            [prod_row("2026-07-02T08:00:00")],
        )

        files = reader.list_files("local", "production")
        assert len(files) == 1
        assert files[0]["file_id"] == "VALID_2026-07-02_DONE.csv"


# ======================================================================
# list_files — testing (bez sloupce Order)
# ======================================================================

class TestListFilesLocalTesting:
    """
    Testing soubory nemají sloupec Order → order_id musí být None.
    Ostatní chování stejné jako production.
    """

    def test_testing_order_id_is_none(self, reader: CsvReader, cfg: DataConfig) -> None:
        write_csv(
            cfg.local_path / "testing" / "done_local" / "CHERRY_2026-07-01_DONE.csv",
            TEST_HEADERS,
            [make_test_row("2026-07-01T08:00:00", ms_name="Cherry")],
        )
        files = reader.list_files("local", "testing")

        assert len(files) == 1
        assert files[0]["order_id"] is None
        assert files[0]["switch_name"] == "Cherry"
        assert files[0]["type"] == "testing"

    def test_production_and_testing_isolated(self, reader: CsvReader, cfg: DataConfig) -> None:
        """list_files('local', 'production') nesmí vrátit testing soubory a naopak."""
        write_csv(
            cfg.local_path / "production" / "done_local" / "PROD_2026-07-01_DONE.csv",
            PROD_HEADERS,
            [prod_row("2026-07-01T08:00:00")],
        )
        write_csv(
            cfg.local_path / "testing" / "done_local" / "TEST_2026-07-01_DONE.csv",
            TEST_HEADERS,
            [make_test_row("2026-07-01T08:00:00")],
        )

        prod_files = reader.list_files("local", "production")
        test_files = reader.list_files("local", "testing")

        assert len(prod_files) == 1 and prod_files[0]["type"] == "production"
        assert len(test_files) == 1 and test_files[0]["type"] == "testing"


# ======================================================================
# list_files — vzdálené úložiště (NAS)
# ======================================================================

class TestListFilesRemote:
    """
    Remote úložiště má plochou strukturu: {remote_path}/{type}/*.csv
    Žádné done_local/done_remote podadresáře → sync_status není přítomen.
    """

    def test_nonexistent_folder_returns_empty(self, reader: CsvReader) -> None:
        """NAS složka neexistuje → [] bez výjimky (typický stav při offline NAS)."""
        assert reader.list_files("remote", "production") == []

    def test_remote_flat_structure_no_sync_status(self, reader: CsvReader, cfg: DataConfig) -> None:
        folder = Path(cfg.remote_path) / "production"
        write_csv(
            folder / "NAS_FILE_2026-07-01_DONE.csv",
            PROD_HEADERS,
            [prod_row("2026-07-01T08:00:00")],
        )
        files = reader.list_files("remote", "production")

        assert len(files) == 1
        assert "sync_status" not in files[0]   # remote nemá sync_status
        assert files[0]["location"] == "remote"

    def test_remote_multiple_files(self, reader: CsvReader, cfg: DataConfig) -> None:
        folder = Path(cfg.remote_path) / "production"
        for i in range(1, 4):
            write_csv(
                folder / f"FILE_{i}_2026-07-0{i}_DONE.csv",
                PROD_HEADERS,
                [prod_row(f"2026-07-0{i}T08:00:00")],
            )
        files = reader.list_files("remote", "production")
        assert len(files) == 3

    def test_remote_testing_type(self, reader: CsvReader, cfg: DataConfig) -> None:
        folder = Path(cfg.remote_path) / "testing"
        write_csv(
            folder / "REMOTE_TEST_2026-07-01_DONE.csv",
            TEST_HEADERS,
            [make_test_row("2026-07-01T08:00:00")],
        )
        files = reader.list_files("remote", "testing")
        assert len(files) == 1
        assert files[0]["order_id"] is None


# ======================================================================
# list_files — neplatné parametry
# ======================================================================

class TestListFilesInvalidParams:
    def test_invalid_location_returns_empty(self, reader: CsvReader) -> None:
        assert reader.list_files("ftp", "production") == []
        assert reader.list_files("", "production") == []

    def test_invalid_file_type_returns_empty(self, reader: CsvReader) -> None:
        assert reader.list_files("local", "unknown") == []
        assert reader.list_files("local", "wip") == []


# ======================================================================
# read_records — základní čtení
# ======================================================================

class TestReadRecords:
    def test_basic_read_returns_all_rows(self, reader: CsvReader, cfg: DataConfig) -> None:
        fname = "ORDER_2026-07-01_DONE.csv"
        write_csv(
            cfg.local_path / "production" / "done_local" / fname,
            PROD_HEADERS,
            [prod_row(f"2026-07-01T08:0{i}:00") for i in range(5)],
        )
        records = reader.read_records(fname, "local", "production")
        assert len(records) == 5

    def test_keys_are_lowercase(self, reader: CsvReader, cfg: DataConfig) -> None:
        """
        CSV má Timestamp, Order, Microswitch_ID, Microswitch_Name.
        CsvReader musí vrátit lowercase klíče: timestamp, order, microswitch_id, microswitch_name.
        Frontend závisí na tomto chování — změna by rozbila UI.
        """
        fname = "KEYS_2026-07-01_DONE.csv"
        write_csv(
            cfg.local_path / "production" / "done_local" / fname,
            PROD_HEADERS,
            [prod_row("2026-07-01T08:00:00")],
        )
        records = reader.read_records(fname, "local", "production")

        assert "timestamp"        in records[0]
        assert "order"            in records[0]
        assert "microswitch_id"   in records[0]
        assert "microswitch_name" in records[0]
        # Originální kapitalizace nesmí být přítomna
        assert "Timestamp"      not in records[0]
        assert "Order"          not in records[0]
        assert "Microswitch_ID" not in records[0]

    def test_file_not_found_returns_empty(self, reader: CsvReader) -> None:
        """Neexistující soubor → [] bez výjimky."""
        assert reader.read_records("NEEXISTUJE_DONE.csv", "local", "production") == []

    def test_empty_file_returns_empty(self, reader: CsvReader, cfg: DataConfig) -> None:
        """Soubor s pouze hlavičkou (0 datových řádků) → []."""
        fname = "EMPTY_2026-07-01_DONE.csv"
        folder = cfg.local_path / "production" / "done_local"
        folder.mkdir(parents=True)
        (folder / fname).write_text(
            "Timestamp;Order;Microswitch_ID;Microswitch_Name\n",
            encoding="utf-8-sig",
        )
        assert reader.read_records(fname, "local", "production") == []

    def test_encoding_error_returns_empty(self, reader: CsvReader, cfg: DataConfig) -> None:
        """
        Soubor s neplatným UTF-8 kódováním → UnicodeDecodeError zachycen → [].
        Test ověřuje, že chyba kódování nepropadne jako 500 do API.
        """
        fname = "BROKEN_2026-07-01_DONE.csv"
        folder = cfg.local_path / "production" / "done_local"
        folder.mkdir(parents=True)
        (folder / fname).write_bytes(
            b"Timestamp;Order;Microswitch_ID;Microswitch_Name\n"
            b"2026-07-01T08:00:00;ORD-001;MS-01;M\xe4rquardt\n"  # \xe4 nevalidní v UTF-8
        )
        assert reader.read_records(fname, "local", "production") == []


# ======================================================================
# read_records — datumové filtry
# ======================================================================

class TestReadRecordsDateFilters:
    """
    Filtry from_date / to_date jsou string srovnání ISO 8601 prefixů.
    DatabaseGateway garantuje formát YYYY-MM-DDTHH:MM:SS — srovnání je spolehlivé.
    """

    @pytest.fixture
    def file_with_week(self, reader: CsvReader, cfg: DataConfig) -> str:
        """Soubor se záznamy pro každý den v týdnu 2026-07-01 až 2026-07-07."""
        fname = "WEEK_2026-07-01_DONE.csv"
        write_csv(
            cfg.local_path / "production" / "done_local" / fname,
            PROD_HEADERS,
            [prod_row(f"2026-07-0{i}T08:00:00") for i in range(1, 8)],
        )
        return fname

    def test_from_date_inclusive(self, reader: CsvReader, file_with_week: str) -> None:
        records = reader.read_records(file_with_week, "local", "production", from_date="2026-07-04")
        assert len(records) == 4
        assert records[0]["timestamp"] == "2026-07-04T08:00:00"

    def test_to_date_inclusive_end_of_day(self, reader: CsvReader, file_with_week: str) -> None:
        """to_date='2026-07-03' zahrne záznamy až do 2026-07-03T23:59:59 (celý den)."""
        records = reader.read_records(file_with_week, "local", "production", to_date="2026-07-03")
        assert len(records) == 3
        assert records[-1]["timestamp"] == "2026-07-03T08:00:00"

    def test_from_and_to_date_range(self, reader: CsvReader, file_with_week: str) -> None:
        records = reader.read_records(
            file_with_week, "local", "production",
            from_date="2026-07-03", to_date="2026-07-05",
        )
        assert len(records) == 3
        assert records[0]["timestamp"].startswith("2026-07-03")
        assert records[-1]["timestamp"].startswith("2026-07-05")

    def test_no_filters_returns_all(self, reader: CsvReader, file_with_week: str) -> None:
        records = reader.read_records(file_with_week, "local", "production")
        assert len(records) == 7

    def test_filter_matching_nothing_returns_empty(self, reader: CsvReader, file_with_week: str) -> None:
        records = reader.read_records(
            file_with_week, "local", "production",
            from_date="2026-08-01",
        )
        assert records == []


# ======================================================================
# read_records — bezpečnost
# ======================================================================

class TestReadRecordsSecurity:
    """
    Všechny bezpečnostní testy musí vrátit [] bez výjimky.
    Výjimka by propadla do API jako 500 — to je nežádoucí.
    """

    def test_path_traversal_dotdot(self, reader: CsvReader) -> None:
        assert reader.read_records("../etc/passwd", "local", "production") == []
        assert reader.read_records("../../Config.toml", "local", "production") == []

    def test_path_traversal_slash(self, reader: CsvReader) -> None:
        assert reader.read_records("sub/file.csv", "local", "production") == []

    def test_path_traversal_backslash(self, reader: CsvReader) -> None:
        assert reader.read_records("sub\\file.csv", "local", "production") == []

    def test_null_byte(self, reader: CsvReader) -> None:
        assert reader.read_records("file\x00.csv", "local", "production") == []

    def test_too_long_file_id(self, reader: CsvReader) -> None:
        assert reader.read_records("A" * 256 + ".csv", "local", "production") == []

    def test_invalid_location(self, reader: CsvReader) -> None:
        assert reader.read_records("file.csv", "ftp", "production") == []

    def test_invalid_file_type(self, reader: CsvReader) -> None:
        assert reader.read_records("file.csv", "local", "wip") == []
