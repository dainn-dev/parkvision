"""Edge-device endpoints — authenticated by `X-Api-Key` (api_credentials), not user JWT.

Firmware uses these for offline operation: incremental whitelist sync
(`GET /edge/tenants/{id}/whitelist?updatedSince=`) and a rules snapshot for
local `decide_access` fallback when the broker/API is unreachable.
`/edge/activate` is the one public endpoint: it redeems a tenant-issued
one-time code into a device credential + config bundle.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, Query, Request, status
from sqlalchemy import select

from app.api.deps import forbidden, unauthorized
from app.core.errors import ApiError, conflict
from app.core.rate_limit import rate_limited
from app.database import platform_session
from app.models import (
    ApiCredential,
    EdgeDevice,
    RegisteredVehicle,
    TenantAccessRule,
)
from app.schemas.resources import (
    ActivationBundleOut,
    ActivateIn,
    EdgeRuleEntry,
    EdgeVehicleEntry,
    EdgeWhitelistOut,
    MqttAuthIn,
    MqttAuthOut,
)
from app.services.activation_service import (
    build_activation_bundle,
    consume_activation_code,
    find_activation_code,
    mint_device_credential,
)
from app.services.audit_service import write_audit
from app.services.credential_service import authenticate_api_key

router = APIRouter(prefix="/edge", tags=["edge"])


EDGE_SYNC_SCOPE = "edge:ingest"
EDGE_CONFIG_SCOPE = "edge:config"


async def _resolve_api_key(x_api_key: str) -> ApiCredential:
    if not x_api_key:
        raise unauthorized("X-Api-Key header required")
    async with platform_session() as db:
        cred = await authenticate_api_key(db, x_api_key)
    if cred is None:
        raise unauthorized("Invalid or expired API key")
    return cred


async def edge_ctx(tenant_id: uuid.UUID, x_api_key: str = Header(default="")) -> ApiCredential:
    """Resolve the `X-Api-Key` credential and scope it to `tenant_id`.

    Keys with `tenant_id` set are bound to that tenant; platform-wide keys
    (`tenant_id IS NULL`) may read any tenant's whitelist. Either way the
    credential must carry the `edge:ingest` scope.
    """
    cred = await _resolve_api_key(x_api_key)
    if EDGE_SYNC_SCOPE not in (cred.scopes or []):
        raise forbidden(f"API key missing '{EDGE_SYNC_SCOPE}' scope")
    if cred.tenant_id is not None and cred.tenant_id != tenant_id:
        raise forbidden("API key not scoped to this tenant")
    return cred


async def edge_device_ctx(x_api_key: str = Header(default="")) -> ApiCredential:
    """`X-Api-Key` -> device-bound credential carrying the `edge:config` scope."""
    cred = await _resolve_api_key(x_api_key)
    if EDGE_CONFIG_SCOPE not in (cred.scopes or []):
        raise forbidden(f"API key missing '{EDGE_CONFIG_SCOPE}' scope")
    if cred.edge_device_id is None:
        raise forbidden("API key is not bound to an edge device")
    return cred


@router.post(
    "/activate",
    response_model=ActivationBundleOut,
    dependencies=[Depends(rate_limited("edge-activate", 10, 60))],
)
async def edge_activate(body: ActivateIn, request: Request) -> ActivationBundleOut:
    """Redeem a one-time activation code into a device credential + config bundle.

    Public (the device has no credential yet); brute force is bounded by rate
    limiting + code entropy. The consume is an atomic UPDATE so two devices
    cannot redeem the same code.
    """
    async with platform_session() as db:
        row = await find_activation_code(db, body.code)
        if row is None:
            raise unauthorized("Invalid activation code")
        if row.expires_at <= datetime.now(timezone.utc):
            raise ApiError(
                status.HTTP_410_GONE, "activation_code_expired", "Activation code expired"
            )
        if row.consumed_at is not None:
            raise conflict("Activation code already redeemed")
        consumed = await consume_activation_code(db, row)
        if consumed is None:
            raise conflict("Activation code already redeemed")

        device = (
            await db.execute(select(EdgeDevice).where(EdgeDevice.id == row.edge_device_id))
        ).scalar_one_or_none()
        if device is None or device.status == "decommissioned":
            raise unauthorized("Activation code is not valid for an active device")

        cred, plain = mint_device_credential(device)
        db.add(cred)
        if body.device_info and body.device_info.serial and not device.device_serial:
            device.device_serial = body.device_info.serial

        await write_audit(
            db,
            tenant_id=device.tenant_id,
            actor_type="edge_device",
            actor_id=device.id,
            actor_email=None,
            action="device.activated",
            resource_type="edge_device",
            resource_id=str(device.id),
            ip=request.client.host if request.client else None,
        )
        bundle = await build_activation_bundle(db, device, token=plain)
        await db.commit()
        return bundle


@router.get(
    "/config",
    response_model=ActivationBundleOut,
    response_model_exclude={"api": {"token"}, "mqtt": {"password"}},
)
async def edge_config(cred: ApiCredential = Depends(edge_device_ctx)) -> ActivationBundleOut:
    """Re-emit the device's config bundle (gates/lanes/cameras) — no secrets."""
    async with platform_session() as db:
        device = (
            await db.execute(
                select(EdgeDevice).where(EdgeDevice.id == cred.edge_device_id)
            )
        ).scalar_one_or_none()
        if device is None or device.status == "decommissioned":
            raise unauthorized("Device is decommissioned")
        return await build_activation_bundle(db, device)


@router.get("/tenants/{tenant_id}/whitelist", response_model=EdgeWhitelistOut)
async def edge_whitelist(
    tenant_id: uuid.UUID,
    updated_since: datetime | None = Query(default=None, alias="updatedSince"),
    limit: int = Query(default=500, ge=1, le=5000),
    cred: ApiCredential = Depends(edge_ctx),
) -> EdgeWhitelistOut:
    """Incremental registered-vehicle sync.

    Rows are ordered by `updated_at`; the response `syncedAt` is the cursor for
    the next call (`>=` semantics — the first row may repeat, edges upsert).
    `truncated` tells the edge to call again immediately for the next page.
    """
    cond = [RegisteredVehicle.tenant_id == tenant_id]
    if updated_since:
        cond.append(RegisteredVehicle.updated_at >= updated_since)
    async with platform_session() as db:
        rows = (
            (
                await db.execute(
                    select(RegisteredVehicle)
                    .where(*cond)
                    .order_by(RegisteredVehicle.updated_at.asc(), RegisteredVehicle.id.asc())
                    .limit(limit + 1)
                )
            )
            .scalars()
            .all()
        )
    truncated = len(rows) > limit
    items = rows[:limit]
    if truncated and items:
        synced_at = items[-1].updated_at
    elif items:
        synced_at = datetime.now(timezone.utc)
    else:
        synced_at = updated_since or datetime.now(timezone.utc)
    return EdgeWhitelistOut(
        items=[EdgeVehicleEntry.model_validate(r) for r in items],
        synced_at=synced_at,
        truncated=truncated,
    )


@router.get("/tenants/{tenant_id}/rules", response_model=list[EdgeRuleEntry])
async def edge_rules(tenant_id: uuid.UUID, cred: ApiCredential = Depends(edge_ctx)) -> list[EdgeRuleEntry]:
    """Active access-rule snapshot for the edge's offline `decide_access` mirror."""
    async with platform_session() as db:
        rows = (
            (
                await db.execute(
                    select(TenantAccessRule).where(
                        TenantAccessRule.tenant_id == tenant_id,
                        TenantAccessRule.active.is_(True),
                    )
                )
            )
            .scalars()
            .all()
        )
    return [EdgeRuleEntry.model_validate(r) for r in rows]


_DENY = MqttAuthOut(result="deny")


@router.post("/mqtt-auth", response_model=MqttAuthOut)
async def mqtt_auth(body: MqttAuthIn) -> MqttAuthOut:
    """EMQX http authn/authz hook.

    Authn: EMQX posts {username, password}. Authz: posts {username, action,
    topic} (no password). Password is the device's `pk_` credential — so a
    tenant-side revoke kills MQTT access too. Username must equal the
    device's `mqtt_client_id` (`edge-{device_id}` default) and topics are
    scoped to the credential's tenant prefix.
    """
    async with platform_session() as db:
        if body.password:
            cred = await authenticate_api_key(db, body.password)
            if cred is None or cred.edge_device_id is None:
                return _DENY
        else:
            cred = None
        device: EdgeDevice | None = None
        if cred is not None:
            device = await db.get(EdgeDevice, cred.edge_device_id)
        else:
            # authz path: resolve device from its MQTT username
            rows = (
                await db.execute(
                    select(EdgeDevice).where(
                        EdgeDevice.mqtt_client_id == body.username
                    )
                )
            ).scalars().all()
            if len(rows) == 1:
                device = rows[0]
            elif body.username.startswith("edge-"):
                try:
                    device = await db.get(EdgeDevice, uuid.UUID(body.username[5:]))
                except ValueError:
                    device = None
            if device is not None:
                cred = (
                    await db.execute(
                        select(ApiCredential).where(
                            ApiCredential.edge_device_id == device.id,
                            ApiCredential.status == "active",
                            ApiCredential.revoked_at.is_(None),
                        )
                    )
                ).scalars().first()
        if device is None or cred is None:
            return _DENY
        if body.username != (device.mqtt_client_id or f"edge-{device.id}"):
            return _DENY
        if body.topic and not body.topic.startswith(f"tenants/{cred.tenant_id}/"):
            return _DENY
    return MqttAuthOut(result="allow")
