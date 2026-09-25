"""Standalone MQTT → DB + Redis ingest service.

Subscribes to ``tenants/+/sites/+/gates/+/{telemetry,incident,command-ack}``,
persists payloads, and republishes normalized events onto the tenant's Redis
channel for the WebSocket fanout.

Run: ``python -m app.realtime.mqtt_ingest``
"""

import asyncio
import json
import logging
import uuid
from datetime import UTC, datetime

import aiomqtt
from sqlalchemy import update

from app.core.config import get_settings
from app.db.session import tenant_session
from app.models import BarrierCommand, BarrierGate, BarrierIncident, EdgeDevice, GateTelemetryLog
from app.realtime.fanout import publish_event
from app.utils.misc import normalize_plate

log = logging.getLogger("mqtt_ingest")


def _parse_topic(topic: str) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID, str] | None:
    parts = topic.split("/")
    # tenants/{tid}/sites/{sid}/gates/{gid}/{leaf}
    try:
        if len(parts) == 7 and parts[2] == "sites" and parts[4] == "gates":
            return (
                uuid.UUID(parts[1]),
                uuid.UUID(parts[3]),
                uuid.UUID(parts[5]),
                parts[6],
            )
    except (ValueError, IndexError):
        return None
    return None


def _payload(raw: bytes) -> dict:
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {"value": data}
    except json.JSONDecodeError:
        return {"raw": raw.decode(errors="replace")}


def _ts(value) -> datetime:
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, UTC)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            pass
    return datetime.now(UTC)


async def handle_telemetry(tid, sid, gid, data: dict) -> None:
    state = data.get("gateState") or data.get("gate_state")
    recorded = _ts(data.get("recordedAt") or data.get("ts"))
    async with tenant_session(tid) as session:
        session.add(
            GateTelemetryLog(
                tenant_id=tid,
                gate_id=gid,
                site_id=sid,
                edge_device_id=_uuid_or_none(data.get("edgeDeviceId")),
                gate_state=state,
                temperature_c=data.get("temperatureC"),
                voltage_v=data.get("voltageV"),
                motor_current_a=data.get("motorCurrentA"),
                obstruction=data.get("obstruction"),
                rssi_dbm=data.get("rssiDbm"),
                uptime_s=data.get("uptimeS"),
                recorded_at=recorded,
                payload=data,
            )
        )
        if state:
            await session.execute(
                update(BarrierGate)
                .where(BarrierGate.id == gid)
                .values(state=state, state_updated_at=recorded)
            )
        device_id = _uuid_or_none(data.get("edgeDeviceId"))
        if device_id:
            await session.execute(
                update(EdgeDevice)
                .where(EdgeDevice.id == device_id)
                .values(status="online", last_heartbeat_at=recorded)
            )
    await publish_event(
        tid,
        "telemetry",
        {"gateId": str(gid), "siteId": str(sid), "gateState": state,
         "recordedAt": recorded.isoformat()},
    )


async def handle_incident(tid, sid, gid, data: dict) -> None:
    async with tenant_session(tid) as session:
        incident = BarrierIncident(
            tenant_id=tid,
            site_id=sid,
            gate_id=gid,
            edge_device_id=_uuid_or_none(data.get("edgeDeviceId")),
            type=data.get("type", "hardware"),
            severity=data.get("severity", "warning"),
            title=data.get("title", ""),
            detail=data,
        )
        session.add(incident)
        await session.flush()
        incident_id = str(incident.id)
    await publish_event(
        tid,
        "incident",
        {"incidentId": incident_id, "gateId": str(gid), "siteId": str(sid),
         "type": data.get("type"), "severity": data.get("severity", "warning")},
    )


async def handle_command_ack(tid, sid, gid, data: dict) -> None:
    command_id = _uuid_or_none(data.get("commandId"))
    if not command_id:
        return
    status = data.get("status", "acknowledged")
    async with tenant_session(tid) as session:
        await session.execute(
            update(BarrierCommand)
            .where(BarrierCommand.id == command_id)
            .values(
                status=status,
                ack_at=datetime.now(UTC),
                result=data.get("result", data),
            )
        )
    await publish_event(
        tid,
        "command",
        {"commandId": str(command_id), "gateId": str(gid), "status": status},
    )


async def handle_access_event(tid, sid, gid, data: dict) -> None:
    """Edge-reported plate read → access_events row + WS notification."""
    from app.models import AccessEvent

    occurred = _ts(data.get("occurredAt") or data.get("ts"))
    async with tenant_session(tid) as session:
        ev = AccessEvent(
            tenant_id=tid,
            site_id=sid,
            gate_id=gid,
            direction=data.get("direction", "entry"),
            plate_number=data.get("plateNumber", ""),
            normalized_plate=normalize_plate(data.get("plateNumber", "")),
            vehicle_id=_uuid_or_none(data.get("vehicleId")),
            decision=data.get("decision", "manual"),
            reason=data.get("reason", ""),
            plate_image_key=data.get("plateImageKey"),
            overview_image_key=data.get("overviewImageKey"),
            confidence=data.get("confidence"),
            occurred_at=occurred,
            payload=data,
        )
        session.add(ev)
        await session.flush()
        event_id = str(ev.event_id)
    await publish_event(
        tid,
        "access_event",
        {
            "eventId": event_id,
            "gateId": str(gid),
            "siteId": str(sid),
            "plateNumber": data.get("plateNumber", ""),
            "decision": data.get("decision"),
            "occurredAt": occurred.isoformat(),
        },
    )


def _uuid_or_none(value) -> uuid.UUID | None:
    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except ValueError:
        return None


HANDLERS = {
    "telemetry": handle_telemetry,
    "incident": handle_incident,
    "command-ack": handle_command_ack,
    "event": handle_access_event,
    "access-event": handle_access_event,
}


async def run() -> None:
    s = get_settings()
    topic = f"{s.mqtt_topic_prefix}/+/sites/+/gates/+/#"
    log.info("MQTT ingest subscribing to %s on %s:%s", topic, s.mqtt_host, s.mqtt_port)
    while True:
        try:
            async with aiomqtt.Client(
                hostname=s.mqtt_host,
                port=s.mqtt_port,
                username=s.mqtt_username,
                password=s.mqtt_password,
            ) as client:
                await client.subscribe(topic, qos=1)
                async for message in client.messages:
                    parsed = _parse_topic(str(message.topic))
                    if not parsed:
                        continue
                    tid, sid, gid, leaf = parsed
                    handler = HANDLERS.get(leaf)
                    if handler is None:
                        continue
                    try:
                        await handler(tid, sid, gid, _payload(message.payload))
                    except Exception:
                        log.exception("handler failed for %s", message.topic)
        except aiomqtt.MqttError:
            log.exception("MQTT connection lost; retrying in 3s")
            await asyncio.sleep(3)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run())
