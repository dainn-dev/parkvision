"""Driver payments: create, list, refresh, cancel + MoMo IPN handling.

Every query runs under `platform_session` scoped to the caller's
`driver_id`. Amounts are computed server-side only:

- kind='membership' → `site_membership_plans.price_vnd`; the membership
  must be the driver's own and `pending`. On `paid` the membership is
  auto-activated (whitelist row provisioned) by the same shared routine
  the tenant admin endpoint uses.
- kind='session'   → fee estimated by `pricing_service` from the site's
  pricing rules, paired against the session's real exit event when the
  vehicle already left. On `paid`, `decide_access` grants one exit within
  the paid-exit grace window (see `event_service`).
- kind='topup'     → funds the driver's wallet (`driver_wallets`); NULL
  tenant/site because wallet credit is platform-scoped. `method` is the
  funding rail: 'momo' goes through the gateway; 'wallet' debits the
  driver_wallet balance directly (membership/session only — a topup can
  never fund itself).

Tenant operators refund `paid` payments via
`refund_payment`: MoMo payments call the gateway `/refund`; wallet
payments credit the balance back. Refunded membership payments revoke an
activated membership (whitelist suspended) or reject a still-pending one.

A 'created' payment expires after `payment_ttl_minutes` (lazy sweep on
reads/writes). Terminal rows never get their status or side effects changed
by a provider callback — IPNs and queries are idempotent.

Money-safety flags (all in `raw_payload`, surfaced to operators through the
tenant feed and its `?attention=true` filter, never auto-refunded):

- `activation_error`  — membership paid but not activated (GAP-PAY-001).
- `late_ipn`          — provider reports success for a payment that was
  already cancelled/expired/failed; no side effects applied (D-PAY-1).
- `amount_mismatch`   — provider amount != `amount_vnd`; not marked paid
  (D-PAY-2).
- `refund_attempt_error` — the MoMo /refund call failed in transport; the
  payment stays `paid` and is reconcilable (PG5).
- `refunded_externally` — operator recorded an out-of-band refund.
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import exists, func, or_, select, text

from app.config import settings
from app.core.errors import ApiError, bad_request, conflict, not_found, unprocessable
from app.database import platform_session
from app.models import (
    AccessEvent,
    DriverMembership,
    DriverPayment,
    DriverUser,
    DriverVehicle,
    SiteMembershipPlan,
    TenantSite,
)
from app.services import wallet_service
from app.services.event_service import normalize_plate, paid_exit_grace_minutes
from app.services.payments import MomoRejected, get_gateway
from app.services.payments.gateways import GatewayQueryResult
from app.services.pricing_service import estimate_fee, pricing_from_profile

logger = logging.getLogger(__name__)

_IN_FLIGHT = ("created",)
_TERMINAL = ("paid", "failed", "cancelled", "expired", "refunded")
# A provider success for one of these is a late payment: flag, don't apply.
_LATE_ELIGIBLE = ("cancelled", "expired", "failed")
# raw_payload keys that put a (non-refunded) payment on the operator's
# attention list.
ATTENTION_KEYS = ("activation_error", "late_ipn", "amount_mismatch", "refund_attempt_error")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _merge_raw(p: DriverPayment, **entries) -> None:
    """Add keys to raw_payload (reassigned so the JSONB change is tracked)."""
    p.raw_payload = {**(p.raw_payload or {}), **entries}


def _as_int(value) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _record_late_payment(
    p: DriverPayment,
    *,
    source: str,
    trans_id: str | None,
    amount: int | None,
    result_code: int | None = None,
    message: str | None = None,
) -> None:
    """Provider says paid but the payment was already cancelled/expired:
    keep the status, apply no side effects, flag it for the operator."""
    _merge_raw(
        p,
        late_ipn={
            "source": source,
            "previousStatus": p.status,
            "transId": trans_id,
            "amount": amount,
            "resultCode": result_code,
            "message": message,
            "at": _now_iso(),
        },
    )
    if trans_id and not p.provider_trans_id:
        p.provider_trans_id = trans_id


def _amount_matches(p: DriverPayment, received: int | None, *, source: str, trans_id: str | None) -> bool:
    """True when the provider-reported amount equals `amount_vnd`; otherwise
    record `amount_mismatch` (the caller must not mark the payment paid)."""
    if received == p.amount_vnd:
        return True
    _merge_raw(
        p,
        amount_mismatch={
            "source": source,
            "expected": p.amount_vnd,
            "received": received,
            "transId": trans_id,
            "at": _now_iso(),
        },
    )
    return False


def _as_query_result(result) -> GatewayQueryResult:
    # Older/fake adapters may still return the bare status string.
    return GatewayQueryResult(status=result) if isinstance(result, str) else result


TOPUP_MIN_VND = 10_000
TOPUP_MAX_VND = 50_000_000


def _gateway_or_503():
    gw = get_gateway()
    if gw is None:
        raise ApiError(
            503,
            "payments_not_configured",
            "Online payments are not configured on this deployment.",
        )
    return gw


def _ipn_url() -> str:
    base = (settings.payment_ipn_base_url or settings.app_base_url).rstrip("/")
    return f"{base}{settings.api_v1_prefix}/public/payments/momo/ipn"


async def _expire_stale(db) -> None:
    now = datetime.now(timezone.utc)
    stale = (
        (
            await db.execute(
                select(DriverPayment).where(
                    DriverPayment.status.in_(_IN_FLIGHT),
                    DriverPayment.expires_at.is_not(None),
                    DriverPayment.expires_at < now,
                )
            )
        )
        .scalars()
        .all()
    )
    for p in stale:
        p.status = "expired"
    if stale:
        await db.flush()


def _payment_out(p: DriverPayment, site_name: str | None) -> dict:
    return {
        "id": p.id,
        "kind": p.kind,
        "membership_id": p.membership_id,
        "session_id": p.session_ref,
        "site_id": p.site_id,
        "site_name": site_name,
        "plate_number": p.plate_number,
        "amount_vnd": p.amount_vnd,
        "currency": p.currency,
        "provider": p.provider,
        "method": p.method,
        "status": p.status,
        "pay_url": p.pay_url,
        "paid_at": p.paid_at,
        "refunded_at": p.refunded_at,
        "expires_at": p.expires_at,
        "created_at": p.created_at,
    }


async def _site_names(db, site_ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not site_ids:
        return {}
    rows = (await db.execute(select(TenantSite.id, TenantSite.name).where(TenantSite.id.in_(site_ids)))).all()
    return dict(rows)


# ---------- session resolution ----------


def canonical_session_ref(session_ref: str) -> str:
    """`str(uuid.UUID(x))` — lowercase, hyphenated. 404 for a non-UUID."""
    try:
        return str(uuid.UUID(str(session_ref).strip()))
    except ValueError:
        raise not_found("session", session_ref) from None


async def _resolve_session(
    db, driver_id: uuid.UUID, session_ref: str
) -> tuple[AccessEvent, AccessEvent | None]:
    """Load the entry event + its paired exit (or None = still PARKED),
    validated against the caller's plates. Pairing mirrors
    driver_session_service's per-(plate, site) LIFO semantics."""
    try:
        event_id = uuid.UUID(session_ref)
    except ValueError:
        raise not_found("session", session_ref) from None

    entry = (
        await db.execute(
            select(AccessEvent)
            .where(AccessEvent.id == event_id)
            # Share the same lock as payment creation so simultaneous
            # wallet/gateway requests for this session cannot race.
            .with_for_update()
        )
    ).scalar_one_or_none()
    if (
        entry is None
        or entry.decision != "allow"
        or entry.direction != "entry"
        or entry.site_id is None
        or not entry.plate_number
    ):
        raise not_found("session", session_ref) from None

    plate_norm = normalize_plate(entry.plate_number)
    # Owned plate: only stays that entered after the driver registered the
    # vehicle (same cut-off as the driver session listings) — a previous
    # holder's stay of this plate is not this driver's to see or pay.
    owned = (
        await db.execute(
            select(DriverVehicle.id).where(
                DriverVehicle.driver_id == driver_id,
                DriverVehicle.plate_normalized == plate_norm,
                DriverVehicle.created_at <= entry.occurred_at,
            )
        )
    ).scalar_one_or_none()
    if owned is None:
        from zoneinfo import ZoneInfo

        from app.models import DriverVehicleShare

        site_timezone = await db.scalar(select(TenantSite.timezone).where(TenantSite.id == entry.site_id))
        event_date = entry.occurred_at.astimezone(ZoneInfo(site_timezone or "UTC")).date()
        share = (
            await db.execute(
                select(DriverVehicleShare.id)
                .join(DriverVehicle, DriverVehicle.id == DriverVehicleShare.vehicle_id)
                .where(
                    DriverVehicleShare.shared_with_id == driver_id,
                    DriverVehicle.plate_normalized == plate_norm,
                    DriverVehicleShare.share_date == event_date,
                )
            )
        ).scalar_one_or_none()
        if share is None:
            raise not_found("session", session_ref) from None

    later = (
        (
            await db.execute(
                select(AccessEvent)
                .where(
                    AccessEvent.tenant_id == entry.tenant_id,
                    AccessEvent.site_id == entry.site_id,
                    AccessEvent.decision == "allow",
                    AccessEvent.plate_number.isnot(None),
                    AccessEvent.occurred_at > entry.occurred_at,
                )
                .order_by(AccessEvent.occurred_at.asc())
                .limit(200)
            )
        )
        .scalars()
        .all()
    )
    stack: list[AccessEvent] = [entry]
    for ev in later:
        if not stack:
            break
        if normalize_plate(ev.plate_number or "") != plate_norm:
            continue
        if ev.direction == "entry":
            stack.append(ev)
        elif ev.direction == "exit":
            popped = stack.pop()
            if popped.id == entry.id:
                return entry, ev
    return entry, None


# ---------- create ----------


async def create_payment(
    driver_id: uuid.UUID,
    kind: str,
    membership_id: uuid.UUID | None,
    session_ref: str | None,
    method: str = "momo",
    topup_amount_vnd: int | None = None,
) -> dict:
    if kind == "topup":
        # A topup only makes sense through a real funding rail.
        if method != "momo":
            raise bad_request("Top-ups must be paid through the payment gateway")
        if topup_amount_vnd is None or topup_amount_vnd < TOPUP_MIN_VND or topup_amount_vnd > TOPUP_MAX_VND:
            raise bad_request(f"amountVnd must be between {TOPUP_MIN_VND} and {TOPUP_MAX_VND} for top-ups")
    if kind != "topup" and topup_amount_vnd is not None:
        raise bad_request("amountVnd is only accepted for kind='topup'")
    if method == "wallet" and kind == "topup":
        raise bad_request("A wallet cannot fund its own top-up")

    gw = _gateway_or_503() if method == "momo" else None
    async with platform_session() as db:
        await _expire_stale(db)
        site: TenantSite | None = None
        plate_number: str | None = None
        plate_norm: str | None = None
        membership: DriverMembership | None = None

        if kind == "membership":
            if membership_id is None:
                raise bad_request("membershipId is required")
            membership = (
                await db.execute(
                    select(DriverMembership)
                    .where(
                        DriverMembership.id == membership_id,
                        DriverMembership.driver_id == driver_id,
                    )
                    # Lock the membership row so concurrent wallet+gateway
                    # requests serialize here — the loser re-reads the
                    # paid/in-flight state and returns the existing payment.
                    .with_for_update()
                )
            ).scalar_one_or_none()
            if membership is None:
                raise not_found("membership", membership_id) from None
            if membership.status != "pending":
                raise conflict(f"Membership is {membership.status}, not pending") from None
            plan = (
                await db.execute(
                    select(SiteMembershipPlan).where(SiteMembershipPlan.id == membership.plan_id)
                )
            ).scalar_one_or_none()
            amount = plan.price_vnd if plan else 0
            if amount <= 0:
                raise bad_request("This membership plan is free — nothing to pay") from None
            paid = (
                await db.execute(
                    select(DriverPayment)
                    .where(
                        DriverPayment.membership_id == membership.id,
                        DriverPayment.status == "paid",
                    )
                    .order_by(DriverPayment.created_at.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()
            if paid is not None:
                raise conflict("A payment for this membership is already paid") from None
            existing = (
                await db.execute(
                    select(DriverPayment)
                    .where(
                        DriverPayment.membership_id == membership.id,
                        DriverPayment.status.in_(_IN_FLIGHT),
                    )
                    .order_by(DriverPayment.created_at.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()
            if existing is not None:
                site_name = (
                    await db.scalar(select(TenantSite.name).where(TenantSite.id == existing.site_id))
                    if existing.site_id
                    else None
                )
                return _payment_out(existing, site_name)
            tenant_id, site_id = membership.tenant_id, membership.site_id
            plate_number, plate_norm = membership.plate_number, membership.plate_normalized
            ref, info = None, f"Membership {plan.name if plan else ''} @ site"

        elif kind == "session":
            if not session_ref:
                raise bad_request("sessionId is required")
            # Canonical UUID string everywhere it is stored/compared/locked on,
            # so 'ABC…' and 'abc…' cannot become two payments for one session.
            session_ref = canonical_session_ref(session_ref)
            # No row exists yet to lock, so serialise concurrent creates for
            # the same session with a transaction-scoped advisory lock; the
            # loser then sees the winner's in-flight/paid row below.
            await db.execute(
                text("SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))"),
                {"k": f"payment-session:{session_ref}"},
            )
            entry, exit_ev = await _resolve_session(db, driver_id, session_ref)
            site = (
                await db.execute(select(TenantSite).where(TenantSite.id == entry.site_id))
            ).scalar_one_or_none()
            end = exit_ev.occurred_at if exit_ev else datetime.now(timezone.utc)
            amount = estimate_fee(
                pricing_from_profile(site.public_profile if site else None),
                entry.occurred_at,
                end,
                (site.timezone if site else None) or "UTC",
            )
            if amount is None:
                raise unprocessable("This site has no pricing rules — fee is not estimable") from None
            if amount <= 0:
                raise bad_request("This session is free — nothing to pay") from None
            paid_rows = (
                (
                    await db.execute(
                        select(DriverPayment)
                        .where(
                            DriverPayment.session_ref == session_ref,
                            DriverPayment.status == "paid",
                        )
                        .order_by(DriverPayment.paid_at.desc().nulls_last())
                        .with_for_update()
                    )
                )
                .scalars()
                .all()
            )
            if paid_rows:
                latest = paid_rows[0]
                now = datetime.now(timezone.utc)
                grace = await paid_exit_grace_minutes(db, entry.tenant_id)
                if (
                    exit_ev is not None
                    or latest.exit_granted_at is not None
                    or latest.paid_at is None
                    or latest.paid_at >= now - timedelta(minutes=grace)
                ):
                    raise conflict("A payment for this session is already paid") from None
                # Paid, still parked, grace lapsed without an exit consuming
                # the grant (§17 #4): bill only what accrued since.
                owed = amount - sum(p.amount_vnd for p in paid_rows)
                if owed <= 0:
                    # Nothing more is owed (same pricing block): re-open the
                    # grace window on the latest paid payment instead of
                    # minting a zero-amount payment.
                    _merge_raw(
                        latest,
                        grace_refreshed=[
                            *(latest.raw_payload or {}).get("grace_refreshed", []),
                            {"previousPaidAt": latest.paid_at.isoformat(), "at": now.isoformat()},
                        ],
                    )
                    latest.paid_at = now
                    await _push_paid_exit_grant(db, latest)
                    await db.flush()
                    return _payment_out(latest, site.name if site else None)
                amount = owed
            existing = (
                await db.execute(
                    select(DriverPayment)
                    .where(
                        DriverPayment.session_ref == session_ref,
                        DriverPayment.status.in_(_IN_FLIGHT),
                    )
                    .order_by(DriverPayment.created_at.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()
            if existing is not None:
                # Idempotent: a 'created' payment for this session is still
                # payable — hand back the same row instead of minting a
                # second one (LOGIC-PAY-002: avoids a double-pay if both
                # later settle via IPN).
                return _payment_out(existing, site.name if site else None)
            tenant_id, site_id = entry.tenant_id, entry.site_id
            plate_number, plate_norm = entry.plate_number, normalize_plate(entry.plate_number)
            ref, info = session_ref, f"Parking fee @ {site.name if site else 'site'}"

        elif kind == "topup":
            tenant_id = site_id = None
            amount = topup_amount_vnd
            ref, info = None, "Wallet top-up"

        else:
            raise bad_request("kind must be 'membership', 'session' or 'topup'") from None

        now = datetime.now(timezone.utc)
        p = DriverPayment(
            driver_id=driver_id,
            kind=kind,
            membership_id=membership.id if membership else None,
            session_ref=ref,
            tenant_id=tenant_id,
            site_id=site_id,
            plate_number=plate_number,
            plate_normalized=plate_norm,
            amount_vnd=amount,
            provider=gw.name if gw else "wallet",
            method=method,
            status="created",
            provider_order_id="",  # filled after flush (needs p.id)
            provider_request_id="",
            expires_at=(now + timedelta(minutes=settings.payment_ttl_minutes) if method == "momo" else None),
        )
        db.add(p)
        await db.flush()
        p.provider_order_id = f"pv-{p.id}"
        p.provider_request_id = f"pv-{uuid.uuid4().hex[:16]}"

        if site is None and site_id is not None:
            site = (await db.execute(select(TenantSite).where(TenantSite.id == site_id))).scalar_one_or_none()

        if method == "wallet":
            # Atomic: debit + side effects in one transaction — an
            # insufficient balance rolls the payment row back with it.
            await wallet_service.debit(db, driver_id, amount, "spend_debit", p.id, info)
            await _apply_paid(db, p, {"wallet": "settled"})
            await db.flush()
            return _payment_out(p, site.name if site else None)

        try:
            init = await gw.create_payment(
                amount_vnd=amount,
                order_id=p.provider_order_id,
                order_info=info,
                request_id=p.provider_request_id,
                redirect_url=settings.payment_redirect_url,
                ipn_url=_ipn_url(),
            )
        except MomoRejected as exc:
            p.status = "failed"
            p.raw_payload = {"create_error": {"resultCode": exc.result_code, "message": str(exc)}}
            await db.flush()
            raise conflict(f"Payment provider rejected the order: {exc}") from None
        p.pay_url = init.pay_url
        await db.flush()
        return _payment_out(p, site.name if site else None)


# ---------- read / refresh / cancel ----------


async def list_payments(driver_id: uuid.UUID) -> list[dict]:
    async with platform_session() as db:
        await _expire_stale(db)
        rows = (
            (
                await db.execute(
                    select(DriverPayment)
                    .where(DriverPayment.driver_id == driver_id)
                    .order_by(DriverPayment.created_at.desc())
                    .limit(200)
                )
            )
            .scalars()
            .all()
        )
        names = await _site_names(db, {p.site_id for p in rows})
        return [_payment_out(p, names.get(p.site_id)) for p in rows]


_ADMIN_NOTE_MAX = 300  # DriverMembership.admin_note is String(300)


def _activation_failure_note(reason: str) -> str:
    """Operator-facing note, capped so it can never overflow admin_note."""
    return f"payment received; activation failed: {reason}"[:_ADMIN_NOTE_MAX]


def _flag_activation_failure(p: DriverPayment, m: DriverMembership | None, reason: str) -> None:
    """Record a paid-but-not-activated outcome on the payment (raw_payload
    `activation_error`) and, when present, on the membership's admin_note."""
    p.raw_payload = {**(p.raw_payload or {}), "activation_error": reason}
    if m is not None:
        m.admin_note = _activation_failure_note(reason)


async def _apply_paid(db, p: DriverPayment, payload: dict | None) -> None:
    """Mark paid + run side effects. Idempotent: callers check status."""
    p.status = "paid"
    p.paid_at = datetime.now(timezone.utc)
    if payload:
        # Merge: keep any earlier flags (e.g. a prior amount_mismatch record).
        p.raw_payload = {**(p.raw_payload or {}), **payload}
        trans = payload.get("transId")
        if trans is not None:
            p.provider_trans_id = str(trans)

    if p.kind == "membership" and p.membership_id is not None:
        from app.services import membership_service

        m = (
            await db.execute(select(DriverMembership).where(DriverMembership.id == p.membership_id))
        ).scalar_one_or_none()
        if m is None:
            _flag_activation_failure(p, None, "membership no longer exists")
        elif m.status != "pending":
            _flag_activation_failure(p, m, f"membership is {m.status}, not pending")
        else:
            try:
                await membership_service._activate_membership_row(db, m, f"auto: paid via {p.method}")
            except ApiError as exc:
                # Money received but activation failed (e.g. blacklisted
                # plate). Keep the payment 'paid' (the charge is real), leave
                # the membership 'pending', and flag both rows so an operator
                # can activate manually or refund (LOGIC-BE-009). Automatic
                # refund is a product decision and is intentionally not done.
                _flag_activation_failure(p, m, exc.message)
    elif p.kind == "topup":
        await wallet_service.credit(db, p.driver_id, p.amount_vnd, "topup_credit", p.id, "Wallet top-up")
    elif p.kind == "session":
        await _push_paid_exit_grant(db, p)
    await db.flush()


async def _push_paid_exit_grant(db, p: DriverPayment) -> None:
    """GAP-PAY-003: tell every gate of the session's site that this session
    is paid, so an edge that loses the backend can still honour the exit
    from its SQLite cache. Best effort — the backend's own paid_exit
    decision (event_service) stays authoritative, so a Redis failure must
    not roll back the payment."""
    if p.tenant_id is None or p.site_id is None or not p.session_ref or p.paid_at is None:
        return
    from app.services.walk_in_service import enqueue_site_signal

    grace = await paid_exit_grace_minutes(db, p.tenant_id)
    message = {
        "type": "paid_exit_grant",
        "sessionId": p.session_ref,
        "paymentId": str(p.id),
        "plateNumber": p.plate_number or "",
        "plateNormalized": normalize_plate(p.plate_number or ""),
        "paidAt": p.paid_at.isoformat(),
        "expiresAt": (p.paid_at + timedelta(minutes=grace)).isoformat(),
    }
    try:
        await enqueue_site_signal(db, tenant_id=p.tenant_id, site_id=p.site_id, message=message)
    except Exception:  # noqa: BLE001 — best-effort push, see docstring
        logger.warning("paid_exit_grant push failed for payment %s", p.id, exc_info=True)


async def _refresh_from_gateway(db, p: DriverPayment, *, include_late: bool = False) -> None:
    """Pull the provider status for a 'created' MoMo payment. With
    `include_late`, also query cancelled/expired ones not yet flagged so a
    payment that succeeded after we gave up is recorded as `late_ipn`."""
    if p.method != "momo":
        return
    late_check = (
        include_late and p.status in ("cancelled", "expired") and "late_ipn" not in (p.raw_payload or {})
    )
    if p.status != "created" and not late_check:
        return
    gw = get_gateway()
    if gw is None:
        return
    res = _as_query_result(
        await gw.query_status(order_id=p.provider_order_id, request_id=p.provider_request_id)
    )
    if late_check:
        if res.status == "paid":
            _record_late_payment(p, source="query", trans_id=res.trans_id, amount=res.amount)
        return
    if res.status == "paid":
        if res.amount is not None and not _amount_matches(
            p, res.amount, source="query", trans_id=res.trans_id
        ):
            return
        payload: dict = {"query": "paid"}
        if res.trans_id:
            payload["transId"] = res.trans_id
        if res.amount is not None:
            payload["amount"] = res.amount
        await _apply_paid(db, p, payload)
    elif res.status == "failed":
        p.status = "failed"


async def get_payment(driver_id: uuid.UUID, payment_id: uuid.UUID) -> dict:
    async with platform_session() as db:
        await _expire_stale(db)
        p = (
            await db.execute(
                select(DriverPayment)
                .where(DriverPayment.id == payment_id, DriverPayment.driver_id == driver_id)
                # Same lock as IPN/refund: a pull-refresh must not race an IPN
                # into applying side effects twice (LOGIC-BE-010).
                .with_for_update()
            )
        ).scalar_one_or_none()
        if p is None:
            raise not_found("payment", payment_id) from None
        await _refresh_from_gateway(db, p)
        name = await db.scalar(select(TenantSite.name).where(TenantSite.id == p.site_id))
        return _payment_out(p, name)


async def cancel_payment(driver_id: uuid.UUID, payment_id: uuid.UUID) -> dict:
    async with platform_session() as db:
        await _expire_stale(db)
        p = (
            await db.execute(
                select(DriverPayment)
                .where(DriverPayment.id == payment_id, DriverPayment.driver_id == driver_id)
                # Serialise with IPN: never overwrite 'paid' with 'cancelled'.
                .with_for_update()
            )
        ).scalar_one_or_none()
        if p is None:
            raise not_found("payment", payment_id) from None
        if p.status != "created":
            raise conflict(f"Payment is {p.status}, cannot cancel") from None
        p.status = "cancelled"
        await db.flush()
        name = await db.scalar(select(TenantSite.name).where(TenantSite.id == p.site_id))
        return _payment_out(p, name)


# ---------- IPN ----------


async def handle_momo_ipn(payload: dict) -> dict:
    """Verify + apply a MoMo IPN. Always returns 200-shaped data to the
    provider once the signature verifies — providers retry on non-2xx."""
    gw = _gateway_or_503()
    if not gw.verify_signature(payload):
        raise bad_request("Invalid signature") from None

    async with platform_session() as db:
        p = (
            await db.execute(
                select(DriverPayment)
                .where(
                    DriverPayment.provider == "momo",
                    DriverPayment.provider_order_id == str(payload.get("orderId", "")),
                )
                # Serialize duplicate/concurrent provider callbacks so only
                # one transaction can apply payment side effects.
                .with_for_update()
            )
        ).scalar_one_or_none()
        if p is None:
            # Unknown order — verify passed so it's a real MoMo call; ack
            # silently rather than erroring (idempotent retry semantics).
            return {"resultCode": 0, "message": "unknown order"}
        succeeded = gw.ipn_succeeded(payload)
        trans = payload.get("transId")
        trans_id = str(trans) if trans not in (None, "") else None
        amount = _as_int(payload.get("amount"))
        if p.status in _LATE_ELIGIBLE and succeeded:
            # D-PAY-1: money arrived after we cancelled/expired the payment.
            # Ack MoMo (so it stops retrying) but apply no side effects.
            if "late_ipn" not in (p.raw_payload or {}):
                _record_late_payment(
                    p,
                    source="ipn",
                    trans_id=trans_id,
                    amount=amount,
                    result_code=_as_int(payload.get("resultCode")),
                    message=str(payload.get("message", ""))[:200],
                )
                await db.flush()
            return {"resultCode": 0, "message": "late payment recorded"}
        if p.status in _TERMINAL:
            return {"resultCode": 0, "message": "already processed"}
        if succeeded:
            # D-PAY-2: never mark paid on an amount we did not ask for.
            if not _amount_matches(p, amount, source="ipn", trans_id=trans_id):
                await db.flush()
                return {"resultCode": 0, "message": "amount mismatch recorded"}
            await _apply_paid(db, p, payload)
        else:
            p.status = "failed"
            p.raw_payload = {**(p.raw_payload or {}), **payload}
        await db.flush()
        return {"resultCode": 0, "message": "ok"}


# ---------- wallet ----------


async def get_wallet(driver_id: uuid.UUID) -> dict:
    async with platform_session() as db:
        return await wallet_service.wallet_out(db, driver_id)


# ---------- tenant ops: listing + refund ----------


async def list_tenant_payments(
    db,
    tenant_id: uuid.UUID,
    *,
    status: str | None = None,
    kind: str | None = None,
    site_id: uuid.UUID | None = None,
    attention: bool | None = None,
    page: int = 1,
    limit: int = 50,
) -> tuple[list[dict], int]:
    """Tenant-admin payment feed. `db` is a tenant_session — RLS already
    scopes driver_payments to the tenant (topup rows have NULL tenant_id
    and are invisible here by design).

    `attention=True` keeps only non-refunded payments carrying one of
    `ATTENTION_KEYS` (paid-not-activated, late payment, amount mismatch,
    failed refund attempt) — the operator's to-do list."""
    q = (
        select(DriverPayment, DriverUser, TenantSite)
        .join(DriverUser, DriverUser.id == DriverPayment.driver_id)
        .outerjoin(TenantSite, TenantSite.id == DriverPayment.site_id)
        .where(DriverPayment.tenant_id == tenant_id)
    )
    if status:
        q = q.where(DriverPayment.status == status)
    if kind:
        q = q.where(DriverPayment.kind == kind)
    if site_id:
        q = q.where(DriverPayment.site_id == site_id)
    if attention:
        q = q.where(
            DriverPayment.status != "refunded",
            or_(*[DriverPayment.raw_payload.has_key(k) for k in ATTENTION_KEYS]),
        )
    total = (await db.scalar(select(func.count()).select_from(q.subquery()))) or 0
    rows = (
        await db.execute(q.order_by(DriverPayment.created_at.desc()).offset((page - 1) * limit).limit(limit))
    ).all()
    return [_tenant_payment_item(p, d, s) for p, d, s in rows], total


def _operator_flags(p: DriverPayment) -> dict:
    raw = p.raw_payload or {}
    activation_error = raw.get("activation_error")
    refund_error = raw.get("refund_attempt_error")
    return {
        "activation_error": str(activation_error) if activation_error else None,
        "late_payment": "late_ipn" in raw,
        "amount_mismatch": "amount_mismatch" in raw,
        "refund_attempt_error": refund_error.get("message") if isinstance(refund_error, dict) else None,
        "refunded_externally": "refunded_externally" in raw,
        "needs_attention": p.status != "refunded" and any(k in raw for k in ATTENTION_KEYS),
    }


def _tenant_payment_item(p: DriverPayment, d: DriverUser, s: TenantSite | None) -> dict:
    return {
        "id": p.id,
        "driver_id": d.id,
        "driver_name": d.full_name,
        "driver_email": d.email,
        "kind": p.kind,
        "membership_id": p.membership_id,
        "session_id": p.session_ref,
        "site_id": p.site_id,
        "site_name": s.name if s else None,
        "plate_number": p.plate_number,
        "amount_vnd": p.amount_vnd,
        "currency": p.currency,
        "provider": p.provider,
        "method": p.method,
        "status": p.status,
        "paid_at": p.paid_at,
        "refunded_at": p.refunded_at,
        "created_at": p.created_at,
        **_operator_flags(p),
    }


async def _tenant_payment_out(db, payment_id: uuid.UUID) -> dict:
    p, d, s = (
        await db.execute(
            select(DriverPayment, DriverUser, TenantSite)
            .join(DriverUser, DriverUser.id == DriverPayment.driver_id)
            .outerjoin(TenantSite, TenantSite.id == DriverPayment.site_id)
            .where(DriverPayment.id == payment_id)
        )
    ).one()
    return _tenant_payment_item(p, d, s)


async def _lock_refundable(db, tenant_id: uuid.UUID, payment_id: uuid.UUID) -> DriverPayment:
    p = (
        await db.execute(
            select(DriverPayment)
            .where(
                DriverPayment.id == payment_id,
                DriverPayment.tenant_id == tenant_id,
            )
            # Serialise concurrent refunds: the loser re-reads status='refunded'
            # and gets a 409 instead of crediting / calling the gateway twice.
            .with_for_update()
        )
    ).scalar_one_or_none()
    if p is None:
        raise not_found("payment", payment_id) from None
    if p.status != "paid":
        raise conflict(f"Payment is {p.status}, not paid") from None
    if p.kind == "topup":
        raise conflict("Top-up payments cannot be refunded by a tenant") from None
    return p


async def _finish_refund(db, p: DriverPayment, note: str) -> None:
    """Flip to refunded + membership side effects: an activated membership is
    revoked (whitelist suspended), a still-pending one rejected. Session
    payments just flip status — an unconsumed exit grant stops matching."""
    p.status = "refunded"
    p.refunded_at = datetime.now(timezone.utc)
    if p.kind == "membership" and p.membership_id is not None:
        from app.services import membership_service

        m = (
            await db.execute(select(DriverMembership).where(DriverMembership.id == p.membership_id))
        ).scalar_one_or_none()
        if m is not None:
            if m.status == "active":
                m.status = "revoked"
                await membership_service._suspend_whitelist(db, m)
            elif m.status == "pending":
                m.status = "rejected"
            m.admin_note = (f"{m.admin_note}; {note}" if m.admin_note else note)[:_ADMIN_NOTE_MAX]
    await db.flush()


async def refund_payment(db, tenant_id: uuid.UUID, payment_id: uuid.UUID) -> dict:
    """Operator-initiated refund of a `paid` payment.

    - method='momo'   → provider `/refund` call (needs transId; a payment
      marked paid via the pull-refresh path may lack one — operator must
      refund in the MoMo console in that case).
    - method='wallet' → credit the balance back (refund_credit ledger row).

    Side effects: membership payments revoke an activated membership
    (whitelist suspended) or reject a still-pending one; session payments
    just flip status — an unconsumed exit grant stops matching `status='paid'`.

    A transport/HTTP failure talking to MoMo is a 502: the outcome is
    unknown, so the payment stays `paid` and `raw_payload.refund_attempt_error`
    is committed (attention list) for reconciliation against the console.
    """
    p = await _lock_refundable(db, tenant_id, payment_id)

    if p.method == "wallet":
        await wallet_service.credit(
            db, p.driver_id, p.amount_vnd, "refund_credit", p.id, "Refund by operator"
        )
    else:
        gw = _gateway_or_503()
        if not p.provider_trans_id:
            raise conflict("Provider transaction id is unknown — refund via the MoMo console") from None
        try:
            await gw.refund(
                order_id=p.provider_order_id,
                request_id=f"pv-rf-{uuid.uuid4().hex[:14]}",
                trans_id=p.provider_trans_id,
                amount_vnd=p.amount_vnd,
                description=f"Refund {p.kind} {p.id}",
            )
        except MomoRejected as exc:
            raise conflict(f"Refund rejected by provider: {exc}") from None
        except httpx.HTTPError as exc:
            _merge_raw(
                p,
                refund_attempt_error={
                    "message": f"{type(exc).__name__}: {exc}"[:300],
                    "at": _now_iso(),
                },
            )
            await db.flush()
            # Persist the record even though the request fails: the request
            # transaction would otherwise roll it back with the error.
            await db.commit()
            raise ApiError(
                502,
                "refund_provider_error",
                "Could not reach the payment provider; the refund was not confirmed. "
                "The payment stays paid — check the MoMo console, then retry or mark it refunded externally.",
            ) from None

    await _finish_refund(db, p, "refunded by operator")
    return await _tenant_payment_out(db, p.id)


async def mark_refunded_externally(
    db, tenant_id: uuid.UUID, payment_id: uuid.UUID, note: str, actor_id: uuid.UUID | None
) -> dict:
    """Operator records a refund done outside ParkVision (MoMo console, bank
    transfer, cash). No provider call or wallet credit; same membership side
    effects as `refund_payment`."""
    p = await _lock_for_external_refund(db, tenant_id, payment_id)
    _merge_raw(
        p,
        refunded_externally={
            "note": note,
            "by": str(actor_id) if actor_id else None,
            "at": _now_iso(),
        },
    )
    if p.status == "paid":
        await _finish_refund(db, p, f"refunded externally: {note}")
    else:
        # Money MoMo collected but ParkVision never applied (late IPN /
        # amount mismatch): close it out without any membership side effects.
        p.status = "refunded"
        p.refunded_at = datetime.now(timezone.utc)
        await db.flush()
    return await _tenant_payment_out(db, p.id)


# Non-paid payments the provider still collected money for; only these may be
# closed out by an external refund besides `paid` ones.
_UNAPPLIED_COLLECTION_KEYS = ("late_ipn", "amount_mismatch")


async def _lock_for_external_refund(db, tenant_id: uuid.UUID, payment_id: uuid.UUID) -> DriverPayment:
    try:
        return await _lock_refundable(db, tenant_id, payment_id)
    except ApiError:
        p = (
            await db.execute(
                select(DriverPayment)
                .where(DriverPayment.id == payment_id, DriverPayment.tenant_id == tenant_id)
                .with_for_update()
            )
        ).scalar_one_or_none()
        raw = (p.raw_payload or {}) if p is not None else {}
        if p is None or p.status in ("paid", "refunded") or p.kind == "topup":
            raise
        if not any(k in raw for k in _UNAPPLIED_COLLECTION_KEYS):
            raise
        return p


async def resolve_activation_errors(db, membership_id: uuid.UUID) -> None:
    """A paid-but-not-activated membership was activated by an operator:
    move `activation_error` aside so the payment leaves the attention list."""
    rows = (
        (
            await db.execute(
                select(DriverPayment).where(
                    DriverPayment.membership_id == membership_id,
                    DriverPayment.status == "paid",
                    DriverPayment.raw_payload.has_key("activation_error"),
                )
            )
        )
        .scalars()
        .all()
    )
    for p in rows:
        raw = dict(p.raw_payload or {})
        error = raw.pop("activation_error")
        raw["activation_error_resolved"] = {"error": error, "at": _now_iso()}
        p.raw_payload = raw
    if rows:
        await db.flush()


async def membership_has_paid_payment(db, membership_id: uuid.UUID) -> bool:
    return bool(
        await db.scalar(
            select(
                exists().where(
                    DriverPayment.membership_id == membership_id,
                    DriverPayment.status == "paid",
                )
            )
        )
    )


async def platform_refund_topup(db, payment_id: uuid.UUID) -> dict:
    """Platform-admin all-or-nothing refund of a paid MoMo top-up.

    Locks the payment row and wallet to prevent double-refund and ensure
    balance covers the full clawback. Returns 409 when any credit has been
    spent below the top-up amount.
    """
    p = (
        await db.execute(select(DriverPayment).where(DriverPayment.id == payment_id).with_for_update())
    ).scalar_one_or_none()
    if p is None:
        raise not_found("payment", payment_id) from None
    if p.kind != "topup":
        raise conflict("Only top-up payments can be refunded by this operation") from None
    if p.status != "paid":
        raise conflict(f"Payment is {p.status}, not paid") from None
    if p.method != "momo":
        raise conflict("Only gateway-funded top-ups can be refunded") from None
    if not p.provider_trans_id:
        raise conflict("Provider transaction id is unknown — refund via the MoMo console") from None

    # Lock wallet and verify full balance remains before touching the gateway.
    wallet = await wallet_service.get_or_create_wallet(db, p.driver_id)
    if wallet.balance_vnd < p.amount_vnd:
        raise conflict("Top-up credit has been spent; full refund is unavailable") from None

    gw = _gateway_or_503()
    try:
        await gw.refund(
            order_id=p.provider_order_id,
            request_id=f"pv-rf-{uuid.uuid4().hex[:14]}",
            trans_id=p.provider_trans_id,
            amount_vnd=p.amount_vnd,
            description=f"Refund top-up {p.id}",
        )
    except MomoRejected as exc:
        raise conflict(f"Refund rejected by provider: {exc}") from None

    await wallet_service.debit(
        db,
        p.driver_id,
        p.amount_vnd,
        "refund_debit",
        p.id,
        "Top-up refund by platform admin",
    )
    p.status = "refunded"
    p.refunded_at = datetime.now(timezone.utc)
    await db.flush()

    row = (
        await db.execute(
            select(DriverPayment, DriverUser, TenantSite)
            .join(DriverUser, DriverUser.id == DriverPayment.driver_id)
            .outerjoin(TenantSite, TenantSite.id == DriverPayment.site_id)
            .where(DriverPayment.id == p.id)
        )
    ).one()
    p2, d, s = row
    return {
        **_payment_out(p2, s.name if s else None),
        "driver_id": d.id,
        "driver_name": d.full_name,
        "driver_email": d.email,
    }
