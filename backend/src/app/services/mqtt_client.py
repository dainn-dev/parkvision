"""MQTT publisher for gate commands (API process side).

A single aiomqtt client with a reconnect loop publishes command payloads on
`tenants/{tid}/sites/{sid}/gates/{gate_key}/command`. Subscriber-side logic
lives in app.services.mqtt_gateway.
"""

import asyncio
import json
import logging

import aiomqtt

from app.config import get_settings

log = logging.getLogger(__name__)
settings = get_settings()

COMMAND_TOPIC = "tenants/{tenant_id}/sites/{site_id}/gates/{gate_key}/command"

_lock = asyncio.Lock()
_client: aiomqtt.Client | None = None
_connected = False


async def _ensure_client() -> aiomqtt.Client:
    global _client, _connected
    async with _lock:
        if _client is not None and _connected:
            return _client
        tls = aiomqtt.TLSParameters() if settings.mqtt_tls else None
        client = aiomqtt.Client(
            hostname=settings.mqtt_host,
            port=settings.mqtt_port,
            username=settings.mqtt_username or None,
            password=settings.mqtt_password or None,
            tls_params=tls,
            identifier="parkvision-api",
        )
        await client.__aenter__()
        _client = client
        _connected = True
        return client


async def publish_gate_command(tenant_id, site_id, gate_key: str, payload: dict) -> str:
    """Publish a command payload; returns the topic used."""
    topic = COMMAND_TOPIC.format(tenant_id=tenant_id, site_id=site_id, gate_key=gate_key)
    try:
        client = await _ensure_client()
        await client.publish(topic, json.dumps(payload), qos=1)
    except Exception:
        global _connected
        _connected = False
        log.exception("mqtt publish failed on %s", topic)
        raise
    return topic
