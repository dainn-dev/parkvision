"""S3-compatible object storage (MinIO in dev): uploads + presigned URLs.

boto3 is synchronous; calls run in a thread so the event loop is never blocked.
Presigning is local (no network) so it stays inline.
"""

import asyncio
from functools import partial

import boto3
from botocore.config import Config as BotoConfig

from app.config import get_settings

settings = get_settings()

_client = None


def s3_client():
    global _client
    if _client is None:
        _client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
            config=BotoConfig(signature_version="s3v4"),
        )
    return _client


async def put_bytes(key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    await asyncio.to_thread(
        partial(
            s3_client().put_object,
            Bucket=settings.s3_bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
    )


async def get_bytes(key: str) -> bytes:
    resp = await asyncio.to_thread(partial(s3_client().get_object, Bucket=settings.s3_bucket, Key=key))
    return resp["Body"].read()


async def delete_object(key: str) -> None:
    await asyncio.to_thread(partial(s3_client().delete_object, Bucket=settings.s3_bucket, Key=key))


def presign_get(key: str, ttl: int | None = None) -> str:
    return s3_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket, "Key": key},
        ExpiresIn=ttl or settings.s3_presign_ttl_seconds,
    )


def presign_put(key: str, content_type: str, ttl: int | None = None) -> str:
    return s3_client().generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.s3_bucket,
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=ttl or settings.s3_presign_ttl_seconds,
    )


async def ensure_bucket() -> None:
    """Create the bucket if missing (dev convenience; prod should pre-create)."""
    try:
        await asyncio.to_thread(partial(s3_client().head_bucket, Bucket=settings.s3_bucket))
    except Exception:
        await asyncio.to_thread(partial(s3_client().create_bucket, Bucket=settings.s3_bucket))
