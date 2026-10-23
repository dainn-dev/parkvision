"""Vehicle sharing endpoints — owner grants date-scoped access (GAP-BE-002)."""

import uuid

from fastapi import APIRouter, Depends

from app.api.deps import AuthContext, require_driver
from app.schemas.common import MessageOut
from app.schemas.driver import SharedVehicleOut, VehicleShareIn, VehicleShareOut
from app.services import driver_service

router = APIRouter(tags=["driver"], dependencies=[Depends(require_driver)])


@router.post(
    "/driver/vehicles/{vehicle_id}/shares",
    response_model=VehicleShareOut,
    status_code=201,
)
async def create_share(
    vehicle_id: uuid.UUID,
    body: VehicleShareIn,
    auth: AuthContext = Depends(require_driver),
) -> VehicleShareOut:
    share = await driver_service.create_share(
        auth.user_id,
        vehicle_id,
        shared_with_email=body.shared_with_email,
        share_date=body.share_date,
    )
    # Re-fetch with joined name for response
    shares = await driver_service.list_shares(auth.user_id, vehicle_id)
    match = next(s for s in shares if s["share"].id == share.id)
    return VehicleShareOut(
        id=share.id,
        vehicle_id=share.vehicle_id,
        plate_number=match["plate_number"],
        shared_with_id=share.shared_with_id,
        shared_with_name=match["shared_with_name"],
        share_date=share.share_date,
        created_at=share.created_at,
    )


@router.get(
    "/driver/vehicles/{vehicle_id}/shares",
    response_model=list[VehicleShareOut],
)
async def list_shares(
    vehicle_id: uuid.UUID,
    auth: AuthContext = Depends(require_driver),
) -> list[VehicleShareOut]:
    rows = await driver_service.list_shares(auth.user_id, vehicle_id)
    return [
        VehicleShareOut(
            id=r["share"].id,
            vehicle_id=r["share"].vehicle_id,
            plate_number=r["plate_number"],
            shared_with_id=r["share"].shared_with_id,
            shared_with_name=r["shared_with_name"],
            share_date=r["share"].share_date,
            created_at=r["share"].created_at,
        )
        for r in rows
    ]


@router.delete(
    "/driver/vehicles/{vehicle_id}/shares/{share_id}",
    response_model=MessageOut,
)
async def delete_share(
    vehicle_id: uuid.UUID,
    share_id: uuid.UUID,
    auth: AuthContext = Depends(require_driver),
) -> MessageOut:
    await driver_service.delete_share(auth.user_id, vehicle_id, share_id)
    return MessageOut(message="Share revoked")


@router.get(
    "/driver/shared-vehicles",
    response_model=list[SharedVehicleOut],
)
async def list_shared_with_me(
    auth: AuthContext = Depends(require_driver),
) -> list[SharedVehicleOut]:
    rows = await driver_service.list_shared_with_me(auth.user_id)
    return [
        SharedVehicleOut(
            vehicle_id=r["vehicle_id"],
            plate_number=r["plate_number"],
            owner_name=r["owner_name"],
            share_date=r["share_date"],
        )
        for r in rows
    ]
