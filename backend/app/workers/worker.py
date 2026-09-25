"""arq background worker: emails, imports, partition maintenance, sweepers.

Run: `python -m arq app.workers.worker.WorkerSettings`
"""

import base64
import json
from datetime import UTC, datetime, timedelta
from uuid import UUID

from arq import cron
from arq.connections import RedisSettings
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_session_factory
from app.core.redis_client import get_redis, telemetry_channel
from app.models import BarrierIncident, EdgeDevice, GateCommand
from app.services.email import send_invite_email, send_password_reset_email
from app.services.importer import import_vehicles_csv
from app.services.partitions import ensure_future_partitions


def _redis() -> RedisSettings:
    from urllib.parse import urlparse

    url = urlparse(get_settings().redis_url)
    return RedisSettings(
        host=url.hostname or "localhost",
        port=url.port or 6379,
        database=int((url.path or "/0").lstrip("/") or 0),
    )


async def _scoped(tenant_id: UUID | None = None, platform: bool = False) -> AsyncSession:
    session = get_session_factory()()
    await session.begin()
    await session.execute(
        text("SELECT set_config('app.current_tenant_id', :t, true)"),
        {"t": str(tenant_id) if tenant_id else ""},
    )
    await session.execute(
        text("SELECT set_config('app.is_platform_admin', :p, true)"),
        {"p": "true" if platform else "false"},
    )
    return session


async def task_send_invite(ctx: dict, email: str, tenant_name: str, invite_url: str) -> None:
    await send_invite_email(email, tenant_name=tenant_name, invite_url=invite_url)


async def task_send_password_reset(ctx: dict, email: str, reset_url: str) -> None:
    await send_password_reset_email(email, reset_url=reset_url)


async def task_vehicle_import(
    ctx: dict, tenant_id: str, site_id: str | None, csv_b64: str
) -> dict:
    async with (await _scoped(UUID(tenant_id))) as session:
        summary = await import_vehicles_csv(
            session,
            tenant_id=UUID(tenant_id),
            site_id=UUID(site_id) if site_id else None,
            csv_bytes=base64.b64decode(csv_b64),
        )
        await session.commit()
        return summary


async def cron_partitions(ctx: dict) -> list[str]:
    async with (await _scoped(platform=True)) as session:
        created = await ensure_future_partitions(
            session, get_settings().partition_lookahead_periods
        )
        await session.commit()
        return created


async def cron_command_timeouts(ctx: dict) -> int:
    """Mark SENT/PENDING commands past their timeout_at as timed out."""
    async with (await _scoped(platform=True)) as session:
        now = datetime.now(UTC)
        result = await session.execute(
            update(GateCommand)
            .where(GateCommand.status.in_(["pending", "sent", "acknowledged"]))
            .where(GateCommand.timeout_at < now)
            .values(status="timeout", error="edge did not acknowledge in time")
        )
        await session.commit()
        return result.rowcount or 0


async def cron_edge_offline(ctx: dict) -> int:
    """Flip edge devices with stale last_seen_at to offline + open incident."""
    settings = get_settings()
    cutoff = datetime.now(UTC) - timedelta(seconds=settings.edge_offline_after_seconds)
    async with (await _scoped(platform=True)) as session:
        result = await session.execute(
            select(EdgeDevice).where(
                EdgeDevice.status == "online",
                EdgeDevice.last_seen_at.is_not(None),
                EdgeDevice.last_seen_at < cutoff,
            )
        )
        devices = result.scalars().all()
        for device in devices:
            device.status = "offline"
            session.add(
                BarrierIncident(
                    tenant_id=device.tenant_id,
                    site_id=device.site_id,
                    kind="offline",
                    severity="critical",
                    status="open",
                    title=f"Edge device '{device.name}' went offline",
                    detail={
                        "edgeDeviceId": str(device.id),
                        "lastSeenAt": device.last_seen_at.isoformat() if device.last_seen_at else None,
                    },
                )
            )
            await get_redis().publish(
                telemetry_channel(str(device.tenant_id)),
                json.dumps({"kind": "device_offline", "edgeDeviceId": str(device.id)}),
            )
        await session.commit()
        return len(devices)


class WorkerSettings:
    functions = [
        task_send_invite,
        task_send_password_reset,
        task_vehicle_import,
    ]
    cron_jobs = [
        cron(cron_partitions, minute=15),  # hourly-ish partition safety net
        cron(cron_command_timeouts, second=30),
        cron(cron_edge_offline, second=30),
    ]
    redis_settings = _redis()


async def enqueue(email: str, tenant_name: str, invite_url: str) -> None:
    """Helper for API-side enqueue of the invite email."""
    from arq import create_pool

    pool = await create_pool(_redis())
    try:
        await pool.enqueue_job("task_send_invite", email, tenant_name, invite_url)
    finally:
        await pool.aclose()
