"""One-shot MQTT publish helpers (gate commands) used by the API process."""

import json
import uuid

import aiomqtt

from app.core.config import get_settings


def gate_topic(
    tenant_id: uuid.UUID, site_id: uuid.UUID, gate_id: uuid.UUID, leaf: str
) -> str:
    s = get_settings()
    return f"{s.mqtt_topic_prefix}/{tenant_id}/sites/{site_id}/gates/{gate_id}/{leaf}"


async def publish_gate_command(
    *,
    tenant_id: uuid.UUID,
    site_id: uuid.UUID,
    gate_id: uuid.UUID,
    command_id: uuid.UUID,
    action: str,
    params: dict,
) -> None:
    s = get_settings()
    payload = json.dumps(
        {"commandId": str(command_id), "action": action, "params": params}
    )
    async with aiomqtt.Client(
        hostname=s.mqtt_host,
        port=s.mqtt_port,
        username=s.mqtt_username,
        password=s.mqtt_password,
    ) as client:
        await client.publish(gate_topic(tenant_id, site_id, gate_id, "command"), payload, qos=1)
