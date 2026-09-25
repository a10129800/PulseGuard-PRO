"""
PulseGuard - 電腦頓挫黑盒子與深度效能體檢系統
Application Entry Point (模組化啟動入口)
"""

import sys
import argparse
from core.config import PORT, HOST
from server import run_server

# Ensure UTF-8 output encoding across Windows consoles to avoid UnicodeEncodeError with emojis
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

def main():
    parser = argparse.ArgumentParser(description="PulseGuard PC Lag Diagnostics & Flight Recorder")
    parser.add_argument("--port", type=int, default=PORT, help=f"HTTP Server port (default: {PORT})")
    parser.add_argument("--host", type=str, default=HOST, help=f"HTTP Server host (default: {HOST})")
    parser.add_argument("--no-browser", action="store_true", help="Do not open browser automatically")
    args = parser.parse_args()

    run_server(host=args.host, port=args.port, open_browser=not args.no_browser)

if __name__ == "__main__":
    main()
