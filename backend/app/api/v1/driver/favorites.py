"""Driver favorite sites (mobile app)."""

import uuid

from fastapi import APIRouter, Depends

from app.api.deps import AuthContext, require_driver
from app.database import platform_session
from app.schemas.common import MessageOut
from app.schemas.driver import PublicSiteOut
from app.services import driver_service, public_site_service

router = APIRouter(
    prefix="/driver/favorites", tags=["driver"], dependencies=[Depends(require_driver)]
)


@router.get("", response_model=list[PublicSiteOut])
async def list_favorites(auth: AuthContext = Depends(require_driver)) -> list[PublicSiteOut]:
    async with platform_session() as db:
        ids = await driver_service.list_favorite_site_ids(db, auth.user_id)
        return await public_site_service.sites_by_ids(db, list(ids), ids)


@router.put("/{site_id}", response_model=MessageOut)
async def add_favorite(
    site_id: uuid.UUID, auth: AuthContext = Depends(require_driver)
) -> MessageOut:
    await driver_service.add_favorite(auth.user_id, site_id)
    return MessageOut(message="Favorite added")


@router.delete("/{site_id}", response_model=MessageOut)
async def remove_favorite(
    site_id: uuid.UUID, auth: AuthContext = Depends(require_driver)
) -> MessageOut:
    await driver_service.remove_favorite(auth.user_id, site_id)
    return MessageOut(message="Favorite removed")
