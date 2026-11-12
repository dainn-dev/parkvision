"""Self-hosted update channel for the edge app and the driver APK.

Builds are uploaded by a platform admin, stored in the S3 bucket under
`releases/`, and handed out through presigned download URLs. Only the
highest published version of a channel is offered.
"""

import hashlib
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import BinaryIO

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import AppRelease
from app.services.storage import presign_download, s3_client

# Channel → file extension accepted on upload. The edge channel follows Tauri's
# `{target}-{arch}` naming so it matches what the updater asks for.
CHANNELS: dict[str, str] = {
    "edge-windows-x86_64": ".exe",
    "android": ".apk",
}
_CONTENT_TYPES = {
    ".exe": "application/vnd.microsoft.portable-executable",
    ".apk": "application/vnd.android.package-archive",
}
_SEMVER = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)$")
_HASH_CHUNK = 1024 * 1024
# Edge installers and the driver APK are both well under this; reject anything
# past it before it reaches S3 instead of trusting Content-Length.
MAX_UPLOAD_BYTES = 500 * 1024 * 1024


class ReleaseError(ValueError):
    """A release request that cannot be honoured (bad channel, version, file)."""


def parse_version(value: str) -> tuple[int, int, int]:
    """`1.2.3` (optional leading `v`) → (1, 2, 3). Pre-release tags are not used."""
    match = _SEMVER.match(value.strip())
    if not match:
        raise ReleaseError(f"version must look like 1.2.3, got {value!r}")
    major, minor, patch = (int(part) for part in match.groups())
    return major, minor, patch


def is_newer(candidate: str, current: str) -> bool:
    return parse_version(candidate) > parse_version(current)


def check_channel(channel: str) -> str:
    if channel not in CHANNELS:
        raise ReleaseError(f"channel must be one of {sorted(CHANNELS)}")
    return channel


@dataclass(frozen=True)
class StoredFile:
    object_key: str
    size_bytes: int
    sha256: str


def store_release_file(channel: str, version: str, filename: str, stream: BinaryIO) -> StoredFile:
    """Hash and upload a build to `releases/<channel>/<version>/<name>` (blocking)."""
    extension = CHANNELS[channel]
    if not filename.lower().endswith(extension):
        raise ReleaseError(f"{channel} builds must be {extension} files")
    digest = hashlib.sha256()
    size = 0
    stream.seek(0)
    while chunk := stream.read(_HASH_CHUNK):
        size += len(chunk)
        if size > MAX_UPLOAD_BYTES:
            raise ReleaseError(f"uploaded file exceeds {MAX_UPLOAD_BYTES // (1024 * 1024)} MiB")
        digest.update(chunk)
    if size == 0:
        raise ReleaseError("uploaded file is empty")
    stream.seek(0)
    # Fixed file name per release: the original name is client input.
    key = f"releases/{channel}/{version}/parkvision-{channel}-{version}{extension}"
    s3_client().upload_fileobj(
        stream,
        settings.s3_bucket,
        key,
        ExtraArgs={"ContentType": _CONTENT_TYPES[extension]},
    )
    return StoredFile(object_key=key, size_bytes=size, sha256=digest.hexdigest())


async def latest_published(db: AsyncSession, channel: str) -> AppRelease | None:
    rows = (
        await db.execute(
            select(AppRelease).where(AppRelease.channel == channel, AppRelease.is_published.is_(True))
        )
    ).scalars().all()
    if not rows:
        return None
    return max(rows, key=lambda r: parse_version(r.version))


def download_url(release: AppRelease) -> str:
    return presign_download(release.object_key)


def mark_published(release: AppRelease, published: bool) -> None:
    release.is_published = published
    release.published_at = datetime.now(timezone.utc) if published else None


def new_release(
    *,
    channel: str,
    version: str,
    stored: StoredFile,
    notes: str | None,
    signature: str | None,
    version_code: int | None,
    min_supported_version: str | None,
    created_by_id: uuid.UUID | None,
) -> AppRelease:
    return AppRelease(
        channel=channel,
        version=version,
        version_code=version_code,
        notes=notes,
        object_key=stored.object_key,
        size_bytes=stored.size_bytes,
        sha256=stored.sha256,
        signature=signature,
        min_supported_version=min_supported_version,
        is_published=False,
        created_by_id=created_by_id,
    )
