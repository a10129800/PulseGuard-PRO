"""
Health Checker - Comprehensive PC Health Audit & Score Calculator
"""

import time
import ctypes
from typing import Dict, Any, List
from collectors.system_metrics import metrics_collector
from collectors.startup_inspector import startup_inspector
from core.config import DISK_FREE_WARNING_GB, UPTIME_WARNING_HOURS

class HealthChecker:
    @staticmethod
    def get_uptime_hours() -> float:
        """Get Windows system uptime in hours"""
        now = time.time()
        try:
            if metrics_collector.has_psutil:
                import psutil
                return round((now - psutil.boot_time()) / 3600, 1)
            else:
                kernel32 = ctypes.windll.kernel32
                uptime_ms = kernel32.GetTickCount64()
                return round(uptime_ms / (1000 * 3600), 1)
        except Exception:
            return 12.0

    def run_audit(self) -> Dict[str, Any]:
        """Perform comprehensive health audit and calculate PC Health Score (0-100)"""
        uptime_hours = self.get_uptime_hours()
        metrics = metrics_collector.collect()
        disk_c = metrics.get("disk_c", {})
        free_gb = disk_c.get("free_gb", 100)
        mem_info = metrics.get("memory", {})
        mem_pct = mem_info.get("percent", 50)
        commit_pct = mem_info.get("commit_percent", 50)

        startup_list = startup_inspector.inspect()
        high_impact_startups = [x for x in startup_list if x["impact"] == "高"]

        score = 100
        deductions: List[str] = []

        # Disk space penalties
        if free_gb < DISK_FREE_WARNING_GB:
            score -= 25
            deductions.append(f"C 槽剩餘空間不足 20GB (僅剩 {free_gb}GB)，Windows 虛擬記憶體與暫存檔將嚴重受限")
        elif free_gb < 40:
            score -= 10
            deductions.append(f"C 槽剩餘空間偏低 (剩餘 {free_gb}GB)")

        # Continuous uptime penalties
        if uptime_hours > 168: # 7 days
            score -= 15
            deductions.append(f"電腦已連續開機超過 {int(uptime_hours // 24)} 天未重新開機，建議重開機釋放核心記憶體")
        elif uptime_hours > UPTIME_WARNING_HOURS:
            score -= 5
            deductions.append(f"電腦已連續開機 {round(uptime_hours, 1)} 小時，累積不少背景快取")

        # RAM pressure penalties
        if mem_pct > 85:
            score -= 20
            deductions.append(f"實體記憶體佔用高達 {mem_pct}%，容易引發頻繁頓挫")
        if commit_pct > 90:
            score -= 15
            deductions.append("分頁檔認可極限（Commit Charge）逼近上限，容易產生程式無回應")

        # Startup bloatware penalties
        if len(high_impact_startups) >= 3:
            score -= 15
            deductions.append(f"有 {len(high_impact_startups)} 個高負載開機啟動程式正在拖慢系統")
        elif len(startup_list) > 10:
            score -= 8
            deductions.append(f"開機啟動項過多 (共 {len(startup_list)} 個)")

        score = max(10, min(100, score))

        # Health Level classification
        if score >= 85:
            grade = "極佳 (Optimal)"
            grade_color = "#10b981"
        elif score >= 70:
            grade = "普通 (Moderate)"
            grade_color = "#f59e0b"
        elif score >= 50:
            grade = "亞健康 (Sluggish)"
            grade_color = "#f97316"
        else:
            grade = "嚴重遲緩 (Critical)"
            grade_color = "#ef4444"

        return {
            "score": score,
            "grade": grade,
            "grade_color": grade_color,
            "uptime_hours": uptime_hours,
            "disk_c": disk_c,
            "memory_percent": mem_pct,
            "commit_percent": commit_pct,
            "startup_count": len(startup_list),
            "high_impact_startups": len(high_impact_startups),
            "deductions": deductions,
            "tips": [
                "定時清理 C:\\Windows\\Temp 及 %temp% 資料夾中的過期快取檔",
                "在 Windows 工作管理員 > 開機 頁面中停用不必要的背景啟動程式",
                "若經常在打字或聽音樂時瞬間卡頓，可檢查音效卡與顯示卡驅動是否過舊",
                "SSD 建議隨時保留 15%~20% 以上可用空間，以利平均抹寫與 Trim 機制"
            ]
        }

health_checker = HealthChecker()
