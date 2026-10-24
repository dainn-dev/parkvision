"""Seed QA test accounts: tenant viewer, MFA-enabled tenant admin, drivers.

Companion to scripts.seed (run that first — it creates the demo tenant,
owner@demo.example.com, site/gate/vehicles). This script is idempotent:
every account is get-or-create, existing rows are never overwritten.

Run: `python -m scripts.seed_test_accounts` (MIGRATION_DATABASE_URL — owner
role, bypasses RLS).

Created accounts (fixed credentials for manual/API test execution):
  viewer@demo.example.com    / DemoViewer!123   (role=viewer, no MFA)
  mfa-admin@demo.example.com / DemoMfa!123      (role=admin, MFA ON)
      TOTP secret: JBSWY3DPEHPK3PXP (pyotp.TOTP(secret).now())
      Backup codes: AAAA1111 BBBB2222 CCCC3333 DDDD4444
  driver1@demo.example.com   / DemoDriver!123   (vehicle 30E-892.41, primary)
  driver2@demo.example.com   / DemoDriver!123   (vehicle 29A-123.45; share
      of 30E-892.41 for today, granted by driver1)
"""

import asyncio
import datetime as dt
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

sys.path.insert(0, ".")

from app.config import settings
from app.models import DriverUser, DriverVehicle, DriverVehicleShare, Tenant, TenantUser
from app.security import encrypt_secret, hash_backup_code, hash_password
from app.services.event_service import normalize_plate

MFA_TOTP_SECRET = "JBSWY3DPEHPK3PXP"
MFA_BACKUP_CODES = ["AAAA1111", "BBBB2222", "CCCC3333", "DDDD4444"]


async def upsert_tenant_user(db: AsyncSession, tenant_id, email: str, password: str,
                             full_name: str, role: str, mfa: bool = False) -> TenantUser:
    user = (await db.execute(select(TenantUser).where(TenantUser.email == email))).scalar_one_or_none()
    if user is not None:
        print(f"exists : tenant user {email} (role={user.role})")
        return user
    user = TenantUser(
        tenant_id=tenant_id,
        email=email,
        password_hash=hash_password(password),
        full_name=full_name,
        role=role,
        status="active",
        mfa_enabled=mfa,
    )
    if mfa:
        user.mfa_secret = encrypt_secret(MFA_TOTP_SECRET)
        user.mfa_backup_hashes = [hash_backup_code(c) for c in MFA_BACKUP_CODES]
    db.add(user)
    print(f"created: tenant user {email} / {password} (role={role}, mfa={mfa})")
    return user


async def upsert_driver(db: AsyncSession, email: str, full_name: str) -> DriverUser:
    driver = (await db.execute(select(DriverUser).where(DriverUser.email == email))).scalar_one_or_none()
    if driver is not None:
        print(f"exists : driver {email}")
        return driver
    driver = DriverUser(
        email=email,
        password_hash=hash_password("DemoDriver!123"),
        full_name=full_name,
        status="active",
    )
    db.add(driver)
    await db.flush()
    print(f"created: driver {email} / DemoDriver!123")
    return driver


async def upsert_vehicle(db: AsyncSession, driver_id, plate: str, label: str,
                         vehicle_type: str = "car", primary: bool = False) -> DriverVehicle:
    norm = normalize_plate(plate)
    vehicle = (await db.execute(
        select(DriverVehicle).where(DriverVehicle.plate_normalized == norm)
    )).scalar_one_or_none()
    if vehicle is not None:
        print(f"exists : vehicle {plate} (owner={vehicle.driver_id})")
        return vehicle
    vehicle = DriverVehicle(
        driver_id=driver_id,
        plate_number=plate,
        plate_normalized=norm,
        label=label,
        vehicle_type=vehicle_type,
        is_primary=primary,
    )
    db.add(vehicle)
    print(f"created: vehicle {plate} ({norm}) for {driver_id}")
    return vehicle


async def main() -> None:
    engine = create_async_engine(settings.migration_database_url)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as db:
        tenant = (await db.execute(select(Tenant).where(Tenant.slug == "demo"))).scalar_one_or_none()
        if tenant is None:
            raise SystemExit("demo tenant missing — run `python -m scripts.seed` first")

        await upsert_tenant_user(db, tenant.id, "viewer@demo.example.com", "DemoViewer!123",
                                 "QA Viewer", role="viewer")
        await upsert_tenant_user(db, tenant.id, "mfa-admin@demo.example.com", "DemoMfa!123",
                                 "QA MFA Admin", role="admin", mfa=True)

        driver1 = await upsert_driver(db, "driver1@demo.example.com", "QA Driver One")
        driver2 = await upsert_driver(db, "driver2@demo.example.com", "QA Driver Two")
        await db.flush()

        v1 = await upsert_vehicle(db, driver1.id, "30E-892.41", "QA primary car", primary=True)
        await upsert_vehicle(db, driver2.id, "29A-123.45", "QA second car")

        today = dt.date.today()
        share = (await db.execute(
            select(DriverVehicleShare).where(
                DriverVehicleShare.vehicle_id == v1.id,
                DriverVehicleShare.shared_with_id == driver2.id,
                DriverVehicleShare.share_date == today,
            )
        )).scalar_one_or_none()
        if share is None:
            db.add(DriverVehicleShare(vehicle_id=v1.id, shared_with_id=driver2.id, share_date=today))
            print(f"created: share of {v1.plate_number} to driver2 for {today}")
        else:
            print(f"exists : share of {v1.plate_number} to driver2 for {today}")

        await db.commit()
        print("\nQA accounts ready. TOTP secret for mfa-admin:", MFA_TOTP_SECRET)
        print("Backup codes:", ", ".join(MFA_BACKUP_CODES))


if __name__ == "__main__":
    asyncio.run(main())
