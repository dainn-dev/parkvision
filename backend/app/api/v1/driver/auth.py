"""Driver auth: register/login/refresh/logout/me/password/sessions.

Two client modes, chosen per request by the `X-Auth-Mode` header:
- `cookie` (the web app): tokens are set as HttpOnly `pv_driver_*` cookies with a
  double-submit CSRF cookie and are *not* returned in the body, so page scripts
  (XSS) can never read them.
- default (bearer; legacy / non-browser clients): tokens are returned in the body.
No MFA. Sessions reuse auth_service's UserSession machinery with user_type='driver'.
"""

import secrets
import uuid

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select

from app.api.deps import AuthContext, optional_driver, require_driver
from app.api.v1.auth import clear_cookie_triplet, set_cookie_triplet
from app.config import settings
from app.core.errors import unauthorized
from app.core.rate_limit import rate_limited
from app.database import platform_session
from app.models import UserSession
from app.schemas.auth import SessionOut
from app.schemas.common import MessageOut
from app.schemas.driver import (
    DriverLoginIn,
    DriverOut,
    DriverPasswordIn,
    DriverRefreshIn,
    DriverRegisterIn,
    DriverTokenOut,
    DriverUpdateIn,
    WsTicketOut,
)
from app.services import auth_service, driver_service
from app.services.audit_service import write_audit

router = APIRouter(prefix="/driver/auth", tags=["driver"])

AUTH_MODE_HEADER = "x-auth-mode"


def _cookie_mode(request: Request) -> bool:
    return request.headers.get(AUTH_MODE_HEADER, "").lower() == "cookie"


def _token_response(request: Request, response: Response, bundle) -> DriverTokenOut:
    """Cookie mode: set HttpOnly cookies, return no tokens. Bearer mode: return tokens."""
    if _cookie_mode(request):
        set_cookie_triplet(
            response,
            bundle,
            access_name=settings.driver_access_cookie_name,
            refresh_name=settings.driver_refresh_cookie_name,
            csrf_name=settings.driver_csrf_cookie_name,
        )
        return DriverTokenOut(expires_in=bundle.expires_in)
    return DriverTokenOut(
        access_token=bundle.access_token,
        refresh_token=bundle.refresh_token,
        expires_in=bundle.expires_in,
    )


@router.post(
    "/register",
    response_model=DriverTokenOut,
    status_code=201,
    dependencies=[Depends(rate_limited("driver_register", 5, 60))],
)
async def register(body: DriverRegisterIn, request: Request, response: Response) -> DriverTokenOut:
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    user = await driver_service.register(body.email, body.password, body.full_name, body.phone)
    bundle = await driver_service.login(user.email, body.password, ip, ua)
    return _token_response(request, response, bundle)


@router.post(
    "/login",
    response_model=DriverTokenOut,
    dependencies=[Depends(rate_limited("driver_login", 5, 60))],
)
async def login(body: DriverLoginIn, request: Request, response: Response) -> DriverTokenOut:
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    bundle = await driver_service.login(body.email, body.password, ip, ua)
    return _token_response(request, response, bundle)


@router.post("/refresh", response_model=DriverTokenOut)
async def refresh(body: DriverRefreshIn, request: Request, response: Response) -> DriverTokenOut:
    # A body token lets a legacy client migrate its stored refresh token into
    # cookies; otherwise the HttpOnly cookie is the credential.
    token = body.refresh_token or request.cookies.get(settings.driver_refresh_cookie_name)
    if not token:
        raise unauthorized("Refresh token required") from None
    bundle = await auth_service.refresh_session(token)
    return _token_response(request, response, bundle)


@router.post("/logout", response_model=MessageOut)
async def logout(
    request: Request,
    response: Response,
    auth: AuthContext | None = Depends(optional_driver),
) -> MessageOut:
    if auth is not None:
        await auth_service.logout(auth.session_id)
    else:
        refresh_token = request.cookies.get(settings.driver_refresh_cookie_name)
        if refresh_token:
            await auth_service.logout_by_refresh_token(refresh_token, user_type="driver")
    clear_cookie_triplet(
        response,
        settings.driver_access_cookie_name,
        settings.driver_refresh_cookie_name,
        settings.driver_csrf_cookie_name,
    )
    return MessageOut(message="Logged out")


@router.get("/me", response_model=DriverOut)
async def me(auth: AuthContext = Depends(require_driver)) -> DriverOut:
    user = await driver_service.get_me(auth.user_id)
    return DriverOut.model_validate(user)


@router.patch("/me", response_model=DriverOut)
async def update_me(body: DriverUpdateIn, auth: AuthContext = Depends(require_driver)) -> DriverOut:
    user = await driver_service.update_me(
        auth.user_id,
        full_name=body.full_name,
        phone=body.phone,
        avatar_url=body.avatar_url,
    )
    return DriverOut.model_validate(user)


@router.post("/password", response_model=MessageOut)
async def change_password(body: DriverPasswordIn, auth: AuthContext = Depends(require_driver)) -> MessageOut:
    await auth_service.change_password(auth.user_id, "driver", body.current_password, body.new_password)
    return MessageOut(message="Password changed")


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(auth: AuthContext = Depends(require_driver)) -> list[SessionOut]:
    async with platform_session() as db:
        rows = (
            (
                await db.execute(
                    select(UserSession)
                    .where(
                        UserSession.user_id == auth.user_id,
                        UserSession.user_type == "driver",
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
async def revoke_session(session_id: uuid.UUID, auth: AuthContext = Depends(require_driver)) -> MessageOut:
    async with platform_session() as db:
        row = (await db.execute(select(UserSession).where(UserSession.id == session_id))).scalar_one_or_none()
        if row is None or row.user_id != auth.user_id:
            raise unauthorized("Session not found") from None
        await auth_service.logout(session_id)
        await write_audit(
            db,
            tenant_id=None,
            actor_type="driver",
            actor_id=auth.user_id,
            actor_email=None,
            action="session.revoked",
            resource_type="user_session",
            resource_id=str(session_id),
        )
    return MessageOut(message="Session revoked")


@router.post("/ws-ticket", response_model=WsTicketOut, dependencies=[Depends(rate_limited("ws_ticket", 10, 60))])
async def ws_ticket(auth: AuthContext = Depends(require_driver)) -> WsTicketOut:
    """Issue a short-lived, single-use ticket for WebSocket auth.

    The mobile client exchanges its bearer token for a ticket, then opens
    the socket with ``?ticket=<ticket>`` instead of leaking the long-lived
    JWT in the query string (visible in server/proxy access logs).
    """
    from app.redis_client import get_redis

    ticket = secrets.token_urlsafe(32)
    redis = get_redis()
    key = f"ws:ticket:{ticket}"
    # Bind driver_id so the WS handler knows who connected.
    await redis.set(key, str(auth.user_id), ex=30)  # 30 s TTL
    return WsTicketOut(ticket=ticket, expires_in=30)
