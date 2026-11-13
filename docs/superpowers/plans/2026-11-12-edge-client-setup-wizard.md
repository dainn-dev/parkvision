# Edge Client Setup Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give non-technical tenant users one guided flow that creates an Edge device, creates or selects a gate, binds them transactionally, and returns a one-time activation code ready for the Edge Client.

**Architecture:** Add one tenant-scoped FastAPI setup endpoint that performs site resolution, device creation, gate creation/binding, and activation-code creation inside one `platform_session` transaction. Add a frontend wizard on the Edge Devices page that asks only human-facing names and gate direction/type, then renders the activation code and next steps. Keep existing low-level device/gate endpoints for advanced/operator workflows.

**Tech Stack:** FastAPI, SQLAlchemy async sessions, Pydantic/CamelModel, React/TypeScript/Vite, React Testing Library, Vitest, existing tenant API/context and UI primitives.

**Spec:** Approved in-chat Layer 2 design (2026-11-12): transactional `POST /api/v1/tenants/{tenant_id}/edge-setup`, 3-step wizard, optional site only for multi-site tenants, no MQTT/IP/technical fields in normal flow, activation code response, rollback on any failure.

## Global Constraints

- `POST /api/v1/tenants/{tenant_id}/edge-setup` is tenant-authorized and must enforce existing tenant RBAC and isolation.
- `deviceName` and `gateName` are required; `siteId` is optional for exactly one site and required for multiple sites.
- A tenant with no site gets one default site named from the tenant and timezone `Asia/Ho_Chi_Minh`; never create a duplicate site.
- The setup operation commits device, gate, binding, and activation code atomically; failures roll back all rows created by the operation.
- Normal setup never asks for MQTT Client ID, MAC, IP address, firmware version, serial number, or hardware model.
- `allowedIp` defaults to null; if supplied, it is the server-observed activation IP/CIDR, not a private adapter address.
- Activation code plaintext is returned once and is not persisted in plaintext.
- Existing low-level device, gate, and activation-code endpoints remain available for advanced workflows.

## Review Focus

- Tenant with zero sites: creates exactly one default site and does not create a second one on retry; test in Task 1.
- Tenant with multiple sites and omitted `siteId`: returns a clear 400 `site_required` and creates no device/gate/code; test in Task 1.
- Foreign `siteId` or gate-related identifiers: rejected by tenant isolation with no partial rows; test in Task 1.
- Duplicate setup submission: device/gate names and activation codes do not partially duplicate; test idempotency/rollback behavior in Task 1 and document UI retry behavior in Task 3.
- Activation code expiry/IP restriction: response carries the existing one-time/expiry contract and does not silently enable IP pinning; contract test in Task 1 and UI copy test in Task 3.

---

### Task 1: Transactional tenant Edge setup API

**Files:**
- Create: `backend/app/schemas/edge_setup.py`
- Modify: `backend/app/api/v1/tenant/gates.py` or create `backend/app/api/v1/tenant/edge_setup.py` and include it from `backend/app/api/v1/__init__.py`
- Modify: `backend/app/services/credential_service.py` only if a reusable activation-code helper must be extracted
- Test: `backend/tests/test_edge_setup.py`

**Interfaces:**
- Consumes existing `TenantCtx`, `platform_session`, `build_default_site`, `generate_activation_code`, `hash_activation_code`, `EdgeDevice`, `BarrierGate`, and `DeviceActivationCode`.
- Produces `POST /api/v1/tenants/{tenant_id}/edge-setup` accepting `EdgeSetupIn` with `site_id: UUID | None`, `device_name: str`, `gate_name: str`, `gate_direction: str`, `gate_type: str`, `allowed_ip: str | None`; returns `EdgeSetupOut` containing `site`, `device`, `gate`, and `activation { code, code_prefix, expires_at }` plus `next_steps: list[str]`.

- [ ] **Step 1: Write failing integration tests**
  - `test_setup_single_site_creates_device_gate_binding_and_code`: with one site, omit `siteId`; assert 201, returned gate has `edgeDeviceId`, activation has plaintext code and expiry, and DB has exactly one device/gate/code.
  - `test_setup_without_sites_creates_default_site`: start with no site; assert one site named after tenant, timezone `Asia/Ho_Chi_Minh`, and the setup rows reference it.
  - `test_setup_multiple_sites_requires_site`: omit `siteId`; assert 400 error code `site_required`; assert no new device/gate/code.
  - `test_setup_rejects_foreign_site`: pass another tenant’s site; assert 404/tenant-safe error and no rows.
  - `test_setup_rolls_back_when_gate_creation_fails`: force an invalid gate input or duplicate constraint; assert device/site created by this request are absent afterward.
  - `test_setup_returns_existing_activation-code contract`: assert code is one-time response data, `expiresAt` is in the response, and `allowedIp` defaults null.

- [ ] **Step 2: Run the focused tests to verify RED**
  - Run from `backend/` with isolated Postgres/Redis: `.venv/Scripts/python.exe -m pytest tests/test_edge_setup.py -q`.
  - Expected: route/schema not found or setup behavior absent.

- [ ] **Step 3: Implement `EdgeSetupIn`, `EdgeSetupOut`, and the route**
  - Resolve sites: explicit ID must belong to the tenant; omitted ID selects the only site; zero sites calls `build_default_site(tenant)` once; multiple sites returns `bad_request(... code=site_required)`.
  - Validate direction/type against existing gate enums/accepted values, names through Pydantic length constraints, and `allowed_ip` as an IP/CIDR if the field is accepted.
  - Within one `platform_session`, add the default site if needed, create the device with a generated `device_key` and no MQTT ID, create the gate with `edge_device_id=device.id`, generate/hash the activation code, add the activation row, write one audit event, flush, and return the response. Let the session context roll back on any exception.
  - Reuse existing `ACTIVATION_CODE_TTL` and activation-code generation/hash functions; never duplicate plaintext storage logic.

- [ ] **Step 4: Run focused tests to verify GREEN**
  - Run `.venv/Scripts/python.exe -m pytest tests/test_edge_setup.py tests/test_edge_devices.py tests/test_edge_activation.py -q`.
  - Expected: all setup/device/activation tests pass.

- [ ] **Step 5: Run backend lint**
  - Run `.venv/Scripts/python.exe -m ruff check app tests` from `backend/`.
  - Expected: no violations.

- [ ] **Step 6: Commit the backend API**
  ```bash
  git add backend/app/schemas/edge_setup.py backend/app/api/v1/tenant backend/app/api/v1/__init__.py backend/tests/test_edge_setup.py
  git commit -m "feat: add transactional edge client setup endpoint"
  ```

### Task 2: Tenant API client and wizard state model

**Files:**
- Modify: `frontend/src/services/api/index.ts`
- Modify: `frontend/src/context/PlatformContext.tsx`
- Modify: `frontend/src/types/tenant.ts`
- Test: `frontend/src/components/tenant/devices/__tests__/EdgeSetupWizard.test.tsx`

**Interfaces:**
- Consumes Task 1’s `POST /tenants/{tenantId}/edge-setup` response.
- Produces `tenantApi.setupEdge(t, body): Promise<EdgeSetupOut>` and `setupTenantEdge(body): Promise<{ success: boolean; data?: EdgeSetupOut; message?: string; code?: string }>` in the existing context style.

- [ ] **Step 1: Add frontend response/input types and a failing API/context test**
  - Define `EdgeSetupInput`, `EdgeSetupOut`, and nested activation/site/device/gate types matching camelCase JSON.
  - Test that `setupTenantEdge` forwards only device/gate/site/direction/type/allowedIp fields and exposes API error code/message.

- [ ] **Step 2: Run the focused test to verify RED**
  - Run `cd frontend && npx vitest run src/components/tenant/devices/__tests__/EdgeSetupWizard.test.tsx`.
  - Expected: missing setup API/context implementation.

- [ ] **Step 3: Implement the API client and context handler**
  - Add `tenantApi.setupEdge` using the existing tenant URL helper and `api.post`.
  - Add context state/action without duplicating device/gate local state; on success call `loadTenantData(activeTenantId)` so all existing lists refresh.
  - Preserve error `code` for wizard-specific messages and never put activation plaintext in persistent context state beyond the open wizard result.

- [ ] **Step 4: Run the focused test to verify GREEN**
  - Run the same Vitest command; expected pass.

- [ ] **Step 5: Commit the client contract**
  ```bash
  git add frontend/src/services/api/index.ts frontend/src/context/PlatformContext.tsx frontend/src/types/tenant.ts frontend/src/components/tenant/devices/__tests__/EdgeSetupWizard.test.tsx
  git commit -m "feat: expose transactional edge setup to tenant UI"
  ```

### Task 3: Three-step non-technical setup wizard UI

**Files:**
- Create: `frontend/src/components/tenant/devices/EdgeSetupWizard.tsx`
- Modify: `frontend/src/pages/tenant/TenantEdgeDevicesPage.tsx`
- Modify: `frontend/src/i18n/locales/vi/tenant.json`
- Modify: `frontend/src/i18n/locales/en/tenant.json` if present
- Test: `frontend/src/components/tenant/devices/__tests__/EdgeSetupWizard.test.tsx`

**Interfaces:**
- Consumes `tenantSites`, `setupTenantEdge`, and `addToast`/existing UI primitives from `PlatformContext`.
- Produces a modal/wizard with `isOpen`, `onClose`, and a successful `EdgeSetupOut` result; it does not expose MQTT/IP/technical fields in the normal flow.

- [ ] **Step 1: Expand failing behavior tests**
  - `renders one-site flow without a site picker`.
  - `requires device and gate names before advancing`.
  - `shows site picker only for multiple sites`.
  - `submits one setup request with direction/type and shows activation code`.
  - `shows expiry and three next steps with copy control`.
  - `maps no_site/site_required/device_has_no_gates to actionable text`.
  - `does not lose a successful activation code when the user closes the final step`.

- [ ] **Step 2: Run tests to verify RED**
  - Run `cd frontend && npx vitest run src/components/tenant/devices/__tests__/EdgeSetupWizard.test.tsx`.
  - Expected: wizard component and actions are absent.

- [ ] **Step 3: Implement the wizard**
  - Step 1: select site only when `tenantSites.length > 1`; for zero sites show “we’ll create your location” and do not ask for a site ID.
  - Step 2: ask for human-facing Edge PC name, gate name, direction (entry/exit/bidirectional), and gate type; use defaults that match existing backend accepted values.
  - Step 3: submit once, show a loading state, render activation code, expiry, copy button, and exact ordered next steps: open Edge Client, enter code, wait for activated status.
  - Prevent duplicate submit while pending; retain error state in the current step; make cancel safe before submission and require no technical fields.

- [ ] **Step 4: Add the entry point and refresh behavior**
  - Add a prominent `Set up Edge Client`/`Thiết lập Edge Client` button beside the existing advanced `Register Device` button.
  - On success close the wizard only after the final result is visible or after explicit “Done”; refresh device/gate lists through context.
  - Keep the existing advanced forms for operators who need technical metadata.

- [ ] **Step 5: Run frontend checks**
  - Run `cd frontend && npx vitest run src/components/tenant/devices src/pages/tenant` and `npm run lint`.
  - Expected: new tests and existing relevant tests pass; only the documented Windows theme baseline may remain red in the full suite.

- [ ] **Step 6: Commit the wizard UI**
  ```bash
  git add frontend/src/components/tenant/devices/EdgeSetupWizard.tsx frontend/src/pages/tenant/TenantEdgeDevicesPage.tsx frontend/src/i18n/locales frontend/src/components/tenant/devices/__tests__/EdgeSetupWizard.test.tsx
  git commit -m "feat: add guided edge client setup wizard"
  ```

### Task 4: End-to-end verification and deployment readiness

**Files:**
- Modify: `backend/tests/e2e/e2e_api.py` or the repository’s current E2E harness only if its fixtures support the new route
- Modify: `docs/backend.md` or the tenant operations documentation to document the wizard and advanced fallback
- Test: existing backend/frontend suites plus one E2E journey where available

**Interfaces:**
- Consumes the production API contract and wizard from Tasks 1–3.
- Produces documented operator behavior and a repeatable verification command; no new production data is created during verification unless an isolated tenant/database is used.

- [ ] **Step 1: Add or update the E2E journey**
  - Use an isolated tenant to call setup once, assert one site/device/gate/code, and redeem the code only against a disposable Edge activation fixture.
  - Assert a repeated setup request does not claim to be idempotent unless the API explicitly adds an idempotency key; document retry semantics instead.

- [ ] **Step 2: Run verification**
  - Backend: `.venv/Scripts/python.exe -m pytest tests/test_edge_setup.py tests/test_edge_devices.py tests/test_edge_activation.py`.
  - Frontend: `npm run lint` and focused Vitest suites.
  - Rust/edge contract: `cd edge-client/src-tauri && cargo test` to ensure activation payload compatibility.
  - Run frontend build: `npm run build`.

- [ ] **Step 3: Review the final diff**
  - Confirm no secrets, activation codes, or private keys are committed.
  - Confirm the endpoint uses tenant authorization, transaction rollback, and existing rate-limit/RBAC conventions.
  - Confirm the normal wizard does not send IP/MQTT/technical fields.

- [ ] **Step 4: Commit docs and request review**
  ```bash
  git add docs/backend.md backend/tests/e2e frontend package-lock.json
  git commit -m "docs: document guided edge client setup"
  ```

- [ ] **Step 5: Deploy only after verification**
  - Push the reviewed branch/merge to `main`.
  - On Pi: `git pull --ff-only origin main`, run migration if one exists, `docker compose build api frontend mobile`, `docker compose up -d`.
  - Verify `/readyz`, the setup endpoint on an isolated tenant, and the dashboard wizard without creating production garbage.
