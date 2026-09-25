"""CSV bulk vehicle import — parsing + upsert logic (run by the arq worker)."""

import csv
import io
import re
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RegisteredVehicle, Tenant
from app.models.enums import VehicleStatus

PLATE_RE = re.compile(r"[^A-Z0-9]")


def normalize_plate(raw: str) -> str:
    return PLATE_RE.sub("", raw.upper())


async def import_vehicles_csv(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    site_id: UUID | None,
    csv_bytes: bytes,
) -> dict:
    """Columns: plate_number, owner_name, vehicle_type, valid_from, valid_until, tags(comma|).

    Upserts on (tenant, site, normalized plate). Returns a summary dict.
    """
    text = csv_bytes.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None or "plate_number" not in {f.strip() for f in reader.fieldnames}:
        raise ValueError("CSV must contain a 'plate_number' column")

    created = updated = skipped = 0
    errors: list[dict] = []
    seen: dict[str, RegisteredVehicle] = {}
    for lineno, row in enumerate(reader, start=2):
        plate = normalize_plate(row.get("plate_number") or "")
        if not plate:
            skipped += 1
            errors.append({"line": lineno, "error": "missing/invalid plate_number"})
            continue

        vehicle = seen.get(plate)
        if vehicle is None:
            result = await db.execute(
                select(RegisteredVehicle).where(
                    RegisteredVehicle.tenant_id == tenant_id,
                    RegisteredVehicle.site_id == site_id,
                    RegisteredVehicle.plate_normalized == plate,
                )
            )
            vehicle = result.scalar_one_or_none()
        tags_raw = (row.get("tags") or "").strip()
        tags = [t.strip() for t in tags_raw.split("|") if t.strip()] if tags_raw else []
        if vehicle is None:
            vehicle = RegisteredVehicle(
                tenant_id=tenant_id,
                site_id=site_id,
                plate_number=(row.get("plate_number") or "").strip()[:20],
                plate_normalized=plate,
                owner_name=(row.get("owner_name") or "").strip() or None,
                vehicle_type=(row.get("vehicle_type") or "").strip() or None,
                tags=tags,
                status=VehicleStatus.ACTIVE,
            )
            db.add(vehicle)
            seen[plate] = vehicle
            created += 1
        else:
            vehicle.owner_name = (row.get("owner_name") or "").strip() or vehicle.owner_name
            vehicle.vehicle_type = (row.get("vehicle_type") or "").strip() or vehicle.vehicle_type
            if tags:
                vehicle.tags = tags
            updated += 1
    await db.flush()
    return {"created": created, "updated": updated, "skipped": skipped, "errors": errors[:100]}


async def tenant_exists(db: AsyncSession, tenant_id: UUID) -> bool:
    return (await db.get(Tenant, tenant_id)) is not None
