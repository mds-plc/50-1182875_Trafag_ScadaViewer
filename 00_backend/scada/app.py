"""
FastAPI aplikace — factory + lifespan.
"""
from __future__ import annotations

import base64
import hashlib
import logging
import mimetypes
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
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response


def _get_frontend_dist() -> Path:
    """Vrátí cestu k React buildu — funguje v dev módu i v PyInstaller exe."""
    if getattr(_sys, 'frozen', False):
        return Path(_sys._MEIPASS) / 'frontend_dist'
    return Path('01_frontend/dist')


_FRONTEND_DIST = _get_frontend_dist()

# Externé CDN zdroje povolené v CSP
_CSP_GOOGLE_FONTS_CSS = "https://fonts.googleapis.com"
_CSP_GOOGLE_FONTS_SRC = "https://fonts.gstatic.com"


def _build_csp(frontend_dist: Path) -> str:
    """
    Sestaví hodnotu hlavičky Content-Security-Policy.

    Inline skripty (anti-FOUC v index.html) nelze pokrýt 'self' — jsou bez src atributu.
    SHA-256 hash každého inline skriptu je výpočten z index.html a přidán do script-src.
    Pokud index.html neexistuje (dev mód bez buildu), script-src obsahuje jen 'self'.

    Direktivy:
      default-src 'self'          — vše ostatní jen ze stejného originu
      script-src  'self' 'sha256-…' — bundlovaný JS + inline anti-FOUC skript
      style-src   'self' 'unsafe-inline' fonts.googleapis.com
                                  — bundlované CSS + Recharts inline styly + Google Fonts CSS
      img-src     'self' data:    — PNG loga + případné data: URI obrázků
      connect-src 'self' ws: wss: — fetch + WebSocket (/ws/plc, /ws/orders) pro ws i wss
      font-src    'self' fonts.gstatic.com — bundlované fonty + Google Fonts
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
        f"style-src 'self' 'unsafe-inline' {_CSP_GOOGLE_FONTS_CSS}",
        "img-src 'self' data:",
        "connect-src 'self' ws: wss:",
        f"font-src 'self' {_CSP_GOOGLE_FONTS_SRC}",
        "frame-ancestors 'none'",
    ]
    return "; ".join(directives)


from scada.config import AppConfig, load_users
from scada.api import plc_ws, files, data, status, health, auth, config_api, orders_ws, wip, users_api
from scada.services.ads_monitor import AdsMonitor
from scada.services.file_service import FileService
from scada.services.order_watcher import OrderWatcher
from scada.services.repositories.csv_repository import CsvRepository
from scada.services.ws_manager import manager, orders_manager

log = logging.getLogger(__name__)


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
        # Whitelist: zdravotní endpointy nesmí být rate limitovány (NSSM watchdog)
        if request.url.path in ("/api/health", "/api/status"):
            return await call_next(request)

        ip  = request.client.host if request.client else "unknown"
        now = time.monotonic()
        cutoff = now - self._window

        # Odstraň záznamy mimo sliding window
        self._hits[ip] = [t for t in self._hits[ip] if t > cutoff]

        if len(self._hits[ip]) >= self._max:
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
    monitor       = AdsMonitor(cfg, manager)
    csv_reader    = FileService(CsvRepository(cfg.data))
    order_watcher = OrderWatcher(
        Path(cfg.data.local_path),
        orders_manager,
        csv_encoding=cfg.data.csv_encoding,
    )

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
            await order_watcher.start()
            yield
        finally:
            await order_watcher.stop()
            await monitor.stop()
            log.info("[APP]   ScadaViewer stop")

    app = FastAPI(title="ScadaViewer", version="0.1.0", lifespan=lifespan)

    # Middleware — starlette aplikuje v opačném pořadí přidání (LIFO):
    # požadavek projde: CORS → RateLimit → SecurityHeaders → router
    # odpověď projde:   router → SecurityHeaders → RateLimit → CORS
    app.add_middleware(_SecurityHeadersMiddleware, csp=_build_csp(_FRONTEND_DIST))
    app.add_middleware(_RateLimitMiddleware, max_per_minute=rate_limit)
    if cfg.server.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=cfg.server.cors_origins,
            allow_methods=["GET", "POST", "DELETE", "PATCH"],
            allow_headers=["Content-Type", "Authorization"],
            allow_credentials=False,
        )

    app.include_router(plc_ws.router,     prefix="/ws",  tags=["plc"])
    app.include_router(orders_ws.router,  prefix="/ws",  tags=["orders"])
    app.include_router(health.router,     prefix="/api", tags=["health"])
    app.include_router(auth.router,       prefix="/api", tags=["auth"])
    app.include_router(users_api.router,  prefix="/api", tags=["users"])
    app.include_router(config_api.router, prefix="/api", tags=["config"])
    app.include_router(files.router,      prefix="/api", tags=["files"])
    app.include_router(data.router,       prefix="/api", tags=["data"])
    app.include_router(status.router,     prefix="/api", tags=["status"])
    app.include_router(wip.router,        prefix="/api", tags=["wip"])

    # React frontend — automaticky aktivní pokud existuje build (Docker / produkce).
    # V dev módu (npm run dev na :5173) adresář dist/ neexistuje → přeskočeno.
    # StaticFiles musí být POSLEDNÍ — zachytí vše co neodpovídá routerům výše.
    if _FRONTEND_DIST.is_dir():
        log.info("[APP]   servírování frontendu z %s", _FRONTEND_DIST)
        app.mount("/", StaticFiles(directory=str(_FRONTEND_DIST), html=True), name="static")

    return app
