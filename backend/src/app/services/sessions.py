"""Session lifecycle: create, refresh-rotate (with reuse detection), revoke."""

import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import Response
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core import security
from app.core.exceptions import UnauthorizedError
from app.models.identity import UserSession

settings = get_settings()


async def create_session(
    db: AsyncSession,
    *,
    subject_type: str,
    subject_id: uuid.UUID,
    tenant_id: uuid.UUID | None,
    user_agent: str | None,
    ip: str | None,
    impersonating: bool = False,
) -> tuple[UserSession, str]:
    """Create a session row; returns (row, refresh_cookie_secret)."""
    secret = security.mint_refresh_secret()
    row = UserSession(
        subject_type=subject_type,
        subject_id=subject_id,
        tenant_id=tenant_id,
        family_id=uuid.uuid4(),
        refresh_token_hash=security.hash_refresh_secret(secret),
        user_agent=(user_agent or "")[:500],
        ip=ip,
        impersonating=impersonating,
        expires_at=datetime.now(UTC) + timedelta(seconds=settings.refresh_token_ttl_seconds),
        last_seen_at=datetime.now(UTC),
    )
    db.add(row)
    await db.flush()
    return row, secret


async def rotate_session(
    db: AsyncSession,
    cookie_value: str,
    *,
    user_agent: str | None,
    ip: str | None,
) -> tuple[UserSession, str]:
    """Rotate a refresh token. Reuse of a revoked token revokes the family."""
    try:
        sid_hex, secret = cookie_value.split(".", 1)
        session_id = uuid.UUID(sid_hex)
    except (ValueError, AttributeError):
        raise UnauthorizedError("malformed refresh token") from None

    token_hash = security.hash_refresh_secret(secret)
    row = (await db.execute(select(UserSession).where(UserSession.id == session_id))).scalar_one_or_none()
    if row is None or row.refresh_token_hash != token_hash:
        raise UnauthorizedError("unknown session")
    now = datetime.now(UTC)
    if row.expires_at <= now:
        raise UnauthorizedError("session expired")
    if row.revoked_at is not None:
        # Refresh-token reuse: kill the whole family. Commit now — the
        # caller's transaction will roll back when we raise, which would
        # otherwise undo the revocation.
        await db.execute(
            update(UserSession)
            .where(UserSession.family_id == row.family_id, UserSession.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        await db.commit()
        raise UnauthorizedError("session revoked (refresh token reuse detected)")

    new_secret = security.mint_refresh_secret()
    successor = UserSession(
        subject_type=row.subject_type,
        subject_id=row.subject_id,
        tenant_id=row.tenant_id,
        family_id=row.family_id,
        refresh_token_hash=security.hash_refresh_secret(new_secret),
        user_agent=(user_agent or row.user_agent or "")[:500],
        ip=ip or row.ip,
        impersonating=row.impersonating,
        expires_at=now + timedelta(seconds=settings.refresh_token_ttl_seconds),
        last_seen_at=now,
    )
    db.add(successor)
    await db.flush()
    row.revoked_at = now
    row.replaced_by = successor.id
    return successor, new_secret


async def revoke_session(db: AsyncSession, session_id: uuid.UUID) -> None:
    await db.execute(
        update(UserSession)
        .where(UserSession.id == session_id, UserSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )


async def revoke_subject_sessions(db: AsyncSession, subject_id: uuid.UUID) -> None:
    await db.execute(
        update(UserSession)
        .where(UserSession.subject_id == subject_id, UserSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )


# ---------------------------------------------------------------- cookies


def _cookie_kwargs(path: str = "/") -> dict:
    return {
        "path": path,
        "secure": settings.cookie_secure,
        "httponly": True,
        "samesite": "lax",
        "domain": settings.cookie_domain,
    }


def set_auth_cookies(
    response: Response,
    *,
    access_token: str,
    session_id: uuid.UUID,
    refresh_secret: str,
    csrf_token: str,
) -> None:
    response.set_cookie(
        security.ACCESS_COOKIE,
        access_token,
        max_age=settings.access_token_ttl_seconds,
        **_cookie_kwargs("/"),
    )
    response.set_cookie(
        security.REFRESH_COOKIE,
        f"{session_id}.{refresh_secret}",
        max_age=settings.refresh_token_ttl_seconds,
        **_cookie_kwargs("/api/v1/auth"),
    )
    # CSRF cookie is readable by JS (double-submit pattern).
    response.set_cookie(
        security.CSRF_COOKIE,
        csrf_token,
        max_age=settings.refresh_token_ttl_seconds,
        path="/",
        secure=settings.cookie_secure,
        httponly=False,
        samesite="lax",
        domain=settings.cookie_domain,
    )


def set_mfa_cookie(response: Response, ticket: str) -> None:
    response.set_cookie(
        security.MFA_COOKIE,
        ticket,
        max_age=settings.mfa_ticket_ttl_seconds,
        **_cookie_kwargs("/api/v1/auth/mfa"),
    )


def clear_auth_cookies(response: Response) -> None:
    for name, path in (
        (security.ACCESS_COOKIE, "/"),
        (security.REFRESH_COOKIE, "/api/v1/auth"),
        (security.CSRF_COOKIE, "/"),
        (security.MFA_COOKIE, "/api/v1/auth/mfa"),
    ):
        response.delete_cookie(name, path=path, domain=settings.cookie_domain)


def new_csrf() -> str:
    return security.new_csrf_token()


def new_invite_token() -> str:
    return secrets.token_urlsafe(32)
