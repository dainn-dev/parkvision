"""arq job implementations: email, vehicle import, audit export, crons.

Note on transactions: `SET LOCAL` GUCs (RLS context) live only for the
current transaction, so each job opens its own SessionLocal and applies
set_rls_context right after begin().
"""

import csv
import io
import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, cast

from sqlalchemy import select, update
from sqlalchemy.engine import CursorResult

from app.config import get_settings
from app.db.session import SessionLocal, set_rls_context
from app.models.access import RegisteredVehicle
from app.models.enums import JobStatus
from app.models.events import AccessEvent
from app.models.ops import AuditLog, ExportJob, ImportJob
from app.models.sites import EdgeDevice
from app.services import email as email_svc
from app.services import partitions as partitions_svc
from app.services import rules_engine, storage

log = logging.getLogger(__name__)
settings = get_settings()


async def send_email(ctx: dict, to: str, subject: str, body: str) -> str:
    await email_svc.send_email(to, subject, body)
    return f"sent to {to}"


def _parse_dt(raw: str | None) -> datetime | None:
    raw = (raw or "").strip()
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return datetime.strptime(raw, "%Y-%m-%d").replace(tzinfo=UTC)


async def process_vehicle_import(ctx: dict, job_id: str) -> str:
    """CSV columns: plate, owner_name, vehicle_kind, tags (semicolon-sep),
    valid_from, valid_until, status, notes."""
    jid = uuid.UUID(job_id)

    # Load job under system ctx (tenant unknown yet)
    async with SessionLocal() as db:
        await db.begin()
        await set_rls_context(db, is_system=True)
        job = await db.get(ImportJob, jid)
        if job is None:
            return "job missing"
        tenant_id = job.tenant_id
        file_key = job.file_key
        if file_key is None:
            return "job missing file"
        job.status = JobStatus.RUNNING.value
        job.started_at = datetime.now(UTC)
        await db.commit()

    raw = await storage.get_bytes(file_key)
    ok = err = 0
    errors: list[dict] = []

    async with SessionLocal() as db:
        await db.begin()
        await set_rls_context(db, tenant_id=tenant_id, is_system=True)
        reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
        for i, row in enumerate(reader, start=2):  # header = row 1
            try:
                plate = rules_engine.normalize_plate(row.get("plate") or "")
                if not rules_engine.PLATE_RE.match(plate):
                    raise ValueError(f"bad plate {row.get('plate')!r}")
                async with db.begin_nested():  # SAVEPOINT per row
                    vehicle = RegisteredVehicle(
                        tenant_id=tenant_id,
                        plate=plate,
                        owner_name=(row.get("owner_name") or "").strip() or None,
                        vehicle_kind=(row.get("vehicle_kind") or "car").strip() or "car",
                        tags=[t.strip() for t in (row.get("tags") or "").split(";") if t.strip()],
                        valid_from=_parse_dt(row.get("valid_from")),
                        valid_until=_parse_dt(row.get("valid_until")),
                        status=(row.get("status") or "active").strip() or "active",
                        notes=(row.get("notes") or "").strip() or None,
                    )
                    db.add(vehicle)
                    await db.flush()
                ok += 1
            except Exception as exc:
                err += 1
                errors.append({"row": i, "error": str(exc)[:200]})
                if len(errors) >= 100:
                    errors.append({"row": -1, "error": "error list truncated"})
                    break
        job = await db.get(ImportJob, jid)
        if job is None:
            return "job vanished"
        job.total_rows = ok + err
        job.ok_rows = ok
        job.err_rows = err
        job.errors = errors
        job.finished_at = datetime.now(UTC)
        job.status = (
            JobStatus.SUCCEEDED.value
            if err == 0
            else JobStatus.PARTIAL.value
            if ok > 0
            else JobStatus.FAILED.value
        )
        await db.commit()
    return f"import done: {ok} ok, {err} err"


async def audit_export(ctx: dict, job_id: str) -> str:
    jid = uuid.UUID(job_id)
    async with SessionLocal() as db:
        await db.begin()
        await set_rls_context(db, is_system=True)
        job = await db.get(ExportJob, jid)
        if job is None:
            return "job missing"
        tenant_id = job.tenant_id
        params = job.params or {}
        job.status = JobStatus.RUNNING.value
        job.started_at = datetime.now(UTC)
        await db.commit()

    async with SessionLocal() as db:
        await db.begin()
        await set_rls_context(db, tenant_id=tenant_id, is_system=True)
        try:
            stmt = select(AuditLog).where(AuditLog.tenant_id == tenant_id).order_by(AuditLog.occurred_at)
            if params.get("date_from"):
                stmt = stmt.where(AuditLog.occurred_at >= datetime.fromisoformat(params["date_from"]))
            if params.get("date_to"):
                stmt = stmt.where(AuditLog.occurred_at <= datetime.fromisoformat(params["date_to"]))
            if params.get("action"):
                stmt = stmt.where(AuditLog.action.ilike(f"{params['action']}%"))

            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow(
                [
                    "occurred_at",
                    "actor_type",
                    "actor_id",
                    "action",
                    "target_type",
                    "target_id",
                    "ip",
                    "detail",
                ]
            )
            count = 0
            rows = (await db.execute(stmt)).scalars().all()
            for row in rows:
                writer.writerow(
                    [
                        row.occurred_at.isoformat() if row.occurred_at else "",
                        row.actor_type,
                        row.actor_id,
                        row.action,
                        row.target_type,
                        row.target_id,
                        str(row.ip) if row.ip else "",
                        row.detail,
                    ]
                )
                count += 1

            key = f"exports/{tenant_id}/{jid}.csv"
            await storage.ensure_bucket()
            await storage.put_bytes(key, buf.getvalue().encode(), content_type="text/csv")
            job = await db.get(ExportJob, jid)
            if job is None:
                return "job vanished"
            job.file_key = key
            job.row_count = count
            job.status = JobStatus.SUCCEEDED.value
            job.finished_at = datetime.now(UTC)
        except Exception as exc:
            job = await db.get(ExportJob, jid)
            if job is None:
                return "job vanished"
            job.status = JobStatus.FAILED.value
            job.error = str(exc)[:500]
            job.finished_at = datetime.now(UTC)
        await db.commit()
    return f"exported {job.row_count or 0} rows"


async def create_future_partitions(ctx: dict) -> str:
    """Weekly cron: keep monthly/quarterly partitions ahead of inserts."""
    async with SessionLocal() as db:
        await db.begin()
        await set_rls_context(db, is_system=True)
        created = await partitions_svc.ensure_partitions(db, months_ahead=3, quarters_ahead=2)
        await db.commit()
    return f"created: {created}"


async def device_offline_check(ctx: dict) -> str:
    """Mark edge devices offline when silent longer than the threshold."""
    cutoff = datetime.now(UTC) - timedelta(seconds=settings.edge_device_offline_seconds)
    async with SessionLocal() as db:
        await db.begin()
        await set_rls_context(db, is_system=True)
        res = await db.execute(
            update(EdgeDevice)
            .where(
                EdgeDevice.status == "online",
                (EdgeDevice.last_seen_at < cutoff) | EdgeDevice.last_seen_at.is_(None),
            )
            .values(status="offline")
        )
        await db.commit()
        n = cast(CursorResult[Any], res).rowcount or 0
        return f"marked {n} devices offline" if n else "all devices fresh"


async def image_retention(ctx: dict) -> str:
    """Delete access-event images older than IMAGE_RETENTION_DAYS."""
    cutoff = datetime.now(UTC) - timedelta(days=settings.image_retention_days)
    async with SessionLocal() as db:
        await db.begin()
        await set_rls_context(db, is_system=True)
        stmt = select(AccessEvent.plate_image_key, AccessEvent.overview_image_key).where(
            AccessEvent.occurred_at < cutoff,
            (AccessEvent.plate_image_key.isnot(None)) | (AccessEvent.overview_image_key.isnot(None)),
        )
        keys = [k for pair in (await db.execute(stmt)).all() for k in pair if k]
        for k in keys:
            try:
                await storage.delete_object(k)
            except Exception:
                log.warning("retention delete failed for %s", k)
        await db.execute(
            update(AccessEvent)
            .where(AccessEvent.occurred_at < cutoff)
            .values(plate_image_key=None, overview_image_key=None)
        )
        await db.commit()
        return f"purged {len(keys)} images"
