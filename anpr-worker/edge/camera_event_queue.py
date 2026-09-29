"""Durable SQLite spool for typed camera-ingest events."""

from __future__ import annotations

import json
from pathlib import Path
import sqlite3
import threading
import time
import base64


_SCHEMA = """
CREATE TABLE IF NOT EXISTS camera_events (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id              TEXT NOT NULL UNIQUE,
    envelope_json         TEXT NOT NULL,
    snapshot_name         TEXT,
    snapshot_content_type TEXT,
    snapshot              BLOB,
    snapshot_bundle_json  TEXT,
    attempts              INTEGER NOT NULL DEFAULT 0,
    next_attempt          REAL NOT NULL DEFAULT 0,
    created_at            REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_camera_events_due
    ON camera_events (next_attempt, id);
"""


class CameraEventQueue:
    """Thread-safe, bounded and restart-safe camera event queue."""

    def __init__(self, path: str | Path, max_events: int = 5000):
        self.path = Path(path)
        self.max_events = max(1, int(max_events))
        self._lock = threading.Lock()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._connection = sqlite3.connect(self.path, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        with self._connection:
            self._connection.executescript(_SCHEMA)
            columns = {row[1] for row in self._connection.execute("PRAGMA table_info(camera_events)")}
            if "snapshot_bundle_json" not in columns:
                self._connection.execute("ALTER TABLE camera_events ADD COLUMN snapshot_bundle_json TEXT")

    def enqueue(self, envelope: dict[str, object], *, snapshot: bytes | None = None,
                snapshot_name: str | None = None,
                snapshot_content_type: str | None = None,
                snapshots: dict[str, tuple[str, bytes, str]] | None = None,
                next_attempt: float = 0.0) -> None:
        event_id = str(envelope.get("eventId", "")).strip()
        if not event_id:
            raise ValueError("camera event envelope requires eventId")
        value = json.dumps(envelope, sort_keys=True, separators=(",", ":"))
        bundle = None if not snapshots else json.dumps({
            kind: {"name": item[0], "data": base64.b64encode(item[1]).decode("ascii"), "content_type": item[2]}
            for kind, item in snapshots.items()
        }, sort_keys=True, separators=(",", ":"))
        with self._lock:
            try:
                with self._connection:
                    self._connection.execute(
                        "INSERT INTO camera_events "
                        "(event_id, envelope_json, snapshot_name, snapshot_content_type, "
                        "snapshot, snapshot_bundle_json, next_attempt, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        (event_id, value, snapshot_name, snapshot_content_type,
                         sqlite3.Binary(snapshot) if snapshot is not None else None,
                         bundle,
                         float(next_attempt), time.time()),
                    )
            except sqlite3.IntegrityError:
                return
            self._enforce_cap_locked()

    def due_events(self, limit: int = 20, now: float | None = None) -> list[dict[str, object]]:
        cutoff = time.time() if now is None else now
        with self._lock:
            rows = self._connection.execute(
                "SELECT * FROM camera_events WHERE next_attempt <= ? "
                "ORDER BY id ASC LIMIT ?", (cutoff, int(limit))).fetchall()
        return [self._row(item) for item in rows]

    def mark_attempt(self, row_id: int, next_attempt: float) -> None:
        with self._lock, self._connection:
            self._connection.execute(
                "UPDATE camera_events SET attempts = attempts + 1, next_attempt = ? "
                "WHERE id = ?", (next_attempt, row_id))

    def delete(self, row_id: int) -> None:
        with self._lock, self._connection:
            self._connection.execute("DELETE FROM camera_events WHERE id = ?", (row_id,))

    def count(self) -> int:
        with self._lock:
            return int(self._connection.execute(
                "SELECT COUNT(*) FROM camera_events").fetchone()[0])

    def close(self) -> None:
        with self._lock:
            self._connection.close()

    def _enforce_cap_locked(self) -> None:
        count = int(self._connection.execute(
            "SELECT COUNT(*) FROM camera_events").fetchone()[0])
        overflow = count - self.max_events
        if overflow > 0:
            with self._connection:
                self._connection.execute(
                    "DELETE FROM camera_events WHERE id IN "
                    "(SELECT id FROM camera_events ORDER BY id ASC LIMIT ?)",
                    (overflow,))

    @staticmethod
    def _row(row: sqlite3.Row) -> dict[str, object]:
        snapshot = row["snapshot"]
        bundle_raw = row["snapshot_bundle_json"]
        bundle_json = json.loads(bundle_raw) if bundle_raw else {}
        return {
            "id": int(row["id"]),
            "attempts": int(row["attempts"]),
            "envelope": json.loads(row["envelope_json"]),
            "snapshot_name": row["snapshot_name"],
            "snapshot_content_type": row["snapshot_content_type"],
            "snapshot": bytes(snapshot) if snapshot is not None else None,
            "snapshots": {kind: (item["name"], base64.b64decode(item["data"]), item["content_type"])
                          for kind, item in bundle_json.items()},
        }
