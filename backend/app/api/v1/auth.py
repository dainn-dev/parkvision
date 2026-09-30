"""Auth endpoints: login, MFA, refresh, logout, me, password change.

Tokens travel in Secure HttpOnly cookies; a separate non-HttpOnly CSRF cookie
carries the double-submit token the SPA echoes in `X-CSRF-Token`.
"""

import uuid
from datetime import datetime, timezone

import jwt as pyjwt
from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select

from app.api.deps import AuthContext, get_auth_context
from app.config import settings
from app.core.enums import ActorType
from app.core.errors import mfa_session_expired, mfa_session_invalid, unauthorized
from app.core.rate_limit import rate_limited
from app.database import platform_session
from app.models import PlatformAdmin, Tenant, TenantUser, UserSession
from app.schemas.auth import (
    ActivateIn,
    ChangePasswordIn,
    LoginIn,
    MeOut,
    MfaDisableIn,
    MfaEnableIn,
    MfaEnableOut,
    MfaSetupOut,
    MfaVerifyIn,
    PasswordForgotIn,
    PasswordResetIn,
    RefreshIn,
    SessionOut,
    UserOut,
)
from app.schemas.common import MessageOut
from app.security import decode_access_token, new_csrf_token
from app.services import auth_service
from app.services.audit_service import write_audit

router = APIRouter(prefix="/auth", tags=["auth"])


def _cookie_kwargs() -> dict:
    return {
        "httponly": True,
        "secure": settings.cookie_secure,
        "samesite": settings.cookie_samesite,
        "domain": settings.cookie_domain,
        "path": "/",
    }


def set_auth_cookies(response: Response, bundle: auth_service.TokenBundle) -> str:
    csrf = new_csrf_token()
    response.set_cookie(
        settings.access_cookie_name,
        bundle.access_token,
        max_age=settings.access_token_ttl_seconds,
        **_cookie_kwargs(),
    )
    response.set_cookie(
        settings.refresh_cookie_name,
        bundle.refresh_token,
        max_age=settings.refresh_token_ttl_seconds,
        **_cookie_kwargs(),
    )
    response.set_cookie(
        settings.csrf_cookie_name,
        csrf,
        httponly=False,  # the SPA must read it to echo X-CSRF-Token
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        domain=settings.cookie_domain,
        path="/",
    )
    return csrf


def clear_auth_cookies(response: Response) -> None:
    for name in (
        settings.access_cookie_name,
        settings.refresh_cookie_name,
        settings.csrf_cookie_name,
    ):
        response.delete_cookie(name, domain=settings.cookie_domain, path="/")


def _user_out(user: TenantUser | PlatformAdmin, tenant_id=None) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=str(user.role),
        status=str(user.status),
        mfa_enabled=user.mfa_enabled,
        tenant_id=tenant_id,
        last_login_at=user.last_login_at,
    )


def _pending_claims(request: Request) -> dict:
    """Decode the mfa_pending token staged in the access cookie at login."""
    token = request.cookies.get(settings.access_cookie_name)
    if not token:
        raise mfa_session_invalid() from None
    try:
        claims = decode_access_token(token)
    except pyjwt.ExpiredSignatureError:
        raise mfa_session_expired() from None
    except pyjwt.PyJWTError:
        raise mfa_session_invalid() from None
    if not claims.get("mfa_pending"):
        # A real access token (or any non-pending JWT) must not be usable here.
        raise mfa_session_invalid() from None
    return claims


@router.post("/login", dependencies=[Depends(rate_limited("login", 5, 60))])
async def login(body: LoginIn, request: Request, response: Response) -> dict:
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    result = await auth_service.login(body.email.lower(), body.password, ip, ua)

    if result.mfa_required:
        # Pending token goes in the access cookie so MFA verify can read it.
        # It is single-purpose (mfa_pending claim) and short-lived — never a
        # usable access token for resource APIs.
        response.set_cookie(
            settings.access_cookie_name,
            result.pending_token,
            max_age=settings.mfa_pending_ttl_seconds,
            **_cookie_kwargs(),
        )
        return {
            "data": {
                "mfaRequired": True,
                "methods": result.mfa_methods,
                "expiresIn": result.mfa_expires_in,
            }
        }

    assert result.bundle and result.user is not None
    csrf = set_auth_cookies(response, result.bundle)
    return {"data": {"mfaRequired": False, "csrfToken": csrf, "expiresIn": result.bundle.expires_in}}


@router.post("/mfa/verify", dependencies=[Depends(rate_limited("mfa_verify", 10, 60))])
async def mfa_verify(body: MfaVerifyIn, request: Request, response: Response) -> dict:
    claims = _pending_claims(request)
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    bundle = await auth_service.complete_mfa(
        uuid.UUID(claims["sub"]), uuid.UUID(claims["sid"]), body.code, ip, ua
    )
    csrf = set_auth_cookies(response, bundle)
    return {"data": {"mfaRequired": False, "csrfToken": csrf, "expiresIn": bundle.expires_in}}


@router.get("/mfa/session")
async def mfa_session_status(request: Request) -> dict:
    """Pending-transaction status — lets the SPA resume MFA after a refresh."""
    claims = _pending_claims(request)
    methods = await auth_service.pending_mfa_status(uuid.UUID(claims["sub"]), uuid.UUID(claims["sid"]))
    expires_in = max(0, int(claims["exp"] - datetime.now(timezone.utc).timestamp()))
    return {"data": {"status": "mfa_required", "methods": methods, "expiresIn": expires_in}}


@router.post("/mfa/resend", dependencies=[Depends(rate_limited("mfa_resend", 1, 30))])
async def mfa_resend(request: Request) -> dict:
    """Re-present the pending MFA challenge. TOTP needs nothing sent — this
    validates the transaction and echoes methods + remaining lifetime."""
    claims = _pending_claims(request)
    methods = await auth_service.pending_mfa_status(uuid.UUID(claims["sub"]), uuid.UUID(claims["sid"]))
    expires_in = max(0, int(claims["exp"] - datetime.now(timezone.utc).timestamp()))
    return {"data": {"status": "mfa_required", "methods": methods, "expiresIn": expires_in}}


@router.post("/password/forgot", dependencies=[Depends(rate_limited("password_forgot", 5, 60))])
async def password_forgot(body: PasswordForgotIn, request: Request) -> MessageOut:
    """Queue a reset email if the account exists. Always 200 — never reveal
    whether the address is registered."""
    ip = request.client.host if request.client else None
    token = await auth_service.request_password_reset(body.email.lower(), ip)
    if token:
        try:
            from app.workers.jobs import enqueue_password_reset_email

            await enqueue_password_reset_email(body.email.lower(), token)
        except Exception:
            # Email queue down must not leak account existence or break the API.
            pass
    return MessageOut(message="If an account exists for this email, a reset link was sent")


@router.post("/password/reset", dependencies=[Depends(rate_limited("password_reset", 5, 60))])
async def password_reset(body: PasswordResetIn, request: Request) -> MessageOut:
    ip = request.client.host if request.client else None
    await auth_service.reset_password(body.token, body.password, ip)
    return MessageOut(message="Password updated; please log in")


@router.post("/activate", response_model=MessageOut, dependencies=[Depends(rate_limited("activate", 10, 60))])
async def activate_account(body: ActivateIn, request: Request) -> MessageOut:
    """Set a password from an invite token emailed by a tenant admin."""
    import hashlib
    from datetime import datetime, timezone

    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    async with platform_session() as db:
        user = (
            await db.execute(select(TenantUser).where(TenantUser.invite_token_hash == token_hash))
        ).scalar_one_or_none()
        if user is None or user.invite_expires_at is None:
            raise unauthorized("Invalid invite token") from None
        if user.invite_expires_at < datetime.now(timezone.utc):
            raise unauthorized("Invite token expired") from None
        from app.security import hash_password

        user.password_hash = hash_password(body.password)
        user.status = "active"
        user.invite_token_hash = None
        user.invite_expires_at = None
        await write_audit(
            db,
            tenant_id=user.tenant_id,
            actor_type=ActorType.TENANT_USER,
            actor_id=user.id,
            actor_email=user.email,
            action="user.activated",
            resource_type="tenant_user",
            resource_id=str(user.id),
            ip=request.client.host if request.client else None,
        )
    return MessageOut(message="Account activated; you can log in now")


@router.post("/refresh")
async def refresh(request: Request, response: Response, body: RefreshIn | None = None) -> dict:
    raw = request.cookies.get(settings.refresh_cookie_name)
    if raw is None and body is not None:
        raw = body.refresh_token
    if not raw:
        raise unauthorized("Missing refresh token") from None
    bundle = await auth_service.refresh_session(raw)
    csrf = set_auth_cookies(response, bundle)
    return {"data": {"csrfToken": csrf, "expiresIn": bundle.expires_in}}


@router.post("/logout", response_model=MessageOut)
async def logout(request: Request, response: Response) -> MessageOut:
    token = request.cookies.get(settings.access_cookie_name)
    if token:
        try:
            claims = decode_access_token(token)
            await auth_service.logout(uuid.UUID(claims["sid"]))
            async with platform_session() as db:
                await write_audit(
                    db,
                    tenant_id=uuid.UUID(claims["tid"]) if claims.get("tid") else None,
                    actor_type=claims.get("typ", "unknown"),
                    actor_id=uuid.UUID(claims["sub"]),
                    actor_email=None,
                    action="auth.logout",
                    resource_type="user_session",
                    resource_id=str(claims["sid"]),
                    ip=request.client.host if request.client else None,
                )
        except pyjwt.PyJWTError:
            pass
    clear_auth_cookies(response)
    return MessageOut(message="Logged out")


@router.get("/me", response_model=MeOut)
async def me(request: Request, auth: AuthContext = Depends(get_auth_context)) -> MeOut:
    async with platform_session() as db:
        if auth.user_type == ActorType.TENANT_USER:
            user = (await db.execute(select(TenantUser).where(TenantUser.id == auth.user_id))).scalar_one()
            tenant = (
                await db.execute(select(Tenant).where(Tenant.id == auth.tenant_id))
            ).scalar_one_or_none()
            slug = tenant.slug if tenant else None
        else:
            user = (
                await db.execute(select(PlatformAdmin).where(PlatformAdmin.id == auth.user_id))
            ).scalar_one()
            slug = None
    csrf = request.cookies.get(settings.csrf_cookie_name) or new_csrf_token()
    return MeOut(
        user=_user_out(user, auth.tenant_id),
        user_type=str(auth.user_type),
        tenant_id=auth.tenant_id,
        tenant_slug=slug,
        mfa_verified=auth.mfa_verified,
        session_id=auth.session_id,
        csrf_token=csrf,
    )


@router.post("/password", response_model=MessageOut)
async def change_password(
    body: ChangePasswordIn, response: Response, auth: AuthContext = Depends(get_auth_context)
) -> MessageOut:
    await auth_service.change_password(auth.user_id, auth.user_type, body.current_password, body.new_password)
    clear_auth_cookies(response)
    return MessageOut(message="Password changed; please log in again")


@router.post("/mfa/setup", response_model=MfaSetupOut)
async def mfa_setup(auth: AuthContext = Depends(get_auth_context)) -> MfaSetupOut:
    async with platform_session() as db:
        model = TenantUser if auth.user_type == ActorType.TENANT_USER else PlatformAdmin
        user = (await db.execute(select(model).where(model.id == auth.user_id))).scalar_one()
        secret, uri = await auth_service.mfa_setup(user)
    return MfaSetupOut(secret=secret, provisioning_uri=uri)


@router.post("/mfa/enable", response_model=MfaEnableOut)
async def mfa_enable(body: MfaEnableIn, auth: AuthContext = Depends(get_auth_context)) -> MfaEnableOut:
    codes = await auth_service.mfa_enable(auth.user_id, auth.user_type, body.code)
    return MfaEnableOut(backup_codes=codes)


@router.post("/mfa/disable", response_model=MessageOut)
async def mfa_disable(
    body: MfaDisableIn, response: Response, auth: AuthContext = Depends(get_auth_context)
) -> MessageOut:
    await auth_service.mfa_disable(auth.user_id, auth.user_type, body.password, body.code)
    # The service revoked every session including this one — drop the cookies.
    clear_auth_cookies(response)
    return MessageOut(message="MFA disabled; please log in again")


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(auth: AuthContext = Depends(get_auth_context)) -> list[SessionOut]:
    async with platform_session() as db:
        rows = (
            (
                await db.execute(
                    select(UserSession)
                    .where(
                        UserSession.user_id == auth.user_id,
                        UserSession.user_type == str(auth.user_type),
                        UserSession.revoked_at.is_(None),
                    )
                    .order_by(UserSession.created_at.desc())
                )
            )
            .scalars()
            .all()
        )
    return [
        SessionOut(
            id=r.id,
            user_id=r.user_id,
            user_type=r.user_type,
            tenant_id=r.tenant_id,
            ip=r.ip,
            user_agent=r.user_agent,
            mfa_verified=r.mfa_verified,
            created_at=r.created_at,
            last_seen_at=r.last_seen_at,
            expires_at=r.expires_at,
            revoked_at=r.revoked_at,
            current=r.id == auth.session_id,
        )
        for r in rows
    ]


@router.delete("/sessions/{session_id}", response_model=MessageOut)
async def revoke_session(session_id: uuid.UUID, auth: AuthContext = Depends(get_auth_context)) -> MessageOut:
    async with platform_session() as db:
        row = (await db.execute(select(UserSession).where(UserSession.id == session_id))).scalar_one_or_none()
        if row is None or row.user_id != auth.user_id:
            raise unauthorized("Session not found") from None
        await auth_service.logout(session_id)
        await write_audit(
            db,
            tenant_id=auth.tenant_id,
            actor_type=str(auth.user_type),
            actor_id=auth.user_id,
            actor_email=None,
            action="session.revoked",
            resource_type="user_session",
            resource_id=str(session_id),
        )
    return MessageOut(message="Session revoked")
