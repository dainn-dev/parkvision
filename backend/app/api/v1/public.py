"""Public endpoints: plans, legal documents, tenant self-registration."""

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.enums import AccountStatus, TenantStatus, TenantUserRole
from app.core.errors import conflict, not_found
from app.database import anonymous_session, platform_session
from app.models import LegalDocument, Plan, Tenant, TenantUser
from app.schemas.auth import RegisterTenantIn, RegisterTenantOut
from app.schemas.common import Page, paginate
from app.schemas.resources import LegalDocOut, PlanOut
from app.security import hash_password

router = APIRouter(tags=["public"])


@router.get("/plans", response_model=Page[PlanOut])
async def list_plans() -> Page[PlanOut]:
    async with anonymous_session() as db:
        rows = (
            (await db.execute(select(Plan).where(Plan.public.is_(True)).order_by(Plan.price_monthly_cents)))
            .scalars()
            .all()
        )
    return paginate([PlanOut.model_validate(r) for r in rows], len(rows), 1, len(rows) or 1)


@router.get("/legal/{doc_type}", response_model=LegalDocOut)
async def latest_legal_doc(doc_type: str) -> LegalDocOut:
    async with anonymous_session() as db:
        row = (
            await db.execute(
                select(LegalDocument)
                .where(LegalDocument.doc_type == doc_type)
                .order_by(LegalDocument.published_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
    if row is None:
        raise not_found("legal_document", doc_type) from None
    return LegalDocOut.model_validate(row)


@router.post("/register", response_model=RegisterTenantOut, status_code=201)
async def register_tenant(body: RegisterTenantIn) -> RegisterTenantOut:
    async with platform_session() as db:
        plan = (await db.execute(select(Plan).where(Plan.code == body.plan_code))).scalar_one_or_none()
        if plan is None:
            raise not_found("plan", body.plan_code) from None

        tenant = Tenant(
            name=body.tenant_name,
            slug=body.slug,
            plan_code=body.plan_code,
            status=str(TenantStatus.TRIAL),
            contact_email=body.contact_email.lower(),
        )
        db.add(tenant)
        try:
            await db.flush()
        except IntegrityError:
            raise conflict("Tenant slug is already taken") from None

        owner = TenantUser(
            tenant_id=tenant.id,
            email=body.owner_email.lower(),
            password_hash=hash_password(body.owner_password),
            full_name=body.owner_full_name,
            role=str(TenantUserRole.OWNER),
            status=str(AccountStatus.ACTIVE),
        )
        db.add(owner)
        try:
            await db.flush()
        except IntegrityError:
            raise conflict("A user with this email already exists") from None

    return RegisterTenantOut(
        tenant_id=tenant.id,
        owner_user_id=owner.id,
        message="Tenant registered. You can log in now.",
    )
