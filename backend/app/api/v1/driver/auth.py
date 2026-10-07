"""Driver auth: register/login/refresh/logout/me/password/sessions.

Bearer-token only (mobile client); no cookies, no CSRF, no MFA. Sessions
reuse auth_service's UserSession machinery with user_type='driver'.
"""

import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select

from app.api.deps import AuthContext, require_driver
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
)
from app.services import auth_service, driver_service
from app.services.audit_service import write_audit

router = APIRouter(prefix="/driver/auth", tags=["driver"])


def _token_response(bundle) -> DriverTokenOut:
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
async def register(body: DriverRegisterIn, request: Request) -> DriverTokenOut:
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    user = await driver_service.register(body.email, body.password, body.full_name, body.phone)
    bundle = await driver_service.login(user.email, body.password, ip, ua)
    return _token_response(bundle)


@router.post(
    "/login",
    response_model=DriverTokenOut,
    dependencies=[Depends(rate_limited("driver_login", 5, 60))],
)
async def login(body: DriverLoginIn, request: Request) -> DriverTokenOut:
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    bundle = await driver_service.login(body.email, body.password, ip, ua)
    return _token_response(bundle)


@router.post("/refresh", response_model=DriverTokenOut)
async def refresh(body: DriverRefreshIn) -> DriverTokenOut:
    bundle = await auth_service.refresh_session(body.refresh_token)
    return _token_response(bundle)


@router.post("/logout", response_model=MessageOut)
async def logout(auth: AuthContext = Depends(require_driver)) -> MessageOut:
    await auth_service.logout(auth.session_id)
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
