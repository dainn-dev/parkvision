"""arq job definitions + enqueue helper.

Enqueue degrades gracefully: if Redis is unreachable the caller still gets a
job id back (logged), so API flows (e.g. invites) never 500 on a queue blip.
"""

import csv
import io
import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from arq.connections import RedisSettings
from arq.connections import create_pool as arq_create_pool
from sqlalchemy import select, text, update

from app.core.config import get_settings
from app.db.session import db_session, tenant_session
from app.models import (
    AuditLog,
    EdgeDevice,
    RegisteredVehicle,
)
from app.services.email import send_email
from app.services.storage import get_bytes, presigned_get, put_bytes
from app.utils.misc import new_job_id, normalize_plate

log = logging.getLogger("worker")


def _redis_settings() -> RedisSettings:
    s = get_settings()
    dsn = str(s.redis_dsn)
    # arq wants host/port/db pieces; parse the redis:// URL
    from urllib.parse import urlparse

    u = urlparse(dsn)
    return RedisSettings(
        host=u.hostname or "localhost",
        port=u.port or 6379,
        database=int((u.path or "/0").lstrip("/") or 0),
        password=u.password,
    )


async def enqueue(job: str, **kwargs: Any) -> str:
    """Push a job onto the queue; returns a tracking id."""
    job_id = new_job_id()
    try:
        pool = await arq_create_pool(_redis_settings())
        await pool.enqueue_job(job, job_id, **kwargs)
        await pool.close()
    except Exception:
        log.exception("failed to enqueue %s", job)
    return job_id


# ---------- jobs ----------

async def send_email_job(ctx: dict, job_id: str, to: str, subject: str,
                         body_text: str, body_html: str | None = None) -> None:
    await send_email(to, subject, body_text, body_html)


async def export_audit_logs_job(
    ctx: dict, job_id: str, tenant_id: str,
    since: str | None, until: str | None,
) -> str:
    tid = uuid.UUID(tenant_id)
    stmt = select(AuditLog).order_by(AuditLog.created_at)
    if since:
        stmt = stmt.where(AuditLog.created_at >= datetime.fromisoformat(since))
    if until:
        stmt = stmt.where(AuditLog.created_at <= datetime.fromisoformat(until))
    async with tenant_session(tid) as session:
        rows = (await session.execute(stmt)).scalars().all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "id", "created_at", "actor_kind", "actor_id", "actor_label",
        "action", "target_type", "target_id", "ip", "detail",
    ])
    for r in rows:
        writer.writerow([
            str(r.id), r.created_at.isoformat(), r.actor_kind,
            str(r.actor_id or ""), r.actor_label, r.action,
            r.target_type, r.target_id, r.ip or "", str(r.detail),
        ])
    key = f"{tenant_id}/exports/audit-{job_id}.csv"
    await put_bytes(key, buf.getvalue().encode(), "text/csv")
    url = await presigned_get(key, get_settings().export_ttl_seconds)
    # deliver location over the tenant realtime channel
    from app.realtime.fanout import publish_event

    await publish_event(tid, "export_ready",
                        {"jobId": job_id, "kind": "audit_logs", "downloadUrl": url})
    return url


async def vehicle_import_job(ctx: dict, job_id: str, tenant_id: str, key: str) -> dict:
    tid = uuid.UUID(tenant_id)
    raw = await get_bytes(key)
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    created = updated = errors = 0
    async with tenant_session(tid) as session:
        for row in reader:
            plate = (row.get("plate_number") or row.get("plate") or "").strip()
            norm = normalize_plate(plate)
            if not norm:
                errors += 1
                continue
            try:
                async with session.begin_nested():
                    existing = (
                        await session.execute(
                            select(RegisteredVehicle).where(
                                RegisteredVehicle.normalized_plate == norm
                            )
                        )
                    ).scalar_one_or_none()
                    if existing:
                        for col in ("owner_name", "owner_contact", "vehicle_type"):
                            if row.get(col):
                                setattr(existing, col, row[col])
                        updated += 1
                    else:
                        session.add(RegisteredVehicle(
                            tenant_id=tid, plate_number=plate, normalized_plate=norm,
                            owner_name=row.get("owner_name", ""),
                            owner_contact=row.get("owner_contact", ""),
                            vehicle_type=row.get("vehicle_type", "car"),
                        ))
                        created += 1
            except Exception:
                errors += 1
                log.exception("vehicle import row failed")
    result = {"jobId": job_id, "created": created, "updated": updated, "errors": errors}
    from app.realtime.fanout import publish_event

    await publish_event(tid, "import_done", result)
    return result


async def ensure_partitions_job(ctx: dict, job_id: str | None = None) -> str:
    """Create next-period partitions for both partitioned tables.

    ``ensure_future_partitions()`` is SECURITY DEFINER owned by the migration
    role, so the app user only needs EXECUTE.
    """
    async with db_session() as session:
        res = await session.execute(text("SELECT ensure_future_partitions()"))
        created = res.scalar()
    return str(created)


async def edge_offline_check_job(ctx: dict, job_id: str | None = None) -> int:
    """Mark edge devices offline when their heartbeat is stale."""
    threshold = datetime.now(UTC) - timedelta(
        seconds=get_settings().edge_offline_after_seconds
    )
    async with db_session() as session:
        await session.execute(text("SELECT set_config('app.platform_admin','on',true)"))
        res = await session.execute(
            update(EdgeDevice)
            .where(EdgeDevice.status == "online")
            .where(
                (EdgeDevice.last_heartbeat_at < threshold)
                | EdgeDevice.last_heartbeat_at.is_(None)
            )
            .values(status="offline")
        )
        return res.rowcount or 0


async def session_cleanup_job(ctx: dict, job_id: str | None = None) -> int:
    """Purge sessions expired > 7 days ago."""
    cutoff = datetime.now(UTC) - timedelta(days=7)
    async with db_session() as session:
        await session.execute(text("SELECT set_config('app.platform_admin','on',true)"))
        from sqlalchemy import delete

        from app.models import UserSession

        res = await session.execute(
            delete(UserSession).where(UserSession.expires_at < cutoff)
        )
        return res.rowcount or 0


# ---------- arq worker settings ----------

from arq.cron import cron  # noqa: E402


class WorkerSettings:
    redis_settings = _redis_settings()
    functions = [
        send_email_job,
        export_audit_logs_job,
        vehicle_import_job,
        ensure_partitions_job,
        edge_offline_check_job,
        session_cleanup_job,
    ]
    cron_jobs = [
        cron(ensure_partitions_job, hour=3, minute=0),
        cron(edge_offline_check_job, minute=set(range(60))),
        cron(session_cleanup_job, hour=4, minute=30),
    ]
