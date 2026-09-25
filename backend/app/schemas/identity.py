"""Tenants, users, plans, registrations, flags — platform + tenant identity."""

from datetime import datetime
from uuid import UUID

from pydantic import EmailStr, Field

from app.schemas.common import CamelModel


class TenantCreate(CamelModel):
    name: str = Field(min_length=1, max_length=200)
    slug: str = Field(min_length=2, max_length=80, pattern=r"^[a-z0-9][a-z0-9-]*$")
    plan_code: str = "standard"
    owner_email: EmailStr
    owner_name: str = Field(min_length=1, max_length=200)


class TenantUpdate(CamelModel):
    name: str | None = None
    plan_code: str | None = None
    status: str | None = None
    settings: dict | None = None


class TenantOut(CamelModel):
    id: UUID
    name: str
    slug: str
    plan_code: str
    status: str
    settings: dict
    created_at: datetime
    updated_at: datetime


class TenantUserCreate(CamelModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=200)
    role: str = "viewer"


class TenantUserUpdate(CamelModel):
    full_name: str | None = None
    role: str | None = None
    status: str | None = None


class TenantUserOut(CamelModel):
    id: UUID
    tenant_id: UUID
    email: str
    full_name: str
    role: str
    status: str
    mfa_enabled: bool
    invited_at: datetime | None
    activated_at: datetime | None
    last_login_at: datetime | None
    created_at: datetime


class InviteOut(CamelModel):
    id: UUID
    email: str
    role: str
    status: str
    expires_at: datetime
    created_at: datetime


class PlatformAdminCreate(CamelModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=12, max_length=256)
    role: str = "readonly"


class PlatformAdminUpdate(CamelModel):
    full_name: str | None = None
    role: str | None = None
    status: str | None = None


class PlatformAdminOut(CamelModel):
    id: UUID
    email: str
    full_name: str
    role: str
    status: str
    mfa_enabled: bool
    last_login_at: datetime | None
    created_at: datetime


class PlanOut(CamelModel):
    code: str
    name: str
    description: str | None
    limits: dict
    pricing: dict
    active: bool


class LegalDocOut(CamelModel):
    slug: str
    title: str
    content_md: str
    version: str
    published_at: datetime


class RegistrationCreate(CamelModel):
    company_name: str = Field(min_length=1, max_length=200)
    contact_name: str = Field(min_length=1, max_length=200)
    contact_email: EmailStr
    plan_code: str | None = None
    payload: dict = {}


class RegistrationOut(CamelModel):
    id: UUID
    company_name: str
    contact_name: str
    contact_email: str
    plan_code: str | None
    status: str
    created_at: datetime


class RegistrationReview(CamelModel):
    approve: bool
    note: str | None = None
    plan_code: str | None = None


class FeatureFlagOut(CamelModel):
    id: UUID
    key: str
    description: str | None
    default_enabled: bool
    tenant_overrides: dict
    created_at: datetime
    updated_at: datetime


class FeatureFlagCreate(CamelModel):
    key: str = Field(min_length=1, max_length=120, pattern=r"^[a-z0-9][a-z0-9_.-]*$")
    description: str | None = None
    default_enabled: bool = False


class FeatureFlagUpdate(CamelModel):
    description: str | None = None
    default_enabled: bool | None = None
    tenant_overrides: dict | None = None


class SettingUpsert(CamelModel):
    value: dict


class SettingOut(CamelModel):
    key: str
    value: dict
    updated_at: datetime
