"""
PulseGuard Server runner and background flight-recorder thread manager
"""

import time
import threading
import webbrowser
from http.server import HTTPServer
from core.config import PORT, HOST, SAMPLE_INTERVAL_SEC
from core.flight_recorder import default_recorder
from core.sentinel import auto_sentinel
from collectors.system_metrics import metrics_collector
from server.handlers import DiagnosticHTTPHandler

def _background_sampler_loop():
    """Continuously samples metrics to feed the rolling flight recorder buffer and triggers sentinel"""
    while True:
        try:
            snapshot = metrics_collector.collect()
            default_recorder.record(snapshot)
            # Automatic freeze detection
            auto_sentinel.inspect_snapshot(snapshot)
        except Exception:
            pass
        time.sleep(SAMPLE_INTERVAL_SEC)

def run_server(host: str = HOST, port: int = PORT, open_browser: bool = True):
    """Starts the background telemetry sampler and the HTTP server"""
    # 1. Start background recorder daemon
    sampler_thread = threading.Thread(target=_background_sampler_loop, daemon=True)
    sampler_thread.start()

    # 2. Setup HTTP Server
    server_address = (host, port)
    httpd = HTTPServer(server_address, DiagnosticHTTPHandler)
    url = f"http://localhost:{port}"

    print("=" * 65)
    print("🚀 PulseGuard PRO - 全方位電腦頓挫黑盒子與深度效能體檢系統")
    print(f"🌐 本地儀表板網址: {url}")
    if metrics_collector.has_psutil:
        print("⚡ 硬體遙測引擎: psutil 高速採樣模組 (已就緒)")
    else:
        print("ℹ️ 硬體遙測引擎: Windows 原生 API 模式 (可執行 pip install psutil 升級)")
    print("🛡️ 自動卡頓哨兵 (Auto Lag Sentinel): 背景運作中")
    print("=" * 65)

    if open_browser:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n正在安全關閉 PulseGuard 服務...")
        httpd.server_close()
