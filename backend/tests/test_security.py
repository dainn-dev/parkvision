"""Unit tests for the security core (no DB)."""

import pyotp
import pytest

from app.core.errors import AppError
from app.core.security import (
    PURPOSE_ACCESS,
    PURPOSE_MFA_CHALLENGE,
    create_jwt,
    decode_jwt,
    decrypt_totp_secret,
    encrypt_totp_secret,
    hash_opaque,
    hash_password,
    new_backup_codes,
    new_csrf_token,
    new_opaque_token,
    new_totp_secret,
    totp_uri,
    verify_backup_code,
    verify_password,
    verify_totp,
)


def test_password_hash_roundtrip():
    digest = hash_password("a-strong-password-12")
    assert verify_password("a-strong-password-12", digest)
    assert not verify_password("wrong", digest)


def test_jwt_roundtrip_with_kid():
    token = create_jwt(subject="user-1", purpose=PURPOSE_ACCESS, ttl_seconds=60, claims={"role": "owner"})
    payload = decode_jwt(token, purpose=PURPOSE_ACCESS)
    assert payload["sub"] == "user-1"
    assert payload["role"] == "owner"


def test_jwt_purpose_mismatch_rejected():
    token = create_jwt(subject="u", purpose=PURPOSE_MFA_CHALLENGE, ttl_seconds=60)
    with pytest.raises(AppError) as exc:
        decode_jwt(token, purpose=PURPOSE_ACCESS)
    assert exc.value.status_code == 401


def test_jwt_tampered_rejected():
    token = create_jwt(subject="u", purpose=PURPOSE_ACCESS, ttl_seconds=60)
    bad = token[:-4] + "AAAA"
    with pytest.raises(AppError):
        decode_jwt(bad, purpose=PURPOSE_ACCESS)


def test_opaque_token_hash_consistent():
    raw, digest = new_opaque_token()
    assert hash_opaque(raw) == digest
    raw2, digest2 = new_opaque_token()
    assert digest2 != digest


def test_csrf_token_unique():
    assert new_csrf_token() != new_csrf_token()


def test_totp_secret_encryption_roundtrip():
    secret = new_totp_secret()
    enc = encrypt_totp_secret(secret)
    assert enc != secret
    assert decrypt_totp_secret(enc) == secret


def test_totp_verify():
    secret = new_totp_secret()
    code = pyotp.TOTP(secret).now()
    assert verify_totp(secret, code)
    assert not verify_totp(secret, "000000")


def test_totp_uri():
    uri = totp_uri("JBSWY3DPEHPK3PXP", "a@b.c")
    assert uri.startswith("otpauth://totp/")
    assert "a%40b.c" in uri or "a@b.c" in uri


def test_backup_codes():
    plain, hashes = new_backup_codes(5)
    assert len(plain) == len(hashes) == 5
    idx = verify_backup_code(plain[2], hashes)
    assert idx == 2
    assert verify_backup_code("nope-nope", hashes) is None
