"""Passwords, JWT (kid keyring), opaque tokens, TOTP MFA, CSRF."""

import base64
import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import jwt
import pyotp
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError
from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings
from app.core.errors import unauthorized

_ph = PasswordHasher()

PURPOSE_ACCESS = "access"
PURPOSE_REFRESH = "refresh"
PURPOSE_MFA_CHALLENGE = "mfa_challenge"


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError):
        return False


def _now() -> datetime:
    return datetime.now(UTC)


def create_jwt(
    *,
    subject: str,
    purpose: str,
    ttl_seconds: int,
    claims: dict[str, Any] | None = None,
) -> str:
    settings = get_settings()
    kid, key = settings.jwt_signing
    now = _now()
    payload: dict[str, Any] = {
        "sub": subject,
        "purpose": purpose,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl_seconds)).timestamp()),
        "jti": secrets.token_urlsafe(12),
    }
    if claims:
        payload.update(claims)
    return jwt.encode(payload, key, algorithm="HS256", headers={"kid": kid})


def decode_jwt(token: str, *, purpose: str | None = None) -> dict[str, Any]:
    settings = get_settings()
    try:
        kid = jwt.get_unverified_header(token).get("kid")
    except jwt.InvalidTokenError as exc:
        raise unauthorized("Malformed token") from exc
    keys = settings.jwt_verify_map
    candidates = [keys[kid]] if kid in keys else list(keys.values())
    for key in candidates:
        try:
            payload = jwt.decode(token, key, algorithms=["HS256"], options={"require": ["exp", "sub"]})
        except jwt.PyJWTError:
            continue
        if purpose is not None and payload.get("purpose") != purpose:
            raise unauthorized("Invalid token purpose")
        return payload
    raise unauthorized("Invalid or expired token")


def new_opaque_token() -> tuple[str, str]:
    """Return (raw_token, sha256_hex) — only the hash is stored."""
    raw = secrets.token_urlsafe(48)
    return raw, hashlib.sha256(raw.encode()).hexdigest()


def hash_opaque(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)


# ---- MFA ----


def _fernet() -> Fernet:
    settings = get_settings()
    key = settings.mfa_secret_key.encode()
    try:
        Fernet(key)  # validate
    except (ValueError, InvalidToken):
        key = base64.urlsafe_b64encode(hashlib.sha256(key).digest())
    return Fernet(key)


def new_totp_secret() -> str:
    return pyotp.random_base32()


def encrypt_totp_secret(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode()


def decrypt_totp_secret(encrypted: str) -> str:
    try:
        return _fernet().decrypt(encrypted.encode()).decode()
    except InvalidToken as exc:
        raise unauthorized("MFA secret unreadable") from exc


def verify_totp(secret: str, code: str) -> bool:
    return pyotp.TOTP(secret).verify(code.strip().replace(" ", ""), valid_window=1)


def totp_uri(secret: str, email: str, issuer: str = "ParkVision") -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=issuer)


def new_backup_codes(count: int = 10) -> tuple[list[str], list[str]]:
    """Return (plaintext_codes, argon2_hashes)."""
    raw = [f"{secrets.token_hex(2)}-{secrets.token_hex(2)}".upper() for _ in range(count)]
    return raw, [hash_password(c) for c in raw]


def verify_backup_code(code: str, hashes: list[str]) -> int | None:
    """Return index of the matching hash so callers can consume it."""
    normalized = code.strip().upper()
    for i, h in enumerate(hashes):
        if verify_password(normalized, h):
            return i
    return None


def uuid_str(value: UUID | None) -> str | None:
    return str(value) if value else None
