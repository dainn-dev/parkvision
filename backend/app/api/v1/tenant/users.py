"""Tenant user management: invite, list, update, deactivate, resend, reset."""

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ADMIN_ROLES, csrf_protect, require_roles
from app.api.v1.tenant import TenantCtx, get_tenant_db, tenant_ctx
from app.config import settings
from app.core.enums import AccountStatus, ActorType
from app.core.errors import bad_request, conflict, not_found
from app.models import TenantUser, UserSession
from app.schemas.auth import UserOut
from app.schemas.common import MessageOut, Page, paginate
from app.schemas.resources import UserInviteIn, UserUpdateIn
from app.services.audit_service import write_audit
from app.services.auth_service import _new_reset_token
from app.workers.jobs import enqueue_invite_email, enqueue_password_reset_email

router = APIRouter(
    prefix="/tenants/{tenant_id}",
    tags=["users"],
    dependencies=[Depends(csrf_protect)],
)


_PROFILE_FIELDS = ("member_code", "phone", "employee_id", "department", "membership_type")


def _profile_from(body) -> dict | None:
    """Collect optional member-profile fields into the profile JSONB dict.
    Keys are stored camelCase to match the frontend contract."""
    raw = {
        "memberCode": body.member_code,
        "phone": body.phone,
        "employeeId": body.employee_id,
        "department": body.department,
        "membershipType": body.membership_type,
    }
    profile = {k: v for k, v in raw.items() if v}
    return profile or None


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
        profile=u.profile,
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
    profile = _profile_from(body)
    if profile is not None:
        row.profile = profile
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        raise conflict("A user with this email already exists") from None
    if row.profile is not None and not row.profile.get("memberCode"):
        row.profile = {**row.profile, "memberCode": f"MEM-{str(row.id)[:8].upper()}"}
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
    changes = body.model_dump(exclude_unset=True)
    profile_updates = {k: changes.pop(k) for k in _PROFILE_FIELDS if k in changes}
    for k, v in changes.items():
        if v is not None:
            setattr(row, k, v)
    if profile_updates:
        # Merge into profile JSONB; None clears a previously set field.
        merged = dict(row.profile or {})
        for k, v in {
            "memberCode": profile_updates.get("member_code"),
            "phone": profile_updates.get("phone"),
            "employeeId": profile_updates.get("employee_id"),
            "department": profile_updates.get("department"),
            "membershipType": profile_updates.get("membership_type"),
        }.items():
            if v is None:
                merged.pop(k, None)
            else:
                merged[k] = v
        row.profile = merged or None
        if row.profile and not row.profile.get("memberCode"):
            row.profile["memberCode"] = f"MEM-{str(row.id)[:8].upper()}"
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


@router.post("/users/{user_id}/resend-invite", response_model=MessageOut)
async def resend_invite(
    user_id: uuid.UUID,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*ADMIN_ROLES)),
) -> MessageOut:
    """Re-issue the activation token and re-queue the invite email. Only valid
    while the account is still in `invited` state."""
    row = (
        await db.execute(
            select(TenantUser).where(TenantUser.id == user_id, TenantUser.tenant_id == ctx.tenant_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise not_found("user", user_id) from None
    if row.status != str(AccountStatus.INVITED):
        raise bad_request("User already activated — resend is only for pending invitations") from None

    invite_token = secrets.token_urlsafe(32)
    row.invite_token_hash = hashlib.sha256(invite_token.encode()).hexdigest()
    row.invite_expires_at = datetime.now(timezone.utc) + timedelta(hours=72)
    await enqueue_invite_email(
        email=row.email,
        full_name=row.full_name,
        tenant_id=str(ctx.tenant_id),
        invite_token=invite_token,
        expires=row.invite_expires_at.isoformat(),
    )
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="user.invite_resent",
        resource_type="tenant_user",
        resource_id=str(user_id),
        ip=request.client.host if request.client else None,
    )
    return MessageOut(message="Invitation resent")


@router.post("/users/{user_id}/password-reset", response_model=MessageOut)
async def admin_password_reset(
    user_id: uuid.UUID,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*ADMIN_ROLES)),
) -> MessageOut:
    """Admin-triggered password reset: stages a reset token, emails the link,
    and revokes the user's sessions so a compromised password can't linger."""
    row = (
        await db.execute(
            select(TenantUser).where(TenantUser.id == user_id, TenantUser.tenant_id == ctx.tenant_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise not_found("user", user_id) from None
    if row.status == str(AccountStatus.INVITED):
        raise bad_request("User has not activated yet — resend the invitation instead") from None

    plain, token_hash = _new_reset_token()
    row.password_reset_token_hash = token_hash
    row.password_reset_expires_at = datetime.now(timezone.utc) + timedelta(
        seconds=settings.password_reset_ttl_seconds
    )
    await db.execute(
        update(UserSession)
        .where(
            UserSession.user_id == row.id,
            UserSession.user_type == str(ActorType.TENANT_USER),
            UserSession.revoked_at.is_(None),
        )
        .values(revoked_at=datetime.now(timezone.utc))
    )
    await enqueue_password_reset_email(email=row.email, reset_token=plain)
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="user.password_reset_sent",
        resource_type="tenant_user",
        resource_id=str(user_id),
        ip=request.client.host if request.client else None,
    )
    return MessageOut(message="Password reset link sent")
