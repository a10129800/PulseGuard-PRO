"""
Configuration settings for PulseGuard
"""

import os

PORT = 8899
HOST = "127.0.0.1"

# Flight recorder settings
HISTORY_MAXLEN = 60       # Rolling buffer duration in seconds
SAMPLE_INTERVAL_SEC = 1.0 # Polling interval for background recorder

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(BASE_DIR, "static")

# Thresholds for lag detection
CPU_SPIKE_THRESHOLD = 80.0       # CPU percent considered high stress
RAM_PRESSURE_THRESHOLD = 85.0    # RAM percent considered high
DISK_WRITE_SPIKE_MB = 50.0       # Disk write MB/s considered heavy burst
DISK_FREE_WARNING_GB = 20.0      # C: drive minimum comfortable free space
UPTIME_WARNING_HOURS = 72.0      # Continuous uptime warning threshold
