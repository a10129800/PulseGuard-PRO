"""
Startup Inspector - Scans Windows Startup Registry & Scheduled Background Bloatware
"""

import sys
import json
import subprocess
from typing import List, Dict, Any

class StartupInspector:
    @staticmethod
    def _categorize(name: str, cmd_str: str) -> tuple:
        impact = "低"
        recommend = "保留"
        cmd_lower = (cmd_str or "").lower()
        name_lower = (name or "").lower()

        if any(x in cmd_lower or x in name_lower for x in ["update", "helper", "assistant", "client", "telemetry", "crash"]):
            impact = "中"
            recommend = "可考慮關閉開機自啟動"
        if any(x in cmd_lower or x in name_lower for x in ["steam", "discord", "spotify", "epicgames", "riot"]):
            impact = "高"
            recommend = "建議改為手動開啟，避免拖慢開機速度"
        if any(x in cmd_lower or x in name_lower for x in ["onedrive", "dropbox", "googledrive"]):
            impact = "中"
            recommend = "雲端同步服務，可依個人習慣保留"
        return impact, recommend

    @classmethod
    def inspect(cls) -> List[Dict[str, Any]]:
        """Queries Windows Run registry entries and classifies them by impact"""
        startup_items = []

        # 1. Native Windows winreg (ultra-fast, ~0.001s, zero subprocess overhead)
        if sys.platform == "win32":
            try:
                import winreg
                targets = [
                    (winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", "目前使用者 (HKCU)"),
                    (winreg.HKEY_LOCAL_MACHINE, r"Software\Microsoft\Windows\CurrentVersion\Run", "全機啟動 (HKLM)"),
                ]
                for hkey, subkey, loc_label in targets:
                    try:
                        with winreg.OpenKey(hkey, subkey, 0, winreg.KEY_READ) as key:
                            num_vals = winreg.QueryInfoKey(key)[1]
                            for i in range(num_vals):
                                try:
                                    val_name, val_data, _ = winreg.EnumValue(key, i)
                                    if not val_name:
                                        continue
                                    cmd_str = str(val_data)
                                    impact, recommend = cls._categorize(val_name, cmd_str)
                                    startup_items.append({
                                        "name": val_name,
                                        "command": cmd_str,
                                        "location": loc_label,
                                        "impact": impact,
                                        "recommend": recommend
                                    })
                                except Exception:
                                    pass
                    except Exception:
                        pass
                if startup_items:
                    return startup_items
            except Exception:
                pass

        # 2. PowerShell Fallback
        ps_script = """
        $paths = @(
            "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
            "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
        )
        $results = @()
        foreach ($path in $paths) {
            if (Test-Path $path) {
                $props = Get-ItemProperty -Path $path -ErrorAction SilentlyContinue
                if ($props) {
                    $props.PSObject.Properties | Where-Object { $_.Name -notmatch "^(PS|\\(default\\))" } | ForEach-Object {
                        $val = if ($_.Value) { [string]$_.Value } else { "" }
                        $results += [PSCustomObject]@{
                            Name = $_.Name
                            Command = $val
                            Location = if ($path -match "HKCU") { "目前使用者 (HKCU)" } else { "全機啟動 (HKLM)" }
                        }
                    }
                }
            }
        }
        $results | ConvertTo-Json -Compress
        """
        try:
            proc = subprocess.run(
                ["powershell", "-NoProfile", "-Command", ps_script],
                capture_output=True,
                text=True,
                timeout=5
            )
            raw = proc.stdout.strip()
            if raw:
                data = json.loads(raw)
                if isinstance(data, dict):
                    data = [data]
                for item in data:
                    cmd_str = item.get("Command", "")
                    name = item.get("Name", "Unknown")
                    impact, recommend = cls._categorize(name, cmd_str)
                    startup_items.append({
                        "name": name,
                        "command": cmd_str,
                        "location": item.get("Location", ""),
                        "impact": impact,
                        "recommend": recommend
                    })
        except Exception:
            pass

        return startup_items

startup_inspector = StartupInspector()
