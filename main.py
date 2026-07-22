"""
ScadaViewer — entry point
Spuštění: python main.py --config Config.toml
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

# Přidej 00_backend/ do Python path (obsahuje balíček scada/)
sys.path.insert(0, str(Path(__file__).parent / "00_backend"))

import uvicorn

log = logging.getLogger(__name__)


def main() -> None:
    """
    Entry point — parsuje CLI argumenty, načte konfiguraci a spustí uvicorn server.

    CLI argumenty:
      --config PATH   cesta ke konfiguračnímu souboru TOML (výchozí: Config.toml)
      --debug         zapne DEBUG loglevel a podrobné uvicorn výstupy

    Při chybě konfigurace (soubor nenalezen, chybný klíč) vypíše srozumitelnou
    zprávu na stderr a ukončí proces kódem 1.
    """
    parser = argparse.ArgumentParser(description="ScadaViewer")
    parser.add_argument("--config", default="Config.toml")
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    # Import až po parsování — umožňuje error při chybném config
    from scada.config import load_config
    from scada.app import create_app
    from scada.logging_setup import setup_logging

    # JSON logování pro scada.* logger — před prvním log voláním v app
    setup_logging(debug=args.debug)

    try:
        cfg = load_config(args.config)
    except FileNotFoundError:
        print(f"[CHYBA] Konfigurační soubor nenalezen: {args.config}", file=sys.stderr)
        print("        Upravte Config.toml nebo zadejte cestu přes --config.", file=sys.stderr)
        sys.exit(1)
    except (KeyError, ValueError) as exc:
        print(f"[CHYBA] Chybná konfigurace: {exc}", file=sys.stderr)
        sys.exit(1)

    try:
        app = create_app(cfg, config_path=Path(args.config).resolve())
    except Exception as exc:
        print(f"[CHYBA] Nepodařilo se inicializovat aplikaci: {exc}", file=sys.stderr)
        sys.exit(1)

    uvicorn.run(
        app,
        host=cfg.server.host,
        port=cfg.server.port,
        log_level="debug" if args.debug else "info",
    )


if __name__ == "__main__":
    main()
