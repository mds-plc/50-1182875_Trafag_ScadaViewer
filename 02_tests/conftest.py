"""
Sdílené pytest fixtures.

_offline_ads_monitor (autouse):
  create_app() by jinak spustil skutečný AdsMonitor → pyads se pokusí připojit na testovací
  AMS Net ID. Doba selhání závisí na stavu lokálního TwinCAT ADS routeru (okamžitě vs. 2 s
  timeout) a TestClient při ukončení na vlákno s pokusem čeká → testy byly nedeterministicky
  pomalé (6 s vs. 4 min). API testy ADS nepotřebují; AdsMonitor testuje test_ads_monitor.py
  s mockovaným pyads (importuje třídu přímo ze services, této náhrady se netýká).
"""
from __future__ import annotations

import pytest


class _OfflineAdsMonitor:
    """Náhrada AdsMonitor pro API testy — nikdy se nepřipojuje, rozhraní shodné pro app.state."""

    def __init__(self, cfg, ws_manager) -> None:
        self.current_values: dict[str, bool | int | str] = {}

    @property
    def connected(self) -> bool:
        return False

    async def start(self) -> None:
        return None

    async def stop(self) -> None:
        return None


@pytest.fixture(autouse=True)
def _offline_ads_monitor(monkeypatch):
    import scada.app
    monkeypatch.setattr(scada.app, "AdsMonitor", _OfflineAdsMonitor)
