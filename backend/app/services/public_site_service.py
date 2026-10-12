"""Public parking-site discovery: sites listed for the mobile app.

All queries run under platform_session — public/driver callers have no
tenant RLS context. Only sites of active tenants with status='active' and
public_profile.listed != False are visible.
"""

import math
import uuid

from sqlalchemy import func, select

from app.models import SiteMembershipPlan, Tenant, TenantSite
from app.schemas.driver import PublicSiteOut, SitePublicProfile

MAX_RESULTS = 200


def capacity_status(available: int, total: int) -> str:
    if total <= 0 or available <= 0:
        return "FULL"
    ratio = available / total
    if ratio > 0.3:
        return "AVAILABLE"
    if ratio >= 0.1:
        return "LIMITED"
    return "ALMOST_FULL"


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> int:
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return int(2 * r * math.asin(math.sqrt(a)))


def _listed_condition():
    return func.coalesce(TenantSite.public_profile["listed"].astext, "true") != "false"


def _site_out(
    site: TenantSite,
    tenant: Tenant,
    favorite_ids: set[uuid.UUID],
    distance_m,
    membership_price_from: int | None = None,
) -> PublicSiteOut:
    capacity = site.capacity or 0
    occupied = min(site.current_occupancy or 0, capacity) if capacity else (site.current_occupancy or 0)
    available = max(capacity - occupied, 0)
    return PublicSiteOut(
        id=site.id,
        tenant_id=tenant.id,
        tenant_slug=tenant.slug,
        name=site.name,
        address=site.address,
        city=site.city,
        latitude=float(site.latitude) if site.latitude is not None else None,
        longitude=float(site.longitude) if site.longitude is not None else None,
        distance_meters=distance_m,
        capacity=capacity,
        occupied=occupied,
        available=available,
        capacity_status=capacity_status(available, capacity),
        operating_hours=site.operating_hours or {},
        contact_phone=site.contact_phone,
        profile=SitePublicProfile.model_validate(site.public_profile or {}),
        is_favorite=site.id in favorite_ids,
        supports_membership=membership_price_from is not None,
        membership_price_from=membership_price_from,
        updated_at=site.updated_at,
    )


async def _plan_prices(db, site_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    """site_id → min price of its active membership plans."""
    if not site_ids:
        return {}
    rows = (
        await db.execute(
            select(SiteMembershipPlan.site_id, func.min(SiteMembershipPlan.price_vnd))
            .where(
                SiteMembershipPlan.site_id.in_(site_ids),
                SiteMembershipPlan.status == "active",
            )
            .group_by(SiteMembershipPlan.site_id)
        )
    ).all()
    return {site_id: price for site_id, price in rows}


async def _base_rows(db):
    return (
        (
            await db.execute(
                select(TenantSite, Tenant)
                .join(Tenant, Tenant.id == TenantSite.tenant_id)
                .where(
                    Tenant.status == "active",
                    TenantSite.status == "active",
                    _listed_condition(),
                )
            )
        )
        .all()
    )


async def list_sites(
    db,
    *,
    lat: float | None,
    lng: float | None,
    radius_km: float,
    q: str | None,
    favorite_ids: set[uuid.UUID],
    limit: int = MAX_RESULTS,
) -> list[PublicSiteOut]:
    rows = await _base_rows(db)
    kept: list[tuple[TenantSite, Tenant, int | None]] = []
    geo = lat is not None and lng is not None
    for site, tenant in rows:
        if q:
            needle = q.strip().lower()
            hay = " ".join(
                x for x in (site.name, site.address, site.city, tenant.name) if x
            ).lower()
            if needle not in hay:
                continue
        dist = None
        if geo:
            if site.latitude is None or site.longitude is None:
                continue
            dist = haversine_m(lat, lng, float(site.latitude), float(site.longitude))
            if dist > radius_km * 1000:
                continue
        kept.append((site, tenant, dist))
    prices = await _plan_prices(db, [s.id for s, _, _ in kept])
    out = [
        _site_out(site, tenant, favorite_ids, dist, prices.get(site.id))
        for site, tenant, dist in kept
    ]
    out.sort(key=(lambda s: (s.distance_meters or 0)) if geo else (lambda s: s.name))
    return out[:limit]


async def sites_by_ids(
    db, ids: list[uuid.UUID], favorite_ids: set[uuid.UUID]
) -> list[PublicSiteOut]:
    if not ids:
        return []
    rows = (
        (
            await db.execute(
                select(TenantSite, Tenant)
                .join(Tenant, Tenant.id == TenantSite.tenant_id)
                .where(TenantSite.id.in_(ids))
            )
        )
        .all()
    )
    prices = await _plan_prices(db, [s.id for s, _ in rows])
    return [
        _site_out(site, tenant, favorite_ids, None, prices.get(site.id))
        for site, tenant in rows
    ]


async def get_site(db, site_id: uuid.UUID) -> tuple[Tenant, TenantSite]:
    row = (
        await db.execute(
            select(TenantSite, Tenant)
            .join(Tenant, Tenant.id == TenantSite.tenant_id)
            .where(
                TenantSite.id == site_id,
                Tenant.status == "active",
                TenantSite.status == "active",
                _listed_condition(),
            )
        )
    ).one_or_none()
    if row is None:
        from app.core.errors import not_found

        raise not_found("site", site_id) from None
    site, tenant = row
    return tenant, site
