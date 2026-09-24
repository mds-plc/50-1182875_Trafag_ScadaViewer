"""
FastAPI factory — sestavení instance aplikace, middleware a lifecycle services.

Účel: Jediné místo, kde se váže konfigurace, services a HTTP vrstva dohromady.
      create_app() vrátí plně nakonfigurovanou FastAPI instanci připravenou ke spuštění.

Zodpovědnost:
  - Inicializuje AdsMonitor a FileService při startu (lifespan).
  - Konfiguruje middleware stack: CORS → RateLimit → SecurityHeaders (LIFO pořadí Starlette).
  - Sestavuje CSP hlavičku: inline skripty z index.html se zahashují (SHA-256) a přidají
    do script-src — zabrání spuštění cizího JavaScriptu bez whitelistování.
  - Registruje všechny API routery pod /api a WS routery pod /ws.
  - Servíruje statický React build (01_frontend/dist/) pokud adresář existuje.

Rozhraní:
  create_app(cfg, rate_limit, config_path) → FastAPI
    cfg:         AppConfig načtený z Config.toml
    rate_limit:  max požadavků za minutu na IP (výchozí 120)
    config_path: cesta ke Config.toml; users.toml se hledá ve stejném adresáři

Napojení:
  Závisí na: config.AppConfig, services.{AdsMonitor, FileService, OrderWatcher},
             services.ws_manager.{manager, orders_manager}, všechny api/* routery
  Používáno: main.py (uvicorn.run(create_app(...)))
"""
from __future__ import annotations

import base64
import hashlib
import logging
import mimetypes
import os
import re
import sys as _sys
import time

# Windows registr občas mapuje .js jako text/plain — explicitně nastavit správné MIME typy.
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('application/javascript', '.mjs')
mimetypes.add_type('text/css', '.css')
from collections import defaultdict
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response


def _get_frontend_dist() -> Path:
    """Vrátí cestu k React buildu — funguje v dev módu i v PyInstaller exe."""
    if getattr(_sys, 'frozen', False):
        return Path(_sys._MEIPASS) / 'frontend_dist'
    return Path('01_frontend/dist')


_FRONTEND_DIST = _get_frontend_dist()

# Fonty jsou self-hosted (@fontsource) — žádné CDN zdroje nejsou potřeba.


def _build_csp(frontend_dist: Path) -> str:
    """
    Sestaví hodnotu hlavičky Content-Security-Policy.

    Inline skripty (anti-FOUC v index.html) nelze pokrýt 'self' — jsou bez src atributu.
    SHA-256 hash každého inline skriptu je výpočten z index.html a přidán do script-src.
    Pokud index.html neexistuje (dev mód bez buildu), script-src obsahuje jen 'self'.

    Direktivy:
      default-src 'self'          — vše ostatní jen ze stejného originu
      script-src  'self' 'sha256-…' — bundlovaný JS + inline anti-FOUC skript
      style-src   'self' 'unsafe-inline'
                                  — bundlované CSS + Recharts inline styly
      img-src     'self' data:    — PNG loga + případné data: URI obrázků
      connect-src 'self' ws: wss: — fetch + WebSocket (/ws/plc, /ws/orders) pro ws i wss
      font-src    'self'          — fonty jsou self-hosted (@fontsource, bundlovány Vitem)
      frame-ancestors 'none'      — zabrání vložení do iframe (doplňuje X-Frame-Options)
    """
    script_hashes: list[str] = []
    index_html = frontend_dist / "index.html"
    if index_html.exists():
        try:
            html = index_html.read_text(encoding="utf-8")
            # Inline skripty nemají atributy — zachytit jen <script>...</script> (ne type=module)
            for script_body in re.findall(r"<script>([\s\S]*?)</script>", html):
                digest = hashlib.sha256(script_body.encode("utf-8")).digest()
                script_hashes.append("'sha256-" + base64.b64encode(digest).decode() + "'")
        except OSError as exc:
            log.warning("[APP]   CSP: nelze číst index.html: %s", exc)

    script_src_extra = (" " + " ".join(script_hashes)) if script_hashes else ""

    directives = [
        "default-src 'self'",
        f"script-src 'self'{script_src_extra}",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "connect-src 'self' ws: wss:",
        "font-src 'self'",
        "frame-ancestors 'none'",
    ]
    return "; ".join(directives)


from scada.logging_setup import request_id_var
from scada.config import AppConfig, load_users
from scada.api import plc_ws, files, data, status, health, auth, config_api, users_api, signal
from scada.services.ads_monitor import AdsMonitor
from scada.services.file_service import FileService
from scada.services.io_pool import NasBusyError
from scada.services.repositories.csv_repository import CsvRepository
from scada.services.ws_manager import manager

log = logging.getLogger(__name__)


class _RequestIdMiddleware(BaseHTTPMiddleware):
    """
    Přiřadí každému HTTP požadavku krátké unikátní ID (4 hex znaky).

    PROČ:
      Při paralelních požadavcích (3 záložky, auto-refresh + manuální akce) nelze
      v logách poznat, který záznam patří ke kterému požadavku. Request ID řeší
      korelaci — všechny logy jednoho požadavku sdílejí stejné "rid" pole.

    MECHANISMUS:
      contextvars.ContextVar — automaticky propaguje přes async/await volání.
      Všechny logy z API, service i repository vrstvy dostanou rid bez změn v kódu.
      ID se vrací i v response headeru X-Request-ID pro debugging z DevTools.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        rid = os.urandom(2).hex()          # 4 hex znaky, 65 536 kombinací
        request_id_var.set(rid)
        response = await call_next(request)
        response.headers["X-Request-ID"] = rid
        return response


class _SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Přidá bezpečnostní HTTP hlavičky ke každé odpovědi.

    PROČ:
      Content-Security-Policy (CSP)
        Zabrání XSS útokům — prohlížeč spustí jen skripty ze schválených zdrojů.
        Inline skripty jsou povoleny pouze přes SHA-256 hash (anti-FOUC skript).

      X-Frame-Options: DENY
        Starší prohlížeče bez podpory frame-ancestors — záložní ochrana proti clickjacking.

      X-Content-Type-Options: nosniff
        Zakáže prohlížeči hádat MIME typ (content sniffing).
        Bez této hlavičky může prohlížeč interpretovat CSV export jako HTML.

      Referrer-Policy: strict-origin-when-cross-origin
        Při přechodu na jinou doménu pošle jen origin (ne celou URL včetně
        query parametrů). Chrání případné tokeny nebo ID zakázek v URL.

    PARAMETRY:
      csp: předpočítaná hodnota Content-Security-Policy; prázdný řetězec = CSP nepřidat
           (výchozí pro testy nebo dev mód bez buildu).
    """

    def __init__(self, app, csp: str = "") -> None:
        super().__init__(app)
        self._csp = csp

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        if self._csp:
            response.headers["Content-Security-Policy"] = self._csp
        response.headers["X-Frame-Options"]        = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"]        = "strict-origin-when-cross-origin"
        # Vite assety mají hash v názvu (index-CV00pAay.js) → obsah se pod stejnou URL nikdy
        # nezmění; prohlížeč je může držet natrvalo bez revalidace (žádné 304 kolečko).
        # index.html hash nemá → vždy revalidovat, aby se nový build projevil okamžitě.
        path = request.url.path
        if path.startswith("/assets/") and response.status_code == 200:
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        elif not path.startswith(("/api/", "/ws/")):
            response.headers.setdefault("Cache-Control", "no-cache")
        return response


class _RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Sliding-window rate limiter — bez externí závislosti.

    PROČ:
      Bez limitu může chybný klient (bug v kódu, runaway skript) zahlcovat
      API stovkami požadavků za sekundu a způsobit DoS na lokálním stroji.
      Typický scénář: zapomenutý `while True: fetch(...)` ve skriptu kolegy.
      Na lokální intranet síti není hrozba útočník, ale neopatrný vývojář.

    ALGORITMUS — sliding window:
      Pro každou IP adresu udržujeme seznam časových razítek požadavků
      v posledních `window_seconds` sekundách.
      Při každém požadavku:
        1. Odstraníme záznamy starší než okno
        2. Pokud zbývá >= max_per_window požadavků → vrátíme HTTP 429
        3. Jinak přidáme aktuální čas a pokračujeme

      Výhoda oproti fixed window: není reset každou minutu na 0 (burst protection).

    LIMITY (výchozí 120/min):
      - Jeden uživatel, 3 záložky, auto-refresh 30s → ~6 req/min (20× pod limitem)
      - NSSM watchdog /api/health každých 10s → 6 req/min
      - Runaway skript → hit limit po 120 req/min → 429, log varování

    JAK ROZŠÍŘIT:
      - Změnit limit: `create_app(cfg, rate_limit=200)` (parametr továrny)
      - Whitelist: přidat podmínku `if ip in WHITELIST: return await call_next(request)`
      - Různé limity per endpoint: nastavit X-Rate-Limit-Override hlavičku
        v endpointu a přečíst ji zde (ale to komplikuje kód bez velké potřeby)
    """

    def __init__(self, app, max_per_minute: int = 120) -> None:
        super().__init__(app)
        self._max    = max_per_minute
        self._window = 60.0                                    # sekund
        self._hits: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next) -> Response:
        # Limitujeme jen API — statické assety (JS chunky, fonty, obrázky) se do limitu
        # nepočítají, jinak by jedno načtení SPA spotřebovalo desítky požadavků.
        # Whitelist: zdravotní endpointy nesmí být rate limitovány (NSSM watchdog)
        path = request.url.path
        if not path.startswith("/api/") or path in ("/api/health", "/api/status"):
            return await call_next(request)

        ip  = request.client.host if request.client else "unknown"
        now = time.monotonic()
        cutoff = now - self._window

        # Odstraň záznamy mimo sliding window; prázdné záznamy smaž (GC — dict neroste)
        pruned = [t for t in self._hits.pop(ip, []) if t > cutoff]
        if pruned:
            self._hits[ip] = pruned

        if len(self._hits.get(ip, [])) >= self._max:
            log.warning(
                "[APP]   rate limit překročen: %s (%d req/min, max %d)",
                ip, len(self._hits[ip]), self._max,
            )
            return JSONResponse(
                status_code=429,
                content={"detail": "Příliš mnoho požadavků. Zkuste prosím za chvíli."},
                headers={"Retry-After": str(int(self._window))},
            )

        self._hits[ip].append(now)
        return await call_next(request)


def create_app(cfg: AppConfig, rate_limit: int = 120, config_path: Path | None = None) -> FastAPI:
    """
    Vytvoří FastAPI aplikaci.

    Args:
        cfg:         Konfigurace aplikace (načtená z Config.toml).
        rate_limit:  Max požadavků za minutu na IP. Výchozí 120.
        config_path: Cesta ke Config.toml; users.toml se hledá ve stejném adresáři.
    """
    monitor    = AdsMonitor(cfg, manager)
    csv_reader = FileService(CsvRepository(cfg.data))

    users_path = config_path.parent / "users.toml" if config_path else None

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.csv_reader   = csv_reader
        app.state.monitor      = monitor
        app.state.config       = cfg
        app.state.config_path  = config_path   # pro zápis Config.toml
        app.state.users_path   = users_path    # pro zápis users.toml
        app.state.users        = load_users(users_path, cfg.auth)
        app.state.sessions: dict[str, dict] = {}   # token → {username, role, display_name}
        log.info("[APP]   ScadaViewer start")
        try:
            await monitor.start()
            yield
        finally:
            await monitor.stop()
            log.info("[APP]   ScadaViewer stop")

    app = FastAPI(title="ScadaViewer", version="0.1.0", lifespan=lifespan)

    # Middleware — starlette aplikuje v opačném pořadí přidání (LIFO):
    # požadavek projde: CORS → GZip → RateLimit → RequestId → SecurityHeaders → router
    # odpověď projde:   router → SecurityHeaders → RequestId → RateLimit → GZip → CORS
    app.add_middleware(_SecurityHeadersMiddleware, csp=_build_csp(_FRONTEND_DIST))
    app.add_middleware(_RequestIdMiddleware)
    app.add_middleware(_RateLimitMiddleware, max_per_minute=rate_limit)
    # GZip — JSON odpovědi (/api/data, /api/signal ~190 kB) a JS/CSS bundle jsou dobře
    # komprimovatelné (typicky 5–10×). Přidáno až po ostatních → nejvíc vně (komprimuje finální tělo).
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    if cfg.server.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=cfg.server.cors_origins,
            allow_methods=["GET", "POST", "DELETE", "PATCH"],
            allow_headers=["Content-Type", "Authorization"],
            allow_credentials=False,
        )

    @app.exception_handler(NasBusyError)
    async def _nas_busy(_request: Request, exc: NasBusyError) -> JSONResponse:
        # Všechna NAS vlákna visí na nedostupném NAS → okamžitě 503, žádné čekání
        log.warning("[APP]   %s", exc)
        return JSONResponse(status_code=503, content={"detail": "Vzdálené úložiště (NAS) nereaguje — zkuste později."})

    app.include_router(plc_ws.router,     prefix="/ws",  tags=["plc"])
    app.include_router(health.router,     prefix="/api", tags=["health"])
    app.include_router(auth.router,       prefix="/api", tags=["auth"])
    app.include_router(users_api.router,  prefix="/api", tags=["users"])
    app.include_router(config_api.router, prefix="/api", tags=["config"])
    app.include_router(files.router,      prefix="/api", tags=["files"])
    app.include_router(data.router,       prefix="/api", tags=["data"])
    app.include_router(status.router,     prefix="/api", tags=["status"])
    app.include_router(signal.router,    prefix="/api", tags=["signal"])

    # React frontend — automaticky aktivní pokud existuje build (Docker / produkce).
    # V dev módu (npm run dev na :5173) adresář dist/ neexistuje → přeskočeno.
    # StaticFiles musí být POSLEDNÍ — zachytí vše co neodpovídá routerům výše.
    if _FRONTEND_DIST.is_dir():
        log.info("[APP]   servírování frontendu z %s", _FRONTEND_DIST)
        app.mount("/", StaticFiles(directory=str(_FRONTEND_DIST), html=True), name="static")

    return app
