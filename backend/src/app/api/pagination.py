"""Cursor pagination on (occurred_at|created_at, id) — stable under concurrent writes."""

import base64
import json
import uuid
from collections.abc import Sequence
from datetime import datetime

from fastapi import Query

from app.core.exceptions import ValidationError


def encode_cursor(ts: datetime, row_id: uuid.UUID) -> str:
    return base64.urlsafe_b64encode(json.dumps({"t": ts.isoformat(), "i": str(row_id)}).encode()).decode()


def decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        data = json.loads(base64.urlsafe_b64decode(cursor.encode()))
        return datetime.fromisoformat(data["t"]), uuid.UUID(data["i"])
    except Exception as exc:
        raise ValidationError("invalid cursor") from exc


class ListParams:
    """Query params shared by list endpoints: ?cursor= &limit=&search="""

    def __init__(
        self,
        cursor: str | None = Query(default=None),
        limit: int = Query(default=50, ge=1, le=200),
        search: str | None = Query(default=None, max_length=200),
    ):
        self.cursor = cursor
        self.limit = limit
        self.search = search


def apply_cursor(stmt, ts_col, id_col, cursor: str | None):
    if not cursor:
        return stmt
    ts, row_id = decode_cursor(cursor)
    return stmt.where((ts_col < ts) | ((ts_col == ts) & (id_col < row_id)))


def page_response(rows: Sequence, limit: int, ts_getter, serializer) -> dict:
    has_more = len(rows) > limit
    page_rows = rows[:limit]
    next_cursor = None
    if has_more and page_rows:
        last = page_rows[-1]
        ts, row_id = ts_getter(last)
        next_cursor = encode_cursor(ts, row_id)
    return {
        "data": [serializer(r) for r in page_rows],
        "page": {"nextCursor": next_cursor, "hasMore": has_more},
    }
