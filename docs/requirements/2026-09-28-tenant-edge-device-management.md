# Tenant Edge Device Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give tenant admins a real management surface for their edge devices: fix device registration, add update/decommission/reactivate/delete/reboot endpoints, and build the `TenantEdgeDevicesPage` that the existing `edge-devices` nav tab currently dead-ends into.

**Architecture:** Extend the existing tenant device section in `backend/app/api/v1/tenant/gates.py` (list/register/get already exist). Remote reboot reuses the proven async command path: `issue_command` → Redis `mqtt:outbox` → EMQX gate command topics with `payload.target = "edge_device"` (same mechanism as the existing platform reboot). Frontend adds a `TenantEdgeDevice` domain type, a `tenantDevices` collection in `PlatformContext` fed by the existing `tenantApi.devices` fetch, a new page under `pages/tenant/`, dialogs under `components/tenant/devices/`, plus wiring in `App.tsx` and `PlatformSidebar.tsx`.

**Tech Stack:** FastAPI + SQLAlchemy async + Pydantic (`CamelModel`), pytest + httpx against real Postgres/Redis (docker compose). React 19 + TypeScript + Tailwind + lucide-react; no frontend test runner — verify with `npm run lint` (tsc --noEmit) and `npm run build`.

**Spec:** `frontend/SYSTEM_ARCHITECTURE_AND_DATABASE_DESIGN.md` (§6 `edge_devices` DDL ~line 617, §15 MonitoringPage edge tab ~line 272) and `SPEC_ANALYSIS_AND_PLAN.md` (gap rows for edge devices). Decisions confirmed with user: scope = CRUD + reboot + decommission (no edge API-key issuance); removal = decommission first, hard `DELETE` only once `status='decommissioned'` and no gates bound; UI = new tenant page + sidebar item on the existing `edge-devices` nav tab; copy follows surrounding components (mixed Vietnamese headers / English labels).

## Global Constraints

- Mutating tenant endpoints require `Depends(require_roles(*WRITE_ROLES))` from `app.api.deps`; CSRF is enforced router-wide via `Depends(csrf_protect)` already on `gates.py`'s router.
- Response envelope is `{data, meta}` for collections, bare object for single resources; errors via helpers in `app.core.errors` (`not_found`, `conflict`, `bad_request`) — never raise `HTTPException` directly.
- Device status strings are lowercase: `provisioning` (register default), `online`, `offline`, `decommissioned`. `edge_devices.status` is `String(30)` — no migration needed.
- Every mutation calls `write_audit(...)` — match existing `device.registered` action-name style in `gates.py`.
- Remote device actions go through `issue_command` (`app/services/command_service.py`) — never publish MQTT directly.
- Backend tests run against real services: `cd backend && pytest tests/test_edge_devices.py -v` (requires compose Postgres/Redis; see `backend/tests/conftest.py` env defaults).

## Review Focus

Failure modes the spec implies but happy-path tests would miss:

1. A `decommissioned` device that keeps sending heartbeats must not flip back to `online` — `mqtt_bridge.handle_telemetry` currently sets `status="online"` unconditionally (line ~112). Guard + test in Task 3.
2. `siteId` referencing another tenant's site (create or PATCH) must not attach the device cross-tenant — the FK passes either way, so validate explicitly → 404. Tests in Tasks 1–2.
3. `device_serial` and `mqtt_client_id` are globally UNIQUE columns — a serial already claimed by *another* tenant must return 409, not a 500 IntegrityError. Explicit pre-check + test in Task 1.
4. Reboot on a decommissioned device or one with zero bound gates: former → 409; latter → `{commandIds: []}` with audit still written. Tests in Task 4.
5. `DELETE` on a `decommissioned` device that still has bound gates (gate re-bound between decommission and delete) → 409. Test in Task 3.
6. Repeat reboots: reusing `edge-reboot-{device}-{gate}` as the idempotency key makes the second click a silent no-op (returns the original row). All reboot paths (tenant new + existing platform) must suffix a random token — fixed in Task 4.

Pre-existing, out of scope but noted: `PlatformContext` fetches devices with `limit: 200` — tenants beyond 200 devices won't see the tail; and `mapDevice` zeroes `cpuPercent/memoryPercent/diskPercent` even though `DeviceOut` carries real values (fixed in Task 5).

---

### Task 1: Fix `register_device` — persist all fields, validate site ownership, conflict on unique fields

`register_device` (`gates.py` ~line 292) currently drops `device_serial`, `hardware_model`, `ip_address`, `mqtt_client_id` from `DeviceIn`, and accepts any existing `site_id` — including another tenant's.

**Files:**
- Modify: `backend/app/api/v1/tenant/gates.py` (`register_device`, ~lines 292–323)
- Test: `backend/tests/test_edge_devices.py` (new)

**Interfaces:**
- Consumes: `DeviceIn` (`app/schemas/resources.py:179`), `TenantSite` (`app/models.py`), `tenant_ctx`/`get_tenant_db`, `write_audit`, `conflict`, `not_found`.
- Produces: unchanged `DeviceOut` contract — but all `DeviceIn` fields now persist. Test file and `device` fixture reused by Tasks 2–4.

- [ ] **Step 1: Write the failing tests** in `backend/tests/test_edge_devices.py`

```python
"""Tenant edge-device management: register/update/lifecycle/reboot."""

import uuid

import pytest
from httpx import AsyncClient

from tests.conftest import csrf, login


@pytest.fixture
async def site(client: AsyncClient, tenant):
    await login(client, tenant["email"], tenant["password"])
    res = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/sites",
        json={"name": "Lot A"},
        headers=csrf(client),
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


@pytest.fixture
async def device(client: AsyncClient, tenant, site):
    res = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/devices",
        json={"siteId": site, "name": "Edge GW-01"},
        headers=csrf(client),
    )
    assert res.status_code == 201, res.text
    return res.json()


@pytest.mark.asyncio
async def test_register_persists_all_fields(client: AsyncClient, tenant, site):
    tid = tenant["tenant_id"]
    body = {
        "siteId": site,
        "name": "Jetson-A",
        "deviceSerial": "SN-1001",
        "hardwareModel": "NVIDIA Jetson Orin Nano",
        "mac": "aa:bb:cc:dd:ee:ff",
        "ipAddress": "10.0.0.51",
        "mqttClientId": "edge-a51",
        "firmwareVersion": "1.4.2",
    }
    res = await client.post(f"/api/v1/tenants/{tid}/devices", json=body, headers=csrf(client))
    assert res.status_code == 201, res.text
    got = await client.get(f"/api/v1/tenants/{tid}/devices/{res.json()['id']}")
    for key, value in body.items():
        if key != "siteId":
            assert got.json()[key] == value


@pytest.mark.asyncio
async def test_register_rejects_foreign_site(client: AsyncClient, tenant, other_tenant, site):
    # `site` was created under `tenant`; register under other_tenant must 404.
    await login(client, other_tenant["email"], other_tenant["password"])
    res = await client.post(
        f"/api/v1/tenants/{other_tenant['tenant_id']}/devices",
        json={"siteId": site, "name": "Pirate GW"},
        headers=csrf(client),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_register_conflicts_duplicate_serial(client: AsyncClient, tenant, site):
    tid = tenant["tenant_id"]
    body = {"siteId": site, "name": "GW-1", "deviceSerial": "SN-DUP"}
    assert (await client.post(f"/api/v1/tenants/{tid}/devices", json=body, headers=csrf(client))).status_code == 201
    dup = await client.post(
        f"/api/v1/tenants/{tid}/devices", json={**body, "name": "GW-2"}, headers=csrf(client)
    )
    assert dup.status_code == 409
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_edge_devices.py -v`
Expected: FAIL — persisted fields come back `null`; foreign site returns 201; duplicate serial returns 500 instead of 409.

- [ ] **Step 3: Implement in `register_device`**

- Look up `TenantSite` with `where(TenantSite.id == body.site_id, TenantSite.tenant_id == ctx.tenant_id)`; missing → `not_found("site", body.site_id)`.
- When `body.device_serial` or `body.mqtt_client_id` are set, `select(EdgeDevice.id)` for each value; existing → `conflict("device_serial already registered")` / `conflict("mqtt_client_id already in use")`.
- Construct the row as `EdgeDevice(tenant_id=ctx.tenant_id, site_id=body.site_id, device_key=f"edge-{secrets.token_hex(12)}", **body.model_dump(exclude={"site_id"}))`. Keep the existing audit block.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_edge_devices.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/tenant/gates.py backend/tests/test_edge_devices.py
git commit -m "fix(devices): persist all DeviceIn fields and validate site ownership on register"
```

---

### Task 2: `PATCH /tenants/{tenant_id}/devices/{device_id}` — update device metadata

**Files:**
- Modify: `backend/app/schemas/resources.py` (add `DeviceUpdateIn` after `DeviceOut`, ~line 213)
- Modify: `backend/app/api/v1/tenant/gates.py` (append to the devices section, after `get_device`)
- Test: `backend/tests/test_edge_devices.py`

**Interfaces:**
- Consumes: `DeviceIn`/`DeviceOut`, `require_roles(*WRITE_ROLES)`, `write_audit`.
- Produces: `PATCH /tenants/{id}/devices/{id}` → `DeviceOut`; schema `DeviceUpdateIn` (all fields optional, same shape as `DeviceIn`).

- [ ] **Step 1: Write the failing tests**

```python
@pytest.mark.asyncio
async def test_patch_device_updates_fields(client: AsyncClient, tenant, device):
    tid, did = tenant["tenant_id"], device["id"]
    res = await client.patch(
        f"/api/v1/tenants/{tid}/devices/{did}",
        json={"name": "Renamed GW", "firmwareVersion": "1.5.0", "ipAddress": "10.0.0.99"},
        headers=csrf(client),
    )
    assert res.status_code == 200, res.text
    assert res.json()["name"] == "Renamed GW"
    assert res.json()["firmwareVersion"] == "1.5.0"


@pytest.mark.asyncio
async def test_patch_device_rejects_foreign_site(client: AsyncClient, tenant, other_tenant, device):
    # A site created under other_tenant must not be assignable here.
    await login(client, other_tenant["email"], other_tenant["password"])
    foreign = await client.post(
        f"/api/v1/tenants/{other_tenant['tenant_id']}/sites",
        json={"name": "Other Lot"},
        headers=csrf(client),
    )
    foreign_site_id = foreign.json()["id"]
    await login(client, tenant["email"], tenant["password"])
    res = await client.patch(
        f"/api/v1/tenants/{tenant['tenant_id']}/devices/{device['id']}",
        json={"siteId": foreign_site_id},
        headers=csrf(client),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_patch_device_conflicts_duplicate_serial(client: AsyncClient, tenant, site, device):
    tid = tenant["tenant_id"]
    other = await client.post(
        f"/api/v1/tenants/{tid}/devices",
        json={"siteId": site, "name": "GW-2", "deviceSerial": "SN-TAKEN"},
        headers=csrf(client),
    )
    assert other.status_code == 201
    res = await client.patch(
        f"/api/v1/tenants/{tid}/devices/{device['id']}",
        json={"deviceSerial": "SN-TAKEN"},
        headers=csrf(client),
    )
    assert res.status_code == 409
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_edge_devices.py -k patch -v`
Expected: FAIL with 404/405 (route does not exist).

- [ ] **Step 3: Add `DeviceUpdateIn` and the endpoint**

In `resources.py` after `DeviceOut`:

```python
class DeviceUpdateIn(CamelModel):
    site_id: uuid.UUID | None = None
    name: str | None = Field(default=None, min_length=2, max_length=200)
    device_serial: str | None = None
    hardware_model: str | None = None
    mac: str | None = None
    ip_address: str | None = None
    mqtt_client_id: str | None = None
    firmware_version: str | None = None
```

In `gates.py`, add `PATCH /devices/{device_id}` mirroring `update_gate`: load device scoped by `tenant_id` (404 if missing); if `site_id` in the update, apply the Task 1 ownership check; if `device_serial`/`mqtt_client_id` changed, apply the Task 1 uniqueness checks excluding `device_id` itself (`EdgeDevice.id != device_id`); apply `body.model_dump(exclude_unset=True)`; audit `action="device.updated"`; return `DeviceOut`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_edge_devices.py -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/resources.py backend/app/api/v1/tenant/gates.py backend/tests/test_edge_devices.py
git commit -m "feat(devices): add PATCH endpoint for tenant edge devices"
```

---

### Task 3: Device lifecycle — decommission, reactivate, delete + heartbeat guard

Status flow: `provisioning` →(heartbeat)→ `online` →(stale)→ `offline`; `decommissioned` is terminal-ish (only `reactivate` → `provisioning` or `DELETE`).

**Files:**
- Modify: `backend/app/api/v1/tenant/gates.py` (three new routes after `PATCH`)
- Modify: `backend/app/realtime/mqtt_bridge.py:121-125` (heartbeat guard)
- Test: `backend/tests/test_edge_devices.py`

**Interfaces:**
- Consumes: `EdgeDevice`, `BarrierGate` (`edge_device_id` FK, `ON DELETE SET NULL`), `MessageOut` (`app/schemas/common.py`), `handle_telemetry(tenant_id, site_id, gate_id, payload)` in `mqtt_bridge`.
- Produces: `POST /devices/{id}/decommission` → `DeviceOut`; `POST /devices/{id}/reactivate` → `DeviceOut`; `DELETE /devices/{id}` → `MessageOut`. Audit actions `device.decommissioned` / `device.reactivated` / `device.deleted`.

- [ ] **Step 1: Write the failing tests**

```python
@pytest.mark.asyncio
async def test_decommission_unbinds_gates_and_blocks_delete_of_active(
    client: AsyncClient, tenant, site, device
):
    tid, did = tenant["tenant_id"], device["id"]
    gate = await client.post(
        f"/api/v1/tenants/{tid}/gates",
        json={"name": "Gate A", "siteId": site, "edgeDeviceId": did},
        headers=csrf(client),
    )
    gate_id = gate.json()["id"]

    # Active device cannot be deleted.
    res = await client.delete(f"/api/v1/tenants/{tid}/devices/{did}", headers=csrf(client))
    assert res.status_code == 409

    res = await client.post(f"/api/v1/tenants/{tid}/devices/{did}/decommission", headers=csrf(client))
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "decommissioned"

    # Bound gate was detached.
    g = await client.get(f"/api/v1/tenants/{tid}/gates/{gate_id}")
    assert g.json()["edgeDeviceId"] is None

    # Double-decommission is a conflict.
    res = await client.post(f"/api/v1/tenants/{tid}/devices/{did}/decommission", headers=csrf(client))
    assert res.status_code == 409

    # Now delete succeeds and the row is gone.
    res = await client.delete(f"/api/v1/tenants/{tid}/devices/{did}", headers=csrf(client))
    assert res.status_code == 200
    assert (await client.get(f"/api/v1/tenants/{tid}/devices/{did}")).status_code == 404


@pytest.mark.asyncio
async def test_reactivate_returns_to_provisioning(client: AsyncClient, tenant, device):
    tid, did = tenant["tenant_id"], device["id"]
    await client.post(f"/api/v1/tenants/{tid}/devices/{did}/decommission", headers=csrf(client))
    res = await client.post(f"/api/v1/tenants/{tid}/devices/{did}/reactivate", headers=csrf(client))
    assert res.status_code == 200
    assert res.json()["status"] == "provisioning"
    # Reactivating a live device is a conflict.
    res = await client.post(f"/api/v1/tenants/{tid}/devices/{did}/reactivate", headers=csrf(client))
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_heartbeat_does_not_resurrect_decommissioned(
    client: AsyncClient, tenant, site, device
):
    tid, did = tenant["tenant_id"], device["id"]
    gate = await client.post(
        f"/api/v1/tenants/{tid}/gates",
        json={"name": "Gate B", "siteId": site, "edgeDeviceId": did},
        headers=csrf(client),
    )
    await client.post(f"/api/v1/tenants/{tid}/devices/{did}/decommission", headers=csrf(client))

    from app.database import platform_session
    from app.models import EdgeDevice
    from app.realtime.mqtt_bridge import handle_telemetry
    from sqlalchemy import select

    await handle_telemetry(
        tid, site, gate.json()["id"],
        {"type": "heartbeat", "deviceId": did, "cpuUsagePct": 42},
    )
    async with platform_session() as db:
        row = (await db.execute(select(EdgeDevice).where(EdgeDevice.id == uuid.UUID(did)))).scalar_one()
    assert row.status == "decommissioned"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_edge_devices.py -k "decommission or reactivate or heartbeat" -v`
Expected: FAIL — routes 404/405; heartbeat test fails because status flips to `online`.

- [ ] **Step 3: Implement**

In `gates.py`:

- `POST /devices/{device_id}/decommission` (WRITE_ROLES): load device tenant-scoped (404); if `row.status == "decommissioned"` → `conflict`; set `row.status = "decommissioned"`; run `update(BarrierGate).where(BarrierGate.edge_device_id == device_id, BarrierGate.tenant_id == ctx.tenant_id).values(edge_device_id=None)`; audit `device.decommissioned`; return `DeviceOut`.
- `POST /devices/{device_id}/reactivate` (WRITE_ROLES): same load; if `status != "decommissioned"` → `conflict`; set `status = "provisioning"`; audit `device.reactivated`; return `DeviceOut`.
- `DELETE /devices/{device_id}` (WRITE_ROLES → `MessageOut`, matching `revoke_credential` style): same load; if `status != "decommissioned"` → `conflict("Device must be decommissioned before deletion")`; count `BarrierGate` rows with `edge_device_id == device_id` → if > 0, `conflict("Device still has bound gates")`; `await db.delete(row)`; audit `device.deleted`; return `MessageOut(message="Device deleted")`.

In `mqtt_bridge.py` line ~123, add `EdgeDevice.status != "decommissioned"` to the heartbeat `update(EdgeDevice).where(...)` clause so retired devices ignore heartbeats entirely.

Note: `mark_offline_devices` (`workers/jobs.py:310`) only matches `status == "online"`, so `decommissioned` is already safe — no change needed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_edge_devices.py -v`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/tenant/gates.py backend/app/realtime/mqtt_bridge.py backend/tests/test_edge_devices.py
git commit -m "feat(devices): decommission/reactivate/delete lifecycle for tenant edge devices"
```

---

### Task 4: `POST /tenants/{tenant_id}/devices/{device_id}/reboot` — remote reboot via command channel

Mirrors the platform reboot (`platform.py:632`) but tenant-scoped, and fixes the idempotency-key reuse that makes repeated reboots no-ops.

**Files:**
- Modify: `backend/app/api/v1/tenant/gates.py`
- Modify: `backend/app/api/v1/platform.py` (~line 657, idempotency key suffix)
- Test: `backend/tests/test_edge_devices.py`

**Interfaces:**
- Consumes: `issue_command(db, tenant_id=, gate_id=, command="reboot", idempotency_key=, issued_by=, issued_by_type=, payload=)`; `EdgeRebootOut` (`commandIds: list[uuid]`).
- Produces: `POST /tenants/{id}/devices/{id}/reboot` → 200 `EdgeRebootOut`. Audit action `device.reboot` with `details={"gateCount": n}`.

- [ ] **Step 1: Write the failing test**

```python
@pytest.mark.asyncio
async def test_reboot_fans_out_to_bound_gates(client: AsyncClient, tenant, site, device):
    tid, did = tenant["tenant_id"], device["id"]
    for name in ("Gate R1", "Gate R2"):
        await client.post(
            f"/api/v1/tenants/{tid}/gates",
            json={"name": name, "siteId": site, "edgeDeviceId": did},
            headers=csrf(client),
        )
    res = await client.post(f"/api/v1/tenants/{tid}/devices/{did}/reboot", headers=csrf(client))
    assert res.status_code == 200, res.text
    ids = res.json()["commandIds"]
    assert len(ids) == 2
    # Each command is a real, pollable reboot row.
    got = await client.get(f"/api/v1/tenants/{tid}/commands/{ids[0]}")
    assert got.json()["command"] == "reboot"

    # A second reboot issues NEW commands (idempotency key must not collide).
    res2 = await client.post(f"/api/v1/tenants/{tid}/devices/{did}/reboot", headers=csrf(client))
    assert set(res2.json()["commandIds"]).isdisjoint(ids)


@pytest.mark.asyncio
async def test_reboot_guards(client: AsyncClient, tenant, site, device):
    tid = tenant["tenant_id"]
    # No gates bound → empty list, still 200.
    res = await client.post(f"/api/v1/tenants/{tid}/devices/{device['id']}/reboot", headers=csrf(client))
    assert res.status_code == 200 and res.json()["commandIds"] == []
    # Decommissioned → 409.
    await client.post(f"/api/v1/tenants/{tid}/devices/{device['id']}/decommission", headers=csrf(client))
    res = await client.post(f"/api/v1/tenants/{tid}/devices/{device['id']}/reboot", headers=csrf(client))
    assert res.status_code == 409
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_edge_devices.py -k reboot -v`
Expected: FAIL — route does not exist (404/405).

- [ ] **Step 3: Implement**

In `gates.py`, `POST /devices/{device_id}/reboot` (WRITE_ROLES, `EdgeRebootOut`): load device tenant-scoped (404); if `status == "decommissioned"` → `conflict`; select `BarrierGate.id` where `edge_device_id == device_id and tenant_id == ctx.tenant_id`; for each gate call `issue_command` with `command="reboot"`, `idempotency_key=f"edge-reboot-{device_id}-{gate_id}-{uuid.uuid4().hex[:8]}"`, `issued_by=ctx.auth.user_id`, `issued_by_type=ctx.auth.user_type`, `payload={"target": "edge_device", "deviceId": str(device_id)}`; audit `device.reboot` with `details={"gateCount": len(gates)}`; return `EdgeRebootOut(command_ids=ids)`.

In `platform.py` line ~657, change the idempotency key to the same `...-{uuid.uuid4().hex[:8]}` suffix so repeated platform reboots also issue new commands.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_edge_devices.py -v`
Expected: PASS (11 tests). Also `pytest tests/test_resources_and_commands.py -v` to confirm no regressions.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/tenant/gates.py backend/app/api/v1/platform.py backend/tests/test_edge_devices.py
git commit -m "feat(devices): tenant-scoped edge device reboot via gate command channel"
```

---

### Task 5: Frontend plumbing — `TenantEdgeDevice` type, mapper, API methods, context collection

**Files:**
- Modify: `frontend/src/types/tenant.ts` (add `TenantEdgeDevice`)
- Modify: `frontend/src/services/api/mappers.ts` (add `mapTenantDevice`; fix `mapDevice` metrics)
- Modify: `frontend/src/services/api/index.ts` (tenantApi device methods)
- Modify: `frontend/src/context/PlatformContext.tsx` (`tenantDevices` state + WS updates)

**Interfaces:**
- Consumes: `DeviceOut` fields: `id, siteId, name, deviceKey, deviceSerial, hardwareModel, mac, ipAddress, mqttClientId, firmwareVersion, cpuUsagePct, ramUsagePct, storageUsagePct, latencyMs, status, lastHeartbeatAt, createdAt` (all camelCase post-`CamelModel`).
- Produces (used by Task 6):
  - `TenantEdgeDevice` (below)
  - `mapTenantDevice(d: DeviceOut, siteName?: string): TenantEdgeDevice`
  - `tenantApi.updateDevice(t, id, body)`, `tenantApi.decommissionDevice(t, id)`, `tenantApi.reactivateDevice(t, id)`, `tenantApi.deleteDevice(t, id)`, `tenantApi.rebootDevice(t, id)` → `Promise<EdgeRebootOut>`
  - `usePlatform().tenantDevices: TenantEdgeDevice[]`

- [ ] **Step 1: Add the type** to `frontend/src/types/tenant.ts` (near `TenantSystemHealth`):

```ts
export interface TenantEdgeDevice {
  id: string;
  siteId: string;
  siteName: string;
  name: string;
  deviceKey: string;
  deviceSerial?: string;
  hardwareModel?: string;
  mac?: string;
  ipAddress?: string;
  mqttClientId?: string;
  firmwareVersion?: string;
  status: 'PROVISIONING' | 'ONLINE' | 'OFFLINE' | 'DECOMMISSIONED' | 'DEGRADED';
  cpuUsagePct: number;
  ramUsagePct: number;
  storageUsagePct: number;
  latencyMs?: number;
  lastHeartbeatAt?: string;
  createdAt: string;
}
```

- [ ] **Step 2: Add `mapTenantDevice` and fix `mapDevice`** in `mappers.ts`

```ts
export const mapTenantDevice = (d: DeviceOut, siteName = ''): TenantEdgeDevice => ({
  id: d.id,
  siteId: d.siteId,
  siteName,
  name: d.name,
  deviceKey: d.deviceKey,
  deviceSerial: d.deviceSerial ?? undefined,
  hardwareModel: d.hardwareModel ?? undefined,
  mac: d.mac ?? undefined,
  ipAddress: d.ipAddress ?? undefined,
  mqttClientId: d.mqttClientId ?? undefined,
  firmwareVersion: d.firmwareVersion ?? undefined,
  status: upper(d.status, 'OFFLINE') as TenantEdgeDevice['status'],
  cpuUsagePct: d.cpuUsagePct ?? 0,
  ramUsagePct: d.ramUsagePct ?? 0,
  storageUsagePct: d.storageUsagePct ?? 0,
  latencyMs: d.latencyMs ?? undefined,
  lastHeartbeatAt: d.lastHeartbeatAt ?? undefined,
  createdAt: d.createdAt,
});
```

In `mapDevice` (~line 232): replace the hardcoded `cpuPercent: 0, memoryPercent: 0, diskPercent: 0` with `d.cpuUsagePct ?? 0`, `d.ramUsagePct ?? 0`, `d.storageUsagePct ?? 0` so the platform Monitoring edge tab shows real values.

- [ ] **Step 3: Add API methods** in `tenantApi` (next to `createDevice`, ~line 158 of `index.ts`):

```ts
updateDevice: (t: string, id: string, body: Partial<{ siteId: string; name: string; deviceSerial: string; hardwareModel: string; mac: string; ipAddress: string; mqttClientId: string; firmwareVersion: string }>) => api.patch<DeviceOut>(T(t, `/devices/${id}`), body),
decommissionDevice: (t: string, id: string) => api.post<DeviceOut>(T(t, `/devices/${id}/decommission`)),
reactivateDevice: (t: string, id: string) => api.post<DeviceOut>(T(t, `/devices/${id}/reactivate`)),
deleteDevice: (t: string, id: string) => api.del<MessageOut>(T(t, `/devices/${id}`)),
rebootDevice: (t: string, id: string) => api.post<S['EdgeRebootOut']>(T(t, `/devices/${id}/reboot`)),
```

(`MessageOut` and `EdgeRebootOut` types are already exported/used in this file.)

- [ ] **Step 4: Add `tenantDevices` to `PlatformContext`**

- Declare `tenantDevices: TenantEdgeDevice[]` on the context interface (near the existing `edgeDevices` entry) and `const [tenantDevices, setTenantDevices] = useState<TenantEdgeDevice[]>([])`.
- In `loadTenantData` (~line 569), after `setEdgeDevices(...)`: `setTenantDevices(devicesPage.data.map((d) => mapTenantDevice(d, siteNames.get(d.siteId) ?? '')))`.
- In the two WS handlers that patch `edgeDevices` on heartbeat (~lines 781–783 and ~850–853), apply the same `status: 'ONLINE', lastHeartbeatAt: nowIso` update to `tenantDevices` via `setTenantDevices`.
- Add `tenantDevices` to the provider value.

- [ ] **Step 5: Verify**

Run: `cd frontend && npm run lint`
Expected: `tsc --noEmit` exits clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/tenant.ts frontend/src/services/api/mappers.ts frontend/src/services/api/index.ts frontend/src/context/PlatformContext.tsx
git commit -m "feat(devices): tenant edge device type, mapper, API methods, context collection"
```

---

### Task 6: `TenantEdgeDevicesPage` + dialogs + navigation wiring

**Files:**
- Create: `frontend/src/pages/tenant/TenantEdgeDevicesPage.tsx`
- Create: `frontend/src/components/tenant/devices/RegisterDeviceModal.tsx`
- Create: `frontend/src/components/tenant/devices/EditDeviceModal.tsx`
- Create: `frontend/src/components/tenant/devices/DeviceActionDialogs.tsx` (Reboot/Decommission/Reactivate/Delete confirms — one file of small dialog components, like `MembershipActionDialog`)
- Modify: `frontend/src/App.tsx` (~line 224, add `tenantNavTab === 'edge-devices'` branch)
- Modify: `frontend/src/components/layout/PlatformSidebar.tsx` (tenant nav item after Gates, ~line 197)

**Interfaces:**
- Consumes: `usePlatform()` → `tenantDevices`, `tenantSites`, `gates`, `activeTenantId` (whatever name the context exposes — check the provider value), `refreshTenantDashboard()`, `toastOk`/`toastErr` helpers used by sibling modals; `tenantApi.*Device` from Task 5; `Modal`, `Input`, `Select`, `Button`, `Badge`, `StatCard`, `Pagination` from `components/ui`.
- Produces: the page component only.

- [ ] **Step 1: Build `TenantEdgeDevicesPage.tsx`**

Match the `TenantVehiclesPage`/`TenantUsersPage` layout conventions (dark `#161b22`/`#30363d` cards, Vietnamese section headers, English labels):

- Header row: title ("Thiết Bị Biên — Edge Gateways"), subtitle, and a `Register Device` `Button` opening `RegisterDeviceModal`.
- Four `StatCard`s: total / online / offline / decommissioned computed from `tenantDevices`.
- Table over `tenantDevices` (filterable by site via a `Select` of `tenantSites`): columns Name, Site, Device Key (mono), Status `Badge` (`emerald`=ONLINE, `amber`=PROVISIONING/DEGRADED, `red`=OFFLINE, `slate`=DECOMMISSIONED), CPU/RAM %, latency, last heartbeat (`new Date(d.lastHeartbeatAt).toLocaleString()` or "—"), bound-gate count (`gates.filter(g => g.edgeDeviceId === d.id).length`), and row actions opening the dialogs: Edit, Reboot (disabled when `DECOMMISSIONED` or no bound gates), Decommission / Reactivate, Delete (only when `DECOMMISSIONED`).
- Empty state when `tenantDevices` is empty (match existing honest-empty pattern).

- [ ] **Step 2: Build `RegisterDeviceModal.tsx`**

`Modal` with `siteId` `Select` (options = `tenantSites`), `name` (required, min 2), optional `deviceSerial`, `hardwareModel`, `mac`, `ipAddress`, `mqttClientId`, `firmwareVersion` `Input`s. Submit → `tenantApi.createDevice(tId, body)` → on success `refreshTenantDashboard()` + close + `toastOk`; on error `toastErr` (match `CreateSiteModal`'s error handling).

- [ ] **Step 3: Build `EditDeviceModal.tsx`**

Same fields pre-filled from the selected `TenantEdgeDevice`; submit → `tenantApi.updateDevice(tId, id, changedFields)` → refresh + toast.

- [ ] **Step 4: Build `DeviceActionDialogs.tsx`**

Small confirm-dialog components: `RebootDeviceDialog` (warns it reboots all bound gates; on success toast the `commandIds.length`), `DecommissionDeviceDialog`, `ReactivateDeviceDialog`, `DeleteDeviceDialog` (destructive variant). Each calls the matching `tenantApi` method, then `refreshTenantDashboard()` + toast.

- [ ] **Step 5: Wire navigation**

- `App.tsx`: `{tenantNavTab === 'edge-devices' && <TenantEdgeDevicesPage />}` inside the tenant workspace block.
- `PlatformSidebar.tsx`: tenant nav item `edge-devices` labeled "Edge Devices" with lucide `Cpu` icon, placed right after the Gates item (~line 197), following the same button/`setTenantNavTab` pattern.

- [ ] **Step 6: Verify**

Run: `cd frontend && npm run lint && npm run build`
Expected: both exit clean. Then `npm run dev`, open a tenant workspace → sidebar "Edge Devices" → register/edit/reboot/decommission/delete a device against the running backend.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/tenant/TenantEdgeDevicesPage.tsx frontend/src/components/tenant/devices/ frontend/src/App.tsx frontend/src/components/layout/PlatformSidebar.tsx
git commit -m "feat(devices): tenant edge devices management page"
```

---

## Self-Review Notes

- **Spec coverage:** register (spec §6 fields all persisted — Task 1), edit (Task 2), lifecycle + reboot (spec §15 `reboot` + status lifecycle — Tasks 3–4), UI surface (dead `edge-devices` tab — Task 6). Platform monitoring tab already reads devices via telemetry-snapshot; real CPU/RAM now flow via the `mapDevice` fix.
- **Type consistency:** `DeviceUpdateIn` mirrors `DeviceIn` field-for-field; `TenantEdgeDevice.status` union includes every value the backend emits (`provisioning/online/offline/decommissioned`) plus `degraded` for forward compat with the spec enum; `EdgeRebootOut.commandIds` is the shared reboot contract for both platform and tenant endpoints.
- **Deliberately excluded:** edge `pk_` credential issuance (user decision), `GET /platform/monitoring/telemetry-snapshot` changes, retention/archival, `schema.d.ts` regeneration (no codegen script exists in-repo; `tenantApi` wrappers use inline types like `updateGate` does — regenerate `schema.d.ts` from `/openapi.json` when convenient).
