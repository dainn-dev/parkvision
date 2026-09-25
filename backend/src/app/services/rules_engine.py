"""Access decision engine for plate reads.

Evaluates tenant_access_rules in priority order for a plate read at a site:
first enabled match wins. A vehicle row is required for allow-decisions when
rules reference vehicle attributes; unknown plates fall to the site's
default_decision (settings.defaultAccessDecision, default 'deny').
"""

import fnmatch
import re
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.access import RegisteredVehicle, TenantAccessRule
from app.models.enums import AccessDecision, RuleEffect, VehicleStatus
from app.models.sites import TenantSite

PLATE_RE = re.compile(r"^[A-Z0-9]{2,20}$")


def normalize_plate(raw: str) -> str:
    """Canonical plate form: uppercase alphanumerics only — separators
    (dashes, dots, spaces) are stripped so camera reads match registrations
    regardless of how the plate was typed."""
    return re.sub(r"[^A-Z0-9]", "", raw.upper())


@dataclass
class Decision:
    decision: str
    reason: str
    rule_id: uuid.UUID | None = None
    vehicle_id: uuid.UUID | None = None
    open_gate: bool = False


def _matches(rule: TenantAccessRule, ctx: dict) -> bool:
    m = rule.match or {}
    if not m:
        return True  # catch-all rule

    plates = m.get("plates")
    if plates and not any(fnmatch.fnmatchcase(ctx["plate"], p.upper()) for p in plates):
        return False

    kinds = m.get("vehicleKinds") or m.get("vehicle_kinds")
    if kinds and ctx.get("vehicle_kind") not in kinds:
        return False

    tags = m.get("tags")
    if tags and not set(tags) & set(ctx.get("tags") or []):
        return False

    gate_ids = m.get("gateIds") or m.get("gate_ids")
    if gate_ids and str(ctx.get("gate_id")) not in {str(g) for g in gate_ids}:
        return False

    directions = m.get("directions")
    if directions and ctx.get("direction") not in directions:
        return False

    return True


def _in_schedule(rule: TenantAccessRule, site_tz: str, now_utc: datetime) -> bool:
    sched = rule.schedule or {}
    if not sched:
        return True
    try:
        tz = ZoneInfo(site_tz or "UTC")
    except Exception:
        tz = ZoneInfo("UTC")
    local = now_utc.astimezone(tz)

    days = sched.get("daysOfWeek") or sched.get("days_of_week")
    if days and local.isoweekday() not in days:
        return False

    start = sched.get("startTime") or sched.get("start_time")
    end = sched.get("endTime") or sched.get("end_time")
    if start and end:
        t = local.time().replace(second=0, microsecond=0)
        if start <= end:
            if not (start <= t.strftime("%H:%M") <= end):
                return False
        else:  # overnight window e.g. 22:00-06:00
            cur = t.strftime("%H:%M")
            if not (cur >= start or cur <= end):
                return False
    return True


async def evaluate_plate_read(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    site: TenantSite,
    plate_raw: str,
    direction: str,
    gate_id: uuid.UUID | None,
    now_utc: datetime | None = None,
) -> Decision:
    now_utc = now_utc or datetime.now(UTC)
    plate = normalize_plate(plate_raw)
    if not PLATE_RE.match(plate):
        return Decision(AccessDecision.REVIEW.value, f"unreadable plate '{plate_raw}'")

    vehicle = (
        await db.execute(
            select(RegisteredVehicle).where(
                RegisteredVehicle.tenant_id == tenant_id,
                RegisteredVehicle.plate == plate,
            )
        )
    ).scalar_one_or_none()

    ctx = {
        "plate": plate,
        "vehicle_kind": vehicle.vehicle_kind if vehicle else None,
        "tags": vehicle.tags if vehicle else [],
        "gate_id": gate_id,
        "direction": direction,
    }

    rules = (
        (
            await db.execute(
                select(TenantAccessRule)
                .where(
                    TenantAccessRule.tenant_id == tenant_id,
                    TenantAccessRule.enabled.is_(True),
                    (TenantAccessRule.site_id == site.id) | TenantAccessRule.site_id.is_(None),
                )
                .order_by(TenantAccessRule.priority, TenantAccessRule.created_at)
            )
        )
        .scalars()
        .all()
    )

    for rule in rules:
        if not _in_schedule(rule, site.timezone, now_utc):
            continue
        if not _matches(rule, ctx):
            continue
        if rule.effect == RuleEffect.DENY.value:
            return Decision(
                AccessDecision.DENIED.value,
                f"denied by rule '{rule.name}'",
                rule.id,
                vehicle.id if vehicle else None,
            )
        # allow effect — vehicle must be registered & in its valid window
        if vehicle is None:
            return Decision(
                AccessDecision.DENIED.value,
                f"unregistered plate (allow rule '{rule.name}' requires registration)",
                rule.id,
            )
        if vehicle.status != VehicleStatus.ACTIVE.value:
            return Decision(
                AccessDecision.DENIED.value,
                f"vehicle {vehicle.status} (rule '{rule.name}')",
                rule.id,
                vehicle.id,
            )
        if vehicle.valid_from and now_utc < vehicle.valid_from:
            return Decision(AccessDecision.DENIED.value, "vehicle not yet valid", rule.id, vehicle.id)
        if vehicle.valid_until and now_utc > vehicle.valid_until:
            return Decision(AccessDecision.DENIED.value, "vehicle expired", rule.id, vehicle.id)
        return Decision(
            AccessDecision.ALLOWED.value,
            f"allowed by rule '{rule.name}'",
            rule.id,
            vehicle.id,
            open_gate=True,
        )

    default = (site.settings or {}).get("defaultAccessDecision", "deny")
    if default == "review":
        return Decision(AccessDecision.REVIEW.value, "no matching rule; flagged for review")
    return Decision(AccessDecision.DENIED.value, "no matching rule (default deny)")
