"""Bootstrap + demo seed: platform admin, demo tenant/site/gate/vehicles.

Run after migrations:  ``python -m scripts.seed``
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select, text

from app.core.config import get_settings
from app.core.security import hash_password
from app.db.session import db_session
from app.models import (
    BarrierGate,
    EdgeDevice,
    PlatformAdmin,
    RegisteredVehicle,
    SiteLane,
    Tenant,
    TenantSite,
    TenantUser,
)
from app.utils.misc import normalize_plate


async def main() -> None:
    s = get_settings()
    async with db_session() as session:
        await session.execute(text("SELECT set_config('app.platform_admin','on',true)"))

        admin = (
            await session.execute(
                select(PlatformAdmin).where(PlatformAdmin.email == s.bootstrap_admin_email)
            )
        ).scalar_one_or_none()
        if admin is None:
            admin = PlatformAdmin(
                email=s.bootstrap_admin_email,
                password_hash=hash_password(s.bootstrap_admin_password),
                display_name="Platform Admin",
                role="superadmin",
            )
            session.add(admin)
            print(f"created platform admin {admin.email}")

        tenant = (
            await session.execute(select(Tenant).where(Tenant.slug == "demo"))
        ).scalar_one_or_none()
        if tenant is None:
            tenant = Tenant(
                name="Demo Parking Co", slug="demo", status="active",
                plan="growth", contact_email="ops@demo.parkvision.dev",
            )
            session.add(tenant)
            await session.flush()
            print(f"created tenant {tenant.slug} ({tenant.id})")

        owner = (
            await session.execute(
                select(TenantUser).where(
                    TenantUser.tenant_id == tenant.id,
                    TenantUser.email == "owner@demo.parkvision.dev",
                )
            )
        ).scalar_one_or_none()
        if owner is None:
            owner = TenantUser(
                tenant_id=tenant.id, email="owner@demo.parkvision.dev",
                password_hash=hash_password("Owner!234"),
                full_name="Demo Owner", role="owner", status="active",
            )
            session.add(owner)
            print("created tenant owner owner@demo.parkvision.dev / Owner!234")

        site = (
            await session.execute(
                select(TenantSite).where(
                    TenantSite.tenant_id == tenant.id, TenantSite.name == "HQ Garage"
                )
            )
        ).scalar_one_or_none()
        if site is None:
            site = TenantSite(tenant_id=tenant.id, name="HQ Garage", timezone="Asia/Ho_Chi_Minh")
            session.add(site)
            await session.flush()

        lane = (
            await session.execute(
                select(SiteLane).where(SiteLane.site_id == site.id, SiteLane.name == "Entry 1")
            )
        ).scalar_one_or_none()
        if lane is None:
            lane = SiteLane(tenant_id=tenant.id, site_id=site.id, name="Entry 1", direction="entry")
            session.add(lane)
            await session.flush()

        device = (
            await session.execute(
                select(EdgeDevice).where(EdgeDevice.device_key == "edge-demo-1")
            )
        ).scalar_one_or_none()
        if device is None:
            device = EdgeDevice(
                tenant_id=tenant.id, site_id=site.id, name="Edge GW 1",
                device_key="edge-demo-1", status="online",
            )
            session.add(device)
            await session.flush()

        gate = (
            await session.execute(
                select(BarrierGate).where(
                    BarrierGate.tenant_id == tenant.id, BarrierGate.name == "Gate A"
                )
            )
        ).scalar_one_or_none()
        if gate is None:
            gate = BarrierGate(
                tenant_id=tenant.id, site_id=site.id, lane_id=lane.id,
                edge_device_id=device.id, name="Gate A", state="closed",
            )
            session.add(gate)

        for plate in ("30A-12345", "51F-67890", "29X-99999"):
            norm = normalize_plate(plate)
            exists = (
                await session.execute(
                    select(RegisteredVehicle).where(
                        RegisteredVehicle.tenant_id == tenant.id,
                        RegisteredVehicle.normalized_plate == norm,
                    )
                )
            ).scalar_one_or_none()
            if exists is None:
                session.add(RegisteredVehicle(
                    tenant_id=tenant.id, plate_number=plate, normalized_plate=norm,
                    owner_name=f"Owner {plate}", vehicle_type="car",
                ))
        print("seed complete")


if __name__ == "__main__":
    asyncio.run(main())
