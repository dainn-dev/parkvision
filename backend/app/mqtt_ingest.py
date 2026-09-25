"""Standalone MQTT → DB/Redis ingestion service.

Subscribes to `tenants/+/sites/+/gates/+/+` on EMQX. Edge payloads:
  telemetry    {"state": "...", "metrics": {...}}
  incident     {"kind": "...", "severity": "...", "title": "...", "detail": {...}}
  command-ack  {"commandId": "...", "status": "acknowledged|executed|failed", "error": "..."}
  event        ANPR/access event produced by the edge (optional)

Run: `python -m app.mqtt_ingest` or `parkvision-mqtt-ingest`.
"""

import asyncio
import json
import logging
from datetime import UTC, datetime
from uuid import UUID

import aiomqtt
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_session_factory
from app.core.redis_client import get_redis, telemetry_channel
from app.models import (
    AccessEvent,
    BarrierGate,
    BarrierIncident,
    EdgeDevice,
    GateTelemetryLog,
)
from app.models.enums import IncidentStatus
from app.services.commands import handle_command_ack
from app.services.importer import normalize_plate

log = logging.getLogger("parkvision.mqtt_ingest")

TOPIC = "tenants/+/sites/+/gates/+/+"


def _parse_topic(topic: str) -> tuple[UUID, UUID, UUID, str] | None:
    parts = topic.split("/")
    if len(parts) != 8 or parts[0] != "tenants" or parts[2] != "sites" or parts[4] != "gates":
        return None
    try:
        return UUID(parts[1]), UUID(parts[3]), UUID(parts[5]), parts[7]
    except ValueError:
        return None


async def _scoped_session(tenant_id: UUID) -> AsyncSession:
    """Session with RLS context so tenant isolation policies apply."""
    session = get_session_factory()()
    await session.begin()
    await session.execute(
        text("SELECT set_config('app.current_tenant_id', :t, true)"), {"t": str(tenant_id)}
    )
    await session.execute(text("SELECT set_config('app.is_platform_admin', 'false', true)"))
    return session


async def handle_message(topic: str, payload: bytes) -> None:
    parsed = _parse_topic(topic)
    if parsed is None:
        log.warning("ignoring message on unexpected topic %s", topic)
        return
    tenant_id, site_id, gate_id, leaf = parsed

    try:
        data = json.loads(payload.decode())
    except (UnicodeDecodeError, json.JSONDecodeError):
        log.warning("malformed JSON on %s", topic)
        return

    session = await _scoped_session(tenant_id)
    try:
        if leaf == "telemetry":
            await _handle_telemetry(session, tenant_id, site_id, gate_id, data)
        elif leaf == "incident":
            await _handle_incident(session, tenant_id, site_id, gate_id, data)
        elif leaf == "command-ack":
            await handle_command_ack(session, data)
        elif leaf == "event":
            await _handle_event(session, tenant_id, site_id, gate_id, data)
        else:
            log.debug("unhandled leaf topic %s", leaf)
            return
        await session.commit()
    except Exception:
        await session.rollback()
        log.exception("failed to handle %s", topic)
    finally:
        await session.close()


async def _handle_telemetry(
    db: AsyncSession, tenant_id: UUID, site_id: UUID, gate_id: UUID, data: dict
) -> None:
    recorded = _parse_ts(data.get("recordedAt") or data.get("ts"))
    state = data.get("state")
    metrics = data.get("metrics") or {}
    device_id = data.get("edgeDeviceId")

    db.add(
        GateTelemetryLog(
            recorded_at=recorded,
            tenant_id=tenant_id,
            site_id=site_id,
            gate_id=gate_id,
            edge_device_id=UUID(device_id) if device_id else None,
            state=state,
            metrics=metrics,
        )
    )

    gate = await db.get(BarrierGate, gate_id)
    if gate is not None and state and gate.state != state:
        gate.state = state
        gate.last_state_change_at = recorded

    if device_id:
        device = await db.get(EdgeDevice, UUID(device_id))
        if device is not None:
            device.last_seen_at = recorded
            if device.status == "offline":
                device.status = "online"

    await get_redis().publish(
        telemetry_channel(str(tenant_id)),
        json.dumps(
            {
                "kind": "telemetry",
                "tenantId": str(tenant_id),
                "siteId": str(site_id),
                "gateId": str(gate_id),
                "state": state,
                "metrics": metrics,
                "recordedAt": recorded.isoformat(),
            }
        ),
    )


async def _handle_incident(
    db: AsyncSession, tenant_id: UUID, site_id: UUID, gate_id: UUID, data: dict
) -> None:
    incident = BarrierIncident(
        tenant_id=tenant_id,
        site_id=site_id,
        gate_id=gate_id,
        kind=str(data.get("kind", "fault"))[:40],
        severity=str(data.get("severity", "warning"))[:10],
        status=IncidentStatus.OPEN,
        title=str(data.get("title", "Edge incident"))[:200],
        detail=data.get("detail") or {},
    )
    db.add(incident)
    await db.flush()
    await get_redis().publish(
        telemetry_channel(str(tenant_id)),
        json.dumps(
            {
                "kind": "incident",
                "tenantId": str(tenant_id),
                "incidentId": str(incident.id),
                "gateId": str(gate_id),
                "severity": incident.severity,
                "title": incident.title,
            }
        ),
    )


async def _handle_event(
    db: AsyncSession, tenant_id: UUID, site_id: UUID, gate_id: UUID, data: dict
) -> None:
    occurred = _parse_ts(data.get("occurredAt") or data.get("ts"))
    event = AccessEvent(
        occurred_at=occurred,
        tenant_id=tenant_id,
        site_id=site_id,
        gate_id=gate_id,
        lane_id=UUID(data["laneId"]) if data.get("laneId") else None,
        edge_device_id=UUID(data["edgeDeviceId"]) if data.get("edgeDeviceId") else None,
        direction=data.get("direction"),
        plate_raw=data.get("plateRaw"),
        plate_normalized=normalize_plate(data["plateRaw"]) if data.get("plateRaw") else None,
        confidence=data.get("confidence"),
        vehicle_id=UUID(data["vehicleId"]) if data.get("vehicleId") else None,
        decision=data.get("decision", "review"),
        reason=data.get("reason"),
        plate_image_key=data.get("plateImageKey"),
        overview_image_key=data.get("overviewImageKey"),
        processing_ms=data.get("processingMs"),
        metadata_=data.get("metadata") or {},
    )
    db.add(event)


def _parse_ts(value) -> datetime:
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            pass
    return datetime.now(UTC)


async def run_ingest() -> None:
    settings = get_settings()
    async with aiomqtt.Client(
        hostname=settings.mqtt_host,
        port=settings.mqtt_port,
        username=settings.mqtt_username or None,
        password=settings.mqtt_password or None,
        tls_params=None if not settings.mqtt_tls else aiomqtt.TLSParameters(),
    ) as client:
        await client.subscribe(TOPIC, qos=1)
        log.info("subscribed to %s", TOPIC)
        async for message in client.messages:
            await handle_message(str(message.topic), message.payload)


def run() -> None:
    logging.basicConfig(level=logging.INFO)
    while True:
        try:
            asyncio.run(run_ingest())
        except KeyboardInterrupt:
            raise
        except Exception:
            log.exception("ingest crashed; restarting in 5s")
            try:
                asyncio.run(asyncio.sleep(5))
            except KeyboardInterrupt:
                raise


if __name__ == "__main__":
    run()
