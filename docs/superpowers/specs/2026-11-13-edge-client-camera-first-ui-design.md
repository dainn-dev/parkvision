# Edge Client Camera-First UI Redesign

**Date:** 2026-11-13
**Status:** Design approved in chat; implementation not started

## Goal

Redesign the Edge Client operator UI for gatehouse use so camera footage is the primary workspace, controls are compact and understandable, settings are consolidated into one modal, and the layout remains usable at common station resolutions.

## Target displays

- Guaranteed layout: **1366×768**
- Preferred expansion: **1920×1080**
- Compact fallback: **1280×720**
- Assume 16:9 desktop or industrial touchscreen displays; avoid requiring scrolling on the main operator screen at target sizes.

## User and operating context

The primary user is a gatehouse operator, not a developer. They need to see camera feeds, the latest plate decision, barrier state, and urgent connectivity faults at a glance. Manual barrier actions remain high-risk operations and must remain obvious, accessible, and confirmable even when represented with icons.

## Design principles

1. **Camera-first:** camera footage occupies roughly 70–75% of the available vertical workspace.
2. **Progressive disclosure:** technical barrier/camera settings live in one settings modal rather than permanent panels.
3. **Icon plus accessible meaning:** icons may replace repeated labels only when paired with tooltip/title and `aria-label`; high-risk actions keep visible text or an unambiguous label.
4. **No contract changes:** preserve the existing Tauri commands, FSM behavior, telemetry, camera events, barrier HAL behavior, and update flow.
5. **Safe controls:** locked/fault states continue disabling unsafe actions; moving/open barriers must not be interrupted by settings or update actions.
6. **Responsive density:** the same structure adapts between 1280, 1366, and 1920 widths without changing operator semantics.

## Main layout

```text
┌─────────────────────────────────────────────────────────────┐
│ ● Online  Gatehouse             [Sync] [Update] [Lock] [⚙] │  48px
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                 CAMERA WORKSPACE                            │
│  ┌─────────────────────────────┬─────────────────────────┐  │
│  │        Camera Entry         │       Camera Exit       │  │
│  │        plate/decision       │       plate/decision    │  │
│  └─────────────────────────────┴─────────────────────────┘  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Entry: CLOSED  30A-123.45 ALLOW   Exit: CLOSED             │  64px
├─────────────────────────────────────────────────────────────┤
│ [Open] [Close] [Lock]     Recent events [≡]                │  56px
└─────────────────────────────────────────────────────────────┘
```

### Top bar

Create a compact `OperatorTopBar` with app/gatehouse identity; online/offline MQTT status as a colored dot plus text; compact whitelist/outbox/sync indicators, collapsing to icon + tooltip at narrow width; manual resync, update, lock, and settings icon buttons. Every icon button has a visible tooltip/title and accessible label. Do not put the event feed or technical settings permanently in this bar.

### Camera workspace

Create `CameraWorkspace` and `CameraTile` components. One camera uses the full workspace width; two cameras use equal columns; three or four use a responsive 2×2 grid; more than four use one primary camera canvas plus a thumbnail strip. Preserve base64 JPEG preview and worker/stream state handling. Overlay camera purpose, stream state, camera host, latest plate decision, and relay warning without permanently shrinking the image. Use `object-fit: cover` and minimum usable tile height at 1280×720.

### Gate status dock

Create `GateStatusDock` below the camera workspace. For every configured gate show direction, FSM state, latest plate and allow/deny decision, deny reason, relay warning, and compact angle/temperature/UPS/loop telemetry. It may become horizontally scrollable for more than two gates but must not introduce page-level scrolling at target resolutions.

### Quick actions and events

Create `QuickActions` with large touch targets for open, close, manual plate entry, and lock/unlock. Keep visible text for open/close and lock/unlock or expose an always-visible label next to the icon. Preserve current locked/fault disabled behavior and toast errors. Move `EventFeed` into an `EventDrawer` or compact recent-event strip: show a small summary by default, open full feed from an icon button with tooltip/label, and return all camera space when closed.

## Consolidated settings

Replace the current barrier-specific full overlay entry point with one `SettingsModal`/drawer containing Device, Barrier, and Camera sections. Preserve existing barrier draft validation, probe/read-input/test-output commands, and save behavior. Closing without saving discards drafts; only one settings surface is open at a time.

## Component boundaries and data flow

```text
OperatorScreen
├── OperatorTopBar
├── CameraWorkspace
│   ├── CameraTile
│   └── CameraThumbnailStrip
├── GateStatusDock
├── QuickActions
├── EventDrawer
└── SettingsModal
    ├── DeviceSettings
    ├── BarrierSettings
    └── CameraSettings
```

`OperatorScreen` remains owner of status, config, camera previews, events, lock state, toast state, and selected gate/settings state. Existing subscriptions remain mounted once and cleaned up. Settings edits remain draft-local until Save. No backend API, SQLite schema, MQTT wire contract, or Rust command signature changes are part of this design.

## Accessibility and safety

Icon-only controls require `aria-label`, tooltip/title, and visible focus state. Touch targets should be at least 44×44 CSS px for barrier actions. Color is never the only indicator for allow/deny, online/offline, or fault. Modal focus management and Escape/backdrop close behavior remain correct. Update installation remains guarded by existing update hold/FSM rules.

## Testing and verification

Component tests cover top-bar states and labels, one/two/four camera layouts, keyed camera updates, gate status/decision/fault states, quick action disabled behavior, event drawer open/close, settings draft/save/discard behavior, and camera-first density. Run `cd edge-client && npm run lint`, `cd edge-client/src-tauri && cargo test`, and visual checks at 1366×768 and 1920×1080.

## Out of scope

No backend/MQTT/protocol changes, barrier hardware behavior changes, camera inference additions, activation protocol changes, CSS framework replacement, or new UI dependency.
