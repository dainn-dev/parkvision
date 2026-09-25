"""Tenant-admin endpoints: sites, lanes, gates, edge devices, users."""

import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import PrincipalDep, client_ip, require_roles, tenant_scoped_session
from app.core.errors import conflict, forbidden, not_found
from app.core.security import new_opaque_token, token_digest
from app.models import (
    BarrierGate,
    EdgeDevice,
    SiteLane,
    Tenant,
    TenantSite,
    TenantUser,
)
from app.schemas.admin import (
    EdgeDeviceIn,
    EdgeDeviceOut,
    GateIn,
    GateOut,
    GateUpdateIn,
    LaneIn,
    LaneOut,
    SiteIn,
    SiteOut,
    TenantUserOut,
)
from app.schemas.auth import InviteUserIn, UpdateUserIn
from app.schemas.common import page_of, page_params
from app.services.audit import write_audit
from app.services.email import invite_email
from app.workers.jobs import enqueue

router = APIRouter(prefix="/tenants/{tenant_id}", tags=["tenant"])


# ---------- tenant info ----------

@router.get("", response_model=dict)
async def get_tenant(
    tenant_id: uuid.UUID,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
):
    tenant = await session.get(Tenant, tenant_id)
    if tenant is None:
        raise not_found("Tenant")
    return {
        "id": str(tenant.id), "name": tenant.name, "slug": tenant.slug,
        "status": tenant.status, "plan": tenant.plan,
        "featureFlags": tenant.feature_flags, "settings": tenant.settings,
    }


# ---------- sites ----------

@router.get("/sites")
async def list_sites(
    tenant_id: uuid.UUID,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    pg: tuple[int, int, str | None] = Depends(page_params),
):
    page, size, q = pg
    stmt = select(TenantSite).order_by(TenantSite.created_at.desc())
    count_stmt = select(func.count()).select_from(TenantSite)
    if q:
        stmt = stmt.where(TenantSite.name.ilike(f"%{q}%"))
        count_stmt = count_stmt.where(TenantSite.name.ilike(f"%{q}%"))
    total = (await session.execute(count_stmt)).scalar_one()
    rows = (await session.execute(stmt.offset((page - 1) * size).limit(size))).scalars().all()
    return page_of([SiteOut.model_validate(r) for r in rows], total, page, size)


@router.post("/sites", response_model=SiteOut, status_code=201)
async def create_site(
    tenant_id: uuid.UUID,
    body: SiteIn,
    request: Request,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    _: None = Depends(require_roles("admin")),
):
    site = TenantSite(
        tenant_id=tenant_id, name=body.name, timezone=body.timezone,
        address=body.address, status=body.status or "active",
    )
    session.add(site)
    await session.flush()
    await write_audit(session, principal=principal, action="site.create",
                      target_type="site", target_id=str(site.id), ip=client_ip(request))
    return SiteOut.model_validate(site)


@router.patch("/sites/{site_id}", response_model=SiteOut)
async def update_site(
    tenant_id: uuid.UUID,
    site_id: uuid.UUID,
    body: SiteIn,
    request: Request,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    _: None = Depends(require_roles("admin")),
):
    site = await session.get(TenantSite, site_id)
    if site is None or site.tenant_id != tenant_id:
        raise not_found("Site")
    for f, v in body.model_dump(exclude_unset=True).items():
        setattr(site, f, v)
    await write_audit(session, principal=principal, action="site.update",
                      target_type="site", target_id=str(site_id), ip=client_ip(request))
    return SiteOut.model_validate(site)


@router.delete("/sites/{site_id}", status_code=204)
async def delete_site(
    tenant_id: uuid.UUID,
    site_id: uuid.UUID,
    request: Request,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    _: None = Depends(require_roles("admin")),
):
    site = await session.get(TenantSite, site_id)
    if site is None or site.tenant_id != tenant_id:
        raise not_found("Site")
    await session.delete(site)
    await write_audit(session, principal=principal, action="site.delete",
                      target_type="site", target_id=str(site_id), ip=client_ip(request))


# ---------- lanes ----------

@router.get("/sites/{site_id}/lanes", response_model=list[LaneOut])
async def list_lanes(
    tenant_id: uuid.UUID, site_id: uuid.UUID,
    principal: PrincipalDep, session: AsyncSession = Depends(tenant_scoped_session),
):
    rows = (
        await session.execute(
            select(SiteLane).where(SiteLane.site_id == site_id).order_by(SiteLane.name)
        )
    ).scalars().all()
    return [LaneOut.model_validate(r) for r in rows]


@router.post("/sites/{site_id}/lanes", response_model=LaneOut, status_code=201)
async def create_lane(
    tenant_id: uuid.UUID, site_id: uuid.UUID, body: LaneIn,
    request: Request, principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    _: None = Depends(require_roles("admin")),
):
    lane = SiteLane(
        tenant_id=tenant_id, site_id=site_id, name=body.name,
        direction=body.direction, is_active=body.is_active,
    )
    session.add(lane)
    await session.flush()
    return LaneOut.model_validate(lane)


# ---------- gates ----------

@router.get("/sites/{site_id}/gates", response_model=list[GateOut])
async def list_gates(
    tenant_id: uuid.UUID, site_id: uuid.UUID,
    principal: PrincipalDep, session: AsyncSession = Depends(tenant_scoped_session),
):
    rows = (
        await session.execute(
            select(BarrierGate)
            .where(BarrierGate.site_id == site_id)
            .order_by(BarrierGate.name)
        )
    ).scalars().all()
    return [GateOut.model_validate(r) for r in rows]


@router.post("/sites/{site_id}/gates", response_model=GateOut, status_code=201)
async def create_gate(
    tenant_id: uuid.UUID, site_id: uuid.UUID, body: GateIn,
    request: Request, principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    _: None = Depends(require_roles("admin")),
):
    gate = BarrierGate(
        tenant_id=tenant_id, site_id=site_id, lane_id=body.lane_id,
        edge_device_id=body.edge_device_id, name=body.name,
        gate_type=body.gate_type, controller=body.controller,
    )
    session.add(gate)
    await session.flush()
    await write_audit(session, principal=principal, action="gate.create",
                      target_type="gate", target_id=str(gate.id), ip=client_ip(request))
    return GateOut.model_validate(gate)


@router.patch("/gates/{gate_id}", response_model=GateOut)
async def update_gate(
    tenant_id: uuid.UUID, gate_id: uuid.UUID, body: GateUpdateIn,
    request: Request, principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    _: None = Depends(require_roles("admin")),
):
    gate = await session.get(BarrierGate, gate_id)
    if gate is None or gate.tenant_id != tenant_id:
        raise not_found("Gate")
    for f, v in body.model_dump(exclude_unset=True).items():
        setattr(gate, f, v)
    return GateOut.model_validate(gate)


# ---------- edge devices ----------

@router.get("/sites/{site_id}/devices", response_model=list[EdgeDeviceOut])
async def list_devices(
    tenant_id: uuid.UUID, site_id: uuid.UUID,
    principal: PrincipalDep, session: AsyncSession = Depends(tenant_scoped_session),
):
    rows = (
        await session.execute(
            select(EdgeDevice).where(EdgeDevice.site_id == site_id)
        )
    ).scalars().all()
    return [EdgeDeviceOut.model_validate(r) for r in rows]


@router.post("/sites/{site_id}/devices", response_model=EdgeDeviceOut, status_code=201)
async def register_device(
    tenant_id: uuid.UUID, site_id: uuid.UUID, body: EdgeDeviceIn,
    request: Request, principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    _: None = Depends(require_roles("admin")),
):
    device = EdgeDevice(
        tenant_id=tenant_id, site_id=site_id, name=body.name,
        device_key=body.device_key, mac=body.mac, meta=body.meta,
    )
    session.add(device)
    await session.flush()
    return EdgeDeviceOut.model_validate(device)


# ---------- tenant users ----------

@router.get("/users")
async def list_users(
    tenant_id: uuid.UUID,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    pg: tuple[int, int, str | None] = Depends(page_params),
):
    page, size, q = pg
    stmt = select(TenantUser).order_by(TenantUser.email)
    count_stmt = select(func.count()).select_from(TenantUser)
    if q:
        stmt = stmt.where(TenantUser.email.ilike(f"%{q}%"))
        count_stmt = count_stmt.where(TenantUser.email.ilike(f"%{q}%"))
    total = (await session.execute(count_stmt)).scalar_one()
    rows = (await session.execute(stmt.offset((page - 1) * size).limit(size))).scalars().all()
    return page_of([TenantUserOut.model_validate(r) for r in rows], total, page, size)


@router.post("/users/invite", response_model=TenantUserOut, status_code=201)
async def invite_user(
    tenant_id: uuid.UUID,
    body: InviteUserIn,
    request: Request,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    _: None = Depends(require_roles("admin")),
):
    exists = (
        await session.execute(
            select(TenantUser).where(
                TenantUser.tenant_id == tenant_id, TenantUser.email == body.email
            )
        )
    ).scalar_one_or_none()
    if exists:
        raise conflict("User already exists in this tenant")
    invite = new_opaque_token()
    user = TenantUser(
        tenant_id=tenant_id,
        email=body.email,
        password_hash="!invited",  # noqa: S106 — unusable until accept-invite
        full_name=body.full_name,
        role=body.role,
        status="invited",
        invited_by=principal.user_id,
        invite_token_hash=token_digest(invite),
    )
    session.add(user)
    await session.flush()
    tenant = await session.get(Tenant, tenant_id)
    invite_url = f"{get_settings().invite_url_base}?token={invite}"
    subject, text_body, html = invite_email(invite_url, tenant.name if tenant else "")
    await enqueue("send_email", to=body.email, subject=subject,
                  body_text=text_body, body_html=html)
    await write_audit(session, principal=principal, action="user.invite",
                      target_type="tenant_user", target_id=str(user.id),
                      detail={"email": body.email, "role": body.role},
                      ip=client_ip(request))
    return TenantUserOut.model_validate(user)


@router.patch("/users/{user_id}", response_model=TenantUserOut)
async def update_user(
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    body: UpdateUserIn,
    request: Request,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    _: None = Depends(require_roles("admin")),
):
    user = await session.get(TenantUser, user_id)
    if user is None or user.tenant_id != tenant_id:
        raise not_found("User")
    if user.id == principal.user_id and body.status == "suspended":
        raise forbidden("Cannot suspend yourself")
    for f, v in body.model_dump(exclude_unset=True).items():
        setattr(user, f, v)
    await write_audit(session, principal=principal, action="user.update",
                      target_type="tenant_user", target_id=str(user_id),
                      detail=body.model_dump(exclude_unset=True), ip=client_ip(request))
    return TenantUserOut.model_validate(user)
