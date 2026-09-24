"""
Network Metrics & Ping Spike Collector for PulseGuard PRO
Gathers real-time ping latency, upload/download bandwidth, packet jitter,
and identifies active bandwidth-consuming processes.
"""

import time
import socket
import threading
from typing import Dict, Any, List, Optional

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

class NetworkMetricsCollector:
    def __init__(self):
        self._lock = threading.Lock()
        self.last_sample_time = time.time()
        self.last_bytes_recv = 0
        self.last_bytes_sent = 0
        
        self.current_ping_ms = 0.0
        self.current_packet_loss = 0
        self.current_ping_status = "連線檢測中"
        self.current_down_mb_s = 0.0
        self.current_up_mb_s = 0.0
        self.top_network_processes: List[Dict[str, Any]] = []

        # Target probe endpoints (DNS servers with port 53 for zero-overhead socket latency)
        self.probe_hosts = [
            ("1.1.1.1", 53),     # Cloudflare
            ("8.8.8.8", 53),     # Google DNS
            ("223.5.5.5", 53),   # AliDNS
            ("168.95.1.1", 53)   # HiNet TW
        ]
        
        # Initialize net IO baseline
        if HAS_PSUTIL:
            try:
                net_io = psutil.net_io_counters()
                if net_io:
                    self.last_bytes_recv = net_io.bytes_recv
                    self.last_bytes_sent = net_io.bytes_sent
            except Exception:
                pass

        # Start continuous lightweight latency sampler
        self._running = True
        self._ping_thread = threading.Thread(target=self._latency_worker, daemon=True)
        self._ping_thread.start()

    def _latency_worker(self):
        """Continuous background socket RTT ping (sub-millisecond accuracy, zero subprocess overhead)"""
        while self._running:
            latency = self._probe_latency()
            with self._lock:
                if latency is not None:
                    self.current_ping_ms = round(latency, 1)
                    self.current_packet_loss = 0
                    if latency < 35.0:
                        self.current_ping_status = "極速暢通"
                    elif latency < 80.0:
                        self.current_ping_status = "連線優良"
                    elif latency < 150.0:
                        self.current_ping_status = "輕微延遲"
                    else:
                        self.current_ping_status = "爆 Ping 延遲"
                else:
                    self.current_ping_ms = 999.0
                    self.current_packet_loss = 100
                    self.current_ping_status = "連線中斷 / 丟包"

            # Check network active processes every 3 seconds
            time.sleep(1.2)

    def _probe_latency(self) -> Optional[float]:
        """Probes TCP socket handshake latency to reliable Anycast DNS edge nodes"""
        for host, port in self.probe_hosts:
            try:
                t_start = time.perf_counter()
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(0.65)
                sock.connect((host, port))
                sock.close()
                t_end = time.perf_counter()
                return (t_end - t_start) * 1000.0
            except Exception:
                continue
        return None

    def _get_top_network_processes(self) -> List[Dict[str, Any]]:
        """Identifies processes currently holding active internet connections"""
        if not HAS_PSUTIL:
            return []

        proc_conn_count: Dict[int, int] = {}
        try:
            # Query established/active internet connections
            conns = psutil.net_connections(kind='inet')
            for conn in conns:
                if conn.status in ('ESTABLISHED', 'SYN_SENT', 'LISTEN') and conn.pid:
                    proc_conn_count[conn.pid] = proc_conn_count.get(conn.pid, 0) + 1
        except Exception:
            return []

        results = []
        for pid, count in sorted(proc_conn_count.items(), key=lambda x: x[1], reverse=True)[:6]:
            try:
                p = psutil.Process(pid)
                p_name = p.name()
                if p_name.lower() in ('system idle process', 'idle'):
                    continue
                results.append({
                    "pid": pid,
                    "name": p_name,
                    "active_connections": count,
                    "status": "活躍連線中"
                })
            except Exception:
                pass
        return results

    def collect(self) -> Dict[str, Any]:
        """Gathers unified snapshot of current network throughput and latency"""
        now = time.time()
        elapsed = max(now - self.last_sample_time, 0.1)

        down_mb_s = 0.0
        up_mb_s = 0.0

        if HAS_PSUTIL:
            try:
                net_io = psutil.net_io_counters()
                if net_io:
                    recv_diff = max(0, net_io.bytes_recv - self.last_bytes_recv)
                    sent_diff = max(0, net_io.bytes_sent - self.last_bytes_sent)

                    down_mb_s = round((recv_diff / elapsed) / (1024 * 1024), 2)
                    up_mb_s = round((sent_diff / elapsed) / (1024 * 1024), 2)

                    self.last_bytes_recv = net_io.bytes_recv
                    self.last_bytes_sent = net_io.bytes_sent
            except Exception:
                pass

        self.last_sample_time = now
        self.current_down_mb_s = down_mb_s
        self.current_up_mb_s = up_mb_s

        # Periodically refresh network process list
        net_procs = self._get_top_network_processes()

        with self._lock:
            ping_ms = self.current_ping_ms
            status = self.current_ping_status
            packet_loss = self.current_packet_loss

        return {
            "ping_ms": ping_ms,
            "status": status,
            "packet_loss": packet_loss,
            "download_mb_s": down_mb_s,
            "upload_mb_s": up_mb_s,
            "download_kb_s": round(down_mb_s * 1024, 1),
            "upload_kb_s": round(up_mb_s * 1024, 1),
            "top_network_processes": net_procs
        }

# Global network collector singleton
network_collector = NetworkMetricsCollector()
