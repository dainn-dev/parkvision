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
import json
import logging
import re
import ssl
import uuid
from datetime import datetime, timezone

import aiomqtt
from sqlalchemy import update

from app.config import settings
from app.core.enums import EventSource
from app.database import platform_session
from app.models import BarrierGate, BarrierIncident, EdgeDevice, GateTelemetryLog
from app.redis_client import get_redis, ws_channel
from app.services.command_service import MQTT_OUTBOX_KEY, mark_command_ack
from app.services.event_service import record_access_event

log = logging.getLogger("mqtt-bridge")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

TOPIC_RE = re.compile(
    r"^tenants/(?P<tenant>[^/]+)/sites/(?P<site>[^/]+)/gates/(?P<gate>[^/]+)/(?P<kind>telemetry|incident|command)$"
)
SUBSCRIPTIONS = [
    ("tenants/+/sites/+/gates/+/telemetry", 1),
    ("tenants/+/sites/+/gates/+/incident", 1),
    ("tenants/+/sites/+/gates/+/command", 1),
]


async def publish_ws(tenant_id: str, message: dict) -> None:
    await get_redis().publish(ws_channel(tenant_id), json.dumps(message))


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
        if kind == "heartbeat" and payload.get("deviceId"):
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
                .where(EdgeDevice.id == uuid.UUID(payload["deviceId"]))
                .values(**device_updates)
            )
        # ANPR event piggy-backed on telemetry: record an access event too.
        if payload.get("plateNumber"):
            await record_access_event(
                db,
                tenant_id=tid,
                site_id=uuid.UUID(site_id),
                gate_id=gid,
                lane_id=uuid.UUID(payload["laneId"]) if payload.get("laneId") else None,
                plate_number=payload["plateNumber"],
                direction=payload.get("direction", "entry"),
                source=EventSource.ANPR,
                confidence=payload.get("confidence"),
                plate_image_url=payload.get("plateImageKey"),
                overview_image_url=payload.get("overviewImageKey"),
                occurred_at=now,
            )
    await publish_ws(tenant_id, {"type": "telemetry", "siteId": site_id, "gateId": gate_id, **payload})


async def handle_incident(tenant_id: str, site_id: str, gate_id: str, payload: dict) -> None:
    tid = uuid.UUID(tenant_id)
    async with platform_session() as db:
        db.add(
            BarrierIncident(
                tenant_id=tid,
                site_id=uuid.UUID(site_id),
                gate_id=uuid.UUID(gate_id),
                edge_device_id=uuid.UUID(payload["deviceId"]) if payload.get("deviceId") else None,
                type=payload.get("type", "fault"),
                title=payload.get("title") or payload.get("message"),
                severity=str(payload.get("severity", "medium")).lower(),
                description=payload.get("description") or payload.get("message"),
                telemetry_snapshot=payload,
                snapshot_urls=payload.get("snapshotUrls", []),
            )
        )
    await publish_ws(tenant_id, {"type": "incident", "siteId": site_id, "gateId": gate_id, **payload})


async def dispatch(topic: str, body: bytes) -> None:
    m = TOPIC_RE.match(topic)
    if not m:
        log.warning("ignoring unmatched topic %s", topic)
        return
    try:
        payload = json.loads(body or b"{}")
    except json.JSONDecodeError:
        log.warning("invalid JSON on %s", topic)
        return
    kind = m.group("kind")
    try:
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
