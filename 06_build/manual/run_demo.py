"""Ukázkový server pro screenshoty manuálu — srv/Config.toml (fiktivní ADS net_id, port 8099, data demo/).

Navíc oproti `main.py`:
  - atrapa flashky „TRAFAG_USB“ (E:) → složka demo/usb (ukazatel USB, uložení, hromadné stažení);
  - stav času / NTP jako na PC u stroje (ne údaje počítače, na kterém se manuál generuje — IP adresy apod.).
NIKDY s reálným Config.toml — připojil by se k PLC a zapisoval heartbeat.
"""
from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "00_backend"))
os.chdir(HERE.parents[1])                    # create_app hledá 01_frontend/dist relativně

import uvicorn                                                     # noqa: E402

from scada.app import create_app                                   # noqa: E402
from scada.config import load_config                               # noqa: E402
from scada.services import time_service, usb_service               # noqa: E402

USB = HERE / "demo" / "usb"
shutil.rmtree(USB, ignore_errors=True)
USB.mkdir(parents=True)
usb_service.list_drives = lambda: [usb_service.UsbDrive("E", "TRAFAG_USB", 16_013_942_784, 15_212_000_000)]
usb_service.drive_root = lambda letter: USB
usb_service.eject = lambda letter: None

_real_status = time_service.time_status


def _machine_time_status() -> dict:
    st = _real_status()
    st.update({
        "supported": True, "service_state": "running", "service_start": "auto",
        "ntp_server_enabled": True, "ntp_client_enabled": True, "announce_flags": 5, "announce": "reliable",
        "sync_type": "NoSync", "configured_peers": "", "source": "Local CMOS Clock", "stratum": 1,
        "synchronized": True, "last_sync": None, "poll_interval": "6 (64s)", "udp123_listening": True,
        "addresses": ["192.168.100.10", "10.45.124.31"],
        "status_text": ("Leap Indicator: 0(no warning)\nStratum: 1 (primary reference - syncd by radio clock)\n"
                        "Precision: -23 (119.209ns per tick)\nRoot Delay: 0.0000000s\nRoot Dispersion: 10.0000000s\n"
                        "ReferenceId: 0x4C4F434C (source name:  \"LOCL\")\nSource: Local CMOS Clock\n"
                        "Poll Interval: 6 (64s)\n"),
    })
    return st


time_service.time_status = _machine_time_status

# zaplnění NAS jako sdílená složka s kvótou 4 TiB (ne disk počítače, na kterém se manuál generuje)
import scada.api.storage as storage_api                           # noqa: E402

_NAS_TOTAL, _NAS_USED = 4 * 1024**4, int(1.52 * 1024**4)
storage_api.nas_usage = lambda cfg: {
    "available": True, "total_bytes": _NAS_TOTAL, "used_bytes": _NAS_USED, "free_bytes": _NAS_TOTAL - _NAS_USED,
    "percent": round(_NAS_USED / _NAS_TOTAL * 100, 1), "level": "ok"}
time_service.IS_WINDOWS = True

cfg_path = HERE / "srv" / "Config.toml"
app = create_app(load_config(cfg_path), config_path=cfg_path)
uvicorn.run(app, host="127.0.0.1", port=8099, ws="wsproto", log_level="warning", proxy_headers=False)
