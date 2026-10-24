# GAP-BE-002: Plate Ownership Enforcement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce that each plate belongs to exactly one driver account, add a vehicle-sharing mechanism by date, and restrict session/payment access to the owner and today's share recipients.

**Architecture:** Add a global unique constraint on `plate_normalized` in `driver_vehicles` (replacing the per-driver constraint), create a `driver_vehicle_shares` table for date-scoped sharing, and update the session/payment/WS query layers to include shared plates. Migration deduplicates any existing overlapping registrations.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, asyncpg, pytest

**Spec:** `docs/superpowers/specs/2026-10-23-plate-ownership-design.md`

## Global Constraints

- Python ≥ 3.10, FastAPI 0.115.6, SQLAlchemy 2.0.36, Pydantic 2.9.2
- Schemas use `CamelModel` (camelCase JSON aliases)
- Services use `platform_session()` context manager (no tenant RLS)
- Error helpers: `conflict()`, `not_found()`, `forbidden()` from `app.core.errors`
- Plate normalization: `normalize_plate()` from `app.services.event_service`
- Tests run against real Postgres + Redis via `conftest.py` fixtures
- Next migration revision: `0019`

## Review Focus

1. **Owner deletes vehicle while active shares exist** — CASCADE on `driver_vehicle_shares.vehicle_id` must clean up share rows; a shared-with driver must not get 500 errors. Test in Task 3 step 1.
2. **Share for past date** — creating a share for yesterday should be rejected (useless data). Test in Task 3 step 1.
3. **update_vehicle changes plate to one already owned globally** — must raise 409 and not corrupt the old row. Test in Task 2 step 1.
4. **Concurrent registration race** — two drivers `add_vehicle` same plate simultaneously; DB unique constraint is the final guard. Covered by the IntegrityError catch already in `add_vehicle`.
5. **WS reconnect after share created mid-session** — new share's plate channel not subscribed until next WS connect. Accepted limitation; documented in Task 5.

---

### Task 1: Migration — global unique constraint + shares table

**Files:**
- Create: `backend/migrations/versions/0019_plate_ownership.py`
- Modify: `backend/app/models.py:568-588` (DriverVehicle docstring + constraint)
- Create model: `backend/app/models.py` (DriverVehicleShare class, after DriverVehicle)

**Interfaces:**
- Consumes: existing `DriverVehicle` model, `uuid_pk()`, `TimestampMixin`
- Produces: `DriverVehicleShare` model (used by Tasks 2–5), updated `DriverVehicle.__table_args__` with global unique constraint `uq_driver_vehicle_plate_global`

- [ ] **Step 1: Write Alembic migration `0019_plate_ownership.py`**

Revision depends on `0018_wallet_refunds`. Upgrade:
1. DELETE duplicate `driver_vehicles` rows: for each `plate_normalized` with count > 1, keep the row with min `created_at`, delete the rest (raw SQL in migration).
2. `op.drop_constraint("uq_driver_vehicle_plate", "driver_vehicles")`
3. `op.create_unique_constraint("uq_driver_vehicle_plate_global", "driver_vehicles", ["plate_normalized"])`
4. `op.create_table("driver_vehicle_shares", ...)` with columns: `id` (UUID PK), `vehicle_id` (UUID FK driver_vehicles.id CASCADE), `shared_with_id` (UUID FK driver_users.id CASCADE), `share_date` (Date), `created_at` (TIMESTAMPTZ). Unique constraint `uq_vehicle_share` on `(vehicle_id, shared_with_id, share_date)`. Index `ix_vehicle_shares_recipient` on `(shared_with_id, share_date)`.

Downgrade reverses: drop table, drop global constraint, re-add per-driver constraint.

- [ ] **Step 2: Update `DriverVehicle` model in `models.py:568-588`**

Change docstring from "Unique per driver — drivers may share a plate" to "Globally unique — one driver owns each plate; sharing via driver_vehicle_shares." Replace `__table_args__` constraint:

```python
__table_args__ = (
    UniqueConstraint("plate_normalized", name="uq_driver_vehicle_plate_global"),
    Index("ix_driver_vehicles_driver", "driver_id"),
    Index("ix_driver_vehicles_plate", "plate_normalized"),
)
```

- [ ] **Step 3: Add `DriverVehicleShare` model in `models.py` after `DriverVehicle`**

```python
class DriverVehicleShare(TimestampMixin, Base):
    __tablename__ = "driver_vehicle_shares"

    id: Mapped[uuid.UUID] = uuid_pk()
    vehicle_id: Mapped[uuid.UUID]  # FK driver_vehicles.id CASCADE
    shared_with_id: Mapped[uuid.UUID]  # FK driver_users.id CASCADE
    share_date: Mapped[date]  # from datetime import date

    __table_args__ = (
        UniqueConstraint("vehicle_id", "shared_with_id", "share_date", name="uq_vehicle_share"),
        Index("ix_vehicle_shares_recipient", "shared_with_id", "share_date"),
    )
```

- [ ] **Step 4: Run migration and verify**

```bash
cd backend && alembic upgrade head
```

Expected: migration applies cleanly, `driver_vehicle_shares` table exists, `uq_driver_vehicle_plate_global` constraint active.

- [ ] **Step 5: Commit**

```bash
git add backend/migrations/versions/0019_plate_ownership.py backend/app/models.py
git commit -m "feat: add global plate uniqueness and vehicle shares table (GAP-BE-002)"
```

---

### Task 2: Enforce global plate uniqueness in driver_service

**Files:**
- Modify: `backend/app/services/driver_service.py:161-209` (add_vehicle, update_vehicle)
- Modify: `backend/tests/test_driver_api.py:193-214` (update shared-plate tests)
- Test: `backend/tests/test_driver_api.py`

**Interfaces:**
- Consumes: `DriverVehicle` model (Task 1), `normalize_plate`, `conflict`, `not_found`
- Produces: updated `add_vehicle` and `update_vehicle` that reject globally-duplicate plates (used by existing API, unchanged signatures)

- [ ] **Step 1: Write failing tests**

In `test_driver_api.py`, replace `test_two_drivers_may_share_a_plate` (lines 193-202):

```python
async def test_second_driver_cannot_register_same_plate(client):
    a, b = await driver(client), await driver(client)
    assert (
        await client.post(
            "/api/v1/driver/vehicles",
            headers=a["headers"],
            json={"plateNumber": "30A-000.01"},
        )
    ).status_code == 201
    resp = await client.post(
        "/api/v1/driver/vehicles",
        headers=b["headers"],
        json={"plateNumber": "30A-000.01"},
    )
    assert resp.status_code == 409


async def test_update_vehicle_to_taken_plate_409(client):
    a, b = await driver(client), await driver(client)
    await client.post(
        "/api/v1/driver/vehicles", headers=a["headers"],
        json={"plateNumber": "30A-111.11"},
    )
    v2 = (await client.post(
        "/api/v1/driver/vehicles", headers=b["headers"],
        json={"plateNumber": "30A-222.22"},
    )).json()
    resp = await client.patch(
        f"/api/v1/driver/vehicles/{v2['id']}", headers=b["headers"],
        json={"plateNumber": "30A-111.11"},
    )
    assert resp.status_code == 409
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_driver_api.py::test_second_driver_cannot_register_same_plate tests/test_driver_api.py::test_update_vehicle_to_taken_plate_409 -v
```

Expected: `test_second_driver_cannot_register_same_plate` fails (currently returns 201).

- [ ] **Step 3: Update `add_vehicle` in `driver_service.py:161-186`**

Before creating the `DriverVehicle` row, add a check:

```python
taken = (
    await db.execute(
        select(DriverVehicle.id).where(
            DriverVehicle.plate_normalized == normalized,
            DriverVehicle.driver_id != driver_id,
        )
    )
).scalar_one_or_none()
if taken is not None:
    raise conflict("Plate already registered by another account")
```

Keep the existing `IntegrityError` catch as a race-condition backstop. Update its message to "Plate already registered".

- [ ] **Step 4: Update `update_vehicle` in `driver_service.py:189-209`**

Same pre-check when `normalize_plate(plate_number)` differs from the current `v.plate_normalized`.

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_driver_api.py -v -k "vehicle"
```

Expected: all vehicle tests pass including new ones.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/driver_service.py backend/tests/test_driver_api.py
git commit -m "feat: enforce global plate uniqueness in vehicle registration (GAP-BE-002)"
```

---

### Task 3: Vehicle sharing — schema, service, API, tests

**Files:**
- Modify: `backend/app/schemas/driver.py` (add share schemas)
- Modify: `backend/app/services/driver_service.py` (add share CRUD + `plates_for_driver`)
- Create: `backend/app/api/v1/driver/shares.py` (share endpoints)
- Modify: `backend/app/api/v1/__init__.py` (register shares router)
- Test: `backend/tests/test_driver_api.py` (share tests)

**Interfaces:**
- Consumes: `DriverVehicle`, `DriverVehicleShare`, `DriverUser` models (Task 1), `platform_session`, `not_found`, `conflict`, `forbidden`
- Produces:
  - `VehicleShareIn(shared_with_email: EmailStr, share_date: date)` schema
  - `VehicleShareOut(id, vehicle_id, plate_number, shared_with_id, shared_with_name, share_date, created_at)` schema
  - `create_share(driver_id, vehicle_id, shared_with_email, share_date) -> DriverVehicleShare`
  - `list_shares(driver_id, vehicle_id) -> list[DriverVehicleShare]`
  - `delete_share(driver_id, share_id) -> None`
  - `list_shared_with_me(driver_id) -> list[DriverVehicleShare]`
  - `plates_for_driver(driver_id: UUID) -> set[str]` — owned plates ∪ today's shared plates (used by Tasks 4, 5)

- [ ] **Step 1: Write failing tests in `test_driver_api.py`**

```python
async def test_share_vehicle_roundtrip(client):
    """Owner shares vehicle with another driver for today; recipient
    appears in shares list; owner can revoke."""
    owner, recipient = await driver(client), await driver(client)
    v = (await client.post(
        "/api/v1/driver/vehicles", headers=owner["headers"],
        json={"plateNumber": "51G-100.00"},
    )).json()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    resp = await client.post(
        f"/api/v1/driver/vehicles/{v['id']}/shares",
        headers=owner["headers"],
        json={"sharedWithEmail": recipient["email"], "shareDate": today},
    )
    assert resp.status_code == 201
    share = resp.json()
    assert share["shareDate"] == today

    # List shares
    lst = (await client.get(
        f"/api/v1/driver/vehicles/{v['id']}/shares", headers=owner["headers"],
    )).json()
    assert len(lst) == 1

    # Recipient sees shared vehicles
    shared = (await client.get(
        "/api/v1/driver/shared-vehicles", headers=recipient["headers"],
    )).json()
    assert len(shared) == 1

    # Revoke
    assert (await client.delete(
        f"/api/v1/driver/vehicles/{v['id']}/shares/{share['id']}",
        headers=owner["headers"],
    )).status_code == 200


async def test_share_past_date_rejected(client):
    owner, recipient = await driver(client), await driver(client)
    v = (await client.post(
        "/api/v1/driver/vehicles", headers=owner["headers"],
        json={"plateNumber": "51G-200.00"},
    )).json()
    resp = await client.post(
        f"/api/v1/driver/vehicles/{v['id']}/shares",
        headers=owner["headers"],
        json={"sharedWithEmail": recipient["email"], "shareDate": "2020-01-01"},
    )
    assert resp.status_code == 422 or resp.status_code == 400


async def test_non_owner_cannot_share(client):
    owner, stranger = await driver(client), await driver(client)
    recipient = await driver(client)
    v = (await client.post(
        "/api/v1/driver/vehicles", headers=owner["headers"],
        json={"plateNumber": "51G-300.00"},
    )).json()
    resp = await client.post(
        f"/api/v1/driver/vehicles/{v['id']}/shares",
        headers=stranger["headers"],
        json={"sharedWithEmail": recipient["email"], "shareDate": "2030-01-01"},
    )
    assert resp.status_code == 404


async def test_share_cascade_on_vehicle_delete(client):
    owner, recipient = await driver(client), await driver(client)
    v = (await client.post(
        "/api/v1/driver/vehicles", headers=owner["headers"],
        json={"plateNumber": "51G-400.00"},
    )).json()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    await client.post(
        f"/api/v1/driver/vehicles/{v['id']}/shares",
        headers=owner["headers"],
        json={"sharedWithEmail": recipient["email"], "shareDate": today},
    )
    await client.delete(f"/api/v1/driver/vehicles/{v['id']}", headers=owner["headers"])
    shared = (await client.get(
        "/api/v1/driver/shared-vehicles", headers=recipient["headers"],
    )).json()
    assert shared == []
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_driver_api.py -v -k "share"
```

Expected: all 4 share tests fail (endpoints don't exist yet).

- [ ] **Step 3: Add schemas in `schemas/driver.py`**

After `DriverVehicleOut`:

```python
class VehicleShareIn(CamelModel):
    shared_with_email: EmailStr
    share_date: date  # from datetime import date

class VehicleShareOut(CamelModel):
    id: uuid.UUID
    vehicle_id: uuid.UUID
    plate_number: str
    shared_with_id: uuid.UUID
    shared_with_name: str
    share_date: date
    created_at: datetime
```

- [ ] **Step 4: Add share service functions in `driver_service.py`**

After `delete_vehicle`:

- `create_share(driver_id, vehicle_id, shared_with_email, share_date) -> DriverVehicleShare` — verify vehicle belongs to `driver_id` (else `not_found("vehicle", vehicle_id)`), resolve email to `DriverUser` (else `not_found("driver", shared_with_email)`), reject past dates (`share_date < date.today()` → `conflict("Share date must be today or later")`), insert row, catch `IntegrityError` for duplicate → `conflict("Already shared for this date")`.
- `list_shares(driver_id, vehicle_id) -> list[DriverVehicleShare]` — verify ownership (else `not_found`), return shares ordered by `share_date`.
- `delete_share(driver_id, vehicle_id, share_id) -> None` — verify ownership of vehicle (else `not_found("vehicle", vehicle_id)`), delete share row (else `not_found("share", share_id)` if the share doesn't belong to that vehicle).
- `list_shared_with_me(driver_id) -> list[dict]` — join `DriverVehicleShare` + `DriverVehicle` + `DriverUser` (owner) where `shared_with_id == driver_id` and `share_date >= date.today()`, return rows with `vehicle_id`, `plate_number`, `share_date`, owner's `full_name` (as `shared_with_name` is recipient's name shown to the owner; for this endpoint add an analogous field `owner_name` — adjust `VehicleShareOut` usage: this endpoint returns a distinct lightweight shape, so define `SharedVehicleOut(vehicle_id, plate_number, owner_name, share_date)` in `schemas/driver.py` instead of reusing `VehicleShareOut`).
- `plates_for_driver(driver_id) -> set[str]` — union of owned `plate_normalized` values and shared plates where `share_date == date.today()`.

- [ ] **Step 5: Create `api/v1/driver/shares.py`**

Router prefix `/driver/vehicles/{vehicle_id}/shares` for owner operations, plus a standalone `GET /driver/shared-vehicles` for recipients (use a second router or a plain path on the same `APIRouter` without the `{vehicle_id}` prefix segment). All require `require_driver` dependency (reuse pattern from `api/v1/driver/vehicles.py`).

- `POST /{vehicle_id}/shares` → 201 `VehicleShareOut`, calls `create_share`
- `GET /{vehicle_id}/shares` → `list[VehicleShareOut]`, calls `list_shares`
- `DELETE /{vehicle_id}/shares/{share_id}` → `MessageOut`, calls `delete_share`
- `GET /driver/shared-vehicles` → `list[SharedVehicleOut]`, calls `list_shared_with_me`

- [ ] **Step 6: Register router in `api/v1/__init__.py`**

```python
from app.api.v1.driver import shares as driver_shares
api_v1.include_router(driver_shares.router, dependencies=_driver_csrf)
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_driver_api.py -v -k "share"
```

Expected: all 4 share tests pass.

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/driver.py backend/app/services/driver_service.py \
    backend/app/api/v1/driver/shares.py backend/app/api/v1/__init__.py \
    backend/tests/test_driver_api.py
git commit -m "feat: add vehicle sharing by date (GAP-BE-002)"
```

---

### Task 4: Session and payment queries use shared plates

**Files:**
- Modify: `backend/app/api/v1/driver/sessions.py:17-18` (`_plates` function)
- Modify: `backend/app/services/payment_service.py:155-165` (`_resolve_session` ownership check)
- Test: `backend/tests/test_driver_api.py` (session visibility for shared plates)

**Interfaces:**
- Consumes: `plates_for_driver(driver_id) -> set[str]` from Task 3, `DriverVehicleShare` model from Task 1
- Produces: updated `_plates()` and `_resolve_session()` that accept shared plates

- [ ] **Step 1: Write failing tests**

In `test_driver_api.py`:

```python
async def test_shared_driver_sees_session(client, listed_site, admin_engine):
    """Recipient of a share for today sees owner's active session."""
    owner, recipient = await driver(client), await driver(client)
    await client.post(
        "/api/v1/driver/vehicles", headers=owner["headers"],
        json={"plateNumber": "51G-500.00"},
    )
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    v = (await client.get("/api/v1/driver/vehicles", headers=owner["headers"])).json()[0]
    await client.post(
        f"/api/v1/driver/vehicles/{v['id']}/shares",
        headers=owner["headers"],
        json={"sharedWithEmail": recipient["email"], "shareDate": today},
    )
    await access_event(
        admin_engine, listed_site["tenant_id"], listed_site["id"], "51G50000", "entry"
    )
    sessions = (
        await client.get("/api/v1/driver/sessions/active", headers=recipient["headers"])
    ).json()
    assert len(sessions) == 1
    assert sessions[0]["plateNumber"] == "51G50000"


async def test_unshared_driver_cannot_see_session(client, listed_site, admin_engine):
    """Driver without a share for today cannot see the session."""
    owner, stranger = await driver(client), await driver(client)
    await client.post(
        "/api/v1/driver/vehicles", headers=owner["headers"],
        json={"plateNumber": "51G-600.00"},
    )
    await access_event(
        admin_engine, listed_site["tenant_id"], listed_site["id"], "51G60000", "entry"
    )
    sessions = (
        await client.get("/api/v1/driver/sessions/active", headers=stranger["headers"])
    ).json()
    assert sessions == []
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_driver_api.py::test_shared_driver_sees_session tests/test_driver_api.py::test_unshared_driver_cannot_see_session -v
```

Expected: `test_shared_driver_sees_session` fails (shared plates not included in query).

- [ ] **Step 3: Update `_plates()` in `api/v1/driver/sessions.py`**

Replace the current implementation:

```python
from app.services.driver_service import plates_for_driver

async def _plates(driver_id) -> set[str]:
    return await plates_for_driver(driver_id)
```

- [ ] **Step 4: Update `_resolve_session` in `payment_service.py:155-165`**

After the existing `DriverVehicle` ownership check fails (`owned is None`), add a fallback before raising `not_found`:

```python
if owned is None:
    from app.models import DriverVehicleShare
    from datetime import date
    share = (
        await db.execute(
            select(DriverVehicleShare.id)
            .join(DriverVehicle, DriverVehicle.id == DriverVehicleShare.vehicle_id)
            .where(
                DriverVehicleShare.shared_with_id == driver_id,
                DriverVehicle.plate_normalized == plate_norm,
                DriverVehicleShare.share_date == date.today(),
            )
        )
    ).scalar_one_or_none()
    if share is None:
        raise not_found("session", session_ref) from None
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_driver_api.py -v -k "session"
```

Expected: all session tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/driver/sessions.py backend/app/services/payment_service.py \
    backend/tests/test_driver_api.py
git commit -m "feat: session and payment queries include shared plates (GAP-BE-002)"
```

---

### Task 5: WebSocket subscribes to shared plate channels

**Files:**
- Modify: `backend/app/api/v1/ws.py:131-148` (replace inline plate query)

**Interfaces:**
- Consumes: `plates_for_driver(driver_id) -> set[str]` from Task 3
- Produces: WS subscribes to channels for owned + today's shared plates

- [ ] **Step 1: Update `/ws/driver/sessions` handler in `ws.py`**

Replace the current inline plate-loading block (lines 131-147, which imports `select`, `platform_session`, `DriverVehicle` and queries `DriverVehicle.plate_normalized` directly) with:

```python
from app.services.driver_service import plates_for_driver

plates = await plates_for_driver(driver_id)
```

Remove the now-unused local imports if nothing else in the function needs them.

- [ ] **Step 2: Run full backend suite**

```bash
cd backend && python -m pytest -v
```

Expected: all tests pass. Note: a share created while the recipient's WS connection is already open won't add that plate's channel until the client reconnects — accepted limitation (documented in Review Focus item 5).

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/v1/ws.py
git commit -m "feat: WS subscribes to shared plate channels (GAP-BE-002)"
```

---

### Task 6: Update stale test assertions and documentation

**Files:**
- Modify: `backend/tests/test_driver_api.py` (verify no stale assertions remain)
- Modify: `docs/backend.md:230` (update data model description)

**Interfaces:**
- Consumes: all Tasks 1-5 completed
- Produces: consistent test suite, updated documentation

- [ ] **Step 1: Search for stale assertions**

Run `grep -rn "may share a plate\|hai driver có thể" backend/tests/ docs/` and confirm the only remaining references are the ones already updated in Task 2 (the old test was replaced, not left alongside the new one).

- [ ] **Step 2: Update `docs/backend.md` line 230**

Change the sentence "Driver vehicle unique theo `(driver_id, plate_normalized)`, **hai driver có thể khai cùng biển số**. Driver session được truy ra theo biển số đã khai, không có quy trình chứng minh quyền sở hữu xe trong flow đăng ký xe hiện tại." to: "Driver vehicle unique theo `plate_normalized` toàn hệ thống — mỗi biển số chỉ thuộc một tài khoản. Chủ xe có thể chia sẻ quyền xem/thanh toán cho tài khoản khác theo ngày cụ thể qua bảng `driver_vehicle_shares`."

Also update `docs/backend.md:647` ("Chứng minh sở hữu biển số driver; hai tài khoản có thể chia sẻ plate theo thiết kế hiện tại.") to remove it from the "not a complete feature" list, since it is now enforced.

- [ ] **Step 3: Run full test suite**

```bash
cd backend && python -m pytest -v
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_driver_api.py docs/backend.md
git commit -m "docs: update plate ownership model documentation (GAP-BE-002)"
```

---

## Self-Review Notes

**Spec coverage:** All spec sections map to tasks — global uniqueness (Task 1-2), shares table (Task 1), sharing API (Task 3), session/payment queries (Task 4), WS (Task 5), migration cleanup (Task 1 step 1), documentation (Task 6). Edge client and tenant admin scopes are explicitly unchanged per spec — no task touches `api/v1/tenant/` or `api/v1/edge.py`.

**Type consistency:** `plates_for_driver(driver_id: uuid.UUID) -> set[str]` is defined once in Task 3 and consumed identically in Tasks 4 and 5. `DriverVehicleShare` fields (`vehicle_id`, `shared_with_id`, `share_date`) are consistent across Tasks 1, 3, 4, 5.

**Review Focus coverage:** All 5 items have an owning task and test (cascade delete → Task 3 step 1 `test_share_cascade_on_vehicle_delete`; past date → Task 3 step 1 `test_share_past_date_rejected`; plate-taken on update → Task 2 step 1 `test_update_vehicle_to_taken_plate_409`; concurrent race → existing `IntegrityError` backstop, Task 2 step 3; WS reconnect limitation → documented, not testable without a live socket in this suite).
