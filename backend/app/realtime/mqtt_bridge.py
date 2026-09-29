"""MQTT bridge: EMQX <-> PostgreSQL + Redis fan-out.

Consumes `tenants/{tid}/sites/{sid}/gates/{gid}/{telemetry|incident|command}`:
- telemetry -> gate_telemetry_logs + gate status + WS publish
- incident  -> barrier_incidents + WS publish
- telemetry payload with type=command_ack -> gate_commands ack/failed

Outbound: drains Redis list `mqtt:outbox` (BRPOP) and publishes to EMQX,
so API workers never hold MQTT connections themselves.

Run: `python -m app.realtime.mqtt_bridge` (the mqtt-bridge container).
"""

import asyncio
import contextlib
import json
import logging
import re
import ssl
import uuid
from datetime import datetime, timezone

import aiomqtt
from sqlalchemy import select, update

from app.config import settings
from app.core.enums import EventSource
from app.database import platform_session
from app.models import (
    BarrierGate,
    BarrierIncident,
    Camera,
    EdgeDevice,
    GateTelemetryLog,
    ParkingZone,
)
from app.redis_client import get_redis, ws_channel
from app.services.command_service import MQTT_OUTBOX_KEY, mark_command_ack
from app.services.event_service import record_access_event
from app.services.parking_service import (
    mark_presence_exit,
    record_detection,
    resolve_zone,
)

log = logging.getLogger("mqtt-bridge")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

TOPIC_RE = re.compile(
    r"^tenants/(?P<tenant>[^/]+)/sites/(?P<site>[^/]+)/gates/(?P<gate>[^/]+)/(?P<kind>telemetry|incident|command)$"
)
CAMERA_TOPIC_RE = re.compile(
    r"^tenants/(?P<tenant>[^/]+)/sites/(?P<site>[^/]+)/cameras/(?P<camera>[^/]+)/(?P<kind>detection)$"
)
SUBSCRIPTIONS = [
    ("tenants/+/sites/+/gates/+/telemetry", 1),
    ("tenants/+/sites/+/gates/+/incident", 1),
    ("tenants/+/sites/+/gates/+/command", 1),
    ("tenants/+/sites/+/cameras/+/detection", 1),
]


async def publish_ws(tenant_id: str, message: dict) -> None:
    """Best-effort WS fan-out — a Redis hiccup must not fail the caller
    (rows are already persisted by the time this runs)."""
    try:
        await get_redis().publish(ws_channel(tenant_id), json.dumps(message))
    except Exception as exc:
        log.warning("publish_ws failed for tenant %s: %s", tenant_id, exc)


async def handle_telemetry(tenant_id: str, site_id: str, gate_id: str, payload: dict) -> None:
    kind = payload.get("type", "telemetry")
    now = datetime.now(timezone.utc)
    tid, gid = uuid.UUID(tenant_id), uuid.UUID(gate_id)

    if kind == "command_ack":
        command_id = payload.get("commandId")
        if command_id:
            async with platform_session() as db:
                await mark_command_ack(
                    db,
                    uuid.UUID(command_id),
                    success=bool(payload.get("success", True)),
                    error=payload.get("error"),
                )
        await publish_ws(tenant_id, {"type": "command_ack", "gateId": gate_id, **payload})
        return

    async with platform_session() as db:
        db.add(
            GateTelemetryLog(
                tenant_id=tid,
                gate_id=gid,
                recorded_at=now,
                state=payload.get("state"),
                payload=payload,
            )
        )
        state = payload.get("state") or payload.get("status")
        gate_updates: dict = {}
        if state:
            gate_updates["status"] = str(state).lower()
            gate_updates["last_state_change_at"] = now
        for payload_key, column in (
            ("armAngleDeg", "arm_angle_deg"),
            ("motorTempC", "motor_temperature_c"),
            ("relayState", "relay_state"),
            ("loopDetectorActive", "loop_detector_active"),
            ("upsBattery", "ups_battery_pct"),
            ("upsBatteryPercent", "ups_battery_pct"),
            ("dailyCycles", "daily_cycles_count"),
            ("lifetimeCycles", "total_lifetime_cycles"),
            ("lastPlate", "last_passage_plate"),
            ("lastActionBy", "last_action_by"),
            ("warningNote", "warning_note"),
        ):
            if payload.get(payload_key) is not None:
                gate_updates[column] = payload[payload_key]
        if gate_updates.get("relay_state") is not None:
            gate_updates["relay_state"] = str(gate_updates["relay_state"]).lower()
        if gate_updates:
            await db.execute(
                update(BarrierGate)
                .where(BarrierGate.id == gid, BarrierGate.tenant_id == tid)
                .values(**gate_updates)
            )
        if kind == "heartbeat" and _uuid_or_none(payload.get("deviceId")):
            device_updates: dict = {"last_heartbeat_at": now, "status": "online"}
            for payload_key, column in (
                ("cpuUsagePct", "cpu_usage_pct"),
                ("ramUsagePct", "ram_usage_pct"),
                ("storageUsagePct", "storage_usage_pct"),
                ("latencyMs", "latency_ms"),
            ):
                if payload.get(payload_key) is not None:
                    device_updates[column] = payload[payload_key]
            await db.execute(
                update(EdgeDevice)
                .where(
                    EdgeDevice.id == _uuid_or_none(payload["deviceId"]),
                    EdgeDevice.status != "decommissioned",
                )
                .values(**device_updates)
            )
        # ANPR event piggy-backed on telemetry: record an access event too.
        access_event = None
        if payload.get("plateNumber"):
            access_event = await record_access_event(
                db,
                tenant_id=tid,
                site_id=uuid.UUID(site_id),
                gate_id=gid,
                lane_id=_uuid_or_none(payload.get("laneId")),
                plate_number=str(payload["plateNumber"])[:20],
                direction=payload.get("direction", "entry"),
                source=EventSource.ANPR,
                confidence=payload.get("confidence"),
                plate_image_url=payload.get("plateImageKey"),
                overview_image_url=payload.get("overviewImageKey"),
                occurred_at=now,
            )
    await publish_ws(tenant_id, {"type": "telemetry", "siteId": site_id, "gateId": gate_id, **payload})
    if access_event is not None:
        await publish_ws(
            tenant_id,
            {
                "type": "access",
                "event": {
                    "id": str(access_event.id),
                    "siteId": str(access_event.site_id),
                    "gateId": str(access_event.gate_id),
                    "laneId": str(access_event.lane_id) if access_event.lane_id else None,
                    "plateNumber": access_event.plate_number,
                    "direction": access_event.direction,
                    "decision": access_event.decision,
                    "source": access_event.source,
                    "confidence": access_event.confidence,
                    "occurredAt": access_event.occurred_at.isoformat(),
                },
            },
        )


def _uuid_or_none(value) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(value)) if value is not None else None
    except (ValueError, AttributeError, TypeError):
        return None


async def handle_incident(tenant_id: str, site_id: str, gate_id: str, payload: dict) -> None:
    tid = uuid.UUID(tenant_id)
    gid = uuid.UUID(gate_id)
    incident_type = payload.get("type", "fault")
    async with platform_session() as db:
        # Dedup: don't stack a new open incident while one of the same
        # gate+type is still open/acknowledged — still forward the WS frame.
        existing = (
            await db.execute(
                select(BarrierIncident.id)
                .where(
                    BarrierIncident.tenant_id == tid,
                    BarrierIncident.gate_id == gid,
                    BarrierIncident.type == incident_type,
                    BarrierIncident.status.in_(["open", "acknowledged"]),
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        if existing is None:
            db.add(
                BarrierIncident(
                    tenant_id=tid,
                    site_id=uuid.UUID(site_id),
                    gate_id=gid,
                    edge_device_id=_uuid_or_none(payload.get("deviceId")),
                    type=incident_type,
                    title=payload.get("title") or payload.get("message"),
                    severity=str(payload.get("severity", "medium")).lower(),
                    description=payload.get("description") or payload.get("message"),
                    telemetry_snapshot=payload,
                    snapshot_urls=payload.get("snapshotUrls", []),
                )
            )
    await publish_ws(tenant_id, {"type": "incident", "siteId": site_id, "gateId": gate_id, **payload})


def _presence_frame(presence, zone: ParkingZone | None) -> dict:
    return {
        "id": str(presence.id),
        "plateNumber": presence.plate_number,
        "status": presence.status,
        "zoneId": str(presence.zone_id) if presence.zone_id else None,
        "levelId": str(presence.level_id) if presence.level_id else None,
        "zoneCode": zone.code if zone else None,
        "zoneName": zone.name if zone else None,
        "lastSeenAt": presence.last_seen_at.isoformat() if presence.last_seen_at else None,
    }


async def handle_detection(tenant_id: str, site_id: str, camera_id: str, payload: dict) -> None:
    """Monitor-camera detections (docs/mqtt-camera-detection.md).

    vehicle_parked / vehicle_seen -> presence upsert (+relocated) + WS frame
    vehicle_left                  -> presence exited + WS frame
    zone_snapshot                 -> cameras.last_snapshot_key + WS frame
    """
    dtype = payload.get("type", "vehicle_parked")
    tid = uuid.UUID(tenant_id)
    cid = _uuid_or_none(camera_id)
    if cid is None:
        log.warning("detection with invalid camera id on %s", camera_id)
        return
    now = datetime.now(timezone.utc)
    if payload.get("occurredAt"):
        with contextlib.suppress(ValueError, TypeError):
            now = datetime.fromisoformat(str(payload["occurredAt"]))

    frame = None
    async with platform_session() as db:
        camera = (
            await db.execute(select(Camera).where(Camera.id == cid, Camera.tenant_id == tid))
        ).scalar_one_or_none()
        if camera is None:
            log.warning("detection for unknown camera %s (tenant %s)", camera_id, tenant_id)
            return

        if dtype in ("vehicle_parked", "vehicle_seen"):
            plate = payload.get("plateNumber")
            if not plate:
                log.warning("%s without plateNumber from camera %s", dtype, camera_id)
                return
            zone = await resolve_zone(
                db,
                tenant_id=tid,
                camera=camera,
                zone_id=_uuid_or_none(payload.get("zoneId")),
                zone_code=payload.get("zoneCode"),
            )
            if zone is None:
                log.info(
                    "unresolved zone for detection from camera %s (tenant %s)",
                    camera_id,
                    tenant_id,
                )
            presence, event_type = await record_detection(
                db,
                tenant_id=tid,
                site_id=camera.site_id,
                camera_id=camera.id,
                zone=zone,
                plate_number=str(plate),
                confidence=payload.get("confidence"),
                occurred_at=now,
                payload=payload,
            )
            frame = {
                "type": "vehicle_location",
                "siteId": site_id,
                "cameraId": camera_id,
                "eventType": event_type,
                "presence": _presence_frame(presence, zone),
            }
        elif dtype == "vehicle_left":
            plate = payload.get("plateNumber")
            if not plate:
                log.warning("vehicle_left without plateNumber from camera %s", camera_id)
                return
            presence = await mark_presence_exit(
                db,
                tenant_id=tid,
                plate_number=str(plate),
                camera_id=camera.id,
                zone_id=_uuid_or_none(payload.get("zoneId")),
            )
            if presence is not None:
                zone = None
                if presence.zone_id is not None:
                    zone = await db.get(ParkingZone, presence.zone_id)
                frame = {
                    "type": "vehicle_location",
                    "siteId": site_id,
                    "cameraId": camera_id,
                    "eventType": "exited",
                    "presence": _presence_frame(presence, zone),
                }
        elif dtype == "zone_snapshot":
            key = payload.get("snapshotKey")
            if key:
                camera.last_snapshot_key = str(key)
                camera.snapshot_captured_at = now
                await db.flush()
            frame = {
                "type": "camera_snapshot",
                "siteId": site_id,
                "cameraId": camera_id,
                "snapshotKey": key,
            }
        else:
            log.warning("unknown detection type %r from camera %s", dtype, camera_id)
            return

    if frame is not None:
        await publish_ws(tenant_id, frame)


async def dispatch(topic: str, body: bytes) -> None:
    m = TOPIC_RE.match(topic)
    cam_m = CAMERA_TOPIC_RE.match(topic)
    if not m and not cam_m:
        log.warning("ignoring unmatched topic %s", topic)
        return
    try:
        payload = json.loads(body or b"{}")
    except json.JSONDecodeError:
        log.warning("invalid JSON on %s", topic)
        return
    try:
        if cam_m:
            await handle_detection(cam_m.group("tenant"), cam_m.group("site"), cam_m.group("camera"), payload)
            return
        kind = m.group("kind")
        if kind == "telemetry":
            await handle_telemetry(m.group("tenant"), m.group("site"), m.group("gate"), payload)
        elif kind == "incident":
            await handle_incident(m.group("tenant"), m.group("site"), m.group("gate"), payload)
        # kind == "command" messages are edge-bound; backend ignores its own echo.
    except Exception:
        log.exception("failed handling %s", topic)


async def mqtt_consumer(client: aiomqtt.Client) -> None:
    async for message in client.messages:
        await dispatch(str(message.topic), message.payload)


async def outbox_publisher(client: aiomqtt.Client) -> None:
    """Drain Redis `mqtt:outbox` and publish to EMQX."""
    redis = get_redis()
    while True:
        item = await redis.brpop(MQTT_OUTBOX_KEY, timeout=5)
        if item is None:
            continue
        try:
            msg = json.loads(item[1])
            await client.publish(msg["topic"], json.dumps(msg["payload"]), qos=1)
        except Exception:
            log.exception("failed publishing outbox message")


async def run() -> None:
    tls = ssl.create_default_context() if settings.mqtt_tls else None
    while True:
        try:
            async with aiomqtt.Client(
                hostname=settings.mqtt_host,
                port=settings.mqtt_port,
                username=settings.mqtt_username,
                password=settings.mqtt_password,
                tls_context=tls,
            ) as client:
                for topic, qos in SUBSCRIPTIONS:
                    await client.subscribe(topic, qos=qos)
                log.info("subscribed to %d topic patterns", len(SUBSCRIPTIONS))
                consumer = asyncio.create_task(mqtt_consumer(client))
                publisher = asyncio.create_task(outbox_publisher(client))
                done, pending = await asyncio.wait({consumer, publisher}, return_when=asyncio.FIRST_EXCEPTION)
                for task in pending:
                    task.cancel()
                for task in done:
                    if task.exception() is not None:
                        raise task.exception()
        except aiomqtt.MqttError as exc:
            log.error("MQTT connection lost (%s); reconnecting in 5s", exc)
            await asyncio.sleep(5)
        except Exception:
            log.exception("bridge crashed; restarting in 5s")
            await asyncio.sleep(5)


if __name__ == "__main__":
    asyncio.run(run())
