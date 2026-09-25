import uuid
from datetime import datetime
from typing import Literal

from pydantic import EmailStr, Field, IPvAnyAddress

from app.schemas.common import ApiModel


class RegisterTenantIn(ApiModel):
    tenant_name: str = Field(min_length=2, max_length=200)
    slug: str = Field(min_length=2, max_length=80, pattern=r"^[a-z0-9][a-z0-9-]*$")
    plan: str = "starter"
    owner_email: EmailStr
    owner_password: str = Field(min_length=8, max_length=128)
    owner_name: str = Field(default="", max_length=200)


class LoginIn(ApiModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    kind: Literal["auto", "platform", "tenant"] = "auto"
    tenant_slug: str | None = None


class MfaVerifyIn(ApiModel):
    pending_token: str
    code: str = Field(min_length=6, max_length=10)


class MfaEnrollConfirmIn(ApiModel):
    code: str = Field(min_length=6, max_length=10)


class MfaDisableIn(ApiModel):
    code: str = Field(min_length=6, max_length=10)


class PasswordChangeIn(ApiModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class AcceptInviteIn(ApiModel):
    invite_token: str
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(default="", max_length=200)


class AuthTokensOut(ApiModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105
    expires_in: int


class MfaRequiredOut(ApiModel):
    mfa_required: Literal[True] = True
    pending_token: str


class MfaEnrollOut(ApiModel):
    secret: str
    otpauth_uri: str


class MfaConfirmedOut(ApiModel):
    mfa_enabled: Literal[True] = True
    backup_codes: list[str]


class PrincipalOut(ApiModel):
    user_id: uuid.UUID
    kind: str
    tenant_id: uuid.UUID | None
    role: str
    email: str
    display_name: str
    mfa_enabled: bool


class SessionOut(ApiModel):
    session_id: uuid.UUID
    ip: IPvAnyAddress | None
    user_agent: str
    created_at: datetime
    expires_at: datetime
    current: bool


class InviteUserIn(ApiModel):
    email: EmailStr
    role: Literal["owner", "admin", "operator", "viewer"] = "operator"
    full_name: str = Field(default="", max_length=200)


class UpdateUserIn(ApiModel):
    role: Literal["owner", "admin", "operator", "viewer"] | None = None
    full_name: str | None = None
    status: Literal["invited", "active", "suspended"] | None = None
