import re
import uuid
from typing import Any

_PLATE_RE = re.compile(r"[^A-Z0-9]")


def normalize_plate(plate: str) -> str:
    return _PLATE_RE.sub("", plate.upper())


def new_job_id() -> str:
    return uuid.uuid4().hex


def model_dump(obj: Any) -> dict:
    """ORM instance → dict of column attributes."""
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}
