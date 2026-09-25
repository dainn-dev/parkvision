"""Partition maintenance: keep future monthly/quarterly partitions ahead.

Runs as a weekly arq cron (and can be invoked manually). Creates partitions
for the next N months/quarters if they don't exist yet — plus the DEFAULT
partitions already catch anything missed.
"""

import logging
from datetime import UTC, datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger(__name__)


def _quarter_bounds(year: int, quarter: int) -> tuple[str, str, str]:
    start_month = (quarter - 1) * 3 + 1
    end_year, end_month = (year + 1, 1) if quarter == 4 else (year, start_month + 3)
    name = f"access_events_{year}_q{quarter}"
    return name, f"{year}-{start_month:02d}-01", f"{end_year}-{end_month:02d}-01"


def _month_bounds(year: int, month: int) -> tuple[str, str, str]:
    ny, nm = (year + 1, 1) if month == 12 else (year, month + 1)
    name = f"gate_telemetry_logs_{year}_{month:02d}"
    return name, f"{year}-{month:02d}-01", f"{ny}-{nm:02d}-01"


async def _partition_exists(db: AsyncSession, name: str) -> bool:
    return (
        await db.execute(text("SELECT to_regclass(:name) IS NOT NULL"), {"name": f"public.{name}"})
    ).scalar_one()


async def ensure_partitions(db: AsyncSession, months_ahead: int = 3, quarters_ahead: int = 2) -> list[str]:
    created: list[str] = []
    now = datetime.now(UTC)

    # access_events: quarterly
    year, quarter = now.year, (now.month - 1) // 3 + 1
    for i in range(quarters_ahead + 1):
        y, q = year, quarter + i
        while q > 4:
            q -= 4
            y += 1
        name, lo, hi = _quarter_bounds(y, q)
        if await _partition_exists(db, name):
            continue
        await db.execute(
            text(f"CREATE TABLE {name} PARTITION OF access_events " f"FOR VALUES FROM ('{lo}') TO ('{hi}')")
        )
        created.append(name)

    # gate_telemetry_logs: monthly
    year, month = now.year, now.month
    for i in range(months_ahead + 1):
        m = month + i
        y = year
        while m > 12:
            m -= 12
            y += 1
        name, lo, hi = _month_bounds(y, m)
        if await _partition_exists(db, name):
            continue
        await db.execute(
            text(
                f"CREATE TABLE {name} PARTITION OF gate_telemetry_logs "
                f"FOR VALUES FROM ('{lo}') TO ('{hi}')"
            )
        )
        created.append(name)

    if created:
        log.info("created partitions: %s", ", ".join(created))
    return created
