"""Public, unauthenticated endpoints: plans, legal docs, tenant registration."""

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import LegalDocument, SubscriptionPlan, TenantRegistration
from app.schemas.common import MessageResponse
from app.schemas.identity import (
    LegalDocOut,
    PlanOut,
    RegistrationCreate,
    RegistrationOut,
)
from app.services.common import get_or_404

router = APIRouter(tags=["public"])

DbDep = Annotated[AsyncSession, Depends(get_db)]


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.get("/public/plans", response_model=list[PlanOut])
async def list_plans(db: DbDep) -> list[PlanOut]:
    result = await db.execute(
        select(SubscriptionPlan).where(SubscriptionPlan.active.is_(True))
    )
    return [PlanOut.model_validate(p) for p in result.scalars()]


@router.get("/public/legal/{slug}", response_model=LegalDocOut)
async def get_legal(slug: str, db: DbDep) -> LegalDocOut:
    doc = await get_or_404(db, LegalDocument, slug, "Document not found")
    return LegalDocOut.model_validate(doc)


@router.post(
    "/public/tenant-registrations",
    status_code=status.HTTP_201_CREATED,
    response_model=RegistrationOut,
)
async def register_tenant(payload: RegistrationCreate, db: DbDep) -> RegistrationOut:
    registration = TenantRegistration(
        company_name=payload.company_name,
        contact_name=payload.contact_name,
        contact_email=payload.contact_email.lower(),
        plan_code=payload.plan_code,
        payload=payload.payload,
    )
    db.add(registration)
    await db.commit()
    return RegistrationOut.model_validate(registration)


@router.get("/public/message", response_model=MessageResponse, include_in_schema=False)
async def message() -> MessageResponse:
    return MessageResponse(message="ok")
