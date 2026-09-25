"""Seed demo data: `python scripts/seed.py` (uses ALEMBIC_DATABASE_URL? no —
DATABASE_URL as app_user is fine since seeds run with system context).

Creates:
  - platform super admin  admin@parkvision.dev / Admin1234!
  - tenant 'Demo Parking' (slug demo) with owner demo-owner@parkvision.dev / Demo1234!
  - site HQ, lane In-1, edge gateway GW-01, barrier gate GATE-A
  - 3 registered vehicles + 2 access rules
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from sqlalchemy import select

from app.core import security
from app.db.session import SessionLocal, set_rls_context
from app.models.access import RegisteredVehicle, TenantAccessRule
from app.models.identity import PlatformAdmin, Tenant, TenantUser
from app.models.sites import BarrierGate, EdgeDevice, SiteLane, TenantSite


async def main() -> None:
    async with SessionLocal() as db:
        await db.begin()
        await set_rls_context(db, is_system=True)

        if not (
            await db.execute(select(PlatformAdmin.id).where(PlatformAdmin.email == "admin@parkvision.dev"))
        ).scalar():
            db.add(
                PlatformAdmin(
                    email="admin@parkvision.dev",
                    full_name="Platform Admin",
                    password_hash=security.hash_password("Admin1234!"),
                    role="super_admin",
                    status="active",
                )
            )
            print("created platform admin admin@parkvision.dev / Admin1234!")

        tenant = (await db.execute(select(Tenant).where(Tenant.slug == "demo"))).scalar_one_or_none()
        if tenant is None:
            tenant = Tenant(
                name="Demo Parking",
                slug="demo",
                plan="growth",
                status="active",
                contact_email="demo-owner@parkvision.dev",
                settings={"defaultAccessDecision": "deny"},
            )
            db.add(tenant)
            await db.flush()
            print("created tenant demo")

        if not (
            await db.execute(select(TenantUser.id).where(TenantUser.email == "demo-owner@parkvision.dev"))
        ).scalar():
            db.add(
                TenantUser(
                    tenant_id=tenant.id,
                    email="demo-owner@parkvision.dev",
                    full_name="Demo Owner",
                    password_hash=security.hash_password("Demo1234!"),
                    role="owner",
                    status="active",
                )
            )
            db.add(
                TenantUser(
                    tenant_id=tenant.id,
                    email="demo-operator@parkvision.dev",
                    full_name="Demo Operator",
                    password_hash=security.hash_password("Demo1234!"),
                    role="operator",
                    status="active",
                )
            )
            print("created tenant users / Demo1234!")

        site = (
            await db.execute(select(TenantSite).where(TenantSite.tenant_id == tenant.id))
        ).scalar_one_or_none()
        if site is None:
            site = TenantSite(tenant_id=tenant.id, name="HQ Garage", code="hq", timezone="Asia/Saigon")
            db.add(site)
            await db.flush()
            lane = SiteLane(tenant_id=tenant.id, site_id=site.id, name="In-1", direction="in", kind="vehicle")
            device = EdgeDevice(
                tenant_id=tenant.id,
                site_id=site.id,
                name="GW-01",
                kind="gateway",
                model="Jetson Orin Nano",
                serial="JETSON-0001",
                status="online",
            )
            db.add_all([lane, device])
            await db.flush()
            db.add(
                BarrierGate(
                    tenant_id=tenant.id,
                    site_id=site.id,
                    lane_id=lane.id,
                    edge_device_id=device.id,
                    name="Main Barrier",
                    controller_kind="barrier",
                    state="closed",
                    position=0,
                    mqtt_gate_key="gate-a",
                )
            )
            print("created site HQ + lane + gateway + gate gate-a")

        if not (
            await db.execute(select(RegisteredVehicle.id).where(RegisteredVehicle.tenant_id == tenant.id))
        ).scalar():
            db.add_all(
                [
                    RegisteredVehicle(
                        tenant_id=tenant.id,
                        plate="29A12345",
                        owner_name="Alice Nguyen",
                        vehicle_kind="car",
                        tags=["staff"],
                    ),
                    RegisteredVehicle(
                        tenant_id=tenant.id,
                        plate="51G67890",
                        owner_name="Bob Tran",
                        vehicle_kind="car",
                        tags=["visitor"],
                    ),
                    RegisteredVehicle(
                        tenant_id=tenant.id,
                        plate="30X99999",
                        owner_name="Eve Pham",
                        vehicle_kind="motorbike",
                        status="suspended",
                    ),
                ]
            )

        if not (
            await db.execute(select(TenantAccessRule.id).where(TenantAccessRule.tenant_id == tenant.id))
        ).scalar():
            db.add_all(
                [
                    TenantAccessRule(
                        tenant_id=tenant.id,
                        name="Staff all-day",
                        priority=10,
                        effect="allow",
                        match={"tags": ["staff"]},
                        schedule={},
                    ),
                    TenantAccessRule(
                        tenant_id=tenant.id,
                        name="Visitors work hours",
                        priority=20,
                        effect="allow",
                        match={"tags": ["visitor"]},
                        schedule={"daysOfWeek": [1, 2, 3, 4, 5], "startTime": "08:00", "endTime": "18:00"},
                    ),
                ]
            )
            print("created vehicles + rules")

        await db.commit()
        print("seed complete")


if __name__ == "__main__":
    asyncio.run(main())
