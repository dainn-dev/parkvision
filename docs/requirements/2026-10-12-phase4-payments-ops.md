# Phase 4 — Payment ops, refunds, realtime push, driver wallet

**Status:** in progress · **Branch:** `feat/mobile-driver-api`
**Depends on:** Phase 3 (`2026-10-12-driver-payments.md`)

## Decisions

| Question | Decision |
|---|---|
| Refund authority | Operator-only: `POST /tenants/{t}/payments/{id}/refund` on `paid` payments. MoMo `/refund` call for gateway payments; wallet spends credit the wallet back. |
| Refund side effects | membership payment → revoke `active` membership / reject `pending` (suspend whitelist). session payment → gate effect already consumed (exit granted or not); status flips to `refunded`. topup → debit wallet only if `balance ≥ amount` (else 409 — can't claw back spent credit). **Top-up refunds are all-or-nothing:** the full top-up amount is debited only when the current balance is sufficient; if any amount has been spent such that the remaining balance is below the top-up amount, refund is rejected with 409 and no wallet, ledger, payment, or gateway state changes. Partial top-up refunds and debt/recovery are out of scope. |
| Wallet funding | `kind='topup'` payments via gateway only (10k–50M VND). Wallet **spend needs no gateway** — a funded wallet can pay membership/session even when `payment_provider=none`. |
| Wallet spend | `method='wallet'` on membership/session payments → atomic debit; `balance` can't go negative (conflict). `wallet_transactions` is the audit ledger (`balance_after` on every row). |
| Payment exclusivity | For a membership or parking session, at most one payment may be active or paid at a time, regardless of payment method. Concurrent wallet and gateway requests are serialized against the payable item. If an in-flight gateway payment already exists, a wallet request returns that existing payment and does not debit the wallet; if a wallet payment commits first, later gateway requests conflict because the item is already paid. A gateway callback for a payment must not settle a second payment for an item that is already paid; it is recorded for operator reconciliation and acknowledged without duplicate item side effects. |
| Realtime | Redis pub/sub per normalized plate (`pv:plate:{norm}`) published by `record_access_event` after flush. Driver WS `/ws/driver/sessions` subscribes the caller's own plates; payloads are opaque *hints* — the app refetches REST on each hint (data always comes from REST, socket can lag/drop harmlessly). |

## Migration `0018_wallet_refunds`

- `driver_payments`: `+ method` (str, default `'momo'`; `'wallet'` for wallet spends), `+ refunded_at`.
- `driver_wallets`: `driver_id` unique FK, `balance_vnd` bigint default 0.
- `wallet_transactions`: wallet_id FK, `kind` (`topup_credit` | `spend_debit` | `refund_credit` | `refund_debit`), `amount_vnd`, `balance_after_vnd`, `payment_id` FK→driver_payments nullable, `note`, created_at.
- RLS: `driver_wallets` — no RLS (driver-scoped via platform_session, like driver_vehicles); `wallet_transactions` same.

## Backend

- `gateways.py`: `MomoGateway.refund(order_id, transId, request_id, amount, description)` — `/refund` signature `accessKey&amount&description&orderId&partnerCode&requestId&transId`.
- `payment_service`: `create_payment` gains `method` + topup kind (client amount for topup only); `_apply_paid` topup → credit wallet; `spend_wallet(driver_id, kind, ref)` path for method='wallet'; `refund_payment(db, tenant_ctx, payment_id)` → gateway refund or wallet credit; side effects per the table above. All wallet debits/refunds and payable-item method reservations must be transactionally serialized; repeat callbacks/refunds must not apply side effects twice.
- `wallet_service.py`: get-or-create wallet, `credit`/`debit` writing ledger rows atomically (SELECT FOR UPDATE), `wallet_out` (balance + recent txns).
- Endpoints: `GET /driver/wallet`, `GET /driver/wallet/transactions`, `POST /driver/payments` (kind='topup' + `method`), `GET /tenants/{t}/payments` (filters kind/status/site + page), `POST /tenants/{t}/payments/{id}/refund` (audited).
- `record_access_event`: publish `pv:plate:{norm}` post-flush (try/except — Redis down must never fail a gate event).
- `/ws/driver/sessions`: driver token subscribes to the driver's plates; socket payloads are hints only and REST remains the authorization source.

## Frontend

- `TenantMembershipsPage` gains a **Payments tab**: driver/plate/kind/amount/status/date columns, status filter, per-site filter, **Refund** action on `paid` rows (confirm dialog → API → audit).

## Mobile

- `PaymentEWalletModal` gains a **Wallet section**: balance + recent transactions, top-up input → `kind:'topup'` payment → payUrl flow; payable items offer **Pay with wallet** (disabled when balance < amount) alongside MoMo.
- `useActiveSession`/`useParkingHistory`: subscribe `/ws/driver/sessions` (token query param), refetch on hints, keep REST polling as fallback.

## Tests

- Refund: tenant refund of paid membership payment → `refunded` + membership revoked + whitelist suspended; paid session refund → `refunded`; top-up refund with balance ≥ amount debits full amount and records one `refund_debit`; top-up refund with balance below amount returns 409 and changes no state; repeated refund is rejected without duplicate debit; non-paid → 409; bad signature IPN unaffected.
- Wallet: topup paid → credited once; wallet spend on membership → paid instantly + activated; insufficient balance → 409; spend on session → paid exit armed; refund credit restores balance; ledger rows correct.
- Payment exclusivity: concurrent wallet/MoMo attempts for the same membership/session produce at most one payable payment and one settlement; both request orderings and duplicate/late IPNs are covered.
- ws: driver token subscribes own plates only (channel-level test optional — unit-test the publish call shape + auth reject).

## Out of scope

VNPay/ZaloPay adapters, partial refunds, operator-initiated wallet adjustments UI, offline-edge paid exits (still documented limitation), push notification delivery (OS-level).
