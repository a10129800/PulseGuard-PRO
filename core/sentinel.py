"""
Auto Lag Sentinel - Background observer that automatically detects freezes
and saves blackbox incident snapshots into a persistent session log.
"""

import time
import threading
from typing import List, Dict, Any, Optional
from core.config import (
    CPU_SPIKE_THRESHOLD, RAM_PRESSURE_THRESHOLD, DISK_WRITE_SPIKE_MB,
    PING_SPIKE_THRESHOLD_MS, NET_DOWNLOAD_SPIKE_MB
)

class AutoLagSentinel:
    def __init__(self, max_incidents: int = 50, cooldown_sec: float = 12.0):
        self.max_incidents = max_incidents
        self.cooldown_sec = cooldown_sec
        self.last_trigger_time = 0.0
        self.incidents: List[Dict[str, Any]] = []
        self._lock = threading.Lock()
        self.enabled = True

    def inspect_snapshot(self, snapshot: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Evaluates a live telemetry snapshot and creates an incident if stress threshold is exceeded"""
        if not self.enabled:
            return None

        now = snapshot.get("timestamp", time.time())
        if now - self.last_trigger_time < self.cooldown_sec:
            return None

        cpu = snapshot.get("cpu_total", 0.0)
        mem = snapshot.get("memory", {}).get("percent", 0.0)
        disk_w = snapshot.get("disk", {}).get("write_mb_s", 0.0)
        net_data = snapshot.get("network", {})
        ping_ms = net_data.get("ping_ms", 0.0)
        down_mb = net_data.get("download_mb_s", 0.0)

        trigger_reasons = []
        if cpu >= CPU_SPIKE_THRESHOLD:
            trigger_reasons.append(f"CPU 瞬間暴衝至 {cpu}%")
        if mem >= RAM_PRESSURE_THRESHOLD:
            trigger_reasons.append(f"記憶體負載達 {mem}%")
        if disk_w >= DISK_WRITE_SPIKE_MB:
            trigger_reasons.append(f"磁碟大量寫入 {disk_w} MB/s")
        if ping_ms >= PING_SPIKE_THRESHOLD_MS and ping_ms < 990.0:
            trigger_reasons.append(f"網路爆 Ping 至 {ping_ms} ms")
        if down_mb >= NET_DOWNLOAD_SPIKE_MB:
            trigger_reasons.append(f"網路高載下載 {down_mb} MB/s")

        if not trigger_reasons:
            return None

        # Threshold breached! Check if this is the same ongoing culprit to avoid spam
        self.last_trigger_time = now
        top_procs = snapshot.get("top_processes", [])
        net_procs = net_data.get("top_network_processes", [])
        
        # If triggered primarily by network and network processes exist
        if (ping_ms >= PING_SPIKE_THRESHOLD_MS or down_mb >= NET_DOWNLOAD_SPIKE_MB) and net_procs and cpu < CPU_SPIKE_THRESHOLD:
            top_culprit = {"name": net_procs[0]["name"], "cpu": cpu, "ram": 0.0, "net": f"{down_mb} MB/s"}
        else:
            top_culprit = top_procs[0] if top_procs else {"name": "未知進程", "cpu": cpu, "ram": 0.0}
            
        culprit_name = top_culprit.get("name", "Unknown")

        with self._lock:
            # If the last incident is the same culprit within 60 seconds, update it rather than spamming new rows
            if (self.incidents and 
                self.incidents[0].get("culprit_name") == culprit_name and 
                (now - self.incidents[0].get("timestamp", now) < 60.0)):
                self.incidents[0]["timestamp"] = now
                self.incidents[0]["time_str"] = snapshot.get("time_str", time.strftime("%H:%M:%S"))
                self.incidents[0]["peak_cpu"] = max(self.incidents[0].get("peak_cpu", 0.0), cpu)
                self.incidents[0]["peak_mem"] = max(self.incidents[0].get("peak_mem", 0.0), mem)
                self.incidents[0]["peak_disk_w"] = max(self.incidents[0].get("peak_disk_w", 0.0), disk_w)
                self.incidents[0]["peak_ping"] = max(self.incidents[0].get("peak_ping", 0.0), ping_ms)
                self.incidents[0]["culprit_cpu"] = max(self.incidents[0].get("culprit_cpu", 0.0), top_culprit.get("cpu", 0.0))
                self.incidents[0]["culprit_ram"] = max(self.incidents[0].get("culprit_ram", 0.0), top_culprit.get("ram", 0.0))
                current_reasons = set(self.incidents[0].get("reason", "").split(" + "))
                current_reasons.update(trigger_reasons)
                self.incidents[0]["reason"] = " + ".join(sorted(current_reasons))
                return self.incidents[0]

            incident = {
                "id": f"LAG-{int(now * 1000) % 1000000:06d}",
                "timestamp": now,
                "time_str": snapshot.get("time_str", time.strftime("%H:%M:%S")),
                "reason": " + ".join(trigger_reasons),
                "peak_cpu": cpu,
                "peak_mem": mem,
                "peak_disk_w": disk_w,
                "peak_ping": ping_ms,
                "culprit_name": culprit_name,
                "culprit_cpu": top_culprit.get("cpu", 0.0),
                "culprit_ram": top_culprit.get("ram", 0.0)
            }
            self.incidents.insert(0, incident)
            if len(self.incidents) > self.max_incidents:
                self.incidents.pop()

        return incident

    def get_incidents(self) -> List[Dict[str, Any]]:
        with self._lock:
            return list(self.incidents)

    def clear(self) -> None:
        with self._lock:
            self.incidents.clear()

auto_sentinel = AutoLagSentinel()
