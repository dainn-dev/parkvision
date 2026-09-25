"""API credential verification for non-cookie clients (edge devices, integrations)."""

import hashlib
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ApiCredential


def hash_api_key(plaintext: str) -> str:
    return hashlib.sha256(plaintext.encode()).hexdigest()


async def authenticate_api_key(db: AsyncSession, plaintext: str) -> ApiCredential | None:
    """Resolve a plaintext `pk_...` key to its credential row.

    Accepts the current key or the previous one inside its 24h grace window
    (set by POST /platform/credentials/{id}/rotate). Updates last_used_at.
    Returns None for unknown/expired/revoked keys.
    """
    if not plaintext.startswith("pk_"):
        return None
    hashed = hash_api_key(plaintext)
    now = datetime.now(timezone.utc)
    cred = (
        await db.execute(select(ApiCredential).where(ApiCredential.key_hash == hashed))
    ).scalar_one_or_none()
    if cred is None:
        cred = (
            await db.execute(
                select(ApiCredential).where(
                    ApiCredential.previous_key_hash == hashed,
                    ApiCredential.previous_grace_until > now,
                )
            )
        ).scalar_one_or_none()
    if cred is None:
        return None
    if cred.status != "active" or cred.revoked_at is not None:
        return None
    if cred.expires_at is not None and cred.expires_at <= now:
        return None
    cred.last_used_at = now
    return cred


def hash_lookup_prefix(plaintext: str) -> str:
    return plaintext[:10]
