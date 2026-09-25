"""
Launch Native HUD helper - launches floating_ball.py in a separate background process
"""

import sys
import subprocess
import os

def is_floating_ball_running() -> bool:
    """Checks if a floating ball process is already active"""
    try:
        import psutil
        for p in psutil.process_iter(['name', 'cmdline']):
            try:
                cmdline = p.info.get('cmdline') or []
                if any("floating_ball.py" in str(arg) for arg in cmdline):
                    return True
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
    except Exception:
        pass
    return False

def launch_desktop_floating_ball():
    """Starts the native desktop floating ball process detached"""
    if is_floating_ball_running():
        return True

    script_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "floating_ball.py")
    try:
        if sys.platform == "win32":
            subprocess.Popen([sys.executable, script_path], creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP)
        else:
            subprocess.Popen([sys.executable, script_path])
        return True
    except Exception as e:
        print("Failed to launch native floating ball:", e)
        return False
