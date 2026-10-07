"""Driver-facing schemas: mobile app auth, profile, vehicles, sites, sessions."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import EmailStr, Field

from app.schemas.common import CamelModel
from app.schemas.resources import PublicMapLevelOut


class DriverRegisterIn(CamelModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    full_name: str = Field(min_length=1, max_length=200)
    phone: str | None = None


class DriverLoginIn(CamelModel):
    email: EmailStr
    password: str


class DriverRefreshIn(CamelModel):
    refresh_token: str


class DriverTokenOut(CamelModel):
    access_token: str
    refresh_token: str
    expires_in: int
    token_type: str = "bearer"


class DriverOut(CamelModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    phone: str | None
    avatar_url: str | None
    status: str
    created_at: datetime


class DriverUpdateIn(CamelModel):
    full_name: str | None = Field(None, min_length=1, max_length=200)
    phone: str | None = Field(None, max_length=50)
    avatar_url: str | None = None


class DriverPasswordIn(CamelModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=200)


class DriverVehicleIn(CamelModel):
    plate_number: str = Field(min_length=4, max_length=20)
    label: str | None = Field(None, max_length=120)
    vehicle_type: Literal["car", "motorcycle"] = "car"
    is_primary: bool = False


class DriverVehicleOut(CamelModel):
    id: uuid.UUID
    plate_number: str
    plate_normalized: str
    label: str | None
    vehicle_type: str
    is_primary: bool
    created_at: datetime


class SitePricing(CamelModel):
    hourly_from: int | None = None
    daily_from: int | None = None
    overnight_from: int | None = None
    monthly_from: int | None = None


class SitePublicProfile(CamelModel):
    listed: bool = True
    description: str | None = None
    image_url: str | None = None
    parking_type: Literal["indoor", "outdoor", "covered"] | None = None
    facilities: list[str] = []
    pricing: SitePricing = Field(default_factory=SitePricing)


CapacityStatus = Literal["AVAILABLE", "LIMITED", "ALMOST_FULL", "FULL"]


class PublicSiteOut(CamelModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    tenant_slug: str
    name: str
    address: str | None
    city: str | None
    latitude: float | None
    longitude: float | None
    distance_meters: int | None
    capacity: int
    occupied: int
    available: int
    capacity_status: CapacityStatus
    operating_hours: dict
    contact_phone: str | None
    profile: SitePublicProfile
    is_favorite: bool = False
    updated_at: datetime


class PublicSiteDetailOut(PublicSiteOut):
    levels: list[PublicMapLevelOut] = []


class DriverSessionOut(CamelModel):
    id: str
    site_id: uuid.UUID
    site_name: str
    tenant_slug: str
    plate_number: str
    entered_at: datetime
    exited_at: datetime | None
    duration_seconds: int
    status: Literal["PARKED", "COMPLETED"]
    entry_image_url: str | None = None
    confidence: float | None = None
    level_name: str | None = None
    zone_name: str | None = None
