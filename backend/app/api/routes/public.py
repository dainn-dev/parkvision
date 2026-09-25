"""Public, unauthenticated endpoints: plans, legal docs, tenant registration."""

from fastapi import APIRouter, Request
from sqlalchemy import select, text

from app.core.deps import client_ip
from app.core.errors import conflict
from app.core.security import hash_password
from app.db.session import db_session
from app.models import Tenant, TenantUser
from app.schemas.admin import LegalDocOut, PlanOut
from app.schemas.auth import RegisterTenantIn
from app.services.audit import write_audit

router = APIRouter(tags=["public"])

# Static catalog for now — the source of truth can move to platform_settings.
PLANS = [
    {"slug": "starter", "name": "Starter", "priceMonthly": 49,
     "features": ["1 site", "2 gates", "500 vehicles", "30-day event retention"]},
    {"slug": "growth", "name": "Growth", "priceMonthly": 149,
     "features": ["5 sites", "10 gates", "5,000 vehicles", "1-year event retention", "MFA"]},
    {"slug": "enterprise", "name": "Enterprise", "priceMonthly": 499,
     "features": ["Unlimited sites/gates", "SSO", "Dedicated support", "Custom retention"]},
]

LEGAL_DOCS = [
    {"slug": "terms", "title": "Terms of Service", "version": "1.0"},
    {"slug": "privacy", "title": "Privacy Policy", "version": "1.0"},
    {"slug": "dpa", "title": "Data Processing Addendum", "version": "1.0"},
]


@router.get("/plans", response_model=list[PlanOut])
async def list_plans():
    return PLANS


@router.get("/legal/{slug}", response_model=LegalDocOut)
async def legal_doc(slug: str):
    from datetime import UTC, datetime

    doc = next((d for d in LEGAL_DOCS if d["slug"] == slug), None)
    if doc is None:
        from app.core.errors import not_found

        raise not_found("Document")
    return LegalDocOut(
        slug=doc["slug"],
        title=doc["title"],
        version=doc["version"],
        updated_at=datetime(2026, 1, 1, tzinfo=UTC),
        body_markdown=f"# {doc['title']}\n\n_Placeholder — content managed by the platform team._",
    )


@router.post("/register", status_code=201)
async def register_tenant(body: RegisterTenantIn, request: Request):
    """Self-service tenant signup: creates the tenant plus its owner user
    (status=active so they can log in immediately; email verification can
    tighten this later)."""
    async with db_session() as session:
        await session.execute(text("SELECT set_config('app.platform_admin','on',true)"))
        existing = (
            await session.execute(select(Tenant).where(Tenant.slug == body.slug))
        ).scalar_one_or_none()
        if existing:
            raise conflict("Slug already taken")
        tenant = Tenant(
            name=body.tenant_name,
            slug=body.slug,
            plan=body.plan,
            contact_email=body.owner_email,
            status="trial",
        )
        session.add(tenant)
        await session.flush()
        owner = TenantUser(
            tenant_id=tenant.id,
            email=body.owner_email,
            password_hash=hash_password(body.owner_password),
            full_name=body.owner_name,
            role="owner",
            status="active",
        )
        session.add(owner)
        await session.flush()
        await write_audit(
            session, principal=None, action="tenant.register",
            tenant_id=tenant.id, target_type="tenant", target_id=str(tenant.id),
            ip=client_ip(request), actor_label=body.owner_email,
        )
        return {"tenantId": str(tenant.id), "slug": tenant.slug}
