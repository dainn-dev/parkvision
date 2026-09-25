"""Authentication endpoints: login, MFA, refresh, logout, password, invites."""

from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import (
    Principal,
    csrf_protect,
    get_principal,
    system_db,
)
from app.core.errors import bad_request, not_found, unauthorized
from app.core.security import (
    decrypt_totp_secret,
    encrypt_totp_secret,
    hash_opaque,
    hash_password,
    new_backup_codes,
    new_opaque_token,
    new_totp_secret,
    totp_uri,
    verify_password,
    verify_totp,
)
from app.models import (
    PasswordReset,
    PlatformAdmin,
    Tenant,
    TenantUser,
    UserInvite,
    UserSession,
)
from app.models.enums import AccountStatus, InviteStatus
from app.schemas.auth import (
    ChangePasswordRequest,
    InviteAcceptRequest,
    LoginRequest,
    LoginResponse,
    MfaConfirmRequest,
    MfaConfirmResponse,
    MfaSetupResponse,
    MfaVerifyRequest,
    PasswordForgotRequest,
    PasswordResetRequest,
    RefreshResponse,
    SessionInfo,
    UserProfile,
)
from app.services import auth_service
from app.services.audit import audit
from app.services.common import get_or_404

router = APIRouter(prefix="/auth", tags=["auth"])

# Auth runs privileged: credential lookup and session writes happen before a
# tenant context exists (and platform sessions legitimately carry tenant_id NULL).
DbDep = Annotated[AsyncSession, Depends(system_db)]


def _profile(user, kind: str, impersonating: bool = False) -> UserProfile:
    return UserProfile(
        id=user.id,
        kind=kind,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        tenant_id=user.tenant_id if kind == "tenant_user" else None,
        mfa_enabled=bool(user.mfa_enabled),
        impersonating=impersonating,
    )


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest, request: Request, response: Response, db: DbDep):
    if payload.kind not in ("tenant_user", "platform_admin"):
        raise bad_request("kind must be 'tenant_user' or 'platform_admin'")
    result = await auth_service.login(
        db,
        request,
        response,
        email=payload.email,
        password=payload.password,
        kind=payload.kind,
        device_info=payload.device_info,
    )
    await db.commit()
    if result["status"] == "mfa_required":
        return LoginResponse(status="mfa_required", mfa_required=True)
    settings = get_settings()
    return LoginResponse(
        status="authenticated",
        user=_profile(result["user"], payload.kind),
        expires_in=settings.access_token_ttl_seconds,
    )


@router.post("/mfa/verify", response_model=LoginResponse, dependencies=[Depends(csrf_protect)])
async def mfa_verify(payload: MfaVerifyRequest, request: Request, response: Response, db: DbDep):
    result = await auth_service.verify_mfa(db, request, response, code=payload.code)
    await db.commit()
    kind = "platform_admin" if result["user"].__class__.__name__ == "PlatformAdmin" else "tenant_user"
    return LoginResponse(
        status="authenticated",
        user=_profile(result["user"], kind),
        expires_in=get_settings().access_token_ttl_seconds,
    )


@router.post("/refresh", response_model=RefreshResponse)
async def refresh(request: Request, response: Response, db: DbDep):
    await auth_service.refresh(db, request, response)
    await db.commit()
    return RefreshResponse(expires_in=get_settings().access_token_ttl_seconds)


@router.post("/logout", dependencies=[Depends(csrf_protect)])
async def logout(request: Request, response: Response, db: DbDep) -> dict:
    await auth_service.logout(db, request, response)
    await db.commit()
    return {"status": "ok"}


@router.get("/me", response_model=UserProfile)
async def me(
    principal: Annotated[Principal, Depends(get_principal)],
    db: DbDep,
) -> UserProfile:
    if principal.kind == "platform_admin":
        user = await get_or_404(db, PlatformAdmin, principal.id)
        return _profile(user, "platform_admin")
    user = await get_or_404(db, TenantUser, principal.id)
    return _profile(user, "tenant_user", impersonating=principal.acting_admin_id is not None)


@router.get("/sessions", response_model=list[SessionInfo])
async def my_sessions(
    principal: Annotated[Principal, Depends(get_principal)],
    db: DbDep,
) -> list[SessionInfo]:
    result = await db.execute(
        select(UserSession)
        .where(UserSession.user_id == principal.id, UserSession.revoked_at.is_(None))
        .order_by(UserSession.created_at.desc())
    )
    return [SessionInfo.model_validate(s) for s in result.scalars()]


@router.delete("/sessions/{session_id}", dependencies=[Depends(csrf_protect)])
async def revoke_session(
    session_id: UUID,
    principal: Annotated[Principal, Depends(get_principal)],
    db: DbDep,
) -> dict:
    session = await get_or_404(db, UserSession, session_id)
    if session.user_id != principal.id and principal.kind != "platform_admin":
        raise unauthorized("Cannot revoke another user's session")
    session.revoked_at = datetime.now(UTC)
    session.revoked_reason = "revoked_by_user"
    await db.commit()
    return {"status": "ok"}


# ---- MFA management (authenticated) ----


@router.post("/mfa/setup", response_model=MfaSetupResponse, dependencies=[Depends(csrf_protect)])
async def mfa_setup(
    principal: Annotated[Principal, Depends(get_principal)],
    db: DbDep,
) -> MfaSetupResponse:
    user = await (
        db.get(PlatformAdmin, principal.id)
        if principal.kind == "platform_admin"
        else db.get(TenantUser, principal.id)
    )
    if user is None:
        raise not_found("Account not found")
    if user.mfa_enabled:
        raise bad_request("MFA already enabled")
    secret = new_totp_secret()
    user.mfa_secret_enc = encrypt_totp_secret(secret)
    await db.commit()
    return MfaSetupResponse(secret=secret, otpauth_uri=totp_uri(secret, user.email))


@router.post("/mfa/confirm", response_model=MfaConfirmResponse, dependencies=[Depends(csrf_protect)])
async def mfa_confirm(
    payload: MfaConfirmRequest,
    principal: Annotated[Principal, Depends(get_principal)],
    db: DbDep,
) -> MfaConfirmResponse:
    user = await (
        db.get(PlatformAdmin, principal.id)
        if principal.kind == "platform_admin"
        else db.get(TenantUser, principal.id)
    )
    if user is None or not user.mfa_secret_enc:
        raise bad_request("Run /mfa/setup first")
    if not verify_totp(decrypt_totp_secret(user.mfa_secret_enc), payload.code):
        raise unauthorized("Invalid TOTP code")
    raw_codes, hashes = new_backup_codes()
    user.mfa_enabled = True
    user.mfa_backup_hashes = hashes
    await db.commit()
    await audit(
        db,
        action="auth.mfa_enabled",
        actor_kind=principal.kind,
        actor_id=principal.id,
        tenant_id=principal.tenant_id,
    )
    await db.commit()
    return MfaConfirmResponse(backup_codes=raw_codes)


@router.post("/mfa/disable", dependencies=[Depends(csrf_protect)])
async def mfa_disable(
    payload: MfaConfirmRequest,
    principal: Annotated[Principal, Depends(get_principal)],
    db: DbDep,
) -> dict:
    user = await (
        db.get(PlatformAdmin, principal.id)
        if principal.kind == "platform_admin"
        else db.get(TenantUser, principal.id)
    )
    if user is None or not user.mfa_enabled or not user.mfa_secret_enc:
        raise bad_request("MFA is not enabled")
    if not verify_totp(decrypt_totp_secret(user.mfa_secret_enc), payload.code):
        raise unauthorized("Invalid TOTP code")
    user.mfa_enabled = False
    user.mfa_secret_enc = None
    user.mfa_backup_hashes = None
    await db.commit()
    return {"status": "ok"}


# ---- Password reset ----


@router.post("/password/forgot", response_model=dict)
async def password_forgot(payload: PasswordForgotRequest, request: Request, db: DbDep) -> dict:
    """Always returns ok — account existence is not revealed."""
    model = PlatformAdmin if payload.kind == "platform_admin" else TenantUser
    result = await db.execute(select(model).where(model.email == payload.email.lower()))
    user = result.scalar_one_or_none()
    if user is not None and user.status == AccountStatus.ACTIVE:
        raw, token_hash = new_opaque_token()
        db.add(
            PasswordReset(
                user_kind=payload.kind,
                user_id=user.id,
                token_hash=token_hash,
                expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        await db.commit()
        reset_url = f"{get_settings().api_base_url}/reset-password?token={raw}"
        from arq import create_pool

        from app.workers.worker import _redis

        pool = await create_pool(_redis())
        try:
            await pool.enqueue_job("task_send_password_reset", user.email, reset_url)
        finally:
            await pool.aclose()
    return {"status": "ok"}


@router.post("/password/reset", dependencies=[Depends(csrf_protect)])
async def password_reset(payload: PasswordResetRequest, request: Request, db: DbDep) -> dict:
    result = await db.execute(
        select(PasswordReset).where(PasswordReset.token_hash == hash_opaque(payload.token))
    )
    reset = result.scalar_one_or_none()
    if reset is None or reset.used_at is not None or reset.expires_at < datetime.now(UTC):
        raise unauthorized("Invalid or expired reset token")
    model = PlatformAdmin if reset.user_kind == "platform_admin" else TenantUser
    user = await db.get(model, reset.user_id)
    if user is None:
        raise not_found("Account not found")
    user.password_hash = hash_password(payload.new_password)
    if user.status == AccountStatus.INVITED:
        user.status = AccountStatus.ACTIVE
        user.activated_at = datetime.now(UTC)
    reset.used_at = datetime.now(UTC)
    await db.execute(
        select(UserSession).where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
    )
    # revoke all existing sessions for this user
    for s in (
        await db.execute(
            select(UserSession).where(
                UserSession.user_id == user.id, UserSession.revoked_at.is_(None)
            )
        )
    ).scalars():
        s.revoked_at = datetime.now(UTC)
        s.revoked_reason = "password_reset"
    await db.commit()
    return {"status": "ok"}


@router.post("/password/change", dependencies=[Depends(csrf_protect)])
async def password_change(
    payload: ChangePasswordRequest,
    principal: Annotated[Principal, Depends(get_principal)],
    db: DbDep,
) -> dict:
    model = PlatformAdmin if principal.kind == "platform_admin" else TenantUser
    user = await db.get(model, principal.id)
    if user is None or not user.password_hash:
        raise not_found("Account not found")
    if not verify_password(payload.current_password, user.password_hash):
        raise unauthorized("Current password incorrect")
    user.password_hash = hash_password(payload.new_password)
    for s in (
        await db.execute(
            select(UserSession).where(
                UserSession.user_id == user.id,
                UserSession.revoked_at.is_(None),
                UserSession.id != principal.session_id,
            )
        )
    ).scalars():
        s.revoked_at = datetime.now(UTC)
        s.revoked_reason = "password_changed"
    await db.commit()
    return {"status": "ok"}


# ---- Invite acceptance ----


@router.post("/invite/accept", dependencies=[Depends(csrf_protect)])
async def invite_accept(
    payload: InviteAcceptRequest, request: Request, response: Response, db: DbDep
) -> dict:
    result = await db.execute(
        select(UserInvite).where(UserInvite.token_hash == hash_opaque(payload.token))
    )
    invite = result.scalar_one_or_none()
    if (
        invite is None
        or invite.status != InviteStatus.PENDING
        or invite.expires_at < datetime.now(UTC)
    ):
        raise unauthorized("Invalid or expired invite")

    existing = await db.execute(select(TenantUser).where(TenantUser.email == invite.email))
    user = existing.scalar_one_or_none()
    if user is None:
        user = TenantUser(
            tenant_id=invite.tenant_id,
            email=invite.email,
            full_name=payload.full_name,
            role=invite.role,
            password_hash=hash_password(payload.password),
            status=AccountStatus.ACTIVE,
            activated_at=datetime.now(UTC),
        )
        db.add(user)
        await db.flush()
    else:
        user.password_hash = hash_password(payload.password)
        user.full_name = payload.full_name
        user.status = AccountStatus.ACTIVE
        user.activated_at = datetime.now(UTC)
        if invite.role == "owner" or user.role == "viewer":
            user.role = invite.role
    invite.status = InviteStatus.ACCEPTED
    invite.accepted_at = datetime.now(UTC)

    # auto-login after acceptance
    await auth_service._issue_session(
        db, request, response, user=user, kind="tenant_user", mfa_verified=False
    )
    await db.commit()
    return {"status": "authenticated", "userId": str(user.id)}


@router.get("/invite/{token}")
async def invite_info(token: str, db: DbDep) -> dict:
    result = await db.execute(
        select(UserInvite).where(UserInvite.token_hash == hash_opaque(token))
    )
    invite = result.scalar_one_or_none()
    if invite is None or invite.status != InviteStatus.PENDING or invite.expires_at < datetime.now(UTC):
        raise not_found("Invite invalid or expired")
    tenant = await db.get(Tenant, invite.tenant_id)
    return {"email": invite.email, "role": invite.role, "tenantName": tenant.name if tenant else None}
