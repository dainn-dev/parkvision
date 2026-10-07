"""Driver vehicle management (mobile app)."""

import uuid

from fastapi import APIRouter, Depends

from app.api.deps import AuthContext, require_driver
from app.schemas.common import MessageOut
from app.schemas.driver import DriverVehicleIn, DriverVehicleOut
from app.services import driver_service

router = APIRouter(
    prefix="/driver/vehicles", tags=["driver"], dependencies=[Depends(require_driver)]
)


@router.get("", response_model=list[DriverVehicleOut])
async def list_vehicles(auth: AuthContext = Depends(require_driver)) -> list[DriverVehicleOut]:
    rows = await driver_service.list_vehicles(auth.user_id)
    return [DriverVehicleOut.model_validate(v) for v in rows]


@router.post("", response_model=DriverVehicleOut, status_code=201)
async def add_vehicle(
    body: DriverVehicleIn, auth: AuthContext = Depends(require_driver)
) -> DriverVehicleOut:
    v = await driver_service.add_vehicle(
        auth.user_id,
        plate_number=body.plate_number,
        label=body.label,
        vehicle_type=body.vehicle_type,
        is_primary=body.is_primary,
    )
    return DriverVehicleOut.model_validate(v)


@router.patch("/{vehicle_id}", response_model=DriverVehicleOut)
async def update_vehicle(
    vehicle_id: uuid.UUID,
    body: DriverVehicleIn,
    auth: AuthContext = Depends(require_driver),
) -> DriverVehicleOut:
    v = await driver_service.update_vehicle(
        auth.user_id,
        vehicle_id,
        plate_number=body.plate_number,
        label=body.label,
        vehicle_type=body.vehicle_type,
        is_primary=body.is_primary,
    )
    return DriverVehicleOut.model_validate(v)


@router.delete("/{vehicle_id}", response_model=MessageOut)
async def delete_vehicle(
    vehicle_id: uuid.UUID, auth: AuthContext = Depends(require_driver)
) -> MessageOut:
    await driver_service.delete_vehicle(auth.user_id, vehicle_id)
    return MessageOut(message="Vehicle removed")
