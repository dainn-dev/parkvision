"""Platform-admin routes: tenant/admin management, settings, flags, metrics, sessions."""

import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from arq.connections import RedisSettings, create_pool
from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import func, select, text
from sqlalchemy import update as sa_update

from app.api.deps import PlatformCaller, PlatformDb, client_ip
from app.api.pagination import ListParams, apply_cursor, page_response
from app.config import get_settings
from app.core import security
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.db.redis import get_redis
from app.models.access import RegisteredVehicle
from app.models.enums import (
    AccountStatus,
    ActorType,
    InvitationPurpose,
    InvitationScope,
    PlatformAdminRole,
    SubjectType,
)
from app.models.events import AccessEvent
from app.models.identity import Invitation, PlatformAdmin, PlatformSetting, Tenant, TenantUser, UserSession
from app.models.sites import BarrierGate, TenantSite
from app.schemas.auth import LoginResponse, SessionView
from app.schemas.base import OkResponse
from app.schemas.platform import (
    FeatureFlags,
    MetricsView,
    PlatformAdminCreate,
    PlatformAdminUpdate,
    PlatformAdminView,
    PlatformSettingPut,
    PlatformSettingView,
    PlatformTenantCreate,
    PlatformTenantUpdate,
    PlatformTenantView,
    TenantUsage,
)
from app.services import sessions as session_service
from app.services.audit import audit
from app.services.email import invite_email

settings = get_settings()
router = APIRouter(prefix="/platform", tags=["platform"])

SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$")


def _require_super(caller) -> None:
    if caller.claims.role != PlatformAdminRole.SUPER_ADMIN.value:
        raise ForbiddenError("super_admin role required")


def _require_write(caller) -> None:
    if caller.claims.role == PlatformAdminRole.READ_ONLY.value:
        raise ForbiddenError("read_only platform admin")


async def _tenant_or_404(db, tenant_id: uuid.UUID) -> Tenant:
    row = await db.get(Tenant, tenant_id)
    if row is None:
        raise NotFoundError("tenant not found")
    return row


# ------------------------------------------------------------------ tenants


@router.get("/tenants")
async def list_tenants(caller: PlatformCaller, db: PlatformDb, params: Annotated[ListParams, Depends()]):
    stmt = select(Tenant).order_by(Tenant.created_at.desc(), Tenant.id.desc())
    if params.search:
        stmt = stmt.where(Tenant.name.ilike(f"%{params.search}%") | Tenant.slug.ilike(f"%{params.search}%"))
    stmt = apply_cursor(stmt, Tenant.created_at, Tenant.id, params.cursor).limit(params.limit + 1)
    rows = (await db.execute(stmt)).scalars().all()
    return page_response(
        rows, params.limit, lambda r: (r.created_at, r.id), PlatformTenantView.model_validate
    )


@router.post("/tenants", response_model=PlatformTenantView, status_code=201)
async def create_tenant(
    body: PlatformTenantCreate, caller: PlatformCaller, db: PlatformDb
) -> PlatformTenantView:
    _require_write(caller)
    if not SLUG_RE.match(body.slug):
        raise ValidationError("invalid slug")
    exists = (await db.execute(select(Tenant.id).where(Tenant.slug == body.slug))).scalar_one_or_none()
    if exists is not None:
        raise ConflictError("slug already taken")

    tenant = Tenant(
        name=body.name,
        slug=body.slug,
        plan=body.plan,
        status="active",
        contact_email=body.contact_email or body.owner_email,
    )
    db.add(tenant)
    await db.flush()
    owner = TenantUser(
        tenant_id=tenant.id,
        email=body.owner_email.lower(),
        full_name=body.owner_name,
        role="owner",
        status=AccountStatus.INVITED.value,
    )
    db.add(owner)
    await db.flush()

    token = secrets.token_urlsafe(32)
    db.add(
        Invitation(
            tenant_id=tenant.id,
            scope=InvitationScope.TENANT_USER.value,
            purpose=InvitationPurpose.INVITE.value,
            email=owner.email,
            role=owner.role,
            subject_id=owner.id,
            token_hash=security.hash_token(token),
            invited_by_type=SubjectType.PLATFORM_ADMIN.value,
            invited_by_id=caller.subject_id,
            expires_at=datetime.now(UTC) + timedelta(days=7),
        )
    )
    accept_url = f"{settings.app_base_url}/accept-invite?token={token}"
    subject, text_body = invite_email(accept_url, tenant.name)
    arq = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    await arq.enqueue_job("send_email", owner.email, subject, text_body)

    await audit(
        db,
        action="platform.tenant.created",
        actor_type=ActorType.PLATFORM_ADMIN.value,
        actor_id=caller.subject_id,
        tenant_id=tenant.id,
        target_type="tenant",
        target_id=str(tenant.id),
    )
    return PlatformTenantView.model_validate(tenant)


@router.get("/tenants/{tenant_id}", response_model=PlatformTenantView)
async def get_tenant(tenant_id: uuid.UUID, caller: PlatformCaller, db: PlatformDb) -> PlatformTenantView:
    return PlatformTenantView.model_validate(await _tenant_or_404(db, tenant_id))


@router.patch("/tenants/{tenant_id}", response_model=PlatformTenantView)
async def update_tenant(
    tenant_id: uuid.UUID, body: PlatformTenantUpdate, caller: PlatformCaller, db: PlatformDb
) -> PlatformTenantView:
    _require_write(caller)
    tenant = await _tenant_or_404(db, tenant_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(tenant, k, v)
    await audit(
        db,
        action="platform.tenant.updated",
        actor_type=ActorType.PLATFORM_ADMIN.value,
        actor_id=caller.subject_id,
        tenant_id=tenant_id,
        target_type="tenant",
        target_id=str(tenant_id),
        detail=body.model_dump(exclude_unset=True),
    )
    return PlatformTenantView.model_validate(tenant)


@router.post("/tenants/{tenant_id}/suspend", response_model=PlatformTenantView)
async def suspend_tenant(tenant_id: uuid.UUID, caller: PlatformCaller, db: PlatformDb) -> PlatformTenantView:
    _require_write(caller)
    tenant = await _tenant_or_404(db, tenant_id)
    tenant.status = "suspended"
    await db.execute(
        sa_update(UserSession)
        .where(UserSession.tenant_id == tenant_id, UserSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )
    await audit(
        db,
        action="platform.tenant.suspended",
        actor_type=ActorType.PLATFORM_ADMIN.value,
        actor_id=caller.subject_id,
        tenant_id=tenant_id,
    )
    return PlatformTenantView.model_validate(tenant)


@router.get("/tenants/{tenant_id}/usage", response_model=TenantUsage)
async def tenant_usage(tenant_id: uuid.UUID, caller: PlatformCaller, db: PlatformDb) -> TenantUsage:
    await _tenant_or_404(db, tenant_id)
    thirty_days = datetime.now(UTC) - timedelta(days=30)  # usage window

    async def _count(stmt):
        return (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()

    return TenantUsage(
        tenant_id=tenant_id,
        users=await _count(select(TenantUser.id).where(TenantUser.tenant_id == tenant_id)),
        sites=await _count(select(TenantSite.id).where(TenantSite.tenant_id == tenant_id)),
        gates=await _count(select(BarrierGate.id).where(BarrierGate.tenant_id == tenant_id)),
        vehicles=await _count(select(RegisteredVehicle.id).where(RegisteredVehicle.tenant_id == tenant_id)),
        access_events_30d=await _count(
            select(AccessEvent.id).where(
                AccessEvent.tenant_id == tenant_id, AccessEvent.occurred_at >= thirty_days
            )
        ),
        active_sessions=await _count(
            select(UserSession.id).where(
                UserSession.tenant_id == tenant_id,
                UserSession.revoked_at.is_(None),
                UserSession.expires_at > datetime.now(UTC),
            )
        ),
    )


@router.post("/tenants/{tenant_id}/impersonate", response_model=LoginResponse)
async def impersonate(
    tenant_id: uuid.UUID, request: Request, response: Response, caller: PlatformCaller, db: PlatformDb
) -> LoginResponse:
    """Mint a tenant-scoped session as the tenant's owner, flagged impersonating."""
    _require_super(caller)
    await _tenant_or_404(db, tenant_id)
    owner = (
        await db.execute(
            select(TenantUser)
            .where(
                TenantUser.tenant_id == tenant_id, TenantUser.role == "owner", TenantUser.status == "active"
            )
            .order_by(TenantUser.created_at)
            .limit(1)
        )
    ).scalar_one_or_none()
    if owner is None:
        owner = (
            await db.execute(
                select(TenantUser)
                .where(TenantUser.tenant_id == tenant_id, TenantUser.status == "active")
                .order_by(TenantUser.created_at)
                .limit(1)
            )
        ).scalar_one_or_none()
    if owner is None:
        raise ValidationError("tenant has no active user to impersonate")

    session_row, secret = await session_service.create_session(
        db,
        subject_type=SubjectType.TENANT_USER.value,
        subject_id=owner.id,
        tenant_id=tenant_id,
        user_agent=request.headers.get("user-agent"),
        ip=client_ip(request),
        impersonating=True,
    )
    access = security.mint_access_token(
        owner.id,
        scope=security.SCOPE_TENANT,
        tenant_id=tenant_id,
        role=owner.role,
        session_id=session_row.id,
        impersonating=True,
    )
    csrf = security.new_csrf_token()
    session_service.set_auth_cookies(
        response,
        access_token=access,
        session_id=session_row.id,
        refresh_secret=secret,
        csrf_token=csrf,
    )
    await audit(
        db,
        action="platform.impersonate",
        actor_type=ActorType.PLATFORM_ADMIN.value,
        actor_id=caller.subject_id,
        tenant_id=tenant_id,
        target_type="tenant_user",
        target_id=str(owner.id),
    )
    return LoginResponse(
        mfa_required=False,
        access_expires_in=settings.access_token_ttl_seconds,
        scope=security.SCOPE_TENANT,
        subject_id=owner.id,
        tenant_id=tenant_id,
        role=owner.role,
        csrf_token=csrf,
    )


# ------------------------------------------------------------------ platform admins


@router.get("/admins")
async def list_admins(caller: PlatformCaller, db: PlatformDb, params: Annotated[ListParams, Depends()]):
    stmt = select(PlatformAdmin).order_by(PlatformAdmin.created_at.desc(), PlatformAdmin.id.desc())
    if params.search:
        stmt = stmt.where(
            PlatformAdmin.email.ilike(f"%{params.search}%")
            | PlatformAdmin.full_name.ilike(f"%{params.search}%")
        )
    stmt = apply_cursor(stmt, PlatformAdmin.created_at, PlatformAdmin.id, params.cursor).limit(
        params.limit + 1
    )
    rows = (await db.execute(stmt)).scalars().all()
    return page_response(rows, params.limit, lambda r: (r.created_at, r.id), PlatformAdminView.model_validate)


@router.post("/admins", response_model=PlatformAdminView, status_code=201)
async def create_admin(
    body: PlatformAdminCreate, caller: PlatformCaller, db: PlatformDb
) -> PlatformAdminView:
    _require_super(caller)
    try:
        PlatformAdminRole(body.role)
    except ValueError as exc:
        raise ValidationError(f"invalid role {body.role}") from exc
    exists = (
        await db.execute(
            select(PlatformAdmin.id).where(func.lower(PlatformAdmin.email) == body.email.lower())
        )
    ).scalar_one_or_none()
    if exists is not None:
        raise ConflictError("email already registered")
    admin = PlatformAdmin(
        email=body.email.lower(),
        full_name=body.full_name,
        role=body.role,
        status=AccountStatus.INVITED.value,
    )
    db.add(admin)
    await db.flush()
    token = secrets.token_urlsafe(32)
    db.add(
        Invitation(
            scope=InvitationScope.PLATFORM_ADMIN.value,
            purpose=InvitationPurpose.INVITE.value,
            email=admin.email,
            role=admin.role,
            subject_id=admin.id,
            token_hash=security.hash_token(token),
            invited_by_type=SubjectType.PLATFORM_ADMIN.value,
            invited_by_id=caller.subject_id,
            expires_at=datetime.now(UTC) + timedelta(days=7),
        )
    )
    accept_url = f"{settings.app_base_url}/accept-invite?token={token}"
    subject, text_body = invite_email(accept_url, "ParkVision Platform")
    arq = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    await arq.enqueue_job("send_email", admin.email, subject, text_body)
    await audit(
        db,
        action="platform.admin.invited",
        actor_type=ActorType.PLATFORM_ADMIN.value,
        actor_id=caller.subject_id,
        target_type="platform_admin",
        target_id=str(admin.id),
    )
    return PlatformAdminView.model_validate(admin)


@router.patch("/admins/{admin_id}", response_model=PlatformAdminView)
async def update_admin(
    admin_id: uuid.UUID, body: PlatformAdminUpdate, caller: PlatformCaller, db: PlatformDb
) -> PlatformAdminView:
    _require_super(caller)
    row = await db.get(PlatformAdmin, admin_id)
    if row is None:
        raise NotFoundError("admin not found")
    if row.id == caller.subject_id and (body.role or body.status):
        raise ForbiddenError("cannot change your own role/status")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    if body.status and body.status != "active":
        await session_service.revoke_subject_sessions(db, row.id)
    return PlatformAdminView.model_validate(row)


@router.delete("/admins/{admin_id}", response_model=OkResponse)
async def delete_admin(admin_id: uuid.UUID, caller: PlatformCaller, db: PlatformDb) -> OkResponse:
    _require_super(caller)
    if admin_id == caller.subject_id:
        raise ForbiddenError("cannot delete yourself")
    row = await db.get(PlatformAdmin, admin_id)
    if row is None:
        raise NotFoundError("admin not found")
    await session_service.revoke_subject_sessions(db, row.id)
    await db.delete(row)
    return OkResponse()


# ------------------------------------------------------------------ settings & flags


@router.get("/settings", response_model=list[PlatformSettingView])
async def list_settings(caller: PlatformCaller, db: PlatformDb) -> list[PlatformSettingView]:
    rows = (await db.execute(select(PlatformSetting).order_by(PlatformSetting.key))).scalars().all()
    return [PlatformSettingView.model_validate(r) for r in rows]


@router.put("/settings/{key}", response_model=PlatformSettingView)
async def put_setting(
    key: str, body: PlatformSettingPut, caller: PlatformCaller, db: PlatformDb
) -> PlatformSettingView:
    _require_super(caller)
    row = await db.get(PlatformSetting, key)
    if row is None:
        row = PlatformSetting(key=key, value=body.value, updated_by=caller.subject_id)
        db.add(row)
    else:
        row.value = body.value
        row.updated_by = caller.subject_id
    await audit(
        db,
        action="platform.setting.updated",
        actor_type=ActorType.PLATFORM_ADMIN.value,
        actor_id=caller.subject_id,
        target_type="platform_setting",
        target_id=key,
    )
    return PlatformSettingView.model_validate(row)


@router.get("/feature-flags", response_model=FeatureFlags)
async def get_flags(caller: PlatformCaller, db: PlatformDb) -> FeatureFlags:
    from app.services.features import DEFAULT_FLAGS

    row = (
        await db.execute(select(PlatformSetting).where(PlatformSetting.key == "feature_flags"))
    ).scalar_one_or_none()
    flags = {**DEFAULT_FLAGS, **(((row.value or {}).get("flags") or {}) if row else {})}
    return FeatureFlags(flags=flags)


@router.put("/feature-flags", response_model=FeatureFlags)
async def put_flags(body: FeatureFlags, caller: PlatformCaller, db: PlatformDb) -> FeatureFlags:
    _require_super(caller)
    row = await db.get(PlatformSetting, "feature_flags")
    if row is None:
        row = PlatformSetting(key="feature_flags", value={"flags": body.flags}, updated_by=caller.subject_id)
        db.add(row)
    else:
        row.value = {"flags": body.flags}
        row.updated_by = caller.subject_id
    await audit(
        db,
        action="platform.flags.updated",
        actor_type=ActorType.PLATFORM_ADMIN.value,
        actor_id=caller.subject_id,
        target_type="platform_setting",
        target_id="feature_flags",
    )
    return FeatureFlags(flags=body.flags)


# ------------------------------------------------------------------ infra & sessions


@router.get("/metrics", response_model=MetricsView)
async def metrics(caller: PlatformCaller, db: PlatformDb) -> MetricsView:
    services: dict[str, dict] = {}

    try:
        await db.execute(text("SELECT 1"))
        services["postgres"] = {"status": "ok"}
    except Exception as exc:
        services["postgres"] = {"status": "error", "detail": str(exc)[:200]}

    try:
        pong = await get_redis().ping()
        services["redis"] = {"status": "ok" if pong else "error"}
    except Exception as exc:
        services["redis"] = {"status": "error", "detail": str(exc)[:200]}

    try:
        from app.services import mqtt_client

        await mqtt_client._ensure_client()
        services["mqtt"] = {"status": "ok"}
    except Exception as exc:
        services["mqtt"] = {"status": "error", "detail": str(exc)[:200]}

    try:
        import asyncio

        from app.services import storage

        await asyncio.to_thread(storage.s3_client().list_buckets)
        services["s3"] = {"status": "ok"}
    except Exception as exc:
        services["s3"] = {"status": "error", "detail": str(exc)[:200]}

    counts = {
        "tenants": (await db.execute(select(func.count()).select_from(Tenant))).scalar_one(),
        "tenant_users": (await db.execute(select(func.count()).select_from(TenantUser))).scalar_one(),
        "active_sessions": (
            await db.execute(
                select(func.count())
                .select_from(UserSession)
                .where(UserSession.revoked_at.is_(None), UserSession.expires_at > datetime.now(UTC))
            )
        ).scalar_one(),
    }
    overall = "ok" if all(s["status"] == "ok" for s in services.values()) else "degraded"
    return MetricsView(status=overall, services=services, counts=counts)


@router.get("/sessions")
async def list_all_sessions(
    caller: PlatformCaller,
    db: PlatformDb,
    params: Annotated[ListParams, Depends()],
    tenant_id: uuid.UUID | None = Query(default=None),
):
    stmt = (
        select(UserSession)
        .where(UserSession.revoked_at.is_(None), UserSession.expires_at > datetime.now(UTC))
        .order_by(UserSession.created_at.desc(), UserSession.id.desc())
    )
    if tenant_id:
        stmt = stmt.where(UserSession.tenant_id == tenant_id)
    stmt = apply_cursor(stmt, UserSession.created_at, UserSession.id, params.cursor).limit(params.limit + 1)
    rows = (await db.execute(stmt)).scalars().all()
    return page_response(
        rows,
        params.limit,
        lambda r: (r.created_at, r.id),
        lambda r: SessionView(
            id=r.id,
            subject_type=r.subject_type,
            subject_id=r.subject_id,
            tenant_id=r.tenant_id,
            user_agent=r.user_agent,
            ip=str(r.ip) if r.ip else None,
            impersonating=r.impersonating,
            created_at=r.created_at,
            last_seen_at=r.last_seen_at,
            expires_at=r.expires_at,
        ),
    )


@router.delete("/sessions/{session_id}", response_model=OkResponse)
async def revoke_any_session(session_id: uuid.UUID, caller: PlatformCaller, db: PlatformDb) -> OkResponse:
    row = await db.get(UserSession, session_id)
    if row is None:
        raise NotFoundError("session not found")
    await session_service.revoke_session(db, session_id)
    await audit(
        db,
        action="platform.session.revoked",
        actor_type=ActorType.PLATFORM_ADMIN.value,
        actor_id=caller.subject_id,
        target_type="user_session",
        target_id=str(session_id),
    )
    return OkResponse()


@router.get("/audit-logs")
async def platform_audit_logs(
    caller: PlatformCaller,
    db: PlatformDb,
    params: Annotated[ListParams, Depends()],
    tenant_id: uuid.UUID | None = Query(default=None),
    action: str | None = Query(default=None),
):
    from app.models.ops import AuditLog

    stmt = select(AuditLog).order_by(AuditLog.occurred_at.desc(), AuditLog.id.desc())
    if tenant_id:
        stmt = stmt.where(AuditLog.tenant_id == tenant_id)
    if action:
        stmt = stmt.where(AuditLog.action.ilike(f"{action}%"))
    stmt = apply_cursor(stmt, AuditLog.occurred_at, AuditLog.id, params.cursor).limit(params.limit + 1)
    rows = (await db.execute(stmt)).scalars().all()
    from app.schemas.tenant import AuditLogView

    return page_response(rows, params.limit, lambda r: (r.occurred_at, r.id), AuditLogView.model_validate)
