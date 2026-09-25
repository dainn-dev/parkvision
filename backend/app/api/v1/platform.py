"""Platform-admin endpoints: tenant governance, admins, settings, flags, infra."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, or_, select, update

from app.api.deps import AuthContext, require_platform_admin
from app.core.enums import ActorType, PlatformAdminRole
from app.core.errors import conflict, not_found
from app.database import platform_session
from app.models import (
    FeatureFlag,
    PlatformAdmin,
    PlatformSetting,
    Tenant,
    TenantUser,
    UserSession,
)
from app.schemas.auth import SessionOut
from app.schemas.common import MessageOut, Page, paginate
from app.schemas.resources import (
    FeatureFlagIn,
    FeatureFlagOut,
    PlatformAdminIn,
    PlatformAdminOut,
    PlatformSettingIn,
    PlatformSettingOut,
    TenantCreateIn,
    TenantOut,
    TenantUpdateIn,
)
from app.security import hash_password
from app.services.audit_service import write_audit
from app.services.infra_service import infra_status

router = APIRouter(
    prefix="/platform",
    tags=["platform"],
    dependencies=[Depends(require_platform_admin())],
)


# ---------- tenants ----------
@router.get("/tenants", response_model=Page[TenantOut])
async def list_tenants(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    status: str | None = None,
    search: str | None = None,
) -> Page[TenantOut]:
    async with platform_session() as db:
        q = select(Tenant)
        count_q = select(func.count()).select_from(Tenant)
        if status:
            q = q.where(Tenant.status == status)
            count_q = count_q.where(Tenant.status == status)
        if search:
            like = f"%{search}%"
            cond = or_(Tenant.name.ilike(like), Tenant.slug.ilike(like))
            q = q.where(cond)
            count_q = count_q.where(cond)
        total = (await db.execute(count_q)).scalar_one()
        rows = (
            (await db.execute(q.order_by(Tenant.created_at.desc()).offset((page - 1) * limit).limit(limit)))
            .scalars()
            .all()
        )
    return paginate([TenantOut.model_validate(r) for r in rows], total, page, limit)


@router.post("/tenants", response_model=TenantOut, status_code=201)
async def create_tenant(
    body: TenantCreateIn,
    request: Request,
    auth: AuthContext = Depends(
        require_platform_admin((PlatformAdminRole.SUPER_ADMIN, PlatformAdminRole.OPS))
    ),
) -> TenantOut:
    async with platform_session() as db:
        tenant = Tenant(
            name=body.name,
            slug=body.slug,
            plan_code=body.plan_code,
            contact_email=body.contact_email.lower(),
            settings=body.settings,
        )
        db.add(tenant)
        try:
            await db.flush()
        except Exception:
            raise conflict("Tenant slug is already taken") from None
        await write_audit(
            db,
            tenant_id=tenant.id,
            actor_type=ActorType.PLATFORM_ADMIN,
            actor_id=auth.user_id,
            actor_email=None,
            action="platform.tenant.created",
            resource_type="tenant",
            resource_id=str(tenant.id),
            ip=request.client.host if request.client else None,
        )
    return TenantOut.model_validate(tenant)


@router.get("/tenants/{tenant_id}", response_model=TenantOut)
async def get_tenant(tenant_id: uuid.UUID) -> TenantOut:
    async with platform_session() as db:
        row = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if row is None:
        raise not_found("tenant", tenant_id) from None
    return TenantOut.model_validate(row)


@router.patch("/tenants/{tenant_id}", response_model=TenantOut)
async def update_tenant(
    tenant_id: uuid.UUID,
    body: TenantUpdateIn,
    request: Request,
    auth: AuthContext = Depends(
        require_platform_admin((PlatformAdminRole.SUPER_ADMIN, PlatformAdminRole.OPS))
    ),
) -> TenantOut:
    async with platform_session() as db:
        row = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
        if row is None:
            raise not_found("tenant", tenant_id) from None
        changes = body.model_dump(exclude_unset=True)
        for k, v in changes.items():
            setattr(row, k, v)
        await write_audit(
            db,
            tenant_id=tenant_id,
            actor_type=ActorType.PLATFORM_ADMIN,
            actor_id=auth.user_id,
            actor_email=None,
            action="platform.tenant.updated",
            resource_type="tenant",
            resource_id=str(tenant_id),
            details={"changes": list(changes.keys())},
            ip=request.client.host if request.client else None,
        )
        await db.flush()
        await db.refresh(row)
    return TenantOut.model_validate(row)


@router.get("/tenants/{tenant_id}/users", response_model=list)
async def list_tenant_users(tenant_id: uuid.UUID) -> list:
    async with platform_session() as db:
        rows = (await db.execute(select(TenantUser).where(TenantUser.tenant_id == tenant_id))).scalars().all()
    return [
        {
            "id": str(r.id),
            "email": r.email,
            "fullName": r.full_name,
            "role": r.role,
            "status": r.status,
            "mfaEnabled": r.mfa_enabled,
        }
        for r in rows
    ]


# ---------- platform admins ----------
@router.get("/admins", response_model=list[PlatformAdminOut])
async def list_admins() -> list[PlatformAdminOut]:
    async with platform_session() as db:
        rows = (await db.execute(select(PlatformAdmin))).scalars().all()
    return [PlatformAdminOut.model_validate(r) for r in rows]


@router.post("/admins", response_model=PlatformAdminOut, status_code=201)
async def create_admin(
    body: PlatformAdminIn,
    auth: AuthContext = Depends(require_platform_admin((PlatformAdminRole.SUPER_ADMIN,))),
) -> PlatformAdminOut:
    async with platform_session() as db:
        row = PlatformAdmin(
            email=body.email.lower(),
            password_hash=hash_password(body.password),
            full_name=body.full_name,
            role=body.role,
        )
        db.add(row)
        try:
            await db.flush()
        except Exception:
            raise conflict("An admin with this email already exists") from None
        await write_audit(
            db,
            tenant_id=None,
            actor_type=ActorType.PLATFORM_ADMIN,
            actor_id=auth.user_id,
            actor_email=None,
            action="platform.admin.created",
            resource_type="platform_admin",
            resource_id=str(row.id),
        )
    return PlatformAdminOut.model_validate(row)


# ---------- settings & feature flags ----------
@router.get("/settings", response_model=list[PlatformSettingOut])
async def list_settings() -> list[PlatformSettingOut]:
    async with platform_session() as db:
        rows = (await db.execute(select(PlatformSetting))).scalars().all()
    return [PlatformSettingOut.model_validate(r) for r in rows]


@router.put("/settings/{key}", response_model=PlatformSettingOut)
async def put_setting(
    key: str,
    body: PlatformSettingIn,
    auth: AuthContext = Depends(
        require_platform_admin((PlatformAdminRole.SUPER_ADMIN, PlatformAdminRole.OPS))
    ),
) -> PlatformSettingOut:
    async with platform_session() as db:
        row = (
            await db.execute(select(PlatformSetting).where(PlatformSetting.key == key))
        ).scalar_one_or_none()
        if row is None:
            row = PlatformSetting(key=key, value=body.value)
            db.add(row)
        else:
            row.value = body.value
        await write_audit(
            db,
            tenant_id=None,
            actor_type=ActorType.PLATFORM_ADMIN,
            actor_id=auth.user_id,
            actor_email=None,
            action="platform.setting.updated",
            resource_type="platform_setting",
            resource_id=key,
        )
    return PlatformSettingOut.model_validate(row)


@router.get("/feature-flags", response_model=list[FeatureFlagOut])
async def list_flags() -> list[FeatureFlagOut]:
    async with platform_session() as db:
        rows = (await db.execute(select(FeatureFlag))).scalars().all()
    return [FeatureFlagOut.model_validate(r) for r in rows]


@router.put("/feature-flags/{key}", response_model=FeatureFlagOut)
async def put_flag(
    key: str,
    body: FeatureFlagIn,
    auth: AuthContext = Depends(
        require_platform_admin((PlatformAdminRole.SUPER_ADMIN, PlatformAdminRole.OPS))
    ),
) -> FeatureFlagOut:
    async with platform_session() as db:
        row = (await db.execute(select(FeatureFlag).where(FeatureFlag.key == key))).scalar_one_or_none()
        if row is None:
            row = FeatureFlag(
                key=key,
                description=body.description,
                enabled=body.enabled,
                tenant_overrides=body.tenant_overrides,
            )
            db.add(row)
        else:
            row.description = body.description
            row.enabled = body.enabled
            row.tenant_overrides = body.tenant_overrides
        await write_audit(
            db,
            tenant_id=None,
            actor_type=ActorType.PLATFORM_ADMIN,
            actor_id=auth.user_id,
            actor_email=None,
            action="platform.flag.updated",
            resource_type="feature_flag",
            resource_id=key,
            details={"enabled": body.enabled},
        )
    return FeatureFlagOut.model_validate(row)


# ---------- infrastructure & sessions ----------
@router.get("/infra/health")
async def infra_health() -> dict:
    return {"data": await infra_status()}


@router.get("/sessions", response_model=list[SessionOut])
async def list_all_sessions(
    user_id: uuid.UUID | None = None,
    tenant_id: uuid.UUID | None = None,
    active_only: bool = True,
) -> list[SessionOut]:
    async with platform_session() as db:
        q = select(UserSession).order_by(UserSession.created_at.desc()).limit(500)
        if user_id:
            q = q.where(UserSession.user_id == user_id)
        if tenant_id:
            q = q.where(UserSession.tenant_id == tenant_id)
        if active_only:
            q = q.where(UserSession.revoked_at.is_(None), UserSession.expires_at > datetime.now(timezone.utc))
        rows = (await db.execute(q)).scalars().all()
    return [SessionOut.model_validate(r) for r in rows]


@router.post("/sessions/{session_id}/revoke", response_model=MessageOut)
async def revoke_any_session(
    session_id: uuid.UUID,
    auth: AuthContext = Depends(
        require_platform_admin((PlatformAdminRole.SUPER_ADMIN, PlatformAdminRole.SUPPORT))
    ),
) -> MessageOut:
    async with platform_session() as db:
        await db.execute(
            update(UserSession)
            .where(UserSession.id == session_id)
            .values(revoked_at=datetime.now(timezone.utc))
        )
        await write_audit(
            db,
            tenant_id=None,
            actor_type=ActorType.PLATFORM_ADMIN,
            actor_id=auth.user_id,
            actor_email=None,
            action="platform.session.revoked",
            resource_type="user_session",
            resource_id=str(session_id),
        )
    return MessageOut(message="Session revoked")
