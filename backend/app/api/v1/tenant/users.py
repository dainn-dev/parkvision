"""Tenant user management: invite, list, update, deactivate."""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ADMIN_ROLES, csrf_protect, require_roles
from app.api.v1.tenant import TenantCtx, get_tenant_db, tenant_ctx
from app.core.enums import AccountStatus
from app.core.errors import conflict, not_found
from app.models import TenantUser
from app.schemas.auth import UserOut
from app.schemas.common import MessageOut, Page, paginate
from app.schemas.resources import UserInviteIn, UserUpdateIn
from app.services.audit_service import write_audit
from app.workers.jobs import enqueue_invite_email

router = APIRouter(
    prefix="/tenants/{tenant_id}",
    tags=["users"],
    dependencies=[Depends(csrf_protect)],
)


def _out(u: TenantUser) -> UserOut:
    return UserOut(
        id=u.id,
        email=u.email,
        full_name=u.full_name,
        role=str(u.role),
        status=str(u.status),
        mfa_enabled=u.mfa_enabled,
        tenant_id=u.tenant_id,
        last_login_at=u.last_login_at,
    )


@router.get("/users", response_model=Page[UserOut])
async def list_users(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> Page[UserOut]:
    cond = [TenantUser.tenant_id == ctx.tenant_id]
    total = (await db.execute(select(func.count()).select_from(TenantUser).where(*cond))).scalar_one()
    rows = (
        (
            await db.execute(
                select(TenantUser)
                .where(*cond)
                .order_by(TenantUser.created_at.desc())
                .offset((page - 1) * limit)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return paginate([_out(r) for r in rows], total, page, limit)


@router.post("/users", response_model=UserOut, status_code=201)
async def invite_user(
    body: UserInviteIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*ADMIN_ROLES)),
) -> UserOut:
    """Invite by email: creates an invited account and queues an activation email."""
    import hashlib
    import secrets

    invite_token = secrets.token_urlsafe(32)
    row = TenantUser(
        tenant_id=ctx.tenant_id,
        email=body.email.lower(),
        full_name=body.full_name,
        role=body.role,
        status=str(AccountStatus.INVITED),
        invited_by=ctx.auth.user_id,
        invite_token_hash=hashlib.sha256(invite_token.encode()).hexdigest(),
        invite_expires_at=datetime.now(timezone.utc) + timedelta(hours=72),
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        raise conflict("A user with this email already exists") from None
    await enqueue_invite_email(
        email=row.email,
        full_name=row.full_name,
        tenant_id=str(ctx.tenant_id),
        invite_token=invite_token,
        expires=(datetime.now(timezone.utc) + timedelta(hours=72)).isoformat(),
    )
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="user.invited",
        resource_type="tenant_user",
        resource_id=str(row.id),
        details={"email": row.email, "role": row.role},
        ip=request.client.host if request.client else None,
    )
    return _out(row)


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdateIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*ADMIN_ROLES)),
) -> UserOut:
    row = (
        await db.execute(
            select(TenantUser).where(TenantUser.id == user_id, TenantUser.tenant_id == ctx.tenant_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise not_found("user", user_id) from None
    if row.id == ctx.auth.user_id and body.status == AccountStatus.DISABLED:
        raise conflict("You cannot disable your own account") from None
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(row, k, v)
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="user.updated",
        resource_type="tenant_user",
        resource_id=str(user_id),
        details={"changes": list(body.model_dump(exclude_unset=True).keys())},
        ip=request.client.host if request.client else None,
    )
    return _out(row)


@router.delete("/users/{user_id}", response_model=MessageOut)
async def deactivate_user(
    user_id: uuid.UUID,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*ADMIN_ROLES)),
) -> MessageOut:
    row = (
        await db.execute(
            select(TenantUser).where(TenantUser.id == user_id, TenantUser.tenant_id == ctx.tenant_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise not_found("user", user_id) from None
    if row.id == ctx.auth.user_id:
        raise conflict("You cannot remove your own account") from None
    row.status = str(AccountStatus.DISABLED)
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="user.deactivated",
        resource_type="tenant_user",
        resource_id=str(user_id),
        ip=request.client.host if request.client else None,
    )
    return MessageOut(message="User deactivated")
