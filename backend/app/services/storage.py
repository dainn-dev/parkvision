"""S3-compatible object storage (MinIO): presigned upload/download URLs."""

import uuid
from functools import lru_cache

import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import ClientError

from app.config import settings


def _client(endpoint_url: str):
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        config=BotoConfig(signature_version="s3v4"),
    )


@lru_cache
def s3_client():
    return _client(settings.s3_endpoint_url)


@lru_cache
def presign_client():
    # Browsers cannot resolve the Docker service name, so sign against the
    # public endpoint when configured. Signature covers the host header.
    if not settings.s3_public_endpoint_url:
        return s3_client()
    return _client(settings.s3_public_endpoint_url)


def ensure_bucket() -> None:
    client = s3_client()
    try:
        client.head_bucket(Bucket=settings.s3_bucket)
    except ClientError:
        client.create_bucket(Bucket=settings.s3_bucket)
    _ensure_cors(client)


def _ensure_cors(client) -> None:
    # Browsers upload directly to the presigned URL, so the bucket must answer
    # the CORS preflight; the S3 API itself never sends these headers.
    client.put_bucket_cors(
        Bucket=settings.s3_bucket,
        CORSConfiguration={
            "CORSRules": [
                {
                    "AllowedOrigins": settings.s3_cors_origins,
                    "AllowedMethods": ["GET", "PUT", "HEAD"],
                    "AllowedHeaders": ["*"],
                    "ExposeHeaders": ["ETag"],
                    "MaxAgeSeconds": 3000,
                }
            ]
        },
    )


def presign_upload(tenant_id: uuid.UUID, kind: str, content_type: str) -> dict:
    key = f"{tenant_id}/{kind}/{uuid.uuid4()}"
    url = presign_client().generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.s3_bucket,
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=settings.s3_presign_ttl_seconds,
    )
    return {"uploadUrl": url, "objectKey": key, "expiresIn": settings.s3_presign_ttl_seconds}


def presign_download(object_key: str) -> str:
    return presign_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket, "Key": object_key},
        ExpiresIn=settings.s3_presign_ttl_seconds,
    )


def check_health() -> bool:
    try:
        s3_client().head_bucket(Bucket=settings.s3_bucket)
        return True
    except ClientError:
        return False


def delete_objects(keys: list[str]) -> int:
    """Delete S3 objects by key; returns count deleted. Raises on client errors."""
    client = s3_client()
    deleted = 0
    for key in keys:
        client.delete_object(Bucket=settings.s3_bucket, Key=key)
        deleted += 1
    return deleted
