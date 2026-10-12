"""Driver payments: create/list/refresh/cancel (mobile app)."""

import uuid

from fastapi import APIRouter, Depends

from app.api.deps import AuthContext, require_driver
from app.schemas.driver import PaymentCreateIn, PaymentOut
from app.services import payment_service

router = APIRouter(
    prefix="/driver/payments", tags=["driver"], dependencies=[Depends(require_driver)]
)


@router.get("", response_model=list[PaymentOut])
async def list_payments(auth: AuthContext = Depends(require_driver)) -> list[PaymentOut]:
    return [PaymentOut(**r) for r in await payment_service.list_payments(auth.user_id)]


@router.post("", response_model=PaymentOut, status_code=201)
async def create_payment(
    body: PaymentCreateIn, auth: AuthContext = Depends(require_driver)
) -> PaymentOut:
    return PaymentOut(
        **await payment_service.create_payment(
            auth.user_id, body.kind, body.membership_id, body.session_id
        )
    )


@router.get("/{payment_id}", response_model=PaymentOut)
async def get_payment(
    payment_id: uuid.UUID, auth: AuthContext = Depends(require_driver)
) -> PaymentOut:
    return PaymentOut(**await payment_service.get_payment(auth.user_id, payment_id))


@router.post("/{payment_id}/cancel", response_model=PaymentOut)
async def cancel_payment(
    payment_id: uuid.UUID, auth: AuthContext = Depends(require_driver)
) -> PaymentOut:
    return PaymentOut(**await payment_service.cancel_payment(auth.user_id, payment_id))
