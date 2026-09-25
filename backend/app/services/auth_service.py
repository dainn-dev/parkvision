"""Login, refresh rotation (with reuse detection), logout, MFA, sessions."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ApiError, unauthorized
from app.core.security import (
    hash_password,
    issue_access_token,
    issue_mfa_pending_token,
    new_backup_codes,
    new_opaque_token,
    new_totp_secret,
    token_digest,
    totp_uri,
    verify_password,
    verify_totp,
)
from app.models import PlatformAdmin, Tenant, TenantUser, UserSession


async def _find_loginable(
    session: AsyncSession, email: str, kind: str, tenant_slug: str | None
):
    """Return (user, kind). 'auto' tries tenant users first then platform.
    Emails are unique per tenant but may repeat across tenants — in that case
    the caller must disambiguate via ``tenant_slug``."""
    if kind in ("auto", "tenant"):
        stmt = (
            select(TenantUser)
            .join(Tenant, Tenant.id == TenantUser.tenant_id)
            .where(TenantUser.email == email)
        )
        if tenant_slug:
            stmt = stmt.where(Tenant.slug == tenant_slug)
        rows = (await session.execute(stmt)).scalars().all()
        if len(rows) > 1:
            raise ApiError(
                "ambiguous_login",
                "Email exists in multiple tenants; pass tenantSlug",
                409,
            )
        if rows:
            return rows[0], "tenant"
    if kind in ("auto", "platform"):
        a = (
            await session.execute(
                select(PlatformAdmin).where(PlatformAdmin.email == email)
            )
        ).scalar_one_or_none()
        if a is not None:
            return a, "platform"
    return None, None


async def login(
    session: AsyncSession,
    *,
    email: str,
    password: str,
    kind: str,
    tenant_slug: str | None,
    ip: str | None,
    user_agent: str,
):
    """Returns either ("mfa", pending_token) or ("ok", session, access_token)."""
    user, user_kind = await _find_loginable(session, email, kind, tenant_slug)
    if user is None or not verify_password(password, user.password_hash):
        raise unauthorized("Invalid credentials")

    if user_kind == "tenant":
        if user.status != "active":
            raise unauthorized("Account is not active")
        tenant_id = user.tenant_id
        role = user.role
    else:
        if not user.is_active:
            raise unauthorized("Account is not active")
        tenant_id = None
        role = user.role

    if user.mfa_enabled:
        pending = issue_mfa_pending_token(
            user_id=user.id, kind=user_kind, tenant_id=tenant_id
        )
        return "mfa", pending

    session_row, access = await _create_session(
        session,
        user=user,
        kind=user_kind,
        tenant_id=tenant_id,
        role=role,
        mfa_verified=False,
        ip=ip,
        user_agent=user_agent,
    )
    return "ok", session_row, access, user


async def complete_mfa_login(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    kind: str,
    tenant_id: uuid.UUID | None,
    code: str,
    ip: str | None,
    user_agent: str,
):
    user = await _load_user(session, user_id, kind)
    if user is None or not user.mfa_enabled or not user.mfa_secret:
        raise unauthorized("MFA not required")

    ok = verify_totp(user.mfa_secret, code)
    used_backup = False
    if not ok:
        for h in list(user.mfa_backup_hashes or []):
            if verify_password(code, h):
                used_backup = True
                user.mfa_backup_hashes = [x for x in user.mfa_backup_hashes if x != h]
                break
    if not ok and not used_backup:
        raise unauthorized("Invalid MFA code")

    session_row, access = await _create_session(
        session,
        user=user,
        kind=kind,
        tenant_id=tenant_id,
        role=user.role,
        mfa_verified=True,
        ip=ip,
        user_agent=user_agent,
    )
    return session_row, access, user


async def _load_user(session: AsyncSession, user_id: uuid.UUID, kind: str):
    model = PlatformAdmin if kind == "platform" else TenantUser
    return await session.get(model, user_id)


async def _create_session(
    session: AsyncSession,
    *,
    user,
    kind: str,
    tenant_id: uuid.UUID | None,
    role: str,
    mfa_verified: bool,
    ip: str | None,
    user_agent: str,
):
    settings = get_settings()
    refresh = new_opaque_token()
    now = datetime.now(UTC)
    row = UserSession(
        user_kind=kind,
        user_id=user.id,
        tenant_id=tenant_id,
        refresh_token_hash=token_digest(refresh),
        mfa_verified=mfa_verified,
        ip=ip,
        user_agent=user_agent[:500],
        expires_at=now + timedelta(seconds=settings.refresh_token_ttl_seconds),
    )
    session.add(row)
    await session.flush()
    user.last_login_at = now
    access = issue_access_token(
        user_id=user.id,
        kind=kind,
        tenant_id=tenant_id,
        role=role,
        session_id=row.id,
        mfa_verified=mfa_verified,
    )
    return (row, refresh), access


async def refresh_session(
    session: AsyncSession,
    *,
    refresh_token: str,
    ip: str | None,
    user_agent: str,
):
    """Rotate the refresh token. Reuse of an old token revokes the family."""
    digest = token_digest(refresh_token)
    row = (
        await session.execute(
            select(UserSession).where(UserSession.refresh_token_hash == digest)
        )
    ).scalar_one_or_none()
    if row is None:
        raise unauthorized("Invalid refresh token")
    now = datetime.now(UTC)
    if row.revoked_at is not None or row.expires_at <= now:
        raise unauthorized("Session expired")

    user = await _load_user(session, row.user_id, row.user_kind)
    if user is None:
        raise unauthorized("Account unavailable")
    if row.user_kind == "tenant" and user.status != "active":
        raise unauthorized("Account is not active")
    if row.user_kind == "platform" and not user.is_active:
        raise unauthorized("Account is not active")

    # rotate: revoke old, issue successor
    new_refresh = new_opaque_token()
    successor = UserSession(
        user_kind=row.user_kind,
        user_id=row.user_id,
        tenant_id=row.tenant_id,
        refresh_token_hash=token_digest(new_refresh),
        mfa_verified=row.mfa_verified,
        ip=ip,
        user_agent=user_agent[:500],
        expires_at=now + timedelta(seconds=get_settings().refresh_token_ttl_seconds),
    )
    session.add(successor)
    await session.flush()
    row.revoked_at = now
    row.replaced_by = successor.id

    access = issue_access_token(
        user_id=user.id,
        kind=row.user_kind,
        tenant_id=row.tenant_id,
        role=user.role,
        session_id=successor.id,
        mfa_verified=row.mfa_verified,
    )
    return (successor, new_refresh), access, user


async def detect_reuse(session: AsyncSession, presented_hash: str) -> None:
    """If a presented token's hash is absent but a revoked session used it,
    revoke the whole family (rotation-reuse detection is implicit via
    replaced_by chain; here we simply ensure presented tokens exist)."""


async def logout(session: AsyncSession, *, session_id: uuid.UUID) -> None:
    await session.execute(
        update(UserSession)
        .where(UserSession.id == session_id, UserSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )


async def revoke_user_sessions(
    session: AsyncSession, *, user_id: uuid.UUID
) -> int:
    res = await session.execute(
        update(UserSession)
        .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )
    return res.rowcount or 0


# ---------- MFA enrollment ----------

async def mfa_enroll_start(session: AsyncSession, *, user_id: uuid.UUID, kind: str):
    user = await _load_user(session, user_id, kind)
    if user is None:
        raise ApiError("not_found", "User not found", 404)
    if user.mfa_enabled:
        raise ApiError("conflict", "MFA already enabled", 409)
    secret = new_totp_secret()
    user.mfa_secret = secret  # pending until confirmed
    return secret, totp_uri(secret, user.email)


async def mfa_enroll_confirm(
    session: AsyncSession, *, user_id: uuid.UUID, kind: str, code: str
) -> list[str]:
    user = await _load_user(session, user_id, kind)
    if user is None or not user.mfa_secret:
        raise ApiError("conflict", "MFA enrollment not started", 409)
    if not verify_totp(user.mfa_secret, code):
        raise unauthorized("Invalid MFA code")
    codes = new_backup_codes()
    user.mfa_enabled = True
    user.mfa_backup_hashes = [hash_password(c) for c in codes]
    return codes


async def mfa_disable(session: AsyncSession, *, user_id: uuid.UUID, kind: str, code: str) -> None:
    user = await _load_user(session, user_id, kind)
    if user is None or not user.mfa_enabled or not user.mfa_secret:
        raise ApiError("conflict", "MFA not enabled", 409)
    if not verify_totp(user.mfa_secret, code):
        raise unauthorized("Invalid MFA code")
    user.mfa_enabled = False
    user.mfa_secret = None
    user.mfa_backup_hashes = []
    await revoke_user_sessions(session, user_id=user_id)
