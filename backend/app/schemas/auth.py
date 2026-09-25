"""Auth-related request/response schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import EmailStr, Field, IPvAnyAddress

from app.schemas.common import CamelModel


class LoginRequest(CamelModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)
    kind: str = "tenant_user"  # tenant_user | platform_admin
    device_info: dict | None = None


class LoginResponse(CamelModel):
    status: str  # "authenticated" | "mfa_required"
    user: "UserProfile | None" = None
    mfa_required: bool = False
    expires_in: int | None = None


class MfaVerifyRequest(CamelModel):
    code: str = Field(min_length=6, max_length=64)  # TOTP or backup code


class MfaSetupResponse(CamelModel):
    secret: str  # base32 — shown once for manual entry
    otpauth_uri: str


class MfaConfirmRequest(CamelModel):
    code: str = Field(min_length=6, max_length=10)


class MfaConfirmResponse(CamelModel):
    backup_codes: list[str]


class UserProfile(CamelModel):
    id: UUID
    kind: str
    email: str
    full_name: str
    role: str
    tenant_id: UUID | None = None
    mfa_enabled: bool = False
    impersonating: bool = False


class RefreshResponse(CamelModel):
    expires_in: int


class PasswordForgotRequest(CamelModel):
    email: EmailStr
    kind: str = "tenant_user"


class PasswordResetRequest(CamelModel):
    token: str
    new_password: str = Field(min_length=12, max_length=256)


class InviteAcceptRequest(CamelModel):
    token: str
    password: str = Field(min_length=12, max_length=256)
    full_name: str = Field(min_length=1, max_length=200)


class SessionInfo(CamelModel):
    id: UUID
    user_kind: str
    user_id: UUID
    tenant_id: UUID | None = None
    device_info: dict = {}
    ip_address: IPvAnyAddress | None = None
    user_agent: str | None = None
    mfa_verified: bool = False
    created_at: datetime
    expires_at: datetime
    last_used_at: datetime | None = None
    revoked_at: datetime | None = None


class ChangePasswordRequest(CamelModel):
    current_password: str
    new_password: str = Field(min_length=12, max_length=256)
