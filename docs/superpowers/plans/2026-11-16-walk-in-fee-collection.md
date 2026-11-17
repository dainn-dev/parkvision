# Walk-in Fee Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A guard admits an unregistered vehicle at entry from the edge client and prints an entry ticket; at exit the edge shows the fee, takes cash or bank-QR payment (or a waiver with a reason), opens the barrier, prints an exit receipt, and the tenant sees the totals.

**Architecture:** The edge owns the visit: it creates the session at entry, computes the fee at exit from a locally synced tariff, and settles it; each step is reported to the backend as a frame on the existing telemetry topic (through the existing offline outbox). The backend stores one row per visit, serves the tariff and cross-device session lookups over the existing edge REST API, and pushes two small signals (`pricing_updated`, `walk_in_paid`) down the existing gate command topics.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, PostgreSQL RLS, Redis outbox, aiomqtt bridge (backend); Rust, Tauri 2, rusqlite, chrono + chrono-tz (edge); React 19, Tailwind 4, Vitest (edge UI and dashboard).

**Spec:** `docs/superpowers/specs/2026-11-16-walk-in-fee-collection-design.md`

The plan has three phases. Each one ends in working, tested software and can be merged on its own: **A** backend (Tasks 1–5), **B** edge Rust (Tasks 6–9), **C** UI (Tasks 10–14). Phase C requires the UI redesign plan (`2026-11-16-edge-gate-desktop-redesign.md`) to be merged first.

## Global Constraints

- Backend tests need the isolated `*_test` Postgres/Redis described in `CLAUDE.md`; run from `backend/` with `.venv/bin/python -m pytest`. Lint: `.venv/bin/python -m ruff check app tests scripts`.
- Edge Rust: `cargo test` in `edge-client/src-tauri/`. Edge UI: `npm run lint`, `npm test`, `npm run build` in `edge-client/`. Dashboard: same three in `frontend/` (baseline: `theme.test.ts` fails 6 tests on Windows).
- Amounts are integer VND everywhere. Timestamps on the wire are RFC 3339 UTC. JSON is camelCase.
- The backend never uses arrival time for a walk-in frame; it uses the frame's `enteredAt` / `exitedAt`.
- Every backend write for a walk-in is idempotent on `sessionId`; replaying any frame or webhook changes nothing.
- No network or disk I/O is added to the FSM tick. Session lookup over REST happens in the pipeline task, with a 3 s timeout.
- The two backend → edge signals are not barrier commands: no `GateCommand` row, no ack.
- New migration is `0024_walk_in_sessions.py`, revises `0023`. RLS policy follows `migrations/versions/0017_driver_payments.py` lines 98–100.
- The edge fee formula must return the same value as `backend/app/services/pricing_service.py::estimate_fee` for every case in the shared vectors file.
- "Mở thủ công" stays available on every lane regardless of fee state.
- UI copy is Vietnamese, exactly as written here. Fee-pending color is amber `#F5B700` (text `#1A1400`); amber tag text is `#F5C53D`.
- Two printouts are required: a **phiếu vào** immediately after entry admission, and a **biên lai ra** immediately after settlement. Both use the gatehouse PC's default printer.

## Review Focus

1. **Settling twice.** A double click, or automatic confirmation racing a manual one, must close the session once, open once, and report one settlement. Tests in Tasks 8 and 9.
2. **Frames out of order or lost.** An exit frame arriving before (or without) its entry frame must still produce a complete visit. Test in Task 2.
3. **Same plate entering again before leaving.** The open session and its first entry time must be kept. Test in Task 8.
4. **Short or duplicate bank transfer.** An underpayment must not open the barrier; a replayed webhook must not double-count. Tests in Tasks 4 and 9.
5. **Tariff missing or just changed.** With no hourly rate the panel must not show 0 đ as if it were a price; a tariff change during a stay must apply to the next quote. Tests in Tasks 6, 7 and 11.
6. **Both printouts.** Admission must print the entry ticket, and settlement must print the exit receipt. Tests in Tasks 11 and 12.

---

## Phase A — Backend

### Task 1: Schema

**Files:**
- Create: `backend/migrations/versions/0024_walk_in_sessions.py`
- Modify: `backend/app/models.py` (new `WalkInSession`; `TenantSite.bank_account`)
- Modify: `backend/app/schemas/resources.py` (`SiteBankAccount`; `bank_account` on `SiteIn`, the site update schema and `SiteOut`; `WalkInSessionOut`, `WalkInSummaryOut`)
- Test: `backend/tests/test_walk_ins.py`, `backend/tests/test_schema_alignment.py` (existing; must still pass)

**Interfaces:**
- Produces:
  - Table `walk_in_sessions`: `id uuid pk` (client-supplied), `tenant_id`, `site_id`, `plate_number varchar(20)`, `plate_normalized varchar(20)`, `pay_code varchar(12)`, `entry_gate_id uuid null`, `entered_at timestamptz`, `entry_plate_image_key text null`, `status varchar(10) default 'open'` (check: `open|paid|waived`), `exit_gate_id uuid null`, `exited_at timestamptz null`, `amount_vnd bigint null`, `expected_amount_vnd bigint null`, `method varchar(10) null` (check: `cash|bank_qr`), `confirmed_by varchar(10) null` (check: `manual|auto`), `waive_reason text null`, `bank_ref varchar(80) null`, `bank_amount_vnd bigint null`, `bank_paid_at timestamptz null`, `created_at`, `updated_at`. Indexes: `(tenant_id, site_id, exited_at)`, `(tenant_id, plate_normalized, status)`, unique partial `(tenant_id, pay_code) WHERE status = 'open'`. RLS `tenant_isolation`.
  - Column `tenant_sites.bank_account jsonb null`.
  - `SiteBankAccount(CamelModel)`: `bin: str` (6 digits), `account_number: str` (6–19 digits), `account_name: str` (1–50 chars, stored upper-cased).
  - `pay_code_for(session_id: uuid.UUID) -> str` in `app/services/walk_in_service.py` — `"PV" + session_id.hex[:8].upper()`.

- [ ] **Step 1: Write the failing tests** in `test_walk_ins.py`: `test_pay_code_for` (`uuid.UUID("0a1b2c3d-0000-0000-0000-000000000000")` → `"PV0A1B2C3D"`); `test_site_bank_account_round_trip` (PATCH `/api/v1/tenant/sites/{id}` with `{"bankAccount":{"bin":"970436","accountNumber":"0123456789","accountName":"cong ty abc"}}` → GET returns `accountName == "CONG TY ABC"`); `test_site_bank_account_rejects_bad_bin` (`"bin":"97A"` → 422); `test_walk_in_sessions_isolated_by_tenant` (a row inserted for `tenant` is invisible in a `tenant_session` of `other_tenant`).
- [ ] **Step 2: Run** `pytest tests/test_walk_ins.py -v` — expected: FAIL (module/column missing).
- [ ] **Step 3: Write the migration, model, schemas and `pay_code_for`.**
- [ ] **Step 4: Run** `pytest tests/test_walk_ins.py tests/test_schema_alignment.py tests/test_tenant_isolation.py -v` — expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(backend): walk-in session schema and site bank account"`

### Task 2: Ingest walk-in frames

**Files:**
- Modify: `backend/app/services/walk_in_service.py`
- Modify: `backend/app/realtime/mqtt_bridge.py` (`handle_telemetry`, before the `GateTelemetryLog` insert)
- Test: `backend/tests/test_walk_ins.py`

**Interfaces:**
- Consumes: `record_access_event` (`app/services/event_service.py:235`), `estimate_fee`, `pricing_from_profile`, `publish_ws`.
- Produces:
  - `async def upsert_entry(db, *, tenant_id, site_id, gate_id, payload: dict) -> WalkInSession` — inserts if `sessionId` is new; if it exists, changes nothing.
  - `async def apply_exit(db, *, tenant_id, site_id, gate_id, payload: dict) -> WalkInSession` — creates the row from the frame's entry fields if missing; if `status == 'open'`, sets exit fields, `status` (`waived` when `method == "waived"`, else `paid`), `method` (null for waived), `amount_vnd` (0 for waived), `expected_amount_vnd` = `estimate_fee(site pricing, entered_at, exited_at, site.timezone)`; if already closed, changes nothing.
  - Bridge: frames with `type` `walk_in_entry` / `walk_in_exit` call these, then record an access event with `source=EventSource.MANUAL`, `force_decision="allow"`, `occurred_at` = the frame's time and `force_reason` = `walk_in_admitted` (entry), `walk_in_paid` or `walk_in_waived` (exit); then `publish_ws` `{"type":"walk_in","event":"entry"|"exit","session":{…}}`. Only the first application of a frame records an access event. These frames are not written to `GateTelemetryLog` and do not update gate state.

- [ ] **Step 1: Read `event_service.record_access_event` (lines 235–330)** to confirm what a forced allow does to presence, occupancy and the paid-exit grant; note anything surprising in the commit message.
- [ ] **Step 2: Write the failing tests** (call `handle_telemetry` directly with dict payloads, as the existing bridge tests do):
  - `test_entry_frame_creates_open_session` — `status == "open"`, `entered_at` equals the frame's `enteredAt` (set 3 hours in the past), `pay_code == pay_code_for(id)`, one access event with `decision == "allow"`, reason `walk_in_admitted`, `occurred_at == enteredAt`.
  - `test_entry_frame_replay_is_noop` — same frame twice → one session, one access event.
  - `test_exit_frame_closes_and_recomputes` — site pricing `{"hourlyFrom": 10000, "blockMinutes": 60}`, stay 2 h 30 min, frame `amountVnd: 30000, method: "cash", confirmedBy: "manual"` → `status == "paid"`, `amount_vnd == 30000`, `expected_amount_vnd == 30000`.
  - `test_exit_without_entry_builds_full_visit` — no entry frame sent → row exists with the frame's `enteredAt`, `status == "paid"`.
  - `test_exit_replay_and_late_entry_do_not_reopen` — exit, exit again with `amountVnd: 99`, then the entry frame → still one row, `amount_vnd` unchanged, `status == "paid"`.
  - `test_waived_exit_stores_reason` — `method: "waived", waiveReason: "Xe công vụ"` → `status == "waived"`, `method is None`, `amount_vnd == 0`, reason stored.
  - `test_walk_in_frame_does_not_touch_gate_state` — gate `status` and `GateTelemetryLog` count unchanged.
- [ ] **Step 3: Run** `pytest tests/test_walk_ins.py -v` — expected: the new tests FAIL.
- [ ] **Step 4: Implement** the two service functions and the bridge branch.
- [ ] **Step 5: Run** `pytest tests/test_walk_ins.py tests/test_resources_and_commands.py -v` — expected: PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(backend): ingest walk-in entry and exit frames"`

### Task 3: Tariff and session lookup for the edge; tariff-changed signal

**Files:**
- Modify: `backend/app/api/v1/edge.py` (two routes, same `edge_ctx` dependency and tenant check as `edge_whitelist`)
- Modify: `backend/app/schemas/resources.py` (`EdgeSitePricingOut`, `EdgeWalkInOut`)
- Modify: `backend/app/services/walk_in_service.py` (`enqueue_site_signal`)
- Modify: `backend/app/api/v1/tenant/sites.py` (`update_site`, after the field loop)
- Test: `backend/tests/test_walk_ins.py`

**Interfaces:**
- Produces:
  - `GET /api/v1/edge/tenants/{tenant_id}/sites/{site_id}/pricing` → `EdgeSitePricingOut { pricing: SitePricing, timezone: str, bankAccount: SiteBankAccount | null, updatedAt: datetime }`. 404 if the site is not in the tenant.
  - `GET /api/v1/edge/tenants/{tenant_id}/walk-ins/open?plate=<raw plate>` → `EdgeWalkInOut { sessionId, plateNumber, enteredAt, entryGateId, payCode } | null` (HTTP 200 with JSON `null` when none) — the newest `open` session for the normalized plate.
  - `async def enqueue_site_signal(db, *, tenant_id, site_id, message: dict) -> int` — LPUSHes `{"topic": command_topic(tenant, site, gate), "payload": message}` onto `MQTT_OUTBOX_KEY` for every gate of the site; returns the number pushed.
  - `update_site` calls `enqueue_site_signal(..., message={"type":"pricing_updated","siteId":str(site_id)})` when the request body contains `public_profile` or `bank_account`.

- [ ] **Step 1: Write the failing tests:** `test_edge_pricing_returns_tariff_timezone_bank`; `test_edge_pricing_rejects_other_tenants_key` (403/404, matching the whitelist route's behaviour); `test_edge_open_walk_in_normalizes_plate` (session stored for `29H-111.22`, query `plate=29h11122` → found; closed session → `null`); `test_site_pricing_update_signals_each_gate` (site with 2 gates, PATCH pricing → Redis `mqtt:outbox` holds 2 messages with `payload.type == "pricing_updated"` and the two command topics); `test_site_rename_does_not_signal` (PATCH `{"name": …}` → outbox empty).
- [ ] **Step 2: Run** — expected: FAIL (404 on the new routes).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pytest tests/test_walk_ins.py tests/test_edge_activation.py -v` — expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(backend): edge tariff endpoint, walk-in lookup, pricing-updated signal"`

### Task 4: Bank-transfer confirmation

**Files:**
- Modify: `backend/app/services/walk_in_service.py` (`confirm_bank_transfer`)
- Create: `backend/app/services/payments/bank_notify.py`
- Modify: `backend/app/api/v1/public.py` (route next to `momo_ipn`, same rate-limit pattern)
- Modify: `backend/app/config.py` (`bank_webhook_secret: str = ""`)
- Test: `backend/tests/test_walk_ins.py`

**Interfaces:**
- Produces:
  - `@dataclass BankTransfer { site_id: uuid.UUID, content: str, amount_vnd: int, reference: str, paid_at: datetime }`
  - `class BankNotifyAdapter(Protocol): def parse(self, headers: Mapping[str, str], raw_body: bytes) -> BankTransfer | None` — returns `None` when the signature is invalid.
  - `SharedSecretAdapter` — body `{"siteId","content","amountVnd","reference","paidAt"}`, header `X-Signature` = hex HMAC-SHA256 of the raw body with `settings.bank_webhook_secret`; an empty secret rejects everything.
  - `POST /api/v1/public/walk-ins/bank-webhook` → 200 `{"matched": bool}`; 401 on a bad signature.
  - `async def confirm_bank_transfer(db, transfer: BankTransfer) -> WalkInSession | None` — extracts the first `PV[0-9A-F]{8}` from `content` (case-insensitive), finds the `open` session of that site with that `pay_code`; if `bank_ref` is already set to this `reference`, returns the session unchanged; otherwise stores `bank_ref`, `bank_amount_vnd`, `bank_paid_at` and calls `enqueue_site_signal` with `{"type":"walk_in_paid","sessionId","amountVnd","bankRef","paidAt"}`. It does **not** close the session — the edge's exit frame does.

- [ ] **Step 1: Write the failing tests:** `test_bank_webhook_matches_open_session_and_signals_edge` (content `"NGUYEN VAN A chuyen tien pv0a1b2c3d"` → `matched: true`, fields stored, session still `open`, one `walk_in_paid` message per gate in the outbox); `test_bank_webhook_replay_does_not_signal_twice`; `test_bank_webhook_bad_signature_is_401`; `test_bank_webhook_unknown_code_is_unmatched` (200, `matched: false`, nothing queued); `test_bank_webhook_ignores_closed_session`; `test_bank_webhook_short_amount_is_still_forwarded` (amount below the fee → stored and signalled with the real amount; the edge decides).
- [ ] **Step 2: Run** — expected: FAIL.
- [ ] **Step 3: Implement.** The adapter is selected in one function, `get_bank_adapter()`, so a provider-specific adapter can replace `SharedSecretAdapter` once the provider is chosen (spec, Open Point 1).
- [ ] **Step 4: Run** `pytest tests/test_walk_ins.py -v` — expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(backend): bank-transfer webhook for walk-in sessions"`

### Task 5: Tenant report API

**Files:**
- Create: `backend/app/api/v1/tenant/walk_ins.py`; register it where `tenant/payments.py` is registered
- Test: `backend/tests/test_walk_ins.py`, `backend/tests/test_rbac_matrix.py` (add the two routes as read routes)

**Interfaces:**
- Produces:
  - `GET /api/v1/tenant/walk-ins?siteId=&from=&to=&status=&page=&pageSize=` → `Page[WalkInSessionOut]`, newest `entered_at` first. `WalkInSessionOut` adds `amountMismatch: bool` (`amount_vnd != expected_amount_vnd` for paid rows with a non-null expectation).
  - `GET /api/v1/tenant/walk-ins/summary?siteId=&from=&to=` → `WalkInSummaryOut { cashCount, cashTotalVnd, bankQrCount, bankQrTotalVnd, waivedCount, openCount, mismatchCount }`. `from`/`to` filter `exited_at` for closed rows; `openCount` counts sessions currently `open`.

- [ ] **Step 1: Write the failing tests:** `test_summary_counts_by_method` (2 cash 20000 + 15000, 1 bank_qr 30000, 1 waived, 1 open → `cashCount 2, cashTotalVnd 35000, bankQrCount 1, bankQrTotalVnd 30000, waivedCount 1, openCount 1`); `test_summary_respects_date_range_and_site`; `test_list_flags_amount_mismatch`; `test_walk_in_report_is_tenant_scoped`.
- [ ] **Step 2: Run** — expected: FAIL (404).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the whole backend suite `pytest` and `ruff check app tests scripts` — expected: PASS, no lint errors.
- [ ] **Step 5: Commit** — `git commit -m "feat(backend): walk-in report endpoints"`

---

## Phase B — Edge (Rust)

### Task 6: Fee formula on the edge

**Files:**
- Create: `backend/tests/fixtures/pricing_vectors.json`
- Modify: `backend/tests/test_pricing.py` (one parametrized test over the file)
- Modify: `edge-client/src-tauri/Cargo.toml` (`chrono-tz = "0.10"`)
- Create: `edge-client/src-tauri/src/pricing.rs`; declare it in `lib.rs`

**Interfaces:**
- Produces:
  - Vectors file: a JSON array of `{ "name", "pricing": {camelCase SitePricing}, "timezone", "enteredAt", "exitedAt", "expected": int | null }`. At least: within grace → 0; 1 minute past grace → one block; exact block boundary; 2 h 30 min at 60-minute blocks; 30-minute blocks; daily cap reached; two 24 h windows; one overnight crossing in `Asia/Ho_Chi_Minh` (22→6); stay entirely inside the overnight window; overnight start == end → no surcharge; `hourlyFrom: null` → `null`; exit before entry → what the Python returns today.
  - `pub struct SitePricing { hourly_from: Option<i64>, daily_from: Option<i64>, overnight_from: Option<i64>, grace_minutes: u32 (default 0), block_minutes: u32 (default 60), overnight_start_hour: u8 (default 22), overnight_end_hour: u8 (default 6) }` — serde camelCase, unknown fields ignored.
  - `pub fn estimate_fee(p: &SitePricing, entered_at: DateTime<Utc>, exited_at: DateTime<Utc>, timezone: &str) -> Option<i64>` — an unknown timezone name falls back to UTC, as the Python does.

- [ ] **Step 1: Write the vectors file** by running the existing Python `estimate_fee` for each case and recording its result (the Python is the reference; do not hand-compute `expected`).
- [ ] **Step 2: Add the Python test** `test_pricing_vectors` and run `pytest tests/test_pricing.py -v` — expected: PASS (it pins today's behaviour).
- [ ] **Step 3: Write the failing Rust test** `matches_backend_vectors` in `pricing.rs`, reading the file with `include_str!("../../../backend/tests/fixtures/pricing_vectors.json")` and asserting every case by `name`.
- [ ] **Step 4: Run** `cargo test matches_backend_vectors` — expected: FAIL (`estimate_fee` undefined).
- [ ] **Step 5: Implement `estimate_fee`** as a line-for-line port of `pricing_service.py` lines 33–117.
- [ ] **Step 6: Run** `cargo test pricing` — expected: PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat(edge): port fee estimator with shared test vectors"`

### Task 7: Tariff sync

**Files:**
- Modify: `edge-client/src-tauri/src/store.rs` (kv-backed tariff accessors)
- Modify: `edge-client/src-tauri/src/sync.rs` (`sync_pricing`)
- Modify: `edge-client/src-tauri/src/runtime.rs` (sync loop near line 420; inbound dispatch near line 393)

**Interfaces:**
- Produces:
  - `pub struct StoredPricing { pricing: SitePricing, timezone: String, bank_account: Option<BankAccount>, updated_at: String }`, `pub struct BankAccount { bin, account_number, account_name }` (serde camelCase).
  - `Store::put_site_pricing(&self, p: &StoredPricing) -> Result<()>` and `Store::site_pricing(&self) -> Result<Option<StoredPricing>>` — one JSON value under kv key `site_pricing`.
  - `SyncClient::sync_pricing(&self) -> Result<bool>` — GETs `/edge/tenants/{tenant}/sites/{site}/pricing`; `true` when the stored value changed; 401/403 → `AuthError`, like the other sync calls.
  - Runtime: the sync loop calls `sync_pricing` on its first iteration at start-up **without** waiting for MQTT to connect, then every cycle after whitelist/rules; a `tokio::sync::Notify` (`pricing_notify`) wakes the loop for an immediate `sync_pricing`. The inbound dispatch treats `type == "pricing_updated"` like `heartbeat_ack` (handled before `CommandPayload` parsing): it calls `pricing_notify.notify_one()` when `siteId` equals the configured site.

- [ ] **Step 1: Write the failing tests.** `store.rs`: `site_pricing_round_trips_and_overwrites`. `sync.rs` (same local-HTTP-server style as the existing sync tests): `sync_pricing_stores_tariff_and_reports_change` (first call `true`, identical second call `false`, changed tariff `true`); `sync_pricing_maps_401_to_auth_error`. `runtime.rs`: `pricing_updated_signal_triggers_sync_without_touching_executors` (send the signal on the command channel → pricing endpoint hit again, no command ack published); `pricing_updated_for_another_site_is_ignored`.
- [ ] **Step 2: Run** `cargo test pricing` — expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `cargo test` — expected: all pass.
- [ ] **Step 5: Commit** — `git commit -m "feat(edge): sync site tariff at start-up, on schedule and on signal"`

### Task 8: Walk-in sessions — admit, quote, settle

**Files:**
- Modify: `edge-client/src-tauri/src/store.rs` (table + accessors)
- Create: `edge-client/src-tauri/src/walkin.rs`
- Modify: `edge-client/src-tauri/src/pipeline.rs` (after `decide_access`), `runtime.rs` (`GateRuntime.pending_fee`), `sync.rs` (`lookup_open_walk_in`), `lib.rs` (status fields, four commands, handler registration)

**Interfaces:**
- Produces:
  - SQLite table `walk_in_sessions(session_id TEXT PRIMARY KEY, plate_normalized, plate_number, entry_gate_id, entered_at, entry_image_key, status DEFAULT 'open', exit_gate_id, exited_at, amount_vnd INTEGER, method, confirmed_by, waive_reason, bank_ref)` + index `(plate_normalized, status)`.
  - `Store::insert_walk_in(&WalkInRow) -> Result<()>` (ignore on existing id); `Store::open_walk_in(plate_normalized) -> Result<Option<WalkInRow>>` (newest open); `Store::close_walk_in(session_id, &Settlement) -> Result<bool>` (`false` if not open — single `UPDATE … WHERE status='open'`); `Store::walk_in_summary(since: DateTime<Utc>) -> Result<WalkInSummary>`.
  - `pub struct FeeQuote { session_id: Uuid, plate: String, entered_at, exited_at, duration_minutes: i64, amount_vnd: Option<i64>, entry_gate_id: Option<Uuid>, entry_image_key: Option<String>, pay_code: String, bank_received_vnd: Option<i64> }` (serde camelCase); `pay_code` = `"PV"` + first 8 hex of the session id, upper-case.
  - `pub struct Settlement { method: String /* cash|bank_qr|waived */, confirmed_by: String /* manual|auto */, waive_reason: Option<String>, bank_ref: Option<String> }`
  - `walkin::admit(rt_gate, store, publisher, ctx, plate: &str, image_key: Option<String>) -> Result<Uuid, String>` — errors: `"not an entry gate"`, `"plate required"`, the FSM's refusal string. Reuses an existing open session. Publishes or enqueues (`kind "walkin"`) the `walk_in_entry` frame.
  - `walkin::quote(store, pricing: Option<&StoredPricing>, row: &WalkInRow, now) -> FeeQuote` — `amount_vnd` is `None` when there is no tariff or no hourly rate.
  - `walkin::settle(rt_gate, store, publisher, ctx, hooks, session_id: Uuid, s: Settlement) -> Result<(), String>` — errors: `"no fee pending"`, `"reason required"` (waived with blank reason), `"amount unknown"` (cash/bank_qr with `amount_vnd == None`), `"already settled"` (`close_walk_in` returned `false`), the FSM's refusal. On success: clears `pending_fee`, records a local `allow` event, emits a UI event with `decision: "allow"`, `reason: "walk_in_paid" | "walk_in_waived"`, `amountVnd`, `method`, and publishes or enqueues the `walk_in_exit` frame. The FSM is asked to open **before** the session is closed; if it refuses, nothing is changed.
  - Pipeline: when `direction == "exit"` and the outcome is `deny / plate_not_registered`, look for an open session (local, else `SyncClient::lookup_open_walk_in(plate)` with a 3 s timeout when MQTT is connected, inserting a found row locally); if found, set the gate's `pending_fee` to the quote and emit the UI event with `reason: "walk_in_fee_due"`. Any other reading on that gate clears `pending_fee`.
  - `GateStatus` gains `pending_fee: Option<FeeQuote>`, `last_amount_vnd: Option<i64>`, `last_method: Option<String>`.
  - Tauri commands: `admit_walk_in(gate_id: Uuid, plate: String)`, `settle_walk_in(gate_id: Uuid, session_id: Uuid, method: String, waive_reason: Option<String>)` (always `confirmed_by = "manual"`), `walk_in_today() -> WalkInSummary` (since local midnight), `site_payment_info() -> Option<{ bankAccount, timezone }>`.
  - `WalkInSummary { cash_count, cash_total_vnd, bank_qr_count, bank_qr_total_vnd, waived_count }` (camelCase).

- [ ] **Step 1: Write the failing tests.**
  - `store.rs`: `close_walk_in_is_once_only` (second call returns `false`, first settlement kept); `walk_in_summary_groups_by_method`.
  - `walkin.rs`: `admit_creates_session_opens_gate_and_reports_entry`; `admit_on_locked_gate_creates_nothing`; `admit_twice_keeps_first_entry_time`; `admit_rejects_exit_gate_and_blank_plate`; `quote_without_tariff_has_no_amount`; `quote_uses_synced_tariff` (10 000 VND/h, 2 h 30 → 30 000); `settle_cash_closes_opens_and_reports_exit` (frame has `amountVnd`, `method: "cash"`, `confirmedBy: "manual"`, both timestamps); `settle_twice_second_is_already_settled_and_opens_once` (SpyHal open count 1, one exit frame); `settle_waived_requires_reason`; `settle_on_fault_gate_keeps_session_open`; `settle_offline_enqueues_exit_frame`.
  - `pipeline.rs`: `exit_of_admitted_plate_reports_fee_due` (UI event reason `walk_in_fee_due`, `pending_fee` set, gate not opened); `exit_of_unknown_plate_stays_denied`; `next_reading_clears_pending_fee`; `registered_plate_at_exit_is_unaffected`.
- [ ] **Step 2: Run** `cargo test walk_in` — expected: FAIL (does not compile).
- [ ] **Step 3: Implement** store, `walkin.rs`, the pipeline branch, status fields and commands.
- [ ] **Step 4: Run** `cargo test` — expected: all pass, including the existing pipeline, runtime and command tests.
- [ ] **Step 5: Commit** — `git commit -m "feat(edge): walk-in sessions — admit at entry, quote and settle at exit"`

### Task 9: Automatic confirmation signal

**Files:**
- Modify: `edge-client/src-tauri/src/runtime.rs` (inbound dispatch), `walkin.rs`

**Interfaces:**
- Consumes: `walkin::settle`, `GateRuntime.pending_fee`.
- Produces: `walkin::on_bank_paid(rt: &SharedRuntime, session_id: Uuid, amount_vnd: i64, bank_ref: String)` — finds the gate whose `pending_fee.session_id` matches; if `amount_vnd >= quote.amount_vnd`, settles with `{ method: "bank_qr", confirmed_by: "auto", bank_ref }`; if lower, sets `pending_fee.bank_received_vnd = amount_vnd` and does not open; no matching gate or no quoted amount → logged and ignored. The dispatch routes `type == "walk_in_paid"` here before `CommandPayload` parsing.

- [ ] **Step 1: Write the failing tests:** `bank_paid_full_amount_settles_and_opens` (exit frame has `confirmedBy: "auto"` and the `bankRef`); `bank_paid_short_amount_marks_received_and_keeps_closed`; `bank_paid_after_manual_settle_is_ignored` (open count stays 1, one exit frame); `bank_paid_for_unknown_session_is_ignored`; `bank_paid_signal_is_not_routed_to_command_executor` (no command ack published).
- [ ] **Step 2: Run** `cargo test bank_paid` — expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `cargo test` — expected: all pass.
- [ ] **Step 5: Commit** — `git commit -m "feat(edge): settle walk-in automatically on bank-transfer signal"`

---

## Phase C — UI

### Task 10: Bindings and labels

**Files:**
- Modify: `edge-client/src/lib/tauri.ts`, `edge-client/src/lib/labels.ts`, `edge-client/src/lib/__tests__/labels.test.ts`

**Interfaces:**
- Produces: TypeScript types `FeeQuote`, `WalkInSummary`, `BankAccount` mirroring Task 8; `GateStatus.pendingFee`, `lastAmountVnd`, `lastMethod`; `AccessEvent.amountVnd?`, `method?`; `admitWalkIn(gateId, plate)`, `settleWalkIn(gateId, sessionId, method: "cash" | "bank_qr" | "waived", waiveReason?: string)`, `walkInToday()`, `sitePaymentInfo()`. In `labels.ts`: `formatVnd(n: number): string` (`25000` → `"25.000 đ"`), `formatDuration(minutes: number): string` (`150` → `"2 giờ 30 phút"`, `45` → `"45 phút"`, `120` → `"2 giờ"`); `reasonText` adds `walk_in_fee_due` → "Xe vãng lai — chờ thu phí", `walk_in_paid` → "Xe vãng lai — đã thu phí", `walk_in_waived` → "Xe vãng lai — miễn phí"; `recentTag` takes the whole event and returns a third tone `"fee"`: `walk_in_fee_due` → "CHỜ THU PHÍ", `walk_in_paid` → "THU " + `formatVnd(amountVnd)`, `walk_in_waived` → "MIỄN PHÍ".

- [ ] **Step 1: Write the failing label tests** with the exact values above.
- [ ] **Step 2: Run** `npm test -- labels` — expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -- labels` and `npm run lint` — expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(edge): walk-in bindings and labels"`

### Task 11: Lane card — admit, fee panel, paid state

**Files:**
- Create: `edge-client/src/components/monitor/FeePanel.tsx`, `WaiveDialog.tsx`, `PaidBanner.tsx`, `EntryPhotoOverlay.tsx`
- Modify: `edge-client/src/components/monitor/LaneCard.tsx`, `RecentStrip.tsx` (amber tone `#F5C53D`)
- Test: `edge-client/src/components/monitor/__tests__/FeePanel.test.tsx`, additions to `LaneCard.test.tsx`

**Interfaces:**
- Consumes: Task 10 bindings; `CaptureThumb` from the redesign plan; `VietQr` from Task 12 (render it behind a prop so this task can be tested with a stub).
- Produces: `FeePanel({ quote: FeeQuote, bank: BankAccount | null, gateName: string, onSettle(method: "cash" | "bank_qr"): void, onWaive(reason: string): void, busy: boolean })`.

`LaneCard` changes:
- Entry lane, last reading `deny / plate_not_registered`: the primary button reads **"Cho xe vãng lai vào"** → `onAction(() => admitWalkIn(gateId, lastPlate), "Đã cho xe vãng lai vào")`; disabled when the plate is empty, with the hint "Nhập biển số tay trước khi cho xe vào."
- Entry lane, last reading `deny / plate_not_registered`: the primary button reads **"Cho xe vãng lai vào"** → `onAction(() => admitWalkIn(gateId, lastPlate), "Đã cho xe vãng lai vào")`; disabled when the plate is empty, with the hint "Nhập biển số tay trước khi cho xe vào." After a successful admission, call `printEntryTicket` from Task 12 with the new session id, plate, entry time, and gate name.
- `gate.pendingFee` set: the slot between the reading row and the action row renders `FeePanel` instead of `DecisionBanner`, the reading line reads "`<HH:mm:ss>` · Xe vãng lai (chưa đăng ký)", and the normal action row is replaced by the panel's own buttons plus a small text button "Mở thủ công" underneath. The camera area may shrink to its 160 px minimum; if the card is still too tall the card body scrolls.
- Last reason `walk_in_paid` / `walk_in_waived`: `PaidBanner` — blue, check icon, "ĐÃ THU PHÍ · MỜI QUA" + "`<formatVnd(lastAmountVnd)>` · Tiền mặt | Chuyển khoản" (waived: "MIỄN PHÍ · MỜI QUA"), and the action row is "In biên lai" (flex 2), "Đóng" (flex 1, closes the barrier), manual-plate icon. "In biên lai" calls `printExitReceipt` from Task 12.
- Exit lane with a pending fee or just after a settlement: `EntryPhotoOverlay` bottom-right of the camera area (176 px wide): the entry capture (or "Không có ảnh lúc vào") and the caption "Lúc vào · `<HH:mm>` · `<tên cổng vào>`" (gate name omitted when the entry gate is not on this device).

`FeePanel` layout (mockup values): amber block `role="alert"` — coin icon + "THU PHÍ XE VÃNG LAI" (20px/800) and the amount (mono 34px/700; "Chưa có bảng giá" when `amountVnd == null`); a line "Vào **HH:mm** · Ra **HH:mm** · Gửi **`formatDuration`**" (entry shown as `dd/MM HH:mm` when it is not today). `role="radiogroup"` "Hình thức thanh toán": "Tiền mặt" (default) and "Chuyển khoản QR" (disabled with the hint "Chưa cấu hình tài khoản nhận tiền" when `bank == null`); selected option has a `2px solid #F5B700` border. With QR selected: the QR (88 px in the mockup; render at 160 px so it scans) and "Đưa mã cho tài xế quét. Tự xác nhận khi nhận đủ tiền."; when `bankReceivedVnd` is set and short: "Đã nhận `<formatVnd>` — còn thiếu `<formatVnd>`." Buttons: primary (flex 3) "Đã thu `<formatVnd>` · Mở barrier" → `onSettle(selected)`; outline (flex 1) "Miễn phí" → `WaiveDialog`. With no amount, the primary button and the radio group are disabled.

`WaiveDialog`: `role="dialog"`, title "Miễn phí — `<gateName>`", textarea "Lý do miễn phí" (required, trimmed, max 200), buttons "Hủy" and "Xác nhận miễn phí" (disabled while the reason is blank).

- [ ] **Step 1: Write the failing tests:**
  - FeePanel: `shows amount, times and duration`; `cash is selected by default and settles as cash`; `choosing QR shows the code and settles as bank_qr`; `QR is disabled without a bank account`; `no tariff disables paying but allows waiving`; `short transfer shows the missing amount` (`amountVnd 25000, bankReceivedVnd 20000` → "còn thiếu 5.000 đ"); `waive requires a non-blank reason and passes it trimmed`; `busy disables every button`.
  - LaneCard: `unregistered plate at entry offers Cho xe vãng lai vào and calls admitWalkIn`; `successful admission prints the entry ticket`; `unregistered plate at exit without a session still shows TỪ CHỐI and Mở thủ công`; `blacklisted plate at entry does not offer admission`; `pending fee replaces the decision banner and keeps Mở thủ công`; `settled lane shows ĐÃ THU PHÍ · MỜI QUA with amount and method`; `In biên lai prints the exit receipt`; `settle failure is reported through onAction and the panel stays`.
- [ ] **Step 2: Run** `npm test -- FeePanel LaneCard` — expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and `npm run lint` — expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(edge): walk-in admission and fee panel on the lane card"`

### Task 12: VietQR code and receipt printing

**Files:**
- Modify: `edge-client/package.json` (add `qrcode` and `@types/qrcode`)
- Create: `edge-client/src/lib/vietqr.ts`, `edge-client/src/components/monitor/VietQr.tsx`, `edge-client/src/components/monitor/EntryTicket.tsx`, `edge-client/src/components/monitor/ExitReceipt.tsx`, `edge-client/src/lib/printDocs.ts`
- Modify: `edge-client/src/index.css` (print rules)
- Test: `edge-client/src/lib/__tests__/vietqr.test.ts`, `edge-client/src/components/monitor/__tests__/EntryTicket.test.tsx`, `edge-client/src/components/monitor/__tests__/ExitReceipt.test.tsx`

**Interfaces:**
- Produces:
  - `buildVietQrPayload(a: { bin: string; accountNumber: string; amountVnd: number; memo: string }): string` — the NAPAS VietQR (EMVCo merchant-presented) string with a dynamic amount and the memo as additional data, ending in the CRC-16/CCITT-FALSE checksum.
  - `crc16ccitt(input: string): string` — 4 upper-case hex digits.
  - `VietQr({ payload: string, size: number })` — renders the code to a canvas with `qrcode`; alt text "Mã QR chuyển khoản".
  - `EntryTicket({ site: string, plate, enteredAt, gateName, ticketCode })` and `printEntryTicket(props): void` — renders the entry ticket into the print-only container and calls `window.print()`.
  - `ExitReceipt({ site: string, plate, enteredAt, exitedAt, durationMinutes, amountVnd, method, receiptCode, waiveReason?: string })` and `printExitReceipt(props): void` — renders the exit receipt into the print-only container and calls `window.print()`.

Entry-ticket content (80 mm wide, mono): "PHIẾU VÀO", site, "Biển số", "Giờ vào" as `HH:mm:ss dd/MM/yyyy`, "Cổng vào", a QR code of `ticketCode` (the session's pay code), and the code as text.

Exit-receipt content (80 mm wide, mono): "BIÊN LAI GỬI XE", site, "Biển số", "Giờ vào" and "Giờ ra" as `HH:mm:ss dd/MM/yyyy`, "Thời gian gửi", "Số tiền", "Hình thức" (Tiền mặt / Chuyển khoản / Miễn phí), the waive reason when present, a QR code of `receiptCode` (the session's pay code), and the code as text. `index.css`: `@media print` hides everything except `#print-root` and sets `@page { size: 80mm auto; margin: 4mm }`.

- [ ] **Step 1: Look up the VietQR field layout** in the NAPAS VietQR specification (do not write the tag structure from memory) and record the source in a comment at the top of `vietqr.ts`.
- [ ] **Step 2: Write the failing tests:** `crc16ccitt("123456789") === "29B1"` (the standard check value); `payload ends with a CRC that matches its own body`; `payload contains the bin, account number, amount and memo`; `amount is written without separators`; EntryTicket: `shows full entry date-time and gate`; ExitReceipt: `shows full entry and exit date-time` (`"08:12:00 16/11/2026"`), `shows Miễn phí and its reason for a waived visit`; `printEntryTicket and printExitReceipt each call window.print once`.
- [ ] **Step 3: Run** `npm test -- vietqr EntryTicket ExitReceipt` — expected: FAIL.
- [ ] **Step 4: Implement,** and wire `VietQr` into `FeePanel` (memo = `quote.payCode`), `printEntryTicket` into successful admission, and `printExitReceipt` into "In biên lai".
- [ ] **Step 5: Run** `npm test`, `npm run lint`, `npm run build` — expected: PASS.
- [ ] **Step 6: Verify with real hardware and record the result:** scan a generated code with a banking app and confirm the account, amount and memo are pre-filled; print one entry ticket and one exit receipt on the gatehouse printer. If either cannot be checked, say so in the commit message and the PR.
- [ ] **Step 7: Commit** — `git commit -m "feat(edge): VietQR payment code, entry ticket and exit receipt printing"`

### Task 13: Totals on the edge; bank account and report in the dashboard

**Files:**
- Modify: `edge-client/src/components/settings/DeviceCard.tsx` (+ its test in `SettingsScreen.test.tsx`)
- Modify: `frontend/src/components/tenant/EditLocationSheet.tsx`, `frontend/src/types/tenant.ts`
- Create: `frontend/src/pages/tenant/TenantWalkInsPage.tsx` and its test under `frontend/src/pages/tenant/__tests__/`; add the API calls beside the existing tenant API module in `frontend/src/services/api/`; add the page to the tenant navigation the same way `TenantEventsPage` is added

**Interfaces:**
- Consumes: `walkInToday()` (edge); `GET /tenant/walk-ins`, `GET /tenant/walk-ins/summary`, `bankAccount` on the site API (dashboard).
- Produces:
  - Edge `DeviceCard` section "Thu phí hôm nay (thiết bị này)": "Tiền mặt: `<n>` xe · `<tổng>`", "Chuyển khoản: `<n>` xe · `<tổng>`", "Miễn phí: `<n>` xe"; refreshed when the screen opens.
  - Dashboard `EditLocationSheet`: a "Tài khoản nhận chuyển khoản" group — "Mã ngân hàng (BIN)", "Số tài khoản", "Tên tài khoản" — all three empty = no account; partially filled is a validation error.
  - Dashboard page "Xe vãng lai": site and date-range filters (default: today), summary tiles (Tiền mặt, Chuyển khoản, Miễn phí, Đang trong bãi, Lệch giá), and a table (biển số, giờ vào, giờ ra, số tiền, hình thức, lý do miễn phí, cảnh báo lệch giá).

- [ ] **Step 1: Read how `TenantEventsPage` fetches, paginates and is routed,** and follow the same pattern.
- [ ] **Step 2: Write the failing tests:** edge — `device card shows today's cash and transfer totals`; dashboard — `summary tiles show counts and totals from the API`, `changing the date range refetches`, `waived rows show their reason`, `mismatched rows are flagged`, `bank account with only a BIN filled is rejected`.
- [ ] **Step 3: Run** the two test suites — expected: the new tests FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run** `npm run lint`, `npm test`, `npm run build` in both `edge-client/` and `frontend/` — expected: PASS apart from the known `theme.test.ts` baseline in `frontend/`.
- [ ] **Step 6: Commit** — `git commit -m "feat: walk-in totals on the edge, bank account and report in the dashboard"`

### Task 14: Documentation and end-to-end check

**Files:**
- Modify: `docs/edge-client.md`, the backend API/MQTT docs listed in `docs/README.md`, `CLAUDE.md` (access-decision and payments notes)

- [ ] **Step 1: Document** the two telemetry frame types, the two command-topic signals, the two edge endpoints, the webhook, the report endpoints, and the offline behaviour from the spec. In `CLAUDE.md`, add that walk-in settlement is decided on the edge and that the backend's `amount_vnd` is what the edge charged.
- [ ] **Step 2: End-to-end check on the Compose stack** (`cd backend && docker compose up -d --build`, edge via `npm run tauri dev`): admit a walk-in at entry; exit and pay cash; exit and waive; change the tariff in the dashboard and confirm the next quote uses it without restarting the edge; post a signed webhook with the pay code and confirm the barrier opens; post a short amount and confirm it does not; check the dashboard totals. Record which of these were run and which were not.
- [ ] **Step 3: Run** `graphify update .` from the repo root.
- [ ] **Step 4: Commit** — `git commit -m "docs: walk-in fee collection"`

---

## Follow-ups (not in this plan)

- Provider-specific bank-notification adapter (spec, Open Point 1).
- Uploading capture photos so the entry photo is available across devices and in the dashboard.
