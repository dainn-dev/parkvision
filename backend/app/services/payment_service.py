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

A 'created' payment expires after `payment_ttl_minutes` (lazy sweep on
reads/writes). Terminal rows are never mutated again — IPNs and queries
are idempotent.
"""

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.config import settings
from app.core.errors import ApiError, bad_request, conflict, not_found, unprocessable
from app.database import platform_session
from app.models import (
    AccessEvent,
    DriverMembership,
    DriverPayment,
    DriverVehicle,
    SiteMembershipPlan,
    TenantSite,
)
from app.services.event_service import normalize_plate
from app.services.payments import MomoRejected, get_gateway
from app.services.pricing_service import estimate_fee, pricing_from_profile

_IN_FLIGHT = ("created",)
_TERMINAL = ("paid", "failed", "cancelled", "expired")


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
        "status": p.status,
        "pay_url": p.pay_url,
        "paid_at": p.paid_at,
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
    driver_id: uuid.UUID, kind: str, membership_id: uuid.UUID | None, session_ref: str | None
) -> dict:
    gw = _gateway_or_503()
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

        else:
            raise bad_request("kind must be 'membership' or 'session'") from None

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
            provider=gw.name,
            status="created",
            provider_order_id="",  # filled after flush (needs p.id)
            provider_request_id="",
            expires_at=now + timedelta(minutes=settings.payment_ttl_minutes),
        )
        db.add(p)
        await db.flush()
        p.provider_order_id = f"pv-{p.id}"
        p.provider_request_id = f"pv-{uuid.uuid4().hex[:16]}"

        if site is None:
            site = (
                await db.execute(select(TenantSite).where(TenantSite.id == site_id))
            ).scalar_one_or_none()

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
                await membership_service._activate_membership_row(db, m, "auto: paid via momo")
            except ApiError as exc:
                # money received but activation failed (e.g. blacklisted
                # plate) — keep paid, surface the failure for the operator.
                m.admin_note = f"payment received; activation failed: {exc.message}"
    await db.flush()


async def _refresh_from_gateway(db, p: DriverPayment) -> None:
    if p.status != "created":
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
