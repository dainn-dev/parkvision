"""Parking map tests — schemas (Task 2), service (Task 3), API (Task 7)."""

import pytest
from pydantic import ValidationError


def test_zone_bounds_rejects_overflow():
    from app.schemas.resources import ZoneBounds

    with pytest.raises(ValidationError):
        ZoneBounds(x=0.8, y=0.1, w=0.5, h=0.2)


def test_zone_bounds_accepts_full_map():
    from app.schemas.resources import ZoneBounds

    assert ZoneBounds(x=0, y=0, w=1, h=1).w == 1


def test_zone_bounds_rejects_negative():
    from app.schemas.resources import ZoneBounds

    with pytest.raises(ValidationError):
        ZoneBounds(x=-0.1, y=0, w=0.5, h=0.5)


def test_level_in_rejects_bad_status():
    import uuid

    from app.schemas.resources import ParkingLevelIn

    with pytest.raises(ValidationError):
        ParkingLevelIn(site_id=uuid.uuid4(), name="B1", status="bogus")
