"""S3-compatible object storage (MinIO): presigned upload/download URLs."""

import uuid
from functools import lru_cache

import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import ClientError

from app.config import settings


@lru_cache
def s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        config=BotoConfig(signature_version="s3v4"),
    )


def ensure_bucket() -> None:
    client = s3_client()
    try:
        client.head_bucket(Bucket=settings.s3_bucket)
    except ClientError:
        client.create_bucket(Bucket=settings.s3_bucket)


def presign_upload(tenant_id: uuid.UUID, kind: str, content_type: str) -> dict:
    key = f"{tenant_id}/{kind}/{uuid.uuid4()}"
    url = s3_client().generate_presigned_url(
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
    return s3_client().generate_presigned_url(
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
