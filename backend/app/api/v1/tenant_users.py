"""Tenant user management + invitations."""

import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import Principal, csrf_protect, require_tenant_user, resolve_tenant_id, tenant_db
from app.core.errors import conflict
from app.core.security import new_opaque_token
from app.models import Tenant, TenantUser, UserInvite
from app.models.enums import AccountStatus, ActorKind, InviteStatus
from app.schemas.identity import InviteOut, TenantUserCreate, TenantUserOut, TenantUserUpdate
from app.services.audit import audit
from app.services.common import apply_update, get_or_404

log = logging.getLogger("parkvision.api.tenant_users")

router = APIRouter(prefix="/tenants/{tenantId}", tags=["tenant-users"])

ManagerDep = Annotated[Principal, Depends(require_tenant_user("owner", "admin"))]
DbDep = Annotated[AsyncSession, Depends(tenant_db)]


@router.get("/users", response_model=list[TenantUserOut])
async def list_users(
    principal: Annotated[Principal, Depends(require_tenant_user())],
    db: DbDep,
    tenantId: UUID,
) -> list[TenantUserOut]:
    resolve_tenant_id(principal, tenantId)
    result = await db.execute(
        select(TenantUser).where(TenantUser.tenant_id == tenantId).order_by(TenantUser.created_at)
    )
    return [TenantUserOut.model_validate(u) for u in result.scalars()]


@router.post("/users", status_code=201, response_model=InviteOut, dependencies=[Depends(csrf_protect)])
async def invite_user(
    payload: TenantUserCreate,
    request: Request,
    principal: ManagerDep,
    db: DbDep,
    tenantId: UUID,
) -> InviteOut:
    """Create an invite — no password is set; the invitee sets it via token link."""
    resolve_tenant_id(principal, tenantId)
    email = payload.email.lower()
    if (
        await db.execute(select(TenantUser).where(TenantUser.email == email))
    ).scalar_one_or_none():
        raise conflict("A user with this email already exists")
    pending = (
        await db.execute(
            select(UserInvite).where(
                UserInvite.tenant_id == tenantId,
                UserInvite.email == email,
                UserInvite.status == InviteStatus.PENDING,
            )
        )
    ).scalar_one_or_none()
    if pending:
        raise conflict("A pending invite already exists for this email")

    raw, token_hash = new_opaque_token()
    invite = UserInvite(
        tenant_id=tenantId,
        email=email,
        role=payload.role,
        token_hash=token_hash,
        invited_by_id=principal.id,
        expires_at=datetime.now(UTC) + timedelta(days=7),
    )
    db.add(invite)

    # provisioned shell — activated when the invite is accepted
    user = TenantUser(
        tenant_id=tenantId,
        email=email,
        full_name=payload.full_name,
        role=payload.role,
        status=AccountStatus.INVITED,
        invited_at=datetime.now(UTC),
    )
    db.add(user)
    await db.flush()

    invite_url = f"{get_settings().api_base_url}/accept-invite?token={raw}"
    tenant = await db.get(Tenant, tenantId)
    try:
        from arq import create_pool

        from app.workers.worker import _redis

        pool = await create_pool(_redis())
        try:
            await pool.enqueue_job("task_send_invite", email, tenant.name if tenant else "your tenant", invite_url)
        finally:
            await pool.aclose()
    except Exception:
        log.warning("invite email enqueue failed for %s; invite token stored anyway", email)

    await audit(
        db,
        action="tenant.user_invited",
        actor_kind=ActorKind.TENANT_USER,
        actor_id=principal.id,
        tenant_id=tenantId,
        target_type="tenant_user",
        target_id=str(user.id),
        detail={"email": email, "role": payload.role},
        ip_address=request.client.host if request.client else None,
    )
    return InviteOut.model_validate(invite)


@router.get("/invites", response_model=list[InviteOut])
async def list_invites(principal: ManagerDep, db: DbDep, tenantId: UUID) -> list[InviteOut]:
    resolve_tenant_id(principal, tenantId)
    result = await db.execute(
        select(UserInvite).where(UserInvite.tenant_id == tenantId).order_by(UserInvite.created_at.desc())
    )
    return [InviteOut.model_validate(i) for i in result.scalars()]


@router.delete("/invites/{invite_id}", dependencies=[Depends(csrf_protect)])
async def revoke_invite(
    invite_id: UUID, principal: ManagerDep, db: DbDep, tenantId: UUID
) -> dict:
    resolve_tenant_id(principal, tenantId)
    invite = await get_or_404(db, UserInvite, invite_id, "Invite not found")
    if invite.tenant_id != tenantId:
        raise conflict("Invite does not belong to this tenant")
    invite.status = InviteStatus.REVOKED
    return {"status": "ok"}


@router.patch("/users/{user_id}", response_model=TenantUserOut, dependencies=[Depends(csrf_protect)])
async def update_user(
    user_id: UUID,
    payload: TenantUserUpdate,
    request: Request,
    principal: ManagerDep,
    db: DbDep,
    tenantId: UUID,
) -> TenantUserOut:
    resolve_tenant_id(principal, tenantId)
    user = await get_or_404(db, TenantUser, user_id, "User not found")
    if user.tenant_id != tenantId:
        raise conflict("User does not belong to this tenant")
    if payload.role == "owner" and user.id != principal.id and principal.role != "owner":
        # only an owner may grant owner
        from app.core.errors import forbidden

        raise forbidden("Only an owner may assign the owner role")
    apply_update(user, payload)
    await audit(
        db,
        action="tenant.user_updated",
        actor_kind=ActorKind.TENANT_USER,
        actor_id=principal.id,
        tenant_id=tenantId,
        target_type="tenant_user",
        target_id=str(user.id),
        detail=payload.model_dump(exclude_unset=True),
        ip_address=request.client.host if request.client else None,
    )
    return TenantUserOut.model_validate(user)
