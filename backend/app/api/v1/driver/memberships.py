"""Driver memberships: request, list, cancel (mobile app)."""

import uuid

from fastapi import APIRouter, Depends

from app.api.deps import AuthContext, require_driver
from app.schemas.driver import DriverMembershipIn, DriverMembershipOut
from app.services import membership_service

router = APIRouter(
    prefix="/driver/memberships", tags=["driver"], dependencies=[Depends(require_driver)]
)


@router.get("", response_model=list[DriverMembershipOut])
async def list_memberships(auth: AuthContext = Depends(require_driver)) -> list[DriverMembershipOut]:
    rows = await membership_service.list_my_memberships(auth.user_id)
    return [DriverMembershipOut(**r) for r in rows]


@router.post("", response_model=DriverMembershipOut, status_code=201)
async def request_membership(
    body: DriverMembershipIn, auth: AuthContext = Depends(require_driver)
) -> DriverMembershipOut:
    m = await membership_service.request_membership(
        auth.user_id, body.plan_id, body.vehicle_id
    )
    rows = await membership_service.list_my_memberships(auth.user_id)
    return DriverMembershipOut(**next(r for r in rows if r["id"] == m.id))


@router.post("/{membership_id}/cancel", response_model=DriverMembershipOut)
async def cancel_membership(
    membership_id: uuid.UUID, auth: AuthContext = Depends(require_driver)
) -> DriverMembershipOut:
    m = await membership_service.cancel_membership(auth.user_id, membership_id)
    rows = await membership_service.list_my_memberships(auth.user_id)
    return DriverMembershipOut(**next(r for r in rows if r["id"] == m.id))
