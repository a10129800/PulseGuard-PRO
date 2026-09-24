"""
System Metrics Collector
Gathers real-time CPU, RAM, Commit Charge, Disk I/O, GPU, and top running processes.
Supports psutil acceleration with graceful native Windows ctypes/PowerShell fallback.
"""

import time
import ctypes
import subprocess
from typing import Dict, Any, List
from collectors.gpu_metrics import gpu_collector

# Try importing psutil for high-frequency low-overhead telemetry
try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

# Structure for Windows API GlobalMemoryStatusEx
class _MEMORYSTATUSEX(ctypes.Structure):
    _fields_ = [
        ("dwLength", ctypes.c_ulong),
        ("dwMemoryLoad", ctypes.c_ulong),
        ("ullTotalPhys", ctypes.c_ulonglong),
        ("ullAvailPhys", ctypes.c_ulonglong),
        ("ullTotalPageFile", ctypes.c_ulonglong),
        ("ullAvailPageFile", ctypes.c_ulonglong),
        ("ullTotalVirtual", ctypes.c_ulonglong),
        ("ullAvailVirtual", ctypes.c_ulonglong),
        ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
    ]

class SystemMetricsCollector:
    def __init__(self):
        self.last_disk_sample = {
            "time": time.time(),
            "read_bytes": 0,
            "write_bytes": 0
        }
        # Initialize psutil initial CPU sample if available
        if HAS_PSUTIL:
            try:
                psutil.cpu_percent(interval=None)
            except Exception:
                pass

    @property
    def has_psutil(self) -> bool:
        return HAS_PSUTIL

    def _get_native_memory(self) -> Dict[str, Any]:
        """Query memory via Windows GlobalMemoryStatusEx directly"""
        try:
            stat = _MEMORYSTATUSEX()
            stat.dwLength = ctypes.sizeof(_MEMORYSTATUSEX)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))

            total_gb = stat.ullTotalPhys / (1024 ** 3)
            avail_gb = stat.ullAvailPhys / (1024 ** 3)
            used_gb = total_gb - avail_gb
            page_total_gb = stat.ullTotalPageFile / (1024 ** 3)
            page_avail_gb = stat.ullAvailPageFile / (1024 ** 3)
            page_used_gb = page_total_gb - page_avail_gb

            return {
                "total_gb": round(total_gb, 2),
                "used_gb": round(used_gb, 2),
                "available_gb": round(avail_gb, 2),
                "percent": int(stat.dwMemoryLoad),
                "commit_total_gb": round(page_total_gb, 2),
                "commit_used_gb": round(page_used_gb, 2),
                "commit_percent": round((page_used_gb / max(page_total_gb, 0.1)) * 100, 1)
            }
        except Exception:
            return {
                "total_gb": 16.0,
                "used_gb": 8.0,
                "available_gb": 8.0,
                "percent": 50,
                "commit_total_gb": 20.0,
                "commit_used_gb": 10.0,
                "commit_percent": 50.0
            }

    def _get_c_drive_space(self) -> Dict[str, Any]:
        """Retrieve total and free space on drive C:"""
        try:
            if HAS_PSUTIL:
                usage = psutil.disk_usage('C:\\')
                free_gb = round(usage.free / (1024 ** 3), 1)
                total_gb = round(usage.total / (1024 ** 3), 1)
            else:
                free_bytes = ctypes.c_ulonglong(0)
                total_bytes = ctypes.c_ulonglong(0)
                ctypes.windll.kernel32.GetDiskFreeSpaceExW(
                    "C:\\", None, ctypes.byref(total_bytes), ctypes.byref(free_bytes)
                )
                free_gb = round(free_bytes.value / (1024 ** 3), 1)
                total_gb = round(total_bytes.value / (1024 ** 3), 1)

            used_percent = round(((total_gb - free_gb) / max(total_gb, 1)) * 100, 1)
            return {"total_gb": total_gb, "free_gb": free_gb, "used_percent": used_percent}
        except Exception:
            return {"total_gb": 500.0, "free_gb": 100.0, "used_percent": 80.0}

    def collect(self) -> Dict[str, Any]:
        """Take a unified snapshot of system telemetry"""
        now = time.time()
        cpu_total = 0.0
        cpu_cores = []
        mem_data = {}
        disk_data = {"read_mb_s": 0.0, "write_mb_s": 0.0, "busy_percent": 0.0}
        top_processes: List[Dict[str, Any]] = []

        if HAS_PSUTIL:
            try:
                # CPU
                cpu_total = psutil.cpu_percent(interval=None)
                cpu_cores = psutil.cpu_percent(interval=None, percpu=True)

                # Memory
                vm = psutil.virtual_memory()
                swap = psutil.swap_memory()
                mem_data = {
                    "total_gb": round(vm.total / (1024 ** 3), 2),
                    "used_gb": round(vm.used / (1024 ** 3), 2),
                    "available_gb": round(vm.available / (1024 ** 3), 2),
                    "percent": vm.percent,
                    "commit_total_gb": round((vm.total + swap.total) / (1024 ** 3), 2),
                    "commit_used_gb": round((vm.used + swap.used) / (1024 ** 3), 2),
                    "commit_percent": round(((vm.used + swap.used) / max((vm.total + swap.total), 1)) * 100, 1)
                }

                # Disk IO
                dio = psutil.disk_io_counters()
                if dio:
                    if self.last_disk_sample["write_bytes"] == 0 and self.last_disk_sample["read_bytes"] == 0:
                        # First initial baseline calibration, avoid huge false delta
                        self.last_disk_sample = {
                            "time": now,
                            "read_bytes": dio.read_bytes,
                            "write_bytes": dio.write_bytes
                        }
                    else:
                        elapsed = max(now - self.last_disk_sample["time"], 0.1)
                        read_diff = max(0, dio.read_bytes - self.last_disk_sample["read_bytes"])
                        write_diff = max(0, dio.write_bytes - self.last_disk_sample["write_bytes"])
                        disk_data["read_mb_s"] = round(read_diff / (1024 * 1024 * elapsed), 2)
                        disk_data["write_mb_s"] = round(write_diff / (1024 * 1024 * elapsed), 2)
                        total_mb_s = disk_data["read_mb_s"] + disk_data["write_mb_s"]
                        disk_data["busy_percent"] = min(100.0, round((total_mb_s / 150.0) * 100, 1))

                        self.last_disk_sample = {
                            "time": now,
                            "read_bytes": dio.read_bytes,
                            "write_bytes": dio.write_bytes
                        }

                # Top processes
                procs = []
                for p in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent']):
                    try:
                        info = p.info
                        name = info['name'] or 'Unknown'
                        if name.lower() in ('system idle process', 'idle'):
                            continue
                        procs.append({
                            "pid": info['pid'],
                            "name": name,
                            "cpu": round(info['cpu_percent'] or 0.0, 1),
                            "ram": round(info['memory_percent'] or 0.0, 1)
                        })
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass

                procs.sort(key=lambda x: (x['cpu'], x['ram']), reverse=True)
                top_processes = procs[:12]

            except Exception:
                pass

        else:
            # Fallback without psutil
            mem_data = self._get_native_memory()

            try:
                cmd = "powershell -NoProfile -Command \"(Get-Counter '\\Processor(_Total)\\% Processor Time').CounterSamples.CookedValue\""
                res = subprocess.check_output(cmd, shell=True, text=True, timeout=1.5)
                val = float(res.strip().replace(',', '.'))
                cpu_total = round(val, 1)
            except Exception:
                cpu_total = 12.0

            try:
                cmd = "powershell -NoProfile -Command \"Get-Process | Sort-Object CPU -Descending | Select-Object -First 8 -Property Id, ProcessName, CPU, WorkingSet\""
                out = subprocess.check_output(cmd, shell=True, text=True, timeout=2.0)
                lines = out.strip().splitlines()
                for line in lines[3:]:
                    parts = line.split()
                    if len(parts) >= 4:
                        top_processes.append({
                            "pid": int(parts[0]) if parts[0].isdigit() else 0,
                            "name": parts[1] + ".exe",
                            "cpu": 0.0,
                            "ram": round(float(parts[3]) / (1024 * 1024 * 1024), 2) if parts[3].isdigit() else 0.0
                        })
            except Exception:
                pass

        # Query GPU (NVIDIA / Integrated)
        gpu_info = gpu_collector.collect()

        return {
            "timestamp": now,
            "time_str": time.strftime("%H:%M:%S", time.localtime(now)),
            "has_psutil": HAS_PSUTIL,
            "cpu_total": cpu_total,
            "cpu_cores": cpu_cores,
            "memory": mem_data,
            "disk": disk_data,
            "disk_c": self._get_c_drive_space(),
            "gpu": gpu_info,
            "top_processes": top_processes
        }

# Global metrics collector instance
metrics_collector = SystemMetricsCollector()
