"""Driver (mobile end-user) account service: register/login/profile/vehicles/favorites.

Sessions reuse auth_service's UserSession machinery with user_type='driver';
all queries run under platform_session — driver tables are platform-scoped
(no tenant_id, no RLS).
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError

from app.core.enums import AccountStatus, ActorType
from app.core.errors import account_locked, conflict, invalid_credentials, not_found
from app.database import platform_session
from app.models import DriverFavorite, DriverUser, DriverVehicle, Tenant, TenantSite
from app.security import hash_password, verify_password
from app.services import auth_service
from app.services.auth_service import TokenBundle
from app.services.event_service import normalize_plate


def _token_out(bundle: TokenBundle) -> dict:
    return {
        "access_token": bundle.access_token,
        "refresh_token": bundle.refresh_token,
        "expires_in": bundle.expires_in,
        "token_type": "bearer",
    }


async def register(email: str, password: str, full_name: str, phone: str | None) -> DriverUser:
    async with platform_session() as db:
        user = DriverUser(
            email=email.lower(),
            password_hash=hash_password(password),
            full_name=full_name,
            phone=phone,
            status=str(AccountStatus.ACTIVE),
        )
        db.add(user)
        try:
            await db.flush()
        except IntegrityError:
            raise conflict("Email already registered") from None
        return user


async def login(email: str, password: str, ip: str | None, user_agent: str | None) -> TokenBundle:
    async with platform_session() as db:
        user = (
            await db.execute(select(DriverUser).where(DriverUser.email == email.lower()))
        ).scalar_one_or_none()

        now = datetime.now(timezone.utc)
        if user is not None and user.locked_until is not None and user.locked_until > now:
            await auth_service._audit_login(
                db,
                action="auth.login_failed",
                user=user,
                user_type=str(ActorType.DRIVER),
                tenant_id=None,
                email=email,
                ip=ip,
                details={"reason": "account_locked"},
            )
            await db.commit()
            raise account_locked() from None

        if user is None or not verify_password(password, user.password_hash):
            await auth_service._fail_login(
                db, user=user, user_type=str(ActorType.DRIVER), tenant_id=None, email=email, ip=ip
            )
            raise invalid_credentials() from None
        if user.status != AccountStatus.ACTIVE:
            await auth_service._fail_login(
                db, user=user, user_type=str(ActorType.DRIVER), tenant_id=None, email=email, ip=ip
            )
            raise invalid_credentials() from None

        user.failed_login_attempts = 0
        user.locked_until = None
        sess = await auth_service._create_session(
            db,
            user_id=user.id,
            user_type=str(ActorType.DRIVER),
            tenant_id=None,
            ip=ip,
            user_agent=user_agent,
            mfa_verified=False,
        )
        user.last_login_at = now
        await auth_service._audit_login(
            db,
            action="auth.login_success",
            user=user,
            user_type=str(ActorType.DRIVER),
            tenant_id=None,
            email=email,
            ip=ip,
        )
        return auth_service._bundle(
            sess, user.id, str(ActorType.DRIVER), None, None, False
        )


async def get_me(driver_id: uuid.UUID) -> DriverUser:
    async with platform_session() as db:
        user = (await db.execute(select(DriverUser).where(DriverUser.id == driver_id))).scalar_one_or_none()
        if user is None:
            raise not_found("driver", driver_id) from None
        return user


async def update_me(
    driver_id: uuid.UUID, *, full_name=None, phone=None, avatar_url=None
) -> DriverUser:
    async with platform_session() as db:
        user = (await db.execute(select(DriverUser).where(DriverUser.id == driver_id))).scalar_one_or_none()
        if user is None:
            raise not_found("driver", driver_id) from None
        if full_name is not None:
            user.full_name = full_name
        if phone is not None:
            user.phone = phone
        if avatar_url is not None:
            user.avatar_url = avatar_url
        await db.flush()
        return user


# ---------- vehicles ----------


async def _clear_other_primaries(db, driver_id: uuid.UUID, keep_id: uuid.UUID | None) -> None:
    q = update(DriverVehicle).where(
        DriverVehicle.driver_id == driver_id, DriverVehicle.is_primary.is_(True)
    )
    if keep_id is not None:
        q = q.where(DriverVehicle.id != keep_id)
    await db.execute(q)


async def list_vehicles(driver_id: uuid.UUID) -> list[DriverVehicle]:
    async with platform_session() as db:
        rows = (
            (
                await db.execute(
                    select(DriverVehicle)
                    .where(DriverVehicle.driver_id == driver_id)
                    .order_by(DriverVehicle.is_primary.desc(), DriverVehicle.created_at)
                )
            )
            .scalars()
            .all()
        )
    return list(rows)


async def add_vehicle(
    driver_id: uuid.UUID, *, plate_number: str, label: str | None, vehicle_type: str, is_primary: bool
) -> DriverVehicle:
    async with platform_session() as db:
        normalized = normalize_plate(plate_number)
        has_any = (
            await db.execute(
                select(DriverVehicle.id).where(DriverVehicle.driver_id == driver_id).limit(1)
            )
        ).scalar_one_or_none()
        v = DriverVehicle(
            driver_id=driver_id,
            plate_number=plate_number.strip().upper(),
            plate_normalized=normalized,
            label=label,
            vehicle_type=vehicle_type,
            is_primary=is_primary or has_any is None,
        )
        db.add(v)
        try:
            await db.flush()
        except IntegrityError:
            raise conflict("Plate already added") from None
        if v.is_primary:
            await _clear_other_primaries(db, driver_id, v.id)
        return v


async def update_vehicle(
    driver_id: uuid.UUID, vehicle_id: uuid.UUID, *, plate_number: str, label, vehicle_type, is_primary: bool
) -> DriverVehicle:
    async with platform_session() as db:
        v = (await db.execute(select(DriverVehicle).where(DriverVehicle.id == vehicle_id))).scalar_one_or_none()
        if v is None or v.driver_id != driver_id:
            raise not_found("vehicle", vehicle_id) from None
        v.plate_number = plate_number.strip().upper()
        v.plate_normalized = normalize_plate(plate_number)
        v.label = label
        v.vehicle_type = vehicle_type
        if is_primary and not v.is_primary:
            v.is_primary = True
            await _clear_other_primaries(db, driver_id, v.id)
        elif not is_primary:
            v.is_primary = False
        try:
            await db.flush()
        except IntegrityError:
            raise conflict("Plate already added") from None
        return v


async def delete_vehicle(driver_id: uuid.UUID, vehicle_id: uuid.UUID) -> None:
    async with platform_session() as db:
        v = (await db.execute(select(DriverVehicle).where(DriverVehicle.id == vehicle_id))).scalar_one_or_none()
        if v is None or v.driver_id != driver_id:
            raise not_found("vehicle", vehicle_id) from None
        was_primary = v.is_primary
        await db.execute(delete(DriverVehicle).where(DriverVehicle.id == vehicle_id))
        if was_primary:
            oldest = (
                await db.execute(
                    select(DriverVehicle)
                    .where(DriverVehicle.driver_id == driver_id)
                    .order_by(DriverVehicle.created_at)
                    .limit(1)
                )
            ).scalar_one_or_none()
            if oldest is not None:
                oldest.is_primary = True


# ---------- favorites ----------


async def list_favorite_site_ids(db, driver_id: uuid.UUID) -> set[uuid.UUID]:
    rows = (
        await db.execute(
            select(DriverFavorite.site_id).where(DriverFavorite.driver_id == driver_id)
        )
    ).scalars().all()
    return set(rows)


async def add_favorite(driver_id: uuid.UUID, site_id: uuid.UUID) -> None:
    async with platform_session() as db:
        site = (
            await db.execute(
                select(TenantSite, Tenant)
                .join(Tenant, Tenant.id == TenantSite.tenant_id)
                .where(TenantSite.id == site_id)
            )
        ).one_or_none()
        if site is None:
            raise not_found("site", site_id) from None
        s, t = site
        if s.status != "active" or t.status != "active" or (s.public_profile or {}).get("listed") is False:
            raise not_found("site", site_id) from None
        exists = (
            await db.execute(
                select(DriverFavorite).where(
                    DriverFavorite.driver_id == driver_id, DriverFavorite.site_id == site_id
                )
            )
        ).scalar_one_or_none()
        if exists is None:
            db.add(DriverFavorite(driver_id=driver_id, site_id=site_id))
            await db.flush()


async def remove_favorite(driver_id: uuid.UUID, site_id: uuid.UUID) -> None:
    async with platform_session() as db:
        await db.execute(
            delete(DriverFavorite).where(
                DriverFavorite.driver_id == driver_id, DriverFavorite.site_id == site_id
            )
        )
