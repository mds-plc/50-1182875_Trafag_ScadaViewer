"""
FastAPI aplikace — factory + lifespan.
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

# Cesta k frontend build (relativní k working directory — vždy kořen projektu)
_FRONTEND_DIST = Path("01_frontend/dist")

from scada.config import AppConfig
from scada.api import plc_ws, files, data, status, health, auth, config_api
from scada.services.ads_monitor import AdsMonitor
from scada.services.file_service import FileService
from scada.services.repositories.csv_repository import CsvRepository
from scada.services.ws_manager import manager

log = logging.getLogger(__name__)


class _SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Přidá bezpečnostní HTTP hlavičky ke každé odpovědi.

    PROČ:
      X-Frame-Options: DENY
        Zabrání vložení aplikace do <iframe> na cizí stránce (clickjacking).
        Útočník by jinak mohl překrýt UI a zmást operátora.

      X-Content-Type-Options: nosniff
        Zakáže prohlížeči hádat MIME typ (content sniffing).
        Bez této hlavičky může prohlížeč interpretovat CSV export jako HTML
        a spustit případný škodlivý obsah v datovém souboru.

      Referrer-Policy: strict-origin-when-cross-origin
        Při přechodu na jinou doménu pošle jen origin (ne celou URL včetně
        query parametrů). Chrání případné tokeny nebo ID zakázek v URL.

    ROZSAH:
      Platí pro všechny HTTP odpovědi (API + statické soubory).
      WebSocket upgrade request je transparentně propuštěn beze změny.

    JAK ROZŠÍŘIT:
      Přidat další hlavičky přímo do metody dispatch:
        response.headers["Permissions-Policy"] = "camera=(), microphone=()"
      Pro Content-Security-Policy (CSP) je potřeba nejprve zmapovat
      všechny zdroje skriptů, stylů a fontů ve frontend buildu.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
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
        cfg:        Konfigurace aplikace (načtená z Config.toml).
        rate_limit: Max požadavků za minutu na IP. Výchozí 120.
                    Pro testy předat nízkou hodnotu (např. 3) pro rychlé
                    otestování chování při překročení limitu.
    """
    monitor    = AdsMonitor(cfg, manager)
    csv_reader = FileService(CsvRepository(cfg.data))

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.csv_reader   = csv_reader
        app.state.monitor      = monitor
        app.state.config       = cfg
        app.state.config_path  = config_path   # pro change-password (zápis do souboru)
        app.state.sessions: set[str] = set()   # in-memory session tokeny
        log.info("[APP]   ScadaViewer start")
        try:
            await monitor.start()
            yield
        finally:
            await monitor.stop()
            log.info("[APP]   ScadaViewer stop")

    app = FastAPI(title="ScadaViewer", version="0.1.0", lifespan=lifespan)

    # Middleware — starlette aplikuje v opačném pořadí přidání (LIFO):
    # požadavek projde: CORS → RateLimit → SecurityHeaders → router
    # odpověď projde:   router → SecurityHeaders → RateLimit → CORS
    app.add_middleware(_SecurityHeadersMiddleware)
    app.add_middleware(_RateLimitMiddleware, max_per_minute=rate_limit)
    if cfg.server.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=cfg.server.cors_origins,
            allow_methods=["GET", "POST", "DELETE", "PATCH"],
            allow_headers=["Content-Type"],
            allow_credentials=False,
        )

    app.include_router(plc_ws.router,     prefix="/ws",  tags=["plc"])
    app.include_router(health.router,     prefix="/api", tags=["health"])
    app.include_router(auth.router,       prefix="/api", tags=["auth"])
    app.include_router(config_api.router, prefix="/api", tags=["config"])
    app.include_router(files.router,      prefix="/api", tags=["files"])
    app.include_router(data.router,       prefix="/api", tags=["data"])
    app.include_router(status.router,     prefix="/api", tags=["status"])

    # React frontend — automaticky aktivní pokud existuje build (Docker / produkce).
    # V dev módu (npm run dev na :5173) adresář dist/ neexistuje → přeskočeno.
    # StaticFiles musí být POSLEDNÍ — zachytí vše co neodpovídá routerům výše.
    if _FRONTEND_DIST.is_dir():
        log.info("[APP]   servírování frontendu z %s", _FRONTEND_DIST)
        app.mount("/", StaticFiles(directory=str(_FRONTEND_DIST), html=True), name="static")

    return app
