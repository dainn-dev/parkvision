"""Authentication primitives: JWTs, opaque refresh tokens, passwords, TOTP."""

import hashlib
import hmac
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
import pyotp
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher

from app.config import get_settings

settings = get_settings()

_password_hash = PasswordHash((Argon2Hasher(),))

ACCESS_COOKIE = "pv_at"
REFRESH_COOKIE = "pv_rt"
CSRF_COOKIE = "pv_csrf"
MFA_COOKIE = "pv_mfa"

TOKEN_TYPE_ACCESS = "access"
TOKEN_TYPE_MFA_TICKET = "mfa_ticket"

SCOPE_TENANT = "tenant"
SCOPE_PLATFORM = "platform"


# ---------------------------------------------------------------- passwords


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return _password_hash.verify(password, hashed)
    except Exception:
        return False


# ---------------------------------------------------------------- JWTs


@dataclass
class TokenClaims:
    subject_id: uuid.UUID
    scope: str  # "tenant" | "platform" | "mfa"
    token_type: str
    tenant_id: uuid.UUID | None = None
    role: str | None = None
    session_id: uuid.UUID | None = None
    impersonating: bool = False
    mfa_ok: bool = False


def _encode(claims: dict, ttl_seconds: int) -> str:
    now = datetime.now(UTC)
    payload = {
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl_seconds)).timestamp()),
        "jti": uuid.uuid4().hex,
        **claims,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def mint_access_token(
    subject_id: uuid.UUID,
    scope: str,
    *,
    tenant_id: uuid.UUID | None = None,
    role: str | None = None,
    session_id: uuid.UUID | None = None,
    impersonating: bool = False,
) -> str:
    return _encode(
        {
            "sub": str(subject_id),
            "scope": scope,
            "type": TOKEN_TYPE_ACCESS,
            "tid": str(tenant_id) if tenant_id else None,
            "role": role,
            "sid": str(session_id) if session_id else None,
            "imp": impersonating,
        },
        settings.access_token_ttl_seconds,
    )


def mint_mfa_ticket(subject_id: uuid.UUID, scope: str, tenant_id: uuid.UUID | None = None) -> str:
    return _encode(
        {
            "sub": str(subject_id),
            "scope": scope,
            "type": TOKEN_TYPE_MFA_TICKET,
            "tid": str(tenant_id) if tenant_id else None,
        },
        settings.mfa_ticket_ttl_seconds,
    )


def decode_token(token: str, *, expected_type: str | None = None) -> TokenClaims:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise ValueError("invalid token") from exc
    if expected_type and payload.get("type") != expected_type:
        raise ValueError("wrong token type")
    tid = payload.get("tid")
    sid = payload.get("sid")
    return TokenClaims(
        subject_id=uuid.UUID(payload["sub"]),
        scope=payload["scope"],
        token_type=payload["type"],
        tenant_id=uuid.UUID(tid) if tid else None,
        role=payload.get("role"),
        session_id=uuid.UUID(sid) if sid else None,
        impersonating=bool(payload.get("imp")),
    )


# ---------------------------------------------------------------- refresh tokens
# Cookie value: "{session_id}.{secret}". The DB stores an HMAC of the secret so
# leaked rows can't mint new access tokens. Rotation: every use revokes the row
# and issues a successor in the same family; presenting a revoked token kills
# the whole family (reuse detection).


def mint_refresh_secret() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_secret(secret: str) -> str:
    return hmac.new(settings.jwt_secret.encode(), secret.encode(), hashlib.sha256).hexdigest()


def new_csrf_token() -> str:
    return secrets.token_hex(32)


def hash_token(raw: str) -> str:
    """SHA-256 for one-shot tokens (invites, password resets)."""
    return hashlib.sha256(raw.encode()).hexdigest()


# ---------------------------------------------------------------- TOTP MFA


def new_totp_secret() -> str:
    return pyotp.random_base32()


def totp_uri(secret: str, email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name="ParkVision")


def verify_totp(secret: str, code: str) -> bool:
    return pyotp.TOTP(secret).verify(code.strip().replace(" ", ""), valid_window=1)


def new_backup_codes(count: int = 10) -> list[str]:
    return [f"{secrets.token_hex(4)}-{secrets.token_hex(4)}" for _ in range(count)]


def hash_backup_code(code: str) -> str:
    return hashlib.sha256(code.strip().lower().encode()).hexdigest()
