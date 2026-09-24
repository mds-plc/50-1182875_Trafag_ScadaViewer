"""
WebSocket endpoint pro live PLC hodnoty (/ws/plc).

Účel: Umožní prohlížeči přijímat real-time PLC data bez pollingu — server pushuje
      každou změnu ADS notifikace okamžitě všem připojeným klientům.

Zodpovědnost:
  - Přijme WS připojení, ověří origin a deleguje na ConnectionManager (manager singleton).
  - Drží spojení otevřené (receive_text loop) a korektně detekuje WebSocketDisconnect.
  - Provede origin check: odmítne připojení (code 1008) pokud origin není v cors_origins
    (ledaže cors_origins je prázdný nebo obsahuje "*" — dev mód).
  - Neparsuje ani negeneruje zprávy — to je zodpovědnost AdsMonitor a ws_manager.

Bezpečnost — PŘIJATÉ RIZIKO (audit 2026-09-24, M14, rozhodnutí: varianta B):
  Endpoint záměrně NEVYŽADUJE přihlášení. PLC auto-login (AuthContext) čte příznak
  plc_operator_login právě z tohoto WS ještě PŘED přihlášením — token by auto-login rozbil.
  Riziko je přijatelné: data jsou read-only (stav stroje, zakázka, boxy — žádná hesla ani
  výrobní data), zápis do PLC přes WS neexistuje a aplikace běží v uzavřeném intranetu.
  Pokud by se aplikace otevírala mimo intranet, přejít na variantu A: před přihlášením
  posílat jen ads_status + plc_operator_login, ostatní symboly až s platným tokenem.

Rozhraní:
  WebSocket /ws/plc
    server → klient: {"symbol": "mode", "value": 2, "ts": "2026-07-17T10:00:00+00:00"}
    server → klient: {"type": "ads_status", "connected": true}
    klient → server: libovolný text (ping/keep-alive, ignorováno)

Napojení:
  Závisí na: services/ws_manager.manager (singleton ConnectionManager)
  Broadcastováno z: services/ads_monitor.py přes ws_manager.broadcast()
  Konzumováno z: frontend context/PlcContext.tsx (WS klient s exponential backoff reconnect)
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from scada.services.ws_manager import manager

log = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/plc")
async def plc_websocket(websocket: WebSocket) -> None:
    """
    WebSocket endpoint pro live PLC hodnoty (/ws/plc).

    Server broadcastuje JSON zprávy při každé změně ADS notifikace:
      {"symbol": "in_ready", "value": true, "ts": "2026-07-17T10:00:00+00:00"}
    Při změně stavu ADS připojení:
      {"type": "ads_status", "connected": true}

    Origin check: odmítne (code 1008 – Policy Violation) pokud origin není
    v server.cors_origins, ledaže cors_origins je prázdný nebo obsahuje "*".
    """
    origin  = websocket.headers.get("origin", "")
    allowed = websocket.app.state.config.server.cors_origins
    if allowed and "*" not in allowed and origin and origin not in allowed:
        await websocket.close(code=1008)
        log.warning("[WS]    odmítnuto WS /plc z origin: %s", origin)
        return
    await manager.connect(websocket)
    try:
        while True:
            # Čekáme na zprávy od klienta (ping / keep-alive)
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        # i při jiné výjimce (RuntimeError, síťová chyba) — jinak mrtvý socket zůstane v registru
        manager.disconnect(websocket)
