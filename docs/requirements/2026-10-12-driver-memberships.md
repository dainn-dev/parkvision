# Driver Memberships — Phase 2 implementation plan

Branch: `feat/mobile-driver-api` (continues Phase 1) · Execution: native, TDD
where feasible · Base: Phase-1 driver API (see `2026-10-07-mobile-driver-api.md`).

## Product decision (resolves the Phase-1 blocker)

A membership **is** gate access: activation provisions a `RegisteredVehicle`
row (`tag='member'`, `owner_category='member'`, `valid_from/valid_to` =
membership window) so the existing edge `/whitelist` sync + `decide_access`
"vehicle_registered" path opens the barrier — no new access pipeline.

Payment is Phase 3, so purchase cannot auto-activate paid plans honestly.
Flow instead: driver **requests** → `pending` → tenant admin **activates**
(offline payment assumption) → `active` + whitelist row. Phase 3 plugs the
payment gateway into the same `activate` transition; nothing here changes.

## Status machine

`pending → active | rejected | cancelled`
`active  → expired (lazy: ends_at < now, swept on list reads) | revoked
          (tenant) | cancelled (driver)`

Leaving `active` (revoked/cancelled/expired) sets the linked
`RegisteredVehicle.status='suspended'` → gate denies "vehicle_suspended".
Activation on an already-registered plate reuses the row (overwrites
validity window + tag='member'); deactivation suspends it — tenant can
re-enable via existing vehicles UI. One pending/active membership per
(driver, site, plate) enforced in service.

## Schema (migration `0016_driver_memberships`)

- `site_membership_plans`: id, tenant_id, site_id, name(120),
  description(500)?, price_vnd BIGINT (0 = free), duration_days,
  perks JSONB, badge(60)?, status('active'|'inactive'), timestamps.
  tenant RLS policy (platform_bypass OR tenant GUC).
- `driver_memberships`: id, driver_id→driver_users CASCADE,
  plan_id→site_membership_plans, site_id, tenant_id (denormalized for
  filtering + RLS), driver_vehicle_id→driver_vehicles SET NULL,
  plate_number, plate_normalized (snapshot), status(20) default 'pending',
  starts_at?, ends_at?, registered_vehicle_id→registered_vehicles SET NULL,
  admin_note(300)?, timestamps. tenant RLS policy.

## Endpoints

Tenant (csrf + WRITE_ROLES for writes):
- `GET/POST /tenants/{tid}/sites/{site_id}/membership-plans`
- `PATCH /tenants/{tid}/membership-plans/{plan_id}` (incl. deactivate via status)
- `GET /tenants/{tid}/memberships?status=&site_id=` (page)
- `POST /tenants/{tid}/memberships/{mid}/activate|reject|revoke`

Public: `GET /public/sites/{site_id}/plans` — active plans of a listed site.

Driver (bearer, require_driver):
- `GET /driver/memberships` — own memberships, newest first, joined names
- `POST /driver/memberships` {planId, vehicleId} → pending
- `POST /driver/memberships/{id}/cancel`

## Tasks

1. Migration + models + RLS → RED test (table exists).
2. Schemas (`resources.py`: MembershipPlanIn/Out, TenantMembershipOut;
   `driver.py`: PublicPlanOut, DriverMembershipIn/Out) +
   `services/membership_service.py` (plan CRUD, request, list+lazy expiry,
   activate/reject/revoke w/ RegisteredVehicle provisioning + suspend).
3. Tenant router `tenant/memberships.py`; wire in `api/v1/__init__.py`.
4. Driver router `driver/memberships.py` + `GET /public/sites/{id}/plans`.
5. Tests `tests/test_memberships_api.py`: plan CRUD authz, request→pending,
   duplicate rejected, activate→RegisteredVehicle row appears in edge
   whitelist payload + decide_access allows, revoke→deny, expiry sweep,
   public plans hides inactive/unlisted, cross-tenant isolation.
6. Mobile: `MembershipPlan`/`DriverMembership` types, `getSitePlans`,
   `driver.memberships`, `useMemberships`; TenantDetailModal memberships tab
   shows real plans + request flow (pick vehicle → pending state);
   MembershipsScreen renders real cards w/ status.
7. Tenant admin UI (`frontend/`): site plans manager + pending approvals
   list w/ activate/reject/revoke — needed for the loop to be usable.
8. Verify: backend pytest, mobile lint/test/build, frontend typecheck;
   docs; commit.

## Out of scope (Phase 3)

Online payment, auto-activation, fee computation, wallet, refunds.
