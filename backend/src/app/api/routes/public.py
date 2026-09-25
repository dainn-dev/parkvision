"""Public (unauthenticated) routes: plans, legal docs, tenant registration."""

import re
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from arq.connections import RedisSettings, create_pool
from fastapi import APIRouter, Request, status
from pydantic import EmailStr, Field
from sqlalchemy import func, select

from app.api.deps import PlainDb, client_ip, rate_limit
from app.config import get_settings
from app.core import security
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.models.enums import AccountStatus, InvitationPurpose, InvitationScope, TenantStatus, TenantUserRole
from app.models.identity import Invitation, Tenant, TenantUser
from app.schemas.base import ApiSchema
from app.services import audit as audit_mod
from app.services.email import invite_email

settings = get_settings()
router = APIRouter(prefix="/public", tags=["public"])

PLANS: list[dict[str, Any]] = [
    {
        "id": "starter",
        "name": "Starter",
        "priceMonthlyUsd": 0,
        "sites": 1,
        "gates": 2,
        "vehicles": 200,
        "features": ["barrierControl", "telemetryLiveView"],
    },
    {
        "id": "growth",
        "name": "Growth",
        "priceMonthlyUsd": 149,
        "sites": 5,
        "gates": 15,
        "vehicles": 5000,
        "features": [
            "barrierControl",
            "telemetryLiveView",
            "bulkVehicleImport",
            "auditExport",
            "incidentRemediation",
        ],
    },
    {
        "id": "enterprise",
        "name": "Enterprise",
        "priceMonthlyUsd": None,
        "sites": None,
        "gates": None,
        "vehicles": None,
        "features": ["*"],
    },
]

LEGAL_DOCS = {
    "terms": "legal/terms.md",
    "privacy": "legal/privacy.md",
    "dpa": "legal/dpa.md",
    "sla": "legal/sla.md",
}


class PlanView(ApiSchema):
    id: str
    name: str
    price_monthly_usd: int | None
    sites: int | None
    gates: int | None
    vehicles: int | None
    features: list[str]


@router.get("/plans", response_model=list[PlanView])
async def plans() -> list[PlanView]:
    return [PlanView(**p) for p in PLANS]


@router.get("/legal/{doc}")
async def legal_doc(doc: str) -> dict:
    """Serve published legal docs from app/static/legal/<doc>.md."""
    if doc not in LEGAL_DOCS:
        raise NotFoundError("document not found")
    from pathlib import Path

    path = Path(__file__).resolve().parents[2] / "static" / LEGAL_DOCS[doc]
    if not path.exists():
        raise NotFoundError("document unavailable")
    return {"doc": doc, "content": path.read_text(encoding="utf-8")}


SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$")


class RegisterTenantRequest(ApiSchema):
    tenant_name: str = Field(min_length=2, max_length=200)
    slug: str | None = Field(default=None, min_length=2, max_length=80)
    plan: str | None = None
    owner_email: EmailStr
    owner_name: str | None = Field(default=None, max_length=200)
    password: str | None = Field(default=None, min_length=10, max_length=200)


class RegisterTenantResponse(ApiSchema):
    tenant_id: str
    slug: str
    owner_invited: bool
    message: str


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:63] or "tenant"


@router.post("/tenants/register", response_model=RegisterTenantResponse, status_code=status.HTTP_202_ACCEPTED)
async def register_tenant(
    body: RegisterTenantRequest, request: Request, db: PlainDb
) -> RegisterTenantResponse:
    """Self-service tenant signup: creates tenant + invited owner, emails a link."""
    await rate_limit("register", client_ip(request) or "anon", 5, 300)

    slug = body.slug or _slugify(body.tenant_name)
    if not SLUG_RE.match(slug):
        raise ValidationError("invalid slug — lowercase letters, digits, hyphens")
    exists = (await db.execute(select(Tenant.id).where(Tenant.slug == slug))).scalar_one_or_none()
    if exists is not None:
        raise ConflictError("slug already taken")
    plan = body.plan if body.plan in {p["id"] for p in PLANS} else "starter"

    email_taken = (
        await db.execute(
            select(TenantUser.id).where(func.lower(TenantUser.email) == body.owner_email.lower())
        )
    ).scalar_one_or_none()
    if email_taken is not None:
        raise ConflictError("email already registered")

    tenant = Tenant(
        name=body.tenant_name,
        slug=slug,
        plan=plan,
        status=TenantStatus.TRIAL.value,
        contact_email=body.owner_email,
    )
    db.add(tenant)
    await db.flush()

    owner = TenantUser(
        tenant_id=tenant.id,
        email=body.owner_email.lower(),
        full_name=body.owner_name,
        role=TenantUserRole.OWNER.value,
        status=AccountStatus.ACTIVE.value if body.password else AccountStatus.INVITED.value,
        password_hash=security.hash_password(body.password) if body.password else None,
    )
    db.add(owner)
    await db.flush()

    owner_invited = not body.password
    if owner_invited:
        token = secrets.token_urlsafe(32)
        db.add(
            Invitation(
                tenant_id=tenant.id,
                scope=InvitationScope.TENANT_USER.value,
                purpose=InvitationPurpose.INVITE.value,
                email=owner.email,
                role=owner.role,
                subject_id=owner.id,
                token_hash=security.hash_token(token),
                expires_at=datetime.now(UTC) + timedelta(days=7),
            )
        )
        accept_url = f"{settings.app_base_url}/accept-invite?token={token}"
        subject, text_body = invite_email(accept_url, tenant.name)
        arq = await create_pool(RedisSettings.from_dsn(settings.redis_url))
        await arq.enqueue_job("send_email", owner.email, subject, text_body)

    await audit_mod.audit(
        db,
        action="tenant.registered",
        actor_type="tenant_user",
        actor_id=owner.id,
        tenant_id=tenant.id,
        ip=client_ip(request),
        detail={"slug": slug, "plan": plan},
    )
    return RegisterTenantResponse(
        tenant_id=str(tenant.id),
        slug=slug,
        owner_invited=owner_invited,
        message="check your email to activate your account"
        if owner_invited
        else "tenant created — you can log in",
    )
