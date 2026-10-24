"""Fee-engine unit tests (no DB): grace, block rounding, daily cap,
overnight windows, timezone handling."""

from datetime import datetime, timedelta, timezone

from app.services.pricing_service import estimate_fee

UTC = timezone.utc


def T(h=0, m=0, day=1):
    return datetime(2026, 10, day, h, m, tzinfo=UTC)


def test_no_pricing_returns_none():
    assert estimate_fee(None, T(), T(2)) is None
    assert estimate_fee({}, T(), T(2)) is None


def test_no_hourly_rate_returns_none():
    assert estimate_fee({"dailyFrom": 50000}, T(), T(2)) is None


def test_zero_or_negative_duration_is_zero():
    assert estimate_fee({"hourlyFrom": 20000}, T(1), T(1)) == 0
    assert estimate_fee({"hourlyFrom": 20000}, T(2), T(1)) == 0


def test_grace_period_free():
    p = {"hourlyFrom": 20000, "graceMinutes": 15}
    assert estimate_fee(p, T(), T(0, 15)) == 0
    assert estimate_fee(p, T(), T(0, 14)) == 0
    # beyond grace → whole duration billed (per started block)
    assert estimate_fee(p, T(), T(0, 16)) == 20000


def test_hourly_block_rounding():
    p = {"hourlyFrom": 20000}  # default 60-min blocks
    assert estimate_fee(p, T(), T(1)) == 20000
    assert estimate_fee(p, T(), T(1, 1)) == 40000  # 61 min → 2 blocks
    assert estimate_fee(p, T(), T(3)) == 60000


def test_smaller_block_rounding():
    p = {"hourlyFrom": 12000, "blockMinutes": 30}  # 6000/30min block
    assert estimate_fee(p, T(), T(1, 1)) == 18000  # 61min → 3 blocks
    assert estimate_fee(p, T(), T(0, 25)) == 6000


def test_zero_block_minutes_falls_back_to_hourly_default():
    # Legacy/out-of-band profile data can bypass SitePricing validation.
    p = {"hourlyFrom": 12000, "blockMinutes": 0}
    assert estimate_fee(p, T(), T(1, 1)) == 24000


def test_negative_block_minutes_falls_back_to_hourly_default():
    p = {"hourlyFrom": 12000, "blockMinutes": -30}
    assert estimate_fee(p, T(), T(1, 1)) == 24000


def test_daily_cap_per_24h_window():
    p = {"hourlyFrom": 20000, "dailyFrom": 100000}
    # 25h → 25 blocks = 500k raw, capped to 2 windows × 100k
    assert estimate_fee(p, T(), T(1, day=2)) == 200000
    # 5h → 100k raw == cap 100k
    assert estimate_fee(p, T(), T(5)) == 100000
    # 3h → 60k under cap
    assert estimate_fee(p, T(), T(3)) == 60000


def test_overnight_surcharge_counts_crossings():
    # window 22:00→06:00 local; 20:00 → next-day 07:00 crosses it once
    p = {"hourlyFrom": 10000, "overnightFrom": 80000}
    fee = estimate_fee(p, T(20), T(7, day=2))
    assert fee == 110000 + 80000  # 11h × 10k + one overnight

    # two nights: day1 20:00 → day3 08:00 crosses two windows
    fee = estimate_fee(p, T(20), T(8, day=3))
    assert fee == 360000 + 160000

    # 10:00 → 18:00 same day: no overnight
    assert estimate_fee(p, T(10), T(18)) == 80000


def test_overnight_window_respects_site_timezone():
    # site tz UTC+7; entry 15:30 UTC = 22:30 local → inside 22→06 window
    p = {"hourlyFrom": 10000, "overnightFrom": 50000}
    fee = estimate_fee(p, T(15, 30), T(16), site_timezone="Asia/Ho_Chi_Minh")
    # 30 min → 1 block = 10k, + 1 overnight crossing (entering at 22:30 local)
    assert fee == 10000 + 50000
    # same instants computed in UTC: 15:30 UTC not in 22→06 → no surcharge
    fee_utc = estimate_fee(p, T(15, 30), T(16), site_timezone="UTC")
    assert fee_utc == 10000


def test_accepts_validated_schema_input():
    from app.schemas.resources import SitePricing

    p = SitePricing(hourly_from=5000, grace_minutes=10)
    assert estimate_fee(p, T(), T(1)) == 5000


def test_long_stay_mixed_rules():
    p = {
        "hourlyFrom": 10000,
        "dailyFrom": 50000,
        "overnightFrom": 30000,
        "graceMinutes": 10,
        "blockMinutes": 60,
    }
    # 2h stay, no overnight → 20k
    assert estimate_fee(p, T(10), T(12)) == 20000
    # 30h stay → cap 2×50k = 100k, +1 overnight crossing (spans 22→6)
    assert estimate_fee(p, T(10), T(16, day=2)) == 100000 + 30000
