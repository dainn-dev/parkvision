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
reads/writes). Terminal rows are never mutated again — IPNs and queries
are idempotent.
"""

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

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
from app.services.event_service import normalize_plate
from app.services.payments import MomoRejected, get_gateway
from app.services.pricing_service import estimate_fee, pricing_from_profile

_IN_FLIGHT = ("created",)
_TERMINAL = ("paid", "failed", "cancelled", "expired", "refunded")

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
    rows = (
        await db.execute(
            select(TenantSite.id, TenantSite.name).where(TenantSite.id.in_(site_ids))
        )
    ).all()
    return {i: n for i, n in rows}


# ---------- session resolution ----------


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
        await db.execute(select(AccessEvent).where(AccessEvent.id == event_id))
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
    owned = (
        await db.execute(
            select(DriverVehicle.id).where(
                DriverVehicle.driver_id == driver_id,
                DriverVehicle.plate_normalized == plate_norm,
            )
        )
    ).scalar_one_or_none()
    if owned is None:
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
        if (
            topup_amount_vnd is None
            or topup_amount_vnd < TOPUP_MIN_VND
            or topup_amount_vnd > TOPUP_MAX_VND
        ):
            raise bad_request(
                f"amountVnd must be between {TOPUP_MIN_VND} and {TOPUP_MAX_VND} for top-ups"
            )
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
                    select(DriverMembership).where(
                        DriverMembership.id == membership_id,
                        DriverMembership.driver_id == driver_id,
                    )
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
            in_flight = (
                await db.execute(
                    select(DriverPayment.id).where(
                        DriverPayment.membership_id == membership.id,
                        DriverPayment.status.in_(_IN_FLIGHT + ("paid",)),
                    )
                )
            ).scalar_one_or_none()
            if in_flight is not None:
                raise conflict("A payment for this membership is already in flight or paid") from None
            tenant_id, site_id = membership.tenant_id, membership.site_id
            plate_number, plate_norm = membership.plate_number, membership.plate_normalized
            ref, info = None, f"Membership {plan.name if plan else ''} @ site"

        elif kind == "session":
            if not session_ref:
                raise bad_request("sessionId is required")
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
            in_flight = (
                await db.execute(
                    select(DriverPayment.id).where(
                        DriverPayment.session_ref == session_ref,
                        DriverPayment.status.in_(_IN_FLIGHT + ("paid",)),
                    )
                )
            ).scalar_one_or_none()
            if in_flight is not None:
                raise conflict("A payment for this session is already in flight or paid") from None
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
            expires_at=(
                now + timedelta(minutes=settings.payment_ttl_minutes)
                if method == "momo"
                else None
            ),
        )
        db.add(p)
        await db.flush()
        p.provider_order_id = f"pv-{p.id}"
        p.provider_request_id = f"pv-{uuid.uuid4().hex[:16]}"

        if site is None and site_id is not None:
            site = (
                await db.execute(select(TenantSite).where(TenantSite.id == site_id))
            ).scalar_one_or_none()

        if method == "wallet":
            # Atomic: debit + side effects in one transaction — an
            # insufficient balance rolls the payment row back with it.
            await wallet_service.debit(
                db, driver_id, amount, "spend_debit", p.id, info
            )
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


async def _apply_paid(db, p: DriverPayment, payload: dict | None) -> None:
    """Mark paid + run side effects. Idempotent: callers check status."""
    p.status = "paid"
    p.paid_at = datetime.now(timezone.utc)
    if payload:
        p.raw_payload = payload
        trans = payload.get("transId")
        if trans is not None:
            p.provider_trans_id = str(trans)

    if p.kind == "membership" and p.membership_id is not None:
        from app.services import membership_service

        m = (
            await db.execute(
                select(DriverMembership).where(DriverMembership.id == p.membership_id)
            )
        ).scalar_one_or_none()
        if m is not None and m.status == "pending":
            try:
                await membership_service._activate_membership_row(
                    db, m, f"auto: paid via {p.method}"
                )
            except ApiError as exc:
                # money received but activation failed (e.g. blacklisted
                # plate) — keep paid, surface the failure for the operator.
                m.admin_note = f"payment received; activation failed: {exc.message}"
    elif p.kind == "topup":
        await wallet_service.credit(
            db, p.driver_id, p.amount_vnd, "topup_credit", p.id, "Wallet top-up"
        )
    await db.flush()


async def _refresh_from_gateway(db, p: DriverPayment) -> None:
    if p.status != "created" or p.method != "momo":
        return
    gw = get_gateway()
    if gw is None:
        return
    status = await gw.query_status(
        order_id=p.provider_order_id, request_id=p.provider_request_id
    )
    if status == "paid":
        await _apply_paid(db, p, {"query": "paid"})
    elif status == "failed":
        p.status = "failed"


async def get_payment(driver_id: uuid.UUID, payment_id: uuid.UUID) -> dict:
    async with platform_session() as db:
        await _expire_stale(db)
        p = (
            await db.execute(
                select(DriverPayment).where(
                    DriverPayment.id == payment_id, DriverPayment.driver_id == driver_id
                )
            )
        ).scalar_one_or_none()
        if p is None:
            raise not_found("payment", payment_id) from None
        await _refresh_from_gateway(db, p)
        name = (
            await db.scalar(select(TenantSite.name).where(TenantSite.id == p.site_id))
        )
        return _payment_out(p, name)


async def cancel_payment(driver_id: uuid.UUID, payment_id: uuid.UUID) -> dict:
    async with platform_session() as db:
        await _expire_stale(db)
        p = (
            await db.execute(
                select(DriverPayment).where(
                    DriverPayment.id == payment_id, DriverPayment.driver_id == driver_id
                )
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
                select(DriverPayment).where(
                    DriverPayment.provider == "momo",
                    DriverPayment.provider_order_id == str(payload.get("orderId", "")),
                )
            )
        ).scalar_one_or_none()
        if p is None:
            # Unknown order — verify passed so it's a real MoMo call; ack
            # silently rather than erroring (idempotent retry semantics).
            return {"resultCode": 0, "message": "unknown order"}
        if p.status in _TERMINAL:
            return {"resultCode": 0, "message": "already processed"}
        if gw.ipn_succeeded(payload):
            await _apply_paid(db, p, payload)
        else:
            p.status = "failed"
            p.raw_payload = payload
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
    page: int = 1,
    limit: int = 50,
) -> tuple[list[dict], int]:
    """Tenant-admin payment feed. `db` is a tenant_session — RLS already
    scopes driver_payments to the tenant (topup rows have NULL tenant_id
    and are invisible here by design)."""
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
    total = (
        await db.scalar(select(func.count()).select_from(q.subquery()))
    ) or 0
    rows = (
        (
            await db.execute(
                q.order_by(DriverPayment.created_at.desc())
                .offset((page - 1) * limit)
                .limit(limit)
            )
        )
        .all()
    )
    items = [
        {
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
        }
        for p, d, s in rows
    ]
    return items, total


async def refund_payment(db, tenant_id: uuid.UUID, payment_id: uuid.UUID) -> dict:
    """Operator-initiated refund of a `paid` payment.

    - method='momo'   → provider `/refund` call (needs transId; a payment
      marked paid via the pull-refresh path may lack one — operator must
      refund in the MoMo console in that case).
    - method='wallet' → credit the balance back (refund_credit ledger row).

    Side effects: membership payments revoke an activated membership
    (whitelist suspended) or reject a still-pending one; session payments
    just flip status — an unconsumed exit grant stops matching `status='paid'`.
    """
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

    if p.method == "wallet":
        await wallet_service.credit(
            db, p.driver_id, p.amount_vnd, "refund_credit", p.id, "Refund by operator"
        )
    else:
        gw = _gateway_or_503()
        if not p.provider_trans_id:
            raise conflict(
                "Provider transaction id is unknown — refund via the MoMo console"
            ) from None
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

    p.status = "refunded"
    p.refunded_at = datetime.now(timezone.utc)

    if p.kind == "membership" and p.membership_id is not None:
        from app.services import membership_service

        m = (
            await db.execute(
                select(DriverMembership).where(DriverMembership.id == p.membership_id)
            )
        ).scalar_one_or_none()
        if m is not None:
            if m.status == "active":
                m.status = "revoked"
                await membership_service._suspend_whitelist(db, m)
            elif m.status == "pending":
                m.status = "rejected"
            note = "refunded by operator"
            m.admin_note = f"{m.admin_note}; {note}" if m.admin_note else note
    await db.flush()
    row = (
        (
            await db.execute(
                select(DriverPayment, DriverUser, TenantSite)
                .join(DriverUser, DriverUser.id == DriverPayment.driver_id)
                .outerjoin(TenantSite, TenantSite.id == DriverPayment.site_id)
                .where(DriverPayment.id == p.id)
            )
        )
        .one()
    )
    p2, d, s = row
    return {
        **_payment_out(p2, s.name if s else None),
        "driver_id": d.id,
        "driver_name": d.full_name,
        "driver_email": d.email,
    }
