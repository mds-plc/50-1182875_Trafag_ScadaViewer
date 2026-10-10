"""
Změří odezvy běžícího ScadaViewer přes HTTP (jen čtení — nic nemaže ani nemění).

Měří: výpis Databáze (lokální / NAS), dobu dopočtu počtů kusů na stránce, otevření detailu
zakázky, další stránku, filtr NOK, časový průběh a XLSX. Výsledky do konzole — zapsat do
tabulky v `04_docs/acceptance_test.md` (4. Zátěž objemem dat).

Pozor na limit 120 požadavků / min na IP — skript dělá jen desítky požadavků.

Použití:
  python measure_api.py --url http://localhost:8080 --user <jméno> --password <heslo>
                        [--location local|remote] [--from 2020-01-01] [--orders 5]
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.parse
import urllib.request


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default="http://localhost:8080")
    ap.add_argument("--user", required=True)
    ap.add_argument("--password", required=True)
    ap.add_argument("--location", default="local", choices=("local", "remote"))
    ap.add_argument("--from", dest="date_from", default="2020-01-01")
    ap.add_argument("--orders", type=int, default=5, help="kolik zakázek otevřít")
    a = ap.parse_args()
    base = a.url.rstrip("/")

    req = urllib.request.Request(base + "/api/auth/login", headers={"Content-Type": "application/json"},
                                 data=json.dumps({"username": a.user, "password": a.password}).encode())
    token = json.load(urllib.request.urlopen(req))["token"]

    def get(path: str, **params):
        url = f"{base}{path}?{urllib.parse.urlencode(params)}"
        t0 = time.perf_counter()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"}),
                                        timeout=180) as r:
                body, code = r.read(), r.status
        except urllib.error.HTTPError as e:
            body, code = e.read(), e.code
        return time.perf_counter() - t0, code, body

    q = dict(location=a.location, type="production", page=1, per_page=50, **{"from": a.date_from})
    dt, code, body = get("/api/files", **q)
    if code != 200:
        raise SystemExit(f"/api/files HTTP {code}: {body[:200]!r}")
    j = json.loads(body)
    print(f"Databáze ({a.location}), výpis:          {dt:6.2f} s   souborů {j['total']}")
    t0 = time.perf_counter()
    while j.get("counts_pending") and time.perf_counter() - t0 < 600:
        time.sleep(1.5)
        j = json.loads(get("/api/files", **q)[2])
    print(f"počty kusů na 1. stránce hotové za:  {time.perf_counter() - t0:6.1f} s")
    dt, _, _ = get("/api/files", **q)
    print(f"Databáze, opakovaný výpis:           {dt:6.2f} s")

    for f in [x["file_id"] for x in j["files"]][: a.orders]:
        b = dict(file=f, location=a.location, type="production", per_page=200)
        t1, c1, body = get("/api/data", page=1, **b)
        total = json.loads(body).get("total") if c1 == 200 else "?"
        t2, _, _ = get("/api/data", page=2, **b)
        t3, _, _ = get("/api/data", page=1, status="nok", **b)
        print(f"  {f[:40]:40s} kusů {total!s:>7}  otevření {t1:5.2f} s | další stránka {t2:5.2f} s | NOK {t3:5.2f} s")

    if j["files"]:
        f = j["files"][0]["file_id"]
        dt, code, _ = get("/api/timeline", file=f, location=a.location, type="production")
        print(f"časový průběh:                       {dt:6.2f} s   HTTP {code}")
        dt, code, body = get(f"/api/files/{urllib.parse.quote(f)}/xlsx", location=a.location, type="production")
        print(f"XLSX:                                {dt:6.2f} s   HTTP {code}  {len(body) / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
