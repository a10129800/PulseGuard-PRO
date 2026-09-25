"""
Flight Recorder - Thread-safe rolling ring buffer for system telemetry snapshots
"""

import collections
import threading
from typing import List, Dict, Any, Optional
from core.config import HISTORY_MAXLEN

class FlightRecorder:
    def __init__(self, maxlen: int = HISTORY_MAXLEN):
        self._buffer = collections.deque(maxlen=maxlen)
        self._lock = threading.Lock()

    def record(self, snapshot: Dict[str, Any]) -> None:
        """Append a new snapshot into the rolling buffer"""
        with self._lock:
            self._buffer.append(snapshot)

    def get_history(self) -> List[Dict[str, Any]]:
        """Retrieve a copy of recent history snapshots"""
        with self._lock:
            return list(self._buffer)

    def get_latest(self) -> Optional[Dict[str, Any]]:
        """Retrieve the most recent telemetry snapshot or None if buffer is empty"""
        with self._lock:
            return dict(self._buffer[-1]) if self._buffer else None

    def count(self) -> int:
        with self._lock:
            return len(self._buffer)

    def clear(self) -> None:
        with self._lock:
            self._buffer.clear()

# Global default flight recorder instance
default_recorder = FlightRecorder()
