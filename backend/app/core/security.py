"""JWT issue/verify, password hashing, TOTP, opaque tokens, CSRF helpers."""

import base64
import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import jwt
import pyotp
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError

from app.core.config import get_settings
from app.core.errors import unauthorized

_ph = PasswordHasher()

UserKind = Literal["platform", "tenant"]


@dataclass(frozen=True)
class Principal:
    user_id: uuid.UUID
    kind: UserKind
    tenant_id: uuid.UUID | None
    role: str
    session_id: uuid.UUID
    mfa_verified: bool


# ---------- passwords ----------

def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError):
        return False


# ---------- opaque tokens (refresh, invites, backups) ----------

def new_opaque_token() -> str:
    return secrets.token_urlsafe(48)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_backup_codes(n: int = 8) -> list[str]:
    return [secrets.token_hex(4) for _ in range(n)]


# ---------- TOTP ----------

def new_totp_secret() -> str:
    return pyotp.random_base32()


def totp_uri(secret: str, email: str, issuer: str = "ParkVision") -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=issuer)


def verify_totp(secret: str, code: str) -> bool:
    return pyotp.TOTP(secret).verify(code.strip().replace(" ", ""), valid_window=1)


# ---------- JWT ----------

def _encode(claims: dict[str, Any], ttl: int) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "iss": "parkvision",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl)).timestamp()),
        "jti": str(uuid.uuid4()),
        **claims,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str, expected_type: str) -> dict[str, Any]:
    settings = get_settings()
    last_exc: Exception | None = None
    for secret in settings.jwt_secrets:
        try:
            payload = jwt.decode(
                token,
                secret,
                algorithms=[settings.jwt_algorithm],
                issuer="parkvision",
            )
            if payload.get("typ") != expected_type:
                raise unauthorized("Invalid token type")
            return payload
        except jwt.PyJWTError as exc:  # try next key (rotation)
            last_exc = exc
    raise unauthorized(f"Invalid or expired token ({last_exc})")


def issue_access_token(
    *,
    user_id: uuid.UUID,
    kind: UserKind,
    tenant_id: uuid.UUID | None,
    role: str,
    session_id: uuid.UUID,
    mfa_verified: bool,
) -> str:
    return _encode(
        {
            "typ": "access",
            "sub": str(user_id),
            "kind": kind,
            "tid": str(tenant_id) if tenant_id else None,
            "role": role,
            "sid": str(session_id),
            "mfa": mfa_verified,
        },
        get_settings().access_token_ttl_seconds,
    )


def issue_mfa_pending_token(*, user_id: uuid.UUID, kind: UserKind, tenant_id: uuid.UUID | None) -> str:
    return _encode(
        {
            "typ": "mfa_pending",
            "sub": str(user_id),
            "kind": kind,
            "tid": str(tenant_id) if tenant_id else None,
        },
        get_settings().mfa_pending_ttl_seconds,
    )


def principal_from_token(payload: dict[str, Any]) -> Principal:
    return Principal(
        user_id=uuid.UUID(payload["sub"]),
        kind=payload["kind"],
        tenant_id=uuid.UUID(payload["tid"]) if payload.get("tid") else None,
        role=payload["role"],
        session_id=uuid.UUID(payload["sid"]),
        mfa_verified=bool(payload.get("mfa")),
    )


# ---------- CSRF (double-submit) ----------

def new_csrf_token() -> str:
    return secrets.token_urlsafe(24)


def csrf_matches(cookie_token: str | None, header_token: str | None) -> bool:
    return bool(cookie_token) and bool(header_token) and secrets.compare_digest(
        cookie_token, header_token
    )


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")
