"""Tenant users + invitations."""

import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from arq.connections import RedisSettings, create_pool
from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from app.api.deps import TenantCaller, TenantDb
from app.api.pagination import ListParams, apply_cursor, page_response
from app.config import get_settings
from app.core import security
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.models.enums import AccountStatus, InvitationPurpose, InvitationScope, TenantUserRole
from app.models.identity import Invitation, Tenant, TenantUser
from app.schemas.base import OkResponse
from app.schemas.tenant import InviteView, UserCreate, UserUpdate, UserView
from app.services import sessions as session_service
from app.services.audit import audit
from app.services.email import invite_email

settings = get_settings()
router = APIRouter(tags=["tenant-members"])

MANAGE_ROLES = {"owner", "admin"}


def _require_manager(caller) -> None:
    if caller.claims.role not in MANAGE_ROLES:
        raise ForbiddenError("owner or admin role required")


def _validate_role(role: str) -> None:
    try:
        TenantUserRole(role)
    except ValueError as exc:
        raise ForbiddenError(f"invalid role {role}") from exc


async def _user_or_404(db, tenant_id: uuid.UUID, user_id: uuid.UUID) -> TenantUser:
    row = (
        await db.execute(
            select(TenantUser).where(TenantUser.id == user_id, TenantUser.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("user not found")
    return row


async def _enqueue_invite_email(db, tenant: Tenant, user: TenantUser) -> Invitation:
    token = secrets.token_urlsafe(32)
    invite = Invitation(
        tenant_id=tenant.id,
        scope=InvitationScope.TENANT_USER.value,
        purpose=InvitationPurpose.INVITE.value,
        email=user.email,
        role=user.role,
        subject_id=user.id,
        token_hash=security.hash_token(token),
        expires_at=datetime.now(UTC) + timedelta(days=7),
    )
    db.add(invite)
    accept_url = f"{settings.app_base_url}/accept-invite?token={token}"
    subject, text_body = invite_email(accept_url, tenant.name)
    arq = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    await arq.enqueue_job("send_email", user.email, subject, text_body)
    return invite


@router.get("/tenants/{tenant_id}/users")
async def list_users(
    tenant_id: uuid.UUID, caller: TenantCaller, db: TenantDb, params: Annotated[ListParams, Depends()]
):
    stmt = (
        select(TenantUser)
        .where(TenantUser.tenant_id == tenant_id)
        .order_by(TenantUser.created_at.desc(), TenantUser.id.desc())
    )
    if params.search:
        stmt = stmt.where(
            TenantUser.email.ilike(f"%{params.search}%") | TenantUser.full_name.ilike(f"%{params.search}%")
        )
    stmt = apply_cursor(stmt, TenantUser.created_at, TenantUser.id, params.cursor).limit(params.limit + 1)
    rows = (await db.execute(stmt)).scalars().all()
    return page_response(rows, params.limit, lambda r: (r.created_at, r.id), UserView.model_validate)


@router.post("/tenants/{tenant_id}/users", response_model=UserView, status_code=201)
async def create_user(tenant_id: uuid.UUID, body: UserCreate, caller: TenantCaller, db: TenantDb) -> UserView:
    """Create a user in 'invited' state and email them an activation link."""
    _require_manager(caller)
    _validate_role(body.role)
    if caller.claims.role == "admin" and body.role == "owner":
        raise ForbiddenError("only owners can grant owner role")

    exists = (
        await db.execute(
            select(TenantUser.id).where(
                TenantUser.tenant_id == tenant_id, func.lower(TenantUser.email) == body.email.lower()
            )
        )
    ).scalar_one_or_none()
    if exists is not None:
        raise ConflictError("email already in this tenant")

    tenant = await db.get(Tenant, tenant_id)
    if tenant is None:
        raise NotFoundError("tenant not found")
    user = TenantUser(
        tenant_id=tenant_id,
        email=body.email.lower(),
        full_name=body.full_name,
        role=body.role,
        status=AccountStatus.INVITED.value,
    )
    db.add(user)
    await db.flush()
    await _enqueue_invite_email(db, tenant, user)
    await audit(
        db,
        action="user.invited",
        actor_type="tenant_user",
        actor_id=caller.subject_id,
        tenant_id=tenant_id,
        target_type="tenant_user",
        target_id=str(user.id),
        detail={"email": user.email, "role": user.role},
    )
    return UserView.model_validate(user)


@router.get("/tenants/{tenant_id}/users/{user_id}", response_model=UserView)
async def get_user(tenant_id: uuid.UUID, user_id: uuid.UUID, caller: TenantCaller, db: TenantDb) -> UserView:
    return UserView.model_validate(await _user_or_404(db, tenant_id, user_id))


@router.patch("/tenants/{tenant_id}/users/{user_id}", response_model=UserView)
async def update_user(
    tenant_id: uuid.UUID, user_id: uuid.UUID, body: UserUpdate, caller: TenantCaller, db: TenantDb
) -> UserView:
    _require_manager(caller)
    user = await _user_or_404(db, tenant_id, user_id)
    data = body.model_dump(exclude_unset=True)
    if "role" in data:
        _validate_role(data["role"])
        if caller.claims.role == "admin" and data["role"] == "owner":
            raise ForbiddenError("only owners can grant owner role")
        if user.role == "owner" and data["role"] != "owner" and caller.subject_id == user.id:
            raise ForbiddenError("cannot demote yourself")
    if "status" in data:
        try:
            AccountStatus(data["status"])
        except ValueError as exc:
            raise ForbiddenError(f"invalid status {data['status']}") from exc
        if data["status"] == AccountStatus.INVITED.value:
            raise ForbiddenError("cannot revert to invited")
        if user.id == caller.subject_id:
            raise ForbiddenError("cannot change your own status")
    for k, v in data.items():
        setattr(user, k, v)
    if "status" in data and data["status"] != AccountStatus.ACTIVE.value:
        await session_service.revoke_subject_sessions(db, user.id)
    await audit(
        db,
        action="user.updated",
        actor_type="tenant_user",
        actor_id=caller.subject_id,
        tenant_id=tenant_id,
        target_type="tenant_user",
        target_id=str(user_id),
        detail=data,
    )
    return UserView.model_validate(user)


@router.delete("/tenants/{tenant_id}/users/{user_id}", response_model=OkResponse)
async def delete_user(
    tenant_id: uuid.UUID, user_id: uuid.UUID, caller: TenantCaller, db: TenantDb
) -> OkResponse:
    _require_manager(caller)
    user = await _user_or_404(db, tenant_id, user_id)
    if user.id == caller.subject_id:
        raise ForbiddenError("cannot delete yourself")
    if user.role == TenantUserRole.OWNER.value and caller.claims.role != "owner":
        raise ForbiddenError("only owners can remove an owner")
    await session_service.revoke_subject_sessions(db, user.id)
    await db.delete(user)
    await audit(
        db,
        action="user.deleted",
        actor_type="tenant_user",
        actor_id=caller.subject_id,
        tenant_id=tenant_id,
        target_type="tenant_user",
        target_id=str(user_id),
    )
    return OkResponse()


@router.post("/tenants/{tenant_id}/users/{user_id}/resend-invite", response_model=InviteView)
async def resend_invite(
    tenant_id: uuid.UUID, user_id: uuid.UUID, caller: TenantCaller, db: TenantDb
) -> InviteView:
    _require_manager(caller)
    user = await _user_or_404(db, tenant_id, user_id)
    tenant = await db.get(Tenant, tenant_id)
    if tenant is None:
        raise NotFoundError("tenant not found")
    invite = await _enqueue_invite_email(db, tenant, user)
    return InviteView.model_validate(invite)


@router.get("/tenants/{tenant_id}/invites", response_model=list[InviteView])
async def list_invites(tenant_id: uuid.UUID, caller: TenantCaller, db: TenantDb) -> list[InviteView]:
    rows = (
        (
            await db.execute(
                select(Invitation)
                .where(
                    Invitation.tenant_id == tenant_id,
                    Invitation.purpose == InvitationPurpose.INVITE.value,
                    Invitation.accepted_at.is_(None),
                    Invitation.expires_at > datetime.now(UTC),
                )
                .order_by(Invitation.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return [InviteView.model_validate(r) for r in rows]
