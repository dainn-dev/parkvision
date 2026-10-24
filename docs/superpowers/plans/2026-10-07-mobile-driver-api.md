# Mobile Driver API (Phase 1: Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every mock in `mobile/` with real backend data by adding a driver-facing API surface (driver accounts, vehicles, favorites, parking sessions, public site discovery) to `backend/`.

**Architecture:** Backend gains a new actor type `driver` (own table `driver_users`, reuses `user_sessions` + JWT + refresh rotation from `auth_service`), bearer-token auth (no cookies/CSRF), and routers under `/api/v1/driver/*` plus unauthenticated `/api/v1/public/sites*`. Parking "sessions" are derived from `access_events` (ANPR entry/exit) matched to the driver's plates — no new session table. Mobile gets a thin `fetch` client with token refresh, typed API modules, and React hooks; `mockTenants.ts`, the realtime simulator and all `setTimeout` fake flows are deleted. Features with no backend yet (wallet, membership purchase, data export) keep their UI but render an empty/"coming soon" state.

**Tech Stack:** FastAPI 0.115 + SQLAlchemy 2 async + Alembic (backend); React 19 + Vite 6 + TypeScript 5.8 + Tailwind 4 (mobile); vitest for mobile unit tests (new dev dep).

**Spec:** No written spec exists. Decisions fixed with the user on 2026-10-07:
1. Scope = full driver API, delivered as three plans. This document is Phase 1 (core). Phase 2 = memberships, Phase 3 = wallet/payments/pricing — see "Follow-up plans" at the end; they need a business spec first.
2. Features without backend keep UI but show empty/disabled state (no fake data).
3. Driver auth = email/password via backend (bearer tokens). Google button removed. "Continue as guest" stays as browse-only mode (public endpoints need no auth).

## Global Constraints

- Backend Python ≥ 3.10, deps pinned in `backend/pyproject.toml`; no new backend deps.
- Backend API responses use `CamelModel` (camelCase JSON) from `app/schemas/common.py`; errors go through `app/core/errors.py` helpers; lists use `Page[T]`/`paginate`.
- Driver endpoints authenticate with `Authorization: Bearer <access>` only — never cookies. `csrf_protect` already skips requests carrying an `authorization` header.
- New driver tables are platform-scoped (no `tenant_id`, no RLS policy). Driver code that reads tenant tables (`tenant_sites`, `access_events`, `parking_levels`, `parking_zones`, `vehicle_presences`) must use `platform_session()` exactly like `app/api/v1/public.py` does.
- Plate matching always uses `normalize_plate()` from `app/services/event_service.py` (`re.sub(r"[^A-Z0-9]", "", plate.upper())`); the SQL equivalent is `func.regexp_replace(func.upper(col), '[^A-Z0-9]', '', 'g')`.
- Rate limits: `rate_limited("driver_register", 5, 60)`, `rate_limited("driver_login", 5, 60)` (same budget as tenant login).
- Backend tests run with `cd backend && pytest tests/test_driver_api.py -v` against compose Postgres/Redis on localhost (see `tests/conftest.py` header; needs `RATE_LIMIT_ENABLED=false`, which conftest sets).
- Mobile: `npm run lint` (`tsc --noEmit`) must pass; `npx vitest run` must pass.
- Mobile env: `VITE_API_BASE_URL` (default `/api/v1`); Vite dev proxy `/api` → `http://localhost:8000`. No `GEMINI_API_KEY`.
- Mobile token storage keys: `pv_driver_access`, `pv_driver_refresh` (localStorage).
- Site capacity status thresholds (unchanged from mobile): `FULL` if available ≤ 0; `AVAILABLE` if available/total > 0.3; `LIMITED` if ≥ 0.1; else `ALMOST_FULL`.
- Public discovery radius default 5 km, max 50 km; max 200 sites per response.

## Review Focus

1. **Refresh-token reuse by a driver** — `refresh_session()` currently loads only `TenantUser`/`PlatformAdmin`; a driver session must refresh correctly and reuse-detection must still revoke the family. Test in Task 3.
2. **Driver registering a plate already registered by another driver** — plates are not globally unique (two drivers may share a car); uniqueness is per driver only. Test in Task 4. **Superseded by GAP-BE-002 (2026-10-23, `docs/superpowers/specs/2026-10-23-plate-ownership-design.md`): plates are now globally unique across all drivers** (`UniqueConstraint("plate_normalized")`, migration `0019_plate_ownership`); a second driver registering an already-claimed plate gets 409, not 201. See the updated test below.
3. **Active-session derivation when the latest event is an `exit`** — must return `null`, not the stale entry; also a `deny` decision must never start a session. Test in Task 6.
4. **Public site list with a site lacking lat/lng** — site is still returned when no `lat/lng` query is given, and excluded (not crashing) when radius filtering is requested. Test in Task 5.
5. **Mobile 401 during token refresh race** — two concurrent 401s must trigger exactly one refresh call and both requests retry with the new token. Test in Task 8.

---

## File Structure

**Backend (create):**
- `backend/migrations/versions/0015_driver_accounts.py` — `driver_users`, `driver_vehicles`, `driver_favorites`, `tenant_sites.public_profile`.
- `backend/app/schemas/driver.py` — all driver/public-site Pydantic models.
- `backend/app/services/driver_service.py` — register/login/profile/vehicles/favorites.
- `backend/app/services/driver_session_service.py` — derive active/history sessions from `access_events`.
- `backend/app/services/public_site_service.py` — site discovery query + distance + status.
- `backend/app/api/v1/driver/__init__.py`, `auth.py`, `vehicles.py`, `favorites.py`, `sessions.py`.
- `backend/tests/test_driver_api.py`.

**Backend (modify):**
- `backend/app/models.py` — `DriverUser`, `DriverVehicle`, `DriverFavorite`, `TenantSite.public_profile`.
- `backend/app/core/enums.py` — `ActorType.DRIVER = "driver"`.
- `backend/app/api/deps.py` — `require_driver`.
- `backend/app/services/auth_service.py` — `_load_user()` helper so refresh/logout/change_password handle drivers.
- `backend/app/api/v1/public.py` — `GET /public/sites`, `GET /public/sites/{site_id}`.
- `backend/app/api/v1/__init__.py` — include driver routers.
- `backend/app/schemas/resources.py` — `SiteIn/SiteOut.public_profile` so tenant admins can edit the listing.

**Mobile (create):**
- `mobile/src/lib/api.ts` — fetch client, token store, refresh-once.
- `mobile/src/lib/capacity.ts` — `getCapacityStatus` (moved from mock).
- `mobile/src/lib/location.ts` — `DEFAULT_USER_LOCATION`, `haversineMeters`.
- `mobile/src/api/public.ts`, `mobile/src/api/driver.ts` — typed endpoint functions + `mapSite()`.
- `mobile/src/hooks/useAuth.tsx`, `useSites.ts`, `useActiveSession.ts`, `useVehicles.ts`, `useFavorites.ts`, `useParkingHistory.ts`.
- `mobile/src/lib/__tests__/api.test.ts`, `mobile/src/api/__tests__/mapSite.test.ts`.
- `mobile/vitest.config.ts`.

**Mobile (delete):**
- `mobile/src/data/mockTenants.ts`, `mobile/src/components/discover/RealtimeSimControl.tsx`.

**Mobile (modify):** `App.tsx`, `types.ts`, `LoginScreen.tsx`, `ProfileScreen.tsx`, `MyParkingScreen.tsx`, `FindMyVehicleModal.tsx`, `TenantDetailModal.tsx`, `ParkingSearchBar.tsx`, `MembershipModal.tsx`, `MembershipsScreen.tsx`, `PaymentEWalletModal.tsx`, `SecurityPrivacyModal.tsx`, `NotificationSettingsModal.tsx`, `i18n/translations.ts`, `vite.config.ts`, `package.json`, `.env.example`, `README.md`, `metadata.json`.

---

### Task 1: Schema — driver tables + site public profile

**Files:**
- Create: `backend/migrations/versions/0015_driver_accounts.py`
- Modify: `backend/app/models.py` (append after `RegisteredVehicle`), `backend/app/core/enums.py:9-13`
- Test: `backend/tests/test_driver_api.py`

**Interfaces:**
- Produces models:
  - `DriverUser(TimestampMixin, Base)` table `driver_users`: `id uuid pk`, `email String(320) unique`, `password_hash String(255)`, `full_name String(200)`, `phone String(50) | None`, `avatar_url Text | None`, `status String(30) default "active"`, `failed_login_attempts Integer default 0`, `locked_until DateTime | None`, `last_login_at DateTime | None`.
  - `DriverVehicle(TimestampMixin, Base)` table `driver_vehicles`: `id`, `driver_id FK driver_users.id CASCADE`, `plate_number String(20)`, `plate_normalized String(20)`, `label String(120) | None`, `vehicle_type String(20) default "car"`, `is_primary Boolean default False`; `UniqueConstraint("driver_id", "plate_normalized", name="uq_driver_vehicle_plate")`.
  - `DriverFavorite(Base)` table `driver_favorites`: composite pk `(driver_id FK CASCADE, site_id FK tenant_sites.id CASCADE)`, `created_at`.
  - `TenantSite.public_profile: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)`.
- Produces `ActorType.DRIVER = "driver"`.
- `public_profile` JSON shape (documented in model docstring, validated in Task 5 schema `SitePublicProfile`): `{listed: bool, description: str|null, imageUrl: str|null, parkingType: "indoor"|"outdoor"|"covered"|null, facilities: list[str], pricing: {hourlyFrom, dailyFrom, overnightFrom, monthlyFrom} (ints VND, nullable)}`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_driver_api.py
import pytest
from sqlalchemy import text

@pytest.mark.asyncio
async def test_driver_tables_exist(admin_engine):
    async with admin_engine.connect() as conn:
        for t in ("driver_users", "driver_vehicles", "driver_favorites"):
            assert (await conn.execute(text(
                "SELECT 1 FROM information_schema.tables WHERE table_name=:t"), {"t": t})).scalar() == 1
        assert (await conn.execute(text(
            "SELECT 1 FROM information_schema.columns WHERE table_name='tenant_sites' AND column_name='public_profile'"
        ))).scalar() == 1
```

- [ ] **Step 2: Run to verify it fails** — `pytest tests/test_driver_api.py::test_driver_tables_exist -v` → FAIL (assert None == 1).
- [ ] **Step 3: Write migration `0015_driver_accounts` (`down_revision = "0014_security_alerts"`)** creating the three tables (server defaults as in 0014 style, `ix_driver_vehicles_driver` on `driver_id`, `ix_driver_vehicles_plate` on `plate_normalized`), and `op.add_column("tenant_sites", sa.Column("public_profile", JSONB, nullable=False, server_default="{}"))`. Do **not** add RLS to driver tables. Downgrade reverses.
- [ ] **Step 4: Add models + enum member** per Interfaces.
- [ ] **Step 5: Run test** → PASS. Also `pytest tests/test_schema_alignment.py -v` → PASS (it compares models to migrated schema).
- [ ] **Step 6: Commit** — `feat(backend): driver accounts schema + site public profile`

---

### Task 2: Driver schemas + `require_driver` dependency

**Files:**
- Create: `backend/app/schemas/driver.py`
- Modify: `backend/app/api/deps.py` (after `require_tenant_user`)
- Test: `backend/tests/test_driver_api.py`

**Interfaces (all `CamelModel`):**
- `DriverRegisterIn(email: EmailStr, password: str = Field(min_length=8, max_length=200), full_name: str = Field(min_length=1, max_length=200), phone: str | None = None)`
- `DriverLoginIn(email: EmailStr, password: str)`
- `DriverRefreshIn(refresh_token: str)`
- `DriverTokenOut(access_token: str, refresh_token: str, expires_in: int, token_type: str = "bearer")`
- `DriverOut(id, email, full_name, phone, avatar_url, status, created_at)`
- `DriverUpdateIn(full_name: str | None, phone: str | None, avatar_url: str | None)` (all optional)
- `DriverPasswordIn(current_password: str, new_password: str = Field(min_length=8, max_length=200))`
- `DriverVehicleIn(plate_number: str = Field(min_length=4, max_length=20), label: str | None = Field(None, max_length=120), vehicle_type: Literal["car","motorcycle"] = "car", is_primary: bool = False)`
- `DriverVehicleOut(id, plate_number, plate_normalized, label, vehicle_type, is_primary, created_at)`
- `SitePricing(hourly_from: int | None, daily_from: int | None, overnight_from: int | None, monthly_from: int | None)`
- `SitePublicProfile(listed: bool = True, description: str | None, image_url: str | None, parking_type: Literal["indoor","outdoor","covered"] | None, facilities: list[str] = [], pricing: SitePricing = SitePricing())`
- `PublicSiteOut(id, tenant_id, tenant_slug: str, name, address, city, latitude, longitude, distance_meters: int | None, capacity: int, occupied: int, available: int, capacity_status: Literal["AVAILABLE","LIMITED","ALMOST_FULL","FULL"], operating_hours: dict, contact_phone, profile: SitePublicProfile, is_favorite: bool = False, updated_at: datetime)`
- `PublicSiteDetailOut(PublicSiteOut)` + `levels: list[PublicMapLevelOut]` (reuse from `app/schemas/resources.py`).
- `DriverSessionOut(id: str, site_id, site_name, tenant_slug, plate_number, entered_at: datetime, exited_at: datetime | None, duration_seconds: int, status: Literal["PARKED","COMPLETED"], entry_image_url: str | None, confidence: float | None, level_name: str | None, zone_name: str | None)`
- `require_driver(auth: AuthContext = Depends(get_auth_context)) -> AuthContext` — raises `forbidden("Driver account required")` unless `auth.user_type == ActorType.DRIVER`.

- [ ] **Step 1: Tests**

```python
def test_vehicle_in_rejects_short_plate():
    from app.schemas.driver import DriverVehicleIn
    with pytest.raises(ValidationError):
        DriverVehicleIn(plate_number="51A")

def test_site_profile_defaults():
    from app.schemas.driver import SitePublicProfile
    p = SitePublicProfile()
    assert p.listed is True and p.facilities == [] and p.pricing.hourly_from is None
```

- [ ] **Step 2: Run** → FAIL (ModuleNotFoundError).
- [ ] **Step 3: Implement `schemas/driver.py` and `require_driver`.**
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `feat(backend): driver schemas and auth dependency`

---

### Task 3: Driver auth — register/login/refresh/logout/me/password

**Files:**
- Create: `backend/app/services/driver_service.py`, `backend/app/api/v1/driver/__init__.py`, `backend/app/api/v1/driver/auth.py`
- Modify: `backend/app/services/auth_service.py` (refresh_session:573-583, logout, change_password:720-723), `backend/app/api/v1/__init__.py`
- Test: `backend/tests/test_driver_api.py`

**Interfaces:**
- `auth_service._load_user(db, user_type: str, user_id: uuid.UUID) -> TenantUser | PlatformAdmin | DriverUser | None` — single dispatch used by `refresh_session`, `change_password`, and the reuse-alert email lookup. `_bundle(...)` gets `role=getattr(user, "role", None)`.
- `driver_service.register(email, password, full_name, phone) -> DriverUser` (409 `conflict("Email already registered")` on IntegrityError; email lowercased).
- `driver_service.login(email, password, ip, ua) -> TokenBundle` — verify_password, lockout after 5 failures for 15 min (same constants as tenant login; reuse `account_locked()`), creates `UserSession` via `auth_service._create_session(user_type="driver", tenant_id=None, mfa_verified=False)`, sets `last_login_at`.
- `driver_service.get_me(driver_id) -> DriverUser`, `update_me(driver_id, **fields) -> DriverUser`.
- Router `router = APIRouter(prefix="/driver/auth", tags=["driver"])`:
  - `POST /register` → 201 `DriverTokenOut` (auto-login), rate_limited `driver_register`
  - `POST /login` → `DriverTokenOut`, rate_limited `driver_login`
  - `POST /refresh` body `DriverRefreshIn` → `DriverTokenOut` (calls `auth_service.refresh_session`)
  - `POST /logout` (require_driver) → `MessageOut`
  - `GET /me` (require_driver) → `DriverOut`; `PATCH /me` → `DriverOut`
  - `POST /password` (require_driver) body `DriverPasswordIn` → `MessageOut` (calls `auth_service.change_password(user_id, "driver", ...)`)
  - `GET /sessions` (require_driver) → `list[SessionOut]`; `DELETE /sessions/{id}` → `MessageOut` (reuse existing `auth_service.list_sessions`/revoke logic filtered by `user_type == "driver"`).
- `api_v1.include_router(driver_auth.router)` in `app/api/v1/__init__.py`.

- [ ] **Step 1: Tests** (helper `async def driver(client) -> dict` registers a fresh `drv-<hex>@example.com` / `Password!123` and returns tokens + `headers={"Authorization": f"Bearer {access}"}`; add it to `tests/conftest.py`)

```python
async def test_driver_register_login_me(client):
    d = await driver(client)
    me = await client.get("/api/v1/driver/auth/me", headers=d["headers"])
    assert me.status_code == 200 and me.json()["email"] == d["email"]

async def test_driver_duplicate_email_409(client):
    d = await driver(client)
    r = await client.post("/api/v1/driver/auth/register", json={"email": d["email"], "password": "Password!123", "fullName": "X"})
    assert r.status_code == 409

async def test_driver_refresh_rotates_and_reuse_revokes(client):
    # Mirrors tests/test_auth.py::test_refresh_rotates_and_reuse_revokes, bearer-style.
    import app.services.auth_service as svc
    d = await driver(client)
    r1 = await client.post("/api/v1/driver/auth/refresh", json={"refreshToken": d["refresh"]})
    assert r1.status_code == 200 and r1.json()["refreshToken"] != d["refresh"]
    svc.REUSE_GRACE_SECONDS = 0
    try:
        r2 = await client.post("/api/v1/driver/auth/refresh", json={"refreshToken": d["refresh"]})  # replay
        assert r2.status_code == 401
    finally:
        svc.REUSE_GRACE_SECONDS = 60
    r3 = await client.post("/api/v1/driver/auth/refresh", json={"refreshToken": r1.json()["refreshToken"]})
    assert r3.status_code == 401  # whole family revoked

async def test_tenant_user_cannot_call_driver_me(client, tenant):
    await login(client, tenant["email"], tenant["password"])
    assert (await client.get("/api/v1/driver/auth/me")).status_code == 403

async def test_driver_cannot_call_tenant_api(client, tenant):
    d = await driver(client)
    r = await client.get(f"/api/v1/tenants/{tenant['tenant_id']}/sites", headers=d["headers"])
    assert r.status_code == 403
```

- [ ] **Step 2: Run** → FAIL (404s).
- [ ] **Step 3: Implement** `_load_user`, driver_service, router, include_router. In `refresh_session`, replace the two `if/else` user loads and the alert-email lookup with `_load_user`.
- [ ] **Step 4: Run** `pytest tests/test_driver_api.py tests/test_auth.py -v` → PASS (tenant auth must remain green).
- [ ] **Step 5: Commit** — `feat(backend): driver auth endpoints with shared session/refresh machinery`

---

### Task 4: Driver vehicles + favorites

**Files:**
- Create: `backend/app/api/v1/driver/vehicles.py`, `backend/app/api/v1/driver/favorites.py`
- Modify: `backend/app/services/driver_service.py`, `backend/app/api/v1/__init__.py`
- Test: `backend/tests/test_driver_api.py`

**Interfaces:**
- `driver_service.list_vehicles(driver_id) -> list[DriverVehicle]` (primary first, then created_at)
- `driver_service.add_vehicle(driver_id, body: DriverVehicleIn) -> DriverVehicle` — stores `plate_normalized = normalize_plate(plate_number)`; if `is_primary` or it's the driver's first vehicle, clears `is_primary` on the others; 409 `conflict("Plate already added")` on unique violation.
- `driver_service.update_vehicle(driver_id, vehicle_id, body: DriverVehicleIn) -> DriverVehicle` (404 if not owned); `delete_vehicle(driver_id, vehicle_id) -> None`; deleting the primary promotes the oldest remaining.
- `driver_service.list_favorite_site_ids(driver_id) -> set[uuid.UUID]`; `add_favorite(driver_id, site_id)` (404 `not_found("site", site_id)` if site missing/inactive/unlisted; idempotent); `remove_favorite(driver_id, site_id)` (idempotent).
- Routers (prefix `/driver`, `dependencies=[Depends(require_driver)]`):
  - `GET /vehicles -> list[DriverVehicleOut]`, `POST /vehicles -> 201 DriverVehicleOut`, `PATCH /vehicles/{vehicle_id}`, `DELETE /vehicles/{vehicle_id} -> MessageOut`
  - `GET /favorites -> list[PublicSiteOut]` (uses Task 5 `public_site_service.sites_by_ids`), `PUT /favorites/{site_id} -> MessageOut`, `DELETE /favorites/{site_id} -> MessageOut`

- [ ] **Step 1: Tests**

```python
async def test_vehicle_crud_and_primary(client):
    d = await driver(client)
    v1 = (await client.post("/api/v1/driver/vehicles", headers=d["headers"], json={"plateNumber": "51A-123.45", "label": "Camry"})).json()
    assert v1["plateNormalized"] == "51A12345" and v1["isPrimary"] is True   # first vehicle auto-primary
    v2 = (await client.post("/api/v1/driver/vehicles", headers=d["headers"], json={"plateNumber": "51F-882.11", "isPrimary": True})).json()
    lst = (await client.get("/api/v1/driver/vehicles", headers=d["headers"])).json()
    assert [v["isPrimary"] for v in lst] == [True, False] and lst[0]["id"] == v2["id"]
    dup = await client.post("/api/v1/driver/vehicles", headers=d["headers"], json={"plateNumber": "51a12345"})
    assert dup.status_code == 409
    assert (await client.delete(f"/api/v1/driver/vehicles/{v2['id']}", headers=d["headers"])).status_code == 200
    assert (await client.get("/api/v1/driver/vehicles", headers=d["headers"])).json()[0]["isPrimary"] is True

async def test_second_driver_cannot_register_same_plate(client):
    # Superseded by GAP-BE-002 (2026-10-23): plates are globally unique, not
    # per-driver. This replaces the old test_two_drivers_may_share_a_plate,
    # which asserted 201/201 under the pre-2026-10-23 per-driver uniqueness
    # model and would fail against the current global constraint.
    a, b = await driver(client), await driver(client)
    assert (await client.post("/api/v1/driver/vehicles", headers=a["headers"], json={"plateNumber": "30A-000.01"})).status_code == 201
    assert (await client.post("/api/v1/driver/vehicles", headers=b["headers"], json={"plateNumber": "30A-000.01"})).status_code == 409

async def test_vehicle_not_owned_404(client):
    a, b = await driver(client), await driver(client)
    v = (await client.post("/api/v1/driver/vehicles", headers=a["headers"], json={"plateNumber": "30A-000.02"})).json()
    assert (await client.delete(f"/api/v1/driver/vehicles/{v['id']}", headers=b["headers"])).status_code == 404

async def test_favorites_roundtrip(client, listed_site):   # fixture from Task 5
    d = await driver(client)
    assert (await client.put(f"/api/v1/driver/favorites/{listed_site['id']}", headers=d["headers"])).status_code == 200
    favs = (await client.get("/api/v1/driver/favorites", headers=d["headers"])).json()
    assert [f["id"] for f in favs] == [str(listed_site["id"])] and favs[0]["isFavorite"] is True
    assert (await client.delete(f"/api/v1/driver/favorites/{listed_site['id']}", headers=d["headers"])).status_code == 200
    assert (await client.get("/api/v1/driver/favorites", headers=d["headers"])).json() == []
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(backend): driver vehicles and favorite sites`

---

### Task 5: Public site discovery

**Files:**
- Create: `backend/app/services/public_site_service.py`
- Modify: `backend/app/api/v1/public.py` (append; refactor `_tenant_by_slug` → also `_site_levels(db, tenant_id, site_id)` extracted from `public_parking_map` so both endpoints share it), `backend/app/schemas/resources.py:135-167` (`SiteIn.public_profile: SitePublicProfile | None`, `SiteOut.public_profile: dict`), `backend/app/api/v1/tenant/sites.py` (persist `public_profile` on create/patch — follow existing field handling there)
- Test: `backend/tests/test_driver_api.py`

**Interfaces:**
- `public_site_service.capacity_status(available: int, total: int) -> str` — thresholds from Global Constraints.
- `public_site_service.haversine_m(lat1, lng1, lat2, lng2) -> int`.
- `public_site_service.list_sites(db, *, lat: float | None, lng: float | None, radius_km: float, q: str | None, favorite_ids: set[uuid.UUID], limit: int = 200) -> list[PublicSiteOut]` — joins `TenantSite` ⨝ `Tenant` where `Tenant.status == "active"`, `TenantSite.status == "active"`, `public_profile->>'listed'` is not `'false'`; `q` does `ILIKE` on name/address/city; if `lat/lng` given: compute distance in Python after a bounding-box prefilter (`±radius/111 km` lat, `±radius/(111·cos lat)` lng), drop sites with null coords or beyond radius, sort by distance; else sort by name, `distance_meters=None`. `occupied = min(current_occupancy, capacity)`, `available = max(capacity - occupied, 0)`.
- `public_site_service.sites_by_ids(db, ids: list[uuid.UUID], favorite_ids) -> list[PublicSiteOut]`.
- `public_site_service.get_site(db, site_id) -> tuple[Tenant, TenantSite]` (404 if not active/listed).
- Endpoints (rate_limited `public-sites` 120/60):
  - `GET /public/sites?lat&lng&radiusKm=5&q=` → `list[PublicSiteOut]` (`radiusKm` `Query(5, gt=0, le=50)`). Optional bearer: if a valid driver token is present, `isFavorite` is filled (use a soft dependency `optional_driver(request) -> AuthContext | None` added to `deps.py` that returns `None` instead of raising when no/invalid token).
  - `GET /public/sites/{site_id}` → `PublicSiteDetailOut` with `levels` (zones + `occupied_count`, map_image presigned — the extracted `_site_levels`).
- Test fixture `listed_site(tenant, admin_engine) -> dict(id, tenant_id, slug, no_coords_id)` creating a `TenantSite(status="active", latitude=10.7328, longitude=106.7218, capacity=100, current_occupancy=65, public_profile={"listed": True, "parkingType": "indoor", "pricing": {"hourlyFrom": 20000}})`, plus a second listed site with `latitude=longitude=None` whose id is `no_coords_id`. Fixture `level_zone_for_site(listed_site, admin_engine)` adds one `ParkingLevel` + one `ParkingZone(capacity=10)` to the first site.

- [ ] **Step 1: Tests**

```python
def test_capacity_status_thresholds():
    from app.services.public_site_service import capacity_status as cs
    assert cs(0, 100) == "FULL" and cs(31, 100) == "AVAILABLE" and cs(10, 100) == "LIMITED" and cs(5, 100) == "ALMOST_FULL" and cs(5, 0) == "FULL"

async def test_public_sites_without_coords_returns_all_listed(client, listed_site):
    r = await client.get("/api/v1/public/sites")
    assert r.status_code == 200
    ids = [s["id"] for s in r.json()]
    assert str(listed_site["id"]) in ids and str(listed_site["no_coords_id"]) in ids
    assert all(s["distanceMeters"] is None for s in r.json())

async def test_public_sites_radius_filters_and_sorts(client, listed_site):
    r = await client.get("/api/v1/public/sites", params={"lat": 10.7324, "lng": 106.7210, "radiusKm": 2})
    body = r.json()
    assert [s["id"] for s in body] == [str(listed_site["id"])]            # no-coords site excluded
    assert 0 < body[0]["distanceMeters"] < 200 and body[0]["capacityStatus"] == "AVAILABLE"
    assert body[0]["available"] == 35 and body[0]["tenantSlug"] == listed_site["slug"]

async def test_public_sites_hides_unlisted_and_inactive_tenant(client, listed_site, admin_engine):
    # flip listed=false → gone; flip tenant status suspended → gone
    ...
    assert str(listed_site["id"]) not in [s["id"] for s in (await client.get("/api/v1/public/sites")).json()]

async def test_public_site_detail_has_levels(client, listed_site, level_zone_for_site):
    r = await client.get(f"/api/v1/public/sites/{listed_site['id']}")
    assert r.status_code == 200 and r.json()["levels"][0]["zones"][0]["occupiedCount"] == 0

async def test_public_sites_marks_favorites_for_driver(client, listed_site):
    d = await driver(client)
    await client.put(f"/api/v1/driver/favorites/{listed_site['id']}", headers=d["headers"])
    r = await client.get("/api/v1/public/sites", headers=d["headers"])
    assert next(s for s in r.json() if s["id"] == str(listed_site["id"]))["isFavorite"] is True
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pytest tests/test_driver_api.py tests/test_parking.py tests/test_resources_and_commands.py -v` → PASS.
- [ ] **Step 5: Commit** — `feat(backend): public site discovery with distance, capacity status and listing profile`

---

### Task 6: Driver parking sessions derived from access events

**Files:**
- Create: `backend/app/services/driver_session_service.py`, `backend/app/api/v1/driver/sessions.py`
- Modify: `backend/app/api/v1/__init__.py`
- Test: `backend/tests/test_driver_api.py`

**Interfaces:**
- `driver_session_service.active_sessions(db, plates: set[str]) -> list[DriverSessionOut]` — for each normalized plate, take the latest `AccessEvent` with `decision == "allow"` and `site_id IS NOT NULL` (normalized plate match via `regexp_replace`); if its `direction == "entry"`, build a `PARKED` session with `id = str(event.id)`, `entered_at = occurred_at`, `duration_seconds = now - occurred_at`, `entry_image_url = presign_download(plate_image_url or overview_image_url)` if set; enrich `level_name/zone_name` from `parking_service.locate_presence(db, tenant_id, plate)` when found. If latest is `exit` → no session.
- `driver_session_service.history(db, plates: set[str], page: int, limit: int) -> tuple[list[DriverSessionOut], int]` — pair each allowed `entry` with the next allowed `exit` for the same site+plate; `COMPLETED` rows only, newest first. Pairing is done in Python over the last 500 allowed events per plate (documented limit).
- Router (prefix `/driver`, require_driver): `GET /sessions/active -> list[DriverSessionOut]`, `GET /sessions/history?page=1&limit=20 -> Page[DriverSessionOut]`. Plates come from `driver_service.list_vehicles`.
- Test helper `async def access_event(admin_engine, tenant_id, site_id, plate, direction, decision="allow", at=None)` inserting an `AccessEvent` directly.

- [ ] **Step 1: Tests**

```python
async def test_active_session_after_entry(client, listed_site, admin_engine):
    d = await driver(client)
    await client.post("/api/v1/driver/vehicles", headers=d["headers"], json={"plateNumber": "51A-123.45"})
    await access_event(admin_engine, listed_site["tenant_id"], listed_site["id"], "51A12345", "entry")
    r = (await client.get("/api/v1/driver/sessions/active", headers=d["headers"])).json()
    assert len(r) == 1 and r[0]["status"] == "PARKED" and r[0]["siteId"] == str(listed_site["id"]) and r[0]["durationSeconds"] >= 0

async def test_no_active_session_after_exit_and_history_has_pair(client, listed_site, admin_engine):
    d = await driver(client)
    await client.post("/api/v1/driver/vehicles", headers=d["headers"], json={"plateNumber": "51A-123.45"})
    t0 = datetime.now(timezone.utc) - timedelta(hours=2)
    await access_event(admin_engine, listed_site["tenant_id"], listed_site["id"], "51A-123.45", "entry", at=t0)
    await access_event(admin_engine, listed_site["tenant_id"], listed_site["id"], "51A12345", "exit", at=t0 + timedelta(hours=1))
    assert (await client.get("/api/v1/driver/sessions/active", headers=d["headers"])).json() == []
    h = (await client.get("/api/v1/driver/sessions/history", headers=d["headers"])).json()
    assert h["meta"]["total"] == 1 and h["data"][0]["status"] == "COMPLETED" and h["data"][0]["durationSeconds"] == 3600

async def test_denied_entry_is_not_a_session(client, listed_site, admin_engine):
    d = await driver(client)
    await client.post("/api/v1/driver/vehicles", headers=d["headers"], json={"plateNumber": "51A-999.99"})
    await access_event(admin_engine, listed_site["tenant_id"], listed_site["id"], "51A99999", "entry", decision="deny")
    assert (await client.get("/api/v1/driver/sessions/active", headers=d["headers"])).json() == []

async def test_sessions_only_for_own_plates(client, listed_site, admin_engine):
    d = await driver(client)   # no vehicles
    await access_event(admin_engine, listed_site["tenant_id"], listed_site["id"], "51A12345", "entry")
    assert (await client.get("/api/v1/driver/sessions/active", headers=d["headers"])).json() == []
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(backend): driver parking sessions derived from ANPR access events`

---

### Task 7: Mobile foundation — API client, env, test runner, dependency cleanup

**Files:**
- Create: `mobile/src/lib/api.ts`, `mobile/src/lib/capacity.ts`, `mobile/src/lib/location.ts`, `mobile/vitest.config.ts`, `mobile/src/lib/__tests__/api.test.ts`, `mobile/src/vite-env.d.ts`
- Modify: `mobile/package.json`, `mobile/vite.config.ts`, `mobile/.env.example`, `mobile/README.md`, `mobile/metadata.json`
- Test: `mobile/src/lib/__tests__/api.test.ts`

**Interfaces:**
- `api.ts`:
  - `export const tokenStore = { get(): {access: string|null, refresh: string|null}, set(t: {accessToken: string, refreshToken: string}): void, clear(): void }` — localStorage keys from Global Constraints.
  - `export class ApiError extends Error { status: number; code: string; details?: unknown }` — parsed from backend envelope `{error: {code, message, details}}` (see `_envelope` in `backend/app/main.py`); falls back to `code="http_error"`.
  - `export async function api<T>(path: string, init?: RequestInit & { auth?: boolean }): Promise<T>` — prefixes `import.meta.env.VITE_API_BASE_URL ?? "/api/v1"`, JSON body/headers, attaches bearer when `auth !== false` and a token exists; on 401 with a refresh token calls `POST /driver/auth/refresh` **once** (shared in-flight promise so concurrent 401s dedupe), stores the bundle, retries; if refresh fails → `tokenStore.clear()` and dispatch `window.dispatchEvent(new Event("pv:logout"))`.
  - `export const onLogout = (fn: () => void) => () => void` (subscribes to `pv:logout`).
- `capacity.ts`: `getCapacityStatus(available, total): CapacityStatus` (moved verbatim from `mockTenants.ts:13-19`).
- `location.ts`: `DEFAULT_USER_LOCATION` (moved from `mockTenants.ts:3-11`, `permissionStatus: 'prompt'`), `haversineMeters(a, b): number`.
- `package.json`: remove `@google/genai`, `express`, `dotenv`, `@types/express`, `tsx`; add devDeps `vitest`, `jsdom` (pin a version ≥ 7 days old); script `"test": "vitest run"`; `"name": "parkvision-mobile"`.
- `vite.config.ts`: add `server.proxy = { "/api": { target: process.env.VITE_API_PROXY ?? "http://localhost:8000", changeOrigin: true } }`.
- `.env.example`: `VITE_API_BASE_URL=/api/v1`, `VITE_API_PROXY=http://localhost:8000`. README: replace AI Studio text with run instructions (backend compose up → `npm run dev`). `metadata.json`: drop `majorCapabilities` Gemini entry.

- [ ] **Step 1: Tests** (vitest, jsdom, `vi.stubGlobal("fetch", ...)`)

```ts
it("attaches bearer token and parses JSON", ...)                       // Authorization header === `Bearer a1`
it("parses backend error envelope into ApiError", ...)                  // status 409, code "conflict"
it("refreshes once on concurrent 401s and retries both", async () => {
  // fetch mock: first two calls → 401, refresh → 200 {accessToken:"a2",refreshToken:"r2"}, retries → 200
  await Promise.all([api("/x"), api("/y")]);
  expect(calls.filter(c => c.url.endsWith("/driver/auth/refresh"))).toHaveLength(1);
  expect(tokenStore.get().access).toBe("a2");
});
it("clears tokens and emits pv:logout when refresh fails", ...)
```

- [ ] **Step 2: Run** `npx vitest run` → FAIL (module missing).
- [ ] **Step 3: Implement files, edit package.json/vite/env, run `npm install`.**
- [ ] **Step 4: Run** `npx vitest run && npm run lint` → PASS.
- [ ] **Step 5: Commit** — `feat(mobile): API client with bearer auth + refresh, vitest, drop unused Gemini/express deps`

---

### Task 8: Mobile typed API modules + types

**Files:**
- Create: `mobile/src/api/public.ts`, `mobile/src/api/driver.ts`, `mobile/src/api/__tests__/mapSite.test.ts`
- Modify: `mobile/src/types.ts`

**Interfaces:**
- `types.ts`: keep `Tenant` as the UI model (components already consume it) with these changes: add `tenantSlug: string`, `siteId: string` (= `id`), make `rating`, `reviewCount`, `image`, `phone`, `description` optional, `membershipPlans: MembershipPlan[]` stays (always `[]` in Phase 1), `distanceMeters: number | null`. Add `ParkingHistoryItem = DriverSessionOut`-shaped type and `DriverProfile {id, email, fullName, phone?, avatarUrl?}`, `DriverVehicle {id, plateNumber, plateNormalized, label?, vehicleType: 'car'|'motorcycle', isPrimary}`. Replace `ActiveParkingSession` fields: `id, vehiclePlate, tenantId(siteId), tenantName, tenantSlug, floor?: string, zone?: string, spotNumber?: undefined, entryTime, durationSeconds, currentFeeVnd: null, status: 'PARKED'|'COMPLETED', entrancePhotoUrl?, anprConfidence?`. (Fee is `null` until Phase 3 — UI shows "—".)
- `public.ts`: `listSites(params: {lat?: number; lng?: number; radiusKm?: number; q?: string}): Promise<Tenant[]>`, `getSite(id): Promise<Tenant & {levels: PublicLevel[]}>`, `locatePlate(tenantSlug, plate): Promise<{found: boolean; levelName?: string; zoneName?: string; zoneCode?: string; sinceAt?: string}>`, `export function mapSite(s: PublicSiteOut): Tenant` (maps profile→pricing/facilities/parkingType/image/description; `openNow` computed from `operatingHours` if it has `{open:"HH:MM", close:"HH:MM"}` or `"24/7"`, else `true`; `floors`/`zones` empty until `getSite`).
- `driver.ts`: `register(body)`, `login(body)` (both store tokens), `logout()`, `me()`, `updateMe(body)`, `changePassword(body)`, `listSessions()`, `revokeSession(id)`, `vehicles.list/add/update/remove`, `favorites.list/add/remove`, `sessions.active(): Promise<ActiveParkingSession[]>`, `sessions.history(page, limit)` — each a thin `api<T>()` call plus mapping.

- [ ] **Step 1: Test `mapSite`** — given a `PublicSiteOut` fixture with `profile.pricing.hourlyFrom=20000`, `capacityStatus="LIMITED"`, `operatingHours={open:"06:00",close:"23:00"}`, assert `pricing.hourlyFrom===20000`, `capacity.status==="LIMITED"`, `facilities` passthrough, `openNow` is boolean, `membershipPlans` is `[]`, missing `imageUrl` → `image === undefined`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: `npx vitest run && npm run lint`** → PASS (lint will fail until Task 9 updates consumers of changed types — acceptable to commit Tasks 8+9 together if needed; otherwise fix compile errors minimally here).
- [ ] **Step 5: Commit** — `feat(mobile): typed public/driver API modules and real domain types`

---

### Task 9: Mobile auth + hooks, wire App, delete mocks and simulator

**Files:**
- Create: `mobile/src/hooks/useAuth.tsx`, `useSites.ts`, `useActiveSession.ts`, `useVehicles.ts`, `useFavorites.ts`, `useParkingHistory.ts`
- Delete: `mobile/src/data/mockTenants.ts`, `mobile/src/components/discover/RealtimeSimControl.tsx`
- Modify: `mobile/src/App.tsx`, `mobile/src/components/auth/LoginScreen.tsx`, `mobile/src/components/discover/ParkingSearchBar.tsx`, `mobile/src/components/discover/TenantDetailModal.tsx`, `mobile/src/components/discover/FindMyVehicleModal.tsx`, `mobile/src/i18n/translations.ts`

**Interfaces:**
- `useAuth()` → `{ user: DriverProfile | null, status: 'loading'|'guest'|'authed', login(email,pw), register(body), logout(), continueAsGuest(), refreshUser() }`. On mount: if tokens exist → `me()`; else `'guest'` only if `localStorage.pv_guest === "1"`, otherwise show LoginScreen. `onLogout` → `'guest'` cleared → LoginScreen.
- `useSites({ location, keyword, enabled })` → `{ sites: Tenant[], loading, error, lastUpdatedAt: Date|null, refetch }` — polls `listSites` every **15 s** (`setInterval`, cleared on unmount), passes `lat/lng/radiusKm=50` (client keeps the 5 km UI filter) and `q=keyword` (debounced 300 ms).
- `useActiveSession(enabled)` → `{ session: ActiveParkingSession | null, loading, refetch }` polling every **20 s**; `session` = first `PARKED` item; recompute `durationSeconds` locally each second in `ActiveParkingCard` (already does).
- `useVehicles()` → `{ vehicles, add, update, remove, loading, error }`; `useFavorites()` → `{ ids: Set<string>, toggle(siteId) }` (optimistic, revert on error); `useParkingHistory()` → `{ items, loading, loadMore, hasMore }`.
- `App.tsx` changes: remove `INITIAL_*`, simulator `useEffect` (lines 77-112), `handleSimulateEntry/Exit`, `handleParkNow` + `onParkNow` prop (ANPR check-in is automatic; `TenantDetailModal` loses the "Park now" button and shows "Directions" instead); `handleToggleFavorite` → `useFavorites().toggle`; `isFavorite` merged from `ids`; `onOpenNotifications` alert removed (button hidden); `onPayEarly` alert removed (button hidden — Phase 3); `currentUser` from `useAuth`; guest mode disables Favorites/My Parking/Profile actions with a "Sign in" CTA.
- `LoginScreen`: props `onLogin(email, pw): Promise<void>`, `onRegister({email,password,fullName}): Promise<void>`, `onGuest()`. Remove Google button and the `google` tab; add a "Register" toggle; show `ApiError.message` inline; keep guest button. Export of `UserProfile` removed (use `DriverProfile`).
- `ParkingSearchBar`: recents from `localStorage.pv_recent_searches` (max 5, written on submit) via a tiny `recentSearches.ts` helper in `lib/`.
- `TenantDetailModal`: remove `mockSpots` grid (lines 34-35, 276); render `levels` from `getSite()` (fetched when modal opens) as a level/zone list with `occupiedCount/capacity`; membership section shows "coming soon" when `membershipPlans.length === 0`.
- `FindMyVehicleModal`: on open, call `locatePlate(session.tenantSlug, session.vehiclePlate)`; show level/zone or "not located yet"; remove the hardcoded spot number.
- `translations.ts`: add keys `signIn, signUp, fullName, invalidCredentials, networkError, guestNotice, comingSoon, noHistory, notLocatedYet, continueAsGuest` (en + vi).

- [ ] **Step 1: `npm run lint`** after deleting `mockTenants.ts` and `RealtimeSimControl.tsx` → FAIL (unresolved imports) — this is the "failing test" for the wiring.
- [ ] **Step 2: Implement hooks and edits above.**
- [ ] **Step 3: `npm run lint && npx vitest run`** → PASS; `grep -rn "mockTenants\|RealtimeSimControl\|setTimeout(" src --include=*.tsx` → only UI-animation timeouts remain (none in auth/data flows).
- [ ] **Step 4: Manual smoke** — `cd backend && docker compose up -d --build`; create a tenant + listed site via tenant dashboard or `PATCH /tenants/{id}/sites/{id}` with `publicProfile`; `cd mobile && npm run dev`; register a driver, add plate, see site on map; insert an allow/entry `access_event` for that plate (psql) → Active card appears within 20 s.
- [ ] **Step 5: Commit** — `feat(mobile): real auth, discovery, sessions, favorites; remove mock data and simulator`

---

### Task 10: Mobile profile screens — real vehicles/security, honest empty states

**Files:**
- Modify: `mobile/src/components/views/ProfileScreen.tsx`, `mobile/src/components/views/MyParkingScreen.tsx`, `mobile/src/components/views/MembershipsScreen.tsx`, `mobile/src/components/discover/MembershipModal.tsx`, `mobile/src/components/profile/VehicleModal.tsx`, `mobile/src/components/profile/PaymentEWalletModal.tsx`, `mobile/src/components/profile/SecurityPrivacyModal.tsx`, `mobile/src/components/profile/NotificationSettingsModal.tsx`

**Interfaces:**
- `ProfileScreen`: `vehicles` from `useVehicles()`; `VehicleModal.Vehicle` → `DriverVehicle` (`plate`→`plateNumber`, `model`→`label`); save/delete call the API and surface `ApiError.message`. Header shows `user.fullName/email` (no `"Dainn Dev"` fallback).
- `MyParkingScreen`: `historySessions` → `useParkingHistory()`; empty → `t('noHistory')`; fee column shows "—" when `currentFeeVnd === null`.
- `MembershipsScreen`/`MembershipModal`: no purchase flow; modal body = `t('comingSoon')`, `onSuccess` prop removed; `memberships` state removed from `App.tsx` (badge count 0).
- `PaymentEWalletModal`: delete seeded `linkedMethods`, `transactions`, `walletBalance=250000`, fake top-up/link `setTimeout`s; render a single `comingSoon` panel. File shrinks substantially — that is intended.
- `SecurityPrivacyModal`: change password → `driver.changePassword` (real errors); sessions list → `driver.listSessions()` + revoke; toggles (`useBiometrics`, etc.) persist to `localStorage.pv_security_prefs` and are labelled device-only; export/delete-account → `comingSoon` (disabled).
- `NotificationSettingsModal`: persist to `localStorage.pv_notif_prefs`; remove fake "saved" delay beyond the UI toast.

- [ ] **Step 1: `grep -n "51A-123.45\|Dainn\|250000\|SESS-" src -r`** → lists remaining hardcoded data (the failing check).
- [ ] **Step 2: Implement edits.**
- [ ] **Step 3: Re-run grep → no matches; `npm run lint && npx vitest run`** → PASS.
- [ ] **Step 4: Commit** — `feat(mobile): profile/vehicles/security on real API; wallet & membership show coming-soon`

---

### Task 11: Docs + AGENTS.md

**Files:**
- Modify: `AGENTS.md` (root) — add `mobile` to the component list and verification commands: `cd mobile && npm run lint && npx vitest run`; `cd backend && pytest tests/test_driver_api.py`.
- Modify: `backend/README.md` — add "Driver API" section listing the new routes and the `publicProfile.listed` requirement for a site to appear in the mobile app.

- [ ] **Step 1: Edit both files.** **Step 2: Commit** — `docs: driver API and mobile verification commands`

---

## Follow-up plans (not in this document)

**Phase 2 — Memberships** (`2026-xx-xx-driver-memberships.md`): tables `site_membership_plans` (tenant-managed: name, price_vnd, duration_days, perks[], badge) and `driver_memberships` (driver, plan, plate, starts/ends, status); tenant CRUD endpoints; `GET /public/sites/{id}/plans`; `POST /driver/memberships` (purchase — blocked on Phase 3 payment); edge whitelist integration (`edge.py:/tenants/{id}/whitelist` should include active membership plates). **Blocker:** needs a decision on whether a membership also creates a `RegisteredVehicle` in the tenant (affects `decide_access`).

**Phase 3 — Wallet, payments, pricing** (`2026-xx-xx-driver-payments.md`): `site_pricing_rules` (hourly/daily/overnight/monthly, grace minutes, caps), server-side `currentFeeVnd` on `DriverSessionOut`, `driver_wallets` + `wallet_transactions`, payment-gateway adapter (MoMo/ZaloPay/VNPay sandbox), "pay before exit" → gate allow decision. **Blocker:** no pricing/business spec exists; gateway credentials and refund/dispute rules must be decided with the user first.

**Realtime push (optional):** a driver WebSocket `/ws/driver/sessions` fed by `record_access_event` publishing to a Redis channel keyed by normalized plate, replacing the 15 s / 20 s polling.
