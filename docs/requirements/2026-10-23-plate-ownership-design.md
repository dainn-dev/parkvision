# GAP-BE-002: Plate Ownership Enforcement — Design Spec

## Problem

Any authenticated driver can register any plate string via
`POST /driver/vehicles`. The `driver_vehicles` unique constraint is
`(driver_id, plate_normalized)`, so two drivers can independently claim
the same plate. Once claimed, a driver sees all parking sessions
(entry photos, location, fees) and can create payments for that plate.
This leaks private data and creates financial risk.

## Decision

- **One plate, one owner.** Change the unique constraint from
  `(driver_id, plate_normalized)` to `(plate_normalized)` globally.
  Second registration of an already-claimed plate is rejected (409).
- **Vehicle sharing by date.** A new `driver_vehicle_shares` table lets
  the vehicle owner grant read/pay access to another driver for a
  specific calendar date. The share is checked against each session's
  event date in that session site's timezone; the recipient can see and
  pay for sessions for that plate only when the session's local date
  matches the share date.
- **Edge client and tenant admin** scopes are unchanged — they already
  query by tenant/site, not by driver identity.
- **No document upload, OTP, or admin approval.** First registrant is
  the owner. Disputes are handled operationally (out of scope).

## Data model changes

### `driver_vehicles` (modify)

- Drop `uq_driver_vehicle_plate` (driver_id, plate_normalized).
- Add `uq_driver_vehicle_plate_global` (plate_normalized) — globally
  unique.
- Update model docstring to reflect single-owner semantics.

### `driver_vehicle_shares` (create)

```
id              UUID PK default uuid4
vehicle_id      UUID FK → driver_vehicles.id ON DELETE CASCADE NOT NULL
shared_with_id  UUID FK → driver_users.id ON DELETE CASCADE NOT NULL
share_date      DATE NOT NULL
created_at      TIMESTAMPTZ NOT NULL default now()

UNIQUE (vehicle_id, shared_with_id, share_date)
INDEX  (shared_with_id, share_date)  -- fast lookup for "my shares today"
```

Only the vehicle owner can create/delete share rows. The shared-with
driver has read-only session access + payment ability for that plate on
that date.

## API changes

### Vehicle registration (`POST /driver/vehicles`)

- `add_vehicle`: before insert, check if `plate_normalized` exists in
  `driver_vehicles` for *any* driver. If yes, raise 409 with message
  "Plate already registered by another account".
- `update_vehicle`: same check when the plate changes.

### Vehicle sharing (new endpoints)

- `POST /driver/vehicles/{vehicle_id}/shares` — owner creates a share.
  Body: `{ sharedWithEmail: str, shareDate: "YYYY-MM-DD" }`.
  Resolves email → driver_users.id. Returns 201 + share record.
- `GET /driver/vehicles/{vehicle_id}/shares` — owner lists shares for
  their vehicle.
- `DELETE /driver/vehicles/{vehicle_id}/shares/{share_id}` — owner
  revokes a share.
- `GET /driver/shared-vehicles` — driver lists vehicles shared with
  them (today or future).

### Session queries

`_plates()` in `api/v1/driver/sessions.py` currently returns only
owned plates. Change to union of:
1. Owned plates (from `driver_vehicles WHERE driver_id = ?`)
2. Shared plates for today (from `driver_vehicle_shares WHERE
   shared_with_id = ? AND share_date = date.today()`)

### Payment

`_resolve_session` in `payment_service.py` checks
`DriverVehicle.driver_id == driver_id`. Extend to also accept if a
share row exists for that plate on the session's entry date.

### WebSocket

`/ws/driver/sessions` subscribes to channels for owned plates. Add
channels for today's shared plates as well.

## Migration data cleanup

Before adding the global unique constraint, deduplicate existing rows:
for each `plate_normalized` with multiple owners, keep the row with the
earliest `created_at`, delete the rest. This is a data migration step
in the Alembic revision. Confirmed acceptable: no production data
exists yet, so this destructive cleanup carries no real-world risk.

## Out of scope

- Dispute resolution / plate transfer between accounts
- Admin UI for managing shares
- Notification when a share is created/revoked
- OTP/document-based ownership verification
