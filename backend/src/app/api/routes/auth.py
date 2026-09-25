"""Auth routes: login (+MFA), refresh rotation, logout, sessions, invites, passwords."""

import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import cast

from arq.connections import ArqRedis, RedisSettings, create_pool
from cryptography.fernet import Fernet
from fastapi import APIRouter, Request, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CallerDep, PlainDb, client_ip, rate_limit
from app.config import get_settings
from app.core import security
from app.core.exceptions import (
    NotFoundError,
    UnauthorizedError,
    ValidationError,
)
from app.models.enums import AccountStatus, InvitationPurpose, InvitationScope, SubjectType
from app.models.identity import Invitation, PlatformAdmin, TenantUser, UserSession
from app.schemas.auth import (
    AcceptInviteRequest,
    LoginRequest,
    LoginResponse,
    MeResponse,
    MfaCompleteRequest,
    MfaEnrollResponse,
    MfaVerifyRequest,
    MfaVerifyResponse,
    PasswordChangeRequest,
    PasswordForgotRequest,
    PasswordResetRequest,
    SessionView,
)
from app.schemas.base import OkResponse
from app.services import sessions as session_service
from app.services.audit import audit

settings = get_settings()
router = APIRouter(prefix="/auth", tags=["auth"])

type Subject = TenantUser | PlatformAdmin

_fernet = Fernet(settings.mfa_secret_key.encode())


def _encrypt_totp(secret: str) -> str:
    return _fernet.encrypt(secret.encode()).decode()


def _decrypt_totp(enc: str) -> str:
    return _fernet.decrypt(enc.encode()).decode()


async def _arq() -> ArqRedis:
    return await create_pool(RedisSettings.from_dsn(settings.redis_url))


async def _find_login_subject(
    db: AsyncSession, email: str, scope: str | None, password: str | None = None
) -> tuple[str | None, Subject | None]:
    """Resolve (subject_type, row) for an email in either user table.

    Emails are unique only per tenant, so the same address can exist in
    several tenant_users rows. When a password is given it disambiguates:
    the first row whose hash verifies wins.
    """
    email_l = email.lower()
    candidates: list[tuple[str, Subject]] = []
    if scope in (None, security.SCOPE_TENANT):
        rows = (
            (await db.execute(select(TenantUser).where(func.lower(TenantUser.email) == email_l)))
            .scalars()
            .all()
        )
        candidates += [(SubjectType.TENANT_USER.value, r) for r in rows]
    if scope in (None, security.SCOPE_PLATFORM):
        arows = (
            (await db.execute(select(PlatformAdmin).where(func.lower(PlatformAdmin.email) == email_l)))
            .scalars()
            .all()
        )
        candidates += [(SubjectType.PLATFORM_ADMIN.value, r) for r in arows]

    if password is None:
        return candidates[0] if candidates else (None, None)
    for stype, row in candidates:
        if row.password_hash and security.verify_password(password, row.password_hash):
            return stype, row
    return None, None


async def _issue_session(
    response: Response,
    db: AsyncSession,
    *,
    subject_type: str,
    subject: Subject,
    request: Request,
    impersonating: bool = False,
) -> LoginResponse:
    tenant_id = subject.tenant_id if isinstance(subject, TenantUser) else None
    session_row, refresh_secret = await session_service.create_session(
        db,
        subject_type=subject_type,
        subject_id=subject.id,
        tenant_id=tenant_id,
        user_agent=request.headers.get("user-agent"),
        ip=client_ip(request),
        impersonating=impersonating,
    )
    access = security.mint_access_token(
        subject.id,
        scope=security.SCOPE_TENANT
        if subject_type == SubjectType.TENANT_USER.value
        else security.SCOPE_PLATFORM,
        tenant_id=tenant_id,
        role=subject.role,
        session_id=session_row.id,
        impersonating=impersonating,
    )
    csrf = security.new_csrf_token()
    session_service.set_auth_cookies(
        response,
        access_token=access,
        session_id=session_row.id,
        refresh_secret=refresh_secret,
        csrf_token=csrf,
    )
    return LoginResponse(
        mfa_required=False,
        access_expires_in=settings.access_token_ttl_seconds,
        scope=security.SCOPE_TENANT
        if subject_type == SubjectType.TENANT_USER.value
        else security.SCOPE_PLATFORM,
        subject_id=subject.id,
        tenant_id=tenant_id,
        role=subject.role,
        csrf_token=csrf,
    )


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, request: Request, response: Response, db: PlainDb) -> LoginResponse:
    await rate_limit(
        "login", f"{client_ip(request)}:{body.email.lower()}", settings.login_rate_limit_per_minute
    )

    subject_type, subject = await _find_login_subject(db, body.email, body.scope, body.password)
    if subject is None or subject_type is None:
        raise UnauthorizedError("invalid email or password")
    if subject.status != AccountStatus.ACTIVE.value:
        raise UnauthorizedError(f"account is {subject.status}")

    if subject.mfa_enabled:
        ticket = security.mint_mfa_ticket(
            subject.id,
            scope=security.SCOPE_TENANT
            if subject_type == SubjectType.TENANT_USER.value
            else security.SCOPE_PLATFORM,
            tenant_id=subject.tenant_id if isinstance(subject, TenantUser) else None,
        )
        session_service.set_mfa_cookie(response, ticket)
        return LoginResponse(mfa_required=True)

    out = await _issue_session(response, db, subject_type=subject_type, subject=subject, request=request)
    subject.last_login_at = datetime.now(UTC)
    await audit(
        db,
        action="auth.login",
        actor_type=subject_type,
        actor_id=subject.id,
        tenant_id=out.tenant_id,
        ip=client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    return out


@router.post("/mfa/complete", response_model=LoginResponse)
async def mfa_complete(
    body: MfaCompleteRequest, request: Request, response: Response, db: PlainDb
) -> LoginResponse:
    ticket = request.cookies.get(security.MFA_COOKIE)
    if not ticket:
        raise UnauthorizedError("mfa ticket missing — log in first")
    try:
        claims = security.decode_token(ticket, expected_type=security.TOKEN_TYPE_MFA_TICKET)
    except ValueError as exc:
        raise UnauthorizedError("mfa ticket expired — log in again") from exc

    await rate_limit("mfa", f"{client_ip(request)}:{claims.subject_id}", settings.login_rate_limit_per_minute)

    model: type[Subject] = TenantUser if claims.scope == security.SCOPE_TENANT else PlatformAdmin
    subject = cast(Subject | None, await db.get(model, claims.subject_id))
    if subject is None or not subject.mfa_enabled or not subject.mfa_secret_enc:
        raise UnauthorizedError("mfa not enabled for this account")

    code = body.code.strip()
    ok = security.verify_totp(_decrypt_totp(subject.mfa_secret_enc), code)
    if not ok:
        # try backup codes
        hashed = security.hash_backup_code(code)
        remaining = list(subject.mfa_backup_hashes or [])
        if hashed in remaining:
            remaining.remove(hashed)
            subject.mfa_backup_hashes = remaining
            ok = True
    if not ok:
        raise UnauthorizedError("invalid mfa code")

    subject_type = (
        SubjectType.TENANT_USER.value
        if claims.scope == security.SCOPE_TENANT
        else SubjectType.PLATFORM_ADMIN.value
    )
    out = await _issue_session(response, db, subject_type=subject_type, subject=subject, request=request)
    response.delete_cookie(security.MFA_COOKIE, path="/api/v1/auth/mfa", domain=settings.cookie_domain)
    subject.last_login_at = datetime.now(UTC)
    await audit(
        db, action="auth.login.mfa", actor_type=subject_type, actor_id=subject.id, tenant_id=out.tenant_id
    )
    return out


@router.post("/refresh", response_model=LoginResponse)
async def refresh(request: Request, response: Response, db: PlainDb) -> LoginResponse:
    cookie = request.cookies.get(security.REFRESH_COOKIE)
    if not cookie:
        raise UnauthorizedError("refresh token missing")
    session_row, new_secret = await session_service.rotate_session(
        db, cookie, user_agent=request.headers.get("user-agent"), ip=client_ip(request)
    )

    model: type[Subject] = (
        TenantUser if session_row.subject_type == SubjectType.TENANT_USER.value else PlatformAdmin
    )
    subject = cast(Subject | None, await db.get(model, session_row.subject_id))
    if subject is None or subject.status != AccountStatus.ACTIVE.value:
        await session_service.revoke_session(db, session_row.id)
        raise UnauthorizedError("account unavailable")

    scope = (
        security.SCOPE_TENANT
        if session_row.subject_type == SubjectType.TENANT_USER.value
        else security.SCOPE_PLATFORM
    )
    access = security.mint_access_token(
        subject.id,
        scope=scope,
        tenant_id=session_row.tenant_id,
        role=subject.role,
        session_id=session_row.id,
        impersonating=session_row.impersonating,
    )
    csrf = security.new_csrf_token()
    session_service.set_auth_cookies(
        response,
        access_token=access,
        session_id=session_row.id,
        refresh_secret=new_secret,
        csrf_token=csrf,
    )
    return LoginResponse(
        mfa_required=False,
        access_expires_in=settings.access_token_ttl_seconds,
        scope=scope,
        subject_id=subject.id,
        tenant_id=session_row.tenant_id,
        role=subject.role,
        csrf_token=csrf,
    )


@router.post("/logout", response_model=OkResponse)
async def logout(request: Request, response: Response, db: PlainDb, caller: CallerDep) -> OkResponse:
    if caller.claims.session_id:
        await session_service.revoke_session(db, caller.claims.session_id)
    session_service.clear_auth_cookies(response)
    return OkResponse()


@router.get("/me", response_model=MeResponse)
async def me(caller: CallerDep, db: PlainDb) -> MeResponse:
    model: type[Subject] = TenantUser if caller.scope == security.SCOPE_TENANT else PlatformAdmin
    subject = cast(Subject | None, await db.get(model, caller.subject_id))
    if subject is None:
        raise UnauthorizedError("account not found")
    return MeResponse(
        subject_id=subject.id,
        scope=caller.scope,
        email=subject.email,
        full_name=subject.full_name,
        tenant_id=subject.tenant_id if isinstance(subject, TenantUser) else None,
        role=subject.role,
        mfa_enabled=subject.mfa_enabled,
        impersonating=caller.claims.impersonating,
    )


@router.get("/sessions", response_model=list[SessionView])
async def list_sessions(caller: CallerDep, db: PlainDb) -> list[SessionView]:
    rows = (
        (
            await db.execute(
                select(UserSession)
                .where(
                    UserSession.subject_id == caller.subject_id,
                    UserSession.revoked_at.is_(None),
                    UserSession.expires_at > datetime.now(UTC),
                )
                .order_by(UserSession.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return [
        SessionView(
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
            revoked_at=r.revoked_at,
            current=r.id == caller.claims.session_id,
        )
        for r in rows
    ]


@router.delete("/sessions/{session_id}", response_model=OkResponse)
async def revoke_one_session(session_id: uuid.UUID, caller: CallerDep, db: PlainDb) -> OkResponse:
    row = await db.get(UserSession, session_id)
    if row is None or row.subject_id != caller.subject_id:
        raise NotFoundError("session not found")
    await session_service.revoke_session(db, session_id)
    return OkResponse()


# ------------------------------------------------------------------- MFA mgmt


@router.post("/mfa/enroll", response_model=MfaEnrollResponse)
async def mfa_enroll(caller: CallerDep, db: PlainDb) -> MfaEnrollResponse:
    model: type[Subject] = TenantUser if caller.scope == security.SCOPE_TENANT else PlatformAdmin
    subject = cast(Subject | None, await db.get(model, caller.subject_id))
    if subject is None:
        raise UnauthorizedError("account not found")
    if subject.mfa_enabled:
        raise ValidationError("mfa already enabled")
    secret = security.new_totp_secret()
    subject.mfa_secret_enc = _encrypt_totp(secret)
    return MfaEnrollResponse(secret=secret, otpauth_uri=security.totp_uri(secret, subject.email))


@router.post("/mfa/verify", response_model=MfaVerifyResponse)
async def mfa_verify(body: MfaVerifyRequest, caller: CallerDep, db: PlainDb) -> MfaVerifyResponse:
    model: type[Subject] = TenantUser if caller.scope == security.SCOPE_TENANT else PlatformAdmin
    subject = cast(Subject | None, await db.get(model, caller.subject_id))
    if subject is None or not subject.mfa_secret_enc:
        raise UnauthorizedError("enroll first")
    if not security.verify_totp(_decrypt_totp(subject.mfa_secret_enc), body.code):
        raise UnauthorizedError("invalid totp code")
    codes = security.new_backup_codes()
    subject.mfa_enabled = True
    subject.mfa_backup_hashes = [security.hash_backup_code(c) for c in codes]
    await audit(
        db,
        action="auth.mfa.enabled",
        actor_type=caller.claims.subject_type
        if hasattr(caller.claims, "subject_type")
        else ("tenant_user" if caller.scope == "tenant" else "platform_admin"),
        actor_id=subject.id,
        tenant_id=getattr(subject, "tenant_id", None),
    )
    return MfaVerifyResponse(enabled=True, backup_codes=codes)


@router.post("/mfa/disable", response_model=OkResponse)
async def mfa_disable(body: PasswordChangeRequest, caller: CallerDep, db: PlainDb) -> OkResponse:
    model: type[Subject] = TenantUser if caller.scope == security.SCOPE_TENANT else PlatformAdmin
    subject = cast(Subject | None, await db.get(model, caller.subject_id))
    if (
        subject is None
        or not subject.password_hash
        or not security.verify_password(body.current_password, subject.password_hash)
    ):
        raise UnauthorizedError("invalid password")
    subject.mfa_enabled = False
    subject.mfa_secret_enc = None
    subject.mfa_backup_hashes = []
    return OkResponse()


# ------------------------------------------------------------------- invites & passwords


@router.post("/accept-invite", response_model=OkResponse)
async def accept_invite(body: AcceptInviteRequest, request: Request, db: PlainDb) -> OkResponse:
    token_hash = security.hash_token(body.token)
    invite = (
        await db.execute(select(Invitation).where(Invitation.token_hash == token_hash))
    ).scalar_one_or_none()
    now = datetime.now(UTC)
    if (
        invite is None
        or invite.purpose != InvitationPurpose.INVITE.value
        or invite.expires_at <= now
        or invite.accepted_at is not None
    ):
        raise UnauthorizedError("invalid or expired invite")

    model: type[Subject] = TenantUser if invite.scope == InvitationScope.TENANT_USER.value else PlatformAdmin
    subject = cast(Subject | None, await db.get(model, invite.subject_id))
    if subject is None:
        raise UnauthorizedError("account not found")
    subject.password_hash = security.hash_password(body.password)
    if body.full_name:
        subject.full_name = body.full_name
    subject.status = AccountStatus.ACTIVE.value
    subject.password_changed_at = now
    invite.accepted_at = now
    await audit(
        db,
        action="auth.invite.accepted",
        actor_type=invite.scope,
        actor_id=subject.id,
        tenant_id=invite.tenant_id,
        ip=client_ip(request),
    )
    return OkResponse()


@router.post("/password/change", response_model=OkResponse)
async def password_change(body: PasswordChangeRequest, caller: CallerDep, db: PlainDb) -> OkResponse:
    model: type[Subject] = TenantUser if caller.scope == security.SCOPE_TENANT else PlatformAdmin
    subject = cast(Subject | None, await db.get(model, caller.subject_id))
    if (
        subject is None
        or not subject.password_hash
        or not security.verify_password(body.current_password, subject.password_hash)
    ):
        raise UnauthorizedError("invalid current password")
    subject.password_hash = security.hash_password(body.new_password)
    subject.password_changed_at = datetime.now(UTC)
    await session_service.revoke_subject_sessions(db, subject.id)
    return OkResponse()


@router.post("/password/forgot", response_model=OkResponse)
async def password_forgot(body: PasswordForgotRequest, request: Request, db: PlainDb) -> OkResponse:
    # Always 200 — don't leak which emails exist.
    await rate_limit("pwdforgot", client_ip(request) or "anon", settings.login_rate_limit_per_minute)
    subject_type, subject = await _find_login_subject(db, body.email, None, None)
    if subject is not None:
        token = secrets.token_urlsafe(32)
        invite = Invitation(
            tenant_id=subject.tenant_id if isinstance(subject, TenantUser) else None,
            scope=InvitationScope.TENANT_USER.value
            if subject_type == SubjectType.TENANT_USER.value
            else InvitationScope.PLATFORM_ADMIN.value,
            purpose=InvitationPurpose.PASSWORD_RESET.value,
            email=subject.email,
            subject_id=subject.id,
            token_hash=security.hash_token(token),
            expires_at=datetime.now(UTC) + timedelta(hours=1),
        )
        db.add(invite)
        arq = await _arq()
        reset_url = f"{settings.app_base_url}/reset-password?token={token}"
        await arq.enqueue_job("send_email", subject.email, *_email_password_reset(reset_url))
    return OkResponse()


def _email_password_reset(reset_url: str) -> tuple[str, str]:
    from app.services.email import password_reset_email

    return password_reset_email(reset_url)


@router.post("/password/reset", response_model=OkResponse)
async def password_reset(body: PasswordResetRequest, db: PlainDb) -> OkResponse:
    invite = (
        await db.execute(select(Invitation).where(Invitation.token_hash == security.hash_token(body.token)))
    ).scalar_one_or_none()
    now = datetime.now(UTC)
    if (
        invite is None
        or invite.purpose != InvitationPurpose.PASSWORD_RESET.value
        or invite.expires_at <= now
        or invite.accepted_at is not None
    ):
        raise UnauthorizedError("invalid or expired reset token")
    model: type[Subject] = TenantUser if invite.scope == InvitationScope.TENANT_USER.value else PlatformAdmin
    subject = cast(Subject | None, await db.get(model, invite.subject_id))
    if subject is None:
        raise UnauthorizedError("account not found")
    subject.password_hash = security.hash_password(body.new_password)
    subject.password_changed_at = now
    if subject.status == AccountStatus.INVITED.value:
        subject.status = AccountStatus.ACTIVE.value
    invite.accepted_at = now
    await session_service.revoke_subject_sessions(db, subject.id)
    return OkResponse()
