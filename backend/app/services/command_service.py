"""Barrier gate command lifecycle: idempotent issue → MQTT outbox → ack/timeout.

The API process never holds an MQTT connection; it enqueues outbound commands
onto the Redis list `mqtt:outbox`, which the mqtt-bridge process drains and
publishes to EMQX. Edge acks arrive back through the bridge on telemetry topics.
"""

import json
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.enums import CommandStatus, GateCommand
from app.core.errors import bad_request, conflict, not_found
from app.models import BarrierGate
from app.models import GateCommand as GateCommandRow
from app.redis_client import get_redis

MQTT_OUTBOX_KEY = "mqtt:outbox"
COMMAND_TOPIC_TEMPLATE = "tenants/{tenant}/sites/{site}/gates/{gate}/command"


def command_topic(tenant_id, site_id, gate_id) -> str:
    return COMMAND_TOPIC_TEMPLATE.format(tenant=tenant_id, site=site_id, gate=gate_id)


async def issue_command(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    gate_id: uuid.UUID,
    command: str,
    idempotency_key: str,
    issued_by: uuid.UUID | None,
    issued_by_type: str,
    payload: dict,
) -> GateCommandRow:
    if command not in [str(c) for c in GateCommand]:
        raise bad_request(f"Unsupported command '{command}'")

    gate = (
        await db.execute(
            select(BarrierGate).where(
                BarrierGate.id == gate_id, BarrierGate.tenant_id == tenant_id
            )
        )
    ).scalar_one_or_none()
    if gate is None:
        raise not_found("gate", gate_id)

    existing = (
        await db.execute(
            select(GateCommandRow).where(GateCommandRow.idempotency_key == idempotency_key)
        )
    ).scalar_one_or_none()
    if existing is not None:
        if existing.command != command or existing.gate_id != gate_id:
            raise conflict(
                "Idempotency key was already used for a different command",
                {"existingCommandId": str(existing.id)},
            )
        return existing  # safe replay: return original record

    now = datetime.now(timezone.utc)
    row = GateCommandRow(
        tenant_id=tenant_id,
        gate_id=gate_id,
        command=command,
        idempotency_key=idempotency_key,
        status=CommandStatus.PENDING,
        issued_by=issued_by,
        issued_by_type=issued_by_type,
        correlation_id=uuid.uuid4().hex,
        mqtt_topic=command_topic(tenant_id, gate.site_id, gate_id),
        payload=payload,
        requested_at=now,
        timeout_at=now + timedelta(seconds=settings.mqtt_command_timeout_seconds),
    )
    db.add(row)
    await db.flush()

    await get_redis().lpush(
        MQTT_OUTBOX_KEY,
        json.dumps(
            {
                "topic": row.mqtt_topic,
                "payload": {
                    "commandId": str(row.id),
                    "correlationId": row.correlation_id,
                    "command": command,
                    "gateId": str(gate_id),
                    "tenantId": str(tenant_id),
                    "issuedAt": now.isoformat(),
                    "payload": payload,
                },
            }
        ),
    )
    row.status = CommandStatus.SENT
    row.sent_at = now
    return row


async def mark_command_ack(
    db: AsyncSession, command_id: uuid.UUID, success: bool, error: str | None = None
) -> None:
    row = (
        await db.execute(select(GateCommandRow).where(GateCommandRow.id == command_id))
    ).scalar_one_or_none()
    if row is None:
        return
    row.status = CommandStatus.ACKNOWLEDGED if success else CommandStatus.FAILED
    row.acked_at = datetime.now(timezone.utc)
    if error:
        row.error = error


async def expire_stale_commands(db: AsyncSession) -> int:
    """Worker sweep: mark commands older than their timeout as timed out."""
    res = await db.execute(
        select(GateCommandRow).where(
            GateCommandRow.status == CommandStatus.SENT,
            GateCommandRow.timeout_at < datetime.now(timezone.utc),
        )
    )
    count = 0
    for row in res.scalars():
        row.status = CommandStatus.TIMEOUT
        count += 1
    return count
