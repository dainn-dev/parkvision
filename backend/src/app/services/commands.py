"""Gate commands: idempotent create + MQTT publish + ack waiting."""

import json
import uuid
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.exceptions import NotFoundError, ValidationError
from app.db.redis import cmd_ack_channel, get_redis, ws_channel
from app.models.enums import CommandStatus
from app.models.events import GateCommand
from app.models.sites import BarrierGate
from app.services import mqtt_client

settings = get_settings()


async def issue_command(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    gate: BarrierGate,
    action: str,
    params: dict,
    idempotency_key: str,
    requested_by_type: str,
    requested_by_id: uuid.UUID | None,
) -> tuple[GateCommand, bool]:
    """Create (or return an existing) command, publish it, return (cmd, is_new).

    Idempotency-Key makes retries safe: a duplicate key returns the original
    command unchanged.
    """
    existing = (
        await db.execute(
            select(GateCommand).where(
                GateCommand.tenant_id == tenant_id,
                GateCommand.idempotency_key == idempotency_key,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing, False

    cmd = GateCommand(
        tenant_id=tenant_id,
        site_id=gate.site_id,
        gate_id=gate.id,
        action=action,
        params=params,
        status=CommandStatus.ACCEPTED.value,
        idempotency_key=idempotency_key,
        requested_by_type=requested_by_type,
        requested_by_id=requested_by_id,
    )
    db.add(cmd)
    await db.flush()

    payload = {
        "commandId": str(cmd.id),
        "action": action,
        "params": params,
        "gateId": str(gate.id),
        "issuedAt": datetime.now(UTC).isoformat(),
    }
    try:
        topic = await mqtt_client.publish_gate_command(tenant_id, gate.site_id, gate.mqtt_gate_key, payload)
        cmd.mqtt_topic = topic
    except Exception as exc:  # broker down → mark failed but keep the row
        cmd.status = CommandStatus.FAILED.value
        cmd.error = f"mqtt publish failed: {exc}"
    await db.flush()
    return cmd, True


async def wait_for_ack(command_id: uuid.UUID, ack_timeout: float | None = None) -> dict | None:
    """Block until the gateway publishes the command's ack (or timeout)."""
    redis = get_redis()
    pubsub = redis.pubsub()
    try:
        await pubsub.subscribe(cmd_ack_channel(command_id))
        deadline = ack_timeout or settings.gate_command_ack_timeout_seconds
        while True:
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=deadline)
            if msg is None:
                return None
            if msg["type"] == "message":
                return json.loads(msg["data"])
    finally:
        await pubsub.unsubscribe()
        await pubsub.aclose()


async def handle_ack(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    gate_id: uuid.UUID,
    command_id: uuid.UUID,
    ack: dict,
) -> GateCommand | None:
    """Apply an incoming command_ack: update row, notify waiter + WS room."""
    cmd = (
        await db.execute(
            select(GateCommand).where(GateCommand.id == command_id, GateCommand.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if cmd is None:
        return None
    ok = bool(ack.get("success", True))
    cmd.status = CommandStatus.ACKNOWLEDGED.value if ok else CommandStatus.FAILED.value
    cmd.ack = ack
    cmd.acked_at = datetime.now(UTC)
    if not ok and ack.get("error"):
        cmd.error = str(ack["error"])[:500]
    await db.flush()

    redis = get_redis()
    await redis.publish(cmd_ack_channel(command_id), json.dumps({"commandId": str(command_id), **ack}))
    await redis.publish(
        ws_channel(tenant_id),
        json.dumps(
            {
                "type": "command_ack",
                "gateId": str(gate_id),
                "commandId": str(command_id),
                "status": cmd.status,
                "ack": ack,
            }
        ),
    )
    return cmd


async def mark_timeout(db: AsyncSession, command_id: uuid.UUID, tenant_id: uuid.UUID) -> None:
    await db.execute(
        update(GateCommand)
        .where(
            GateCommand.id == command_id,
            GateCommand.tenant_id == tenant_id,
            GateCommand.status == CommandStatus.ACCEPTED.value,
        )
        .values(status=CommandStatus.TIMEOUT.value)
    )


async def get_command(db: AsyncSession, command_id: uuid.UUID, tenant_id: uuid.UUID) -> GateCommand:
    row = (
        await db.execute(
            select(GateCommand).where(GateCommand.id == command_id, GateCommand.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("command not found")
    return row


def validate_action(action: str) -> None:
    from app.models.enums import GateAction

    try:
        GateAction(action)
    except ValueError as exc:
        raise ValidationError(f"unsupported gate action: {action}") from exc
