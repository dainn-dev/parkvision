"""arq background jobs + enqueue helpers used by the API process.

Jobs run in the `worker` container (`arq app.workers.jobs.WorkerSettings`):
- send_invite_email       : tenant user invite via SMTP (Mailpit in dev)
- vehicle_import          : CSV rows -> registered_vehicles
- audit_export            : audit_logs -> CSV in S3 + presigned download URL
- create_future_partitions: monthly telemetry / quarterly event partitions
- expire_stale_commands   : gate commands past timeout -> 'timeout'
- mark_offline_devices    : heartbeat staleness sweep
- cleanup_expired_sessions: hard-delete sessions expired > 30 days
- incident_notify         : CRITICAL incidents -> tenant webhook + Telegram
"""

import uuid
from datetime import datetime, timedelta, timezone

from arq.connections import ArqRedis, RedisSettings, create_pool

from app.config import settings

_pool: ArqRedis | None = None


def redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(settings.redis_url)


async def arq_pool() -> ArqRedis:
    global _pool
    if _pool is None:
        _pool = await create_pool(redis_settings())
    return _pool


# ---------- enqueue helpers (API side) ----------


async def enqueue_invite_email(
    email: str, full_name: str, tenant_id: str, invite_token: str, expires: str
) -> None:
    pool = await arq_pool()
    await pool.enqueue_job(
        "send_invite_email",
        email=email,
        full_name=full_name,
        tenant_id=tenant_id,
        invite_token=invite_token,
        expires=expires,
    )


async def enqueue_import_vehicles(job_id: str, tenant_id: str, rows: list[dict]) -> None:
    pool = await arq_pool()
    await pool.enqueue_job("vehicle_import", job_id=job_id, tenant_id=tenant_id, rows=rows)


async def enqueue_audit_export(
    job_id: str, tenant_id: str, from_ts: str | None, to_ts: str | None, action: str | None
) -> None:
    pool = await arq_pool()
    await pool.enqueue_job(
        "audit_export",
        job_id=job_id,
        tenant_id=tenant_id,
        from_ts=from_ts,
        to_ts=to_ts,
        action=action,
    )


# ---------- job implementations (worker side) ----------


async def _finish_job(
    db, job, status: str, result: dict | None = None, error: str | None = None, row_count: int = 0
) -> None:
    job.status = status
    job.finished_at = datetime.now(timezone.utc)
    job.row_count = row_count
    if result is not None:
        job.result = {**job.result, **result}
    if error:
        job.error = error


async def send_invite_email(
    ctx, email: str, full_name: str, tenant_id: str, invite_token: str, expires: str
) -> None:
    from email.message import EmailMessage

    import aiosmtplib

    link = f"{settings.app_base_url}/activate?token={invite_token}"
    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = email
    msg["Subject"] = "You're invited to Vehicle Management"
    msg.set_content(
        f"Hi {full_name},\n\n"
        f"You have been invited to join a Vehicle Management workspace.\n"
        f"Activate your account here: {link}\n\n"
        f"This link expires at {expires}.\n"
    )
    await aiosmtplib.send(
        msg,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_username or None,
        password=settings.smtp_password or None,
        start_tls=settings.smtp_tls,
    )


async def vehicle_import(ctx, job_id: str, tenant_id: str, rows: list[dict]) -> None:
    from sqlalchemy import select

    from app.database import platform_session
    from app.models import BackgroundJob, RegisteredVehicle
    from app.services.event_service import normalize_plate

    tid = uuid.UUID(tenant_id)
    created, skipped, errors = 0, 0, []
    async with platform_session() as db:
        job = (
            await db.execute(select(BackgroundJob).where(BackgroundJob.id == uuid.UUID(job_id)))
        ).scalar_one_or_none()
        if job is None:
            return
        job.status = "running"
        await db.flush()

        for i, row in enumerate(rows):
            plate = (row.get("plate_number") or "").strip()
            if not plate:
                skipped += 1
                continue
            normalized = normalize_plate(plate)
            exists = (
                await db.execute(
                    select(RegisteredVehicle.id).where(
                        RegisteredVehicle.tenant_id == tid,
                        RegisteredVehicle.plate_normalized == normalized,
                    )
                )
            ).scalar_one_or_none()
            if exists:
                skipped += 1
                continue
            db.add(
                RegisteredVehicle(
                    tenant_id=tid,
                    plate_number=plate.upper(),
                    plate_normalized=normalized,
                    owner_name=(row.get("owner_name") or "").strip() or None,
                    owner_contact=(row.get("owner_contact") or "").strip() or None,
                    vehicle_type=(row.get("vehicle_type") or "").strip() or None,
                    tag=(row.get("tag") or "standard").strip() or "standard",
                    notes=(row.get("notes") or "").strip() or None,
                )
            )
            created += 1
            if i % 200 == 199:
                job.progress = min(99, int(i / len(rows) * 100))
                await db.flush()
        await _finish_job(
            db,
            job,
            "done",
            {"created": created, "skipped": skipped, "errors": errors[:50]},
            row_count=created,
        )


async def audit_export(
    ctx, job_id: str, tenant_id: str, from_ts: str | None, to_ts: str | None, action: str | None
) -> None:
    import csv
    import io

    from sqlalchemy import select

    from app.database import platform_session
    from app.models import AuditLog, BackgroundJob
    from app.services.storage import presign_download, s3_client

    tid = uuid.UUID(tenant_id)
    async with platform_session() as db:
        job = (
            await db.execute(select(BackgroundJob).where(BackgroundJob.id == uuid.UUID(job_id)))
        ).scalar_one_or_none()
        if job is None:
            return
        job.status = "running"
        await db.flush()

        cond = [AuditLog.tenant_id == tid]
        if from_ts:
            cond.append(AuditLog.created_at >= datetime.fromisoformat(from_ts))
        if to_ts:
            cond.append(AuditLog.created_at <= datetime.fromisoformat(to_ts))
        if action:
            cond.append(AuditLog.action.ilike(f"{action}%"))

        rows = (
            (await db.execute(select(AuditLog).where(*cond).order_by(AuditLog.created_at).limit(200_000)))
            .scalars()
            .all()
        )

        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(
            [
                "id",
                "created_at",
                "actor_type",
                "actor_id",
                "actor_email",
                "action",
                "resource_type",
                "resource_id",
                "ip",
                "details",
            ]
        )
        for r in rows:
            writer.writerow(
                [
                    r.id,
                    r.created_at.isoformat(),
                    r.actor_type,
                    r.actor_id,
                    r.actor_email,
                    r.action,
                    r.resource_type,
                    r.resource_id,
                    r.ip,
                    __import__("json").dumps(r.details),
                ]
            )
        key = f"{tid}/exports/audit-{job_id}.csv"
        s3_client().put_object(
            Bucket=settings.s3_bucket,
            Key=key,
            Body=buf.getvalue().encode(),
            ContentType="text/csv",
        )
        await _finish_job(
            db,
            job,
            "done",
            {"objectKey": key, "downloadUrl": presign_download(key)},
            row_count=len(rows),
        )


# ---------- scheduled maintenance jobs ----------


async def create_future_partitions(ctx) -> int:
    """Ensure next-period partitions exist for both partitioned parents."""
    from sqlalchemy import text

    from app.database import engine

    created = 0
    now = datetime.now(timezone.utc)
    async with engine.begin() as conn:
        for months_ahead in (0, 1, 2):
            start = (now.replace(day=1) + timedelta(days=32 * months_ahead)).replace(day=1)
            end = (start + timedelta(days=32)).replace(day=1)
            name = f"gate_telemetry_logs_{start.year}_{start.month:02d}"
            await conn.execute(
                text(f"""
                CREATE TABLE IF NOT EXISTS {name}
                PARTITION OF gate_telemetry_logs
                FOR VALUES FROM ('{start:%Y-%m}-01') TO ('{end:%Y-%m}-01')
            """)
            )
            created += 1

        quarter = (now.month - 1) // 3 + 1
        for q_ahead in (0, 1):
            q = quarter + q_ahead
            year = now.year + (q - 1) // 4
            q = ((q - 1) % 4) + 1
            start_month = (q - 1) * 3 + 1
            n_year, n_month = (year + 1, 1) if q == 4 else (year, start_month + 3)
            name = f"access_events_{year}_q{q}"
            await conn.execute(
                text(f"""
                CREATE TABLE IF NOT EXISTS {name}
                PARTITION OF access_events
                FOR VALUES FROM ('{year}-{start_month:02d}-01') TO ('{n_year}-{n_month:02d}-01')
            """)
            )
            created += 1
    return created


async def expire_stale_commands(ctx) -> int:
    from app.database import platform_session
    from app.services.command_service import expire_stale_commands as _expire

    async with platform_session() as db:
        return await _expire(db)


async def mark_offline_devices(ctx, stale_seconds: int = 30) -> int:
    from sqlalchemy import update

    from app.database import platform_session
    from app.models import EdgeDevice

    cutoff = datetime.now(timezone.utc) - timedelta(seconds=stale_seconds)
    async with platform_session() as db:
        res = await db.execute(
            update(EdgeDevice)
            .where(
                EdgeDevice.status == "online",
                (EdgeDevice.last_heartbeat_at.is_(None)) | (EdgeDevice.last_heartbeat_at < cutoff),
            )
            .values(status="offline")
        )
        return res.rowcount


async def cleanup_expired_sessions(ctx) -> int:
    from sqlalchemy import delete

    from app.database import platform_session
    from app.models import UserSession

    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    async with platform_session() as db:
        res = await db.execute(delete(UserSession).where(UserSession.expires_at < cutoff))
        return res.rowcount


MAX_NOTIFY_ATTEMPTS = 5


async def incident_notify(ctx) -> int:
    """Deliver CRITICAL incident alerts to the tenant's webhook + Telegram.

    `tenants.settings` keys (snake_case, set via PUT /tenants/{id}/settings):
    webhook_url, telegram_chat_id, notify_on_critical. The Telegram bot token
    comes from platform_settings key `telegram_bot_token`.
    Retries up to MAX_NOTIFY_ATTEMPTS, then dead-letters via `notify_error`.
    """
    import httpx
    from sqlalchemy import select

    from app.database import platform_session
    from app.models import BarrierIncident, PlatformSetting, Tenant

    delivered = 0
    async with platform_session() as db:
        rows = (
            (
                await db.execute(
                    select(BarrierIncident)
                    .where(
                        BarrierIncident.severity == "critical",
                        BarrierIncident.status != "resolved",
                        BarrierIncident.notified_at.is_(None),
                        BarrierIncident.notify_attempts < MAX_NOTIFY_ATTEMPTS,
                    )
                    .limit(50)
                )
            )
            .scalars()
            .all()
        )
        if not rows:
            return 0

        bot_token = (
            await db.execute(select(PlatformSetting.value).where(PlatformSetting.key == "telegram_bot_token"))
        ).scalar_one_or_none()

        async with httpx.AsyncClient(timeout=10.0) as client:
            for inc in rows:
                tenant = (
                    await db.execute(select(Tenant).where(Tenant.id == inc.tenant_id))
                ).scalar_one_or_none()
                tcfg = (tenant.settings or {}) if tenant else {}
                if tcfg.get("notify_on_critical") is False:
                    inc.notified_at = datetime.now(timezone.utc)
                    delivered += 1
                    continue

                payload = {
                    "incidentId": str(inc.id),
                    "tenantId": str(inc.tenant_id),
                    "siteId": str(inc.site_id) if inc.site_id else None,
                    "gateId": str(inc.gate_id) if inc.gate_id else None,
                    "type": inc.type,
                    "severity": inc.severity,
                    "description": inc.description,
                    "detectedAt": inc.detected_at.isoformat() if inc.detected_at else None,
                }
                errors: list[str] = []
                attempted = False

                webhook = tcfg.get("webhook_url")
                if webhook:
                    attempted = True
                    try:
                        resp = await client.post(webhook, json=payload)
                        if resp.status_code >= 400:
                            errors.append(f"webhook http {resp.status_code}")
                    except Exception as exc:  # network/timeout -> retry later
                        errors.append(f"webhook {exc.__class__.__name__}")

                chat_id = tcfg.get("telegram_chat_id")
                if chat_id and bot_token:
                    attempted = True
                    try:
                        text = (
                            f"[{inc.severity.upper()}] {inc.type}\n"
                            f"{inc.description or ''}\n"
                            f"incident={inc.id} gate={inc.gate_id}"
                        )
                        resp = await client.post(
                            f"https://api.telegram.org/bot{bot_token}/sendMessage",
                            json={"chat_id": chat_id, "text": text},
                        )
                        if resp.status_code >= 400:
                            errors.append(f"telegram http {resp.status_code}")
                    except Exception as exc:
                        errors.append(f"telegram {exc.__class__.__name__}")
                elif chat_id and not bot_token:
                    errors.append("telegram_bot_token not configured")

                if not attempted:
                    # No channel configured — mark done so the sweep skips it.
                    inc.notified_at = datetime.now(timezone.utc)
                    delivered += 1
                elif errors:
                    inc.notify_attempts = (inc.notify_attempts or 0) + 1
                    inc.notify_error = "; ".join(errors)[:500]
                    if inc.notify_attempts >= MAX_NOTIFY_ATTEMPTS:
                        inc.notified_at = datetime.now(timezone.utc)  # dead-letter
                else:
                    inc.notified_at = datetime.now(timezone.utc)
                    inc.notify_error = None
                    delivered += 1
    return delivered
