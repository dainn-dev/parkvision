# Edge Gate Desktop Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the edge-client UI to match the "Edge Gate — ứng dụng desktop" mockup: a two-step activation screen, a per-lane monitoring screen, and a full-page settings screen.

**Architecture:** The React frontend is restructured into three screens (`ActivationScreen`, `MonitorScreen`, `SettingsScreen`) plus the restyled `LockScreen`, fed by one shared data hook (`useEdgeData`) so navigating between monitoring and settings never drops live state. All existing Tauri commands, the FSM, HAL, MQTT and sync behavior stay as they are; the only Rust change exposes the capture image that the pipeline already saves, so a lane can show the photo taken at recognition.

**Tech Stack:** React 19, TypeScript 5.8, Tailwind CSS 4 (`@theme` tokens), Vite 6, Vitest 5 + Testing Library, Tauri 2 (Rust), lucide-react.

**Spec:** the mockup `D:\Downloads\Edge Gate — ứng dụng desktop.html` (three boards: "1 · Kích hoạt (lần mở đầu)", "2 · Giám sát ra vào", "3 · Thiết lập"). It is a packed page; every value an implementer needs (colors, sizes, copy) is transcribed in **Design Reference** below, so the mockup does not need to be unpacked again.

## Global Constraints

- All work is inside `edge-client/`. Run commands from `edge-client/` (frontend) or `edge-client/src-tauri/` (Rust), never from the repo root.
- Verification: `npm run lint` (this is `tsc --noEmit`), `npm test` (vitest), `npm run build`, and `cargo test` in `src-tauri/`.
- No new Tauri command, event, or config field other than the ones named in Task 2. No backend (`backend/`) change.
- Barrier wiring (`gates[].barrier`) stays local to the device. Settings writes it only through the existing `saveConfig`, always spreading the existing config (`{ ...cfg, gates }`), never rebuilding it.
- A manual open/close button reports only that the command was sent. Barrier state text always comes from `GateStatus.gateState`, never from the button press.
- The kiosk can be offline: fonts are bundled through npm packages, never loaded from a CDN.
- Guaranteed layout is 1366×768 with two lanes and no page scroll on the monitoring screen (carried over from `docs/superpowers/specs/2026-11-13-edge-client-camera-first-ui-design.md`).
- Touch targets are at least 44×44 px. Every icon-only button has an `aria-label`.
- UI copy is Vietnamese, exactly as written in this plan. The in-app wordmark is "Edge Gate"; the window title, `productName`, and bundle identifier in `tauri.conf.json` are not changed (installer and updater identity depend on them).
- Allow is blue and deny is orange everywhere (no green/red pair), as in the mockup.

## Decisions where the mockup and the product disagree

These are settled for this plan; each one is a place the mockup shows something the product cannot or should not do.

1. **No "Địa chỉ server" field on activation.** The server address is built into the binary on purpose (commit `e349939`). The address is shown read-only under Settings → Thiết bị.
2. **Station name is not available.** The server bundle carries no site or gate names. Gate names are derived locally ("Cổng vào 1", "Cổng ra 1", numbered per direction). Where the mockup shows "[Tên trạm]" the app shows "Edge Gate". Real names need a backend bundle change and are out of scope.
3. **Activation step 2 has no "Quay lại".** The one-time code is already consumed when step 2 appears, so going back would mislead. The secondary button is "Thiết lập relay" (opens Settings).
4. **Relay setup keeps every backend.** The mockup shows only a serial-port picker; the app supports five relay backends. Each gate card shows a relay summary with "Kiểm tra / Mở thử / Đóng thử", an inline port picker when the backend is serial, and "Cấu hình relay…" which opens the existing full form.
5. **"Barrier [profile từ server]" becomes the local brand preset.** Barrier config is never provisioned from the server.
6. **Lock-screen password moves** from the activation form to Settings → Thiết bị. Barrier lock/unlock moves to the Settings gate card; a locked lane on the monitoring screen offers "Mở khóa barrier" in place of the open button.
7. **"Ảnh lúc vào" (entry photo on the exit lane) is out of scope.** The local event table stores no image key. Listed under Follow-ups.
8. **Arm angle, motor temperature and UPS readouts are dropped** from the operator view, as in the mockup. Relay link loss and fault states stay visible.
9. **Walk-in fee collection is not in this plan.** The updated monitoring board (`D:\Downloads\Edge Gate — ứng dụng desktop – 2 · Giám sát ra vào.html`, 2026-11-16 10:59) adds a "THU PHÍ XE VÃNG LAI" panel on the exit lane (fee, cash / QR, "Đã thu · Mở barrier", "Miễn phí", "In biên lai") and the recent-strip tags "CHỜ THU PHÍ" / "THU 15.000 đ". Nothing behind it exists yet: the edge denies unregistered plates, has no tariff, and the backend has no walk-in session, cash record, bank-QR adapter or receipt printing. It needs its own spec and plan (see Follow-ups). `LaneCard` keeps the area between the reading row and the action row as one slot (`DecisionBanner` today) so a fee panel can replace it later without restructuring the card.
10. **Update notice in the header is in scope** (added by the same updated board) — see Task 6.

## Design Reference

Dark surfaces (activation backdrop, monitoring, lock screen, settings header):

| Token | Value | Use |
|---|---|---|
| `--color-ink-950` | `#0E1014` | page background |
| `--color-ink-900` | `#171A20` | lane card, chips, pill background |
| `--color-ink-850` | `#23272F` | header divider, image placeholder |
| `--color-ink-800` | `#262A33` | card and control borders |
| `--color-ink-700` | `#3A3F4A` | outline-button border, exit badge |
| `--color-ink-video` | `#050608` | camera area |
| `--color-fg` | `#E8EAEE` | text, primary button fill |
| `--color-fg-muted` | `#9BA1AD` | secondary text |
| `--color-fg-dim` | `#6F7682` | placeholder text |
| `--color-accent` | `#5B8CFF` | logo stroke, connected dot |
| `--color-allow` | `#2156D9` | allow banner, entry badge |
| `--color-allow-fg` | `#8FB0FF` | allow tag text, links |
| `--color-deny` | `#C2410C` | deny banner |
| `--color-deny-fg` | `#FF9A6B` | deny tag text |
| `--color-alert` | `#FF6B3D` | LIVE dot, offline dot |
| `--color-offline-bg` / `--color-offline-fg` | `#3A1C0B` / `#FFD9C2` | offline banner |
| `--color-plate` | `#F2F2EE` | plate chip background |

Light surfaces (activation card, settings body):

| Token | Value | Use |
|---|---|---|
| `--color-paper` | `#F4F5F7` | settings background, summary block |
| `--color-card` | `#FFFFFF` | cards |
| `--color-line` | `#E2E4E9` | card border |
| `--color-line-soft` | `#EEF0F3` | dividers, exit badge background |
| `--color-field` | `#CDD0D8` | input and outline-button border |
| `--color-text` | `#17181C` | text |
| `--color-text-muted` | `#5B5F69` | secondary text |
| `--color-brand` | `#2156D9` | primary button, links (hover `#163E9E`) |
| `--color-brand-soft` / `--color-brand-ink` | `#EAF0FD` / `#1A47B8` | entry badge, positive status text |
| `--color-warn-ink` | `#A33A09` | "Chưa kiểm tra kết nối" |
| `--color-notice-bg` / `--color-notice-fg` | `#FDF0E8` / `#7A2B07` | revoked banner |

Type: `Inter` (400/500/600/700/800) for UI, `JetBrains Mono` (500/600/700) for plates, clock, codes, ids. Base 14px/20px. Radii: cards 14px (dark) / 12px (light) / 16px (activation), controls 10px (dark) / 8px (light), badges 6px (dark) / 4px (light).

Key sizes: header min-height 56px; lane action buttons min-height 52px; plate chip 32px/42px mono 700 with `2px solid #0E1014` border and `1px solid #5B5F69` outline; decision banner label 22px/28px 800; capture thumbnail 168×96px; activation card max-width 520px (step 2: 560px), padding 32px; activation code input min-height 52px, mono 18px, letter-spacing 0.08em; settings content max-width 1120px.

Logo (24px in headers, 32px on activation), stroke = accent:
`<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="10" width="18" height="4" rx="1"/><path d="M5 14v6M19 14v6M3 6h6"/></svg>`

## Review Focus

1. **One gate, or three or more gates.** A site with a single gate must fill the width; a third gate must wrap to a new row and let the page scroll rather than squeeze the lanes. Test in Task 6.
2. **A gate with no camera, or a camera whose stream is down.** The lane must show a readable state ("Chưa gán camera", the worker's error detail) and never a broken image. Test in Task 5.
3. **Locked or faulted barrier.** Open and close must be disabled, the state must be named, and a locked lane must offer unlock. Test in Task 5.
4. **Capture photo missing or key malformed.** A deleted capture file must fall back to the placeholder; a key such as `..\edge-config.json` must be refused by the Rust command. Tests in Tasks 2 and 5.
5. **Device revoked while the operator is in Settings.** The app must return to activation and show the revoked notice, not stay on a settings page for a wiped config. Test in Task 8.

---

### Task 1: Design tokens, bundled fonts, labels

**Files:**
- Modify: `edge-client/package.json` (add `@fontsource-variable/inter@^5.3.0`, `@fontsource-variable/jetbrains-mono@^5.3.0`)
- Modify: `edge-client/src/index.css`
- Create: `edge-client/src/components/ui/Logo.tsx`, `edge-client/src/components/ui/DirectionBadge.tsx`
- Create: `edge-client/src/lib/labels.ts`
- Test: `edge-client/src/lib/__tests__/labels.test.ts`

**Interfaces:**
- Produces:
  - Tailwind color utilities for every token in Design Reference (`bg-ink-950`, `text-fg-muted`, `bg-allow`, `border-line`, …) and `font-sans` = Inter, `font-mono` = JetBrains Mono.
  - `Logo({ size?: number, className?: string })` — default size 24, `stroke="currentColor"`, `aria-hidden`.
  - `DirectionBadge({ direction: string, tone: "dark" | "light" })` — renders "VÀO", "RA" or "CỔNG".
  - `gateLabels(gates: { gateId: string; direction: string }[]): Record<string, GateLabel>` where `GateLabel = { name: string; short: string; badge: "VÀO" | "RA" | "CỔNG" }`.
  - `barrierStateText(state: GateState): string`
  - `plateText(plate: string | null | undefined): string`
  - `reasonText(reason: string | null | undefined): string`
  - `recentTag(e: { decision: string; reason: string }): { text: string; tone: "allow" | "deny" }`

- [ ] **Step 1: Write the failing tests** in `labels.test.ts`

```ts
test("numbers gates per direction", () => {
  const l = gateLabels([
    { gateId: "a", direction: "entry" }, { gateId: "b", direction: "exit" },
    { gateId: "c", direction: "entry" }, { gateId: "d", direction: "both" },
  ]);
  expect(l.a).toEqual({ name: "Cổng vào 1", short: "Vào 1", badge: "VÀO" });
  expect(l.b).toEqual({ name: "Cổng ra 1", short: "Ra 1", badge: "RA" });
  expect(l.c.name).toBe("Cổng vào 2");
  expect(l.d).toEqual({ name: "Cổng 1", short: "Cổng 1", badge: "CỔNG" });
});
test("barrier state text", () => {
  expect(barrierStateText("closed")).toBe("đã đóng");
  expect(barrierStateText("opening")).toBe("đang mở");
  expect(barrierStateText("open")).toBe("đã mở");
  expect(barrierStateText("closing")).toBe("đang đóng");
  expect(barrierStateText("locked")).toBe("đã khóa");
  expect(barrierStateText("fault")).toBe("lỗi");
});
test("reason text covers every local decision reason", () => {
  expect(reasonText("vehicle_registered")).toBe("Xe đã đăng ký");
  expect(reasonText("plate_not_registered")).toBe("Xe chưa đăng ký");
  expect(reasonText("vehicle_blacklisted")).toBe("Xe trong danh sách đen");
  expect(reasonText("vehicle_suspended")).toBe("Xe đang bị tạm ngưng");
  expect(reasonText("vehicle_not_yet_valid")).toBe("Chưa đến ngày hiệu lực");
  expect(reasonText("vehicle_expired")).toBe("Xe hết hạn đăng ký");
  expect(reasonText("anti_passback")).toBe("Xe vừa qua cổng cùng chiều");
  expect(reasonText("no_plate_detected")).toBe("Không đọc được biển số");
  expect(reasonText("rule:Khách VIP")).toBe("Theo quy tắc: Khách VIP");
  expect(reasonText("something_new")).toBe("something_new");
  expect(reasonText(null)).toBe("");
});
test("recent tag and plate text", () => {
  expect(recentTag({ decision: "allow", reason: "vehicle_registered" })).toEqual({ text: "QUA", tone: "allow" });
  expect(recentTag({ decision: "deny", reason: "vehicle_expired" })).toEqual({ text: "HẾT HẠN", tone: "deny" });
  expect(recentTag({ decision: "deny", reason: "plate_not_registered" })).toEqual({ text: "TỪ CHỐI", tone: "deny" });
  expect(plateText("")).toBe("Không đọc được");
  expect(plateText(null)).toBe("Không đọc được");
  expect(plateText("51A12345")).toBe("51A12345");
});
```

- [ ] **Step 2: Run** `npm test -- labels` — expected: FAIL, module `../labels` not found.
- [ ] **Step 3: Install fonts and write `index.css`.** Run `npm install @fontsource-variable/inter @fontsource-variable/jetbrains-mono`. `index.css` imports `tailwindcss`, both font packages, then one `@theme` block declaring every token from Design Reference under the names in its first column, plus `--font-sans: "Inter Variable", system-ui, sans-serif` and `--font-mono: "JetBrains Mono Variable", ui-monospace, monospace`. Add `body { margin: 0; font-size: 14px; line-height: 20px; }`.
- [ ] **Step 4: Implement `labels.ts`, `Logo.tsx`, `DirectionBadge.tsx`.** `DirectionBadge` dark tone: entry `bg-allow text-white`, other `bg-ink-700 text-white`, 12px/800, padding 2px 8px, radius 6px. Light tone: entry `bg-brand-soft text-brand-ink`, other `bg-line-soft` with text `#3A3D45`, 11px/700, padding 1px 6px, radius 4px.
- [ ] **Step 5: Run** `npm test -- labels` and `npm run lint` — expected: PASS, no type errors.
- [ ] **Step 6: Commit** — `git add edge-client/package.json edge-client/package-lock.json edge-client/src/index.css edge-client/src/components/ui edge-client/src/lib/labels.ts edge-client/src/lib/__tests__/labels.test.ts && git commit -m "feat(edge): add Edge Gate design tokens, fonts and label helpers"`

---

### Task 2: Expose the recognition capture to the UI (Rust + bindings)

**Files:**
- Modify: `edge-client/src-tauri/src/pipeline.rs` (the block around `hooks.notify`, currently lines 93–103)
- Modify: `edge-client/src-tauri/src/lib.rs` (`GateStatus`, `gate_status`, new command, `invoke_handler`)
- Modify: `edge-client/src/lib/tauri.ts`

**Interfaces:**
- Produces (Rust):
  - UI event JSON gains `"plateImageKey": Option<String>` (the same key already sent in telemetry).
  - `GateStatus` gains `last_at: Option<String>` and `last_plate_image_key: Option<String>`, read from the stored last event's `at` and `plateImageKey`.
  - `fn capture_path(captures_dir: &Path, key: &str) -> Option<PathBuf>` in `lib.rs` — `None` unless the key is non-empty, ends in `.jpg`, and contains none of `/`, `\`, `..`.
  - `#[tauri::command] fn capture_image(key: String, app: AppHandle) -> Result<tauri::ipc::Response, String>` — reads `<app_data_dir>/captures/<key>` and returns the raw bytes; `Err("invalid capture key")` or `Err("capture not found")`.
- Produces (TypeScript, `tauri.ts`):
  - `AccessEvent.plateImageKey?: string | null`
  - `GateStatus.lastAt: string | null`, `GateStatus.lastPlateImageKey: string | null`
  - `captureImage(key: string): Promise<ArrayBuffer>` — `invoke<ArrayBuffer>("capture_image", { key })`

- [ ] **Step 1: Write the failing Rust tests.** In `pipeline.rs` tests: `ui_event_carries_plate_image_key` — build the existing test rig with a `PipelineHooks { events: Some(tx), last_event: None }`, feed one reading whose `plate_image_path` points at a real temp `plate-ev1.jpg`, and assert the received event's `["plateImageKey"] == "plate-ev1.jpg"`; a second reading with `plate_image_path: None` yields `["plateImageKey"].is_null()`. In `lib.rs` tests: `capture_path_rejects_traversal` — `capture_path(dir, "plate-a.jpg") == Some(dir.join("plate-a.jpg"))`, and `None` for `""`, `"../edge-config.json"`, `"..\\edge-config.json"`, `"sub/plate.jpg"`, `"plate.png"`.
- [ ] **Step 2: Run** `cargo test ui_event_carries_plate_image_key` in `src-tauri/` — expected: FAIL (does not compile: `capture_path` undefined).
- [ ] **Step 3: Implement.** In `pipeline.rs` move the two `stash_image` calls above `hooks.notify` and add `"plateImageKey": plate_key` to the event JSON. In `lib.rs` add the two `GateStatus` fields, `capture_path`, `capture_image`, and register `capture_image` in `generate_handler!`.
- [ ] **Step 4: Run** `cargo test` in `src-tauri/` — expected: all tests pass, including the existing `pipeline` and `activation` tests.
- [ ] **Step 5: Update `tauri.ts`** with the three bindings above, then run `npm run lint` — expected: no errors.
- [ ] **Step 6: Commit** — `git commit -m "feat(edge): expose recognition capture image to the operator UI"`

---

### Task 3: Shared live-data hook

**Files:**
- Create: `edge-client/src/lib/useEdgeData.ts`
- Test: `edge-client/src/lib/__tests__/useEdgeData.test.tsx`

**Interfaces:**
- Consumes: `getStatus`, `getConfig`, `lockStatus`, `onStatus`, `onEvent`, `onCamera`, `resync` from `tauri.ts`.
- Produces:

```ts
export interface CamLiveInfo { jpeg?: string; state?: string; detail?: string }
export interface EdgeData {
  status: EdgeStatus | null;
  cfg: EdgeConfig | null;
  events: AccessEvent[];                    // newest first, capped at 100
  cameras: Record<string, CamLiveInfo>;     // keyed by cameraId
  lock: LockStatus | null;
  setCfg(cfg: EdgeConfig): void;
  setLock(lock: LockStatus): void;
  refreshFromServer(): Promise<string>;     // resync(), then re-read config
}
export function useEdgeData(): EdgeData
```

This is the state logic now inside `OperatorScreen.tsx` lines 25–72 (initial fetch, three listeners, 2 s status poll, cleanup), moved unchanged in behavior.

- [ ] **Step 1: Write the failing test.** Mock `../tauri` with `vi.mock`; capture the callbacks passed to `onStatus`, `onEvent`, `onCamera`. With `renderHook(useEdgeData)`: (a) after the initial promises resolve, `status` and `cfg` equal the mocked values; (b) pushing 101 events leaves `events.length === 100` with the newest at index 0; (c) a `camera.preview` event sets `cameras[id]` to `{ jpeg, state: "live" }`, and a following `camera.status` event keeps `jpeg` while replacing `state` and `detail`; (d) `refreshFromServer()` calls `resync` then `getConfig` and updates `cfg`; (e) unmount calls all three unlisten functions.
- [ ] **Step 2: Run** `npm test -- useEdgeData` — expected: FAIL, module not found.
- [ ] **Step 3: Implement `useEdgeData`.**
- [ ] **Step 4: Run** `npm test -- useEdgeData` — expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(edge): extract shared live-data hook"`

---

### Task 4: Activation screen and lock screen

**Files:**
- Create: `edge-client/src/screens/ActivationScreen.tsx`
- Modify: `edge-client/src/screens/LockScreen.tsx` (restyle only; logic unchanged)
- Delete: `edge-client/src/screens/SetupScreen.tsx`
- Test: `edge-client/src/screens/__tests__/ActivationScreen.test.tsx`

**Interfaces:**
- Consumes: `activate`, `detectPublicIp`, `getConfig`, `onCamera` from `tauri.ts`; `Logo`, `DirectionBadge`, `gateLabels`.
- Produces: `ActivationScreen({ revoked: boolean, onDone: (next: "monitor" | "settings") => void })`.

Layout (both steps): full-height `bg-ink-950`, centered column, gap 24px: logo 32px + "Edge Gate" (18px/700, white); optional notice; white card; footnote "Màn hình này chỉ hiện ở lần mở đầu tiên, hoặc khi thiết bị bị thu hồi." (12px, `#A9ADB6`, centered, max-width 520px).

Step 1 card (max-width 520px): eyebrow "BƯỚC 1/2"; `h1` "Kích hoạt thiết bị"; paragraph "Nhập mã kích hoạt từ trang quản trị. Số cổng và camera của trạm sẽ được tải về từ server."; field "Mã kích hoạt" (placeholder `XXXX-XXXX-XXXX`, `maxLength` 20, required); under it the existing "IP server nhìn thấy thiết bị" line with copy and "Thử lại" (behavior of `SetupScreen.tsx` lines 21–35 and 83–115 kept); error box; submit button "Kích hoạt" ("Đang kích hoạt…" while busy, disabled). Code normalization and the error-message mapping are carried over verbatim from `SetupScreen.tsx` lines 8–10 and 53–63. No lock-password field and no server field.

Revoked notice (`role="alert"`, shown only when `revoked` and on step 1; `bg-notice-bg text-notice-fg`, radius 12px): title "Thiết bị đã bị thu hồi", body "Server đã thu hồi quyền của thiết bị. Cấu hình đã xóa, dữ liệu và ảnh cục bộ vẫn được giữ. Nhập mã mới để kích hoạt lại."

Step 2 card (max-width 560px), shown after `activate` resolves and `getConfig()` returns: eyebrow "BƯỚC 2/2"; `h1` "Đã nhận cấu hình từ server"; paragraph "Kiểm tra lại trước khi bắt đầu giám sát. Muốn thay đổi cổng hoặc camera, hãy sửa trên trang quản trị."; summary block (`bg-paper`) with stats "Cổng" = gate count, "Camera" = total cameras, "Relay đã nối" = `<gates with barrier != null>/<gate count>`; one list row per gate: name from `gateLabels` + light `DirectionBadge`, sub-line "`<n>` camera · Relay chưa thiết lập (mô phỏng)" or "… · Relay đã thiết lập", and on the right "Camera đã kết nối" (`text-brand-ink`) once any of the gate's cameras has reported `live`, `connected` or `ready` over `onCamera`, otherwise "Đang chờ camera…" (`text-text-muted`), or "Chưa gán camera" when the gate has none. Buttons: outline "Thiết lập relay" (flex 1) → `onDone("settings")`; primary "Bắt đầu giám sát" (flex 2) → `onDone("monitor")`.

`LockScreen`: same backdrop and logo header as activation; white card max-width 360px; `h1` "Màn hình đang khóa"; text "Nhập mật khẩu để tiếp tục."; password input; error text in `text-warn-ink`; primary button "Mở khóa".

- [ ] **Step 1: Write the failing tests** (mock `../../lib/tauri`):
  - `shows the revoked notice only when revoked` — `revoked` → `getByRole("alert")` contains "Thiết bị đã bị thu hồi"; not revoked → `queryByRole("alert")` is null.
  - `has no server or lock-password field` — `queryByLabelText(/server/i)` and `queryByLabelText(/mật khẩu/i)` are null.
  - `normalizes the code and shows step 2 from the fetched config` — type ` ab12 cd34 `, submit; `activate` called with `"AB12CD34"`; with a mocked config of one entry gate (1 camera, `barrier: null`) and one exit gate (0 cameras), the screen shows "Đã nhận cấu hình từ server", "Cổng vào 1", "Cổng ra 1", "0/2", "Chưa gán camera".
  - `maps a rejected activation to friendly copy` — `activate` rejects with `"invalid activation code"` → "Mã kích hoạt không đúng."; the form stays on step 1.
  - `step 2 buttons report the chosen destination` — "Bắt đầu giám sát" → `onDone("monitor")`; "Thiết lập relay" → `onDone("settings")`.
- [ ] **Step 2: Run** `npm test -- ActivationScreen` — expected: FAIL, module not found.
- [ ] **Step 3: Implement `ActivationScreen`, restyle `LockScreen`, delete `SetupScreen.tsx`.** `App.tsx` still imports `SetupScreen` until Task 8; to keep the build green in between, point that import at `ActivationScreen` with `revoked={false}` and `onDone={() => setScreen("operator")}`.
- [ ] **Step 4: Run** `npm test -- ActivationScreen` and `npm run lint` — expected: PASS, no errors.
- [ ] **Step 5: Commit** — `git commit -m "feat(edge): two-step activation screen and restyled lock screen"`

---

### Task 5: Lane card

**Files:**
- Create: `edge-client/src/components/monitor/LaneCard.tsx`, `CameraView.tsx`, `DecisionBanner.tsx`, `CaptureThumb.tsx`, `ManualPlateDialog.tsx` (all under `edge-client/src/components/monitor/`)
- Test: `edge-client/src/components/monitor/__tests__/LaneCard.test.tsx`

**Interfaces:**
- Consumes: `GateStatus`, `CameraBinding`, `manualOpen`, `manualClose`, `manualUnlock`, `manualPlate`, `captureImage` from `tauri.ts`; `CamLiveInfo` from `useEdgeData`; `GateLabel`, `barrierStateText`, `plateText`, `reasonText`; `DirectionBadge`.
- Produces:

```ts
LaneCard(props: {
  gate: GateStatus;
  label: GateLabel;
  cameras: CameraBinding[];
  camLive: Record<string, CamLiveInfo>;
  onAction: (fn: () => Promise<unknown>, okMessage: string) => void;
})
```

Structure, top to bottom (`section` with `aria-labelledby`, `bg-ink-900 border-ink-800`, radius 14px, padding 12px, gap 12px, `flex flex-col min-h-0`):

1. **Header row:** dark `DirectionBadge` + `label.name` (16px/700); right side "Barrier: **`barrierStateText(gate.gateState)`**"; when `gate.barrierLinkOk === false` also a chip "Mất kết nối relay" (`text-deny-fg`).
2. **`CameraView`** (`flex-1 min-h-0`, min-height 160px, radius 10px, `bg-ink-video`): shows the first camera with `purpose === "plate"`, else the first camera. Live frame as `<img>` with `object-contain` and alt "`<label.name>` — camera trực tiếp". Top-left chip "LIVE" with the `alert` dot only while that camera's `state === "live"`. Without a frame, centered text: "Chưa gán camera" (no cameras), the worker's `detail` when `state` is `error` or `worker_error`, otherwise "Đang chờ tín hiệu camera…". If the gate has more than one camera, a bottom-left row of chips (`CAM BIỂN SỐ`, `CAM TOÀN CẢNH`, or the upper-cased purpose) switches the shown camera. The video area flexes rather than holding a fixed 16:9 box, so two lanes fit 1366×768.
3. **Reading row:** `CaptureThumb` (168×96px, radius 8px, `bg-ink-850`) loads `captureImage(gate.lastPlateImageKey)` into an object URL (revoked on change/unmount); with no key or a rejected load it shows the text "Chưa có ảnh". Beside it the plate chip with `plateText(gate.lastPlate)` and a line "`<HH:mm:ss of gate.lastAt, vi-VN>` · `<reasonText(gate.lastReason)>`". When the gate has no reading yet (`lastDecision == null`) the row shows only "Chờ biển số…" in `text-fg-dim`.
4. **`DecisionBanner`** (radius 10px, padding 14px 16px, white text): allow → `role="status"`, `bg-allow`, check icon, "MỜI QUA"; deny → `role="alert"`, `bg-deny`, X icon, "TỪ CHỐI" followed by `reasonText(reason)` (15px/500, truncated with `title`). Not rendered before the first reading.
5. **Action row:** primary (flex 2, `bg-fg text-ink-950`, 15px/700) "Mở thủ công" when `lastDecision === "deny"`, otherwise "Mở barrier" → `onAction(() => manualOpen(gateId), "Đã gửi lệnh mở")`; outline (flex 1) "Đóng" → `onAction(() => manualClose(gateId), "Đã gửi lệnh đóng")`; icon button 52×52 with `aria-label="Nhập biển số tay cho <label.name>"` (lucide `Keyboard`) opening `ManualPlateDialog`. Open and close are `disabled` when `gateState` is `locked` or `fault`. When `locked`, the primary button is replaced by "Mở khóa barrier" → `onAction(() => manualUnlock(gateId), "Đã mở khóa")`. When `fault`, a line under the row: "Barrier đang báo lỗi — kiểm tra thiết bị." (`text-deny-fg`).

`ManualPlateDialog({ gateName, onSubmit(plate), onClose })`: `role="dialog"` `aria-modal`, title "Nhập biển số tay — `<gateName>`", autofocused mono input (placeholder "VD: 30E-892.41"), buttons "Hủy" and "Gửi"; Enter submits, Escape closes; submits `value.trim().toUpperCase()` and ignores an empty value. `LaneCard` calls `onAction(() => manualPlate(p, gateId), "Đã gửi biển " + p)`.

- [ ] **Step 1: Write the failing tests** (mock `../../../lib/tauri`; `captureImage` resolves an empty `ArrayBuffer` unless stated):
  - `allowed reading shows plate, MỜI QUA and Mở barrier` — gate `{ gateState: "open", lastPlate: "51A12345", lastDecision: "allow", lastReason: "vehicle_registered" }` → text "51A12345", `getByRole("status")` has "MỜI QUA", button "Mở barrier", "Barrier: " + "đã mở".
  - `denied reading shows the reason and Mở thủ công` — `lastDecision: "deny", lastReason: "plate_not_registered"` → `getByRole("alert")` has "TỪ CHỐI" and "Xe chưa đăng ký"; button "Mở thủ công".
  - `locked gate disables close and offers unlock` — `gateState: "locked"` → "Đóng" disabled, no "Mở barrier", clicking "Mở khóa barrier" calls `manualUnlock("g1")`.
  - `fault gate disables open and close` — both disabled; text "Barrier đang báo lỗi — kiểm tra thiết bị."
  - `no cameras shows Chưa gán camera and no img` — `cameras: []` → text present, `queryByRole("img")` null.
  - `stream error shows the worker detail` — `camLive: { c1: { state: "worker_error", detail: "camera offline" } }` → "camera offline".
  - `missing capture falls back to placeholder` — `captureImage` rejects → "Chưa có ảnh"; and with `lastPlateImageKey: null`, `captureImage` is not called.
  - `empty plate reads Không đọc được` — `lastPlate: ""`, `lastReason: "no_plate_detected"`.
  - `manual plate is trimmed, upper-cased and sent for this gate` — open dialog, type ` 30e-892.41 `, Enter → `manualPlate("30E-892.41", "g1")`.
  - `open button only reports that the command was sent` — click "Mở barrier" → `onAction` called with ok message "Đã gửi lệnh mở"; the state text still reads the `gateState` passed in props.
- [ ] **Step 2: Run** `npm test -- LaneCard` — expected: FAIL, module not found.
- [ ] **Step 3: Implement the five components.**
- [ ] **Step 4: Run** `npm test -- LaneCard` and `npm run lint` — expected: PASS, no errors.
- [ ] **Step 5: Commit** — `git commit -m "feat(edge): per-lane monitoring card"`

---

### Task 6: Monitoring screen

**Files:**
- Create: `edge-client/src/screens/MonitorScreen.tsx`
- Create: `edge-client/src/components/monitor/MonitorHeader.tsx`, `RecentStrip.tsx`, `EventsDrawer.tsx`
- Delete: `edge-client/src/components/EventFeed.tsx` (its list moves into `EventsDrawer`)
- Test: `edge-client/src/screens/__tests__/MonitorScreen.test.tsx`

**Interfaces:**
- Consumes: `EdgeData` (Task 3), `LaneCard` (Task 5), `gateLabels`, `recentTag`, `plateText`, `reasonText`, `Logo`.
- Produces: `MonitorScreen({ data: EdgeData, onOpenSettings: () => void, notify: (msg: string) => void })`.

Layout: root `h-screen flex flex-col bg-ink-950 text-fg`.

- **`MonitorHeader`** (min-height 56px, padding 8px 20px, bottom border `ink-850`): left — `Logo` (accent) + "Edge Gate" (700); center — clock `HH:mm:ss` (mono 18px/600, ticking every second) followed by the date as "Thứ Hai, 16/11/2026" (`toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })`, 13px, `text-fg-muted`); right — an update chip, then the status pill (dot `accent` + "Đã kết nối" when `status.mqttConnected`, dot `alert` + "Mất kết nối" otherwise; "Đang kết nối…" while `status` is null). The update chip is a button "Có bản cập nhật `<availableVersion>`" with a download icon (pill, background `#1B2A4D`, text `#BCD0FF`, 13px/500, visible height 32px inside a 44px hit area) → `onOpenSettings`; `MonitorHeader` calls `checkUpdate()` once on mount and every 6 hours, and renders the chip only when `availableVersion` is non-null (a rejected check renders nothing and is not reported to the operator). The header also has a 44×44 settings button `aria-label="Thiết lập"` (lucide `Settings`) → `onOpenSettings`.
- **Offline banner** (`role="status"`, only when `status` is loaded and `mqttConnected` is false; `bg-offline-bg text-offline-fg`, 13px, warning icon): "Mất kết nối server. Ra vào vẫn hoạt động theo dữ liệu trên máy; sự kiện được lưu và gửi lại khi có mạng." When `status.outboxDepth > 0`, append " Đang chờ gửi: `<n>` sự kiện."
- **Lanes grid** (`flex-1 min-h-0`, padding 16px 20px, gap 16px): one `LaneCard` per `status.gates` entry, cameras looked up in `cfg.gates` by `gateId`. One or two gates: a single row of equal columns filling the height. Three or more: `grid-template-columns: repeat(auto-fit, minmax(480px, 1fr))`, each card min-height 520px, and the main area scrolls vertically. With no gates: centered "Thiết bị chưa được gán cổng nào."
- **`RecentStrip`** (padding 0 20px 16px): heading "LƯỢT GẦN ĐÂY" (13px/600, `text-fg-muted`, letter-spacing 0.04em) and a "Xem tất cả" button (link style, `text-allow-fg`) opening `EventsDrawer`. One row of the newest events, at most 6, each a chip (`bg-ink-900 border-ink-800`, radius 10px, min-width 200px): plate (mono 700; `text-fg-muted` when unreadable), "`HH:mm:ss` · `label.short`", and the `recentTag` text colored `allow-fg` or `deny-fg`. Chips that do not fit are clipped, not wrapped. Empty state: "Chưa có lượt nào kể từ khi mở ứng dụng."
- **`EventsDrawer({ events, labels, onClose })`**: right-side panel 384px, `role="dialog"`, title "Lượt ra vào", close button `aria-label="Đóng"`, scrollable list of all in-memory events with plate, time, lane, tag and `reasonText`; Escape closes.
- `onAction` passed to each `LaneCard` runs the promise and calls `notify(okMessage)` on success or `notify("Lỗi: " + error)` on failure.

- [ ] **Step 1: Write the failing tests** (build `data` by hand; mock `../../lib/tauri`):
  - `renders one lane per gate with derived names` — two gates → headings "Cổng vào 1" and "Cổng ra 1".
  - `single gate renders one lane; three gates render three` — heading counts 1 and 3; with three, the grid element has the scroll class.
  - `offline shows the banner, pill text and pending count` — `mqttConnected: false, outboxDepth: 4` → `getByRole("status")` text includes "Mất kết nối server" and "Đang chờ gửi: 4 sự kiện."; pill "Mất kết nối". Online → no banner, pill "Đã kết nối".
  - `recent strip shows at most six, newest first, with tags` — 8 events → 6 chips; first chip is the newest; an expired deny reads "HẾT HẠN"; an event with `plate: ""` reads "Không đọc được".
  - `Xem tất cả opens the drawer with every event` — 8 events → drawer lists 8.
  - `settings button calls onOpenSettings`.
  - `update chip appears only when a newer version exists` — `checkUpdate` resolves `{ availableVersion: "1.5.0" }` → button "Có bản cập nhật 1.5.0", clicking it calls `onOpenSettings`; resolves `{ availableVersion: null }` or rejects → no such button and `notify` not called.
  - `a failed command surfaces as a notification` — `manualOpen` rejects with "relay offline" → `notify("Lỗi: relay offline")`.
- [ ] **Step 2: Run** `npm test -- MonitorScreen` — expected: FAIL, module not found.
- [ ] **Step 3: Implement the screen and its three components; delete `EventFeed.tsx`.** `OperatorScreen.tsx` still imports `EventFeed` until Task 8 — in the same commit, replace its `EventFeed` usage with `EventsDrawer`'s list so the build stays green.
- [ ] **Step 4: Run** `npm test -- MonitorScreen` and `npm run lint` — expected: PASS, no errors.
- [ ] **Step 5: Commit** — `git commit -m "feat(edge): monitoring screen with lanes, offline banner and recent strip"`

---

### Task 7: Settings screen

**Files:**
- Create: `edge-client/src/screens/SettingsScreen.tsx`
- Create: `edge-client/src/components/settings/GateSettingsCard.tsx`, `DeviceCard.tsx`
- Modify: `edge-client/src/screens/BarrierSettingsScreen.tsx` (light restyle; drop the `embedded` prop; no logic change)
- Modify: `edge-client/src/components/UpdateButton.tsx` (light restyle only)
- Test: `edge-client/src/screens/__tests__/SettingsScreen.test.tsx`

**Interfaces:**
- Consumes: `EdgeData`; `saveConfig`, `barrierProbe`, `barrierTestOutput`, `listSerialPorts`, `getBarrierProfiles`, `manualLock`, `manualUnlock`, `setLockPassword`, `lockNow`, `deviceIp` from `tauri.ts`; `gateLabels`, `barrierStateText`, `DirectionBadge`.
- Produces: `SettingsScreen({ data: EdgeData, onBack: () => void, onLocked: () => void, notify: (msg: string) => void })`.

Layout: root `min-h-screen bg-paper text-text`. Dark header (`bg-ink-950 text-fg`, min-height 56px): button "Quay lại giám sát" (chevron-left, 44px high, `border-ink-800`) → `onBack`, then the title "Thiết lập". Content column max-width 1120px, padding 24px 20px 40px, gap 20px:

1. **Server-managed panel** (white card): cloud-download icon, title "Cấu hình do server quản lý", text "Số cổng và camera được tải từ server. Muốn thay đổi, hãy sửa trên trang quản trị. Cập nhật lần cuối: `<status.lastSyncAt as HH:mm dd/MM, vi-VN>`." ("chưa đồng bộ" when null). Button "Làm mới từ server" → `data.refreshFromServer()`; "Đang làm mới…" and disabled while running; `notify("Đã làm mới từ server")` or `notify("Lỗi: …")`.
2. **`h2` "Cổng"** then a grid `repeat(auto-fit, minmax(420px, 1fr))` of `GateSettingsCard`, one per `cfg.gates` entry.
3. **`h2` "Thiết bị"** then `DeviceCard`.

`GateSettingsCard({ cfg, gate, label, status, camLive, onSaved, notify })`:
- Heading: `label.name` + light `DirectionBadge`.
- Definition grid (2 columns): "Camera" — each camera's purpose label, with "· trực tuyến" (`text-brand-ink`) when its live state is `live`, `connected` or `ready`, "· mất tín hiệu" (`text-warn-ink`) otherwise; "Chưa gán" if none. "Barrier" — brand preset label (same `BRAND_LABEL` map as `BarrierSettingsScreen`) or "Mô phỏng". "Hướng" — `gate.direction` (mono). "Mã cổng" — `gate.gateId` (mono, `select-all`).
- Section "Kết nối relay trên máy này" (top border `line-soft`):
  - `gate.barrier == null`: text "Chưa nối relay — barrier đang chạy mô phỏng." and button "Thiết lập relay".
  - Otherwise a summary line of the backend ("USB relay · COM3", "Hikvision · 192.168.1.64", "Dahua · …", "Modbus TCP · …", "ZKTeco C3 · …"); when the backend is `serial`, a labelled `<select>` ("Cổng serial cho `<label.name>`", visually hidden label) listing `listSerialPorts()` plus the current port, which on change saves `{ ...cfg, gates: gates with this gate's barrier.backend.port replaced }` through `saveConfig` then `onSaved`. Buttons: "Kiểm tra" → `barrierProbe(barrier)`; "Mở thử" → `barrierTestOutput(barrier, outputs.open)`; "Đóng thử" → `barrierTestOutput(barrier, outputs.close)` (disabled when `outputs.close == null`); "Cấu hình relay…" opens `BarrierSettingsScreen` as a modal dialog. One button runs at a time.
  - Status line below: initially "Chưa kiểm tra kết nối" (`text-warn-ink`); after a successful probe "Board đã phản hồi" (`text-brand-ink`); after a failed probe or test "Không kết nối được: `<error>`" (`text-warn-ink`); after a test pulse "Đã phát xung mở" / "Đã phát xung đóng".
  - Helper text under the buttons: "Mở thử và Đóng thử sẽ làm barrier chuyển động thật."
- Section "Khóa barrier": text "Barrier: `<barrierStateText>`" and a button "Khóa barrier" → `manualLock(gateId)` or, when `status.gateState === "locked"`, "Mở khóa barrier" → `manualUnlock(gateId)`.

`DeviceCard({ cfg, status, lock, onLockChanged, onLocked, notify })`: definition grid `repeat(auto-fit, minmax(200px, 1fr))` — "Trạm" `cfg.siteId` (mono), "Server" host of `cfg.apiBaseUrl` (mono), "IP thiết bị" from `deviceIp()` ("—" on failure), "Sự kiện chờ gửi" `status.outboxDepth`, "Xe trong danh sách" `status.whitelistCount`. Below, "Khóa màn hình": password input + "Lưu mật khẩu" (rejects fewer than 4 characters with "Mật khẩu khóa phải có ít nhất 4 ký tự."; calls `setLockPassword(value)` then `onLockChanged`), "Tắt khóa" (`setLockPassword(null)`, shown when `lock.enabled`), "Khóa ngay" (`lockNow()` then `onLocked`, shown when `lock.enabled`). Below, "Phiên bản": the restyled `UpdateButton`.

The app-level corner IP badge in `App.tsx` is removed in Task 8; this card is where the device IP now lives.

- [ ] **Step 1: Write the failing tests** (mock `../../lib/tauri`; mock `../BarrierSettingsScreen` as `() => <div>Barrier form</div>`; mock `../../components/UpdateButton`):
  - `shows server-managed panel and refreshes` — click "Làm mới từ server" → `data.refreshFromServer` called once; `notify("Đã làm mới từ server")`.
  - `gate without a barrier offers setup and has no test buttons` — `barrier: null` → "Chưa nối relay — barrier đang chạy mô phỏng."; `queryByRole("button", { name: "Mở thử" })` null.
  - `probe success and failure update the status line` — resolve → "Board đã phản hồi"; reject "timeout" → "Không kết nối được: timeout".
  - `Đóng thử is disabled when no close output is wired` — `outputs.close: null`.
  - `changing the serial port saves the merged config` — serial backend on gate 1 of 2, select `COM5` → `saveConfig` called with a config whose gate 1 `barrier.backend.port === "COM5"`, whose gate 2 is the identical object as before, and whose `apiKey`, `mqtt` and `deviceId` are unchanged.
  - `locked gate offers unlock` — status `locked` → button "Mở khóa barrier" calls `manualUnlock`.
  - `lock password shorter than four characters is rejected` — "123" → error text shown; `setLockPassword` not called.
  - `device card shows server host and pending events` — `apiBaseUrl: "https://api.example.test/api/v1"`, `outboxDepth: 7` → "api.example.test", "7".
  - `back button calls onBack`.
- [ ] **Step 2: Run** `npm test -- SettingsScreen` — expected: FAIL, module not found.
- [ ] **Step 3: Implement the screen and two cards; restyle `BarrierSettingsScreen` and `UpdateButton`** by swapping zinc/emerald/sky classes for the light tokens (card `bg-card border-line`, inputs `border-field`, primary `bg-brand text-white`, positive text `text-brand-ink`, error text `text-warn-ink`). `BarrierSettingsScreen` always renders as a modal (`role="dialog"`, backdrop `bg-black/50`).
- [ ] **Step 4: Run** `npm test -- SettingsScreen` and `npm run lint` — expected: PASS, no errors. `SettingsModal.tsx` still passes `embedded`; remove that prop usage there in this commit (the file is deleted in Task 8).
- [ ] **Step 5: Commit** — `git commit -m "feat(edge): full-page settings with per-gate relay checks"`

---

### Task 8: App shell, removal of the old UI, docs

**Files:**
- Modify: `edge-client/src/App.tsx`
- Create: `edge-client/src/components/ui/Toast.tsx`
- Delete: `edge-client/src/screens/OperatorScreen.tsx`, `edge-client/src/components/GatePanel.tsx`, `edge-client/src/components/GateStateBadge.tsx`, and the whole `edge-client/src/components/operator/` directory (including its tests)
- Modify: `docs/edge-client.md` (operator UI section), `edge-client/README.md` if it describes the screens
- Test: `edge-client/src/__tests__/App.test.tsx`

**Interfaces:**
- Consumes: `ActivationScreen`, `LockScreen`, `MonitorScreen`, `SettingsScreen`, `useEdgeData`, `getConfig`, `lockStatus`, `onDeprovisioned`.
- Produces: `App` with `type Screen = "loading" | "activation" | "locked" | "monitor" | "settings"` and a `revoked: boolean` state.

Behavior: on mount, no config → `activation`; config and `lock.locked` → `locked`; otherwise `monitor`. `onDeprovisioned` sets `revoked = true` and `screen = "activation"` from any screen. `ActivationScreen.onDone(next)` clears `revoked` and goes to `next`. `monitor` and `settings` are rendered by one inner `Workspace` component that calls `useEdgeData()` once and owns the toast (`notify`, 3 s, `Toast` at bottom-right, `role="status"`), so switching between the two keeps events and camera frames. `LockScreen.onUnlocked` → `monitor`. The loading view is "Đang tải…" on `bg-ink-950`. The fixed corner IP badge is removed.

- [ ] **Step 1: Write the failing tests** (mock `../lib/tauri`; mock the four screens as stubs that expose their props through buttons/text):
  - `no config shows activation without the revoked notice`.
  - `config and unlocked shows monitoring`; `config and locked shows the lock screen`.
  - `deprovision while in settings returns to activation with revoked set` — reach `settings`, fire the captured `onDeprovisioned` callback → activation stub rendered with `revoked` true.
  - `finishing activation with "settings" opens settings; with "monitor" opens monitoring`; in both cases a later render of activation has `revoked` false.
  - `monitoring and settings share one data hook` — `useEdgeData` (mocked) is called from a single mounted `Workspace`; switching monitor → settings → monitor does not remount it (listener-registration mock called once).
- [ ] **Step 2: Run** `npm test -- App` — expected: FAIL (old screens rendered).
- [ ] **Step 3: Rewrite `App.tsx`, add `Toast.tsx`, delete the old files.**
- [ ] **Step 4: Check nothing still references the removed files.** Run `grep -rn "OperatorScreen\|GatePanel\|GateStateBadge\|components/operator\|SetupScreen\|EventFeed" edge-client/src` — expected: no output.
- [ ] **Step 5: Update `docs/edge-client.md`** — replace the operator-UI description with the three screens, the derived gate names, the location of lock-password and update controls, and the note that the capture thumbnail is read through `capture_image`.
- [ ] **Step 6: Full verification.** In `edge-client/`: `npm run lint`, `npm test`, `npm run build` — expected: no type errors, all tests pass, build succeeds. In `edge-client/src-tauri/`: `cargo test` — expected: all pass.
- [ ] **Step 7: Manual check in the real app.** `npm run tauri dev` with a provisioned config: at 1366×768 two lanes fit with no page scroll; manual plate entry updates the lane and the recent strip; settings round-trip keeps the recent strip; "Làm mới từ server" keeps each gate's relay config. Record what was and was not checked on real hardware.
- [ ] **Step 8: Refresh the knowledge graph and commit.** From the repo root: `graphify update .`, then `git commit -m "feat(edge): Edge Gate app shell; remove camera-first operator UI"`

---

## Follow-ups (not in this plan)

- **Station and gate names from the server:** add `siteName` and per-gate `name` to the backend `ActivationBundleOut` / `ActivationGateOut` and to the edge `BundleOut` → `EdgeConfig` (config version bump, since `GateBinding` is `deny_unknown_fields`).
- **"Ảnh lúc vào" on exit lanes:** store the capture key and gate id with each row of the edge `local_events` table and add a lookup by plate. The updated board captions it "Lúc vào · `<HH:mm>` · `<tên cổng vào>`" (overlay 176px wide, bottom-right of the exit camera).
- **Walk-in fee collection at the exit lane** (separate spec + plan; touches backend, edge Rust and UI). Open decisions before it can be specified:
  1. Entry policy — walk-ins are denied at entry today (`plate_not_registered`); are they to be admitted automatically, and under which tenant setting?
  2. Where the fee is computed — the tariff and `estimate_fee` live only in the backend; the edge has no tariff, so either quote online only or sync the tariff to the edge for offline exits.
  3. Entry time — from the backend's entry access event, or from the edge's local event table (only works when the same device runs both gates).
  4. Recording cash — `DriverPayment` requires a driver account and a gateway; a staff-collected payment needs its own record, shift totals and audit trail.
  5. "Chuyển khoản QR" — MoMo is the only gateway and is tied to driver accounts; bank-transfer QR with automatic confirmation needs a new adapter and webhook, and the lane-facing second screen does not exist.
  6. "Miễn phí" — who may waive, whether a reason is required, how it is audited.
  7. "In biên lai" — no printer support exists in the edge HAL.
  8. "Loại xe" — unknown for an unregistered plate, and the tariff has no per-vehicle-type rates.
  9. Layout — the fee panel makes the exit lane about 250px taller (board is now 1440×1120), which breaks the 1366×768 no-scroll rule unless the camera area shrinks while a fee is pending.
- **Recent events across restarts:** the strip is in-memory; persisting gate and reason in `local_events` would let it survive a restart.
