"""Driver parking sessions derived from ANPR access events.

There is no dedicated driver-session table: a session is inferred from the
latest allowed `access_events` rows for the driver's registered (normalized)
plates. Queries run under `platform_session` and are always restricted to the
caller's own plates, so no cross-tenant data leaks.

History pairing scans at most `_SCAN_LIMIT_PER_PLATE` allowed events per
plate — documented bound to keep the pairing pass cheap.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AccessEvent, ParkingLevel, ParkingZone, Tenant, TenantSite
from app.schemas.driver import DriverSessionOut
from app.services.event_service import normalize_plate
from app.services.parking_service import locate_presence
from app.services.pricing_service import estimate_fee, pricing_from_profile
from app.services.storage import presign_download

_SCAN_LIMIT_PER_PLATE = 500


def _normalized_plate():
    return func.regexp_replace(func.upper(AccessEvent.plate_number), "[^A-Z0-9]", "", "g")


async def _allowed_events(db: AsyncSession, plates: set[str]) -> list[AccessEvent]:
    """Newest-first allowed, site-bound events matching the plates (≤ limit/plate)."""
    if not plates:
        return []
    rows = (
        (
            await db.execute(
                select(AccessEvent)
                .where(
                    AccessEvent.decision == "allow",
                    AccessEvent.site_id.isnot(None),
                    AccessEvent.plate_number.isnot(None),
                    _normalized_plate().in_(sorted(plates)),
                )
                .order_by(AccessEvent.occurred_at.desc())
                .limit(_SCAN_LIMIT_PER_PLATE * len(plates))
            )
        )
        .scalars()
        .all()
    )
    per_plate: dict[str, int] = {}
    kept: list[AccessEvent] = []
    for ev in rows:
        plate = normalize_plate(ev.plate_number or "")
        if per_plate.get(plate, 0) < _SCAN_LIMIT_PER_PLATE:
            per_plate[plate] = per_plate.get(plate, 0) + 1
            kept.append(ev)
    return kept


async def _site_index(
    db: AsyncSession, site_ids: set[uuid.UUID]
) -> dict[uuid.UUID, tuple[TenantSite, str]]:
    if not site_ids:
        return {}
    rows = (
        (
            await db.execute(
                select(TenantSite, Tenant.slug)
                .join(Tenant, Tenant.id == TenantSite.tenant_id)
                .where(TenantSite.id.in_(site_ids))
            )
        )
        .all()
    )
    return {site.id: (site, slug) for site, slug in rows}


def _entry_image(ev: AccessEvent) -> str | None:
    key = ev.plate_image_url or ev.overview_image_url
    if not key:
        return None
    try:
        return presign_download(key)
    except Exception:
        return None


def _to_out(
    ev: AccessEvent,
    site: TenantSite,
    slug: str,
    *,
    exited_at: datetime | None,
    level_name: str | None = None,
    zone_name: str | None = None,
) -> DriverSessionOut:
    now = datetime.now(timezone.utc)
    end = exited_at or now
    return DriverSessionOut(
        id=str(ev.id),
        site_id=ev.site_id,
        site_name=site.name,
        tenant_slug=slug,
        plate_number=ev.plate_number or "",
        entered_at=ev.occurred_at,
        exited_at=exited_at,
        duration_seconds=max(0, int((end - ev.occurred_at).total_seconds())),
        status="COMPLETED" if exited_at else "PARKED",
        entry_image_url=_entry_image(ev),
        confidence=float(ev.confidence) if ev.confidence is not None else None,
        level_name=level_name,
        zone_name=zone_name,
        fee_vnd=estimate_fee(
            pricing_from_profile(site.public_profile),
            ev.occurred_at,
            end,
            site.timezone or "UTC",
        ),
    )


async def active_sessions(db: AsyncSession, plates: set[str]) -> list[DriverSessionOut]:
    """One PARKED row per plate whose latest allowed event is an entry."""
    events = await _allowed_events(db, plates)
    latest: dict[str, AccessEvent] = {}
    for ev in events:  # newest first — first hit per plate is the latest
        plate = normalize_plate(ev.plate_number or "")
        latest.setdefault(plate, ev)

    parked = [ev for ev in latest.values() if ev.direction == "entry"]
    sites = await _site_index(db, {ev.site_id for ev in parked})
    out: list[DriverSessionOut] = []
    for ev in parked:
        site, slug = sites[ev.site_id]
        level_name = zone_name = None
        presence = await locate_presence(
            db, tenant_id=ev.tenant_id, plate_number=ev.plate_number or ""
        )
        if presence is not None:
            if presence.level_id:
                level_name = await db.scalar(
                    select(ParkingLevel.name).where(ParkingLevel.id == presence.level_id)
                )
            if presence.zone_id:
                zone_name = await db.scalar(
                    select(ParkingZone.name).where(ParkingZone.id == presence.zone_id)
                )
        out.append(
            _to_out(ev, site, slug, exited_at=None, level_name=level_name, zone_name=zone_name)
        )
    return out


async def history(
    db: AsyncSession, plates: set[str], page: int, limit: int
) -> tuple[list[DriverSessionOut], int]:
    """Completed entry→exit pairs per (plate, site), newest exit first."""
    events = await _allowed_events(db, plates)
    open_entries: dict[tuple[str, uuid.UUID], list[AccessEvent]] = {}
    pairs: list[tuple[AccessEvent, AccessEvent]] = []
    for ev in reversed(events):  # chronological
        key = (normalize_plate(ev.plate_number or ""), ev.site_id)
        if ev.direction == "entry":
            open_entries.setdefault(key, []).append(ev)
        elif ev.direction == "exit" and open_entries.get(key):
            pairs.append((open_entries[key].pop(), ev))

    pairs.sort(key=lambda p: p[1].occurred_at, reverse=True)
    total = len(pairs)
    page_rows = pairs[(page - 1) * limit : page * limit]

    sites = await _site_index(db, {ev.site_id for _, ev in page_rows})
    return (
        [_to_out(entry, *sites[entry.site_id], exited_at=ex.occurred_at) for entry, ex in page_rows],
        total,
    )
