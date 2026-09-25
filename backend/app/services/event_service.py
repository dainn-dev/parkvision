"""Access decision + access-event recording (REST manual events & ANPR ingest)."""

import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import AccessDecision, VehicleStatus, VehicleTag
from app.models import AccessEvent, RegisteredVehicle, TenantAccessRule


def normalize_plate(plate: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", plate.upper())


async def decide_access(
    db: AsyncSession, tenant_id: uuid.UUID, plate_number: str | None
) -> tuple[str, str, uuid.UUID | None]:
    """Evaluate registered vehicles + access rules → (decision, reason, vehicle_id)."""
    if not plate_number:
        return AccessDecision.DENY, "no_plate_detected", None

    normalized = normalize_plate(plate_number)
    vehicle = (
        await db.execute(
            select(RegisteredVehicle).where(
                RegisteredVehicle.tenant_id == tenant_id,
                RegisteredVehicle.plate_normalized == normalized,
            )
        )
    ).scalar_one_or_none()

    # Rules can override the vehicle-list outcome (deny_list wins by priority).
    rules = (
        await db.execute(
            select(TenantAccessRule).where(
                TenantAccessRule.tenant_id == tenant_id,
                TenantAccessRule.active.is_(True),
            )
        )
    ).scalars().all()

    now = datetime.now(timezone.utc)

    def schedule_open(schedule: dict) -> bool:
        if not schedule:
            return True
        days = schedule.get("daysOfWeek")
        if days and now.isoweekday() not in days:
            return False
        start, end = schedule.get("startTime"), schedule.get("endTime")
        if start and end:
            t = now.strftime("%H:%M")
            if not (start <= t <= end):
                return False
        return True

    base_decision: str
    reason: str
    if vehicle is None:
        base_decision, reason = AccessDecision.DENY, "plate_not_registered"
    elif vehicle.tag == VehicleTag.BLACKLIST:
        base_decision, reason = AccessDecision.DENY, "vehicle_blacklisted"
    elif vehicle.status != VehicleStatus.ACTIVE:
        base_decision, reason = AccessDecision.DENY, "vehicle_suspended"
    elif vehicle.valid_from and vehicle.valid_from > now:
        base_decision, reason = AccessDecision.DENY, "vehicle_not_yet_valid"
    elif vehicle.valid_to and vehicle.valid_to < now:
        base_decision, reason = AccessDecision.DENY, "vehicle_expired"
    else:
        base_decision, reason = AccessDecision.ALLOW, "vehicle_registered"

    for rule in sorted(rules, key=lambda r: r.priority):
        applies = rule.conditions.get("tags") or rule.conditions.get("plates") or []
        if applies:
            tag_hit = vehicle is not None and vehicle.tag in applies
            plate_hit = normalized in [normalize_plate(p) for p in applies]
            if not (tag_hit or plate_hit):
                continue
        if not schedule_open(rule.schedule):
            continue
        if rule.rule_type == "deny_list":
            return AccessDecision.DENY, f"rule:{rule.name}", vehicle.id if vehicle else None
        if rule.rule_type == "allow_list":
            return AccessDecision.ALLOW, f"rule:{rule.name}", vehicle.id if vehicle else None

    return base_decision, reason, vehicle.id if vehicle else None


async def record_access_event(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    site_id: uuid.UUID | None,
    gate_id: uuid.UUID | None,
    lane_id: uuid.UUID | None,
    plate_number: str | None,
    direction: str,
    source: str,
    confidence: float | None = None,
    plate_image_url: str | None = None,
    overview_image_url: str | None = None,
    occurred_at: datetime | None = None,
    force_decision: str | None = None,
    force_reason: str | None = None,
) -> AccessEvent:
    decision, reason, vehicle_id = await decide_access(db, tenant_id, plate_number)
    if force_decision:
        decision, reason = force_decision, force_reason or "manual_override"
    event = AccessEvent(
        tenant_id=tenant_id,
        site_id=site_id,
        gate_id=gate_id,
        lane_id=lane_id,
        vehicle_id=vehicle_id,
        plate_number=plate_number,
        direction=direction,
        decision=str(decision),
        reason=reason,
        confidence=confidence,
        plate_image_url=plate_image_url,
        overview_image_url=overview_image_url,
        source=str(source),
        occurred_at=occurred_at or datetime.now(timezone.utc),
    )
    db.add(event)
    await db.flush()
    return event


async def count_access_events_today(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    res = await db.execute(
        select(func.count())
        .select_from(AccessEvent)
        .where(AccessEvent.tenant_id == tenant_id, AccessEvent.occurred_at >= start)
    )
    return int(res.scalar_one())
