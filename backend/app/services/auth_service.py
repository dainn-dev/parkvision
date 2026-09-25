"""Authentication flows: login, MFA challenge, rotating refresh sessions."""

import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import ACCESS_COOKIE, CSRF_COOKIE, REFRESH_COOKIE
from app.core.errors import AppError, forbidden, unauthorized
from app.core.security import (
    PURPOSE_ACCESS,
    PURPOSE_MFA_CHALLENGE,
    create_jwt,
    decode_jwt,
    decrypt_totp_secret,
    hash_opaque,
    hash_password,
    new_backup_codes,
    new_csrf_token,
    new_opaque_token,
    verify_backup_code,
    verify_password,
    verify_totp,
)
from app.models import PlatformAdmin, TenantUser, UserSession
from app.models.enums import AccountStatus, ActorKind
from app.services.audit import audit

MAX_FAILED_ATTEMPTS = 5
LOCK_MINUTES = 15


def _set_auth_cookies(
    response: Response,
    *,
    access_token: str,
    refresh_token: str | None,
    csrf: str,
) -> None:
    settings = get_settings()
    common = dict(
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,  # type: ignore[arg-type]
        domain=settings.cookie_domain or None,
    )
    response.set_cookie(
        ACCESS_COOKIE,
        access_token,
        httponly=True,
        max_age=settings.access_token_ttl_seconds,
        path="/",
        **common,
    )
    if refresh_token is not None:
        response.set_cookie(
            REFRESH_COOKIE,
            refresh_token,
            httponly=True,
            max_age=settings.refresh_token_ttl_seconds,
            path="/api/v1/auth",
            **common,
        )
    # CSRF cookie is JS-readable (double-submit pattern)
    response.set_cookie(
        CSRF_COOKIE,
        csrf,
        httponly=False,
        max_age=settings.refresh_token_ttl_seconds,
        path="/",
        **common,
    )


def clear_auth_cookies(response: Response) -> None:
    settings = get_settings()
    for name, path in (
        (ACCESS_COOKIE, "/"),
        (REFRESH_COOKIE, "/api/v1/auth"),
        (CSRF_COOKIE, "/"),
        ("pv_mfa", "/api/v1/auth"),
    ):
        response.delete_cookie(name, path=path, domain=settings.cookie_domain or None)


async def _find_user(db: AsyncSession, email: str, kind: str):
    if kind == "platform_admin":
        result = await db.execute(select(PlatformAdmin).where(PlatformAdmin.email == email.lower()))
    else:
        result = await db.execute(select(TenantUser).where(TenantUser.email == email.lower()))
    return result.scalar_one_or_none()


def _user_email(user) -> str:
    return user.email


def _user_tenant_id(user, kind: str) -> UUID | None:
    return user.tenant_id if kind == "tenant_user" else None


def _user_mfa_enabled(user) -> bool:
    return bool(user.mfa_enabled)


async def _issue_session(
    db: AsyncSession,
    request: Request,
    response: Response,
    *,
    user,
    kind: str,
    mfa_verified: bool,
    acting_admin_id: UUID | None = None,
) -> UserSession:
    settings = get_settings()
    raw_refresh, refresh_hash = new_opaque_token()
    session = UserSession(
        user_kind=kind,
        user_id=user.id,
        tenant_id=_user_tenant_id(user, kind),
        refresh_token_hash=refresh_hash,
        device_info={} if request is None else _device_info(request),
        ip_address=request.client.host if request and request.client else None,
        user_agent=request.headers.get("user-agent") if request else None,
        mfa_verified=mfa_verified,
        acting_admin_id=acting_admin_id,
        expires_at=datetime.now(UTC) + timedelta(seconds=settings.refresh_token_ttl_seconds),
        last_used_at=datetime.now(UTC),
    )
    db.add(session)
    await db.flush()

    csrf = new_csrf_token()
    claims = {
        "kind": kind,
        "role": user.role,
        "sid": str(session.id),
        "tenant": str(_user_tenant_id(user, kind)) if _user_tenant_id(user, kind) else None,
        "act": str(acting_admin_id) if acting_admin_id else None,
        "mfa": mfa_verified,
    }
    access = create_jwt(
        subject=str(user.id),
        purpose=PURPOSE_ACCESS,
        ttl_seconds=settings.access_token_ttl_seconds,
        claims=claims,
    )
    _set_auth_cookies(response, access_token=access, refresh_token=raw_refresh, csrf=csrf)
    return session


def _device_info(request: Request) -> dict:
    return {"user_agent": request.headers.get("user-agent", "")[:300]}


async def login(
    db: AsyncSession,
    request: Request,
    response: Response,
    *,
    email: str,
    password: str,
    kind: str,
    device_info: dict | None,
) -> dict:
    email = email.lower()
    user = await _find_user(db, email, kind)
    # uniform failure — do not reveal whether the account exists
    if user is None or user.password_hash is None or not verify_password(password, user.password_hash):
        await audit(
            db,
            action="auth.login_failed",
            actor_kind=ActorKind.SYSTEM,
            actor_id=None,
            detail={"email": email, "kind": kind},
            ip_address=request.client.host if request.client else None,
        )
        raise unauthorized("Invalid credentials")

    if user.status != AccountStatus.ACTIVE:
        raise forbidden(f"Account is {user.status}")

    if _user_mfa_enabled(user):
        settings = get_settings()
        mfa_token = create_jwt(
            subject=str(user.id),
            purpose=PURPOSE_MFA_CHALLENGE,
            ttl_seconds=settings.mfa_token_ttl_seconds,
            claims={"kind": kind},
        )
        response.set_cookie(
            "pv_mfa",
            mfa_token,
            httponly=True,
            secure=settings.cookie_secure,
            samesite=settings.cookie_samesite,  # type: ignore[arg-type]
            max_age=settings.mfa_token_ttl_seconds,
            path="/api/v1/auth",
            domain=settings.cookie_domain or None,
        )
        return {"status": "mfa_required", "mfaRequired": True}

    user.last_login_at = datetime.now(UTC)
    await _issue_session(
        db, request, response, user=user, kind=kind, mfa_verified=False
    )
    await audit(
        db,
        action="auth.login",
        actor_kind=kind,
        actor_id=user.id,
        actor_email=user.email,
        tenant_id=_user_tenant_id(user, kind),
        ip_address=request.client.host if request.client else None,
    )
    return {"status": "authenticated", "user": user}


async def verify_mfa(
    db: AsyncSession,
    request: Request,
    response: Response,
    *,
    code: str,
) -> dict:
    token = request.cookies.get("pv_mfa")
    if not token:
        raise unauthorized("No MFA challenge in progress")
    payload = decode_jwt(token, purpose=PURPOSE_MFA_CHALLENGE)
    kind = payload.get("kind", "tenant_user")
    user_id = UUID(payload["sub"])

    if kind == "platform_admin":
        user = await db.get(PlatformAdmin, user_id)
    else:
        user = await db.get(TenantUser, user_id)
    if user is None or not user.mfa_enabled or not user.mfa_secret_enc:
        raise unauthorized("MFA not configured")

    ok = verify_totp(decrypt_totp_secret(user.mfa_secret_enc), code)
    if not ok and user.mfa_backup_hashes:
        idx = verify_backup_code(code, list(user.mfa_backup_hashes))
        if idx is not None:
            remaining = list(user.mfa_backup_hashes)
            remaining.pop(idx)
            user.mfa_backup_hashes = remaining
            ok = True
    if not ok:
        raise unauthorized("Invalid MFA code")

    response.delete_cookie("pv_mfa", path="/api/v1/auth")
    user.last_login_at = datetime.now(UTC)
    await _issue_session(db, request, response, user=user, kind=kind, mfa_verified=True)
    await audit(
        db,
        action="auth.mfa_verified",
        actor_kind=kind,
        actor_id=user.id,
        actor_email=user.email,
        tenant_id=_user_tenant_id(user, kind),
    )
    return {"status": "authenticated", "user": user}


async def refresh(
    db: AsyncSession,
    request: Request,
    response: Response,
) -> UserSession:
    raw = request.cookies.get(REFRESH_COOKIE)
    if not raw:
        # bearer refresh: Authorization: Bearer <refresh JWT>? We use opaque tokens only.
        raise unauthorized("No refresh token")

    result = await db.execute(
        select(UserSession).where(UserSession.refresh_token_hash == hash_opaque(raw))
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise unauthorized("Unknown refresh token")

    now = datetime.now(UTC)
    if session.revoked_at is not None:
        # Replay of a rotated token — revoke the whole forward chain.
        await _revoke_chain(db, session, reason="refresh_reuse")
        clear_auth_cookies(response)
        raise unauthorized("Refresh token reuse detected — sessions revoked")
    if session.expires_at <= now:
        clear_auth_cookies(response)
        raise unauthorized("Session expired")

    # Rotate: revoke this session and issue a successor.
    if session.user_kind == "platform_admin":
        user = await db.get(PlatformAdmin, session.user_id)
    else:
        user = await db.get(TenantUser, session.user_id)
    if user is None or user.status != AccountStatus.ACTIVE:
        clear_auth_cookies(response)
        raise unauthorized("Account unavailable")

    new_session = await _issue_session(
        db,
        request,
        response,
        user=user,
        kind=session.user_kind,
        mfa_verified=session.mfa_verified,
        acting_admin_id=session.acting_admin_id,
    )
    session.revoked_at = now
    session.revoked_reason = "rotated"
    session.replaced_by_id = new_session.id
    await db.flush()
    return new_session


async def _revoke_chain(db: AsyncSession, session: UserSession, *, reason: str) -> None:
    now = datetime.now(UTC)
    current: UserSession | None = session
    seen: set[UUID] = set()
    while current is not None and current.id not in seen:
        seen.add(current.id)
        if current.revoked_reason != "rotated":
            current.revoked_at = now
            current.revoked_reason = reason
        if current.replaced_by_id is None:
            break
        current = await db.get(UserSession, current.replaced_by_id)
    await db.flush()


async def logout(db: AsyncSession, request: Request, response: Response) -> None:
    raw = request.cookies.get(REFRESH_COOKIE)
    if raw:
        result = await db.execute(
            select(UserSession).where(UserSession.refresh_token_hash == hash_opaque(raw))
        )
        session = result.scalar_one_or_none()
        if session and session.revoked_at is None:
            session.revoked_at = datetime.now(UTC)
            session.revoked_reason = "logout"
    clear_auth_cookies(response)


async def impersonate(
    db: AsyncSession,
    request: Request,
    response: Response,
    *,
    admin: PlatformAdmin,
    tenant_id: UUID,
    user_id: UUID | None,
) -> dict:
    """Platform admin obtains a tenant-scoped session for support."""
    if user_id is not None:
        user = await db.get(TenantUser, user_id)
        if user is None or user.tenant_id != tenant_id:
            raise AppError(404, "NOT_FOUND", "Tenant user not found")
    else:
        result = await db.execute(
            select(TenantUser)
            .where(TenantUser.tenant_id == tenant_id, TenantUser.role == "owner")
            .limit(1)
        )
        user = result.scalar_one_or_none()
        if user is None:
            result = await db.execute(
                select(TenantUser).where(TenantUser.tenant_id == tenant_id).limit(1)
            )
            user = result.scalar_one_or_none()
        if user is None:
            raise AppError(404, "NOT_FOUND", "No users in tenant")

    await _issue_session(
        db,
        request,
        response,
        user=user,
        kind="tenant_user",
        mfa_verified=True,
        acting_admin_id=admin.id,
    )
    await audit(
        db,
        action="platform.impersonate",
        actor_kind=ActorKind.PLATFORM_ADMIN,
        actor_id=admin.id,
        actor_email=admin.email,
        tenant_id=tenant_id,
        target_type="tenant_user",
        target_id=str(user.id),
    )
    return {"status": "authenticated", "user": user, "impersonating": True}


def make_password_hash(password: str) -> str:
    if len(password) < 12:
        raise AppError(422, "WEAK_PASSWORD", "Password must be at least 12 characters")
    return hash_password(password)


__all__ = [
    "clear_auth_cookies",
    "impersonate",
    "login",
    "logout",
    "make_password_hash",
    "new_backup_codes",
    "refresh",
    "secrets",
    "verify_mfa",
]
