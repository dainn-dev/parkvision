"""Driver-facing schemas: mobile app auth, profile, vehicles, sites, sessions."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import EmailStr, Field

from app.schemas.common import CamelModel
from app.schemas.resources import (  # noqa: F401  (re-exported for driver API consumers)
    PublicMapLevelOut,
    SitePricing,
    SitePublicProfile,
)


class DriverRegisterIn(CamelModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    full_name: str = Field(min_length=1, max_length=200)
    phone: str | None = None


class DriverLoginIn(CamelModel):
    email: EmailStr
    password: str


class DriverRefreshIn(CamelModel):
    # Optional: cookie-based clients send the HttpOnly vm_refresh cookie instead.
    refresh_token: str | None = None


class DriverTokenOut(CamelModel):
    # Omitted (null) in cookie mode: the tokens travel as HttpOnly cookies
    # so page scripts cannot read them from the response body.
    access_token: str | None = None
    refresh_token: str | None = None
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
    supports_membership: bool = False
    membership_price_from: int | None = None
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
    # Estimated VND fee from the site's pricing rules; None = not estimable.
    fee_vnd: int | None = None


# ---------- memberships ----------


class PublicPlanOut(CamelModel):
    id: uuid.UUID
    name: str
    description: str | None
    price_vnd: int
    duration_days: int
    perks: list[str]
    badge: str | None


class DriverMembershipIn(CamelModel):
    plan_id: uuid.UUID
    vehicle_id: uuid.UUID


MembershipStatus = Literal["pending", "active", "rejected", "cancelled", "expired", "revoked"]


class DriverMembershipOut(CamelModel):
    id: uuid.UUID
    plan: PublicPlanOut
    site_id: uuid.UUID
    site_name: str
    tenant_slug: str
    plate_number: str
    status: MembershipStatus
    starts_at: datetime | None
    ends_at: datetime | None
    created_at: datetime


# ---------- payments ----------


class PaymentCreateIn(CamelModel):
    """Create a payment for a pending membership, a parking session, or a
    wallet top-up. Amount is server-computed except kind='topup' where the
    driver chooses it (bounded server-side)."""

    kind: Literal["membership", "session", "topup"]
    membership_id: uuid.UUID | None = None
    session_id: str | None = None  # entry access_event id
    method: Literal["momo", "wallet"] = "momo"
    amount_vnd: int | None = None  # kind='topup' only


PaymentStatus = Literal["created", "paid", "failed", "cancelled", "expired", "refunded"]


class PaymentOut(CamelModel):
    id: uuid.UUID
    kind: Literal["membership", "session", "topup"]
    membership_id: uuid.UUID | None
    session_id: str | None
    site_id: uuid.UUID | None
    site_name: str | None
    plate_number: str | None
    amount_vnd: int
    currency: str
    provider: str
    method: str
    status: PaymentStatus
    pay_url: str | None
    paid_at: datetime | None
    refunded_at: datetime | None
    expires_at: datetime | None
    created_at: datetime


class WalletTransactionOut(CamelModel):
    id: uuid.UUID
    kind: str  # topup_credit | spend_debit | refund_credit | refund_debit
    amount_vnd: int
    balance_after_vnd: int
    payment_id: uuid.UUID | None
    note: str
    created_at: datetime


class WalletOut(CamelModel):
    balance_vnd: int
    transactions: list[WalletTransactionOut]


class WsTicketOut(CamelModel):
    """Short-lived opaque ticket for WS auth (replaces JWT in query string)."""
    ticket: str
    expires_in: int
