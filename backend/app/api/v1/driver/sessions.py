"""Driver parking sessions (mobile app) — derived from access events."""

from fastapi import APIRouter, Depends, Query

from app.api.deps import AuthContext, require_driver
from app.database import platform_session
from app.schemas.common import Page, paginate
from app.schemas.driver import DriverSessionOut
from app.services import driver_service
from app.services import driver_session_service

router = APIRouter(
    prefix="/driver/sessions", tags=["driver"], dependencies=[Depends(require_driver)]
)


async def _plates(driver_id) -> set[str]:
    return {v.plate_normalized for v in await driver_service.list_vehicles(driver_id)}


@router.get("/active", response_model=list[DriverSessionOut])
async def list_active(auth: AuthContext = Depends(require_driver)) -> list[DriverSessionOut]:
    async with platform_session() as db:
        return await driver_session_service.active_sessions(db, await _plates(auth.user_id))


@router.get("/history", response_model=Page[DriverSessionOut])
async def list_history(
    auth: AuthContext = Depends(require_driver),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
) -> Page[DriverSessionOut]:
    async with platform_session() as db:
        items, total = await driver_session_service.history(
            db, await _plates(auth.user_id), page, limit
        )
    return paginate(items, total, page, limit)
