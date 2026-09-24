"""
Launch Native HUD helper - launches floating_ball.py in a separate background process
"""

import sys
import subprocess
import os

def launch_desktop_floating_ball():
    """Starts the native desktop floating ball process detached"""
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
