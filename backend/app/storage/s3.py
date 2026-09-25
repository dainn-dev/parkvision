"""S3-compatible storage (MinIO in dev) — presigned URLs for ANPR snapshots."""

import aioboto3
from botocore.config import Config as BotoConfig

from app.core.config import get_settings

_session: aioboto3.Session | None = None


def _s3_session() -> aioboto3.Session:
    global _session
    if _session is None:
        _session = aioboto3.Session()
    return _session


def _client():
    s = get_settings()
    return _s3_session().client(
        "s3",
        endpoint_url=s.s3_endpoint_url,
        region_name=s.s3_region,
        aws_access_key_id=s.s3_access_key,
        aws_secret_access_key=s.s3_secret_key,
        config=BotoConfig(signature_version="s3v4"),
    )


async def presign_get(object_key: str, ttl: int | None = None) -> str:
    s = get_settings()
    async with _client() as client:
        return await client.generate_presigned_url(
            "get_object",
            Params={"Bucket": s.s3_bucket, "Key": object_key},
            ExpiresIn=ttl or s.s3_presign_ttl_seconds,
        )


async def presign_put(object_key: str, content_type: str, ttl: int | None = None) -> str:
    s = get_settings()
    async with _client() as client:
        return await client.generate_presigned_url(
            "put_object",
            Params={"Bucket": s.s3_bucket, "Key": object_key, "ContentType": content_type},
            ExpiresIn=ttl or s.s3_presign_ttl_seconds,
        )


async def delete_object(object_key: str) -> None:
    s = get_settings()
    async with _client() as client:
        await client.delete_object(Bucket=s.s3_bucket, Key=object_key)


async def ensure_bucket() -> None:
    s = get_settings()
    async with _client() as client:
        existing = await client.list_buckets()
        names = {b["Name"] for b in existing.get("Buckets", [])}
        if s.s3_bucket not in names:
            await client.create_bucket(Bucket=s.s3_bucket)
