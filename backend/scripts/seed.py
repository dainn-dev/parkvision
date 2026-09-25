"""Seed script: platform admin + demo tenant/site/gate/vehicles.

Run: `python -m scripts.seed` (uses MIGRATION_DATABASE_URL — the owner role,
which bypasses RLS by ownership).
"""

import asyncio
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

sys.path.insert(0, ".")

from app.config import settings
from app.models import (
    BarrierGate,
    EdgeDevice,
    PlatformAdmin,
    RegisteredVehicle,
    Tenant,
    TenantSite,
    TenantUser,
)
from app.security import hash_password
from app.services.event_service import normalize_plate


async def main() -> None:
    engine = create_async_engine(settings.migration_database_url)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as db:
        admin = (
            await db.execute(
                select(PlatformAdmin).where(PlatformAdmin.email == settings.seed_platform_admin_email)
            )
        ).scalar_one_or_none()
        if admin is None:
            admin = PlatformAdmin(
                email=settings.seed_platform_admin_email,
                password_hash=hash_password(settings.seed_platform_admin_password),
                full_name="Platform Administrator",
                role="super_admin",
                status="active",
            )
            db.add(admin)
            print(f"platform admin: {settings.seed_platform_admin_email}")

        tenant = (await db.execute(select(Tenant).where(Tenant.slug == "demo"))).scalar_one_or_none()
        if tenant is None:
            tenant = Tenant(
                name="Demo Parking Co",
                slug="demo",
                plan_code="pro",
                status="active",
                contact_email="ops@demo.example.com",
            )
            db.add(tenant)
            await db.flush()

        owner = (
            await db.execute(select(TenantUser).where(TenantUser.email == "owner@demo.example.com"))
        ).scalar_one_or_none()
        if owner is None:
            owner = TenantUser(
                tenant_id=tenant.id,
                email="owner@demo.example.com",
                password_hash=hash_password("DemoOwner!123"),
                full_name="Demo Owner",
                role="owner",
                status="active",
            )
            db.add(owner)
            print("tenant user: owner@demo.example.com / DemoOwner!123")

        site = (
            await db.execute(
                select(TenantSite).where(TenantSite.tenant_id == tenant.id, TenantSite.name == "HQ Garage")
            )
        ).scalar_one_or_none()
        if site is None:
            site = TenantSite(
                tenant_id=tenant.id,
                name="HQ Garage",
                code="HQ-G01",
                address="1 Demo St",
                city="Ho Chi Minh City",
                latitude=10.7769,
                longitude=106.7009,
                capacity=240,
                current_occupancy=87,
                operating_hours={"mon_fri": "06:00-22:00", "weekend": "08:00-20:00"},
                overall_health="healthy",
                contact_phone="+84 28 0000 0000",
                manager_name="Minh Tran",
                timezone="UTC",
            )
            db.add(site)
            await db.flush()

        device = (
            await db.execute(select(EdgeDevice).where(EdgeDevice.device_key == "edge-demo-01"))
        ).scalar_one_or_none()
        if device is None:
            device = EdgeDevice(
                tenant_id=tenant.id,
                site_id=site.id,
                name="Edge Gateway 01",
                device_key="edge-demo-01",
                device_serial="SN-DEMO-0001",
                hardware_model="Pi-Barrier-X2",
                ip_address="10.10.0.21",
                mqtt_client_id="edge-demo-01",
                cpu_usage_pct=23.5,
                ram_usage_pct=41.0,
                storage_usage_pct=35.2,
                latency_ms=15,
                status="online",
            )
            db.add(device)
            await db.flush()

        gate = (
            await db.execute(
                select(BarrierGate).where(
                    BarrierGate.tenant_id == tenant.id, BarrierGate.name == "Main Entrance"
                )
            )
        ).scalar_one_or_none()
        if gate is None:
            gate = BarrierGate(
                tenant_id=tenant.id,
                site_id=site.id,
                edge_device_id=device.id,
                name="Main Entrance",
                code="GATE-01",
                model_type="barrier-arm-4m",
                status="closed",
                health="healthy",
                arm_angle_deg=0,
                relay_state="normal",
                loop_detector_active=False,
                motor_temperature_c=38.5,
                ups_battery_pct=100,
                daily_cycles_count=412,
                total_lifetime_cycles=10234,
            )
            db.add(gate)
            await db.flush()

        for plate, owner_name, tag, department in [
            ("30A-12345", "Alice Nguyen", "staff", "Operations"),
            ("51F-67890", "Bob Tran", "resident", "Tenants"),
            ("99Z-00001", "Eve Blacklist", "blacklist", None),
        ]:
            exists = (
                await db.execute(
                    select(RegisteredVehicle).where(
                        RegisteredVehicle.tenant_id == tenant.id,
                        RegisteredVehicle.plate_normalized == normalize_plate(plate),
                    )
                )
            ).scalar_one_or_none()
            if exists is None:
                db.add(
                    RegisteredVehicle(
                        tenant_id=tenant.id,
                        plate_number=plate,
                        plate_normalized=normalize_plate(plate),
                        owner_name=owner_name,
                        owner_department=department,
                        owner_category=tag,
                        brand="Toyota",
                        model="Vios",
                        color="white",
                        tag=tag,
                    )
                )
        await db.commit()

    print(f"seeded tenant={tenant.slug} ({tenant.id}) site={site.id} " f"gate={gate.id} device={device.id}")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
