# Edge Client Camera-First UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Edge Client operator screen around camera footage while consolidating settings and preserving barrier/FSM/telemetry/camera/update behavior.

**Architecture:** Extract the current `GatePanel` presentation into camera tiles, a gate status dock, and quick actions while keeping `OperatorScreen` as state/subscription owner. Wrap existing barrier settings behavior in one settings modal/drawer and move the event feed into a drawer so camera workspace uses available space.

**Tech Stack:** React, TypeScript, Vite, Tailwind CSS, existing Tauri bridge, Vitest/React Testing Library, Rust/Tauri unchanged.

**Spec:** `docs/superpowers/specs/2026-11-13-edge-client-camera-first-ui-design.md`

## Global Constraints

- Guaranteed target: **1366×768**; expansion: **1920×1080**; fallback: **1280×720**.
- Camera footage occupies roughly 70–75% of available vertical workspace.
- Preserve Tauri commands, FSM behavior, telemetry, camera events, barrier HAL behavior, and update flow.
- Icon-only controls require `aria-label`, tooltip/title, and visible focus state; barrier touch targets are at least 44×44 CSS px.
- Locked/fault states keep disabling unsafe actions; update installation remains guarded by existing update hold/FSM rules.
- No backend API, SQLite schema, MQTT wire contract, Rust command signature, new UI dependency, or CSS framework replacement.

## Review Focus

- One, two, and four cameras remain usable and preserve latest preview/error state; tests in Task 1.
- More than two gates do not cause page-level scrolling at 1366×768; tests in Task 3 and visual QA in Task 5.
- Locked/fault barriers keep open/close disabled; tests in Task 2.
- Settings save/cancel preserves draft isolation and existing probe/test behavior; tests in Task 4.
- Offline MQTT/camera worker errors remain visible without hiding camera workspace; tests in Tasks 1–3.

---

### Task 1: Extract camera workspace primitives

**Files:**
- Create: `edge-client/src/components/operator/CameraTile.tsx`
- Create: `edge-client/src/components/operator/CameraWorkspace.tsx`
- Create: `edge-client/src/components/operator/operatorView.ts`
- Test: `edge-client/src/components/operator/__tests__/CameraWorkspace.test.tsx`
- Modify: `edge-client/src/components/GatePanel.tsx` only for shared types if needed

**Interfaces:**
- Consumes existing `CameraBinding`, `GateStatus`, and `CamLiveInfo` types.
- Produces `CameraTile({ camera, live, className? })` and `CameraWorkspace({ cameras, camLive, selectedCameraId, onSelectCamera })`.

- [ ] Write tests for one/two/four-camera layouts, live JPEG source, no-signal/error fallback, and thumbnail selection.
- [ ] Run `cd edge-client && npm test -- CameraWorkspace`; verify RED.
- [ ] Implement components preserving existing base64 preview, purpose/state labels, host extraction, and immutable camera updates.
- [ ] Run focused tests and `npm run lint`; verify PASS.
- [ ] Commit: `refactor(edge): extract camera-first workspace components`.

### Task 2: Extract gate status and safe actions

**Files:**
- Create: `edge-client/src/components/operator/GateStatusDock.tsx`
- Create: `edge-client/src/components/operator/QuickActions.tsx`
- Test: `edge-client/src/components/operator/__tests__/GateStatusDock.test.tsx`
- Test: `edge-client/src/components/operator/__tests__/QuickActions.test.tsx`

**Interfaces:**
- Consumes `GateStatus`, existing action callback, and current manual Tauri command handlers.
- Produces `GateStatusDock({ gates })` and `QuickActions({ gate, onAction })`.

- [ ] Test entry/exit, FSM, plate decision/reason, relay warning, telemetry, lock/fault disabled state, accessible labels, and 44px targets.
- [ ] Run focused tests; verify RED.
- [ ] Implement compact status dock and touch-friendly actions, preserving current disabled/error behavior.
- [ ] Run focused tests and lint; verify PASS.
- [ ] Commit: `feat(edge): add compact gate status and quick actions`.

### Task 3: Recompose the operator screen

**Files:**
- Modify: `edge-client/src/screens/OperatorScreen.tsx`
- Modify: `edge-client/src/components/GatePanel.tsx`
- Create: `edge-client/src/components/operator/OperatorTopBar.tsx`
- Create: `edge-client/src/components/operator/EventDrawer.tsx`
- Test: `edge-client/src/screens/__tests__/OperatorScreen.test.tsx`

**Interfaces:**
- Consumes the existing `onStatus`, `onEvent`, `onCamera`, polling, resync, update, lock, and toast behavior.
- Produces camera-first top bar/workspace/status/actions/event drawer without native contract changes.

- [ ] Test top-bar states/labels, camera-first default, event drawer open/close, two-gate layout, and empty-gate state.
- [ ] Run screen tests; verify RED.
- [ ] Implement 48px top bar, flexible camera area, status dock, compact actions, and event drawer; avoid page scroll at 1366×768.
- [ ] Adapt 1280×720 to primary camera/thumbnails and 1920×1080 to spacious two-gate layout.
- [ ] Run tests, lint, build; verify PASS.
- [ ] Commit: `feat(edge): make operator screen camera-first`.

### Task 4: Consolidate settings into one modal

**Files:**
- Create: `edge-client/src/components/operator/SettingsModal.tsx`
- Create: `edge-client/src/components/operator/DeviceSettings.tsx`
- Create: `edge-client/src/components/operator/CameraSettings.tsx`
- Modify: `edge-client/src/screens/BarrierSettingsScreen.tsx`
- Modify: `edge-client/src/screens/OperatorScreen.tsx`
- Test: `edge-client/src/components/operator/__tests__/SettingsModal.test.tsx`

**Interfaces:**
- Consumes existing `EdgeConfig`, `GateBinding`, `saveConfig`, barrier probe/read/test, profile and serial-port commands.
- Produces `SettingsModal({ open, cfg, selectedGate, onSaved, onClose, onResync, onUpdate, onLock })` with Device/Barrier/Camera sections.

- [ ] Test one modal surface, barrier save, unsaved draft discard, device actions, Escape/close focus behavior.
- [ ] Run settings tests; verify RED.
- [ ] Extract presentation while preserving defaults, validation, polling cleanup, probe/test actions, save, and secret masking.
- [ ] Run tests, lint, build; verify PASS.
- [ ] Commit: `feat(edge): consolidate operator settings modal`.

### Task 5: Full verification and visual QA

**Files:**
- Modify: only focused edge-client tests if verification exposes regressions

- [ ] Run `cd edge-client && npm run lint`, `npm run build`, and `npm test`.
- [ ] Run `cd edge-client/src-tauri && cargo test`.
- [ ] Capture visual QA at 1280×720, 1366×768, and 1920×1080; verify camera dominance, two-gate readability, settings modal, event drawer, focus and tooltips.
- [ ] Confirm no blocking network/serial/relay I/O entered the FSM tick and no native/API/MQTT contracts changed.
- [ ] Commit verification fixes only if needed: `test(edge): verify camera-first operator layout`.
