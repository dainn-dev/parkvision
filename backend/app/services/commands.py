"""Gate command lifecycle: create → publish via MQTT → ack/timeout.

The API process publishes commands through a lightweight aiomqtt client
(shared, lazily connected). The ingest service updates command rows when the
edge posts acknowledgements on `.../command-ack`.
"""

import json
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import aiomqtt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import bad_request
from app.models import BarrierGate, GateCommand
from app.models.enums import CommandAction, CommandStatus

_publisher: aiomqtt.Client | None = None


async def _mqtt_client() -> aiomqtt.Client:
    global _publisher
    if _publisher is None:
        s = get_settings()
        _publisher = aiomqtt.Client(
            hostname=s.mqtt_host,
            port=s.mqtt_port,
            username=s.mqtt_username or None,
            password=s.mqtt_password or None,
            tls_params=None if not s.mqtt_tls else aiomqtt.TLSParameters(),
        )
        await _publisher.__aenter__()
    return _publisher


async def close_publisher() -> None:
    global _publisher
    if _publisher is not None:
        try:
            await _publisher.__aexit__(None, None, None)
        finally:
            _publisher = None


def command_topic(tenant_id: UUID, site_id: UUID, gate_id: UUID) -> str:
    return f"tenants/{tenant_id}/sites/{site_id}/gates/{gate_id}/command"


async def create_command(
    db: AsyncSession,
    *,
    gate: BarrierGate,
    action: str,
    requested_by_kind: str,
    requested_by_id: UUID,
    command_key: str | None,
    payload: dict,
) -> tuple[GateCommand, bool]:
    """Idempotent creation: an existing command_key returns (row, False)."""
    if action not in CommandAction:
        raise bad_request(f"Unknown action '{action}'")
    key = command_key or uuid4().hex

    existing = await db.execute(
        GateCommand.__table__.select().where(GateCommand.command_key == key)
    )
    row = existing.mappings().first()
    if row is not None:
        return await db.get(GateCommand, row["id"]), True  # type: ignore[return-value]

    settings = get_settings()
    now = datetime.now(UTC)
    command = GateCommand(
        command_key=key,
        tenant_id=gate.tenant_id,
        site_id=gate.site_id,
        gate_id=gate.id,
        action=action,
        payload=payload,
        status=CommandStatus.PENDING,
        requested_by_kind=requested_by_kind,
        requested_by_id=requested_by_id,
        timeout_at=now + timedelta(seconds=settings.gate_command_timeout_seconds),
    )
    db.add(command)
    await db.flush()

    message = json.dumps(
        {
            "commandId": str(command.id),
            "commandKey": key,
            "action": action,
            "payload": payload,
            "issuedAt": now.isoformat(),
            "timeoutAt": command.timeout_at.isoformat(),
        }
    )
    try:
        client = await _mqtt_client()
        await client.publish(
            command_topic(gate.tenant_id, gate.site_id, gate.id),
            message,
            qos=1,
        )
        command.status = CommandStatus.SENT
        command.sent_at = datetime.now(UTC)
    except Exception as exc:  # broker unreachable — command stays retryable
        command.status = CommandStatus.FAILED
        command.error = f"publish_failed: {exc!r}"[:500]
    await db.flush()
    return command, False


async def handle_command_ack(db: AsyncSession, payload: dict) -> None:
    """Update command lifecycle from an edge `command-ack` payload."""
    command_id = payload.get("commandId")
    if not command_id:
        return
    try:
        command = await db.get(GateCommand, UUID(str(command_id)))
    except (ValueError, TypeError):
        return
    if command is None:
        return
    status = str(payload.get("status", "")).lower()
    now = datetime.now(UTC)
    if status in ("acknowledged", "accepted", "received"):
        command.status = CommandStatus.ACKNOWLEDGED
        command.acknowledged_at = now
    elif status in ("executed", "done", "completed"):
        command.status = CommandStatus.EXECUTED
        command.executed_at = now
        if command.acknowledged_at is None:
            command.acknowledged_at = now
    elif status in ("failed", "error", "rejected"):
        command.status = CommandStatus.FAILED
        command.error = str(payload.get("error", "edge reported failure"))[:500]
    await db.flush()
