# Tenant Parking Map (Sơ Đồ Bãi Xe) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give tenants a layered parking map (level → zone) where monitor cameras report which zone each plate parks in — tracking relocation when a vehicle moves zones and clearing presence on gate exit — so tenant admins see a live map and both admins and end users (shoppers, students) can search a plate and get the zone highlighted.

**Architecture:** New `parking_levels`/`parking_zones` tables hold the map (zone `bounds` = normalized rect on the level's `map_image_url`); `camera_zone_coverages` binds monitor cameras (`cameras.purpose='monitor'`) to the zones they watch; `vehicle_presences` is the one-row-per-parked-plate source of truth with `vehicle_location_events` as the relocation audit trail. Monitor cameras publish detections to a new MQTT topic `tenants/{t}/sites/{s}/cameras/{c}/detection` which the existing bridge consumes → `parking_service.record_detection()` upserts presence + writes parked/relocated events → `vehicle_location` WS frames fan out on the existing channel. Gate `exit` access events close presence inside `record_access_event` (single funnel for MQTT + REST events). Frontend gets a new `parking-map` tenant tab rendering levels/zones as SVG overlays with search-highlight, plus an admin edit mode; an unauthenticated `FindMyCarPage` serves end users via two sanitized public endpoints.

**Tech Stack:** FastAPI + SQLAlchemy async + Alembic (raw `op.execute` SQL), PostgreSQL RLS (`tenant_isolation` policy, `vehicle_app` role), pydantic `CamelModel`, aiomqtt bridge → Redis pub/sub → WS, arq workers; React 19 + TS, `tenantApi`/`publicApi` in `src/services/api/index.ts`.

**Spec:** User requirements (this session): sơ đồ phân tầng = **level → zone only (no spots)**; camera monitor updates plate→zone (e.g. "cột S03 tầng B2") and relocates when the vehicle moves; search shows + highlights the zone — no pathfinding; monitor camera snapshots the parking area and returns it to the tenant; the map serves tenant admin **and** unauthenticated end users. Existing conventions per `SPEC_ANALYSIS_AND_PLAN.md` and `docs/superpowers/plans/2026-09-28-tenant-camera-management.md`.

## Global Constraints

- Enums are **lowercase** (`active`, `disabled`, `monitor`, `parked`, `relocated`, `exited`, `stale`, `vehicle_parked`, `vehicle_left`, `zone_snapshot`).
- Response envelope: `Page[T]` for lists; bare object for single resources; errors `{error:{code,message}, requestId}`.
- All schemas extend `CamelModel` (`app/schemas/common.py`) — snake_case fields serialize as camelCase.
- Router deps pattern: `dependencies=[Depends(csrf_protect)]` on the router; reads need only `tenant_ctx`; writes add `Depends(require_roles(*WRITE_ROLES))`; mutations call `write_audit(...)`.
- Migration style: raw SQL via `op.execute`, revision `0010_parking_map`, `down_revision = "0009_cameras"`. RLS policy text **must** copy the corrected form from `0009_cameras`: `current_setting('app.platform_bypass', true) = 'true' OR tenant_id = current_setting('app.current_tenant_id', true)::uuid` in both USING and WITH CHECK, plus `GRANT SELECT, INSERT, UPDATE, DELETE ON <table> TO vehicle_app`.
- `Plate` normalization: reuse `app.services.event_service.normalize_plate` (`re.sub(r"[^A-Z0-9]", "", plate.upper())`) — never a second implementation. Watch for the import cycle noted in Task 4.
- `schema.d.ts` is generated but has no regen script — do NOT regenerate it; hand-write new interfaces in `services/api/index.ts` (same convention as `CameraOut`).
- Frontend has **no test runner** — frontend tasks verify with `npm run lint` (`tsc --noEmit`) + `npm run build`.
- Zone `bounds` are normalized floats `{x, y, w, h}` each in `[0, 1]` relative to the level map image (or plain dark canvas when no image is set).
- One tenant ≈ one site today, but all tables still carry `site_id` and endpoints accept `siteId` filter — do not hardcode a single-site assumption.

## Review Focus

- **Public plate lookup is an enumeration oracle:** `GET /public/tenants/{slug}/parking/locate` is unauthenticated by design (find-my-car kiosks). Response must reveal only `{found, zone, level, sinceAt}` — no camera id, no owner data, no other plates — and lookup must be **exact normalized-plate match**, never substring/fuzzy. Test pins both in Task 7.
- **Concurrent detections race the partial unique index** (`ux_presence_active_plate`): two `vehicle_parked` frames for one plate can both miss the SELECT and both INSERT. `record_detection` must catch `IntegrityError` and re-read/update instead of 500-ing the bridge loop. Test pins this in Task 3.
- **Ambiguous zone resolution:** a camera covering >1 zone whose payload omits `zoneId`/`zoneCode` must NOT guess. It still records a presence with `zone_id NULL` ("in lot, zone unknown") so locate() still finds the vehicle. Test pins this in Task 3.
- **Stale-or-deleted zone references:** deleting a zone SET NULLs `vehicle_presences.zone_id` — a located vehicle then shows "zone removed" instead of a dead highlight; `vehicle_location_events` keeps `from_zone_id`/`to_zone_id` (SET NULL) so history rows survive. Camera delete cascades `camera_zone_coverages`. Tests pin in Task 8.
- **Presence never exits without an event:** a plate parked but exiting via a lane whose ANPR missed it stays `parked` forever. The `expire_stale_presence` cron marks `stale` after the tenant TTL so occupancy numbers self-heal; `stale` must still be treated as "likely in lot" by locate() until the TTL*4 hard-expiry flips it to `exited`. Test pins thresholds in Task 3/Task 8.

---

### Task 1: Parking tables + SQLAlchemy models (`0010_parking_map`)

**Files:**
- Create: `backend/migrations/versions/0010_parking_map.py`
- Modify: `backend/app/models.py` (append 5 models after `Camera`, ~line 252; extend `Camera` with 2 columns)

**Interfaces:**
- Produces models:
  - `ParkingLevel` (`parking_levels`): `id` uuid pk, `tenant_id` FK `tenants.id` CASCADE, `site_id` FK `tenant_sites.id` CASCADE NOT NULL, `name` str(200) NOT NULL, `code` str(50) nullable, `sort_order` int default 0, `map_image_url` Text nullable (S3 object key, presigned on read), `status` str(30) default `'active'`, TimestampMixin. Partial unique `(site_id, code) WHERE code IS NOT NULL`; `Index("ix_parking_levels_tenant", "tenant_id", "site_id")`.
  - `ParkingZone` (`parking_zones`): `id` uuid pk, `tenant_id`, `site_id` (denormalized from level, CASCADE), `level_id` FK `parking_levels.id` CASCADE NOT NULL, `name` str(200) NOT NULL, `code` str(50) nullable (e.g. `"S03"`), `bounds` JSONB default `{}` (`{x,y,w,h}` normalized), `capacity` int default 0, `status` str(30) default `'active'`, TimestampMixin. Partial unique `(level_id, code) WHERE code IS NOT NULL`; `Index("ix_parking_zones_tenant", "tenant_id", "level_id")`.
  - `CameraZoneCoverage` (`camera_zone_coverages`): `tenant_id`, `camera_id` FK `cameras.id` CASCADE, `zone_id` FK `parking_zones.id` CASCADE; PK `(camera_id, zone_id)`; `created_at` only (no updated_at — plain join table).
  - `VehiclePresence` (`vehicle_presences`): `id` uuid pk, `tenant_id`, `site_id`, `level_id` uuid nullable, `zone_id` uuid nullable FK `parking_zones.id` SET NULL, `plate_number` str(20) NOT NULL, `plate_normalized` str(20) NOT NULL, `vehicle_id` uuid nullable (best-effort link to `registered_vehicles.id`, no FK — vehicle may not be registered), `camera_id` uuid nullable FK `cameras.id` SET NULL (last reporter), `confidence` Numeric(5,4) nullable, `status` str(20) default `'parked'` (`parked|stale|exited`), `first_seen_at`/`last_seen_at`/`exited_at` timestamptz, TimestampMixin. `Index("ix_presence_zone", "tenant_id", "zone_id", "status")`; `Index("ix_presence_plate", "tenant_id", "plate_normalized")`.
  - `VehicleLocationEvent` (`vehicle_location_events`): `id` uuid pk, `tenant_id`, `presence_id` FK `vehicle_presences.id` CASCADE, `event_type` str(20) (`parked|relocated|exited|stale`), `from_zone_id`/`to_zone_id` uuid nullable FK `parking_zones.id` SET NULL, `camera_id` uuid nullable FK `cameras.id` SET NULL, `plate_number` str(20), `confidence` Numeric(5,4) nullable, `payload` JSONB default `{}`, `occurred_at` timestamptz NOT NULL. `Index("ix_loc_events_plate", "tenant_id", "plate_number", "occurred_at")`.
  - `Camera` gains `last_snapshot_key` Text nullable, `snapshot_captured_at` timestamptz nullable.
- Migration DDL adds (all `ENABLE ROW LEVEL SECURITY` + `tenant_isolation` policy + grants; partial-unique SQL):

```sql
CREATE UNIQUE INDEX IF NOT EXISTS ux_presence_active_plate
    ON vehicle_presences (tenant_id, plate_normalized) WHERE status = 'parked';
```

- [ ] **Step 1: Write the migration** mirroring `0009_cameras.py` — docstring header, `revision = "0010_parking_map"`, `down_revision = "0009_cameras"`, all DDL under one `op.execute` per statement; `ALTER TABLE cameras ADD COLUMN IF NOT EXISTS last_snapshot_key text, ADD COLUMN IF NOT EXISTS snapshot_captured_at timestamptz`. Downgrade drops the 5 tables + 2 columns in dependency order.
- [ ] **Step 2: Add the 5 models + 2 Camera columns** in `app/models.py` following existing style.
- [ ] **Step 3: Verify migration applies** — `cd backend && alembic upgrade head && alembic heads` → single head `0010_parking_map`.
- [ ] **Step 4: Commit** — `git commit -m "feat: parking levels/zones/presence tables with RLS"`.

---

### Task 2: Pydantic schemas for parking resources

**Files:**
- Modify: `backend/app/schemas/resources.py` (insert after `CameraOut`, ~line 366)

**Interfaces:**
- Produces:
  - `ParkingLevelIn`: `site_id: uuid.UUID`; `name: str = Field(min_length=1, max_length=200)`; `code: str | None = Field(default=None, max_length=50)`; `sort_order: int = 0`; `map_image_url: str | None = None`; `status: str | None = None`. `ParkingLevelUpdateIn`: same minus `site_id`, all optional.
  - `ParkingLevelOut`: `id, tenant_id, site_id, name, code, sort_order, map_image_url, status, created_at`.
  - `ZoneBounds(CamelModel)`: `x, y, w, h: float = Field(ge=0, le=1)` + model validator `x + w <= 1.0001 and y + h <= 1.0001` else `ValueError("bounds must fit within the map")`.
  - `ParkingZoneIn`: `name`, `code?`, `bounds: ZoneBounds | None = None`, `capacity: int = Field(0, ge=0)`, `status: str | None = None`. `ParkingZoneUpdateIn`: all optional.
  - `ParkingZoneOut`: `id, tenant_id, site_id, level_id, name, code, bounds: dict | None, capacity, status, created_at`.
  - `MapZoneOut(ParkingZoneOut)`: `+ occupied_count: int`, `camera_ids: list[uuid.UUID]`.
  - `MapLevelOut(ParkingLevelOut)`: `+ zones: list[MapZoneOut]`.
  - `ParkingMapOut`: `tenant_id`, `levels: list[MapLevelOut]`.
  - `PresenceOut`: `id, tenant_id, site_id, level_id, zone_id, plate_number, plate_normalized, vehicle_id, camera_id, confidence, status, first_seen_at, last_seen_at, exited_at`.
  - `LocateOut`: `found: bool`, `presence: PresenceOut | None = None`, `zone: ParkingZoneOut | None = None`, `level: ParkingLevelOut | None = None`, `camera_name: str | None = None`.
  - `PresenceCheckinIn`: `plate_number: str = Field(min_length=4, max_length=20)`, `zone_id: uuid.UUID`, `confidence: float | None = None`.
  - `PresenceCheckoutIn`: `plate_number: str`.
  - `CameraCoverageIn`: `zone_ids: list[uuid.UUID]`.
  - `PublicMapZoneOut`: `id, level_id, name, code, bounds, occupied_count` (no tenant/site ids). `PublicMapLevelOut`: `id, name, code, sort_order, map_image_url, zones: list[PublicMapZoneOut]`.
  - `PublicLocateOut`: `found: bool`, `zone_id, zone_name, zone_code, level_id, level_name, level_code, since_at` — every field except `found` optional/null when not found.
  - `status` validators on `ParkingLevelIn`/`ParkingZoneIn`: `active|disabled` when set.
- Consumes (later tasks): `PresignIn`/`PresignOut` already exist (~line 519) for map-image upload.

- [ ] **Step 1: Write failing schema tests** in `backend/tests/test_parking.py` (new file):

```python
def test_zone_bounds_rejects_overflow():
    with pytest.raises(ValidationError):
        ZoneBounds(x=0.8, y=0.1, w=0.5, h=0.2)

def test_zone_bounds_accepts_full_map():
    assert ZoneBounds(x=0, y=0, w=1, h=1).w == 1
```

- [ ] **Step 2: Run tests to verify they fail** — `cd backend && pytest tests/test_parking.py -q` → FAIL `ZoneBounds` not defined.
- [ ] **Step 3: Implement the schemas** per Interfaces (validators follow `_valid_camera_purpose` shape).
- [ ] **Step 4: Run tests to verify they pass** — same command → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: parking map pydantic schemas"`.

---

### Task 3: `parking_service.py` — presence upsert, relocation, exit, stale sweep

**Files:**
- Create: `backend/app/services/parking_service.py`
- Modify: `backend/app/workers/jobs.py` (add `expire_stale_presence` + register in `worker.py`)

**Interfaces:**
- Produces:
  - `async def resolve_zone(db, *, tenant_id, camera: Camera | None, zone_id: uuid.UUID | None, zone_code: str | None) -> ParkingZone | None` — precedence: `zone_id` → `zone_code` match within the camera's covered zones (fall back to any zone in the camera's site) → camera's single covered zone → `None`.
  - `async def record_detection(db, *, tenant_id, site_id, camera_id, zone, plate_number, confidence, occurred_at, payload) -> tuple[VehiclePresence, str]` — normalizes plate, links `vehicle_id` via `registered_vehicles.plate_normalized`, upserts the `status='parked'` row: no presence → INSERT + `parked` event; same zone → update `last_seen_at`/`camera_id`/`confidence` only (no event); different zone → update zone/level + `relocated` event (`from_zone_id`,`to_zone_id`). On `IntegrityError` from the partial unique index → `await db.rollback()`, re-select, update in place. Returns `(presence, event_type|'seen')`. All writes flushed; caller commits. After upsert, `db.expire_on_commit`-safe — returns refreshed row.
  - `async def mark_presence_exit(db, *, tenant_id, plate_number, camera_id=None, zone_id=None) -> VehiclePresence | None` — sets `status='exited'`, `exited_at`, writes `exited` event; `None` if no parked/stale presence.
  - `async def close_presence_for_plate(db, *, tenant_id, plate_number) -> None` — thin wrapper used by the access-event exit hook.
  - `async def locate_presence(db, *, tenant_id, plate_number) -> VehiclePresence | None` — exact `plate_normalized` match, `status IN ('parked','stale')`.
  - `async def sweep_stale_presences(db, *, stale_before, expire_before) -> int` — `parked` rows with `last_seen_at < stale_before` → `stale` (+`stale` event); `stale`/`parked` with `last_seen_at < expire_before` → `exited` (+`exited` event). Returns count touched.
  - `async def expire_stale_presence(ctx) -> int` (jobs.py) — per-tenant TTL from `tenants.settings["parking_presence_ttl_hours"]` (default 48h; hard-expire at 4× TTL), loops tenants via `platform_session`.
- Consumes: `normalize_plate` from `app.services.event_service` (top-level import is safe — `event_service` must NOT import `parking_service` at top level; see Task 4).

- [ ] **Step 1: Write failing service tests** in `tests/test_parking.py`. conftest has no session fixture — open `platform_session()` inline per test block (it `begin()`s, commits on clean exit, and bypasses RLS) and define a `level_zone` fixture in this file that INSERTs site → `ParkingLevel` → `ParkingZone` rows via models inside one `platform_session()` (shared again by Task 7's API tests):

```python
async def test_record_detection_creates_presence_and_parked_event(db, tenant, level_zone):
    p, et = await record_detection(db, tenant_id=tenant, site_id=..., camera_id=None,
        zone=zone, plate_number="51F-123.45", confidence=0.9, occurred_at=now, payload={})
    assert et == "parked" and p.zone_id == zone.id and p.plate_normalized == "51F12345"

async def test_record_detection_relocates_on_zone_change(...):
    # park in zone A, then detect in zone B → same presence row, event_type 'relocated',
    # one VehicleLocationEvent row with from_zone_id=A, to_zone_id=B

async def test_record_detection_same_zone_only_refreshes(...):
    # second detection same zone → 'seen', no new event row

async def test_unresolvable_zone_parks_with_null_zone(...):
    # camera covering 2 zones, payload has neither zoneId nor zoneCode → zone_id None

async def test_mark_presence_exit_and_relocate_after_exit(...):
    # exit → status 'exited'; a later detection creates a NEW parked presence

async def test_sweep_marks_stale_then_expired(...):
    # last_seen_at 60h ago w/ 48h TTL → 'stale'; 200h ago → 'exited'
```

- [ ] **Step 2: Run to verify failure** — `pytest tests/test_parking.py -q` → `parking_service` import error.
- [ ] **Step 3: Implement `parking_service.py`** per Interfaces. Zone resolution order exactly as specified; `vehicle_id` lookup best-effort.
- [ ] **Step 4: Add `expire_stale_presence` to jobs.py + `cron(jobs.expire_stale_presence, minute={5, 20, 35, 50})` in `worker.py`**.
- [ ] **Step 5: Run tests to verify they pass** — `pytest tests/test_parking.py -q` → PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat: parking presence service with relocation tracking"`.

---

### Task 4: MQTT detection ingest + gate-exit hook + edge presign + contract doc

**Files:**
- Modify: `backend/app/realtime/mqtt_bridge.py` (new camera-topic regex + subscription + `handle_detection`)
- Modify: `backend/app/services/event_service.py` (lazy import + exit hook in `record_access_event`)
- Modify: `backend/app/api/v1/edge.py` (`POST /tenants/{id}/uploads/presign`)
- Create: `docs/mqtt-camera-detection.md`

**Interfaces:**
- New subscription `("tenants/+/sites/+/cameras/+/detection", 1)`; topic regex `^tenants/(?P<tenant>[^/]+)/sites/(?P<site>[^/]+)/cameras/(?P<camera>[^/]+)/(?P<kind>detection)$`.
- `handle_detection(tenant_id, site_id, camera_id, payload)`:
  - `type: "vehicle_parked" | "vehicle_seen"` → `record_detection(...)` with zone from `payload.zoneId ?? payload.zoneCode` via `resolve_zone`; publish `{type:"vehicle_location", presence:{id,plateNumber,zoneId,levelId,zoneCode,zoneName,status}, eventType}` on `ws_channel`.
  - `type: "vehicle_left"` → `mark_presence_exit(...)`; same WS shape with `eventType:"exited"`.
  - `type: "zone_snapshot"` → `UPDATE cameras SET last_snapshot_key=payload.snapshotKey, snapshot_captured_at=now`; publish `{type:"camera_snapshot", cameraId, snapshotKey}`.
  - Unknown camera id / unparseable payload → log warning, never raise (bridge must keep consuming).
- `record_access_event` gains (after `await db.flush()`): `if direction == EventDirection.EXIT: from app.services.parking_service import close_presence_for_plate; await close_presence_for_plate(...)`. The import **stays inside the function** — `parking_service` already imports `normalize_plate` from `event_service` at top level; a top-level import here would cycle.
- `POST /edge/tenants/{tenant_id}/uploads/presign` → `PresignOut`; body `{kind, contentType}`; `kind` allowlist `{"zone-snapshot","parking-map","plate","overview"}`; auth = existing `edge_ctx` (`X-Api-Key` + `edge:ingest` scope); calls `presign_upload(tenant_id, kind, content_type)`.
- `docs/mqtt-camera-detection.md` documents topic, the 3 payload `type`s, field names (`plateNumber`, `zoneId`|`zoneCode`, `confidence`, `snapshotKey`, `occurredAt`), zone-resolution precedence, and the presign-upload flow for snapshots.

- [ ] **Step 1: Write failing bridge test** in `tests/test_parking.py`:

```python
async def test_handle_detection_parks_and_publishes(migrated, tenant, level_zone, monkeypatch):
    published = []
    monkeypatch.setattr(mqtt_bridge, "publish_ws", lambda t, m: published.append(m))
    await mqtt_bridge.handle_detection(str(tenant_id), str(site_id), str(camera_id),
        {"type": "vehicle_parked", "plateNumber": "30A-999.99", "zoneCode": "S03"})
    # presence row exists; published[0]["type"] == "vehicle_location"; eventType == "parked"
```

- [ ] **Step 2: Run to verify failure** — `pytest tests/test_parking.py -k detection -q`.
- [ ] **Step 3: Implement bridge changes + exit hook + edge endpoint** per Interfaces (keep `handle_detection` exception-tolerant like `handle_incident`).
- [ ] **Step 4: Write `docs/mqtt-camera-detection.md`** — the full contract for the edge repos.
- [ ] **Step 5: Run tests to verify they pass** + `ruff check . && mypy app` clean.
- [ ] **Step 6: Commit** — `git commit -m "feat: camera detection ingest, gate-exit presence close, edge presign"`.

---

### Task 5: Tenant `parking` REST router + camera coverage endpoint

**Files:**
- Create: `backend/app/api/v1/tenant/parking.py`
- Modify: `backend/app/api/v1/tenant/cameras.py` (`PUT /cameras/{id}/coverage`; `CameraOut` + 2 snapshot fields; `_CAMERA_PURPOSES += "monitor"`)
- Modify: `backend/app/api/v1/__init__.py` (mount), `backend/app/main.py` (openapi tag `{"name": "parking"}`)

**Interfaces:**
- Produces (prefix `/tenants/{tenant_id}`, `tags=["parking"]`):
  - `GET /parking/levels?site_id=` → `list[ParkingLevelOut]` ordered `sort_order, created_at`; `POST /parking/levels` 201 (validate site belongs to tenant); `PATCH /parking/levels/{id}`; `DELETE /parking/levels/{id}` (cascades zones).
  - `GET /parking/levels/{level_id}/zones` → `list[ParkingZoneOut]`; `POST /parking/levels/{level_id}/zones` 201 (`site_id` inherited from level); `PATCH /parking/zones/{zone_id}`; `DELETE /parking/zones/{zone_id}`.
  - `GET /parking/map?site_id=` → `ParkingMapOut` — levels + zones + `occupied_count` (`COUNT vehicle_presences WHERE status IN ('parked','stale') GROUP BY zone_id`) + `camera_ids` per zone. `map_image_url` rewritten to `presign_download(key)` when set.
  - `GET /parking/presence?zone_id=&status=&page=&limit=` → `Page[PresenceOut]` default `status='parked'`.
  - `GET /parking/locate?plate=` → `LocateOut` via `locate_presence` + joined zone/level + `camera_name`; `found=false` otherwise.
  - `POST /parking/presence` → `PresenceOut` (manual check-in through `record_detection`, `camera_id=None`, audit `parking.checkin`); `POST /parking/presence/checkout` → `MessageOut` (`mark_presence_exit`, audit `parking.checkout`).
  - `POST /parking/map-image/presign` → `PresignOut` via `presign_upload(ctx.tenant_id, "parking-map", content_type)`.
  - `PUT /cameras/{camera_id}/coverage {zoneIds}` → `CameraOut` (WRITE_ROLES): validates camera exists + every zone belongs to `camera.site_id` (RLS-scoped selects, 400 on mismatch), replaces coverage rows in one transaction, audit `camera.coverage_updated`.
  - `CameraOut` + `cameras` responses now include `last_snapshot_url` (presigned when `last_snapshot_key` set) and `snapshot_captured_at`. `_CAMERA_PURPOSES` in `resources.py` gains `"monitor"`.
- Consumes: models (Task 1), schemas (Task 2), `record_detection`/`mark_presence_exit`/`locate_presence` (Task 3).

- [ ] **Step 1: Implement `parking.py`** — copy `sites.py`/`cameras.py` CRUD structure (`_get_row`-or-404 helpers, `_validate_refs` for site/level ownership, `IntegrityError` → `conflict`).
- [ ] **Step 2: Extend `cameras.py`** — coverage endpoint + response fields; update `CameraOut` construction where the route returns (both files use `CameraOut.model_validate`; presigned field assigned after validation like `events.py:148`).
- [ ] **Step 3: Mount + tag** — one line each in `api/v1/__init__.py` and `main.py`.
- [ ] **Step 4: Lint check** — `cd backend && ruff check . && ruff format . && mypy app` clean.
- [ ] **Step 5: Commit** — `git commit -m "feat: parking map CRUD, map aggregate, locate, camera coverage API"`.

---

### Task 6: Public locate + map endpoints (unauthenticated find-my-car)

**Files:**
- Modify: `backend/app/api/v1/public.py`

**Interfaces:**
- `GET /public/tenants/{slug}/parking/map` → `PublicMapLevelOut[]` — resolve tenant by slug (404), levels+zones+bounds+`occupied_count` only; `map_image_url` presigned; **no presence/plate fields anywhere**.
- `GET /public/tenants/{slug}/parking/locate?plate=` → `PublicLocateOut` — `locate_presence` exact-match only; response carries zone/level names+codes+ids and `since_at` (`first_seen_at`); `found=false` empty otherwise. Reject plate < 4 chars with 400.

- [ ] **Step 1: Write failing tests** in `test_parking.py` — locate returns only the whitelisted keys (assert `set(body.keys()) <= {found,zoneId,zoneName,zoneCode,levelId,levelName,levelCode,sinceAt}`); substring plate → `found=false`; unknown slug → 404.
- [ ] **Step 2: Implement** per Interfaces.
- [ ] **Step 3: Run tests** → PASS.
- [ ] **Step 4: Commit** — `git commit -m "feat: public parking map + exact-match vehicle locate"`.

---

### Task 7: Backend integration tests

**Files:**
- Modify: `backend/tests/test_parking.py`

- [ ] **Step 1: Write the integration tests** (fixtures `client`, `tenant`, `other_tenant`, `csrf`, `login` — copy `test_cameras.py` style; a `level_zone` fixture creating site→level→zone via API):

```python
async def test_level_zone_crud_flow(client, tenant, site):        # POST/GET/PATCH/DELETE both
async def test_parking_isolation(client, tenant, other_tenant):   # other tenant sees empty map, 404 by id
async def test_map_aggregate_occupancy(client, tenant, level_zone):
    # manual check-in 2 plates zone A, 1 zone B → GET /parking/map shows occupiedCount 2/1
async def test_locate_found_and_not_found(client, tenant, level_zone):
    # check-in 51F-12345 → locate?plate=51F123.45 → found, zoneCode "S03", levelName "B2"
async def test_manual_checkout_clears_presence(...)
async def test_checkin_same_plate_other_zone_relocates(...)
async def test_coverage_put_replaces_and_validates_site(client, tenant, level_zone):
    # camera in site A + zone in site B → 400; valid zones → 200 and GET map cameraIds
async def test_viewer_cannot_mutate(client, tenant, level_zone, admin_engine)  # 403 on POST
async def test_zone_delete_keeps_presence_with_null_zone(...)
```

- [ ] **Step 2: Run + fix until green** — `pytest tests/test_parking.py -q`.
- [ ] **Step 3: Full suite + lint** — `pytest tests -q && ruff check . && mypy app`.
- [ ] **Step 4: Commit** — `git commit -m "test: parking map, presence, coverage, public locate coverage"`.

---

### Task 8: Frontend API client + types

**Files:**
- Modify: `frontend/src/services/api/index.ts`
- Modify: `frontend/src/types/tenant.ts` (add `'parking-map'` to `TenantNavigationTab`)

**Interfaces:**
- Hand-written interfaces (camelCase, matching pydantic): `ParkingLevelOut`, `ParkingZoneOut`, `MapZoneOut`, `MapLevelOut`, `ParkingMapOut`, `PresenceOut`, `LocateOut`, `PublicMapLevelOut`, `PublicLocateOut`, `ZoneBounds`.
- `tenantApi` additions: `parkingLevels(t, siteId?)`, `createParkingLevel`, `updateParkingLevel`, `deleteParkingLevel`, `parkingZones(t, levelId)`, `createParkingZone`, `updateParkingZone`, `deleteParkingZone`, `parkingMap(t, siteId?)`, `parkingPresence(t, p)`, `locateVehicle(t, plate)`, `parkingCheckin(t, {plateNumber, zoneId})`, `parkingCheckout(t, plateNumber)`, `parkingMapImagePresign(t, contentType)`, `setCameraCoverage(t, cameraId, zoneIds)`.
- `publicApi` additions: `publicParkingMap(slug)`, `publicLocateVehicle(slug, plate)`.

- [ ] **Step 1: Add interfaces + methods** — follow `CameraOut`/`tenantApi.cameras` patterns exactly.
- [ ] **Step 2: Add `'parking-map'` to `TenantNavigationTab`.**
- [ ] **Step 3: Typecheck** — `cd frontend && npm run lint` clean.
- [ ] **Step 4: Commit** — `git commit -m "feat: parking map api client and types"`.

---

### Task 9: PlatformContext parking state + WS `vehicle_location`

**Files:**
- Modify: `frontend/src/context/PlatformContext.tsx`

**Interfaces:**
- Produces (context type additions): `parkingMap: MapLevelOut[]`; `parkingPresences: PresenceOut[]`; `refreshParkingMap: () => void`; `locateVehicleInLot: (plate: string) => Promise<LocateOut | null>`; `parkingCheckin/parkingCheckout/upsertParkingLevel/upsertParkingZone/removeParkingLevel/removeParkingZone/setCameraCoverage` mutations following the `createTenantCamera` pattern (guard `activeTenantId`, call api, `refreshParkingMap`, success/error toast).
- WS: `kind === 'vehicle_location'` → update `occupied_count` of the affected zone(s) in `parkingMap` (relocate: from −1, to +1; exited: −1; parked: +1) + update `parkingPresences` in place — **no REST refetch per frame** (same rule as telemetry); `camera_snapshot` → patch `cameras[].lastSnapshotUrl` is optional, may skip.

- [ ] **Step 1: Load** — add `tenantApi.parkingMap(tId)` + `parkingPresence(tId)` to `loadTenantData` `Promise.all`; `setParkingMap`/`setParkingPresences`.
- [ ] **Step 2: WS handler** — extend `ws.onmessage` chain with the `vehicle_location` branch per Interfaces (compute occupancy deltas from `eventType`).
- [ ] **Step 3: Mutations** — all listed, `PlatformContextType` interface + provider value.
- [ ] **Step 4: Typecheck + build** — `npm run lint && npm run build` clean.
- [ ] **Step 5: Commit** — `git commit -m "feat: wire parking map state and vehicle_location frames"`.

---

### Task 10: `TenantParkingMapPage` — layered map view + search/highlight

**Files:**
- Create: `frontend/src/pages/tenant/TenantParkingMapPage.tsx`
- Create: `frontend/src/components/tenant/parking/ParkingMapCanvas.tsx` (level tabs + SVG render)
- Create: `frontend/src/components/tenant/parking/VehicleLocatePanel.tsx` (search + result card)
- Modify: `frontend/src/components/layout/PlatformSidebar.tsx` (new "Sơ Đồ Bãi Xe" button in Monitoring group, `MapPinned` icon), `frontend/src/App.tsx` (`{tenantNavTab === 'parking-map' && <TenantParkingMapPage />}`)

**Interfaces:**
- `ParkingMapCanvas({ levels, selectedLevelId, onSelectLevel, highlightZoneId, editMode?, onZoneClick? })` — renders `level.mapImageUrl` (or dark grid fallback) inside a `viewBox="0 0 100 100"` SVG; zones as `<rect>` scaled from `bounds`; fill = occupancy ratio (`occupiedCount/capacity`, capacity 0 → neutral blue); highlighted zone = 2px animated outline + zone label badge.
- `VehicleLocatePanel({ onLocate, result, searching })` — plate input → `locateVehicleInLot`; result card shows plate, level name/code, zone name/code, `sinceAt`, camera name; `found=false` → "Không tìm thấy xe trong bãi" state.
- `TenantParkingMapPage` — header (site selector when >1 site), `VehicleLocatePanel` left, `ParkingMapCanvas` right; "Chỉnh sửa sơ đồ" toggle visible only for write roles (`owner|admin|operator`) — edit UI lands in Task 11; locate success also auto-selects the level containing the zone.
- Honest-empty: no levels → "Chưa có sơ đồ bãi xe — thêm tầng đầu tiên" CTA (write roles) instead of mock data.

- [ ] **Step 1: Implement `ParkingMapCanvas`** — pure presentational; click zone → `onZoneClick`.
- [ ] **Step 2: Implement `VehicleLocatePanel` + `TenantParkingMapPage`** — wire `usePlatform()` (`parkingMap`, `locateVehicleInLot`); zone-click opens a small popover listing parked plates in that zone from `parkingPresences`.
- [ ] **Step 3: Nav wiring** — sidebar button + App.tsx render + `parking-map` tab type (done Task 8).
- [ ] **Step 4: Typecheck + build** — `npm run lint && npm run build` clean.
- [ ] **Step 5: Commit** — `git commit -m "feat: tenant parking map page with search and zone highlight"`.

---

### Task 11: Map/zone editor + camera coverage UI

**Files:**
- Create: `frontend/src/components/tenant/parking/ParkingLevelEditor.tsx` (level CRUD + image upload)
- Create: `frontend/src/components/tenant/parking/ZoneEditorSheet.tsx` (rect draw/edit + zone form + camera coverage picker)
- Modify: `frontend/src/components/tenant/CameraFormModal.tsx` (purpose `'monitor'` + coverage multi-select + snapshot preview)

**Interfaces:**
- `ParkingLevelEditor({ levels, onSave })` — add/rename/reorder(`sortOrder`)/delete levels; "Tải ảnh sơ đồ" → `parkingMapImagePresign` → `PUT uploadUrl` → PATCH level `mapImageUrl=objectKey`.
- `ZoneEditorSheet({ zone, level, cameras, onSave, onDelete, onClose })` — name/code/capacity fields; drag-to-draw rect on the canvas produces `bounds`; coverage section = checkbox list of the site's `purpose==='monitor'` cameras → `setCameraCoverage(cameraId, zoneIds)`; per-zone assigned cameras shown as chips.
- `CameraFormModal` — purpose select adds `monitor` (label "Camera giám sát khu đỗ"); when `monitor`: zone coverage multi-select (zones of the camera's site) + `lastSnapshotUrl` preview with `snapshotCapturedAt` caption when present.

- [ ] **Step 1: Implement `ParkingLevelEditor`** (modal list, mirrors `CreateSiteModal` styling).
- [ ] **Step 2: Implement rect-draw in canvas edit mode** — pointerdown/move on SVG → rubber-band → on release open `ZoneEditorSheet` prefilled with `bounds`; existing zone click in edit mode opens the sheet for edit/delete.
- [ ] **Step 3: Extend `CameraFormModal`** per Interfaces.
- [ ] **Step 4: Typecheck + build** — `npm run lint && npm run build` clean.
- [ ] **Step 5: Commit** — `git commit -m "feat: parking map editor and monitor-camera coverage UI"`.

---

### Task 12: Public `FindMyCarPage`

**Files:**
- Create: `frontend/src/pages/public/FindMyCarPage.tsx`
- Modify: `frontend/src/App.tsx` (`publicView` init maps `/find-my-car` → `'find-car'`; render branch), `frontend/src/components/layout/PublicNavbar.tsx` (`PublicViewType` + optional nav link)

**Interfaces:**
- `FindMyCarPage({ tenantSlug })` — `?tenant=<slug>` query param; plate input → `publicApi.publicLocateVehicle`; on found, fetches `publicParkingMap` once and renders the same `ParkingMapCanvas` (reused read-only) with the level auto-selected and zone highlighted; not-found state in Vietnamese; shows only `zoneName/zoneCode` + `levelName` + `sinceAt` — no other vehicles' data anywhere.

- [ ] **Step 1: Implement page** — minimal chrome (logo + card), reuse `ParkingMapCanvas` with `editMode={false}`.
- [ ] **Step 2: Routing** — `publicView === 'find-car'` branch; read `tenant` + `plate` query params.
- [ ] **Step 3: Typecheck + build** — `npm run lint && npm run build` clean.
- [ ] **Step 4: Commit** — `git commit -m "feat: public find-my-car page"`.

---

## Notes for executors

- Edge firmware changes live in sibling repos (`parkvision-edge-devices`, `parkvision-edge-client`) — **out of scope** here; `docs/mqtt-camera-detection.md` (Task 4) is the contract they implement against. Gate cameras keep using the existing `.../gates/{id}/telemetry` ANPR path unchanged.
- The whole feature is demo-able without edge: `POST /parking/presence` manual check-in drives the same service path as MQTT detections.
- `TenantLocationPage` already renders site infra — keep this feature as a separate `parking-map` tab; do not merge pages.
