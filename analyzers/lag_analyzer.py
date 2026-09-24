"""
Lag Analyzer - Analyzes flight recorder history buffer to detect spikes and rank culprit processes
"""

import collections
from typing import Dict, Any, List
from core.flight_recorder import FlightRecorder, default_recorder
from core.config import CPU_SPIKE_THRESHOLD, RAM_PRESSURE_THRESHOLD, DISK_WRITE_SPIKE_MB

class LagAnalyzer:
    def __init__(self, recorder: FlightRecorder = default_recorder):
        self.recorder = recorder

    def analyze(self) -> Dict[str, Any]:
        """
        Analyzes the rolling history buffer:
        - Detects worst stress moment (highest combined stress index)
        - Measures peak CPU, peak RAM, peak Disk Write burst
        - Pinpoints which process was most active and ranks culprits with actionable recommendations
        """
        history = self.recorder.get_history()

        if len(history) < 3:
            return {
                "status": "collecting",
                "message": "數據收集累積中（需至少運作 5 秒鐘），請稍候再點擊分析！",
                "culprits": []
            }

        # Extract telemetry series
        cpu_values = [h.get("cpu_total", 0.0) for h in history]
        peak_cpu = max(cpu_values)
        avg_cpu = sum(cpu_values) / len(cpu_values)

        mem_values = [h.get("memory", {}).get("percent", 0) for h in history]
        peak_mem = max(mem_values)

        disk_writes = [h.get("disk", {}).get("write_mb_s", 0.0) for h in history]
        peak_disk_write = max(disk_writes)

        # Find the snapshot with the highest composite stress
        def stress_score(s: Dict[str, Any]) -> float:
            cpu = s.get("cpu_total", 0.0)
            mem = s.get("memory", {}).get("percent", 0.0)
            disk_w = s.get("disk", {}).get("write_mb_s", 0.0)
            return (cpu * 0.5) + (min(disk_w, 100) * 0.3) + (mem * 0.2)

        worst_snapshot = max(history, key=stress_score)
        worst_time = worst_snapshot.get("time_str", "--:--:--")

        # Aggregate process impacts across the rolling buffer
        process_impact = collections.defaultdict(
            lambda: {"cpu_sum": 0.0, "max_cpu": 0.0, "max_ram": 0.0, "occurrences": 0, "name": ""}
        )

        for h in history:
            for p in h.get("top_processes", []):
                name = p.get("name", "Unknown")
                process_impact[name]["name"] = name
                process_impact[name]["cpu_sum"] += p.get("cpu", 0.0)
                process_impact[name]["max_cpu"] = max(process_impact[name]["max_cpu"], p.get("cpu", 0.0))
                process_impact[name]["max_ram"] = max(process_impact[name]["max_ram"], p.get("ram", 0.0))
                process_impact[name]["occurrences"] += 1

        culprits = []
        for name, data in process_impact.items():
            avg_p_cpu = data["cpu_sum"] / max(data["occurrences"], 1)
            severity = (data["max_cpu"] * 1.5) + (data["max_ram"] * 2.0)

            name_lower = name.lower()
            tag = "應用程式"
            suggestion = "正常執行中"

            if any(b in name_lower for b in ["chrome", "msedge", "brave", "firefox"]):
                tag = "瀏覽器分頁"
                suggestion = "分頁累積過多或影片/腳本佔用，建議開啟分頁睡眠（Efficiency Mode）或關閉閒置分頁。"
            elif any(s in name_lower for s in ["searchindexer", "tiworker", "trustedinstaller"]):
                tag = "Windows 系統維護/更新"
                suggestion = "Windows 正在背景建置搜尋索引或安裝更新，會造成劇烈磁碟/CPU 卡頓，建議暫停更新或重設索引。"
            elif any(d in name_lower for d in ["antimalware", "msmpeng", "defender"]):
                tag = "Windows Defender 防毒"
                suggestion = "防毒正在背景進行高強度排程掃描，若卡頓可按 Ctrl+Alt+Del 開啟工作管理員將其結束或降低優先權，並建議將專案目錄加入排除名單避免重複掃描。"
            elif "explorer" in name_lower:
                tag = "檔案總管"
                suggestion = "若檔案總管 CPU 高，通常是某些資料夾有損壞的影片縮圖、或者桌面放了過多大型檔案。"
            elif name_lower == "system":
                tag = "Windows 系統核心/驅動"
                suggestion = "System 核心佔用高常起因於驅動程式衝突 (DPC Latency) 或損壞的硬碟正在不斷重試 I/O。"
            elif any(g in name_lower for g in ["steam", "epicgames", "riot"]):
                tag = "遊戲啟動器"
                suggestion = "正在背景下載更新或著色器編譯。"

            culprits.append({
                "name": name,
                "max_cpu": round(data["max_cpu"], 1),
                "avg_cpu": round(avg_p_cpu, 1),
                "max_ram": round(data["max_ram"], 1),
                "tag": tag,
                "suggestion": suggestion,
                "severity": round(severity, 1)
            })

        culprits.sort(key=lambda x: x["severity"], reverse=True)
        top_culprits = culprits[:5]

        # Primary conclusion text
        primary_reasons = []
        if peak_cpu > CPU_SPIKE_THRESHOLD:
            primary_reasons.append(f"在 {worst_time} 檢測到 CPU 負載瞬間暴衝至 {peak_cpu}%")
        if peak_mem > RAM_PRESSURE_THRESHOLD:
            primary_reasons.append(f"記憶體負載達 {peak_mem}% 警戒水位，容易觸發虛擬記憶體交換導致瞬間凍結")
        if peak_disk_write > DISK_WRITE_SPIKE_MB:
            primary_reasons.append(f"磁碟寫入高達 {peak_disk_write} MB/s，可能正有程式在大量讀寫硬碟")

        if not primary_reasons:
            summary_text = f"過去 60 秒系統整體負載平穩（平均 CPU {round(avg_cpu, 1)}%），暫無劇烈暴衝；若仍感到操作不順，請留意開機常駐項或磁碟空間。"
        else:
            summary_text = "；".join(primary_reasons) + "。"

        return {
            "status": "success",
            "worst_time": worst_time,
            "peak_cpu": peak_cpu,
            "avg_cpu": round(avg_cpu, 1),
            "peak_mem": peak_mem,
            "peak_disk_write": peak_disk_write,
            "summary": summary_text,
            "culprits": top_culprits
        }

lag_analyzer = LagAnalyzer()
