"""Vehicle presence tracking — where each plate is parked.

Monitor cameras (purpose='monitor') report detections via MQTT; this module
upserts the single `parked` presence per (tenant, plate), writes a
parked/relocated/exited/stale row to `vehicle_location_events`, and closes
presence when the vehicle exits through a gate (hooked from
`record_access_event`).

`vehicle_presences` has a partial unique index on (tenant_id,
plate_normalized) WHERE status='parked' — concurrent detections race it, so
inserts run in a savepoint and fall back to updating the winner's row.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Camera,
    CameraZoneCoverage,
    ParkingZone,
    RegisteredVehicle,
    VehicleLocationEvent,
    VehiclePresence,
)
from app.services.event_service import normalize_plate

_ACTIVE_STATUSES = ("parked", "stale")


async def _select_active_presence(
    db: AsyncSession, tenant_id: uuid.UUID, plate_normalized: str
) -> VehiclePresence | None:
    return (
        await db.execute(
            select(VehiclePresence)
            .where(
                VehiclePresence.tenant_id == tenant_id,
                VehiclePresence.plate_normalized == plate_normalized,
                VehiclePresence.status.in_(_ACTIVE_STATUSES),
            )
            .order_by(VehiclePresence.last_seen_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def _covered_zones(db: AsyncSession, camera_id: uuid.UUID) -> list[ParkingZone]:
    return (
        (
            await db.execute(
                select(ParkingZone)
                .join(CameraZoneCoverage, CameraZoneCoverage.zone_id == ParkingZone.id)
                .where(CameraZoneCoverage.camera_id == camera_id)
            )
        )
        .scalars()
        .all()
    )


async def resolve_zone(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    camera: Camera | None,
    zone_id: uuid.UUID | None,
    zone_code: str | None,
) -> ParkingZone | None:
    """Resolve a detection's zone: explicit id > code (camera coverage first,
    then camera's site) > single-coverage inference > None."""
    if zone_id is not None:
        row = (
            await db.execute(
                select(ParkingZone).where(ParkingZone.id == zone_id, ParkingZone.tenant_id == tenant_id)
            )
        ).scalar_one_or_none()
        if row is not None:
            return row
    if zone_code:
        if camera is not None:
            for z in await _covered_zones(db, camera.id):
                if z.code == zone_code:
                    return z
            q = select(ParkingZone).where(
                ParkingZone.tenant_id == tenant_id,
                ParkingZone.site_id == camera.site_id,
                ParkingZone.code == zone_code,
            )
        else:
            q = select(ParkingZone).where(ParkingZone.tenant_id == tenant_id, ParkingZone.code == zone_code)
        row = (await db.execute(q.limit(1))).scalar_one_or_none()
        if row is not None:
            return row
    if camera is not None:
        covered = await _covered_zones(db, camera.id)
        if len(covered) == 1:
            return covered[0]
    return None


def _log_event(
    db: AsyncSession,
    presence: VehiclePresence,
    event_type: str,
    *,
    from_zone_id: uuid.UUID | None,
    to_zone_id: uuid.UUID | None,
    camera_id: uuid.UUID | None,
    confidence: float | None,
    occurred_at: datetime,
    payload: dict,
) -> None:
    db.add(
        VehicleLocationEvent(
            tenant_id=presence.tenant_id,
            presence_id=presence.id,
            event_type=event_type,
            from_zone_id=from_zone_id,
            to_zone_id=to_zone_id,
            camera_id=camera_id,
            plate_number=presence.plate_number,
            confidence=confidence,
            payload=payload,
            occurred_at=occurred_at,
        )
    )


async def record_detection(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    site_id: uuid.UUID,
    camera_id: uuid.UUID | None,
    zone: ParkingZone | None,
    plate_number: str,
    confidence: float | None,
    occurred_at: datetime,
    payload: dict,
) -> tuple[VehiclePresence, str]:
    """Upsert the parked presence for a plate; returns (presence, event_type)
    where event_type is 'parked' | 'relocated' | 'seen'."""
    normalized = normalize_plate(plate_number)
    now = occurred_at
    new_zone_id = zone.id if zone else None
    new_level_id = zone.level_id if zone else None

    presence = await _select_active_presence(db, tenant_id, normalized)
    if presence is None:
        vehicle_id = (
            await db.execute(
                select(RegisteredVehicle.id).where(
                    RegisteredVehicle.tenant_id == tenant_id,
                    RegisteredVehicle.plate_normalized == normalized,
                )
            )
        ).scalar_one_or_none()
        presence = VehiclePresence(
            tenant_id=tenant_id,
            site_id=site_id,
            level_id=new_level_id,
            zone_id=new_zone_id,
            plate_number=plate_number[:20],
            plate_normalized=normalized,
            vehicle_id=vehicle_id,
            camera_id=camera_id,
            confidence=confidence,
            status="parked",
            first_seen_at=now,
            last_seen_at=now,
        )
        try:
            async with db.begin_nested():
                db.add(presence)
                await db.flush()
        except IntegrityError:
            # Concurrent detection won the partial-unique race — update its row.
            presence = await _select_active_presence(db, tenant_id, normalized)
            if presence is None:
                raise
        else:
            _log_event(
                db,
                presence,
                "parked",
                from_zone_id=None,
                to_zone_id=new_zone_id,
                camera_id=camera_id,
                confidence=confidence,
                occurred_at=now,
                payload=payload,
            )
            await db.flush()
            return presence, "parked"

    if presence.zone_id == new_zone_id:
        presence.status = "parked"
        presence.camera_id = camera_id
        presence.confidence = confidence
        presence.last_seen_at = now
        if presence.level_id is None:
            presence.level_id = new_level_id
        await db.flush()
        return presence, "seen"

    from_zone_id = presence.zone_id
    presence.zone_id = new_zone_id
    presence.level_id = new_level_id
    presence.status = "parked"
    presence.camera_id = camera_id
    presence.confidence = confidence
    presence.last_seen_at = now
    _log_event(
        db,
        presence,
        "relocated",
        from_zone_id=from_zone_id,
        to_zone_id=new_zone_id,
        camera_id=camera_id,
        confidence=confidence,
        occurred_at=now,
        payload=payload,
    )
    await db.flush()
    return presence, "relocated"


async def mark_presence_exit(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    plate_number: str,
    camera_id: uuid.UUID | None = None,
    zone_id: uuid.UUID | None = None,
) -> VehiclePresence | None:
    """Close the active presence for a plate (gate exit or camera vehicle_left)."""
    normalized = normalize_plate(plate_number)
    presence = await _select_active_presence(db, tenant_id, normalized)
    if presence is None:
        return None
    now = datetime.now(timezone.utc)
    from_zone_id = zone_id if zone_id is not None else presence.zone_id
    presence.status = "exited"
    presence.exited_at = now
    _log_event(
        db,
        presence,
        "exited",
        from_zone_id=from_zone_id,
        to_zone_id=None,
        camera_id=camera_id,
        confidence=None,
        occurred_at=now,
        payload={},
    )
    await db.flush()
    return presence


async def close_presence_for_plate(db: AsyncSession, *, tenant_id: uuid.UUID, plate_number: str) -> None:
    """Hook for `record_access_event`: gate exit clears the parked presence."""
    await mark_presence_exit(db, tenant_id=tenant_id, plate_number=plate_number)


async def locate_presence(
    db: AsyncSession, *, tenant_id: uuid.UUID, plate_number: str
) -> VehiclePresence | None:
    """Exact normalized-plate match on an active (parked/stale) presence."""
    return await _select_active_presence(db, tenant_id, normalize_plate(plate_number))


async def sweep_stale_presences(db: AsyncSession, *, stale_before: datetime, expire_before: datetime) -> int:
    """parked + last_seen older than `stale_before` → 'stale'; any active row
    older than `expire_before` → 'exited'. Returns rows touched."""
    rows = (
        (
            await db.execute(
                select(VehiclePresence).where(
                    VehiclePresence.status.in_(_ACTIVE_STATUSES),
                    VehiclePresence.last_seen_at < stale_before,
                )
            )
        )
        .scalars()
        .all()
    )
    now = datetime.now(timezone.utc)
    touched = 0
    for p in rows:
        if p.last_seen_at < expire_before:
            p.status = "exited"
            p.exited_at = now
            event_type = "exited"
        elif p.status == "parked":
            p.status = "stale"
            event_type = "stale"
        else:
            continue
        _log_event(
            db,
            p,
            event_type,
            from_zone_id=p.zone_id,
            to_zone_id=None,
            camera_id=None,
            confidence=None,
            occurred_at=now,
            payload={},
        )
        touched += 1
    await db.flush()
    return touched
