"""
ADS Monitor — unit testy s mockovaným pyads.

Testy nevyžadují reálné PLC ani ADS router — pyads.Connection je nahrazen
unittest.mock.MagicMock přes @patch decorator.

Pokrytí:
  T1 — initial state (connected=False, current_values={})
  T2 — stop() nezpůsobí chybu pokud monitor nebyl spuštěn
  T3 — current_values lze přímo nastavit a číst (dict access)
  T4 — _decode_raw() správně dekóduje BOOL, INT, UINT, DINT, STRING
  T5 — _decode_read() správně zpracuje Python primitivy (bool, int, str)
  T6 — batch-delete endpoint — testováno v test_api.py (ApiTest*)
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Zajistí, že backend package je v sys.path
sys.path.insert(0, str(Path(__file__).parent.parent / "00_backend"))

import pyads  # noqa: E402
from scada.config import AppConfig, AdsConfig, AuthConfig, DataConfig, ServerConfig
from scada.services.ads_monitor import AdsMonitor, _decode_raw, _decode_read
from scada.services.ws_manager import ConnectionManager


# ======================================================================
# Fixtures
# ======================================================================

@pytest.fixture
def cfg(tmp_path: Path) -> AppConfig:
    """Testovací AppConfig — net_id bez reálného PLC."""
    return AppConfig(
        server=ServerConfig(host="127.0.0.1", port=8080, cors_origins=[]),
        ads=AdsConfig(net_id="1.2.3.4.1.1", port=851),
        data=DataConfig(
            local_path=tmp_path,
            remote_path="",
            csv_separator=";",
            csv_encoding="utf-8-sig",
        ),
        auth=AuthConfig(username="admin", password_hash=""),
    )


@pytest.fixture
def ws_manager() -> MagicMock:
    """Mock ConnectionManager — broadcast je AsyncMock."""
    mgr = MagicMock(spec=ConnectionManager)
    mgr.broadcast = AsyncMock()
    return mgr


# ======================================================================
# T1 — Výchozí stav (bez připojení)
# ======================================================================

class TestAdsMonitorInitialState:
    def test_connected_is_false(self, cfg: AppConfig, ws_manager: MagicMock) -> None:
        """connected property je False bez volání start()."""
        monitor = AdsMonitor(cfg, ws_manager)
        assert monitor.connected is False

    def test_current_values_empty(self, cfg: AppConfig, ws_manager: MagicMock) -> None:
        """current_values je prázdný dict při inicializaci."""
        monitor = AdsMonitor(cfg, ws_manager)
        assert monitor.current_values == {}

    def test_reconnect_task_none(self, cfg: AppConfig, ws_manager: MagicMock) -> None:
        """_reconnect_task není nastaven před start()."""
        monitor = AdsMonitor(cfg, ws_manager)
        assert monitor._reconnect_task is None


# ======================================================================
# T2 — stop() bez předchozího start()
# ======================================================================

class TestAdsMonitorStopWithoutStart:
    def test_stop_without_start_is_safe(self, cfg: AppConfig, ws_manager: MagicMock) -> None:
        """stop() bez start() nezpůsobí výjimku."""
        monitor = AdsMonitor(cfg, ws_manager)
        # Nemělo by vyhodit výjimku
        asyncio.run(monitor.stop())
        # Broadcast nebyl nikdy zavolán
        ws_manager.broadcast.assert_not_called()


# ======================================================================
# T3 — current_values jako sdílená cache
# ======================================================================

class TestCurrentValues:
    def test_direct_assignment_and_read(self, cfg: AppConfig, ws_manager: MagicMock) -> None:
        """current_values lze nastavit přímo (simulace callbacku) a číst z endpointů."""
        monitor = AdsMonitor(cfg, ws_manager)
        monitor.current_values["in_ready"] = True
        monitor.current_values["mode"] = 3

        assert monitor.current_values["in_ready"] is True
        assert monitor.current_values["mode"] == 3

    def test_clear_on_disconnect(self, cfg: AppConfig, ws_manager: MagicMock) -> None:
        """_disconnect() vymaže current_values pokud je spojení aktivní."""
        monitor = AdsMonitor(cfg, ws_manager)
        monitor.current_values["in_ready"] = True
        # Nastavit _plc na mock — _disconnect() pak nezastaví na "if self._plc is None"
        monitor._plc = MagicMock()
        monitor._disconnect()
        assert monitor.current_values == {}


# ======================================================================
# T4 — _decode_raw(): raw bytes → Python hodnota
# ======================================================================

class TestDecodeRaw:
    def test_bool_true(self) -> None:
        assert _decode_raw(b"\x01", pyads.PLCTYPE_BOOL) is True

    def test_bool_false(self) -> None:
        assert _decode_raw(b"\x00", pyads.PLCTYPE_BOOL) is False

    def test_bool_empty(self) -> None:
        assert _decode_raw(b"", pyads.PLCTYPE_BOOL) is False

    def test_int_positive(self) -> None:
        # 1000 = 0x03E8 little-endian
        assert _decode_raw(b"\xe8\x03", pyads.PLCTYPE_INT) == 1000

    def test_int_negative(self) -> None:
        # -1 = 0xFFFF little-endian (signed)
        assert _decode_raw(b"\xff\xff", pyads.PLCTYPE_INT) == -1

    def test_uint(self) -> None:
        # 65535 = 0xFFFF little-endian (unsigned)
        assert _decode_raw(b"\xff\xff", pyads.PLCTYPE_UINT) == 65535

    def test_dint(self) -> None:
        # 100000 = 0x000186A0 little-endian
        assert _decode_raw(b"\xa0\x86\x01\x00", pyads.PLCTYPE_DINT) == 100000

    def test_string(self) -> None:
        raw = b"Hello\x00" + b"\x00" * 10
        result = _decode_raw(raw, pyads.PLCTYPE_STRING)
        assert result == "Hello"

    def test_string_empty(self) -> None:
        raw = b"\x00" * 5
        result = _decode_raw(raw, pyads.PLCTYPE_STRING)
        assert result == ""

    def test_fallback_type(self) -> None:
        """Neznámý typ — fallback na BOOL."""
        result = _decode_raw(b"\x01", object)  # type: ignore[arg-type]
        assert result is True


# ======================================================================
# T5 — _decode_read(): Python primitivy z read_by_name()
# ======================================================================

class TestDecodeRead:
    def test_bool_true(self) -> None:
        assert _decode_read(True, pyads.PLCTYPE_BOOL) is True

    def test_bool_false(self) -> None:
        assert _decode_read(False, pyads.PLCTYPE_BOOL) is False

    def test_int(self) -> None:
        assert _decode_read(42, pyads.PLCTYPE_INT) == 42

    def test_string_strips_nulls(self) -> None:
        result = _decode_read("Hello\x00\x00", pyads.PLCTYPE_STRING)
        assert result == "Hello"

    def test_string_strips_whitespace(self) -> None:
        result = _decode_read("  test  \x00", pyads.PLCTYPE_STRING)
        assert result == "test"

    def test_bytes_fallback(self) -> None:
        result = _decode_read(b"\x01", pyads.PLCTYPE_BOOL)
        assert result is True

    def test_unknown_type_bool(self) -> None:
        """Neznámá Python hodnota — bool(raw)."""
        result = _decode_read(1, pyads.PLCTYPE_BOOL)
        assert result == 1  # int prochází přímo


# ======================================================================
# T6 — _connect() s mockovaným pyads (zaregistruje notifikace)
#
# Testujeme _connect() přímo v asyncio.to_thread() (což přesně odpovídá
# tomu, jak ho volá _reconnect_loop). Tím se vyhneme timing problémům
# spojeným s full start() → reconnect loop → heartbeat loop flow.
# ======================================================================

class TestAdsMonitorConnectMocked:
    @patch('pyads.Connection')
    def test_connect_opens_plc(self, mock_cls: MagicMock, cfg: AppConfig, ws_manager: MagicMock) -> None:
        """
        _connect() zavolá open() na pyads.Connection.
        """
        mock_conn = MagicMock()
        mock_conn.read_by_name.return_value = False
        mock_cls.return_value = mock_conn

        monitor = AdsMonitor(cfg, ws_manager)

        async def run() -> None:
            monitor._loop = asyncio.get_running_loop()
            await asyncio.to_thread(monitor._connect)

        asyncio.run(run())

        mock_conn.open.assert_called_once()

    @patch('pyads.Connection')
    def test_connect_registers_notifications(self, mock_cls: MagicMock, cfg: AppConfig, ws_manager: MagicMock) -> None:
        """
        _connect() registruje notifikace pro každý symbol ze SYM dict.
        """
        from scada.constants import SYM
        mock_conn = MagicMock()
        mock_conn.read_by_name.return_value = False
        mock_cls.return_value = mock_conn

        monitor = AdsMonitor(cfg, ws_manager)

        async def run() -> None:
            monitor._loop = asyncio.get_running_loop()
            await asyncio.to_thread(monitor._connect)

        asyncio.run(run())

        assert mock_conn.add_device_notification.call_count == len(SYM)

    @patch('pyads.Connection')
    def test_connect_sets_connected(self, mock_cls: MagicMock, cfg: AppConfig, ws_manager: MagicMock) -> None:
        """
        Po _connect() je monitor.connected True (self._plc není None).
        """
        mock_conn = MagicMock()
        mock_conn.read_by_name.return_value = False
        mock_cls.return_value = mock_conn

        monitor = AdsMonitor(cfg, ws_manager)

        async def run() -> None:
            monitor._loop = asyncio.get_running_loop()
            await asyncio.to_thread(monitor._connect)

        asyncio.run(run())

        assert monitor.connected is True

    @patch('pyads.Connection')
    def test_disconnect_closes_connection(self, mock_cls: MagicMock, cfg: AppConfig, ws_manager: MagicMock) -> None:
        """
        _disconnect() zavolá close() a monitor.connected je False.
        """
        mock_conn = MagicMock()
        mock_conn.read_by_name.return_value = False
        mock_cls.return_value = mock_conn

        monitor = AdsMonitor(cfg, ws_manager)

        async def run() -> None:
            monitor._loop = asyncio.get_running_loop()
            await asyncio.to_thread(monitor._connect)
            monitor._disconnect()

        asyncio.run(run())

        mock_conn.close.assert_called_once()
        assert monitor.connected is False
