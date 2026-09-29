from datetime import datetime, timezone
from pathlib import Path
import sqlite3
import tempfile

from edge.camera_types import BoundingBox
from edge.tracker_state_store import TrackerStateStore


def test_tracker_state_survives_store_restart_and_enriches_plate() -> None:
    with tempfile.TemporaryDirectory() as raw:
        path = Path(raw) / "tracker.sqlite3"
        store = TrackerStateStore(path)
        store.upsert("session-1", "42", BoundingBox(1, 2, 30, 40),
                     datetime(2026, 7, 14, tzinfo=timezone.utc))
        store.upsert("session-1", "42", BoundingBox(5, 6, 30, 40),
                     datetime(2026, 7, 14, 0, 0, 1, tzinfo=timezone.utc), "51A12345")
        store.close()

        verification_db = sqlite3.connect(path)
        try:
            row = verification_db.execute(
                "SELECT plate,x,y,observed_at FROM tracker_observation WHERE session_id=? AND track_id=?",
                ("session-1", "42")).fetchone()
        finally:
            verification_db.close()
        assert row[0:3] == ("51A12345", 5, 6)
        assert row[3].endswith("+00:00")
