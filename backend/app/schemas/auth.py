import uuid
from datetime import datetime

from pydantic import EmailStr, Field

from app.schemas.common import CamelModel


class LoginIn(CamelModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    tenant_slug: str | None = None  # optional disambiguator if email collides


class MfaVerifyIn(CamelModel):
    code: str = Field(min_length=6, max_length=10)
    # Alternatively a backup code is accepted in `code` too.


class MfaSetupOut(CamelModel):
    secret: str
    provisioning_uri: str


class MfaEnableIn(CamelModel):
    code: str = Field(min_length=6, max_length=10)


class MfaEnableOut(CamelModel):
    backup_codes: list[str]


class RefreshIn(CamelModel):
    # body-based refresh for non-browser clients; cookie refresh works without a body
    refresh_token: str | None = None


class UserOut(CamelModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: str
    status: str
    mfa_enabled: bool
    tenant_id: uuid.UUID | None = None
    last_login_at: datetime | None = None


class MeOut(CamelModel):
    user: UserOut
    user_type: str
    tenant_id: uuid.UUID | None = None
    tenant_slug: str | None = None
    mfa_verified: bool
    session_id: uuid.UUID
    csrf_token: str


class RegisterTenantIn(CamelModel):
    tenant_name: str = Field(min_length=2, max_length=200)
    slug: str = Field(min_length=2, max_length=120, pattern=r"^[a-z0-9-]+$")
    plan_code: str = "starter"
    contact_email: EmailStr
    owner_email: EmailStr
    owner_full_name: str = Field(min_length=2, max_length=200)
    owner_password: str = Field(min_length=10, max_length=200)


class RegisterTenantOut(CamelModel):
    tenant_id: uuid.UUID
    owner_user_id: uuid.UUID
    message: str


class SessionOut(CamelModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_type: str
    tenant_id: uuid.UUID | None
    ip: str | None
    user_agent: str | None
    mfa_verified: bool
    created_at: datetime
    last_seen_at: datetime | None
    expires_at: datetime
    revoked_at: datetime | None
    current: bool = False


class ChangePasswordIn(CamelModel):
    current_password: str
    new_password: str = Field(min_length=10, max_length=200)


class ActivateIn(CamelModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=10, max_length=200)
