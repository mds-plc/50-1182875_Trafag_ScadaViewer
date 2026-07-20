"""
ScadaViewer — offline testy konfigurace a logování (bez ADS, bez PLC).

Pokrytí:
  - load_config: základní načtení hodnot z TOML
  - _validate_config: validace polí — port, net_id, csv_separator
  - JsonFormatter: JSON výstup, povinná pole, výjimky
"""
from __future__ import annotations

import json
import logging

import pytest
from pathlib import Path

from scada.config import load_config, _validate_config, AppConfig, ServerConfig, AdsConfig, DataConfig


# ======================================================================
# Helpers
# ======================================================================

def make_config_file(tmp_path: Path, **overrides: str) -> Path:
    """Vytvoří Config.toml s předdefinovanými hodnotami a případnými přepsáními."""
    defaults = {
        "server_host":  '"127.0.0.1"',
        "server_port":  "8080",
        "ads_net_id":   '"1.2.3.4.1.1"',
        "ads_port":     "851",
        "local_path":   '"/tmp/data"',
        "remote_path":  '"\\\\\\\\server\\\\share"',
        "csv_sep":      '";"',
        "csv_enc":      '"utf-8-sig"',
    }
    defaults.update(overrides)

    content = (
        f'[server]\nhost = {defaults["server_host"]}\nport = {defaults["server_port"]}\n'
        f'[ads]\nnet_id = {defaults["ads_net_id"]}\nport = {defaults["ads_port"]}\n'
        f'[data]\nlocal_path = {defaults["local_path"]}\nremote_path = {defaults["remote_path"]}\n'
        f'csv_separator = {defaults["csv_sep"]}\ncsv_encoding = {defaults["csv_enc"]}\n'
    )
    cfg_path = tmp_path / "Config.toml"
    cfg_path.write_text(content, encoding="utf-8")
    return cfg_path


def make_app_config(**kwargs) -> AppConfig:
    """Vytvoří AppConfig s předdefinovanými hodnotami pro unit testy _validate_config."""
    return AppConfig(
        server=ServerConfig(
            host=kwargs.get("host", "127.0.0.1"),
            port=kwargs.get("server_port", 8080),
        ),
        ads=AdsConfig(
            net_id=kwargs.get("net_id", "1.2.3.4.1.1"),
            port=kwargs.get("ads_port", 851),
        ),
        data=DataConfig(
            local_path=Path(kwargs.get("local_path", "/tmp/data")),
            remote_path=kwargs.get("remote_path", "\\\\server\\share"),
            csv_separator=kwargs.get("csv_separator", ";"),
            csv_encoding=kwargs.get("csv_encoding", "utf-8-sig"),
        ),
    )


# ======================================================================
# load_config — základní načtení
# ======================================================================

class TestLoadConfig:
    def test_basic_values_loaded(self, tmp_path: Path) -> None:
        cfg = load_config(make_config_file(tmp_path))
        assert cfg.server.port == 8080
        assert cfg.server.host == "127.0.0.1"
        assert cfg.ads.net_id == "1.2.3.4.1.1"
        assert cfg.ads.port == 851
        assert cfg.data.csv_separator == ";"
        assert cfg.data.csv_encoding == "utf-8-sig"

    def test_local_path_is_path_object(self, tmp_path: Path) -> None:
        """local_path musí být Path (ne str) — CsvReader volá .exists(), .glob() apod."""
        cfg = load_config(make_config_file(tmp_path))
        assert isinstance(cfg.data.local_path, Path)

    def test_missing_file_raises(self, tmp_path: Path) -> None:
        with pytest.raises(FileNotFoundError):
            load_config(tmp_path / "neexistuje.toml")

    def test_missing_key_raises(self, tmp_path: Path) -> None:
        """Chybějící povinný klíč → KeyError (ne tiché selhání)."""
        cfg_path = tmp_path / "bad.toml"
        cfg_path.write_text("[server]\nhost = \"127.0.0.1\"\n", encoding="utf-8")
        with pytest.raises((KeyError, Exception)):
            load_config(cfg_path)


# ======================================================================
# _validate_config — validace polí
# ======================================================================

class TestValidateConfig:
    """
    _validate_config je voláno z load_config po sestavení AppConfig.
    Chybná hodnota v TOML musí být odhalena okamžitě při startu — ne za běhu.
    """

    def test_valid_config_passes(self) -> None:
        """Platná konfigurace nesmí vyhodit výjimku."""
        _validate_config(make_app_config())  # žádná výjimka

    # --- Server port ---

    def test_server_port_zero_rejected(self) -> None:
        with pytest.raises(ValueError, match="server.*port"):
            _validate_config(make_app_config(server_port=0))

    def test_server_port_negative_rejected(self) -> None:
        with pytest.raises(ValueError, match="server.*port"):
            _validate_config(make_app_config(server_port=-1))

    def test_server_port_over_max_rejected(self) -> None:
        with pytest.raises(ValueError, match="server.*port"):
            _validate_config(make_app_config(server_port=65536))

    def test_server_port_max_valid(self) -> None:
        _validate_config(make_app_config(server_port=65535))

    def test_server_port_min_valid(self) -> None:
        _validate_config(make_app_config(server_port=1))

    # --- ADS port ---

    def test_ads_port_zero_rejected(self) -> None:
        with pytest.raises(ValueError, match="ads.*port"):
            _validate_config(make_app_config(ads_port=0))

    def test_ads_port_over_max_rejected(self) -> None:
        with pytest.raises(ValueError, match="ads.*port"):
            _validate_config(make_app_config(ads_port=65536))

    # --- ADS net_id ---

    def test_empty_net_id_rejected(self) -> None:
        with pytest.raises(ValueError, match="net_id"):
            _validate_config(make_app_config(net_id=""))

    def test_whitespace_net_id_rejected(self) -> None:
        with pytest.raises(ValueError, match="net_id"):
            _validate_config(make_app_config(net_id="   "))

    # --- CSV separator ---

    def test_empty_separator_rejected(self) -> None:
        with pytest.raises(ValueError, match="csv_separator"):
            _validate_config(make_app_config(csv_separator=""))

    def test_multi_char_separator_rejected(self) -> None:
        with pytest.raises(ValueError, match="csv_separator"):
            _validate_config(make_app_config(csv_separator=";;"))

    def test_comma_separator_valid(self) -> None:
        """Čárka je platný oddělovač (i když projekt používá ;)."""
        _validate_config(make_app_config(csv_separator=","))

    # --- Remote path prázdný — warning, ne error ---

    def test_empty_remote_path_allowed(self) -> None:
        """Prázdný remote_path = Remote záložka vždy nedostupná; není chyba konfigurace."""
        _validate_config(make_app_config(remote_path=""))  # žádná výjimka


# ======================================================================
# JsonFormatter — strukturované logování
# ======================================================================

class TestJsonFormatter:
    """
    JsonFormatter musí produkovat validní JSON se správnými poli.
    Ověřujeme formát výstupu — logika samotného logování není testována.
    """

    def _make_record(
        self,
        msg: str = "test zpráva",
        level: int = logging.INFO,
        name: str = "scada.test",
        exc_info=None,
    ) -> logging.LogRecord:
        record = logging.LogRecord(name, level, "", 0, msg, (), exc_info)
        return record

    def _fmt(self, record: logging.LogRecord) -> dict:
        from scada.logging_setup import JsonFormatter
        return json.loads(JsonFormatter().format(record))

    def test_output_is_valid_json(self) -> None:
        """Výstup musí být parsovatelný jako JSON."""
        from scada.logging_setup import JsonFormatter
        raw = JsonFormatter().format(self._make_record())
        json.loads(raw)  # nevyhodí výjimku = OK

    def test_required_fields_present(self) -> None:
        """Každý záznam musí mít ts, level, mod, msg."""
        entry = self._fmt(self._make_record())
        assert "ts"    in entry
        assert "level" in entry
        assert "mod"   in entry
        assert "msg"   in entry

    def test_msg_content(self) -> None:
        entry = self._fmt(self._make_record(msg="hello world"))
        assert entry["msg"] == "hello world"

    def test_level_name(self) -> None:
        entry = self._fmt(self._make_record(level=logging.WARNING))
        assert entry["level"] == "WARNING"

    def test_module_name(self) -> None:
        entry = self._fmt(self._make_record(name="scada.services.csv_reader"))
        assert entry["mod"] == "scada.services.csv_reader"

    def test_ts_is_iso_format(self) -> None:
        """ts musí být ISO 8601 (např. 2026-07-19T08:23:44+00:00)."""
        from datetime import datetime
        entry = self._fmt(self._make_record())
        # datetime.fromisoformat() hodí ValueError pokud formát není validní
        dt = datetime.fromisoformat(entry["ts"])
        assert dt.tzinfo is not None   # musí obsahovat timezone info (+00:00)

    def test_exc_field_present_on_exception(self) -> None:
        """Při výjimce musí být přítomno pole 'exc' s traceback textem."""
        try:
            raise ValueError("testovací výjimka")
        except ValueError:
            import sys
            record = self._make_record(exc_info=sys.exc_info())
        entry = self._fmt(record)
        assert "exc" in entry
        assert "ValueError" in entry["exc"]

    def test_no_exc_field_without_exception(self) -> None:
        """Bez výjimky pole 'exc' nesmí být přítomno."""
        entry = self._fmt(self._make_record())
        assert "exc" not in entry
