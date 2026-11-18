"""Walk-in session helpers shared by telemetry ingestion and edge APIs."""

import hashlib
import hmac
import json
import re
import uuid
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import BarrierGate, TenantSite, WalkInSession
from app.redis_client import get_redis
from app.services.command_service import MQTT_OUTBOX_KEY, command_topic
from app.services.event_service import normalize_plate
from app.services.pricing_service import estimate_fee, pricing_from_profile


def pay_code_for(session_id: uuid.UUID) -> str:
    return "PV" + session_id.hex[:8].upper()


def _uuid_or_none(value) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(value)) if value else None
    except (ValueError, AttributeError, TypeError):
        return None


def _parse_time(value: str | datetime | None) -> datetime:
    if isinstance(value, datetime):
        return value
    if value:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    return datetime.now(timezone.utc)


def _belongs_to(row: WalkInSession, tenant_id: uuid.UUID, site_id: uuid.UUID) -> bool:
    return row.tenant_id == tenant_id and row.site_id == site_id


async def upsert_entry(
    db: AsyncSession, *, tenant_id: uuid.UUID, site_id: uuid.UUID, gate_id: uuid.UUID, payload: dict
) -> tuple[WalkInSession | None, bool]:
    """Returns (None, False) when the sessionId already belongs to another
    tenant/site: callers run under platform_session (RLS bypassed), so the
    foreign row must be neither touched nor published."""
    session_id = uuid.UUID(str(payload["sessionId"]))
    existing = await db.get(WalkInSession, session_id)
    if existing is not None:
        if not _belongs_to(existing, tenant_id, site_id):
            return None, False
        return existing, False
    plate = str(payload.get("plateNumber", ""))[:20]
    row = WalkInSession(
        id=session_id,
        tenant_id=tenant_id,
        site_id=site_id,
        plate_number=plate,
        plate_normalized=normalize_plate(plate),
        pay_code=pay_code_for(session_id),
        entry_gate_id=gate_id,
        entered_at=_parse_time(payload.get("enteredAt")),
        entry_plate_image_key=payload.get("plateImageKey"),
    )
    db.add(row)
    await db.flush()
    return row, True


async def apply_exit(
    db: AsyncSession, *, tenant_id: uuid.UUID, site_id: uuid.UUID, gate_id: uuid.UUID, payload: dict
) -> tuple[WalkInSession | None, bool]:
    """Returns (None, False) for a sessionId owned by another tenant/site
    (see upsert_entry)."""
    session_id = uuid.UUID(str(payload["sessionId"]))
    row = await db.get(WalkInSession, session_id)
    if row is not None and not _belongs_to(row, tenant_id, site_id):
        return None, False
    entered_at = _parse_time(payload.get("enteredAt"))
    exited_at = _parse_time(payload.get("exitedAt"))
    if row is None:
        plate = str(payload.get("plateNumber", ""))[:20]
        row = WalkInSession(
            id=session_id,
            tenant_id=tenant_id,
            site_id=site_id,
            plate_number=plate,
            plate_normalized=normalize_plate(plate),
            pay_code=pay_code_for(session_id),
            entry_gate_id=_uuid_or_none(payload.get("entryGateId")),
            entered_at=entered_at,
        )
        db.add(row)
        await db.flush()
    if row.status != "open":
        return row, False
    site = await db.get(TenantSite, site_id)
    method = payload.get("method")
    row.exit_gate_id = gate_id
    row.exited_at = exited_at
    row.status = "waived" if method == "waived" else "paid"
    row.method = None if method == "waived" else method
    row.amount_vnd = 0 if method == "waived" else payload.get("amountVnd")
    row.confirmed_by = payload.get("confirmedBy")
    row.waive_reason = payload.get("waiveReason") if method == "waived" else None
    row.expected_amount_vnd = estimate_fee(
        pricing_from_profile(site.public_profile if site else None),
        row.entered_at,
        exited_at,
        site.timezone if site else "UTC",
    )
    await db.flush()
    return row, True


def session_payload(row: WalkInSession) -> dict:
    return {
        "sessionId": str(row.id),
        "siteId": str(row.site_id),
        "plateNumber": row.plate_number,
        "payCode": row.pay_code,
        "status": row.status,
        "enteredAt": row.entered_at.isoformat(),
        "exitedAt": row.exited_at.isoformat() if row.exited_at else None,
        "amountVnd": row.amount_vnd,
        "expectedAmountVnd": row.expected_amount_vnd,
        "method": row.method,
        "confirmedBy": row.confirmed_by,
        "waiveReason": row.waive_reason,
    }


@dataclass(frozen=True)
class BankTransfer:
    site_id: uuid.UUID
    content: str
    amount_vnd: int
    reference: str
    paid_at: datetime


class BankNotifyAdapter:
    def parse(self, headers: Mapping[str, str], raw_body: bytes) -> BankTransfer | None:
        raise NotImplementedError


class SharedSecretAdapter(BankNotifyAdapter):
    def parse(self, headers: Mapping[str, str], raw_body: bytes) -> BankTransfer | None:
        secret = settings.bank_webhook_secret
        signature = headers.get("x-signature", "")
        expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
        # compare bytes: str compare_digest raises TypeError on non-ASCII input
        if not secret or not hmac.compare_digest(signature.lower().encode(), expected.encode()):
            return None
        body = json.loads(raw_body)
        return BankTransfer(
            site_id=uuid.UUID(str(body["siteId"])),
            content=str(body.get("content", "")),
            amount_vnd=int(body["amountVnd"]),
            reference=str(body["reference"]),
            paid_at=_parse_time(body["paidAt"]),
        )


def get_bank_adapter() -> BankNotifyAdapter:
    return SharedSecretAdapter()


async def enqueue_site_signal(db: AsyncSession, *, tenant_id: uuid.UUID, site_id: uuid.UUID, message: dict) -> int:
    gates = (
        await db.execute(select(BarrierGate).where(BarrierGate.tenant_id == tenant_id, BarrierGate.site_id == site_id))
    ).scalars().all()
    redis = get_redis()
    for gate in gates:
        await redis.lpush(
            MQTT_OUTBOX_KEY,
            json.dumps({"topic": command_topic(tenant_id, site_id, gate.id), "payload": message}),
        )
    return len(gates)


async def confirm_bank_transfer(db: AsyncSession, transfer: BankTransfer) -> WalkInSession | None:
    match = re.search(r"PV[0-9A-F]{8}", transfer.content, re.IGNORECASE)
    if not match:
        return None
    code = match.group(0).upper()
    row = (
        await db.execute(
            select(WalkInSession).where(
                WalkInSession.site_id == transfer.site_id,
                WalkInSession.pay_code == code,
                WalkInSession.status == "open",
            )
        )
    ).scalar_one_or_none()
    if row is None:
        return None
    if row.bank_ref == transfer.reference:
        return row
    row.bank_ref = transfer.reference
    row.bank_amount_vnd = transfer.amount_vnd
    row.bank_paid_at = transfer.paid_at
    await enqueue_site_signal(
        db,
        tenant_id=row.tenant_id,
        site_id=row.site_id,
        message={
            "type": "walk_in_paid",
            "sessionId": str(row.id),
            "amountVnd": transfer.amount_vnd,
            "bankRef": transfer.reference,
            "paidAt": transfer.paid_at.isoformat(),
        },
    )
    await db.flush()
    return row
