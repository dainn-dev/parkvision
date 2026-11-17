# Walk-in Fee Collection at the Gate — Design

**Date:** 2026-11-16
**Status:** Design approved; implementation not started
**Mockup:** `D:\Downloads\Edge Gate — ứng dụng desktop – 2 · Giám sát ra vào.html` (exit lane, "THU PHÍ XE VÃNG LAI")
**Builds on:** `docs/superpowers/plans/2026-11-16-edge-gate-desktop-redesign.md` (the UI part needs its `LaneCard`)

## Goal

Let a guard admit an unregistered ("vãng lai") vehicle at the entry gate from the edge client, have the system remember when it came in, and at the exit gate show the fee, take cash or a bank-transfer QR payment (or waive it with a reason), open the barrier, print a receipt, and report the totals to the tenant.

## Decisions from the product owner

1. A walk-in is recognised at the entry gate and admitted **manually** by the guard in the edge client. The entry time is recorded then; the fee is charged at exit.
2. The edge client downloads the tariff **when it starts**. When the tenant changes the tariff, the backend **signals** the edge, which re-downloads it automatically.
3. No shift reconciliation. The system only **counts and totals** what was collected (how many vehicles paid cash, etc.). The guard is responsible for the cash at handover.
4. Bank-transfer **QR at the exit gate**. A received payment **confirms automatically**; the guard can also **confirm manually**.
5. "Miễn phí" requires a **reason**.
6. A printout is required, carrying a **QR code** and the **full entry date and time**.

## How it works

### Entry

The entry lane reads a plate; the local decision is `deny / plate_not_registered`, exactly as today. The lane's main button for that case becomes **"Cho xe vãng lai vào"**. Pressing it:

- creates a walk-in session on the edge (new id, plate, entry gate, entry time = now, the capture photo key of that reading),
- asks the gate FSM to open (a locked or faulted gate refuses, and then no session is created),
- reports the session to the backend.

It is offered only for `plate_not_registered`. Blacklisted, suspended, expired or rule-denied vehicles are not walk-ins. An unreadable plate is typed with the existing manual plate entry first. If the plate already has an open session, that session is kept (the first entry time stands).

### Exit

The exit lane reads a plate and decides as today. If the result is `deny / plate_not_registered` **and** the plate has an open walk-in session, the lane shows the fee panel instead of "TỪ CHỐI":

- the session is looked up in the edge's own database first; if it is not there and the edge is online, it asks the backend (the vehicle may have entered through a gate run by another device);
- the fee is computed **on the edge** from the synced tariff, for entry time → the moment of recognition;
- the guard picks **Tiền mặt** or **Chuyển khoản QR**, then presses **"Đã thu 25.000 đ · Mở barrier"**; or presses **"Miễn phí"** and types a reason.

Settling closes the session, asks the FSM to open, records an allowed local event (so anti-passback sees the exit), and reports the settlement to the backend. The lane then shows "ĐÃ THU PHÍ · MỜI QUA" with "In biên lai".

If no session is found, the lane behaves as today (denied, "Mở thủ công"). If the tariff has no hourly rate or was never synced, the panel shows "Chưa có bảng giá" and only "Miễn phí" (with reason) is available.

### Tariff sync

The tariff is the existing site pricing (`tenant_sites.public_profile.pricing`, the `SitePricing` shape). A new edge endpoint returns it together with the site timezone and the site's receiving bank account. The edge stores it locally and fetches it at start-up, in every regular sync cycle, and immediately when the backend signals a change. The signal is a small message on the gates' existing MQTT command topics, sent when a site's pricing or bank account is updated; it is not a barrier command and creates no command record.

The fee formula is the backend's `estimate_fee`, re-implemented on the edge. Both implementations are tested against one shared file of cases so they cannot drift apart.

### Bank-transfer QR

The site stores one receiving bank account (bank code, account number, account name). The edge builds a VietQR code for that account with the exact amount and a short payment code derived from the session id (`PV` + 8 hex characters), and shows it in the fee panel for the driver to scan.

- **Manual confirmation:** the guard sees the transfer on the site's bank app and presses "Đã thu … · Mở barrier". Works with no further integration.
- **Automatic confirmation:** a bank-notification service calls a backend webhook when money arrives. The backend finds the open session by the payment code in the transfer text, records the reference and amount, and signals the edge. If the amount covers the fee the edge settles the session by itself and opens the barrier; if it is short, the panel shows how much arrived and how much is missing, and the guard decides.

### Printing

#### Phiếu vào (cổng vào)

- Nội dung: QR mã định danh chuyến (`PV` + 8 ký tự hex), biển số xe, giờ vào, cổng vào và ảnh chụp lúc nhận diện nếu có.
- In ngay khi xe vãng lai được cho vào, sau khi nhấn "Cho xe vãng lai vào".
- Mục đích: dùng để tra chuyến khi xe ra cổng.

#### Biên lai ra (cổng ra)

- Nội dung: QR mã biên lai, biển số xe, giờ vào/ra, thời lượng, số tiền, phương thức thanh toán (tiền mặt / QR ngân hàng), lý do miễn phí nếu có và mã biên lai.
- In ngay sau khi thanh toán xong, sau khi nhấn "Đã thu … · Mở barrier" hoặc khi webhook tự động xác nhận.
- Mục đích: biên lai chính thức cho tài xế.

Cả hai loại in đều qua máy in mặc định của PC cổng, thường là máy in nhiệt 80mm. Không có in qua hệ thống in chung hoặc lưu PDF.

### Statistics

The backend keeps one record per walk-in visit with its outcome. The tenant dashboard gets a "Xe vãng lai" report: per site and date range, the number of vehicles and total for cash, for bank transfer, and the number waived (with reasons), plus the list. The edge's settings screen shows today's totals for that device, so the guard can check the cash in hand.

The backend also recomputes the fee itself and stores it next to the amount the edge charged; the report marks visits where the two differ.

## Data

**Backend, new table `walk_in_sessions`** (tenant-scoped, RLS like `driver_payments`): `id` (the edge's session id), `tenant_id`, `site_id`, `plate_number`, `plate_normalized`, `pay_code`, `entry_gate_id`, `entered_at`, `entry_plate_image_key`, `status` (`open` | `paid` | `waived`), `exit_gate_id`, `exited_at`, `amount_vnd`, `expected_amount_vnd`, `method` (`cash` | `bank_qr`), `confirmed_by` (`manual` | `auto`), `waive_reason`, `bank_ref`, `bank_amount_vnd`, `bank_paid_at`, timestamps.

**Backend, new column `tenant_sites.bank_account`** (JSON: `bin`, `accountNumber`, `accountName`; null = no QR).

**Edge, new SQLite table `walk_in_sessions`** with the same visit fields, and the synced tariff stored under one key in the existing `kv` table.

## Messages

Edge → backend, on the gate's existing telemetry topic, queued in the existing offline outbox:

```json
{"type":"walk_in_entry","gateId":"…","sessionId":"…","plateNumber":"29H11122",
 "enteredAt":"2026-11-16T08:12:00Z","plateImageKey":"plate-ev1.jpg","deviceId":"…"}
{"type":"walk_in_exit","gateId":"…","sessionId":"…","plateNumber":"29H11122",
 "enteredAt":"2026-11-16T08:12:00Z","exitedAt":"2026-11-16T10:42:05Z","amountVnd":25000,
 "method":"cash","confirmedBy":"manual","waiveReason":null,"bankRef":null,"deviceId":"…"}
```

Both carry their own timestamps (the backend must not use arrival time, since frames can be queued offline), and the exit frame repeats the entry fields so the visit is complete even if the entry frame was lost.

Backend → edge, on the gates' existing command topics:

```json
{"type":"pricing_updated","siteId":"…"}
{"type":"walk_in_paid","sessionId":"…","amountVnd":25000,"bankRef":"FT26321…","paidAt":"2026-11-16T10:42:40Z"}
```

## Behaviour when offline

- Entry and exit on the **same device** work fully offline: the session and the tariff are local, and both frames wait in the outbox.
- Exit on a **different device** than entry needs the network for the lookup. Offline, no session is found and the guard uses "Mở thủ công" as today.
- Automatic QR confirmation needs the network; manual confirmation does not.
- The outbox still caps at 10,000 rows; a dropped frame means a visit missing from the report, not a blocked vehicle.

## Not included

- Per-vehicle-type tariffs ("Loại xe" in the mockup is dropped: an unregistered plate has no known type and the tariff has no per-type rates).
- A lane-facing second screen for the QR code.
- Shift open/close, cash reconciliation, refunds of walk-in payments.
- Automatic admission of walk-ins at entry.
- Uploading capture photos to the backend (the entry photo is shown only when the vehicle entered through the same device).

## Open Points

1. **Which bank-notification service** will deliver "money received" for the site's account (it determines the webhook's format and signature check, and whether there is one account per tenant or per site). Until it is chosen, the plan ships manual confirmation plus a webhook with a simple shared-secret format that a provider adapter will wrap.

The print contents and timing are decided: a **phiếu vào** prints after entry admission, and a **biên lai ra** prints after settlement. The implementation plan must treat both as separate print templates and test both flows.

## Data

**Backend, new table `walk_in_sessions`** (tenant-scoped, RLS like `driver_payments`): `id` (the edge's session id), `tenant_id`, `site_id`, `plate_number`, `plate_normalized`, `pay_code`, `entry_gate_id`, `entered_at`, `entry_plate_image_key`, `status` (`open` | `paid` | `waived`), `exit_gate_id`, `exited_at`, `amount_vnd`, `expected_amount_vnd`, `method` (`cash` | `bank_qr`), `confirmed_by` (`manual` | `auto`), `waive_reason`, `bank_ref`, `bank_amount_vnd`, `bank_paid_at`, timestamps.

**Backend, new column `tenant_sites.bank_account`** (JSON: `bin`, `accountNumber`, `accountName`; null = no QR).

**Edge, new SQLite table `walk_in_sessions`** with the same visit fields, and the synced tariff stored under one key in the existing `kv` table.

## Messages

Edge → backend, on the gate's existing telemetry topic, queued in the existing offline outbox:

```json
{"type":"walk_in_entry","gateId":"…","sessionId":"…","plateNumber":"29H11122",
 "enteredAt":"2026-11-16T08:12:00Z","plateImageKey":"plate-ev1.jpg","deviceId":"…"}
{"type":"walk_in_exit","gateId":"…","sessionId":"…","plateNumber":"29H11122",
 "enteredAt":"2026-11-16T08:12:00Z","exitedAt":"2026-11-16T10:42:05Z","amountVnd":25000,
 "method":"cash","confirmedBy":"manual","waiveReason":null,"bankRef":null,"deviceId":"…"}
```

Both carry their own timestamps (the backend must not use arrival time, since frames can be queued offline), and the exit frame repeats the entry fields so the visit is complete even if the entry frame was lost.

Backend → edge, on the gates' existing command topics:

```json
{"type":"pricing_updated","siteId":"…"}
{"type":"walk_in_paid","sessionId":"…","amountVnd":25000,"bankRef":"FT26321…","paidAt":"2026-11-16T10:42:40Z"}
```

## Behaviour when offline

- Entry and exit on the **same device** work fully offline: the session and the tariff are local, and both frames wait in the outbox.
- Exit on a **different device** than entry needs the network for the lookup. Offline, no session is found and the guard uses "Mở thủ công" as today.
- Automatic QR confirmation needs the network; manual confirmation does not.
- The outbox still caps at 10,000 rows; a dropped frame means a visit missing from the report, not a blocked vehicle.

## Not included

- Per-vehicle-type tariffs ("Loại xe" in the mockup is dropped: an unregistered plate has no known type and the tariff has no per-type rates).
- A lane-facing second screen for the QR code.
- Shift open/close, cash reconciliation, refunds of walk-in payments.
- Automatic admission of walk-ins at entry.
- Uploading capture photos to the backend (the entry photo is shown only when the vehicle entered through the same device).

## Open Points

1. **Which bank-notification service** will deliver "money received" for the site's account (it determines the webhook's format and signature check, and whether there is one account per tenant or per site). Until it is chosen, the plan ships manual confirmation plus a webhook with a simple shared-secret format that a provider adapter will wrap.

Printing is decided, not open: a **phiếu vào** prints after entry admission and a **biên lai ra** prints after settlement.
