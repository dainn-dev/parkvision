"""Self-hosted update channel: public update checks + platform-admin release management.

Edge app: `GET /updates/edge/{target}/{arch}/{current_version}` speaks the
Tauri updater's dynamic-server contract — 204 when nothing newer is
published, otherwise `{version, notes, pub_date, url, signature}`.

Driver APK: `GET /updates/android?versionCode=N` answers whether a newer
build exists, whether it is mandatory, and a presigned download URL.
"""

import asyncio
import uuid

from fastapi import APIRouter, Depends, File, Form, Query, Request, Response, UploadFile, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.deps import AuthContext, csrf_protect, require_platform_admin
from app.core.enums import PlatformAdminRole
from app.core.errors import bad_request, conflict, not_found
from app.core.rate_limit import rate_limited
from app.database import platform_session
from app.models import AppRelease
from app.schemas.resources import (
    AndroidUpdateOut,
    AppReleaseOut,
    AppReleasePatchIn,
    LatestReleaseOut,
    LatestReleasesOut,
)
from app.services import release_service
from app.services.audit_service import write_audit
from app.services.release_service import MAX_UPLOAD_BYTES, ReleaseError

public_router = APIRouter(prefix="/updates", tags=["updates"])

_MANAGE = (PlatformAdminRole.SUPER_ADMIN, PlatformAdminRole.OPS)
admin_router = APIRouter(
    prefix="/platform/releases",
    tags=["platform"],
    dependencies=[Depends(csrf_protect), Depends(require_platform_admin(_MANAGE))],
)

_update_check_limit = Depends(rate_limited("update-check", 60, 60))
_release_public_limit = Depends(rate_limited("release-public", 60, 60))


def _out(row: AppRelease) -> AppReleaseOut:
    return AppReleaseOut(
        id=row.id,
        channel=row.channel,
        version=row.version,
        version_code=row.version_code,
        notes=row.notes,
        size_bytes=row.size_bytes,
        sha256=row.sha256,
        has_signature=bool(row.signature),
        min_supported_version=row.min_supported_version,
        is_published=row.is_published,
        created_at=row.created_at,
        published_at=row.published_at,
    )


# ---------- public update checks ----------


@public_router.get(
    "/edge/{target}/{arch}/{current_version}",
    dependencies=[_update_check_limit],
    response_model=None,
    responses={204: {"description": "No newer release"}},
)
async def edge_update(target: str, arch: str, current_version: str) -> Response | dict:
    """Tauri updater endpoint (`{{target}}/{{arch}}/{{current_version}}`)."""
    channel = f"edge-{target}-{arch}"
    if channel not in release_service.CHANNELS:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    try:
        release_service.parse_version(current_version)
    except ReleaseError as exc:
        raise bad_request(str(exc)) from None
    async with platform_session() as db:
        latest = await release_service.latest_published(db, channel)
    if (
        latest is None
        or not latest.signature
        or not release_service.is_newer(latest.version, current_version)
    ):
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return {
        "version": latest.version,
        "notes": latest.notes or "",
        "pub_date": (latest.published_at or latest.created_at).isoformat(),
        "url": release_service.download_url(latest),
        "signature": latest.signature,
    }


@public_router.get("/android", response_model=AndroidUpdateOut, dependencies=[_update_check_limit])
async def android_update(version_code: int = Query(alias="versionCode", ge=0)) -> AndroidUpdateOut:
    async with platform_session() as db:
        latest = await release_service.latest_published(db, "android")
        if latest is None or latest.version_code is None or latest.version_code <= version_code:
            return AndroidUpdateOut(update_available=False, required=False)
        minimum_code = None
        if latest.min_supported_version:
            minimum_code = (
                await db.execute(
                    select(AppRelease.version_code).where(
                        AppRelease.channel == "android",
                        AppRelease.version == latest.min_supported_version,
                    )
                )
            ).scalar_one_or_none()
    return AndroidUpdateOut(
        update_available=True,
        required=minimum_code is not None and version_code < minimum_code,
        latest_version=latest.version,
        latest_version_code=latest.version_code,
        notes=latest.notes,
        download_url=release_service.download_url(latest),
        sha256=latest.sha256,
        size_bytes=latest.size_bytes,
    )


@public_router.get("/latest", response_model=LatestReleasesOut, dependencies=[_release_public_limit])
async def latest_releases(response: Response) -> LatestReleasesOut:
    """Newest published build per channel, for the public download page."""
    async with platform_session() as db:
        rows = [
            row
            for channel in release_service.CHANNELS
            if (row := await release_service.latest_published(db, channel)) is not None
        ]
    response.headers["Cache-Control"] = "public, max-age=60"
    return LatestReleasesOut(
        releases=[
            LatestReleaseOut(
                channel=row.channel,
                version=row.version,
                version_code=row.version_code,
                notes=row.notes,
                size_bytes=row.size_bytes,
                sha256=row.sha256,
                published_at=row.published_at or row.created_at,
            )
            for row in rows
        ]
    )


@public_router.get(
    "/download/{channel}",
    response_class=RedirectResponse,
    status_code=status.HTTP_302_FOUND,
    dependencies=[_release_public_limit],
)
async def download_release(channel: str) -> RedirectResponse:
    """302 to a fresh presigned URL for the newest published build of `channel`."""
    if channel not in release_service.CHANNELS:
        raise not_found("Release", channel)
    async with platform_session() as db:
        row = await release_service.latest_published(db, channel)
    if row is None:
        raise not_found("Release", channel)
    return RedirectResponse(
        release_service.download_url(row),
        status_code=status.HTTP_302_FOUND,
        headers={"Cache-Control": "no-store"},
    )


# ---------- platform admin: release management ----------


@admin_router.get("", response_model=list[AppReleaseOut])
async def list_releases(channel: str | None = None) -> list[AppReleaseOut]:
    async with platform_session() as db:
        query = select(AppRelease)
        if channel:
            query = query.where(AppRelease.channel == channel)
        rows = (await db.execute(query)).scalars().all()
    rows = sorted(rows, key=lambda r: (r.channel, release_service.parse_version(r.version)), reverse=True)
    return [_out(r) for r in rows]


@admin_router.post("", response_model=AppReleaseOut, status_code=status.HTTP_201_CREATED)
async def upload_release(
    request: Request,
    file: UploadFile = File(...),
    channel: str = Form(...),
    version: str = Form(...),
    notes: str | None = Form(default=None),
    signature: str | None = Form(default=None),
    version_code: int | None = Form(default=None, alias="versionCode"),
    min_supported_version: str | None = Form(default=None, alias="minSupportedVersion"),
    auth: AuthContext = Depends(require_platform_admin(_MANAGE)),
) -> AppReleaseOut:
    """Upload a build. It stays unpublished until `PATCH ... {isPublished: true}`."""
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            declared_size = int(content_length)
        except ValueError:
            raise bad_request("invalid Content-Length") from None
        if declared_size > MAX_UPLOAD_BYTES:
            raise bad_request("uploaded request is too large")
    if notes is not None and len(notes) > 4000:
        raise bad_request("notes must be at most 4000 characters")
    if signature is not None and len(signature) > 10000:
        raise bad_request("signature must be at most 10000 characters")
    try:
        release_service.check_channel(channel)
        release_service.parse_version(version)
        if min_supported_version:
            release_service.parse_version(min_supported_version)
    except ReleaseError as exc:
        raise bad_request(str(exc)) from None
    if channel == "android" and (version_code is None or version_code < 1):
        raise bad_request("versionCode is required for android releases")
    if channel.startswith("edge-") and not (signature and signature.strip()):
        raise bad_request("signature (the .sig produced by the Tauri build) is required for edge releases")

    async with platform_session() as db:
        exists = (
            await db.execute(
                select(AppRelease.id).where(AppRelease.channel == channel, AppRelease.version == version)
            )
        ).first()
    if exists:
        raise conflict(f"{channel} {version} already exists")

    try:
        stored = await asyncio.to_thread(
            release_service.store_release_file, channel, version, file.filename or "", file.file
        )
    except ReleaseError as exc:
        raise bad_request(str(exc)) from None

    async with platform_session() as db:
        row = release_service.new_release(
            channel=channel,
            version=version,
            stored=stored,
            notes=notes,
            signature=signature.strip() if signature else None,
            version_code=version_code,
            min_supported_version=min_supported_version,
            created_by_id=auth.user_id,
        )
        db.add(row)
        try:
            await db.flush()
        except IntegrityError:
            raise conflict(f"{channel} {version} already exists") from None
        await write_audit(
            db,
            tenant_id=None,
            actor_type="platform_admin",
            actor_id=auth.user_id,
            actor_email=None,
            action="platform.release.uploaded",
            resource_type="app_release",
            resource_id=str(row.id),
            details={"channel": channel, "version": version, "sha256": stored.sha256},
        )
        # platform_session() commits on exit; flush, then reload server defaults.
        await db.flush()
        await db.refresh(row)
        return _out(row)


@admin_router.patch("/{release_id}", response_model=AppReleaseOut)
async def update_release(
    release_id: uuid.UUID,
    body: AppReleasePatchIn,
    auth: AuthContext = Depends(require_platform_admin(_MANAGE)),
) -> AppReleaseOut:
    """Publish/unpublish (rollback = unpublish the bad one), edit notes or minimum."""
    if body.min_supported_version:
        try:
            release_service.parse_version(body.min_supported_version)
        except ReleaseError as exc:
            raise bad_request(str(exc)) from None
    async with platform_session() as db:
        row = await db.get(AppRelease, release_id)
        if row is None:
            raise not_found("Release", release_id)
        changes = body.model_dump(exclude_unset=True)
        if changes.get("is_published") is not None:
            release_service.mark_published(row, changes["is_published"])
        if "notes" in changes:
            row.notes = changes["notes"]
        if "min_supported_version" in changes:
            row.min_supported_version = changes["min_supported_version"] or None
        await write_audit(
            db,
            tenant_id=None,
            actor_type="platform_admin",
            actor_id=auth.user_id,
            actor_email=None,
            action="platform.release.updated",
            resource_type="app_release",
            resource_id=str(row.id),
            details={k: v for k, v in changes.items() if k != "notes"},
        )
        # platform_session() commits on exit; flush, then reload server defaults.
        await db.flush()
        await db.refresh(row)
        return _out(row)
