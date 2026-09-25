"""Platform governance: tenants, admins, settings, flags, sessions, infra."""

import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import (
    Principal,
    csrf_protect,
    platform_db,
    require_platform_admin,
)
from app.core.errors import bad_request, conflict
from app.core.security import hash_password, new_opaque_token
from app.models import (
    AuditLog,
    FeatureFlag,
    PlatformAdmin,
    PlatformSetting,
    Tenant,
    TenantRegistration,
    TenantUser,
    UserInvite,
    UserSession,
)
from app.models.enums import AccountStatus, ActorKind, RegistrationStatus, TenantStatus
from app.schemas.auth import SessionInfo
from app.schemas.common import Page
from app.schemas.identity import (
    FeatureFlagCreate,
    FeatureFlagOut,
    FeatureFlagUpdate,
    PlatformAdminCreate,
    PlatformAdminOut,
    PlatformAdminUpdate,
    RegistrationOut,
    RegistrationReview,
    SettingOut,
    SettingUpsert,
    TenantCreate,
    TenantOut,
    TenantUpdate,
    TenantUserOut,
)
from app.schemas.operations import AuditLogOut, InfraHealthOut
from app.services import auth_service
from app.services.audit import audit
from app.services.common import apply_update, get_or_404, paginate

log = logging.getLogger("parkvision.api.platform")

router = APIRouter(prefix="/platform", tags=["platform"])

AdminDep = Annotated[Principal, Depends(require_platform_admin())]
WriteAdmin = Annotated[Principal, Depends(require_platform_admin("super_admin", "support"))]
SuperAdmin = Annotated[Principal, Depends(require_platform_admin("super_admin"))]
DbDep = Annotated[AsyncSession, Depends(platform_db)]


# ---------- Tenants ----------


@router.get("/tenants", response_model=Page[TenantOut])
async def list_tenants(
    _: AdminDep,
    db: DbDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status_filter: str | None = Query(None, alias="status"),
) -> Page[TenantOut]:
    stmt = select(Tenant).order_by(Tenant.created_at.desc())
    count = select(func.count()).select_from(Tenant)
    if status_filter:
        stmt = stmt.where(Tenant.status == status_filter)
        count = count.where(Tenant.status == status_filter)
    items, total = await paginate(db, stmt, count, page=page, page_size=page_size)
    return Page(
        items=[TenantOut.model_validate(t) for t in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/tenants", status_code=201, response_model=TenantOut, dependencies=[Depends(csrf_protect)])
async def create_tenant(payload: TenantCreate, request: Request, admin: WriteAdmin, db: DbDep) -> TenantOut:
    if (await db.execute(select(Tenant).where(Tenant.slug == payload.slug))).scalar_one_or_none():
        raise conflict("Slug already in use")
    tenant = Tenant(name=payload.name, slug=payload.slug, plan_code=payload.plan_code)
    db.add(tenant)
    await db.flush()

    owner = TenantUser(
        tenant_id=tenant.id,
        email=payload.owner_email.lower(),
        full_name=payload.owner_name,
        role="owner",
        status=AccountStatus.INVITED,
        invited_at=datetime.now(UTC),
    )
    db.add(owner)
    await db.flush()

    raw, token_hash = new_opaque_token()
    invite = UserInvite(
        tenant_id=tenant.id,
        email=owner.email,
        role="owner",
        token_hash=token_hash,
        invited_by_id=admin.id,
        expires_at=datetime.now(UTC) + timedelta(days=7),
    )
    db.add(invite)

    invite_url = f"{get_settings().api_base_url}/accept-invite?token={raw}"
    try:
        from arq import create_pool

        from app.workers.worker import _redis

        pool = await create_pool(_redis())
        try:
            await pool.enqueue_job("task_send_invite", owner.email, tenant.name, invite_url)
        finally:
            await pool.aclose()
    except Exception:
        log.warning("invite email enqueue failed for %s; invite token stored anyway", owner.email)

    await audit(
        db,
        action="platform.tenant_created",
        actor_kind=ActorKind.PLATFORM_ADMIN,
        actor_id=admin.id,
        tenant_id=tenant.id,
        target_type="tenant",
        target_id=str(tenant.id),
        detail={"slug": tenant.slug},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return TenantOut.model_validate(tenant)


@router.get("/tenants/{tenant_id}", response_model=TenantOut)
async def get_tenant(tenant_id: UUID, _: AdminDep, db: DbDep) -> TenantOut:
    return TenantOut.model_validate(await get_or_404(db, Tenant, tenant_id))


@router.patch("/tenants/{tenant_id}", response_model=TenantOut, dependencies=[Depends(csrf_protect)])
async def update_tenant(
    tenant_id: UUID, payload: TenantUpdate, request: Request, admin: WriteAdmin, db: DbDep
) -> TenantOut:
    tenant = await get_or_404(db, Tenant, tenant_id)
    if payload.status is not None and payload.status not in TenantStatus:
        raise bad_request("Invalid tenant status")
    apply_update(tenant, payload)
    await audit(
        db,
        action="platform.tenant_updated",
        actor_kind=ActorKind.PLATFORM_ADMIN,
        actor_id=admin.id,
        tenant_id=tenant.id,
        target_type="tenant",
        target_id=str(tenant.id),
        detail=payload.model_dump(exclude_unset=True),
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return TenantOut.model_validate(tenant)


@router.post("/tenants/{tenant_id}/impersonate", dependencies=[Depends(csrf_protect)])
async def impersonate(
    tenant_id: UUID,
    request: Request,
    response: Response,
    admin: WriteAdmin,
    db: DbDep,
    user_id: UUID | None = Query(None),
) -> dict:
    tenant = await get_or_404(db, Tenant, tenant_id)
    admin_user = await get_or_404(db, PlatformAdmin, admin.id)
    result = await auth_service.impersonate(
        db, request, response, admin=admin_user, tenant_id=tenant.id, user_id=user_id
    )
    await db.commit()
    return {"status": "authenticated", "impersonating": True, "userId": str(result["user"].id)}


# ---------- Platform admins ----------


@router.get("/admins", response_model=list[PlatformAdminOut])
async def list_admins(_: AdminDep, db: DbDep) -> list[PlatformAdminOut]:
    result = await db.execute(select(PlatformAdmin).order_by(PlatformAdmin.created_at))
    return [PlatformAdminOut.model_validate(a) for a in result.scalars()]


@router.post("/admins", status_code=201, response_model=PlatformAdminOut, dependencies=[Depends(csrf_protect)])
async def create_admin(
    payload: PlatformAdminCreate, request: Request, admin: SuperAdmin, db: DbDep
) -> PlatformAdminOut:
    exists = await db.execute(select(PlatformAdmin).where(PlatformAdmin.email == payload.email.lower()))
    if exists.scalar_one_or_none():
        raise conflict("Email already in use")
    obj = PlatformAdmin(
        email=payload.email.lower(),
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(obj)
    await audit(
        db,
        action="platform.admin_created",
        actor_kind=ActorKind.PLATFORM_ADMIN,
        actor_id=admin.id,
        target_type="platform_admin",
        target_id=str(obj.id),
        detail={"role": payload.role},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return PlatformAdminOut.model_validate(obj)


@router.patch("/admins/{admin_id}", response_model=PlatformAdminOut, dependencies=[Depends(csrf_protect)])
async def update_admin(
    admin_id: UUID, payload: PlatformAdminUpdate, request: Request, admin: SuperAdmin, db: DbDep
) -> PlatformAdminOut:
    obj = await get_or_404(db, PlatformAdmin, admin_id)
    apply_update(obj, payload)
    await audit(
        db,
        action="platform.admin_updated",
        actor_kind=ActorKind.PLATFORM_ADMIN,
        actor_id=admin.id,
        target_type="platform_admin",
        target_id=str(admin_id),
        detail=payload.model_dump(exclude_unset=True),
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return PlatformAdminOut.model_validate(obj)


# ---------- Settings & feature flags ----------


@router.get("/settings", response_model=list[SettingOut])
async def list_settings(_: AdminDep, db: DbDep) -> list[SettingOut]:
    result = await db.execute(select(PlatformSetting).order_by(PlatformSetting.key))
    return [SettingOut.model_validate(s) for s in result.scalars()]


@router.put("/settings/{key}", response_model=SettingOut, dependencies=[Depends(csrf_protect)])
async def upsert_setting(
    key: str, payload: SettingUpsert, request: Request, admin: SuperAdmin, db: DbDep
) -> SettingOut:
    obj = await db.get(PlatformSetting, key)
    if obj is None:
        obj = PlatformSetting(key=key, value=payload.value, updated_by_id=admin.id)
        db.add(obj)
    else:
        obj.value = payload.value
        obj.updated_by_id = admin.id
    await db.commit()
    return SettingOut.model_validate(obj)


@router.get("/feature-flags", response_model=list[FeatureFlagOut])
async def list_flags(_: AdminDep, db: DbDep) -> list[FeatureFlagOut]:
    result = await db.execute(select(FeatureFlag).order_by(FeatureFlag.key))
    return [FeatureFlagOut.model_validate(f) for f in result.scalars()]


@router.post("/feature-flags", status_code=201, response_model=FeatureFlagOut, dependencies=[Depends(csrf_protect)])
async def create_flag(payload: FeatureFlagCreate, admin: SuperAdmin, db: DbDep) -> FeatureFlagOut:
    if (await db.execute(select(FeatureFlag).where(FeatureFlag.key == payload.key))).scalar_one_or_none():
        raise conflict("Flag already exists")
    obj = FeatureFlag(key=payload.key, description=payload.description, default_enabled=payload.default_enabled)
    db.add(obj)
    await db.commit()
    return FeatureFlagOut.model_validate(obj)


@router.patch("/feature-flags/{flag_id}", response_model=FeatureFlagOut, dependencies=[Depends(csrf_protect)])
async def update_flag(
    flag_id: UUID, payload: FeatureFlagUpdate, admin: SuperAdmin, db: DbDep
) -> FeatureFlagOut:
    obj = await get_or_404(db, FeatureFlag, flag_id)
    apply_update(obj, payload)
    await db.commit()
    return FeatureFlagOut.model_validate(obj)


# ---------- Tenant registrations ----------


@router.get("/registrations", response_model=list[RegistrationOut])
async def list_registrations(_: AdminDep, db: DbDep, status: str | None = Query(None)) -> list[RegistrationOut]:
    stmt = select(TenantRegistration).order_by(TenantRegistration.created_at.desc())
    if status:
        stmt = stmt.where(TenantRegistration.status == status)
    result = await db.execute(stmt)
    return [RegistrationOut.model_validate(r) for r in result.scalars()]


@router.post(
    "/registrations/{registration_id}/review",
    response_model=RegistrationOut,
    dependencies=[Depends(csrf_protect)],
)
async def review_registration(
    registration_id: UUID,
    payload: RegistrationReview,
    request: Request,
    admin: WriteAdmin,
    db: DbDep,
) -> RegistrationOut:
    reg = await get_or_404(db, TenantRegistration, registration_id)
    if reg.status != RegistrationStatus.PENDING:
        raise bad_request("Registration already reviewed")
    reg.status = RegistrationStatus.APPROVED if payload.approve else RegistrationStatus.REJECTED
    reg.reviewed_by_id = admin.id
    reg.reviewed_at = datetime.now(UTC)
    reg.review_note = payload.note
    if payload.plan_code:
        reg.plan_code = payload.plan_code
    await audit(
        db,
        action="platform.registration_reviewed",
        actor_kind=ActorKind.PLATFORM_ADMIN,
        actor_id=admin.id,
        target_type="tenant_registration",
        target_id=str(reg.id),
        detail={"approved": payload.approve},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return RegistrationOut.model_validate(reg)


# ---------- Sessions ----------


@router.get("/sessions", response_model=list[SessionInfo])
async def list_sessions(
    _: AdminDep,
    db: DbDep,
    user_id: UUID | None = Query(None),
    tenant_id: UUID | None = Query(None),
) -> list[SessionInfo]:
    stmt = (
        select(UserSession)
        .where(UserSession.revoked_at.is_(None))
        .order_by(UserSession.created_at.desc())
        .limit(500)
    )
    if user_id:
        stmt = stmt.where(UserSession.user_id == user_id)
    if tenant_id:
        stmt = stmt.where(UserSession.tenant_id == tenant_id)
    result = await db.execute(stmt)
    return [SessionInfo.model_validate(s) for s in result.scalars()]


@router.post("/sessions/{session_id}/revoke", dependencies=[Depends(csrf_protect)])
async def revoke_session(session_id: UUID, request: Request, admin: WriteAdmin, db: DbDep) -> dict:
    session = await get_or_404(db, UserSession, session_id)
    if session.revoked_at is None:
        session.revoked_at = datetime.now(UTC)
        session.revoked_reason = "revoked_by_platform"
        await audit(
            db,
            action="platform.session_revoked",
            actor_kind=ActorKind.PLATFORM_ADMIN,
            actor_id=admin.id,
            target_type="user_session",
            target_id=str(session_id),
            ip_address=request.client.host if request.client else None,
        )
    await db.commit()
    return {"status": "ok"}


# ---------- Tenant user management (platform support view) ----------


@router.get("/tenants/{tenant_id}/users", response_model=list[TenantUserOut])
async def list_tenant_users_admin(tenant_id: UUID, _: AdminDep, db: DbDep) -> list[TenantUserOut]:
    result = await db.execute(
        select(TenantUser).where(TenantUser.tenant_id == tenant_id).order_by(TenantUser.created_at)
    )
    return [TenantUserOut.model_validate(u) for u in result.scalars()]


# ---------- Audit ----------


@router.get("/audit", response_model=Page[AuditLogOut])
async def platform_audit(
    _: AdminDep,
    db: DbDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    tenant_id: UUID | None = Query(None),
    action: str | None = Query(None),
) -> Page[AuditLogOut]:
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc())
    count = select(func.count()).select_from(AuditLog)
    if tenant_id:
        stmt = stmt.where(AuditLog.tenant_id == tenant_id)
        count = count.where(AuditLog.tenant_id == tenant_id)
    if action:
        stmt = stmt.where(AuditLog.action == action)
        count = count.where(AuditLog.action == action)
    items, total = await paginate(db, stmt, count, page=page, page_size=page_size)
    return Page(
        items=[AuditLogOut.model_validate(a) for a in items],
        total=total,
        page=page,
        page_size=page_size,
    )


# ---------- Infra health ----------


@router.get("/infra", response_model=InfraHealthOut)
async def infra_health(_: AdminDep, db: DbDep) -> InfraHealthOut:

    from app.core.redis_client import get_redis

    checks: dict[str, str] = {}
    try:
        await db.execute(select(func.now()))
        checks["postgres"] = "ok"
    except Exception:
        checks["postgres"] = "error"
    try:
        await get_redis().ping()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "error"
    # MQTT + S3 probed lazily via their clients
    settings = get_settings()
    try:
        import aiomqtt

        async with aiomqtt.Client(
            hostname=settings.mqtt_host,
            port=settings.mqtt_port,
            username=settings.mqtt_username or None,
            password=settings.mqtt_password or None,
        ):
            checks["mqtt"] = "ok"
    except Exception:
        checks["mqtt"] = "error"
    try:
        from app.storage.s3 import ensure_bucket

        await ensure_bucket()
        checks["s3"] = "ok"
    except Exception:
        checks["s3"] = "error"
    overall = "ok" if all(v == "ok" for v in checks.values()) else "degraded"
    return InfraHealthOut(status=overall, checks=checks)
