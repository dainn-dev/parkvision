"""MinIO/S3 object storage: presigned upload + download URLs for ANPR images.

The minio client is synchronous — calls run in a thread via asyncio.to_thread.
"""

import asyncio
import uuid
from datetime import timedelta
from functools import lru_cache

from minio import Minio

from app.core.config import get_settings


@lru_cache
def _client() -> Minio:
    s = get_settings()
    return Minio(
        s.s3_endpoint,
        access_key=s.s3_access_key,
        secret_key=s.s3_secret_key,
        secure=s.s3_secure,
    )


async def ensure_bucket() -> None:
    s = get_settings()

    def _mk() -> None:
        c = _client()
        if not c.bucket_exists(s.s3_bucket):
            c.make_bucket(s.s3_bucket)

    await asyncio.to_thread(_mk)


def new_object_key(tenant_id: uuid.UUID, kind: str, content_type: str) -> str:
    ext = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}.get(
        content_type, ".bin"
    )
    return f"{tenant_id}/{kind}/{uuid.uuid4()}{ext}"


async def presigned_put(object_key: str, ttl_seconds: int | None = None) -> str:
    s = get_settings()
    ttl = timedelta(seconds=ttl_seconds or s.s3_presign_ttl_seconds)
    return await asyncio.to_thread(
        _client().presigned_put_object, s.s3_bucket, object_key, ttl
    )


async def presigned_get(object_key: str, ttl_seconds: int | None = None) -> str:
    s = get_settings()
    ttl = timedelta(seconds=ttl_seconds or s.s3_presign_ttl_seconds)
    return await asyncio.to_thread(
        _client().presigned_get_object, s.s3_bucket, object_key, ttl
    )


async def put_bytes(object_key: str, data: bytes, content_type: str) -> None:
    import io

    s = get_settings()

    def _put() -> None:
        _client().put_object(
            s.s3_bucket, object_key, io.BytesIO(data), len(data), content_type=content_type
        )

    await asyncio.to_thread(_put)


async def get_bytes(object_key: str) -> bytes:
    s = get_settings()

    def _get() -> bytes:
        resp = _client().get_object(s.s3_bucket, object_key)
        try:
            return resp.read()
        finally:
            resp.close()
            resp.release_conn()

    return await asyncio.to_thread(_get)
