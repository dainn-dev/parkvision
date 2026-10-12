"""Access decision + access-event recording (REST manual events & ANPR ingest)."""

import asyncio
import re
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import case, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import AccessDecision, EventDirection, VehicleStatus, VehicleTag
from app.config import settings as app_settings
from app.models import AccessEvent, DriverPayment, RegisteredVehicle, Tenant, TenantAccessRule, TenantSite


def normalize_plate(plate: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", plate.upper())


async def _final(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    plate_number: str | None,
    plate_normalized: str | None,
    direction: str | None,
    decision: str,
    reason: str,
    vehicle_id: uuid.UUID | None,
) -> tuple[str, str, uuid.UUID | None]:
    """Anti-passback gate on allow outcomes (uses ix_access_plate): a plate that
    just had an allowed event in the same direction cannot repeat inside the
    tenant's `anti_passback_window_minutes` window (default 5; set 0 or
    `anti_passback_enabled: false` in tenant settings to disable)."""
    if (
        decision != AccessDecision.ALLOW
        or direction
        not in (
            EventDirection.ENTRY,
            EventDirection.EXIT,
        )
        or not plate_normalized
    ):
        return decision, reason, vehicle_id
    settings_row = (
        await db.execute(select(Tenant.settings).where(Tenant.id == tenant_id))
    ).scalar_one_or_none() or {}
    if settings_row.get("anti_passback_enabled") is False:
        return decision, reason, vehicle_id
    try:
        window_minutes = int(settings_row.get("anti_passback_window_minutes") or 5)
    except (TypeError, ValueError):
        window_minutes = 5
    if window_minutes <= 0:
        return decision, reason, vehicle_id
    last = (
        await db.execute(
            select(AccessEvent.direction, AccessEvent.decision, AccessEvent.occurred_at)
            .where(
                AccessEvent.tenant_id == tenant_id,
                # events store the raw plate string — match raw or normalized form
                AccessEvent.plate_number.in_([plate_number, plate_normalized]),
            )
            .order_by(AccessEvent.occurred_at.desc())
            .limit(1)
        )
    ).first()
    if (
        last
        and last.decision == AccessDecision.ALLOW
        and last.direction == direction
        and (datetime.now(timezone.utc) - last.occurred_at).total_seconds() < window_minutes * 60
    ):
        return AccessDecision.DENY, "anti_passback", vehicle_id
    return decision, reason, vehicle_id


async def _paid_exit(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    plate_normalized: str,
    site_id: uuid.UUID | None,
) -> DriverPayment | None:
    """A paid 'session' payment for this plate+site within the grace window
    that hasn't already granted an exit. Tenant setting
    `paid_exit_grace_minutes` overrides the app-level default (15)."""
    settings_row = (
        await db.execute(select(Tenant.settings).where(Tenant.id == tenant_id))
    ).scalar_one_or_none() or {}
    try:
        grace = int(
            settings_row.get("paid_exit_grace_minutes") or app_settings.paid_exit_grace_minutes
        )
    except (TypeError, ValueError):
        grace = app_settings.paid_exit_grace_minutes
    cond = [
        DriverPayment.tenant_id == tenant_id,
        DriverPayment.plate_normalized == plate_normalized,
        DriverPayment.kind == "session",
        DriverPayment.status == "paid",
        DriverPayment.exit_granted_at.is_(None),
        DriverPayment.paid_at >= datetime.now(timezone.utc) - timedelta(minutes=grace),
    ]
    if site_id is not None:
        cond.append(DriverPayment.site_id == site_id)
    return (
        await db.execute(
            select(DriverPayment).where(*cond).order_by(DriverPayment.paid_at.desc()).limit(1)
        )
    ).scalar_one_or_none()


async def decide_access(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    plate_number: str | None,
    direction: str | None = None,
    site_id: uuid.UUID | None = None,
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
        (
            await db.execute(
                select(TenantAccessRule).where(
                    TenantAccessRule.tenant_id == tenant_id,
                    TenantAccessRule.active.is_(True),
                )
            )
        )
        .scalars()
        .all()
    )

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

    # Pay-before-exit: an otherwise-denied exit is allowed once per paid
    # session payment within the grace window. Blacklist is never
    # overridden; deny_list rules below still win over paid_exit.
    paid_payment: DriverPayment | None = None
    if (
        base_decision == AccessDecision.DENY
        and direction == EventDirection.EXIT
        and site_id is not None
        and (vehicle is None or vehicle.tag != VehicleTag.BLACKLIST)
    ):
        paid_payment = await _paid_exit(db, tenant_id, normalized, site_id)
        if paid_payment is not None:
            base_decision, reason = AccessDecision.ALLOW, "paid_exit"

    async def _stamp_final(result: tuple[str, str, uuid.UUID | None]):
        """Consume the paid exit only when the final outcome is allow."""
        if paid_payment is not None and result[0] == AccessDecision.ALLOW:
            paid_payment.exit_granted_at = datetime.now(timezone.utc)
            await db.flush()
        return result

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
            return await _stamp_final(
                await _final(
                    db,
                    tenant_id,
                    plate_number,
                    normalized,
                    direction,
                    AccessDecision.ALLOW,
                    f"rule:{rule.name}",
                    vehicle.id if vehicle else None,
                )
            )

    return await _stamp_final(
        await _final(
            db,
            tenant_id,
            plate_number,
            normalized,
            direction,
            base_decision,
            reason,
            vehicle.id if vehicle else None,
        )
    )


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
    decision, reason, vehicle_id = await decide_access(
        db, tenant_id, plate_number, direction=direction, site_id=site_id
    )
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
    if site_id is not None and str(decision) == AccessDecision.ALLOW:
        delta = 1 if direction == EventDirection.ENTRY else -1 if direction == EventDirection.EXIT else 0
        if delta:
            # floor 0 on exits; cap at 2x capacity when capacity is set
            await db.execute(
                update(TenantSite)
                .where(TenantSite.id == site_id, TenantSite.tenant_id == tenant_id)
                .values(
                    current_occupancy=func.greatest(
                        0,
                        func.least(
                            case(
                                (TenantSite.capacity > 0, TenantSite.capacity * 2),
                                else_=2_147_483_647,
                            ),
                            TenantSite.current_occupancy + delta,
                        ),
                    )
                )
            )
    if direction == EventDirection.EXIT and plate_number:
        # Lazy import: parking_service already imports normalize_plate from
        # this module at top level — a top-level import here would cycle.
        from app.services.parking_service import close_presence_for_plate

        await close_presence_for_plate(db, tenant_id=tenant_id, plate_number=plate_number)
    await db.flush()
    _publish_driver_hint(event)
    return event


def _publish_driver_hint(event: AccessEvent) -> None:
    """Fire-and-forget pub/sub hint for driver WebSocket clients.

    Subscribers get `{type:'session_event', ...}` on `pv:plate:{norm}` and
    refetch over REST — the socket carries no authoritative state, so a
    Redis outage or a rolled-back transaction degrades to plain polling.
    """
    if not event.plate_number:
        return
    try:
        import json as _json

        from app.redis_client import driver_plate_channel, get_redis

        payload = _json.dumps(
            {
                "type": "session_event",
                "plate": normalize_plate(event.plate_number),
                "direction": str(event.direction),
                "decision": str(event.decision),
                "siteId": str(event.site_id) if event.site_id else None,
                "at": event.occurred_at.isoformat() if event.occurred_at else None,
            }
        )
        asyncio.get_running_loop().create_task(
            get_redis().publish(driver_plate_channel(normalize_plate(event.plate_number)), payload)
        )
    except Exception:  # noqa: BLE001 — never let a hint break a gate write
        pass


async def count_access_events_today(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    res = await db.execute(
        select(func.count())
        .select_from(AccessEvent)
        .where(AccessEvent.tenant_id == tenant_id, AccessEvent.occurred_at >= start)
    )
    return int(res.scalar_one())
