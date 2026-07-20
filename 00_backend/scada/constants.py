"""
ADS symboly pro monitoring.
TODO: Doplnit / ověřit dle GVL po definici PLC struktury.
"""

GVL_BASE = "GV_IO_ADS_API.DatabaseGateway"

SYM: dict[str, str] = {
    "in_heartbeat":      f"{GVL_BASE}.In.Status.Heartbeat",
    "in_ready":          f"{GVL_BASE}.In.Status.Ready",
    "in_local_storage":  f"{GVL_BASE}.In.Status.LocalStorage",
    "in_remote_storage": f"{GVL_BASE}.In.Status.RemoteStorage",
}
