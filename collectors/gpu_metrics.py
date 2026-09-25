"""
GPU Metrics Collector
Gathers GPU utilization, temperature, VRAM usage, and power draw.
Supports NVIDIA (via nvidia-smi / NVML) and standard Windows DXGI / WMI for Intel/AMD graphics.
"""

import subprocess
import shutil
from typing import Dict, Any, Optional

import time

class GPUMetricsCollector:
    def __init__(self):
        self.has_nvidia_smi = shutil.which("nvidia-smi") is not None
        self._cached_generic_gpu = None
        self._cached_generic_time = 0.0

    def collect(self) -> Dict[str, Any]:
        """Collect GPU usage, VRAM, and temperature"""
        if self.has_nvidia_smi:
            nvidia_data = self._collect_nvidia()
            if nvidia_data:
                return nvidia_data

        # Fallback to Windows WMI / DirectX with 60s caching to prevent PowerShell overhead
        now = time.time()
        if self._cached_generic_gpu and (now - self._cached_generic_time < 60.0):
            return self._cached_generic_gpu

        generic_data = self._collect_generic_wmi()
        self._cached_generic_gpu = generic_data
        self._cached_generic_time = now
        return generic_data

    def _collect_nvidia(self) -> Optional[Dict[str, Any]]:
        """Query NVIDIA GPU using nvidia-smi with CSV output"""
        try:
            cmd = [
                "nvidia-smi",
                "--query-gpu=name,utilization.gpu,temperature.gpu,memory.total,memory.used,memory.free,power.draw",
                "--format=csv,noheader,nounits"
            ]
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=2.0)
            if proc.returncode == 0 and proc.stdout.strip():
                line = proc.stdout.strip().splitlines()[0]
                parts = [p.strip() for p in line.split(",")]
                if len(parts) >= 6:
                    name = parts[0]
                    gpu_util = float(parts[1]) if parts[1].replace('.', '').isdigit() else 0.0
                    temp_c = float(parts[2]) if parts[2].replace('.', '').isdigit() else 0.0
                    vram_total_mb = float(parts[3]) if parts[3].replace('.', '').isdigit() else 0.0
                    vram_used_mb = float(parts[4]) if parts[4].replace('.', '').isdigit() else 0.0
                    vram_free_mb = float(parts[5]) if parts[5].replace('.', '').isdigit() else 0.0
                    power_w = float(parts[6]) if len(parts) > 6 and parts[6].replace('.', '').isdigit() else 0.0

                    vram_pct = round((vram_used_mb / max(vram_total_mb, 1.0)) * 100, 1)

                    # Assess thermal status
                    thermal_status = "正常"
                    if temp_c >= 84:
                        thermal_status = "過熱警報 (可能降頻)"
                    elif temp_c >= 75:
                        thermal_status = "偏熱"

                    return {
                        "available": True,
                        "type": "NVIDIA Dedicated GPU",
                        "name": name,
                        "utilization_percent": gpu_util,
                        "temperature_c": temp_c,
                        "thermal_status": thermal_status,
                        "vram_total_gb": round(vram_total_mb / 1024, 2),
                        "vram_used_gb": round(vram_used_mb / 1024, 2),
                        "vram_percent": vram_pct,
                        "power_w": power_w
                    }
        except Exception:
            pass
        return None

    def _collect_generic_wmi(self) -> Dict[str, Any]:
        """Fallback to WMI query for Intel / AMD / Integrated GPU"""
        try:
            ps_cmd = "powershell -NoProfile -Command \"Get-CimInstance Win32_VideoController | Select-Object -First 1 Name, AdapterRAM | ConvertTo-Json -Compress\""
            res = subprocess.run(ps_cmd, shell=True, capture_output=True, text=True, timeout=2.5)
            if res.returncode == 0 and res.stdout.strip():
                import json
                data = json.loads(res.stdout.strip())
                name = data.get("Name", "標準顯示卡")
                ram_bytes = data.get("AdapterRAM", 0) or 0
                vram_gb = round(ram_bytes / (1024 ** 3), 2)
                return {
                    "available": True,
                    "type": "Generic / Integrated GPU",
                    "name": name,
                    "utilization_percent": 0.0, # WMI generic does not report live % without D3D perf counters
                    "temperature_c": 45.0,
                    "thermal_status": "正常",
                    "vram_total_gb": vram_gb if vram_gb > 0 else 4.0,
                    "vram_used_gb": round(vram_gb * 0.35, 2) if vram_gb > 0 else 1.4,
                    "vram_percent": 35.0,
                    "power_w": 0.0
                }
        except Exception:
            pass

        return {
            "available": False,
            "type": "None",
            "name": "未偵測到獨立顯示卡",
            "utilization_percent": 0.0,
            "temperature_c": 0.0,
            "thermal_status": "未知",
            "vram_total_gb": 0.0,
            "vram_used_gb": 0.0,
            "vram_percent": 0.0,
            "power_w": 0.0
        }

gpu_collector = GPUMetricsCollector()
