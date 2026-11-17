# Edge Gate UI — Complete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the whole new edge-client operator UI — activation, monitoring, settings — including walk-in fee collection, so the app matches the two mockups end to end.

**Architecture:** This plan does not restate the screens. It is the **execution order and the amendments** over two existing plans: the redesign plan (`R`, `2026-11-16-edge-gate-desktop-redesign.md`, Tasks 1–8) and the walk-in plan (`W`, `2026-11-16-walk-in-fee-collection.md`, Tasks 10–13). Where a task here says "do R-Task N", the implementer reads that task in `R` and applies the amendments listed under it. The walk-in components, bindings, VietQR and print code already exist and are reused, not rewritten.

**Tech Stack:** React 19, TypeScript 5.8, Tailwind CSS 4, Vite 6, Vitest 5 + Testing Library, Tauri 2 (Rust), lucide-react, `qrcode`; FastAPI (one small backend field).

**Spec:** the two mockups — `D:\Downloads\Edge Gate — ứng dụng desktop.html` (boards 1 and 3) and `D:\Downloads\Edge Gate — ứng dụng desktop – 2 · Giám sát ra vào.html` (board 2, with walk-in) — as transcribed in `R` "Design Reference" and `W` Task 11; plus `docs/superpowers/specs/2026-11-16-walk-in-fee-collection-design.md`.

## Current state (verified 2026-11-17)

| Area | State |
|---|---|
| Rust: walk-in (Tasks 6–9 of `W`) | Done, `cargo test` 253 pass. UI event already carries `plateImageKey`. **Missing:** `capture_image` command, `GateStatus.last_at` / `last_plate_image_key` (= `R` Task 2). |
| Backend (`W` Tasks 1–5) | Written and reviewed, **DB tests never run**. |
| Dashboard (`W` Task 13, `frontend/`) | Done. |
| edge-client TS, existing | `src/lib/tauri.ts` (walk-in bindings), `src/lib/labels.ts` (minimal: `formatVnd`, `formatDuration`, `reasonText`, `recentTag`), `vietqr.ts`, `dateFmt.ts`, `printDocs.ts`, `components/monitor/{FeePanel,WaiveDialog,PaidBanner,EntryPhotoOverlay,VietQr,EntryTicket,ExitReceipt}.tsx`, print rules in `index.css`. |
| edge-client TS, **not started** | Everything in `R`: tokens/fonts, `useEdgeData`, `ActivationScreen`, `LaneCard`, `MonitorScreen`, `SettingsScreen`, new `App.tsx`. Old `OperatorScreen`, `SetupScreen`, `GatePanel`, `components/operator/*` are still the live UI. |

## Amendments to the redesign plan

These override `R` wherever they conflict.

1. **`R` decisions 7 and 9 are reversed.** Walk-in collection and the "Ảnh lúc vào" overlay are in scope. The overlay appears only for a walk-in on an exit lane (source: `FeeQuote.entryImageKey`); registered vehicles get no entry photo (the local event table still stores no key).
2. **Station name.** `R` decision 2 says the name is unavailable. Receipts and the header need it, so Task 3 adds `siteName` to the tariff endpoint. Fallback everywhere: "Edge Gate". Gate names stay locally derived.
3. **`labels.ts` and `index.css` are extended, not overwritten.** Keep `formatVnd`, `formatDuration`, the `walk_in_*` reasons, the three-tone `recentTag`, and the whole `@media print` / `#print-root` block.
4. **"Loại xe" from the mockup is omitted** (vehicle type is unknown for an unregistered plate; no per-type tariff). The QR caption stays `W`'s "Đưa mã cho tài xế quét. Tự xác nhận khi nhận đủ tiền." because no second screen exists.
5. **"Cho xe vãng lai vào" is not in the mockup.** It comes from the walk-in spec (entry admission). It appears only on an entry lane after `deny / plate_not_registered`.

## Global Constraints

- Everything in `R` Global Constraints and `W` Global Constraints applies unchanged (commands run from `edge-client/` or `edge-client/src-tauri/`; UI copy Vietnamese exactly as written; amounts integer VND; allow = blue, deny = orange; amber `#F5B700` / text `#1A1400` for fee-pending, tag text `#F5C53D`; touch targets ≥ 44 px; no CDN fonts; 1366×768 two lanes without page scroll; "Mở thủ công" always reachable).
- A button press only means "command sent". Barrier state text comes from `GateStatus.gateState`; "paid" comes from `GateStatus.lastReason`, never from the click.
- No new Tauri command or config field except `capture_image` (Task 2) and `siteName` (Task 3).
- Do not commit a task whose `npm run lint`, `npm test` (and `cargo test` where Rust changed) is red. The only tolerated baseline failure is `frontend/src/lib/__tests__/theme.test.ts` (different package).

## Review Focus

1. **Settling twice or racing the automatic confirmation.** Double click, or a bank transfer settling while the operator clicks "Đã thu". The loser's error must read as a plain Vietnamese message (not `already settled`), the panel must not stay stuck, and the lane must follow `GateStatus`. Tests in Task 6.
2. **Automatic settlement while the panel is open.** `pendingFee` disappears and `lastReason` becomes `walk_in_paid` with method `bank_qr` with no operator click: the lane must switch to `PaidBanner` ("Chuyển khoản"). "In biên lai" needs the quote, which the edge has already cleared. Test in Task 6.
3. **Printing fails or is dismissed.** An error from the print call must not undo an admission or a settlement; the operator sees a message and can retry "In biên lai". Tests in Task 6; silent-print behavior verified in Task 10.
4. **Entry photo missing, entry on another device, entry on another day.** Overlay says "Không có ảnh lúc vào", omits the gate name when the entry gate is not local, and the panel shows `dd/MM HH:mm` for a stay that started on an earlier day. Tests in Task 6.
5. **A pending fee on one lane must not disturb the other lane**, and the exit lane must still fit 1366×768 (camera area shrinks to 160 px, then the card body scrolls). Test in Task 7; fit checked manually in Task 9.

---

### Task 1: Tokens, fonts, labels — do R-Task 1

**Files:** as `R` Task 1 (`package.json`, `index.css`, `components/ui/Logo.tsx`, `DirectionBadge.tsx`, `lib/labels.ts`, `lib/__tests__/labels.test.ts`).

**Interfaces:**
- Produces (in addition to `R` Task 1): in `labels.ts` — `payCode(sessionId: string): string` (`"PV" + first 8 hex of the id, upper-case`), `methodText(m: string | null | undefined): string` (`cash` → "Tiền mặt", `bank_qr` → "Chuyển khoản", `waived` → "Miễn phí", else ""), `walkInErrorText(err: unknown): string`.

- [ ] **Step 1: Add tests** to `labels.test.ts`: all of `R` Task 1's tests plus
  - `payCode("0a1b2c3d-0000-0000-0000-000000000000") === "PV0A1B2C3D"`;
  - `methodText` for the three methods and `null`;
  - `walkInErrorText`: `"already settled"` → "Phiên này đã được thu."; `"no fee pending"` → "Không còn khoản phí chờ thu."; `"amount unknown"` → "Chưa có bảng giá, chưa thể thu tiền."; `"reason required"` → "Cần nhập lý do miễn phí."; `new Error("boom")` → "Lỗi: boom"; an unknown string `"gate locked"` → "Lỗi: gate locked".
  - the existing `recentTag` tests keep passing, and `recentTag({decision:"allow", reason:"walk_in_paid", amountVnd:15000})` is `{text:"THU 15.000 đ", tone:"fee"}`.
- [ ] **Step 2: Run** `npm test -- labels` — expected: FAIL on the new exports.
- [ ] **Step 3: Implement** per `R` Task 1 steps 3–4 with Amendment 3: the `@theme` block goes at the top of `index.css` below the Tailwind and font imports; the print block stays untouched. Merge `labels.ts`: add `gateLabels`, `barrierStateText`, `plateText`, the three new functions; keep what exists.
- [ ] **Step 4: Run** `npm test -- labels`, `npm run lint`, `npm run build` — expected: PASS (build proves the print CSS and the `@theme` coexist).
- [ ] **Step 5: Commit** — `git commit -m "feat(edge): Edge Gate design tokens, fonts and label helpers"`

---

### Task 2: Capture bridge — do R-Task 2 (remainder)

**Files:** `edge-client/src-tauri/src/pipeline.rs`, `lib.rs`, `edge-client/src/lib/tauri.ts`.

**Interfaces:**
- Already present: UI event key `plateImageKey`.
- Produces: exactly `R` Task 2's `capture_path`, `capture_image`, `GateStatus.last_at` / `last_plate_image_key`, and TS `captureImage`, `GateStatus.lastAt`, `GateStatus.lastPlateImageKey`, `AccessEvent.plateImageKey`.

- [ ] **Step 1: Write the failing tests** from `R` Task 2 step 1 (`ui_event_carries_plate_image_key` may already exist from the walk-in work — keep one copy; `capture_path_rejects_traversal` is new). Add `capture_image_reads_only_inside_captures_dir`: a key with a path separator is `Err("invalid capture key")`, a missing file is `Err("capture not found")`.
- [ ] **Step 2: Run** `cargo test capture` — expected: FAIL (does not compile).
- [ ] **Step 3: Implement** per `R` Task 2 step 3, skipping what is already in `pipeline.rs`.
- [ ] **Step 4: Run** `cargo test` — expected: all pass. Then `npm run lint` in `edge-client/`.
- [ ] **Step 5: Commit** — `git commit -m "feat(edge): expose recognition capture image to the operator UI"`

---

### Task 3: Site name for receipts and header

**Files:** `backend/app/schemas/resources.py` (`EdgeSitePricingOut`), `backend/app/api/v1/edge.py`, `backend/tests/test_walk_ins.py`; `edge-client/src-tauri/src/store.rs` (`StoredPricing`), `walkin.rs` (`SitePaymentInfo`); `edge-client/src/lib/tauri.ts`.

**Interfaces:**
- Produces: `EdgeSitePricingOut.site_name: str` (JSON `siteName`); Rust `StoredPricing.site_name: Option<String>` with `#[serde(default)]` (old stored values still load); `SitePaymentInfo { bank_account, timezone, site_name: Option<String> }`; TS `export interface SitePaymentInfo { bankAccount: BankAccount | null; timezone: string; siteName?: string | null }` and `sitePaymentInfo(): Promise<SitePaymentInfo | null>`.

- [ ] **Step 1: Write the failing tests:** backend — extend `test_edge_pricing_returns_tariff_timezone_bank` to assert `siteName == <the site's name>`; Rust — `site_pricing_without_site_name_still_loads` (a stored JSON lacking `siteName` deserializes with `None`); `site_payment_info_carries_site_name`.
- [ ] **Step 2: Run** `cargo test site_` — expected: FAIL (does not compile). Backend test needs the isolated DB; if it cannot run, say so in the commit message.
- [ ] **Step 3: Implement** the three fields; `sync_pricing` compares whole `StoredPricing`, so a rename in the dashboard marks it changed.
- [ ] **Step 4: Run** `cargo test`, `npm run lint`, and (with a test DB) `pytest tests/test_walk_ins.py` — expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: site name in the edge tariff bundle"`

---

### Task 4: Shared live-data hook — do R-Task 3

**Files:** `edge-client/src/lib/useEdgeData.ts`, test under `src/lib/__tests__/`.

**Interfaces:**
- Produces `R` Task 3's `EdgeData`, **plus** `payment: SitePaymentInfo | null`, refreshed from `sitePaymentInfo()` on mount and on every tick of the existing 2 s status poll (a local read; the tariff can change at any time through the `pricing_updated` signal).

- [ ] **Step 1: Write the failing tests:** `R` Task 3 (a)–(e), plus (f) `payment` equals the mocked `sitePaymentInfo()` after mount, and updates after the next poll when the mock returns a different `timezone`; (g) a rejected `sitePaymentInfo()` leaves `payment === null` and does not break the other fields.
- [ ] **Step 2: Run** `npm test -- useEdgeData` — expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -- useEdgeData` — expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(edge): shared live-data hook"`

---

### Task 5: Activation and lock screens — do R-Task 4

No amendments. Follow `R` Task 4 including its interim `App.tsx` import so the build stays green.

- [ ] **Steps 1–5 as in `R` Task 4**; commit `feat(edge): two-step activation screen and restyled lock screen`.

---

### Task 6: Lane card with walk-in — do R-Task 5 + W-Task 11 LaneCard changes

**Files:** `components/monitor/{LaneCard,CameraView,DecisionBanner,CaptureThumb,ManualPlateDialog}.tsx` (new, per `R`), the existing `FeePanel`, `PaidBanner`, `EntryPhotoOverlay`, `WaiveDialog`; test `components/monitor/__tests__/LaneCard.test.tsx`.

**Interfaces:**
- Consumes: Task 1 labels, Task 2 `captureImage`, Task 3 `SitePaymentInfo`, existing `FeePanel({ quote, bank, gateName, onSettle, onWaive, busy })`, `printEntryTicket`, `printExitReceipt`.
- Produces:

```ts
LaneCard(props: {
  gate: GateStatus; label: GateLabel;
  cameras: CameraBinding[]; camLive: Record<string, CamLiveInfo>;
  payment: SitePaymentInfo | null;                      // bank account, timezone, site name
  gateName: (gateId: string | null | undefined) => string | undefined; // local gate id → label.name
  onAction: (fn: () => Promise<unknown>, okMessage: string) => void;
})
```

Behavior = `R` Task 5 structure plus `W` Task 11 (admit button, `FeePanel` in the banner slot, `PaidBanner`, `EntryPhotoOverlay`). Added here:
- **Last quote memory.** The edge clears `pendingFee` on settlement, but the receipt needs it. `LaneCard` keeps the last non-null `pendingFee` in a ref; "In biên lai" uses it and is `disabled` (title "Không có dữ liệu biên lai") when none is remembered (e.g. after an app restart).
- **Error text.** Every walk-in `onAction` failure is passed through `walkInErrorText`; `onAction` is called with a function that rejects with that text.
- **Print failure.** `printEntryTicket` / `printExitReceipt` run inside `try/catch`; on error call `onAction(() => Promise.reject("Không in được — kiểm tra máy in."), "")`. Admission and settlement are never rolled back.
- Print props: `site: payment?.siteName ?? "Edge Gate"`; ticket/receipt codes from `payCode` / `quote.payCode`; gate name from `label.name`; times formatted in `payment.timezone` when present (extend `dateFmt.ts` functions with an optional `timeZone` argument using `Intl.DateTimeFormat`; default stays device-local).

- [ ] **Step 1: Write the failing tests.** All ten tests of `R` Task 5, all eight `LaneCard` tests of `W` Task 11 step 1, and:
  - `second settle reports a plain message and keeps the panel` — `settleWalkIn` rejects `"already settled"` → `onAction`'s function rejects with "Phiên này đã được thu."; `FeePanel` still rendered until `gate.pendingFee` clears.
  - `bank transfer settling without a click switches to the paid banner` — rerender: `pendingFee` set → `pendingFee: null, lastReason: "walk_in_paid", lastMethod: "bank_qr", lastAmountVnd: 25000` → "ĐÃ THU PHÍ · MỜI QUA", "25.000 đ · Chuyển khoản"; "In biên lai" calls `printExitReceipt` with the remembered quote's plate, times and `amountVnd: 25000`.
  - `receipt button is disabled when no quote was seen` — mount directly in the paid state → "In biên lai" disabled.
  - `print failure after admission does not undo it` — `admitWalkIn` resolves, `printEntryTicket` throws → the admission is still reported as successful, and a "Không in được" message is surfaced.
  - `entry photo overlay without a key or on another device` — `quote.entryImageKey: null` → "Không có ảnh lúc vào"; `gateName` returns `undefined` → caption has no gate name; `gateName` returns "Cổng vào 1" → caption "Lúc vào · 08:12 · Cổng vào 1".
  - `earlier-day entry shows the date` — `quote.enteredAt` yesterday → "Vào" value matches `/^\d{2}\/\d{2} \d{2}:\d{2}$/`.
  - `print uses the site name` — `payment.siteName: "Bãi xe A"` → `printEntryTicket` called with `site: "Bãi xe A"`; with `payment: null` → `"Edge Gate"`.
- [ ] **Step 2: Run** `npm test -- LaneCard FeePanel` — expected: FAIL.
- [ ] **Step 3: Implement** the five new components and the `LaneCard` behavior above; add `timeZone` support to `dateFmt.ts` with its own tests in `src/lib/__tests__/dateFmt.test.ts` (`formatHm("2026-11-16T01:12:00Z", "Asia/Ho_Chi_Minh") === "08:12"`).
- [ ] **Step 4: Run** `npm test` and `npm run lint` — expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(edge): per-lane card with walk-in admission, fee panel and receipts"`

---

### Task 7: Monitoring screen — do R-Task 6

**Files:** `screens/MonitorScreen.tsx`, `components/monitor/{MonitorHeader,RecentStrip,EventsDrawer}.tsx`, delete `components/EventFeed.tsx`; test `screens/__tests__/MonitorScreen.test.tsx`.

Amendments:
- Header left text: `data.payment?.siteName ?? "Edge Gate"` (Amendment 2).
- `MonitorScreen` passes each `LaneCard` its `payment`, and `gateName = (id) => id ? labels[id]?.name : undefined` built from `gateLabels` over `cfg.gates`.
- `RecentStrip` and `EventsDrawer` call `recentTag(event)` with the whole event; tone `fee` renders amber `#F5C53D`.
- `EventsDrawer` rows show `reasonText` including the `walk_in_*` reasons.

- [ ] **Step 1: Write the failing tests:** all of `R` Task 6 step 1, plus
  - `fee tags render amber and show the amount` — events `walk_in_fee_due` → "CHỜ THU PHÍ"; `walk_in_paid` with `amountVnd: 15000` → "THU 15.000 đ"; `walk_in_waived` → "MIỄN PHÍ"; the tag element for tone `fee` has the amber color class/style.
  - `header shows the site name or falls back` — `payment.siteName: "Bãi xe A"` → "Bãi xe A"; `payment: null` → "Edge Gate".
  - `a pending fee on the exit lane leaves the entry lane unchanged` — two gates, exit has `pendingFee` → one `FeePanel` (`getAllByRole("radiogroup")` length 1), entry lane still shows its `DecisionBanner`.
- [ ] **Step 2–5:** run → implement → `npm test -- MonitorScreen` and `npm run lint` pass → commit `feat(edge): monitoring screen with lanes, offline banner, recent strip and fee tags`.

---

### Task 8: Settings screen with today's totals — do R-Task 7 + W-Task 13 (edge part)

**Files:** `screens/SettingsScreen.tsx`, `components/settings/{GateSettingsCard,DeviceCard}.tsx`, restyled `BarrierSettingsScreen.tsx` and `UpdateButton.tsx`; test `screens/__tests__/SettingsScreen.test.tsx`.

Amendments: `DeviceCard` gets a section "Thu phí hôm nay (thiết bị này)" with "Tiền mặt: `<n>` xe · `<formatVnd(total)>`", "Chuyển khoản: `<n>` xe · `<total>`", "Miễn phí: `<n>` xe", loaded with `walkInToday()` when the screen opens (a rejected call shows "—" for each value and does not hide the rest of the card).

- [ ] **Step 1: Write the failing tests:** all of `R` Task 7 step 1, plus `device card shows today's cash and transfer totals` (`walkInToday` resolves `{cashCount:2, cashTotalVnd:35000, bankQrCount:1, bankQrTotalVnd:30000, waivedCount:1}` → "Tiền mặt: 2 xe · 35.000 đ", "Chuyển khoản: 1 xe · 30.000 đ", "Miễn phí: 1 xe") and `totals failure leaves the rest of the card intact`.
- [ ] **Step 2–5:** run → implement → `npm test -- SettingsScreen` and `npm run lint` pass → commit `feat(edge): full-page settings with per-gate relay checks and today's walk-in totals`.

---

### Task 9: App shell, removal of the old UI — do R-Task 8

No amendments besides: `grep` in step 4 also checks `components/operator`. Run `R` Task 8 steps 1–6 in full, including docs. The manual check in step 7 additionally covers: at 1366×768 an exit lane with a pending fee fits (camera shrinks, no page scroll with two lanes; card body scrolls only below the 160 px camera minimum); Review Focus 5.

- [ ] **Steps 1–6 as in `R` Task 8**; commit `feat(edge): Edge Gate app shell; remove camera-first operator UI` (leave `graphify update .` to Task 10).

---

### Task 10: Printing, VietQR and end-to-end on real equipment; documentation

**Files:** `edge-client/src-tauri/tauri.conf.json` (only if silent printing needs it), `docs/edge-client.md`, `docs/README.md` if the index changes.

**Interfaces:** none new.

- [ ] **Step 1: Check how `window.print()` behaves in the Tauri 2 WebView2 window** on the gatehouse PC. It normally opens a print dialog the operator must confirm, which is too slow at a barrier. Look up the current Tauri 2 / WebView2 documentation (do not rely on memory) for silent printing — e.g. the WebView2 `--kiosk-printing` browser argument via the window's `additionalBrowserArgs` on Windows (note that setting it replaces Tauri's default arguments, so copy those too). Record the finding and the source in the commit message.
- [ ] **Step 2: Apply the smallest working option** (do not change `productName` or the bundle identifier). If no silent option works, keep the dialog and document it in `docs/edge-client.md` as a known limitation.
- [ ] **Step 3: Equipment checks** — each recorded as done / not done in the commit message and the PR: scan a generated VietQR with at least two banking apps (account, amount and memo pre-filled; the amount equals the fee); print one entry ticket and one exit receipt on the gatehouse printer at 80 mm and check nothing is cut off; run the `W` Task 14 step 2 scenarios on the Compose stack (admit, pay cash, waive, tariff change picked up without restart, signed webhook opens the barrier, short transfer does not). If the NAPAS specification cannot be obtained, state that the payload is based on a secondary source.
- [ ] **Step 4: Documentation** — in `docs/edge-client.md` replace the operator-UI description with the three screens (if Task 9 has not already), and update the walk-in section's "UI not yet wired" caveat now that the lane card is wired.
- [ ] **Step 5: Final verification** — `npm run lint`, `npm test`, `npm run build` in `edge-client/`; `cargo test` in `edge-client/src-tauri/`; `npm run lint`, `npm test`, `npm run build` in `frontend/` (baseline `theme.test.ts`). Backend tests on an isolated Postgres/Redis if available.
- [ ] **Step 6: Refresh the graph and commit** — `graphify update .` from the repo root, then `git commit -m "docs: edge UI complete; print and QR verification notes"`.

---

## Execution waves (for parallel agents)

Tasks that touch disjoint files can run together; `tauri.ts`, `lib.rs` and `labels.ts` are the shared files, so the order below matters.

1. **Wave 1:** Task 1 ∥ (Task 2 → Task 3). Task 2 and Task 3 share `lib.rs`/`tauri.ts`, so one agent does both.
2. **Wave 2:** Task 4 ∥ Task 5.
3. **Wave 3:** Task 6, and Task 8 in parallel with it (Task 8 does not touch the lane card).
4. **Wave 4:** Task 7 (needs Task 6), then Task 9, then Task 10.

## Follow-ups (not in this plan)

- Per-gate names from the server (`R` Follow-ups) and "Ảnh lúc vào" for registered vehicles (needs the capture key in `local_events`).
- A provider-specific bank-notification adapter, and a second customer-facing screen for the QR (the mockup mentions one).
- Persisting the last settled quote on the edge so "In biên lai" survives a restart.
