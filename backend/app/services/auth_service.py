"""Authentication flows: login, MFA staging, refresh rotation, logout, sessions.

Refresh tokens rotate on every use; presenting a rotated/revoked token marks
the whole session family compromised and revokes it.

MFA: a successful password check on an MFA-enabled account stages a session
(mfa_verified=False) and issues an `mfa_pending` access token good only for
/api/v1/auth/mfa/*. The staged session is the MFA transaction: `mfa_attempts`
bounds OTP guesses and the pending token's 5-minute expiry bounds the window.
"""

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update

from app.config import settings
from app.core.enums import AccountStatus, ActorType
from app.core.errors import (
    account_disabled,
    account_locked,
    invalid_credentials,
    invalid_mfa_code,
    invalid_reset_token,
    mfa_session_expired,
    mfa_session_invalid,
    mfa_too_many_attempts,
    unauthorized,
)
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
from app.services.audit_service import write_audit


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
    mfa_methods: list[str]
    mfa_expires_in: int | None
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
        amr=["pwd", "otp"] if mfa else ["pwd"],
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
    # Light device/risk scoring: fingerprint from IP+UA; a login from a
    # fingerprint the user has never used is flagged 'suspicious'.
    fingerprint = hashlib.sha256(f"{ip or ''}|{user_agent or ''}".encode()).hexdigest()[:32]
    seen_q = await session.execute(
        select(UserSession.id)
        .where(
            UserSession.user_id == user_id,
            UserSession.user_type == user_type,
            UserSession.device_fingerprint == fingerprint,
        )
        .limit(1)
    )
    known_device = seen_q.scalar_one_or_none() is not None
    risk = "normal"
    if not known_device:
        prior_q = await session.execute(
            select(UserSession.id)
            .where(UserSession.user_id == user_id, UserSession.user_type == user_type)
            .limit(1)
        )
        if prior_q.scalar_one_or_none() is not None:
            risk = "suspicious"

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
        risk_level=risk,
        device_fingerprint=fingerprint,
    )
    session.add(sess)
    await session.flush()
    sess.refresh_token_plain = refresh_plain
    return sess


async def _audit_login(
    db,
    *,
    action: str,
    user: TenantUser | PlatformAdmin | None,
    user_type: str | None,
    tenant_id: uuid.UUID | None,
    email: str,
    ip: str | None,
    details: dict | None = None,
) -> None:
    await write_audit(
        db,
        tenant_id=tenant_id,
        actor_type=str(user_type) if user_type else "unknown",
        actor_id=user.id if user else None,
        actor_email=user.email if user else email,
        action=action,
        resource_type="auth",
        ip=ip,
        details=details or {},
    )


async def _fail_login(
    db,
    *,
    user: TenantUser | PlatformAdmin | None,
    user_type: str | None,
    tenant_id: uuid.UUID | None,
    email: str,
    ip: str | None,
) -> None:
    """Record a failed credential check; locks the account at the threshold.

    Commits before the caller raises — the ApiError would otherwise roll back
    the attempt counter and audit row.
    """
    if user is not None:
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        if user.failed_login_attempts >= settings.login_max_attempts:
            user.locked_until = datetime.now(timezone.utc) + timedelta(
                seconds=settings.login_lockout_seconds
            )
            await _audit_login(
                db,
                action="auth.account_locked",
                user=user,
                user_type=user_type,
                tenant_id=tenant_id,
                email=email,
                ip=ip,
            )
    await _audit_login(
        db,
        action="auth.login_failed",
        user=user,
        user_type=user_type,
        tenant_id=tenant_id,
        email=email,
        ip=ip,
    )
    await db.commit()


def _mfa_methods(user: TenantUser | PlatformAdmin) -> list[str]:
    methods = ["totp"]
    if user.mfa_backup_hashes:
        methods.append("recovery_code")
    return methods


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
            res = await db.execute(select(PlatformAdmin).where(PlatformAdmin.email == email.lower()))
            user = res.scalar_one_or_none()
            user_type = ActorType.PLATFORM_ADMIN if user else None

        now = datetime.now(timezone.utc)
        if user is not None:
            if user.locked_until is not None and user.locked_until > now:
                await _audit_login(
                    db,
                    action="auth.login_failed",
                    user=user,
                    user_type=user_type,
                    tenant_id=tenant_id,
                    email=email,
                    ip=ip,
                    details={"reason": "account_locked"},
                )
                await db.commit()
                raise account_locked() from None
            if user.status == AccountStatus.DISABLED:
                await _audit_login(
                    db,
                    action="auth.login_failed",
                    user=user,
                    user_type=user_type,
                    tenant_id=tenant_id,
                    email=email,
                    ip=ip,
                    details={"reason": "account_disabled"},
                )
                await db.commit()
                raise account_disabled() from None

        if user is None or not verify_password(password, user.password_hash):
            await _fail_login(
                db, user=user, user_type=user_type, tenant_id=tenant_id, email=email, ip=ip
            )
            raise invalid_credentials() from None

        if user.status != AccountStatus.ACTIVE:
            # e.g. invited-but-not-activated — same error as a bad password so
            # the response never reveals account state.
            await _fail_login(
                db, user=user, user_type=user_type, tenant_id=tenant_id, email=email, ip=ip
            )
            raise invalid_credentials() from None

        user.failed_login_attempts = 0
        user.locked_until = None

        if user.mfa_enabled:
            # Stage a session not yet usable for resource calls — this staged
            # session is the MFA transaction (attempt counter + pending token).
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
                ttl_seconds=settings.mfa_pending_ttl_seconds,
            )
            await _audit_login(
                db,
                action="auth.mfa_required",
                user=user,
                user_type=user_type,
                tenant_id=tenant_id,
                email=email,
                ip=ip,
            )
            return LoginResult(
                bundle=None,
                mfa_required=True,
                pending_token=pending,
                mfa_methods=_mfa_methods(user),
                mfa_expires_in=settings.mfa_pending_ttl_seconds,
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
        user.last_login_at = now
        await _audit_login(
            db,
            action="auth.login_success",
            user=user,
            user_type=user_type,
            tenant_id=tenant_id,
            email=email,
            ip=ip,
        )
        return LoginResult(
            bundle=_bundle(sess, user.id, str(user_type), tenant_id, user.role, False),
            mfa_required=False,
            pending_token=None,
            mfa_methods=[],
            mfa_expires_in=None,
            user=user,
            user_type=str(user_type),
        )


async def _fail_mfa(db, sess: UserSession, ip: str | None) -> None:
    """Count an OTP failure; revoke the transaction once the budget is spent."""
    sess.mfa_attempts += 1
    exhausted = sess.mfa_attempts >= settings.mfa_max_attempts
    if exhausted:
        sess.revoked_at = datetime.now(timezone.utc)
    await write_audit(
        db,
        tenant_id=sess.tenant_id,
        actor_type=sess.user_type,
        actor_id=sess.user_id,
        actor_email=None,
        action="auth.mfa_failed",
        resource_type="user_session",
        resource_id=str(sess.id),
        ip=ip,
        details={"attempt": sess.mfa_attempts, "exhausted": exhausted},
    )
    await db.commit()
    if exhausted:
        raise mfa_too_many_attempts() from None
    raise invalid_mfa_code() from None


async def complete_mfa(
    user_id: uuid.UUID, session_id: uuid.UUID, code: str, ip: str | None, user_agent: str | None
) -> TokenBundle:
    """Second step after login when MFA is on: verify TOTP or backup code."""
    async with platform_session() as db:
        sess = (
            await db.execute(select(UserSession).where(UserSession.id == session_id))
        ).scalar_one_or_none()
        if (
            sess is None
            or sess.revoked_at is not None
            or sess.user_id != user_id
            or sess.mfa_verified
        ):
            raise mfa_session_invalid() from None
        if sess.expires_at < datetime.now(timezone.utc):
            raise mfa_session_expired() from None
        if sess.mfa_attempts >= settings.mfa_max_attempts:
            raise mfa_too_many_attempts() from None

        user: TenantUser | PlatformAdmin | None = None
        if sess.user_type == ActorType.TENANT_USER:
            user = (await db.execute(select(TenantUser).where(TenantUser.id == user_id))).scalar_one_or_none()
        else:
            user = (
                await db.execute(select(PlatformAdmin).where(PlatformAdmin.id == user_id))
            ).scalar_one_or_none()
        if user is None or not user.mfa_secret:
            raise mfa_session_invalid() from None

        secret = decrypt_secret(user.mfa_secret)
        ok = verify_totp(secret, code)
        method = "totp"
        if not ok and user.mfa_backup_hashes:
            hashed = hash_backup_code(code.strip())
            if hashed in user.mfa_backup_hashes:
                user.mfa_backup_hashes = [h for h in user.mfa_backup_hashes if h != hashed]
                ok = True
                method = "recovery_code"
        if not ok:
            await _fail_mfa(db, sess, ip)

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
        await write_audit(
            db,
            tenant_id=sess.tenant_id,
            actor_type=sess.user_type,
            actor_id=user.id,
            actor_email=user.email,
            action="auth.mfa_success",
            resource_type="user_session",
            resource_id=str(sess.id),
            ip=ip,
            details={"method": method},
        )
        await db.flush()
        return _bundle(sess, user.id, sess.user_type, sess.tenant_id, user.role, True)


async def pending_mfa_status(user_id: uuid.UUID, session_id: uuid.UUID) -> list[str]:
    """Available MFA methods for a live pending transaction (mfa/resend, refresh resume)."""
    async with platform_session() as db:
        sess = (
            await db.execute(
                select(UserSession).where(
                    UserSession.id == session_id, UserSession.user_id == user_id
                )
            )
        ).scalar_one_or_none()
        if (
            sess is None
            or sess.revoked_at is not None
            or sess.mfa_verified
            or sess.expires_at < datetime.now(timezone.utc)
        ):
            raise mfa_session_invalid() from None
        if sess.mfa_attempts >= settings.mfa_max_attempts:
            raise mfa_too_many_attempts() from None
        model = TenantUser if sess.user_type == ActorType.TENANT_USER else PlatformAdmin
        user = (await db.execute(select(model).where(model.id == user_id))).scalar_one_or_none()
        if user is None or not user.mfa_enabled:
            raise mfa_session_invalid() from None
        return _mfa_methods(user)


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
                    update(UserSession).where(UserSession.family_id == sess.family_id).values(revoked_at=now)
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
                await db.execute(select(PlatformAdmin).where(PlatformAdmin.id == sess.user_id))
            ).scalar_one_or_none()
        if user is None or user.status != AccountStatus.ACTIVE:
            raise unauthorized("Account is not active")

        if presented_previous:
            # Retry within grace: return a fresh token without re-rotating so a
            # racing client cannot lock itself out.
            sess.last_seen_at = now
            sess.refresh_token_plain = raw_refresh_token
            await db.flush()
            return _bundle(sess, user.id, sess.user_type, sess.tenant_id, user.role, sess.mfa_verified)

        new_plain = new_refresh_token()
        sess.prev_refresh_token_hash = sess.refresh_token_hash
        sess.refresh_token_hash = hash_refresh_token(new_plain)
        sess.rotated_at = now
        sess.expires_at = _new_session_expiry()
        sess.last_seen_at = now
        sess.refresh_token_plain = new_plain
        await write_audit(
            db,
            tenant_id=sess.tenant_id,
            actor_type=sess.user_type,
            actor_id=user.id,
            actor_email=user.email,
            action="auth.token_refreshed",
            resource_type="user_session",
            resource_id=str(sess.id),
        )
        await db.flush()
        return _bundle(sess, user.id, sess.user_type, sess.tenant_id, user.role, sess.mfa_verified)


async def flag_family_compromised(session_id: uuid.UUID) -> None:
    async with platform_session() as db:
        await db.execute(
            update(UserSession)
            .where(
                UserSession.family_id
                == select(UserSession.family_id).where(UserSession.id == session_id).scalar_subquery()
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
                select(UserSession.revoked_at, UserSession.expires_at).where(UserSession.id == session_id)
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
            row = (await db.execute(select(TenantUser).where(TenantUser.id == user.id))).scalar_one()
        else:
            row = (await db.execute(select(PlatformAdmin).where(PlatformAdmin.id == user.id))).scalar_one()
        row.mfa_secret = encrypt_secret(secret)
    return secret, totp_uri(secret, user.email)


async def mfa_enable(user_id: uuid.UUID, user_type: str, code: str) -> list[str]:
    async with platform_session() as db:
        model = TenantUser if user_type == ActorType.TENANT_USER else PlatformAdmin
        row = (await db.execute(select(model).where(model.id == user_id))).scalar_one_or_none()
        if row is None or not row.mfa_secret:
            raise unauthorized("Run MFA setup first")
        if not verify_totp(decrypt_secret(row.mfa_secret), code):
            raise invalid_mfa_code() from None
        row.mfa_enabled = True
        codes = generate_backup_codes()
        row.mfa_backup_hashes = [hash_backup_code(c) for c in codes]
        await write_audit(
            db,
            tenant_id=row.tenant_id if isinstance(row, TenantUser) else None,
            actor_type=str(user_type),
            actor_id=row.id,
            actor_email=row.email,
            action="auth.mfa_enabled",
            resource_type="tenant_user" if isinstance(row, TenantUser) else "platform_admin",
            resource_id=str(row.id),
        )
        return codes


async def mfa_disable(user_id: uuid.UUID, user_type: str, password: str, code: str) -> None:
    """Disable MFA — requires password + a current MFA code (strong re-auth),
    then revokes all sessions so the change takes effect on next login."""
    async with platform_session() as db:
        model = TenantUser if user_type == ActorType.TENANT_USER else PlatformAdmin
        row = (await db.execute(select(model).where(model.id == user_id))).scalar_one_or_none()
        if row is None or not row.mfa_enabled or not row.mfa_secret:
            raise unauthorized("MFA is not enabled")
        if not verify_password(password, row.password_hash):
            raise unauthorized("Password is incorrect")
        secret = decrypt_secret(row.mfa_secret)
        ok = verify_totp(secret, code)
        if not ok and row.mfa_backup_hashes:
            ok = hash_backup_code(code.strip()) in row.mfa_backup_hashes
        if not ok:
            raise invalid_mfa_code() from None
        row.mfa_enabled = False
        row.mfa_secret = None
        row.mfa_backup_hashes = None
        await db.execute(
            update(UserSession)
            .where(UserSession.user_id == user_id, UserSession.user_type == str(user_type))
            .values(revoked_at=datetime.now(timezone.utc))
        )
        await write_audit(
            db,
            tenant_id=row.tenant_id if isinstance(row, TenantUser) else None,
            actor_type=str(user_type),
            actor_id=row.id,
            actor_email=row.email,
            action="auth.mfa_disabled",
            resource_type="tenant_user" if isinstance(row, TenantUser) else "platform_admin",
            resource_id=str(row.id),
        )


async def change_password(user_id: uuid.UUID, user_type: str, current: str, new: str) -> None:
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
        await write_audit(
            db,
            tenant_id=row.tenant_id if isinstance(row, TenantUser) else None,
            actor_type=str(user_type),
            actor_id=row.id,
            actor_email=row.email,
            action="auth.password_changed",
            resource_type="tenant_user" if isinstance(row, TenantUser) else "platform_admin",
            resource_id=str(row.id),
        )


# ---------- password reset (forgot/reset) ----------


def _new_reset_token() -> tuple[str, str]:
    plain = secrets.token_urlsafe(32)
    return plain, hashlib.sha256(plain.encode()).hexdigest()


async def request_password_reset(email: str, ip: str | None) -> str | None:
    """Stage a password-reset token and queue the email. Returns the plaintext
    token (for the mailer/tests) — the endpoint response never exposes it,
    and the caller MUST NOT reveal whether the account exists."""
    async with platform_session() as db:
        user: TenantUser | PlatformAdmin | None = (
            await db.execute(select(TenantUser).where(TenantUser.email == email.lower()))
        ).scalar_one_or_none()
        if user is None:
            user = (
                await db.execute(
                    select(PlatformAdmin).where(PlatformAdmin.email == email.lower())
                )
            ).scalar_one_or_none()
        if user is None or user.status != AccountStatus.ACTIVE:
            return None

        plain, token_hash = _new_reset_token()
        user.password_reset_token_hash = token_hash
        user.password_reset_expires_at = datetime.now(timezone.utc) + timedelta(
            seconds=settings.password_reset_ttl_seconds
        )
        await write_audit(
            db,
            tenant_id=user.tenant_id if isinstance(user, TenantUser) else None,
            actor_type=str(ActorType.TENANT_USER if isinstance(user, TenantUser) else ActorType.PLATFORM_ADMIN),
            actor_id=user.id,
            actor_email=user.email,
            action="auth.password_reset_requested",
            resource_type="tenant_user" if isinstance(user, TenantUser) else "platform_admin",
            resource_id=str(user.id),
            ip=ip,
        )
        return plain


async def reset_password(token: str, new_password: str, ip: str | None) -> None:
    async with platform_session() as db:
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        user: TenantUser | PlatformAdmin | None = (
            await db.execute(
                select(TenantUser).where(TenantUser.password_reset_token_hash == token_hash)
            )
        ).scalar_one_or_none()
        if user is None:
            user = (
                await db.execute(
                    select(PlatformAdmin).where(
                        PlatformAdmin.password_reset_token_hash == token_hash
                    )
                )
            ).scalar_one_or_none()
        if (
            user is None
            or user.password_reset_expires_at is None
            or user.password_reset_expires_at < datetime.now(timezone.utc)
        ):
            raise invalid_reset_token() from None

        user.password_hash = hash_password(new_password)
        user.password_reset_token_hash = None
        user.password_reset_expires_at = None
        user.failed_login_attempts = 0
        user.locked_until = None
        # Force re-auth everywhere — the old password may have been compromised.
        await db.execute(
            update(UserSession)
            .where(
                UserSession.user_id == user.id,
                UserSession.user_type
                == str(
                    ActorType.TENANT_USER if isinstance(user, TenantUser) else ActorType.PLATFORM_ADMIN
                ),
            )
            .values(revoked_at=datetime.now(timezone.utc))
        )
        await write_audit(
            db,
            tenant_id=user.tenant_id if isinstance(user, TenantUser) else None,
            actor_type=str(ActorType.TENANT_USER if isinstance(user, TenantUser) else ActorType.PLATFORM_ADMIN),
            actor_id=user.id,
            actor_email=user.email,
            action="auth.password_changed",
            resource_type="tenant_user" if isinstance(user, TenantUser) else "platform_admin",
            resource_id=str(user.id),
            ip=ip,
            details={"via": "reset_token"},
        )


async def resolve_tenant_for_user(tenant_id: uuid.UUID) -> Tenant | None:
    async with platform_session() as db:
        return (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
