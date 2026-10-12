"""Driver membership plans + membership lifecycle.

Tenant-side functions take the caller's `db` (tenant_session — RLS filters
to the admin's tenant). Driver-side functions open platform_session (driver
tables + memberships are reached cross-tenant by design; queries are always
scoped to the authenticated driver's id).

Lifecycle: pending → active | rejected | cancelled; active → expired |
revoked | cancelled. Activation provisions a `registered_vehicles` row
(tag='member', membership window) so the edge whitelist opens the barrier;
leaving `active` suspends that row.
"""

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, update

from app.core.enums import VehicleStatus
from app.core.errors import conflict, not_found
from app.database import platform_session
from app.models import (
    DriverMembership,
    DriverUser,
    DriverVehicle,
    RegisteredVehicle,
    SiteMembershipPlan,
    Tenant,
    TenantSite,
)
from app.services.public_site_service import _listed_condition

ACTIVE_STATUSES = ("pending", "active")
TERMINAL_STATUSES = ("rejected", "cancelled", "expired", "revoked")


# ---------- shared ----------


async def _expire_stale(db) -> None:
    """Lazy expiry sweep: active memberships past ends_at → expired +
    suspend their whitelist vehicles. Gate access is also denied by
    valid_to, so this only fixes display/admin state."""
    now = datetime.now(timezone.utc)
    stale = (
        (
            await db.execute(
                select(DriverMembership).where(
                    DriverMembership.status == "active",
                    DriverMembership.ends_at.is_not(None),
                    DriverMembership.ends_at < now,
                )
            )
        )
        .scalars()
        .all()
    )
    for m in stale:
        m.status = "expired"
        if m.registered_vehicle_id is not None:
            await db.execute(
                update(RegisteredVehicle)
                .where(RegisteredVehicle.id == m.registered_vehicle_id)
                .values(status=str(VehicleStatus.SUSPENDED))
            )
    if stale:
        await db.flush()


def _plan_out(p: SiteMembershipPlan) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "description": p.description,
        "price_vnd": p.price_vnd,
        "duration_days": p.duration_days,
        "perks": list(p.perks or []),
        "badge": p.badge,
    }


# ---------- tenant admin: plans ----------


async def create_plan(db, tenant_id: uuid.UUID, site_id: uuid.UUID, body) -> SiteMembershipPlan:
    site = (
        await db.execute(
            select(TenantSite).where(TenantSite.id == site_id, TenantSite.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if site is None:
        raise not_found("site", site_id) from None
    p = SiteMembershipPlan(
        tenant_id=tenant_id,
        site_id=site_id,
        name=body.name,
        description=body.description,
        price_vnd=body.price_vnd,
        duration_days=body.duration_days,
        perks=list(body.perks or []),
        badge=body.badge,
        status=body.status or "active",
    )
    db.add(p)
    await db.flush()
    return p


async def list_plans(db, tenant_id: uuid.UUID, site_id: uuid.UUID) -> list[SiteMembershipPlan]:
    return list(
        (
            await db.execute(
                select(SiteMembershipPlan)
                .where(
                    SiteMembershipPlan.tenant_id == tenant_id,
                    SiteMembershipPlan.site_id == site_id,
                )
                .order_by(SiteMembershipPlan.created_at.desc())
            )
        )
        .scalars()
        .all()
    )


async def update_plan(
    db, tenant_id: uuid.UUID, plan_id: uuid.UUID, changes: dict
) -> SiteMembershipPlan:
    p = (
        await db.execute(
            select(SiteMembershipPlan).where(
                SiteMembershipPlan.id == plan_id,
                SiteMembershipPlan.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if p is None:
        raise not_found("membership_plan", plan_id) from None
    for k, v in changes.items():
        if v is not None:
            setattr(p, k, v)
    await db.flush()
    return p


# ---------- tenant admin: membership requests ----------


async def list_memberships(
    db,
    tenant_id: uuid.UUID,
    *,
    status: str | None,
    site_id: uuid.UUID | None,
    page: int,
    limit: int,
) -> tuple[list[dict], int]:
    await _expire_stale(db)
    cond = [DriverMembership.tenant_id == tenant_id]
    if status:
        cond.append(DriverMembership.status == status)
    if site_id:
        cond.append(DriverMembership.site_id == site_id)
    total = (
        await db.execute(select(func.count()).select_from(DriverMembership).where(*cond))
    ).scalar_one()
    rows = (
        (
            await db.execute(
                select(DriverMembership, DriverUser, SiteMembershipPlan, TenantSite)
                .join(DriverUser, DriverUser.id == DriverMembership.driver_id)
                .join(SiteMembershipPlan, SiteMembershipPlan.id == DriverMembership.plan_id)
                .join(TenantSite, TenantSite.id == DriverMembership.site_id)
                .where(*cond)
                .order_by(DriverMembership.created_at.desc())
                .offset((page - 1) * limit)
                .limit(limit)
            )
        )
        .all()
    )
    return [
        {
            "id": m.id,
            "driver_id": m.driver_id,
            "driver_name": d.full_name,
            "driver_email": d.email,
            "plate_number": m.plate_number,
            "plan_id": m.plan_id,
            "plan_name": p.name,
            "site_id": m.site_id,
            "site_name": s.name,
            "status": m.status,
            "starts_at": m.starts_at,
            "ends_at": m.ends_at,
            "admin_note": m.admin_note,
            "created_at": m.created_at,
        }
        for m, d, p, s in rows
    ], total


async def _get_membership(db, tenant_id: uuid.UUID, mid: uuid.UUID) -> DriverMembership:
    m = (
        await db.execute(
            select(DriverMembership).where(
                DriverMembership.id == mid, DriverMembership.tenant_id == tenant_id
            )
        )
    ).scalar_one_or_none()
    if m is None:
        raise not_found("membership", mid) from None
    return m


async def _suspend_whitelist(db, m: DriverMembership) -> None:
    if m.registered_vehicle_id is not None:
        await db.execute(
            update(RegisteredVehicle)
            .where(RegisteredVehicle.id == m.registered_vehicle_id)
            .values(status=str(VehicleStatus.SUSPENDED))
        )


async def _activate_membership_row(
    db, m: DriverMembership, admin_note: str | None
) -> DriverMembership:
    """Shared activation body: provisions/reuses the tenant whitelist
    `RegisteredVehicle` (tag='member', membership window) and marks the
    membership active. Used by both the tenant endpoint (tenant_session)
    and the driver payment path (platform_session)."""
    plan = (
        await db.execute(
            select(SiteMembershipPlan).where(SiteMembershipPlan.id == m.plan_id)
        )
    ).scalar_one_or_none()
    driver = (
        await db.execute(select(DriverUser).where(DriverUser.id == m.driver_id))
    ).scalar_one_or_none()

    now = datetime.now(timezone.utc)
    ends = now + timedelta(days=plan.duration_days if plan else 30)

    rv = (
        await db.execute(
            select(RegisteredVehicle).where(
                RegisteredVehicle.tenant_id == m.tenant_id,
                RegisteredVehicle.plate_normalized == m.plate_normalized,
            )
        )
    ).scalar_one_or_none()
    if rv is not None and rv.tag == "blacklist":
        raise conflict("Plate is blacklisted in this tenant") from None
    if rv is None:
        rv = RegisteredVehicle(
            tenant_id=m.tenant_id,
            plate_number=m.plate_number,
            plate_normalized=m.plate_normalized,
            owner_name=driver.full_name if driver else None,
            owner_email=driver.email if driver else None,
            owner_phone=driver.phone if driver else None,
            owner_category="member",
            tag="member",
            valid_from=now,
            valid_to=ends,
            status="active",
            notes=f"driver_membership:{m.id}",
        )
        db.add(rv)
        await db.flush()
    else:
        rv.tag = "member"
        rv.owner_category = rv.owner_category or "member"
        rv.status = "active"
        rv.valid_from = now
        rv.valid_to = ends
        if not rv.notes:
            rv.notes = f"driver_membership:{m.id}"

    m.registered_vehicle_id = rv.id
    m.status = "active"
    m.starts_at = now
    m.ends_at = ends
    if admin_note:
        m.admin_note = admin_note
    await db.flush()
    return m


async def activate_membership(
    db, tenant_id: uuid.UUID, mid: uuid.UUID, admin_note: str | None
) -> DriverMembership:
    await _expire_stale(db)
    m = await _get_membership(db, tenant_id, mid)
    if m.status != "pending":
        raise conflict(f"Membership is {m.status}, not pending") from None
    return await _activate_membership_row(db, m, admin_note)


async def reject_membership(
    db, tenant_id: uuid.UUID, mid: uuid.UUID, admin_note: str | None
) -> DriverMembership:
    m = await _get_membership(db, tenant_id, mid)
    if m.status != "pending":
        raise conflict(f"Membership is {m.status}, not pending") from None
    m.status = "rejected"
    if admin_note:
        m.admin_note = admin_note
    await db.flush()
    return m


async def revoke_membership(
    db, tenant_id: uuid.UUID, mid: uuid.UUID, admin_note: str | None
) -> DriverMembership:
    await _expire_stale(db)
    m = await _get_membership(db, tenant_id, mid)
    if m.status != "active":
        raise conflict(f"Membership is {m.status}, not active") from None
    m.status = "revoked"
    await _suspend_whitelist(db, m)
    if admin_note:
        m.admin_note = admin_note
    await db.flush()
    return m


# ---------- driver ----------


async def request_membership(
    driver_id: uuid.UUID, plan_id: uuid.UUID, vehicle_id: uuid.UUID
) -> DriverMembership:
    async with platform_session() as db:
        plan = (
            await db.execute(
                select(SiteMembershipPlan).where(SiteMembershipPlan.id == plan_id)
            )
        ).scalar_one_or_none()
        if plan is None or plan.status != "active":
            raise not_found("membership_plan", plan_id) from None

        site_row = (
            await db.execute(
                select(TenantSite, Tenant)
                .join(Tenant, Tenant.id == TenantSite.tenant_id)
                .where(
                    TenantSite.id == plan.site_id,
                    TenantSite.status == "active",
                    Tenant.status == "active",
                    _listed_condition(),
                )
            )
        ).one_or_none()
        if site_row is None:
            raise not_found("membership_plan", plan_id) from None

        vehicle = (
            await db.execute(
                select(DriverVehicle).where(
                    DriverVehicle.id == vehicle_id,
                    DriverVehicle.driver_id == driver_id,
                )
            )
        ).scalar_one_or_none()
        if vehicle is None:
            raise not_found("vehicle", vehicle_id) from None

        dup = (
            await db.execute(
                select(DriverMembership.id).where(
                    DriverMembership.driver_id == driver_id,
                    DriverMembership.site_id == plan.site_id,
                    DriverMembership.plate_normalized == vehicle.plate_normalized,
                    DriverMembership.status.in_(ACTIVE_STATUSES),
                )
            )
        ).scalar_one_or_none()
        if dup is not None:
            raise conflict("An active or pending membership already exists for this vehicle at this site") from None

        m = DriverMembership(
            driver_id=driver_id,
            plan_id=plan.id,
            site_id=plan.site_id,
            tenant_id=plan.tenant_id,
            driver_vehicle_id=vehicle.id,
            plate_number=vehicle.plate_number,
            plate_normalized=vehicle.plate_normalized,
            status="pending",
        )
        db.add(m)
        await db.flush()
        return m


async def list_my_memberships(driver_id: uuid.UUID) -> list[dict]:
    async with platform_session() as db:
        await _expire_stale(db)
        rows = (
            (
                await db.execute(
                    select(DriverMembership, SiteMembershipPlan, TenantSite, Tenant)
                    .join(SiteMembershipPlan, SiteMembershipPlan.id == DriverMembership.plan_id)
                    .join(TenantSite, TenantSite.id == DriverMembership.site_id)
                    .join(Tenant, Tenant.id == DriverMembership.tenant_id)
                    .where(DriverMembership.driver_id == driver_id)
                    .order_by(DriverMembership.created_at.desc())
                )
            )
            .all()
        )
    return [
        {
            "id": m.id,
            "plan": _plan_out(p),
            "site_id": s.id,
            "site_name": s.name,
            "tenant_slug": t.slug,
            "plate_number": m.plate_number,
            "status": m.status,
            "starts_at": m.starts_at,
            "ends_at": m.ends_at,
            "created_at": m.created_at,
        }
        for m, p, s, t in rows
    ]


async def cancel_membership(driver_id: uuid.UUID, mid: uuid.UUID) -> DriverMembership:
    async with platform_session() as db:
        await _expire_stale(db)
        m = (
            await db.execute(
                select(DriverMembership).where(
                    DriverMembership.id == mid, DriverMembership.driver_id == driver_id
                )
            )
        ).scalar_one_or_none()
        if m is None:
            raise not_found("membership", mid) from None
        if m.status not in ACTIVE_STATUSES:
            raise conflict(f"Membership is {m.status}") from None
        if m.status == "active":
            await _suspend_whitelist(db, m)
        m.status = "cancelled"
        await db.flush()
        return m


async def list_public_plans(db, site_id: uuid.UUID) -> list[dict]:
    """Active plans for a listed site (db = platform_session)."""
    from app.services.public_site_service import get_site

    await get_site(db, site_id)  # 404 unless listed + active tenant/site
    rows = (
        (
            await db.execute(
                select(SiteMembershipPlan).where(
                    SiteMembershipPlan.site_id == site_id,
                    SiteMembershipPlan.status == "active",
                )
            )
        )
        .scalars()
        .all()
    )
    return [_plan_out(p) for p in rows]
