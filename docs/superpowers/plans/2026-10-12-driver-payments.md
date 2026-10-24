# Phase 3 — Driver payments, pricing engine, paid exit

**Status:** in progress · **Plan doc:** this file · **Branch:** `feat/mobile-driver-api`
**Depends on:** Phase 1 (`2026-10-07-mobile-driver-api.md`), Phase 2 (`2026-10-12-driver-memberships.md`)

## Decisions (this doc IS the business spec; escalate to change)

| Question | Decision |
|---|---|
| Gateway | MoMo v2 `payWithMethod` adapter, sandbox endpoint default; selected via `payment_provider` env (`none` default). Adapter interface keeps VNPay/ZaloPay pluggable later. |
| Credentials | `momo_partner_code` / `momo_access_key` / `momo_secret_key` env. Unset → `POST /driver/payments` → 503 `payments_not_configured` (honest error, never a fake success). |
| Fee source | Tenant-configured **pricing rules** on `tenant_sites.public_profile.pricing` (extended with computable fields). No rules → `fee_vnd = null` → mobile shows "—". |
| Payable items | (a) `pending` memberships with `plan.price_vnd > 0` — paid → **auto-activate** (provisions whitelist). (b) parking sessions (PARKED or COMPLETED) — paid → `decide_access` grants a single exit within a grace window (pay-before-exit). |
| Refunds | None in v1 — payments are terminal once `paid`. Disputes are an operator/offline process. |
| Paid exit | `decide_access` allows an otherwise-denied EXIT (unregistered/non-blacklist plate) when a `paid` session payment for that plate+site exists, `exit_granted_at is null`, `paid_at` within `paid_exit_grace_minutes` (default 15, tenant settings override). Single-use: first allow stamps `exit_granted_at`. Blacklist tag always denies — paid exit never overrides it. Edge offline `decide_access` mirror does not know about payments — documented limitation. **Operational fallback (GAP-PAY-002, 2026-10-24):** while the edge gate is offline, a driver who has already completed `paid_exit` is released solely via the operator's manual-open control (`manual_open` Tauri command, `edge-client/src-tauri/src/lib.rs`) — there is no automatic sync of paid-exit grants into the edge SQLite store. Train gate operators to use manual-open for this case; see `docs/development-and-operations.md` and `docs/backend.md` for the runbook note. |
| Wallet | Out of scope — `driver_wallets`/`wallet_transactions` not built (no funding source; MoMo payments already cover the use cases). |

## Pricing rules (extend `SitePricing` in `app/schemas/resources.py`)

Stored in `public_profile.pricing` (JSONB, camelCase). New fields:

- `grace_minutes` (int, default 0) — free window from entry; `duration ≤ grace` → fee 0.
- `block_minutes` (int, default 60) — billing block size; `hourly_from` is VND **per hour**, billed per *started* block (`ceil(minutes/block) × hourly_from × block/60`).
- `daily_cap` semantics reuse `daily_from` — cap per rolling 24h window: `min(base, ceil(minutes/1440) × daily_from)`.
- `overnight_from` — flat surcharge per overnight-window crossing; window from `overnight_start_hour` (default 22) to `overnight_end_hour` (default 6), evaluated in `site.timezone`.
- `hourly_from: None` → not estimable → `fee_vnd: null`.
- `monthly_from` stays display-only (memberships own monthly).

`driver_session_service` computes `fee_vnd` on `DriverSessionOut` (both PARKED = accruing and COMPLETED). Mobile labels it "Est. fee".

## Migration `0017_driver_payments`

`driver_payments`: id, driver_id→driver_users, kind ('session'|'membership'), membership_id→driver_memberships (null), session_ref (str, entry access_event id), tenant_id, site_id, plate_normalized (str, null for membership), amount_vnd bigint, currency 'VND', provider str, status ('created'|'paid'|'failed'|'cancelled'|'expired'), provider_order_id, provider_request_id (unique), provider_trans_id, pay_url text, raw_payload jsonb, paid_at, expires_at, exit_granted_at, created/updated. Indexes: driver, membership, (tenant,plate_normalized,status) for the exit check. **RLS:** `tenant_isolation` policy like memberships (decide_access runs under tenant_session; driver reads under platform_session which bypasses).

## Gateway adapter (`app/services/payments/`)

```
get_gateway(settings) -> PaymentGateway | None
PaymentGateway: name; async create_payment(amount_vnd, order_id, order_info, request_id, redirect_url, ipn_url) -> {pay_url}; verify_ipn(payload) -> bool; async query(order_id, request_id) -> 'paid'|'failed'|'pending'
MomoGateway: HMAC-SHA256 signatures; sandbox default endpoint test-payment.momo.vn; /create + /query; verify_ipn validates signature + resultCode==0.
```

## Endpoints

| Method/Path | Auth | Behavior |
|---|---|---|
| `POST /driver/payments` | driver | `{kind, membershipId\|sessionId}` → server computes amount (plan price / fee engine) → row + gateway create → `{id, amountVnd, payUrl, status, expiresAt}` |
| `GET /driver/payments` | driver | history w/ lazy expiry sweep |
| `GET /driver/payments/{id}` | driver | status; `created` → gateway `query` pull-refresh (makes sandbox usable without public IPN) |
| `POST /driver/payments/{id}/cancel` | driver | `created` → `cancelled` |
| `POST /public/payments/momo/ipn` | none | signature-verify → `paid` → side effect (activate membership / arm paid exit) |

## `decide_access` change (`event_service.py`)

Add optional `site_id` param (passed from `record_access_event`). After the base deny outcome, if `direction == 'exit'` and vehicle is None-or-non-blacklist → check `driver_payments` for a qualifying paid row → `(allow, 'paid_exit', vehicle_id)` + stamp `exit_granted_at`. Still passes through `_final` anti-passback. Paid-exit check uses tenant settings `paid_exit_grace_minutes` (default 15).

## Membership payment → activation

On IPN/query `paid` for `kind='membership'`: open `platform_session`, reuse a shared `_activate(db, m)` extracted from `activate_membership` (provisions RegisteredVehicle + sets window). Refactor `membership_service` so tenant endpoint and payment path share the same body.

## Mobile

- `api/driver.ts`: `createPayment/listPayments/getPayment/cancelPayment`; `DriverSession.feeVnd`.
- `PaymentEWalletModal` → real Payments sheet: payable memberships (pending, priced) + sessions with unpaid estimated fee → create → `window.open(payUrl)` → poll `getPayment` until terminal; `payments_not_configured` → honest coming-soon panel.
- `MembershipsScreen`: pending + priced → "Pay to activate" action.
- `ActiveParkingCard` / `MyParkingScreen` / `FindMyVehicleModal`: show `feeVnd` ("Est.") when present, "—" when null.

## Frontend

- `EditLocationSheet`: new "Public listing & pricing" section — `listed`, `description`, display pricing fields + rule fields (grace, block, daily cap, overnight + window) → persists `public_profile`.

## Tests

- `test_pricing.py`: fee matrix — free window, block rounding, daily cap, overnight crossing, timezone, no-rules→null.
- `test_payments_api.py`: create membership payment (mocked gateway), duplicate-in-flight conflict, cancel, IPN paid → membership active + whitelist row, IPN bad signature → 400, session payment + `decide_access` paid-exit allow once only, blacklist never overridden, `payments_not_configured` → 503, lazy expiry.

## Out of scope

VNPay/ZaloPay adapters, refunds, wallet ledger, operator payment dashboard, offline-edge paid exits.
