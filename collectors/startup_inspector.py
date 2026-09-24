"""
Startup Inspector - Scans Windows Startup Registry & Scheduled Background Bloatware
"""

import json
import subprocess
from typing import List, Dict, Any

class StartupInspector:
    @staticmethod
    def inspect() -> List[Dict[str, Any]]:
        """Queries Windows Run registry entries and classifies them by impact"""
        startup_items = []
        ps_script = """
        $paths = @(
            "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
            "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
        )
        $results = @()
        foreach ($path in $paths) {
            if (Test-Path $path) {
                $props = Get-ItemProperty -Path $path
                $props.PSObject.Properties | Where-Object { $_.Name -notmatch "^(PS|\\(default\\))" } | ForEach-Object {
                    $results += [PSCustomObject]@{
                        Name = $_.Name
                        Command = $_.Value.ToString()
                        Location = if ($path -match "HKCU") { "目前使用者 (HKCU)" } else { "全機啟動 (HKLM)" }
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

                    # Categorize impact
                    impact = "低"
                    recommend = "保留"
                    cmd_lower = cmd_str.lower()

                    if any(x in cmd_lower for x in ["update", "helper", "assistant", "client", "telemetry"]):
                        impact = "中"
                        recommend = "可考慮關閉開機自啟動"
                    if any(x in cmd_lower for x in ["steam", "discord", "spotify", "epicgames", "riot"]):
                        impact = "高"
                        recommend = "建議改為手動開啟，避免拖慢開機速度"
                    if any(x in cmd_lower for x in ["onedrive", "dropbox"]):
                        impact = "中"
                        recommend = "雲端同步服務，可依個人習慣保留"

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
