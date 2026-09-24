"""
HTTP Handler for PulseGuard API & Static Dashboard
Protected with global exception handling to avoid ERR_EMPTY_RESPONSE.
"""

import sys
import json
import traceback
import urllib.parse
from http.server import SimpleHTTPRequestHandler
from core.config import STATIC_DIR
from core.flight_recorder import default_recorder
from core.sentinel import auto_sentinel
from core.hud_launcher import launch_desktop_floating_ball
from collectors.system_metrics import metrics_collector
from collectors.startup_inspector import startup_inspector
from collectors.health_checker import health_checker
from analyzers.lag_analyzer import lag_analyzer
from analyzers.report_generator import report_generator
from optimizers.system_optimizer import system_optimizer
from collectors.security_scanner import security_scanner

class DiagnosticHTTPHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def _read_json_body(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length > 0:
                raw_body = self.rfile.read(content_length).decode("utf-8")
                return json.loads(raw_body)
        except Exception:
            pass
        return {}

    def do_POST(self):
        try:
            parsed = urllib.parse.urlparse(self.path)
            path = parsed.path
            body = self._read_json_body()

            if path == "/api/optimize_system":
                result = system_optimizer.run_optimization()
                self._send_json(result)
            elif path == "/api/deep_clean":
                result = system_optimizer.execute_deep_clean()
                self._send_json(result)
            elif path == "/api/incidents/clear":
                auto_sentinel.clear()
                self._send_json({"status": "cleared"})
            elif path == "/api/launch_native_hud":
                success = launch_desktop_floating_ball()
                self._send_json({"status": "ok" if success else "failed"})
            elif path == "/api/security/scan":
                scan_type = body.get("scan_type", "QuickScan")
                target_path = body.get("target_path", "")
                res = security_scanner.start_defender_scan(scan_type=scan_type, target_path=target_path)
                self._send_json(res)
            elif path == "/api/security/cancel_scan":
                res = security_scanner.cancel_scan()
                self._send_json(res)
            elif path == "/api/security/update_signatures":
                res = security_scanner.update_signatures()
                self._send_json(res)
            elif path == "/api/security/kill_process":
                pid = int(body.get("pid", 0))
                res = security_scanner.kill_process(pid)
                self._send_json(res)
            elif path == "/api/security/inspect_file":
                file_path = body.get("file_path", "")
                res = security_scanner.inspect_file(file_path)
                self._send_json(res)
            else:
                self.send_error(404, "Endpoint not found")
        except Exception as e:
            traceback.print_exc()
            self._send_json({"status": "error", "message": str(e)}, status=500)

    def do_GET(self):
        try:
            parsed = urllib.parse.urlparse(self.path)
            path = parsed.path
            query = urllib.parse.parse_qs(parsed.query)

            if path == "/api/metrics":
                sample = metrics_collector.collect()
                self._send_json(sample)
            elif path == "/api/history":
                history = default_recorder.get_history()
                self._send_json(history)
            elif path == "/api/diagnose_lag":
                report = lag_analyzer.analyze()
                self._send_json(report)
            elif path == "/api/health_audit":
                audit = health_checker.run_audit()
                self._send_json(audit)
            elif path == "/api/startup_items":
                items = startup_inspector.inspect()
                self._send_json(items)
            elif path == "/api/incidents":
                incidents = auto_sentinel.get_incidents()
                self._send_json(incidents)
            elif path == "/api/deep_clean_scan":
                scan_res = system_optimizer.scan_deep_clean()
                self._send_json(scan_res)
            elif path == "/api/export_report":
                fmt = query.get("format", ["html"])[0].lower()
                if fmt == "md":
                    content = report_generator.generate_markdown()
                    self._send_file_download(content.encode("utf-8"), "pulseguard_report.md", "text/markdown")
                else:
                    content = report_generator.generate_html()
                    self._send_file_download(content.encode("utf-8"), "pulseguard_report.html", "text/html")
            elif path == "/api/optimize_system":
                result = system_optimizer.run_optimization()
                self._send_json(result)
            elif path == "/api/launch_native_hud":
                success = launch_desktop_floating_ball()
                self._send_json({"status": "ok" if success else "failed"})
            elif path == "/api/security/status":
                status = security_scanner.get_defender_status()
                self._send_json(status)
            elif path == "/api/security/audit":
                audit = security_scanner.audit_security()
                self._send_json(audit)
            elif path == "/api/security/scan_status":
                scan_stat = security_scanner.get_scan_status()
                self._send_json(scan_stat)
            elif path == "/api/security/hunt_processes":
                threats = security_scanner.hunt_process_threats()
                self._send_json(threats)
            else:
                # Fallback to static file serving
                super().do_GET()
        except Exception as e:
            traceback.print_exc()
            try:
                self._send_json({"status": "error", "message": str(e)}, status=500)
            except Exception:
                pass

    def _send_file_download(self, data_bytes: bytes, filename: str, content_type: str):
        self.send_response(200)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(data_bytes)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data_bytes)

    def _send_json(self, data, status=200):
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):
        if "/api/metrics" not in args[0]:
            sys.stderr.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), format % args))
