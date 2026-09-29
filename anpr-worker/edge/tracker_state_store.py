"""Durable audit projection of TrackId -> plate -> position -> timestamp."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
import sqlite3
import threading

from edge.camera_types import BoundingBox


class TrackerStateStore:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        if str(path) != ":memory:":
            self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._db = sqlite3.connect(str(path), check_same_thread=False)
        with self._db:
            self._db.executescript("""
                CREATE TABLE IF NOT EXISTS tracker_observation (
                    session_id TEXT NOT NULL,
                    track_id TEXT NOT NULL,
                    plate TEXT,
                    x INTEGER NOT NULL, y INTEGER NOT NULL,
                    width INTEGER NOT NULL, height INTEGER NOT NULL,
                    observed_at TEXT NOT NULL,
                    PRIMARY KEY(session_id, track_id)
                );
                CREATE INDEX IF NOT EXISTS idx_tracker_observation_plate_time
                    ON tracker_observation(plate, observed_at DESC);
            """)

    def upsert(self, session_id: str, track_id: str, position: BoundingBox,
               observed_at: datetime, plate: str | None = None) -> None:
        with self._lock, self._db:
            self._db.execute("""
                INSERT INTO tracker_observation(session_id,track_id,plate,x,y,width,height,observed_at)
                VALUES(?,?,?,?,?,?,?,?)
                ON CONFLICT(session_id,track_id) DO UPDATE SET
                    plate=COALESCE(excluded.plate,tracker_observation.plate),
                    x=excluded.x,y=excluded.y,width=excluded.width,height=excluded.height,
                    observed_at=excluded.observed_at
            """, (session_id, track_id, plate, position.x, position.y,
                  position.width, position.height, observed_at.isoformat()))

    def close(self) -> None:
        with self._lock:
            self._db.close()
