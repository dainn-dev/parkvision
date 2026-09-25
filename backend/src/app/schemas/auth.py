"""Auth request/response schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import EmailStr, Field

from app.schemas.base import ApiSchema


class LoginRequest(ApiSchema):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)
    scope: str | None = None  # "tenant" | "platform"; auto-detected when omitted


class MfaCompleteRequest(ApiSchema):
    code: str = Field(min_length=4, max_length=40)


class MfaVerifyRequest(ApiSchema):
    code: str = Field(min_length=6, max_length=10)


class MfaEnrollResponse(ApiSchema):
    secret: str
    otpauth_uri: str


class MfaVerifyResponse(ApiSchema):
    enabled: bool
    backup_codes: list[str]


class LoginResponse(ApiSchema):
    mfa_required: bool = False
    access_expires_in: int | None = None
    scope: str | None = None
    subject_id: UUID | None = None
    tenant_id: UUID | None = None
    role: str | None = None
    csrf_token: str | None = None


class MeResponse(ApiSchema):
    subject_id: UUID
    scope: str
    email: str
    full_name: str | None = None
    tenant_id: UUID | None = None
    role: str | None = None
    mfa_enabled: bool = False
    impersonating: bool = False


class SessionView(ApiSchema):
    id: UUID
    subject_type: str
    subject_id: UUID
    tenant_id: UUID | None = None
    user_agent: str | None = None
    ip: str | None = None
    impersonating: bool = False
    created_at: datetime | None = None
    last_seen_at: datetime | None = None
    expires_at: datetime
    revoked_at: datetime | None = None
    current: bool = False


class AcceptInviteRequest(ApiSchema):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=10, max_length=200)
    full_name: str | None = Field(default=None, max_length=200)


class PasswordChangeRequest(ApiSchema):
    current_password: str
    new_password: str = Field(min_length=10, max_length=200)


class PasswordForgotRequest(ApiSchema):
    email: EmailStr


class PasswordResetRequest(ApiSchema):
    token: str = Field(min_length=20, max_length=200)
    new_password: str = Field(min_length=10, max_length=200)
