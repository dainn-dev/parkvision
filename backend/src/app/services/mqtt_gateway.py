"""MQTT ingestion gateway (runs as its own process: `python -m app.services.mqtt_gateway`).

Subscribes to tenants/{tid}/sites/{sid}/gates/{gate_key}/+ and dispatches on
the leaf topic:

  telemetry    → gate telemetry row (+ optional snapshot) + WS broadcast
                 payload {metric, valueNumeric|valueText|value, unit, snapshot,
                          type:"plate_read", plate, confidence, direction,
                          plateImageKey, overviewImageKey}
                 type:"state" updates gate state/position; type:"plate_read"
                 runs the access-rule engine and may issue an open command.
  incident     → barrier_incidents row + WS broadcast
                 {kind, severity, title, details}
  command_ack  → apply ack to gate_commands + notify waiter + WS
                 {commandId, success, error?, position?, state?}
"""

import asyncio
import json
import logging
import re
import uuid
from datetime import UTC, datetime

import aiomqtt
from sqlalchemy import select

from app.config import get_settings
from app.db.redis import get_redis, ws_channel
from app.db.session import system_session
from app.models.enums import ActorType, CommandStatus, EventDirection, IncidentSeverity
from app.models.events import AccessEvent, BarrierIncident, GateCommand, GateTelemetryLog
from app.models.sites import BarrierGate, EdgeDevice, TenantSite
from app.services import mqtt_client
from app.services.audit import audit
from app.services.rules_engine import evaluate_plate_read

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("mqtt_gateway")
settings = get_settings()

TOPIC_RE = re.compile(
    r"^tenants/(?P<tenant>[0-9a-fA-F-]{36})/sites/(?P<site>[0-9a-fA-F-]{36})/"
    r"gates/(?P<gate>[^/]+)/(?P<leaf>telemetry|incident|command_ack)$"
)


async def _redis_publish(tenant_id: uuid.UUID, event: dict) -> None:
    await get_redis().publish(ws_channel(tenant_id), json.dumps(event, default=str))


async def _gate_for(db, tenant_id: uuid.UUID, site_id: uuid.UUID, gate_key: str) -> BarrierGate | None:
    try:
        gate_uuid = uuid.UUID(gate_key)
    except ValueError:
        gate_uuid = None
    q = select(BarrierGate).where(BarrierGate.tenant_id == tenant_id, BarrierGate.site_id == site_id)
    q = q.where(BarrierGate.id == gate_uuid) if gate_uuid else q.where(BarrierGate.mqtt_gate_key == gate_key)
    return (await db.execute(q)).scalar_one_or_none()


async def handle_telemetry(tenant_id, site_id, gate_key: str, payload: dict) -> None:
    async with system_session(tenant_id) as db:
        gate = await _gate_for(db, tenant_id, site_id, gate_key)
        if gate is None:
            log.warning("telemetry for unknown gate %s@%s", gate_key, site_id)
            return

        msg_type = payload.get("type", "metric")
        now = datetime.now(UTC)
        event_base = {"gateId": str(gate.id), "siteId": str(site_id), "ts": now.isoformat()}

        if msg_type == "state":
            new_state = str(payload.get("state", "unknown"))
            gate.state = new_state
            if payload.get("position") is not None:
                gate.position = int(payload["position"])
            if payload.get("locked") is not None:
                gate.locked = bool(payload["locked"])
            gate.state_changed_at = now
            await db.commit()
            await _redis_publish(
                tenant_id,
                {
                    "type": "gate_state",
                    "state": new_state,
                    "position": gate.position,
                    "locked": gate.locked,
                    **event_base,
                },
            )
            return

        if msg_type == "plate_read":
            site = await db.get(TenantSite, site_id)
            if site is None:
                log.warning("plate_read for unknown site %s", site_id)
                return
            direction = payload.get("direction", "in")
            if direction not in (EventDirection.IN.value, EventDirection.OUT.value):
                direction = EventDirection.IN.value
            decision = await evaluate_plate_read(
                db,
                tenant_id=tenant_id,
                site=site,
                plate_raw=str(payload.get("plate", "")),
                direction=direction,
                gate_id=gate.id,
            )
            ev = AccessEvent(
                occurred_at=now,
                tenant_id=tenant_id,
                site_id=site_id,
                gate_id=gate.id,
                lane_id=gate.lane_id,
                edge_device_id=gate.edge_device_id,
                direction=direction,
                plate_text=payload.get("plate"),
                plate_confidence=payload.get("confidence"),
                vehicle_id=decision.vehicle_id,
                decision=decision.decision,
                rule_id=decision.rule_id,
                reason=decision.reason,
                plate_image_key=payload.get("plateImageKey"),
                overview_image_key=payload.get("overviewImageKey"),
                open_triggered=decision.open_gate,
                snapshot=payload.get("snapshot"),
            )
            db.add(ev)
            await db.flush()

            if decision.open_gate:
                cmd = GateCommand(
                    tenant_id=tenant_id,
                    site_id=site_id,
                    gate_id=gate.id,
                    action="open",
                    params={"source": "plate_read", "accessEventId": str(ev.id)},
                    status=CommandStatus.ACCEPTED.value,
                    idempotency_key=f"plate:{ev.id}",
                    requested_by_type=ActorType.SYSTEM.value,
                )
                db.add(cmd)
                await db.flush()
                ev.command_id = cmd.id
                try:
                    topic = await mqtt_client.publish_gate_command(
                        tenant_id,
                        site_id,
                        gate.mqtt_gate_key,
                        {
                            "commandId": str(cmd.id),
                            "action": "open",
                            "params": cmd.params,
                            "gateId": str(gate.id),
                            "issuedAt": now.isoformat(),
                        },
                    )
                    cmd.mqtt_topic = topic
                except Exception:
                    cmd.status = CommandStatus.FAILED.value
                    cmd.error = "mqtt publish failed"
                    ev.open_triggered = False

            await audit(
                db,
                action="access.plate_read",
                actor_type=ActorType.EDGE.value,
                tenant_id=tenant_id,
                target_type="access_event",
                target_id=str(ev.id),
                detail={"decision": decision.decision, "reason": decision.reason},
            )
            await db.commit()
            await _redis_publish(
                tenant_id,
                {
                    "type": "access_event",
                    "decision": decision.decision,
                    "plate": payload.get("plate"),
                    "reason": decision.reason,
                    "eventId": str(ev.id),
                    **event_base,
                },
            )
            return

        # regular metric telemetry
        value_numeric = payload.get("valueNumeric")
        if value_numeric is None and isinstance(payload.get("value"), int | float):
            value_numeric = payload["value"]
        row = GateTelemetryLog(
            recorded_at=now,
            tenant_id=tenant_id,
            site_id=site_id,
            gate_id=gate.id,
            edge_device_id=gate.edge_device_id,
            metric=str(payload.get("metric", msg_type))[:80],
            value_numeric=value_numeric,
            value_text=payload.get("valueText")
            or (payload.get("value") if not isinstance(payload.get("value"), int | float) else None),
            unit=payload.get("unit"),
            snapshot=payload.get("snapshot"),
        )
        db.add(row)
        device = None
        if gate.edge_device_id:
            device = await db.get(EdgeDevice, gate.edge_device_id)
            if device is not None:
                device.last_seen_at = now
                if device.status == "offline":
                    device.status = "online"
        await db.commit()
        await _redis_publish(
            tenant_id,
            {
                "type": "telemetry",
                "metric": row.metric,
                "valueNumeric": row.value_numeric,
                "valueText": row.value_text,
                "unit": row.unit,
                **event_base,
            },
        )


async def handle_incident(tenant_id, site_id, gate_key: str, payload: dict) -> None:
    async with system_session(tenant_id) as db:
        gate = await _gate_for(db, tenant_id, site_id, gate_key)
        severity = payload.get("severity", IncidentSeverity.WARNING.value)
        row = BarrierIncident(
            tenant_id=tenant_id,
            site_id=site_id,
            gate_id=gate.id if gate else None,
            edge_device_id=gate.edge_device_id if gate else None,
            kind=str(payload.get("kind", "other"))[:30],
            severity=severity,
            title=str(payload.get("title", "Edge incident"))[:300],
            details=payload.get("details") or {},
        )
        db.add(row)
        await db.flush()
        await audit(
            db,
            action="incident.reported",
            actor_type=ActorType.EDGE.value,
            tenant_id=tenant_id,
            target_type="barrier_incident",
            target_id=str(row.id),
            detail={"kind": row.kind, "severity": severity},
        )
        await db.commit()
        await _redis_publish(
            tenant_id,
            {
                "type": "incident",
                "incidentId": str(row.id),
                "kind": row.kind,
                "severity": severity,
                "title": row.title,
                "gateId": str(gate.id) if gate else None,
                "siteId": str(site_id),
                "ts": row.opened_at.isoformat() if row.opened_at else None,
            },
        )


async def handle_command_ack(tenant_id, site_id, gate_key: str, payload: dict) -> None:
    from app.services.commands import handle_ack

    raw_id = payload.get("commandId")
    try:
        command_id = uuid.UUID(str(raw_id))
    except (ValueError, TypeError):
        log.warning("command_ack without valid commandId: %s", payload)
        return
    async with system_session(tenant_id) as db:
        gate = await _gate_for(db, tenant_id, site_id, gate_key)
        await handle_ack(
            db,
            tenant_id=tenant_id,
            gate_id=gate.id if gate else uuid.UUID(int=0),
            command_id=command_id,
            ack=payload,
        )
        if gate is not None and payload.get("state"):
            gate.state = str(payload["state"])
            gate.state_changed_at = datetime.now(UTC)
        if gate is not None and payload.get("position") is not None:
            gate.position = int(payload["position"])
        await db.commit()


DISPATCH = {
    "telemetry": handle_telemetry,
    "incident": handle_incident,
    "command_ack": handle_command_ack,
}


async def main() -> None:
    tls = aiomqtt.TLSParameters() if settings.mqtt_tls else None
    while True:
        try:
            async with aiomqtt.Client(
                hostname=settings.mqtt_host,
                port=settings.mqtt_port,
                username=settings.mqtt_username or None,
                password=settings.mqtt_password or None,
                tls_params=tls,
                identifier="parkvision-mqtt-gateway",
            ) as client:
                await client.subscribe("tenants/+/sites/+/gates/+/telemetry", qos=1)
                await client.subscribe("tenants/+/sites/+/gates/+/incident", qos=1)
                await client.subscribe("tenants/+/sites/+/gates/+/command_ack", qos=1)
                log.info("mqtt gateway subscribed on %s:%s", settings.mqtt_host, settings.mqtt_port)
                async for message in client.messages:
                    m = TOPIC_RE.match(str(message.topic))
                    if m is None:
                        continue
                    try:
                        payload = json.loads(message.payload.decode() or "{}")
                    except (ValueError, UnicodeDecodeError):
                        payload = {"raw": message.payload.decode(errors="replace")}
                    handler = DISPATCH[m["leaf"]]
                    try:
                        await handler(uuid.UUID(m["tenant"]), uuid.UUID(m["site"]), m["gate"], payload)
                    except Exception:
                        log.exception("handler failed for %s", message.topic)
        except aiomqtt.MqttError as exc:
            log.warning("mqtt disconnected: %s — retrying in 5s", exc)
            await asyncio.sleep(5)


if __name__ == "__main__":
    asyncio.run(main())
