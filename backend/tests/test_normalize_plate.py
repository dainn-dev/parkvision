"""Contract test: normalize_plate must match the shared golden fixture.

GAP-EDGE-001 — Rust edge-client and Python backend each implement
normalize_plate in their own language.  This test (and the mirror
``access.rs::normalize_matches_shared_golden_cases``) both read the same
fixture file so any drift between the two implementations is caught.
"""

import json
from pathlib import Path

import pytest

from app.services.event_service import normalize_plate

_FIXTURE = Path(__file__).resolve().parent / "fixtures" / "normalize_plate_cases.json"
_CASES = json.loads(_FIXTURE.read_text(encoding="utf-8"))


@pytest.mark.parametrize(
    "plate_input,expected",
    [(c["input"], c["expected"]) for c in _CASES],
    ids=[c["input"] or "<empty>" for c in _CASES],
)
def test_normalize_plate_matches_golden(plate_input: str, expected: str) -> None:
    assert normalize_plate(plate_input) == expected
