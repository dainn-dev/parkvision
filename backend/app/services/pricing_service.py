"""Parking-fee estimator driven by tenant-configured pricing rules.

Rules live on `tenant_sites.public_profile.pricing` (camelCase JSONB —
`SitePricing`). The engine is deliberately deterministic and simple:

- `duration <= grace_minutes` → 0 VND.
- Otherwise billed per *started* block: `ceil(minutes / block_minutes)`
  blocks at `hourly_from` VND/hour (prorated to the block size).
- `daily_from` caps each rolling 24h window: `min(base, windows × daily)`.
- `overnight_from` adds a flat surcharge per overnight-window crossing,
  where the window runs `overnight_start_hour`→`overnight_end_hour` in the
  site's local timezone (wrapping midnight).
- `hourly_from is None` → not estimable → None (mobile renders "—").

This is an *estimate*: the operator's cashier remains the source of truth.
"""

import math
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app.schemas.resources import SitePricing


def _tz(name: str):
    try:
        return ZoneInfo(name or "UTC")
    except Exception:
        # host without tzdata (e.g. Windows dev) or a bad site value
        return timezone.utc


def _overnight_crossings(
    start_local: datetime,
    end_local: datetime,
    start_hour: int,
    end_hour: int,
) -> int:
    """Count how many overnight windows [start_hour, end_hour) the
    [start_local, end_local) interval intersects. Handles wrap-around
    (e.g. 22:00→06:00) by splitting each window at midnight."""
    if start_hour == end_hour or end_local <= start_local:
        return 0
    crossings = 0
    day = start_local.date() - timedelta(days=1)
    while True:
        w_start = datetime.combine(day, datetime.min.time(), tzinfo=start_local.tzinfo) + timedelta(
            hours=start_hour
        )
        if end_hour <= start_hour:
            w_end = w_start + timedelta(days=1, hours=end_hour - start_hour)
        else:
            w_end = w_start + timedelta(hours=end_hour - start_hour)
        if w_start >= end_local:
            break
        if w_end > start_local:
            crossings += 1
        day += timedelta(days=1)
    return crossings


def estimate_fee(
    pricing: dict | SitePricing | None,
    entered_at: datetime,
    exited_at: datetime,
    site_timezone: str = "UTC",
) -> int | None:
    """Estimated VND fee for [entered_at, exited_at); None when the site
    has no hourly rate configured."""
    if pricing is None:
        return None
    if isinstance(pricing, SitePricing):
        rules = pricing
    else:
        # SitePricing rejects invalid block sizes at API boundaries. Older or
        # out-of-band JSON profiles can still contain them, so normalize those
        # values before validation to keep fee estimation safe.
        profile = dict(pricing)
        block_key = "blockMinutes" if "blockMinutes" in profile else "block_minutes"
        block_minutes = profile.get(block_key)
        if isinstance(block_minutes, (int, float)) and block_minutes <= 0:
            profile[block_key] = 60
        rules = SitePricing.model_validate(profile)
    if rules.hourly_from is None:
        return None
    if exited_at <= entered_at:
        return 0

    minutes = (exited_at - entered_at).total_seconds() / 60
    if minutes <= rules.grace_minutes:
        return 0

    # Defensive: the schema enforces block_minutes >= 5, but stored
    # profiles written before that constraint (or edited out-of-band)
    # could still carry 0/negative — fall back to the 60-minute default
    # rather than dividing by zero.
    block_minutes = rules.block_minutes if rules.block_minutes and rules.block_minutes > 0 else 60

    blocks = math.ceil(minutes / block_minutes)
    fee = math.ceil(blocks * rules.hourly_from * (block_minutes / 60))

    if rules.daily_from is not None:
        windows = math.ceil(minutes / 1440)
        fee = min(fee, windows * rules.daily_from)

    if rules.overnight_from is not None:
        tz = _tz(site_timezone)
        crossings = _overnight_crossings(
            entered_at.astimezone(tz),
            exited_at.astimezone(tz),
            rules.overnight_start_hour,
            rules.overnight_end_hour,
        )
        fee += crossings * rules.overnight_from

    return fee


def pricing_from_profile(profile: dict | None) -> dict | None:
    """Extract the pricing dict from a stored public_profile JSONB blob."""
    if not profile:
        return None
    pricing = profile.get("pricing")
    return pricing if isinstance(pricing, dict) else None
