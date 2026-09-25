"""Auth endpoints: login, MFA completion, refresh, logout, profile, sessions."""

import uuid

from fastapi import APIRouter, Request, Response
from sqlalchemy import select, text

from app.api.deps import clear_auth_cookies, set_auth_cookies
from app.core.config import get_settings
from app.core.deps import PrincipalDep, client_ip
from app.core.errors import ApiError, unauthorized
from app.core.security import (
    decode_token,
    hash_password,
    token_digest,
    verify_password,
)
from app.db.session import db_session
from app.models import PlatformAdmin, TenantUser, UserSession
from app.schemas.auth import (
    AcceptInviteIn,
    AuthTokensOut,
    LoginIn,
    MfaConfirmedOut,
    MfaEnrollConfirmIn,
    MfaEnrollOut,
    MfaRequiredOut,
    MfaVerifyIn,
    PasswordChangeIn,
    PrincipalOut,
    SessionOut,
)
from app.services import auth_service
from app.services.audit import write_audit

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=None)
async def login(body: LoginIn, request: Request, response: Response):
    """Password login as platform admin or tenant user.

    Auth lookups run under the platform-bypass RLS flag because no tenant
    context exists yet; queries are strictly keyed by email (+ optional slug).
    """
    async with db_session() as session:
        await session.execute(
            text("SELECT set_config('app.platform_admin','on',true)")
        )
        result = await auth_service.login(
            session,
            email=body.email,
            password=body.password,
            kind=body.kind,
            tenant_slug=body.tenant_slug,
            ip=client_ip(request),
            user_agent=request.headers.get("user-agent", ""),
        )
        if result[0] == "mfa":
            return MfaRequiredOut(pending_token=result[1])
        _, (session_row, refresh), access, user = result
        set_auth_cookies(response, access, refresh)
        await write_audit(
            session, principal=None, action="auth.login",
            tenant_id=session_row.tenant_id, target_type="user",
            target_id=str(user.id), ip=client_ip(request),
            actor_label=body.email,
        )
        return AuthTokensOut(
            access_token=access,
            expires_in=get_settings().access_token_ttl_seconds,
        )


@router.post("/mfa/verify", response_model=AuthTokensOut)
async def mfa_verify(body: MfaVerifyIn, request: Request, response: Response):
    payload = decode_token(body.pending_token, "mfa_pending")
    async with db_session() as session:
        await session.execute(
            text("SELECT set_config('app.platform_admin','on',true)")
        )
        (session_row, refresh), access, _user = await auth_service.complete_mfa_login(
            session,
            user_id=uuid.UUID(payload["sub"]),
            kind=payload["kind"],
            tenant_id=uuid.UUID(payload["tid"]) if payload.get("tid") else None,
            code=body.code,
            ip=client_ip(request),
            user_agent=request.headers.get("user-agent", ""),
        )
        set_auth_cookies(response, access, refresh)
        return AuthTokensOut(
            access_token=access, expires_in=get_settings().access_token_ttl_seconds
        )


@router.post("/refresh", response_model=AuthTokensOut)
async def refresh(request: Request, response: Response):
    settings = get_settings()
    token = request.cookies.get(settings.refresh_cookie)
    auth = request.headers.get("authorization", "")
    if not token and auth.lower().startswith("bearer "):
        token = auth[7:].strip()
    if not token:
        raise unauthorized("Missing refresh token")
    async with db_session() as session:
        await session.execute(
            text("SELECT set_config('app.platform_admin','on',true)")
        )
        (_row, new_refresh), access, _user = await auth_service.refresh_session(
            session,
            refresh_token=token,
            ip=client_ip(request),
            user_agent=request.headers.get("user-agent", ""),
        )
        set_auth_cookies(response, access, new_refresh)
        return AuthTokensOut(
            access_token=access, expires_in=settings.access_token_ttl_seconds
        )


@router.post("/logout", status_code=204)
async def logout(request: Request, response: Response, principal: PrincipalDep):
    async with db_session() as session:
        await session.execute(
            text("SELECT set_config('app.platform_admin','on',true)")
        )
        await auth_service.logout(session, session_id=principal.session_id)
    clear_auth_cookies(response)
    return Response(status_code=204)


@router.get("/me", response_model=PrincipalOut)
async def me(principal: PrincipalDep):
    async with db_session() as session:
        await session.execute(
            text("SELECT set_config('app.platform_admin','on',true)")
        )
        if principal.kind == "platform":
            user = await session.get(PlatformAdmin, principal.user_id)
        else:
            user = await session.get(TenantUser, principal.user_id)
        if user is None:
            raise unauthorized("Account unavailable")
        return PrincipalOut(
            user_id=principal.user_id,
            kind=principal.kind,
            tenant_id=principal.tenant_id,
            role=principal.role,
            email=user.email,
            display_name=getattr(user, "display_name", "") or getattr(user, "full_name", ""),
            mfa_enabled=user.mfa_enabled,
        )


@router.get("/sessions", response_model=list[SessionOut])
async def my_sessions(principal: PrincipalDep):
    async with db_session() as session:
        await session.execute(
            text("SELECT set_config('app.platform_admin','on',true)")
        )
        rows = (
            await session.execute(
                select(UserSession)
                .where(
                    UserSession.user_id == principal.user_id,
                    UserSession.revoked_at.is_(None),
                )
                .order_by(UserSession.created_at.desc())
            )
        ).scalars().all()
        return [
            SessionOut(
                session_id=r.id, ip=r.ip, user_agent=r.user_agent,
                created_at=r.created_at, expires_at=r.expires_at,
                current=r.id == principal.session_id,
            )
            for r in rows
        ]


@router.delete("/sessions/{session_id}", status_code=204)
async def revoke_session(session_id: uuid.UUID, principal: PrincipalDep):
    async with db_session() as session:
        await session.execute(
            text("SELECT set_config('app.platform_admin','on',true)")
        )
        target = await session.get(UserSession, session_id)
        if target is None or target.user_id != principal.user_id:
            raise ApiError("not_found", "Session not found", 404)
        await auth_service.logout(session, session_id=session_id)
    return Response(status_code=204)


@router.post("/password", status_code=204)
async def change_password(body: PasswordChangeIn, principal: PrincipalDep):
    async with db_session() as session:
        await session.execute(
            text("SELECT set_config('app.platform_admin','on',true)")
        )
        model = PlatformAdmin if principal.kind == "platform" else TenantUser
        user = await session.get(model, principal.user_id)
        if user is None or not verify_password(body.current_password, user.password_hash):
            raise unauthorized("Current password incorrect")
        user.password_hash = hash_password(body.new_password)
        await auth_service.revoke_user_sessions(session, user_id=principal.user_id)
    return Response(status_code=204)


# ---------- MFA enrollment (authenticated) ----------

@router.post("/mfa/enroll", response_model=MfaEnrollOut)
async def mfa_enroll(principal: PrincipalDep):
    async with db_session() as session:
        await session.execute(
            text("SELECT set_config('app.platform_admin','on',true)")
        )
        secret, uri = await auth_service.mfa_enroll_start(
            session, user_id=principal.user_id, kind=principal.kind
        )
        return MfaEnrollOut(secret=secret, otpauth_uri=uri)


@router.post("/mfa/confirm", response_model=MfaConfirmedOut)
async def mfa_confirm(body: MfaEnrollConfirmIn, principal: PrincipalDep):
    async with db_session() as session:
        await session.execute(
            text("SELECT set_config('app.platform_admin','on',true)")
        )
        codes = await auth_service.mfa_enroll_confirm(
            session, user_id=principal.user_id, kind=principal.kind, code=body.code
        )
        return MfaConfirmedOut(backup_codes=codes)


@router.post("/mfa/disable", status_code=204)
async def mfa_disable(body: MfaEnrollConfirmIn, principal: PrincipalDep):
    async with db_session() as session:
        await session.execute(
            text("SELECT set_config('app.platform_admin','on',true)")
        )
        await auth_service.mfa_disable(
            session, user_id=principal.user_id, kind=principal.kind, code=body.code
        )
    return Response(status_code=204)


@router.post("/accept-invite", response_model=AuthTokensOut)
async def accept_invite(body: AcceptInviteIn, request: Request, response: Response):
    """Invite tokens are stored hashed on the user row (detail JSONB)."""
    digest = token_digest(body.invite_token)
    async with db_session() as session:
        await session.execute(
            text("SELECT set_config('app.platform_admin','on',true)")
        )
        user = (
            await session.execute(
                select(TenantUser).where(
                    TenantUser.status == "invited",
                    TenantUser.invite_token_hash == digest,  # type: ignore[attr-defined]
                )
            )
        ).scalar_one_or_none()
        if user is None:
            raise unauthorized("Invalid invite token")
        user.password_hash = hash_password(body.password)
        user.full_name = body.full_name or user.full_name
        user.status = "active"
        user.invite_token_hash = None  # type: ignore[attr-defined]
        result = await auth_service._create_session(
            session,
            user=user,
            kind="tenant",
            tenant_id=user.tenant_id,
            role=user.role,
            mfa_verified=False,
            ip=client_ip(request),
            user_agent=request.headers.get("user-agent", ""),
        )
        (session_row, refresh), access = result
        set_auth_cookies(response, access, refresh)
        return AuthTokensOut(
            access_token=access, expires_in=get_settings().access_token_ttl_seconds
        )
