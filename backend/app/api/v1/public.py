"""Public endpoints: plans, legal documents, tenant self-registration."""

import re

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.core.enums import AccountStatus, TenantStatus, TenantUserRole
from app.core.errors import bad_request, conflict, not_found
from app.core.rate_limit import rate_limited
from app.database import anonymous_session, platform_session
from app.models import (
    LegalDocument,
    ParkingLevel,
    ParkingZone,
    Plan,
    Tenant,
    TenantUser,
    VehiclePresence,
)
from app.schemas.auth import RegisterTenantIn, RegisterTenantOut
from app.schemas.common import Page, paginate
from app.schemas.resources import (
    CheckCodeOut,
    LegalDocOut,
    PlanOut,
    PublicLocateOut,
    PublicMapLevelOut,
    PublicMapZoneOut,
)
from app.security import hash_password
from app.services.parking_service import locate_presence
from app.services.storage import presign_download

router = APIRouter(tags=["public"])

SLUG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{1,119}$")


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


@router.get(
    "/tenants/check-code",
    response_model=CheckCodeOut,
    dependencies=[Depends(rate_limited("check-code", 30, 60))],
)
async def check_tenant_code(slug: str = Query(min_length=2, max_length=120)) -> CheckCodeOut:
    """Realtime slug availability check for the registration form."""
    normalized = slug.strip().lower()
    if not SLUG_PATTERN.fullmatch(normalized):
        return CheckCodeOut(available=False, slug=normalized, reason="invalid_slug")
    # platform_session: RLS hides tenant rows from anonymous context; this
    # endpoint only returns a boolean, so no tenant data leaks.
    async with platform_session() as db:
        exists = (
            await db.execute(select(Tenant.id).where(Tenant.slug == normalized).limit(1))
        ).scalar_one_or_none()
    return CheckCodeOut(
        available=exists is None,
        slug=normalized,
        reason="taken" if exists is not None else None,
    )


@router.post(
    "/register",
    response_model=RegisterTenantOut,
    status_code=201,
    dependencies=[Depends(rate_limited("register", 5, 60))],
)
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


# ---------- public parking map + find-my-car ----------
async def _tenant_by_slug(db, slug: str) -> Tenant:
    tenant = (
        await db.execute(select(Tenant).where(Tenant.slug == slug.strip().lower()))
    ).scalar_one_or_none()
    if tenant is None or tenant.status != "active":
        raise not_found("tenant", slug) from None
    return tenant


@router.get(
    "/public/tenants/{slug}/parking/map",
    response_model=list[PublicMapLevelOut],
    dependencies=[Depends(rate_limited("public-parking-map", 60, 60))],
)
async def public_parking_map(slug: str) -> list[PublicMapLevelOut]:
    """Levels + zones + occupancy only — no presence/plate data."""
    async with platform_session() as db:
        tenant = await _tenant_by_slug(db, slug)
        levels = (
            (
                await db.execute(
                    select(ParkingLevel)
                    .where(ParkingLevel.tenant_id == tenant.id, ParkingLevel.status == "active")
                    .order_by(ParkingLevel.sort_order, ParkingLevel.created_at)
                )
            )
            .scalars()
            .all()
        )
        if not levels:
            return []
        level_ids = [lv.id for lv in levels]
        zones = (
            (
                await db.execute(
                    select(ParkingZone)
                    .where(ParkingZone.tenant_id == tenant.id, ParkingZone.level_id.in_(level_ids))
                    .order_by(ParkingZone.code)
                )
            )
            .scalars()
            .all()
        )
        zone_ids = [z.id for z in zones]
        occupancy = (
            dict(
                (
                    await db.execute(
                        select(VehiclePresence.zone_id, func.count())
                        .where(
                            VehiclePresence.tenant_id == tenant.id,
                            VehiclePresence.zone_id.in_(zone_ids),
                            VehiclePresence.status.in_(("parked", "stale")),
                        )
                        .group_by(VehiclePresence.zone_id)
                    )
                ).all()
            )
            if zone_ids
            else {}
        )

    out: list[PublicMapLevelOut] = []
    for lv in levels:
        lv_out = PublicMapLevelOut.model_validate(lv)
        if lv.map_image_url:
            lv_out.map_image_url = presign_download(lv.map_image_url)
        lv_out.zones = [
            PublicMapZoneOut(
                id=z.id,
                level_id=z.level_id,
                name=z.name,
                code=z.code,
                bounds=z.bounds or None,
                occupied_count=occupancy.get(z.id, 0),
            )
            for z in zones
            if z.level_id == lv.id
        ]
        out.append(lv_out)
    return out


@router.get(
    "/public/tenants/{slug}/parking/locate",
    response_model=PublicLocateOut,
    dependencies=[Depends(rate_limited("public-parking-locate", 30, 60))],
)
async def public_parking_locate(
    slug: str, plate: str = Query(min_length=1, max_length=20)
) -> PublicLocateOut:
    """Exact normalized-plate match; returns zone/level pointers only."""
    if len(plate.strip()) < 4:
        raise bad_request("plate must be at least 4 characters")
    async with platform_session() as db:
        tenant = await _tenant_by_slug(db, slug)
        presence = await locate_presence(db, tenant_id=tenant.id, plate_number=plate)
        if presence is None:
            return PublicLocateOut(found=False)
        zone = await db.get(ParkingZone, presence.zone_id) if presence.zone_id else None
        level = await db.get(ParkingLevel, presence.level_id) if presence.level_id else None
    return PublicLocateOut(
        found=True,
        zone_id=zone.id if zone else None,
        zone_name=zone.name if zone else None,
        zone_code=zone.code if zone else None,
        level_id=level.id if level else None,
        level_name=level.name if level else None,
        level_code=level.code if level else None,
        since_at=presence.first_seen_at,
    )
