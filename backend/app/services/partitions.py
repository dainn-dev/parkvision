"""Partition maintenance: ensure future RANGE partitions exist."""

from datetime import date

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


def _month_iter(start: date, count: int) -> list[date]:
    out = []
    y, m = start.year, start.month
    for _ in range(count):
        out.append(date(y, m, 1))
        m += 1
        if m > 12:
            y, m = y + 1, 1
    return out


def _quarter_start(d: date) -> date:
    return date(d.year, ((d.month - 1) // 3) * 3 + 1, 1)


def _add_months(d: date, n: int) -> date:
    y, m = d.year, d.month + n
    while m > 12:
        y, m = y + 1, m - 12
    return date(y, m, 1)


async def _partition_names(db: AsyncSession, parent: str) -> set[str]:
    result = await db.execute(
        text(
            "SELECT c.relname FROM pg_inherits i "
            "JOIN pg_class c ON c.oid = i.inhrelid "
            "JOIN pg_class p ON p.oid = i.inhparent WHERE p.relname = :p"
        ),
        {"p": parent},
    )
    return {r[0] for r in result}


async def ensure_future_partitions(db: AsyncSession, lookahead_periods: int = 2) -> list[str]:
    """Create upcoming monthly/quarterly partitions. Idempotent."""
    created: list[str] = []
    today = date.today()

    existing = await _partition_names(db, "gate_telemetry_logs")
    for start in _month_iter(date(today.year, today.month, 1), lookahead_periods + 1):
        name = f"gate_telemetry_logs_{start.year}_{start.month:02d}"
        if name not in existing:
            end = _add_months(start, 1)
            await db.execute(
                text(
                    f"CREATE TABLE {name} PARTITION OF gate_telemetry_logs "
                    f"FOR VALUES FROM ('{start}') TO ('{end}')"
                )
            )
            created.append(name)

    existing = await _partition_names(db, "access_events")
    qs = _quarter_start(today)
    for i in range(lookahead_periods + 1):
        start = _add_months(qs, i * 3)
        end = _add_months(start, 3)
        name = f"access_events_{start.year}q{(start.month - 1) // 3 + 1}"
        if name not in existing:
            await db.execute(
                text(
                    f"CREATE TABLE {name} PARTITION OF access_events "
                    f"FOR VALUES FROM ('{start}') TO ('{end}')"
                )
            )
            created.append(name)

    return created
