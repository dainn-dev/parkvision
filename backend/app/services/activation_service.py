"""Edge device activation — redeem a one-time code, mint the device credential,
and build the config bundle the client applies at activation / /edge/config."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import (
    ApiCredential,
    BarrierGate,
    Camera,
    DeviceActivationCode,
    EdgeDevice,
    SiteLane,
)
from app.schemas.resources import (
    ActivationApiOut,
    ActivationBundleOut,
    ActivationCameraOut,
    ActivationGateOut,
    ActivationMqttOut,
)
from app.services.credential_service import (
    hash_activation_code,
    new_api_key,
)


async def build_activation_bundle(
    db: AsyncSession, device: EdgeDevice, *, token: str | None = None
) -> ActivationBundleOut:
    """Config bundle for a bound device: every gate it controls, each gate's
    lane direction, and the cameras attached to that lane or to the device
    itself. `token` is set only at activate time — /edge/config never
    re-emits it."""
    gates = (
        (
            await db.execute(
                select(BarrierGate).where(BarrierGate.edge_device_id == device.id)
            )
        )
        .scalars()
        .all()
    )
    lane_ids = [g.lane_id for g in gates if g.lane_id is not None]
    lanes: dict[uuid.UUID, SiteLane] = {}
    if lane_ids:
        lanes = {
            l.id: l
            for l in (
                (await db.execute(select(SiteLane).where(SiteLane.id.in_(lane_ids))))
                .scalars()
                .all()
            )
        }
    cam_rows = (
        (
            await db.execute(
                select(Camera).where(
                    or_(
                        Camera.edge_device_id == device.id,
                        Camera.lane_id.in_(lane_ids or [uuid.UUID(int=0)]),
                    )
                )
            )
        )
        .scalars()
        .all()
    )

    gate_outs: list[ActivationGateOut] = []
    for g in gates:
        lane = lanes.get(g.lane_id) if g.lane_id else None
        gate_cams = [
            ActivationCameraOut(
                id=c.id, name=c.name, stream_url=c.stream_url, purpose=c.purpose
            )
            for c in cam_rows
            if c.lane_id == g.lane_id or (c.lane_id is None and c.edge_device_id == device.id)
        ]
        gate_outs.append(
            ActivationGateOut(
                gate_id=g.id,
                lane_id=g.lane_id,
                direction=lane.direction if lane else "entry",
                name=g.name,
                cameras=gate_cams,
            )
        )

    return ActivationBundleOut(
        device_id=device.id,
        tenant_id=device.tenant_id,
        site_id=device.site_id,
        gates=gate_outs,
        api=ActivationApiOut(token=token, token_status="active", base_url=None),
        mqtt=ActivationMqttOut(
            host=settings.mqtt_host,
            port=settings.mqtt_port,
            tls=settings.mqtt_tls,
            username=device.mqtt_client_id or f"edge-{device.id}",
            password=token,
        ),
    )


async def find_activation_code(db: AsyncSession, code: str) -> DeviceActivationCode | None:
    return (
        await db.execute(
            select(DeviceActivationCode).where(
                DeviceActivationCode.code_hash == hash_activation_code(code)
            )
        )
    ).scalar_one_or_none()


async def consume_activation_code(
    db: AsyncSession, code_row: DeviceActivationCode
) -> DeviceActivationCode | None:
    """Atomic single-use consume. Returns the row, or None if a concurrent
    activation already consumed it."""
    now = datetime.now(timezone.utc)
    row = (
        await db.execute(
            update(DeviceActivationCode)
            .where(
                DeviceActivationCode.id == code_row.id,
                DeviceActivationCode.consumed_at.is_(None),
            )
            .values(consumed_at=now)
            .returning(DeviceActivationCode)
        )
    ).scalar_one_or_none()
    return row


def mint_device_credential(device: EdgeDevice) -> tuple[ApiCredential, str]:
    """(credential row, plaintext key) — caller adds the row to the session."""
    plain, prefix, hashed = new_api_key()
    cred = ApiCredential(
        tenant_id=device.tenant_id,
        edge_device_id=device.id,
        name=f"edge-device:{device.name}",
        key_prefix=prefix,
        key_hash=hashed,
        scopes=["edge:ingest", "edge:config"],
    )
    return cred, plain
