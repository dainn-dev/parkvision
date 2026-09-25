"""Platform-admin endpoints: tenant governance, admins, settings, flags,
session security, infrastructure monitoring."""

import uuid
from datetime import UTC, datetime

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import PrincipalDep, client_ip, platform_db, require_roles
from app.core.errors import conflict, not_found
from app.core.security import hash_password
from app.models import (
    BarrierGate,
    EdgeDevice,
    PlatformAdmin,
    PlatformSetting,
    Tenant,
    TenantSite,
    TenantUser,
    UserSession,
)
from app.schemas.admin import (
    AdminSessionOut,
    FeatureFlagsIn,
    InfraHealthOut,
    PlatformAdminCreateIn,
    PlatformAdminOut,
    PlatformAdminUpdateIn,
    PlatformSettingIn,
    PlatformSettingOut,
    TenantOut,
    TenantUpdateIn,
)
from app.schemas.common import page_of, page_params
from app.services.audit import write_audit

router = APIRouter(prefix="/platform", tags=["platform"])

PlatformDb = Depends(platform_db)


# ---------- tenants ----------

@router.get("/tenants")
async def list_tenants(
    principal: PrincipalDep,
    session: AsyncSession = PlatformDb,
    pg: tuple[int, int, str | None] = Depends(page_params),
):
    page, size, q = pg
    stmt = select(Tenant).order_by(Tenant.created_at.desc())
    count_stmt = select(func.count()).select_from(Tenant)
    if q:
        stmt = stmt.where(Tenant.name.ilike(f"%{q}%") | Tenant.slug.ilike(f"%{q}%"))
        count_stmt = count_stmt.where(
            Tenant.name.ilike(f"%{q}%") | Tenant.slug.ilike(f"%{q}%")
        )
    total = (await session.execute(count_stmt)).scalar_one()
    rows = (
        await session.execute(stmt.offset((page - 1) * size).limit(size))
    ).scalars().all()
    return page_of([TenantOut.model_validate(r) for r in rows], total, page, size)


@router.get("/tenants/{tenant_id}", response_model=TenantOut)
async def get_tenant(tenant_id: uuid.UUID, session: AsyncSession = PlatformDb):
    tenant = await session.get(Tenant, tenant_id)
    if tenant is None:
        raise not_found("Tenant")
    return TenantOut.model_validate(tenant)


@router.patch("/tenants/{tenant_id}", response_model=TenantOut)
async def update_tenant(
    tenant_id: uuid.UUID,
    body: TenantUpdateIn,
    request: Request,
    principal: PrincipalDep,
    session: AsyncSession = PlatformDb,
):
    tenant = await session.get(Tenant, tenant_id)
    if tenant is None:
        raise not_found("Tenant")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(tenant, field, value)
    await write_audit(
        session, principal=principal, action="platform.tenant.update",
        tenant_id=tenant_id, target_type="tenant", target_id=str(tenant_id),
        detail=body.model_dump(exclude_unset=True), ip=client_ip(request),
    )
    return TenantOut.model_validate(tenant)


@router.put("/tenants/{tenant_id}/feature-flags", response_model=TenantOut)
async def set_feature_flags(
    tenant_id: uuid.UUID,
    body: FeatureFlagsIn,
    request: Request,
    principal: PrincipalDep,
    session: AsyncSession = PlatformDb,
):
    tenant = await session.get(Tenant, tenant_id)
    if tenant is None:
        raise not_found("Tenant")
    tenant.feature_flags = {**tenant.feature_flags, **body.flags}
    await write_audit(
        session, principal=principal, action="platform.tenant.flags",
        tenant_id=tenant_id, target_type="tenant", target_id=str(tenant_id),
        detail=body.flags, ip=client_ip(request),
    )
    return TenantOut.model_validate(tenant)


@router.get("/tenants/{tenant_id}/stats")
async def tenant_stats(tenant_id: uuid.UUID, session: AsyncSession = PlatformDb):
    counts = {}
    for name, model in (
        ("sites", TenantSite), ("gates", BarrierGate),
        ("edgeDevices", EdgeDevice), ("users", TenantUser),
    ):
        counts[name] = (
            await session.execute(
                select(func.count()).select_from(model).where(model.tenant_id == tenant_id)
            )
        ).scalar_one()
    return counts


# ---------- platform admins ----------

@router.get("/admins", response_model=list[PlatformAdminOut])
async def list_admins(session: AsyncSession = PlatformDb):
    rows = (await session.execute(select(PlatformAdmin))).scalars().all()
    return [PlatformAdminOut.model_validate(r) for r in rows]


@router.post("/admins", response_model=PlatformAdminOut, status_code=201)
async def create_admin(
    body: PlatformAdminCreateIn,
    request: Request,
    principal: PrincipalDep,
    session: AsyncSession = PlatformDb,
    _: None = Depends(require_roles("superadmin", kind="platform")),
):
    exists = (
        await session.execute(
            select(PlatformAdmin).where(PlatformAdmin.email == body.email)
        )
    ).scalar_one_or_none()
    if exists:
        raise conflict("Email already registered")
    admin = PlatformAdmin(
        email=body.email,
        password_hash=hash_password(body.password),
        display_name=body.display_name,
        role=body.role,
    )
    session.add(admin)
    await session.flush()
    await write_audit(
        session, principal=principal, action="platform.admin.create",
        target_type="platform_admin", target_id=str(admin.id),
        ip=client_ip(request),
    )
    return PlatformAdminOut.model_validate(admin)


@router.patch("/admins/{admin_id}", response_model=PlatformAdminOut)
async def update_admin(
    admin_id: uuid.UUID,
    body: PlatformAdminUpdateIn,
    request: Request,
    principal: PrincipalDep,
    session: AsyncSession = PlatformDb,
    _: None = Depends(require_roles("superadmin", kind="platform")),
):
    admin = await session.get(PlatformAdmin, admin_id)
    if admin is None:
        raise not_found("Platform admin")
    data = body.model_dump(exclude_unset=True)
    if "password" in data:
        admin.password_hash = hash_password(data.pop("password"))
    for field, value in data.items():
        setattr(admin, field, value)
    await write_audit(
        session, principal=principal, action="platform.admin.update",
        target_type="platform_admin", target_id=str(admin_id),
        detail={k: ("***" if k == "password" else v) for k, v in data.items()},
        ip=client_ip(request),
    )
    return PlatformAdminOut.model_validate(admin)


# ---------- platform settings ----------

@router.get("/settings", response_model=list[PlatformSettingOut])
async def list_settings(session: AsyncSession = PlatformDb):
    rows = (await session.execute(select(PlatformSetting))).scalars().all()
    return [PlatformSettingOut.model_validate(r) for r in rows]


@router.put("/settings/{key}", response_model=PlatformSettingOut)
async def put_setting(
    key: str,
    body: PlatformSettingIn,
    request: Request,
    principal: PrincipalDep,
    session: AsyncSession = PlatformDb,
    _: None = Depends(require_roles("support", kind="platform")),
):
    row = await session.get(PlatformSetting, key)
    if row is None:
        row = PlatformSetting(key=key, value=body.value, updated_by=principal.user_id)
        session.add(row)
    else:
        row.value = body.value
        row.updated_by = principal.user_id
    await write_audit(
        session, principal=principal, action="platform.setting.update",
        target_type="platform_setting", target_id=key,
        detail=body.value, ip=client_ip(request),
    )
    return PlatformSettingOut.model_validate(row)


# ---------- session security ----------

@router.get("/sessions", response_model=list[AdminSessionOut])
async def list_sessions(
    session: AsyncSession = PlatformDb,
    user_id: uuid.UUID | None = Query(None),
    tenant_id: uuid.UUID | None = Query(None),
    active_only: bool = Query(True),
):
    stmt = select(UserSession).order_by(UserSession.created_at.desc()).limit(500)
    if user_id:
        stmt = stmt.where(UserSession.user_id == user_id)
    if tenant_id:
        stmt = stmt.where(UserSession.tenant_id == tenant_id)
    if active_only:
        stmt = stmt.where(UserSession.revoked_at.is_(None))
    rows = (await session.execute(stmt)).scalars().all()
    return [
        AdminSessionOut(
            session_id=r.id, user_kind=r.user_kind, user_id=r.user_id,
            tenant_id=r.tenant_id, ip=r.ip, user_agent=r.user_agent,
            created_at=r.created_at, expires_at=r.expires_at, revoked_at=r.revoked_at,
        )
        for r in rows
    ]


@router.delete("/sessions/{session_id}", status_code=204)
async def revoke_any_session(
    session_id: uuid.UUID,
    request: Request,
    principal: PrincipalDep,
    session: AsyncSession = PlatformDb,
):
    from app.services.auth_service import logout

    await logout(session, session_id=session_id)
    await write_audit(
        session, principal=principal, action="platform.session.revoke",
        target_type="user_session", target_id=str(session_id), ip=client_ip(request),
    )


# ---------- infrastructure monitoring ----------

@router.get("/infra/health", response_model=list[InfraHealthOut])
async def infra_health(session: AsyncSession = PlatformDb):
    checks: list[InfraHealthOut] = []

    try:
        await session.execute(text("SELECT 1"))
        checks.append(InfraHealthOut(service="postgres", status="ok"))
    except Exception as exc:
        checks.append(InfraHealthOut(service="postgres", status="down", detail=str(exc)[:200]))

    try:
        r = aioredis.from_url(str(get_settings().redis_dsn))
        await r.ping()
        await r.aclose()
        checks.append(InfraHealthOut(service="redis", status="ok"))
    except Exception as exc:
        checks.append(InfraHealthOut(service="redis", status="down", detail=str(exc)[:200]))

    try:
        import aiomqtt

        s = get_settings()
        async with aiomqtt.Client(
            hostname=s.mqtt_host, port=s.mqtt_port,
            username=s.mqtt_username, password=s.mqtt_password,
        ):
            checks.append(InfraHealthOut(service="mqtt", status="ok"))
    except Exception as exc:
        checks.append(InfraHealthOut(service="mqtt", status="down", detail=str(exc)[:200]))

    try:
        from app.services.storage import ensure_bucket

        await ensure_bucket()
        checks.append(InfraHealthOut(service="s3", status="ok"))
    except Exception as exc:
        checks.append(InfraHealthOut(service="s3", status="down", detail=str(exc)[:200]))

    online = (
        await session.execute(
            select(func.count()).select_from(EdgeDevice).where(EdgeDevice.status == "online")
        )
    ).scalar_one()
    checks.append(
        InfraHealthOut(service="edge_devices_online", status="info", detail=str(online))
    )
    checks.append(
        InfraHealthOut(
            service="checked_at", status="info", detail=datetime.now(UTC).isoformat()
        )
    )
    return checks
