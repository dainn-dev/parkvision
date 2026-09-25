"""JWT issuing/verification, password hashing, TOTP MFA, opaque refresh tokens.

- Access tokens: signed JWT (HS256 by default) carried in HttpOnly cookies.
- Refresh tokens: opaque 256-bit random values; only a SHA-256 hash is stored
  in `user_sessions`. Rotation on every refresh; reuse of a rotated token
  revokes the whole session family (theft detection).
- TOTP secrets are Fernet-encrypted at rest; backup codes are SHA-256 hashed.
"""

import base64
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pyotp
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from cryptography.fernet import Fernet, InvalidToken

from app.config import settings

_hasher = PasswordHasher()


# ---------- passwords ----------


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


# ---------- field encryption (TOTP secrets) ----------


def _fernet() -> Fernet:
    key = settings.field_encryption_key
    try:
        return Fernet(key.encode())
    except Exception:
        # Dev convenience: accept any string, derive a valid Fernet key.
        digest = hashlib.sha256(key.encode()).digest()
        return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("cannot decrypt stored secret") from exc


# ---------- TOTP ----------


def new_totp_secret() -> str:
    return pyotp.random_base32()


def totp_uri(secret: str, email: str, issuer: str = "VehicleManagement") -> str:
    return pyotp.totp.TOTP(secret).provisioning_uri(name=email, issuer_name=issuer)


def verify_totp(secret: str, code: str) -> bool:
    return pyotp.TOTP(secret).verify(code.strip().replace(" ", ""), valid_window=1)


def generate_backup_codes(count: int = 8) -> list[str]:
    return [f"{secrets.randbelow(10**8):08d}" for _ in range(count)]


def hash_backup_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


# ---------- access tokens (JWT) ----------


def create_access_token(
    *,
    user_id: uuid.UUID,
    user_type: str,
    session_id: uuid.UUID,
    tenant_id: uuid.UUID | None = None,
    role: str | None = None,
    mfa_verified: bool = False,
    mfa_pending: bool = False,
) -> str:
    now = datetime.now(timezone.utc)
    claims = {
        "sub": str(user_id),
        "typ": user_type,
        "sid": str(session_id),
        "tid": str(tenant_id) if tenant_id else None,
        "role": role,
        "mfa": mfa_verified,
        "mfa_pending": mfa_pending,
        "jti": uuid.uuid4().hex,
        "iat": now,
        "exp": now + timedelta(seconds=settings.access_token_ttl_seconds),
    }
    return jwt.encode(claims, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    last_exc: Exception | None = None
    for secret in [settings.jwt_secret, *settings.jwt_previous_secrets]:
        try:
            return jwt.decode(
                token, secret, algorithms=[settings.jwt_algorithm], options={"require": ["exp", "sub"]}
            )
        except jwt.PyJWTError as exc:  # try previous secrets for rotation
            last_exc = exc
    raise last_exc or jwt.PyJWTError("invalid token")


# ---------- refresh tokens (opaque) ----------


def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ---------- CSRF (double-submit) ----------


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)
