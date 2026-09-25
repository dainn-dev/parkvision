"""Authentication flows: login, MFA staging, refresh rotation, logout, sessions.

Refresh tokens rotate on every use; presenting a rotated/revoked token marks
the whole session family compromised and revokes it.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update

from app.config import settings
from app.core.enums import AccountStatus, ActorType
from app.core.errors import unauthorized
from app.database import platform_session
from app.models import PlatformAdmin, Tenant, TenantUser, UserSession
from app.security import (
    create_access_token,
    decrypt_secret,
    encrypt_secret,
    generate_backup_codes,
    hash_backup_code,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    new_totp_secret,
    totp_uri,
    verify_password,
    verify_totp,
)


@dataclass
class TokenBundle:
    access_token: str
    refresh_token: str
    session_id: uuid.UUID
    expires_in: int


@dataclass
class LoginResult:
    bundle: TokenBundle | None
    mfa_required: bool
    pending_token: str | None  # short-lived access token with mfa_pending=true
    user: TenantUser | PlatformAdmin | None
    user_type: str | None


def _new_session_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(seconds=settings.refresh_token_ttl_seconds)


def _bundle(session: UserSession, user_id, user_type, tenant_id, role, mfa) -> TokenBundle:
    access = create_access_token(
        user_id=user_id,
        user_type=user_type,
        session_id=session.id,
        tenant_id=tenant_id,
        role=role,
        mfa_verified=mfa,
    )
    return TokenBundle(
        access_token=access,
        refresh_token=session.refresh_token_plain,
        session_id=session.id,
        expires_in=settings.access_token_ttl_seconds,
    )


async def _create_session(
    session,
    *,
    user_id: uuid.UUID,
    user_type: str,
    tenant_id: uuid.UUID | None,
    ip: str | None,
    user_agent: str | None,
    mfa_verified: bool,
) -> UserSession:
    refresh_plain = new_refresh_token()
    sess = UserSession(
        user_id=user_id,
        user_type=user_type,
        tenant_id=tenant_id,
        family_id=uuid.uuid4(),
        refresh_token_hash=hash_refresh_token(refresh_plain),
        ip=ip,
        user_agent=user_agent,
        mfa_verified=mfa_verified,
        expires_at=_new_session_expiry(),
        last_seen_at=datetime.now(timezone.utc),
    )
    session.add(sess)
    await session.flush()
    sess.refresh_token_plain = refresh_plain
    return sess


async def login(email: str, password: str, ip: str | None, user_agent: str | None) -> LoginResult:
    """Verify credentials; return a full session or an mfa_pending token."""
    async with platform_session() as db:
        user: TenantUser | PlatformAdmin | None = None
        user_type = None
        tenant_id = None

        res = await db.execute(select(TenantUser).where(TenantUser.email == email.lower()))
        user = res.scalar_one_or_none()
        if user is not None:
            user_type = ActorType.TENANT_USER
            tenant_id = user.tenant_id
        else:
            res = await db.execute(
                select(PlatformAdmin).where(PlatformAdmin.email == email.lower())
            )
            user = res.scalar_one_or_none()
            user_type = ActorType.PLATFORM_ADMIN if user else None

        if user is None or not verify_password(password, user.password_hash):
            raise unauthorized("Invalid email or password")
        if user.status != AccountStatus.ACTIVE:
            raise unauthorized("Account is not active")

        if user.mfa_enabled:
            # Stage a session not yet usable for resource calls.
            sess = await _create_session(
                db,
                user_id=user.id,
                user_type=str(user_type),
                tenant_id=tenant_id,
                ip=ip,
                user_agent=user_agent,
                mfa_verified=False,
            )
            pending = create_access_token(
                user_id=user.id,
                user_type=str(user_type),
                session_id=sess.id,
                tenant_id=tenant_id,
                role=user.role,
                mfa_verified=False,
                mfa_pending=True,
            )
            return LoginResult(
                bundle=None,
                mfa_required=True,
                pending_token=pending,
                user=user,
                user_type=str(user_type),
            )

        sess = await _create_session(
            db,
            user_id=user.id,
            user_type=str(user_type),
            tenant_id=tenant_id,
            ip=ip,
            user_agent=user_agent,
            mfa_verified=False,
        )
        user.last_login_at = datetime.now(timezone.utc)
        return LoginResult(
            bundle=_bundle(sess, user.id, str(user_type), tenant_id, user.role, False),
            mfa_required=False,
            pending_token=None,
            user=user,
            user_type=str(user_type),
        )


async def complete_mfa(user_id: uuid.UUID, session_id: uuid.UUID, code: str) -> TokenBundle:
    """Second step after login when MFA is on: verify TOTP or backup code."""
    async with platform_session() as db:
        sess = (
            await db.execute(select(UserSession).where(UserSession.id == session_id))
        ).scalar_one_or_none()
        if sess is None or sess.revoked_at is not None or sess.expires_at < datetime.now(timezone.utc):
            raise unauthorized("Session expired")

        user: TenantUser | PlatformAdmin | None = None
        if sess.user_type == ActorType.TENANT_USER:
            user = (
                await db.execute(select(TenantUser).where(TenantUser.id == user_id))
            ).scalar_one_or_none()
        else:
            user = (
                await db.execute(select(PlatformAdmin).where(PlatformAdmin.id == user_id))
            ).scalar_one_or_none()
        if user is None or not user.mfa_secret:
            raise unauthorized("MFA not configured")

        secret = decrypt_secret(user.mfa_secret)
        ok = verify_totp(secret, code)
        if not ok and user.mfa_backup_hashes:
            hashed = hash_backup_code(code.strip())
            if hashed in user.mfa_backup_hashes:
                user.mfa_backup_hashes = [h for h in user.mfa_backup_hashes if h != hashed]
                ok = True
        if not ok:
            raise unauthorized("Invalid MFA code")

        sess.mfa_verified = True
        sess.last_seen_at = datetime.now(timezone.utc)
        user.last_login_at = datetime.now(timezone.utc)
        # Completing MFA upgrades the staged session to a full session;
        # issue a fresh refresh token for it.
        new_plain = new_refresh_token()
        sess.prev_refresh_token_hash = sess.refresh_token_hash
        sess.refresh_token_hash = hash_refresh_token(new_plain)
        sess.rotated_at = datetime.now(timezone.utc)
        sess.refresh_token_plain = new_plain
        await db.flush()
        return _bundle(sess, user.id, sess.user_type, sess.tenant_id, user.role, True)


REUSE_GRACE_SECONDS = 60  # tolerate concurrent retries of the just-rotated token


async def refresh_session(raw_refresh_token: str) -> TokenBundle:
    """Rotate the refresh token; reuse of an old token revokes the family."""
    async with platform_session() as db:
        token_hash = hash_refresh_token(raw_refresh_token)
        sess = (
            await db.execute(
                select(UserSession).where(
                    (UserSession.refresh_token_hash == token_hash)
                    | (UserSession.prev_refresh_token_hash == token_hash)
                )
            )
        ).scalar_one_or_none()

        if sess is None:
            raise unauthorized("Invalid refresh token")
        now = datetime.now(timezone.utc)

        presented_previous = sess.prev_refresh_token_hash == token_hash
        if presented_previous:
            within_grace = (
                sess.rotated_at is not None
                and (now - sess.rotated_at).total_seconds() <= REUSE_GRACE_SECONDS
                and sess.revoked_at is None
            )
            if not within_grace:
                # Reuse of a rotated token outside the retry window: treat as
                # theft and revoke the whole session family.
                await db.execute(
                    update(UserSession)
                    .where(UserSession.family_id == sess.family_id)
                    .values(revoked_at=now)
                )
                # Commit the revocation before raising — raising inside
                # session.begin() would roll it back.
                await db.commit()
                raise unauthorized("Refresh token reuse detected; session revoked")

        if sess.revoked_at is not None:
            raise unauthorized("Session revoked")
        if sess.expires_at < now:
            raise unauthorized("Session expired")

        user: TenantUser | PlatformAdmin | None = None
        if sess.user_type == ActorType.TENANT_USER:
            user = (
                await db.execute(select(TenantUser).where(TenantUser.id == sess.user_id))
            ).scalar_one_or_none()
        else:
            user = (
                await db.execute(
                    select(PlatformAdmin).where(PlatformAdmin.id == sess.user_id)
                )
            ).scalar_one_or_none()
        if user is None or user.status != AccountStatus.ACTIVE:
            raise unauthorized("Account is not active")

        if presented_previous:
            # Retry within grace: return a fresh token without re-rotating so a
            # racing client cannot lock itself out.
            sess.last_seen_at = now
            sess.refresh_token_plain = raw_refresh_token
            await db.flush()
            return _bundle(
                sess, user.id, sess.user_type, sess.tenant_id, user.role, sess.mfa_verified
            )

        new_plain = new_refresh_token()
        sess.prev_refresh_token_hash = sess.refresh_token_hash
        sess.refresh_token_hash = hash_refresh_token(new_plain)
        sess.rotated_at = now
        sess.expires_at = _new_session_expiry()
        sess.last_seen_at = now
        sess.refresh_token_plain = new_plain
        await db.flush()
        return _bundle(sess, user.id, sess.user_type, sess.tenant_id, user.role, sess.mfa_verified)


async def flag_family_compromised(session_id: uuid.UUID) -> None:
    async with platform_session() as db:
        await db.execute(
            update(UserSession)
            .where(
                UserSession.family_id
                == select(UserSession.family_id)
                .where(UserSession.id == session_id)
                .scalar_subquery()
            )
            .values(revoked_at=datetime.now(timezone.utc))
        )


async def logout(session_id: uuid.UUID) -> None:
    async with platform_session() as db:
        await db.execute(
            update(UserSession)
            .where(UserSession.id == session_id)
            .values(revoked_at=datetime.now(timezone.utc))
        )


async def validate_session_state(session_id: uuid.UUID) -> bool:
    async with platform_session() as db:
        sess = (
            await db.execute(
                select(UserSession.revoked_at, UserSession.expires_at).where(
                    UserSession.id == session_id
                )
            )
        ).one_or_none()
        if sess is None:
            return False
        revoked_at, expires_at = sess
        return revoked_at is None and expires_at > datetime.now(timezone.utc)


async def mfa_setup(user: TenantUser | PlatformAdmin) -> tuple[str, str]:
    """Generate (and stash encrypted) a new TOTP secret. Returns secret + URI."""
    secret = new_totp_secret()
    async with platform_session() as db:
        if isinstance(user, TenantUser):
            row = (
                await db.execute(select(TenantUser).where(TenantUser.id == user.id))
            ).scalar_one()
        else:
            row = (
                await db.execute(select(PlatformAdmin).where(PlatformAdmin.id == user.id))
            ).scalar_one()
        row.mfa_secret = encrypt_secret(secret)
    return secret, totp_uri(secret, user.email)


async def mfa_enable(user_id: uuid.UUID, user_type: str, code: str) -> list[str]:
    async with platform_session() as db:
        model = TenantUser if user_type == ActorType.TENANT_USER else PlatformAdmin
        row = (await db.execute(select(model).where(model.id == user_id))).scalar_one_or_none()
        if row is None or not row.mfa_secret:
            raise unauthorized("Run MFA setup first")
        if not verify_totp(decrypt_secret(row.mfa_secret), code):
            raise unauthorized("Invalid MFA code")
        row.mfa_enabled = True
        codes = generate_backup_codes()
        row.mfa_backup_hashes = [hash_backup_code(c) for c in codes]
        return codes


async def mfa_disable(user_id: uuid.UUID, user_type: str, code: str) -> None:
    async with platform_session() as db:
        model = TenantUser if user_type == ActorType.TENANT_USER else PlatformAdmin
        row = (await db.execute(select(model).where(model.id == user_id))).scalar_one_or_none()
        if row is None or not row.mfa_enabled or not row.mfa_secret:
            raise unauthorized("MFA is not enabled")
        if not verify_totp(decrypt_secret(row.mfa_secret), code):
            raise unauthorized("Invalid MFA code")
        row.mfa_enabled = False
        row.mfa_secret = None
        row.mfa_backup_hashes = None


async def change_password(
    user_id: uuid.UUID, user_type: str, current: str, new: str
) -> None:
    async with platform_session() as db:
        model = TenantUser if user_type == ActorType.TENANT_USER else PlatformAdmin
        row = (await db.execute(select(model).where(model.id == user_id))).scalar_one_or_none()
        if row is None or not verify_password(current, row.password_hash):
            raise unauthorized("Current password is incorrect")
        row.password_hash = hash_password(new)
        # Revoke all other sessions for this user (keep the current one alive is
        # handled by the caller if needed; simplest secure default: revoke all
        # and force re-login).
        await db.execute(
            update(UserSession)
            .where(UserSession.user_id == user_id, UserSession.user_type == str(user_type))
            .values(revoked_at=datetime.now(timezone.utc))
        )


async def resolve_tenant_for_user(tenant_id: uuid.UUID) -> Tenant | None:
    async with platform_session() as db:
        return (
            await db.execute(select(Tenant).where(Tenant.id == tenant_id))
        ).scalar_one_or_none()
