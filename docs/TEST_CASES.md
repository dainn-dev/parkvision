# ParkVision — Test Case Specification

Detailed test cases for the ParkVision ANPR parking system. Every expected result is
derived from the current source (rules, thresholds and error codes are quoted from code),
not from the older spec documents, several of which are known to be out of date
(see `SPEC_ANALYSIS_AND_PLAN.md` §3.3).

## 1. How to read this document

| Field | Meaning |
|---|---|
| **ID** | `<AREA>-<NN>`; stable, safe to reference from tickets and test names |
| **Pri** | P0 = release blocker (money, access control, tenant isolation, safety); P1 = core flow; P2 = edge / polish |
| **Type** | U = unit, I = integration (API + DB/Redis), E = end-to-end, M = manual / hardware |
| **Auto** | ✅ automated today (file::test) · 🟡 test file exists for this area, case not confirmed — check before writing · ⬜ gap, not automated |

"Auto" status was audited against the test files: backend `tests/*.py` and `tests/e2e/*`
(sections 2–11), the Rust `#[test]` modules (section 12; HAL/EDG judged mostly from test names),
`anpr-worker/edge/test_*.py` (section 13, read but not run) and the two mobile test files.
✅ means a test asserts the Expected column; 🟡 means a test exists but the note says what
is missing; ⬜ means no test found. **No test suite was executed for this document.**
Not audited: `test_cameras.py`, `test_security_and_members.py`, `test_edge_devices.py`
(rows such as TEN-12, RT-10 may already be covered there — grep before writing new tests).

### Scope map

| Area | Code | Test stack | Run with |
|---|---|---|---|
| Backend API | `backend/app` | pytest + httpx `ASGITransport`, real Postgres + Redis | `cd backend && pytest` (needs `*_test` DB) |
| Backend E2E | `backend/tests/e2e` | black-box HTTP + MQTT + WS against compose stack | `python tests/e2e/e2e_api.py` |
| Mobile (driver) | `mobile/src` | Vitest + jsdom | `cd mobile && npm test` |
| Tenant dashboard | `frontend/src` | **no test runner configured** | n/a (see §15) |
| Edge client | `edge-client/src-tauri` | `cargo test` (`#[tokio::test]`, `httpmock`, `MockBackend`) | `cd edge-client/src-tauri && cargo test` |
| ANPR worker | `anpr-worker` | Docker `--target test` | `docker build --target test anpr-worker/` |

### Global preconditions and conventions

- Backend integration tests run only against a database whose name ends in `_test`
  (`conftest.migrated` refuses otherwise). Use `RATE_LIMIT_ENABLED=false`, `MQTT_HOST=localhost`.
- Fixtures: `tenant` (plan `pro`, owner `Password!123`), `other_tenant` (plan `starter`),
  `client`, `driver(client)`; helpers `login`, `csrf`.
- Tenant users authenticate with cookies `vm_access`/`vm_refresh`/`vm_csrf` + header
  `X-CSRF-Token` on mutations. Drivers authenticate with `Authorization: Bearer`.
  `get_auth_context` prefers the cookie, so clear cookies when switching tenant → driver.
- Error envelope: `{"error": {"code", "message", "details"}, "requestId"}`.
  Validation failures → `422 validation_error`; unhandled → `500 internal_error`.

---

## 2. Authentication & session (tenant users)

Endpoints: `/api/v1/auth/*`, `/api/v1/register`.

| ID | Title | Steps / data | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|---|
| AUTH-01 | Login sets cookies | POST `/auth/login` valid owner creds | 200; `data.mfaRequired=false`, `csrfToken` present; cookies `vm_access`, `vm_refresh`, `vm_csrf` set | P0 | I | ✅ test_auth::test_login_sets_cookies_and_me |
| AUTH-02 | `/auth/me` reflects identity | After AUTH-01, GET `/auth/me` | 200; `user.email`, `tenantId`, `userType=tenant_user`, `tenantSlug`, `user.role` | P1 | I | ✅ same |
| AUTH-03 | Wrong password | POST login with wrong password | 401 `invalid_credentials` | P0 | I | ✅ test_bad_login_rejected |
| AUTH-04 | Unknown email gives same response as wrong password | Login `nobody@example.com` | 401 `invalid_credentials`, identical body shape (no user enumeration) | P0 | I | ⬜ |
| AUTH-05 | Lockout after N failures | Send `settings.login_max_attempts` bad logins, then correct password | each bad → 401; next (even correct) → 423 `account_locked` | P0 | I | ✅ test_login_lockout |
| AUTH-06 | Lockout is per account | Lock account A; log in as B | B succeeds | P1 | I | ⬜ |
| AUTH-07 | Disabled account | Set `status=disabled`, login with correct password | 403 `account_disabled` | P0 | I | ✅ test_disabled_account_rejected |
| AUTH-08 | Refresh rotates token | Login, POST `/auth/refresh` | 200; new `vm_refresh` ≠ old; new `csrfToken` | P0 | I | ✅ test_refresh_rotates_and_reuse_revokes |
| AUTH-09 | Refresh-token reuse revokes family | Replay old refresh after `REUSE_GRACE_SECONDS=0`; then use newest | replay → 401; newest token → 401 | P0 | I | ✅ same |
| AUTH-10 | Reuse inside grace window | Replay old refresh within 60 s grace | Not treated as theft (no family revoke); behaviour documented | P1 | I | ⬜ |
| AUTH-11 | Logout revokes session | POST `/auth/logout` with CSRF; GET `/auth/me`; POST `/auth/refresh` | logout 200; `/me` 401; refresh 401 | P0 | I | ✅ test_logout_revokes_session, e2e S12 |
| AUTH-12 | Tampered / expired access token | Send garbage `vm_access`; send expired JWT | 401 for both; no stack trace in body | P0 | I | ⬜ |
| AUTH-13 | JWT algorithm confusion | Token signed with `alg=none` or wrong secret | 401 | P0 | I | ⬜ |
| AUTH-14 | Tenant self-registration | POST `/register` unique slug, `planCode=starter` | 201 with `tenantId`, `ownerUserId`; owner can log in; `/me.tenantSlug`==slug | P1 | I | ✅ test_register_tenant_then_login, e2e S13c/d |
| AUTH-15 | Registration duplicate slug | Register same slug twice | 409 `conflict` | P1 | I | ⬜ |
| AUTH-16 | Registration validation | weak password, bad email, unknown `planCode`, invalid slug chars | 422 `validation_error` (or 4xx), no tenant created | P1 | I | ⬜ |
| AUTH-17 | Invite → activate → login | Owner invites user (role `viewer`); read token from Mailpit; POST `/auth/activate`; login | invite 201 `status=invited`; activate 200; login 200 with `role=viewer` | P1 | E | ✅ e2e S10 |
| AUTH-18 | Activate with invalid / reused token | POST `/auth/activate` bad token; reuse good token | 4xx both; second use fails | P1 | I | ⬜ |
| AUTH-19 | Password forgot never reveals existence | `/password/forgot` for real and unknown email | both 200, same body | P0 | I | ✅ test_password_reset_flow |
| AUTH-20 | Password reset single-use | Reset with token, reuse it | first 200; second 401 `invalid_reset_token`; login with new password works | P0 | I | ✅ same |
| AUTH-21 | Reset token expiry | Token older than TTL | 401 `invalid_reset_token` | P1 | I | ⬜ |
| AUTH-22 | Password reset revokes existing sessions | Login (session S), reset password, use S | S refresh/`me` → 401 | P0 | I | ⬜ |
| AUTH-23 | Rate limit on login | `RATE_LIMIT_ENABLED=true`, burst > limit | 429 after limit; header/body indicates retry | P1 | I | ⬜ |

## 3. MFA (TOTP)

| ID | Title | Steps / data | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|---|
| MFA-01 | Login with MFA enabled stages session | Enable MFA; login | 200 `mfaRequired=true`; `/auth/me` → 401 (pending token rejected) | P0 | I | ✅ test_mfa_full_flow |
| MFA-02 | Verify with valid TOTP | POST `/auth/mfa/verify` current code | 200; `/me` 200 with `mfaVerified=true` | P0 | I | ✅ same |
| MFA-03 | Access token carries `amr` | Decode `vm_access` after verify | `amr == ["pwd","otp"]` | P1 | I | ✅ test_access_token_amr_claim |
| MFA-04 | Wrong code | Verify `000000` | 401 `invalid_mfa_code` | P0 | I | ✅ test_mfa_attempt_budget |
| MFA-05 | Attempt budget exhausted | `mfa_max_attempts` wrong codes | last → 429 `mfa_too_many_attempts`; then correct code → 401 `mfa_session_invalid` | P0 | I | ✅ same |
| MFA-06 | Pending token expiry | `mfa_pending_ttl_seconds=-1`; verify with correct code | 401 `mfa_session_expired` | P1 | I | ✅ test_mfa_pending_token_expires |
| MFA-07 | Session status | GET `/auth/mfa/session` | `status=mfa_required`, `methods` contains `totp`, `0 < expiresIn <= 300` | P2 | I | ✅ test_mfa_session_status_and_resend |
| MFA-08 | Pending token cannot open WebSocket | Connect `/ws` with `mfa_pending` token | connection rejected | P0 | I | ⬜ |
| MFA-09 | TOTP replay | Reuse the same valid code twice within its window | Document behaviour: second use rejected (preferred) or accepted | P1 | I | ⬜ |
| MFA-10 | Setup / enable / disable | `/auth/mfa/setup` → `/enable` with code → `/disable` | secret stored encrypted (not plaintext in DB); flags toggle; disable requires valid code | P1 | I | ⬜ |

## 4. Multi-tenancy, RBAC & CSRF

| ID | Title | Steps / data | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|---|
| TEN-01 | Cross-tenant path forbidden | Tenant A GET `/tenants/{B}/sites` | 403 `forbidden` | P0 | I | ✅ test_tenant_isolation::test_cross_tenant_path_forbidden, e2e S4a |
| TEN-02 | RLS hides other tenant rows | A creates site; B GET list and GET by id (under B's path) | list lacks site; by-id → 404 (invisible, not 403) | P0 | I | ✅ test_rls_hides_other_tenants_rows, e2e S4b |
| TEN-03 | CSRF required on mutation | Delete `vm_csrf` cookie; POST site | 403 | P0 | I | ✅ test_csrf_required_on_mutations, e2e S3a |
| TEN-04 | CSRF mismatch | Valid cookie, header token ≠ cookie | 403 | P0 | I | ⬜ |
| TEN-05 | CSRF not required on GET | GET without header | 200 | P2 | I | ⬜ |
| TEN-06 | Platform admin scoped read | Platform admin GET `/tenants/{id}/sites` | 200; `/me.userType=platform_admin`, `tenantId=null` | P0 | I | ✅ test_platform_admin_scoped_to_target_tenant, e2e S4c |
| TEN-07 | Tenant user cannot reach `/platform/*` | Owner GET a platform route | 403 | P0 | I | ⬜ |
| TEN-08 | Role matrix | For `owner/admin/operator/viewer`: attempt create site, delete vehicle, issue gate command, refund payment, invite user | Allowed/denied per role; viewer is read-only on every mutation. **Gap: the matrix is not documented — confirm with product before asserting** | P0 | I | ⬜ |
| TEN-09 | Cross-tenant ID substitution | A calls `/tenants/{A}/vehicles/{B's vehicle id}` | 404 (RLS) | P0 | I | ✅ e2e S4b |
| TEN-10 | Every tenant table has RLS | Query `pg_policies`/`pg_class.relrowsecurity` for tables with `tenant_id` | all enabled; app connects as non-superuser `vehicle_app` | P0 | I | ⬜ (test_schema_alignment.py has no pg_policies/relrowsecurity check; test_audit_logs_append_only only shows app role is not superuser) |
| TEN-11 | Driver cannot use tenant API and vice versa | Driver bearer → `/tenants/...`; tenant cookie → `/driver/...` | 401/403 | P0 | I | ⬜ |
| TEN-12 | Audit trail | Create vehicle, invite user, issue command; GET `/audit-logs` | actions include `vehicle.created`, `user.invited`, `gate.command.issued` with actor and tenant | P1 | I | ✅ e2e S11 (first two) |
| TEN-13 | Security headers | Any response | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `X-Request-Id` echoed or generated | P2 | I | ⬜ |
| TEN-14 | CORS | Origin not in `cors_origins` | no `Access-Control-Allow-Origin`; credentials only for listed origins | P1 | I | ⬜ |

## 5. Vehicles, rules & access decision (`decide_access`)

Decision order (from `event_service.decide_access`): no plate → deny `no_plate_detected`;
unregistered → deny `plate_not_registered`; `blacklist` tag → deny `vehicle_blacklisted`;
status ≠ active → deny `vehicle_suspended`; `valid_from` in future → `vehicle_not_yet_valid`;
`valid_to` in past → `vehicle_expired`; else allow `vehicle_registered`. Then rules sorted by
`priority`: first matching `deny_list` → deny `rule:<name>` (wins); first matching `allow_list`
→ allow `rule:<name>`.

| ID | Title | Steps / data | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|---|
| VEH-01 | Create vehicle normalises plate | POST `plateNumber="e2e-7777"` | 201; stored normalised `E2E7777`; searchable via `search=E2E 7777` | P1 | I | ✅ e2e S5a |
| VEH-02 | Duplicate plate (case/format-insensitive) | Create `E2E-7777` then `e2e-7777` | 409 `conflict` "already registered" | P0 | I | ✅ e2e S5b |
| VEH-03 | Same plate in two tenants | Create in A and B | both 201 (uniqueness is per tenant) | P0 | I | ⬜ |
| VEH-04 | Plate validation | empty, 1 char, 40 chars, emoji, only symbols (`---`) | 422 or normalised-empty rejected | P1 | I | ⬜ |
| VEH-05 | Bulk CSV import | Upload CSV with valid, duplicate and malformed rows | job created (async); result counts imported/skipped/failed; failures listed with row numbers | P1 | I | ⬜ |
| VEH-06 | Vehicle list pagination & search | >limit rows; `page`, `limit`, `search` | `meta.total` correct; no overlap between pages | P2 | I | ⬜ |
| ACC-01 | No plate | `decide_access(plate=None)` | deny, `no_plate_detected` | P0 | U/I | ⬜ |
| ACC-02 | Unregistered plate | unknown plate | deny, `plate_not_registered` | P0 | I | ⬜ |
| ACC-03 | Registered active vehicle | tag `member`, status active, no window | allow, `vehicle_registered` | P0 | I | ⬜ |
| ACC-04 | Blacklisted | tag `blacklist` | deny, `vehicle_blacklisted` | P0 | I | ⬜ |
| ACC-05 | Suspended | status ≠ active | deny, `vehicle_suspended` | P0 | I | ⬜ |
| ACC-06 | Not yet valid | `valid_from = now+1h` | deny, `vehicle_not_yet_valid` | P0 | I | ⬜ |
| ACC-07 | Expired | `valid_to = now-1m` | deny, `vehicle_expired` | P0 | I | ⬜ |
| ACC-08 | Window boundaries | `valid_from == now`, `valid_to == now` (frozen clock) | `valid_from == now` allowed; `valid_to == now` allowed (strict `<`) — pin current behaviour | P2 | U | ⬜ |
| ACC-09 | Plate format variants | Detected `51F-678.90` vs registered `51F67890` | same vehicle matched via normalisation | P0 | I | ⬜ |
| ACC-10 | Deny rule overrides registered vehicle | active `deny_list` rule matching plate/tag | deny `rule:<name>` | P0 | I | ⬜ |
| ACC-11 | Allow rule overrides unregistered | active `allow_list` rule listing plate | allow `rule:<name>`, `vehicle_id=None` | P0 | I | ⬜ |
| ACC-12 | Rule priority | deny (priority 2) + allow (priority 1) both match | lower `priority` number evaluated first → allow | P0 | I | ⬜ |
| ACC-13 | Inactive rule ignored | `active=false` deny rule | no effect | P1 | I | ⬜ |
| ACC-14 | Rule without conditions applies to all | rule with empty `conditions` | applies to every plate (confirm intended) | P1 | I | ⬜ |
| ACC-15 | Schedule — day of week | rule `daysOfWeek=[1..5]`, frozen clock Saturday | rule skipped | P1 | U | ⬜ |
| ACC-16 | Schedule — time window | `startTime=08:00,endTime=18:00`; clock 07:59 / 08:00 / 18:00 / 18:01 | skipped / applies / applies / skipped (inclusive, string compare in **UTC**) | P1 | U | ⬜ |
| ACC-17 | Schedule timezone caveat | Site in `Asia/Ho_Chi_Minh`, rule `08:00–18:00` | **Code evaluates in UTC, not site-local time.** Record as a known defect/decision before automating | P0 | I | ⬜ |
| ACC-18 | Anti-passback | Allowed ENTRY then ENTRY again within 5 min | second → deny `anti_passback` | P0 | I | ⬜ |
| ACC-19 | Anti-passback different direction | ENTRY then EXIT | allowed | P0 | I | ⬜ |
| ACC-20 | Anti-passback window elapsed | second entry after window | allowed | P1 | I | ⬜ |
| ACC-21 | Anti-passback disabled | tenant `anti_passback_enabled=false`, or window `0`, or garbage value | allowed; garbage falls back to 5 min | P1 | I | ⬜ |
| ACC-22 | Anti-passback after a deny | DENY event then ENTRY | not blocked (only previous *allow* counts) | P1 | I | ⬜ |
| ACC-23 | Rule simulator parity | Frontend `simulateAccessDecision` vs backend for the same inputs | identical decision/reason. **Frontend evaluates client-side — drift risk** | P1 | I | ⬜ |

## 6. Access events, occupancy & presence

| ID | Title | Steps / data | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|---|
| EVT-01 | Allowed entry increments occupancy | Site capacity 100, occupancy 0; allowed ENTRY | `current_occupancy=1` | P0 | I | ⬜ |
| EVT-02 | Allowed exit decrements, floor 0 | occupancy 0; allowed EXIT | stays 0 (never negative) | P0 | I | ⬜ |
| EVT-03 | Denied event leaves occupancy unchanged | denied ENTRY | unchanged | P0 | I | ⬜ |
| EVT-04 | Cap at 2× capacity | capacity 10, occupancy 20, allowed ENTRY | stays 20 | P1 | I | ⬜ |
| EVT-05 | Capacity 0 / unset | capacity 0 | no cap applied (max int) | P2 | I | ⬜ |
| EVT-06 | Concurrent entries | 50 parallel allowed ENTRY events | occupancy == 50 (atomic `UPDATE`, no lost updates) | P0 | I | ⬜ |
| EVT-07 | Exit closes presence | allowed EXIT for plate with open presence | presence row closed | P1 | I | ✅ test_parking.py::test_exit_access_event_closes_presence |
| EVT-08 | Force decision | manual event with `force_decision=allow`, reason omitted | stored decision allow, reason `manual_override` | P1 | I | ⬜ |
| EVT-09 | Event persists raw plate | plate `51F-678.90` | `plate_number` raw, decision made on normalised | P1 | I | ⬜ |
| EVT-10 | Driver hint published | Record event with plate | Redis channel `pv:plate:<normalised>` receives `{type:"session_event", plate, direction, decision, siteId, at}` | P1 | I | 🟡 test_phase4_payments.py::test_record_event_publishes_plate_hint (channel + type only; payload fields not asserted) |
| EVT-11 | Hint failure never breaks gate write | Redis down during event write | event still committed; no exception surfaced | P0 | I | ⬜ |
| EVT-12 | Event list filters | filter by site, direction, decision, date range | correct subset; tenant-scoped | P2 | I | 🟡 test_resources_and_commands.py::test_site_gate_vehicle_flow (gateId filter only) |
| EVT-13 | Partition routing | Insert event with `occurred_at` outside pre-created quarters | lands in DEFAULT partition, no error | P1 | I | ⬜ |

## 7. Gates, commands & realtime (backend ↔ MQTT ↔ WS)

Command lifecycle: `pending → sent → acknowledged | failed | timeout`. API enqueues to
Redis `mqtt:outbox`; mqtt-bridge publishes to `tenants/{t}/sites/{s}/gates/{g}/command`.

| ID | Title | Steps / data | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|---|
| CMD-01 | Issue command | POST `/gates/{id}/commands` `{command:"open"}` + idempotency key | 202/201; row `status=sent`, `correlation_id`, `timeout_at = now + mqtt_command_timeout_seconds`; one item in `mqtt:outbox` with topic and payload `{commandId, correlationId, command, gateId, tenantId, issuedAt}` | P0 | I | 🟡 test_resources_and_commands.py::test_command_idempotency_and_outbox (202/sent/MQTT delivery; correlation_id, timeout_at, payload keys not asserted; needs live EMQX + bridge) |
| CMD-02 | Unsupported command | `command:"explode"` | 400 `bad_request` "Unsupported command"; nothing queued | P0 | I | ⬜ |
| CMD-03 | Gate not in tenant | gate id of tenant B | 404 `not_found` | P0 | I | ⬜ |
| CMD-04 | Idempotent replay | Same key + same command + same gate twice | same row returned; **one** outbox message | P0 | I | ✅ test_resources_and_commands.py::test_command_idempotency_and_outbox + e2e S6c/S6d (no 2nd publish) |
| CMD-05 | Idempotency key reuse, different command/gate | same key, `close` vs `open` | 409 `conflict` with `existingCommandId` | P0 | I | 🟡 test_resources_and_commands.py::test_command_idempotency_and_outbox, e2e S6e (409 conflict; existingCommandId not asserted) |
| CMD-06 | Ack success | `mark_command_ack(success=True)` | `acknowledged`, `acked_at` set | P0 | I | ✅ test_resources_and_commands.py::test_command_ack_marks_row, e2e S6f |
| CMD-07 | Ack failure | `success=False, error="locked"` | `failed`, `error` stored | P0 | I | ⬜ |
| CMD-08 | Ack for unknown id | random uuid | no-op, no exception | P1 | U | ⬜ |
| CMD-09 | Timeout sweep | Command `sent` with `timeout_at` past; run `expire_stale_commands` | `timeout`; returns count; `acknowledged` rows untouched | P0 | I | 🟡 e2e S6h (worker sweep → timeout; no direct expire_stale_commands test, ack'd rows untouched not asserted) |
| CMD-10 | Late ack after timeout | Ack arrives for a `timeout` row | Document: row flips to `acknowledged` (current code overwrites) — decide if intended | P1 | I | ⬜ |
| CMD-11 | Command to offline gate | `mark_offline_devices` has flagged device offline | Command still queued or rejected per product decision (spec §6.3 says disable); assert chosen behaviour | P1 | I | ⬜ |
| RT-01 | Telemetry ingest | Publish telemetry to `tenants/+/sites/+/gates/+/telemetry` | row in `gate_telemetry_logs`; `barrier_gates.status` updated; WS frame `type=telemetry` | P0 | E | 🟡 e2e_realtime S9a (WS telemetry frame; DB row + gate status not asserted) |
| RT-02 | Incident ingest | Publish incident | row in `barrier_incidents`; WS `type=incident` | P0 | E | ⬜ (no incident publish in e2e_realtime.py) |
| RT-03 | Command ack round trip | Issue command → bridge publishes → simulated edge acks | command `acknowledged`; WS `type=command_ack` | P0 | E | ✅ e2e S6f (ack → acknowledged; WS command_ack frame not asserted) |
| RT-04 | Heartbeat updates device | Publish heartbeat | `edge_devices.last_heartbeat_at` updated | P1 | E | ✅ e2e S8 (heartbeat → device online, fresh lastHeartbeatAt) |
| RT-05 | Plate in payload → access event | telemetry payload with `plateNumber` | `access_events` row via `decide_access` | P0 | E | ✅ e2e S7a/S7b/S7c (allow, blacklist deny, unknown deny) |
| RT-06 | Malformed MQTT payload | invalid JSON / missing fields / wrong tenant in topic | bridge logs and continues; no crash; no cross-tenant write | P0 | I | ⬜ |
| RT-07 | Topic tenant spoofing | Edge for tenant A publishes to tenant B's topic | rejected (EMQX ACL) or ignored | P0 | M | 🟡 test_edge_activation.py::test_mqtt_authz_scopes_topics_to_tenant (EMQX authz HTTP hook, not live broker ACL) |
| RT-08 | WS auth & tenant filter | Connect WS as tenant A | receives only A's frames; unauthenticated / other tenant's path → rejected | P0 | I | 🟡 e2e S9b (foreign tenant → 4403), S9c (no token → 4401); MFA-pending case gap |
| RT-09 | WS reconnect | Kill API; client reconnects with backoff | resumes without duplicate subscriptions | P2 | M | ⬜ |
| RT-10 | Offline sweep | Device silent > threshold (config; default 120 s) | `mark_offline_devices` marks offline | P1 | I | ⬜ |
| RT-11 | Health endpoints | `/healthz`, `/readyz` with PG+Redis up, then Redis stopped | `ok`; then `readyz.status=degraded`, `checks.redis.status != up` | P1 | E | ✅ e2e S1 (up case) |
| RT-12 | Metrics endpoint auth | `settings.metrics_token` set; GET `/metrics` without / with bearer | 401 / 200; route label uses template, not raw path | P1 | I | ⬜ |

## 8. Pricing engine (`estimate_fee`)

Defaults used below: `hourly_from=20000`, `block_minutes=60`, `grace_minutes=0`, no daily,
no overnight, tz `UTC`, unless stated. Fee = `ceil(blocks × hourly × block/60)`.
Pure functions: all U-type, table-driven, no DB. File exists: `test_pricing.py` (🟡).

| ID | Title | Input | Expected | Pri | Auto |
|---|---|---|---|---|---|
| PRC-01 | No pricing object | `pricing=None` | `None` | P0 | ✅ test_pricing.py::test_no_pricing_returns_none |
| PRC-02 | No hourly rate | `hourly_from=None` | `None` (mobile shows "—") | P0 | ✅ test_pricing.py::test_no_hourly_rate_returns_none |
| PRC-03 | Exit not after entry | `exit == entry`, `exit < entry` | `0` | P0 | ✅ test_pricing.py::test_zero_or_negative_duration_is_zero |
| PRC-04 | Within grace | grace 15, duration 15 min | `0` | P0 | ✅ test_pricing.py::test_grace_period_free |
| PRC-05 | Just past grace | grace 15, duration 15 min 1 s | `20000` (1 started block; grace is not deducted) | P0 | 🟡 test_pricing.py::test_grace_period_free (16 min only; 15 min 1 s boundary gap) |
| PRC-06 | Partial block rounds up | 30 min | `20000` | P0 | 🟡 test_pricing.py::test_smaller_block_rounding, test_overnight_window_respects_site_timezone (no default 60-min block at 30 min) |
| PRC-07 | Block boundary | 60 min / 60 min 1 s | `20000` / `40000` | P0 | 🟡 test_pricing.py::test_hourly_block_rounding (60/61 min; 60 min 1 s gap) |
| PRC-08 | Custom block size | block 30, 31 min | 2 blocks × 20000 × 0.5 = `20000` | P0 | ✅ test_pricing.py::test_smaller_block_rounding (block 30, hourly 12000, 61 min → 18000) |
| PRC-09 | Non-divisible rate | block 15, hourly 10000, 1 min | `ceil(1 × 10000 × 0.25) = 2500` | P1 | ⬜ (existing tests use exactly divisible rates) |
| PRC-10 | Daily cap | daily 100000, 10 h (base 200000) | `100000` | P0 | 🟡 test_pricing.py::test_daily_cap_per_24h_window (single-window capped case < 24 h gap) |
| PRC-11 | Daily cap across windows | daily 100000, 25 h (base 500000) | `min(500000, 2×100000) = 200000` | P0 | ✅ test_pricing.py::test_daily_cap_per_24h_window (25 h → 200000) |
| PRC-12 | Cap not reached | daily 100000, 3 h | `60000` | P1 | ✅ test_pricing.py::test_daily_cap_per_24h_window (3 h → 60000) |
| PRC-13 | Overnight surcharge | overnight 80000 (22→06), tz `Asia/Ho_Chi_Minh`, entry 21:00 local, exit 07:00 next day | base 200000 + 80000 = `280000` | P0 | ✅ test_pricing.py::test_overnight_window_respects_site_timezone, test_overnight_surcharge_counts_crossings |
| PRC-14 | Overnight not crossed | same config, 08:00–12:00 local | no surcharge | P0 | ✅ test_pricing.py::test_overnight_surcharge_counts_crossings (UTC only) |
| PRC-15 | Two nights | entry day 1 21:00, exit day 3 07:00 | surcharge × 2 | P0 | ✅ test_pricing.py::test_overnight_surcharge_counts_crossings (two nights) |
| PRC-16 | Entry inside window | entry 23:00, exit 02:00 | 1 crossing | P1 | ✅ test_pricing.py::test_overnight_window_respects_site_timezone (entry 22:30 local) |
| PRC-17 | Non-wrapping window | start 1, end 5 | crossings counted within same day only | P2 | ⬜ |
| PRC-18 | start == end hour | 22→22 | 0 crossings (disabled) | P2 | ⬜ |
| PRC-19 | Timezone changes result | same UTC instants, tz `UTC` vs `Asia/Ho_Chi_Minh` | different crossings | P0 | ✅ test_pricing.py::test_overnight_window_respects_site_timezone |
| PRC-20 | Invalid timezone | `"Mars/Base"` or empty | falls back to UTC, no exception | P1 | ⬜ |
| PRC-21 | DST site | tz `America/New_York` across DST change | crossings still correct (document wall-clock behaviour) | P2 | ⬜ |
| PRC-22 | Cap + overnight order | daily cap applied **before** surcharge is added | `min(base, cap) + surcharge` | P0 | ✅ test_pricing.py::test_long_stay_mixed_rules (30 h → 100000 cap + 30000 overnight) |
| PRC-23 | Naive datetimes | tz-naive `entered_at` | defined behaviour (error or assume UTC); no silent wrong fee | P1 | ⬜ |
| PRC-24 | Schema bounds | `block_minutes=0`, negative rate, hours 24+ | rejected by `SitePricing` validation (avoid division by zero) | P0 | ⬜ |
| PRC-25 | Pricing editor round trip | Tenant saves pricing in UI → public site → mobile estimate | same fee in `/driver/sessions/active` and payment creation | P1 | ⬜ (E2E) |

## 9. Driver account API (`/api/v1/driver/*`)

| ID | Title | Steps / data | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|---|
| DRV-01 | Register → me | POST register; GET `/driver/auth/me` bearer | 201 with `accessToken`, `refreshToken`; `me.email` matches | P0 | I | ✅ test_driver_api::test_driver_register_login_me |
| DRV-02 | Duplicate email | Register same email | 409 | P0 | I | ✅ test_driver_duplicate_email_409 |
| DRV-03 | Email case-insensitivity | Register `A@x.com` then `a@x.com` | 409 | P1 | I | ⬜ |
| DRV-04 | Weak password / bad email | short password; invalid email | 422 | P1 | I | ⬜ |
| DRV-05 | Login | valid / invalid creds | 200 tokens / 401 | P0 | I | ✅ test_driver_api.py::test_driver_login_wrong_password (401) + conftest driver() helper for valid login |
| DRV-06 | Refresh rotation & reuse | rotate, replay old | rotated token differs; replay 401 | P0 | I | ✅ test_driver_refresh_rotates_and_reuse_revokes |
| DRV-07 | Logout revokes refresh | logout with refresh token, then refresh | 401 | P0 | I | 🟡 |
| DRV-08 | Change password | wrong current / correct current | 4xx / 200; other sessions revoked | P0 | I | ⬜ |
| DRV-09 | Update profile | PATCH `fullName`, `phone=null` | persisted; unknown fields ignored | P2 | I | ⬜ |
| DRV-10 | Auth session list & revoke | list; DELETE one | revoked session's refresh fails; cannot revoke another driver's session (404) | P0 | I | ⬜ |
| DRV-11 | Add vehicle — plate too short | `plate_number="51A"` | `ValidationError` | P1 | U | ✅ test_vehicle_in_rejects_short_plate |
| DRV-12 | Vehicle CRUD | add / update / delete; `isPrimary` | only one primary per driver; deleting primary behaviour defined | P1 | I | ✅ test_driver_api.py::test_vehicle_crud_and_primary (PATCH step not covered) |
| DRV-13 | Vehicle isolation | Driver A PATCH/DELETE driver B's vehicle | 404 | P0 | I | 🟡 test_driver_api.py::test_vehicle_not_owned_404 (DELETE only; PATCH gap) |
| DRV-14 | Duplicate plate per driver | add same plate twice | 409 | P1 | I | ✅ test_driver_api.py::test_vehicle_crud_and_primary (duplicate → 409) |
| DRV-15 | Favorites | PUT/DELETE `/driver/favorites/{siteId}` idempotent; unknown / unlisted site | repeat PUT 2xx; unknown → 404 | P2 | I | 🟡 test_driver_api.py::test_favorites_roundtrip (repeat PUT + unknown site gap) |
| DRV-16 | Public site listing | GET listed sites with lat/lng | only `listed=true`, active site + active tenant; `distanceMeters` populated when coordinates supplied; capacity status derived | P0 | I | ✅ test_driver_api.py::test_public_sites_radius_filters_and_sorts, test_public_sites_without_coords_returns_all_listed, test_capacity_status_thresholds |
| DRV-17 | Unlisted/inactive site hidden | site `listed=false`; tenant suspended | not returned; direct GET → 404 | P0 | I | ✅ test_driver_api.py::test_public_sites_hides_unlisted_and_inactive_tenant, test_public_site_detail_unlisted_404 |
| DRV-18 | Active sessions | driver vehicle has allowed ENTRY, no EXIT | session `PARKED` with `durationSeconds`, `feeVnd` = `estimate_fee(now)` | P0 | I | 🟡 test_driver_api.py::test_active_session_after_entry (PARKED + duration; feeVnd not asserted) |
| DRV-19 | Session history pagination | page/limit; `meta.total` | newest first; only own plates | P1 | I | 🟡 test_driver_api.py::test_no_active_session_after_exit_and_history_has_pair (total + COMPLETED; page/limit/order gap) |
| DRV-20 | Session pairing (LIFO per plate+site) | ENTRY, ENTRY, EXIT | exit pairs with the latest entry | P1 | I | ⬜ |
| DRV-21 | Plates of other drivers invisible | Two drivers, different plates | no leakage in sessions or history | P0 | I | 🟡 test_driver_api.py::test_sessions_only_for_own_plates (active only; history gap) |
| DRV-22 | Realtime hint socket | Driver WS subscribes; event recorded for own plate | receives `session_event`; for other plate nothing | P1 | I | ⬜ |

## 10. Memberships

Lifecycle: `pending → active | rejected | cancelled`; `active → expired | revoked | cancelled`.
Activation creates/updates a `RegisteredVehicle` (tag `member`, window `now → now+duration_days`).

| ID | Title | Steps / data | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|---|
| MEM-01 | Tenant creates plan | POST plan (name, price, duration, perks) | 201; appears in public plans for listed site | P1 | I | ✅ test_memberships_api.py::test_plan_crud, test_public_plans_listed |
| MEM-02 | Plan on foreign site | site id of another tenant | 404 `not_found` | P0 | I | ⬜ |
| MEM-03 | Update plan ignores nulls | PATCH `{price_vnd: null}` | field unchanged | P2 | I | ⬜ |
| MEM-04 | Driver requests membership | POST `{planId, vehicleId}` | 201 `status=pending` | P0 | I | ✅ test_memberships_api.py::test_request_membership_pending |
| MEM-05 | Inactive plan / unlisted site | plan `status != active`, or site unlisted | 404 | P0 | I | 🟡 test_memberships_api.py::test_request_inactive_plan_404 (unlisted-site case gap) |
| MEM-06 | Foreign vehicle | vehicle of another driver | 404 | P0 | I | ✅ test_memberships_api.py::test_request_rejects_foreign_vehicle |
| MEM-07 | Duplicate pending/active | second request same vehicle+site | 409 | P0 | I | 🟡 test_memberships_api.py::test_request_duplicate_conflict (pending only; active case gap) |
| MEM-08 | Re-request after terminal state | after `rejected`/`cancelled`/`expired`/`revoked` | allowed | P1 | I | ⬜ |
| MEM-09 | Operator activates | PATCH activate pending | `active`; `starts_at/ends_at` set; whitelist vehicle `tag=member`, `status=active`, `valid_to = ends_at` | P0 | I | 🟡 test_memberships_api.py::test_activate_creates_whitelist_vehicle (status, endsAt, allow; tag/valid_to not asserted) |
| MEM-10 | Activated member passes gate | `decide_access` for member plate | allow `vehicle_registered` | P0 | I | ✅ test_memberships_api.py::test_activate_creates_whitelist_vehicle, test_payments_api.py::test_ipn_paid_activates_membership |
| MEM-11 | Activate non-pending | activate an `active` one | 409 "not pending" | P0 | I | 🟡 test_memberships_api.py::test_reject_pending_then_activate_409 (rejected→409; already-active gap) |
| MEM-12 | Activation blocked by blacklist | plate already `blacklist` in tenant | 409 "Plate is blacklisted in this tenant" | P0 | I | ⬜ |
| MEM-13 | Activation reuses existing vehicle | plate already registered | same row updated (tag/window/status), no duplicate | P1 | I | ⬜ |
| MEM-14 | Reject | pending → rejected with note | `rejected`; non-pending → 409 | P1 | I | 🟡 test_memberships_api.py::test_reject_pending_then_activate_409 (reject non-pending gap) |
| MEM-15 | Revoke | active → revoked | whitelist suspended; gate now denies `vehicle_suspended` | P0 | I | ✅ test_memberships_api.py::test_revoke_suspends_gate_access |
| MEM-16 | Driver cancel | pending or active → cancelled | active also suspends whitelist; terminal → 409 | P0 | I | 🟡 test_memberships_api.py::test_driver_cancel_pending_and_active (terminal 409 gap) |
| MEM-17 | Lazy expiry | `ends_at` in past, then list | `expired`; vehicle suspended; gate also denies via `valid_to` | P0 | I | 🟡 test_memberships_api.py::test_expired_membership_swept_and_denied (accepts vehicle_suspended OR vehicle_expired — loose) |
| MEM-18 | Tenant isolation of requests | Tenant B lists/activates tenant A's membership | not visible / 404 | P0 | I | ⬜ |

## 11. Payments & wallet

Rules from `payment_service` / `wallet_service`: top-up range **10,000–50,000,000 VND**, method
`momo` only; amounts server-computed; `created` expires after `payment_ttl_minutes`;
terminal states `paid, failed, cancelled, expired, refunded` are never mutated again;
wallet balance can never go negative; refunded top-up claws back only if balance covers it.
Gateway is faked at `payment_service.get_gateway` in tests (`FakeGateway`).

### 11.1 Creation

| ID | Title | Steps / data | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|---|
| PAY-01 | Membership payment (MoMo) | pending membership, price 900000 | 201; `status=created`, `amountVnd=900000`, `payUrl`, `provider=momo`, `providerOrderId=pv-<id>`, `expires_at` set | P0 | I | 🟡 test_payments_api.py::test_create_membership_payment (provider, expires_at not asserted) |
| PAY-02 | Amount is server-side | body includes tampered amount for membership/session | ignored/rejected; amount from plan or `estimate_fee` | P0 | I | ⬜ |
| PAY-03 | Gateway not configured | `get_gateway → None`, method momo | 503 `payments_not_configured` | P0 | I | ✅ test_payments_api.py::test_payments_not_configured |
| PAY-04 | Membership not pending | active/cancelled membership | 409 "Membership is X, not pending" | P0 | I | 🟡 test_payments_api.py::test_active_membership_payment_rejected (active only; message not checked) |
| PAY-05 | Free plan | `price_vnd=0` | 400 "nothing to pay" | P1 | I | ⬜ |
| PAY-06 | Foreign membership | other driver's membership | 404 | P0 | I | ⬜ |
| PAY-07 | Double payment | second create while first `created` or `paid` | 409 "already in flight or paid" | P0 | I | 🟡 test_payments_api.py::test_duplicate_in_flight_conflict (created only; already-paid gap) |
| PAY-08 | Re-pay after failure/cancel/expiry | first is `failed`/`cancelled`/`expired` | allowed | P0 | I | 🟡 test_payments_api.py::test_cancel_then_recreate (cancelled only; failed/expired gap) |
| PAY-09 | Session payment while parked | allowed ENTRY 2 h ago, pricing set | `amountVnd = estimate_fee(entry, now)` | P0 | I | 🟡 test_payments_api.py::test_paid_exit_grants_single_exit (asserts amount >= 10000 only) |
| PAY-10 | Session payment after exit | paired EXIT exists | fee uses exit time | P1 | I | ✅ test_payments_api.py::test_session_payment_amounts_from_pricing_rules (3 h × 10k → 30000) |
| PAY-11 | Session not owned / invalid id | foreign plate; non-uuid; deny/exit event id | 404 | P0 | I | 🟡 test_payments_api.py::test_session_payment_foreign_plate_404 (non-uuid, deny/exit event ids gap) |
| PAY-12 | Site without pricing | no `hourly_from` | 422 "fee is not estimable" | P0 | I | ✅ test_payments_api.py::test_session_payment_no_pricing_422 |
| PAY-13 | Free session | within grace | 400 "nothing to pay" | P1 | I | ⬜ |
| PAY-14 | Top-up bounds | 9,999 / 10,000 / 50,000,000 / 50,000,001 / missing | 400 / 201 / 201 / 400 / 400 | P0 | I | 🟡 test_phase4_payments.py::test_topup_bounds (0, 5000, 99M, missing → 400; exact edges 9,999/10,000/50,000,000/50,000,001 gap) |
| PAY-15 | Top-up via wallet forbidden | `method=wallet, kind=topup` | 400 | P0 | I | ✅ test_phase4_payments.py::test_topup_bounds (wallet-method topup → 400) |
| PAY-16 | `amountVnd` on non-topup | membership + `amountVnd` | 400 | P1 | I | ⬜ |
| PAY-17 | Unknown kind | `kind="gift"` | 400 | P2 | I | ⬜ |
| PAY-18 | Provider rejects order | `create_payment` raises `MomoRejected` | payment row `failed` persisted; 409 "rejected" | P0 | I | ⬜ |
| PAY-19 | Wallet payment success | balance ≥ amount | 201 immediately `paid`; ledger `spend_debit`; balance reduced; membership activated | P0 | I | ✅ test_phase4_payments.py::test_wallet_pay_membership_no_gateway, test_wallet_refund_credits_back |
| PAY-20 | Wallet insufficient balance | balance < amount | 409 "Insufficient wallet balance"; **no payment row, no partial debit** (atomic rollback) | P0 | I | 🟡 test_phase4_payments.py::test_wallet_pay_insufficient_409 (status only; no-row/no-debit not asserted) |
| PAY-21 | Wallet payment needs no gateway | gateway None, method wallet | succeeds | P1 | I | ✅ test_phase4_payments.py::test_wallet_pay_membership_no_gateway |

### 11.2 IPN, refresh, cancel, expiry

| ID | Title | Steps / data | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|---|
| PAY-30 | IPN success | valid signature, `resultCode=0`, known order | payment `paid`, `paid_at`, `provider_trans_id`; membership auto-activated / wallet credited | P0 | I | ✅ test_payments_api.py::test_ipn_paid_activates_membership, test_topup_paid_credits_wallet (provider_trans_id not asserted) |
| PAY-31 | IPN invalid signature | tampered body | 400 "Invalid signature"; payment unchanged | P0 | I | 🟡 test_payments_api.py::test_ipn_bad_signature_400 (no payment → 'unchanged' not verified) |
| PAY-32 | IPN failure code | `resultCode≠0` | payment `failed`; no side effects | P0 | I | ✅ test_payments_api.py::test_ipn_failed_marks_payment_failed |
| PAY-33 | IPN idempotent | send same success IPN twice | second → `{"resultCode":0,"message":"already processed"}`; **single** wallet credit / activation | P0 | I | 🟡 test_payments_api.py::test_ipn_paid_activates_membership (replay → 200; body + single credit not asserted) |
| PAY-34 | IPN unknown order | valid signature, unknown `orderId` | 200-shaped `unknown order` | P1 | I | ⬜ |
| PAY-35 | IPN after cancel/expiry | status terminal | not mutated, "already processed" | P0 | I | ⬜ |
| PAY-36 | IPN amount mismatch | signed IPN with different `amount` than stored | **Code does not compare amounts.** Raise as a defect/decision; assert chosen behaviour | P0 | I | ⬜ |
| PAY-37 | IPN concurrency | 10 parallel identical IPNs | exactly one credit/activation (row-level safety) | P0 | I | ⬜ |
| PAY-38 | Pull refresh | GET payment while `created`; gateway `query_status=paid` | becomes `paid` with side effects; `failed` → `failed`; `pending` → unchanged | P1 | I | 🟡 test_payments_api.py::test_get_payment_pulls_gateway_status (paid only) |
| PAY-39 | Cancel | `created` → cancel | `cancelled`; paid/terminal → 409 | P1 | I | 🟡 test_payments_api.py::test_cancel_then_recreate (cancel created; 409 on terminal gap) |
| PAY-40 | Expiry sweep | `expires_at` past; list/get | status `expired`; wallet payments (no expiry) unaffected | P1 | I | ⬜ |
| PAY-41 | Payment visibility | driver A GET driver B's payment | 404 | P0 | I | ⬜ |
| PAY-42 | Activation failure after payment | plate blacklisted when IPN arrives | payment stays `paid`; membership `admin_note="payment received; activation failed: …"` (no money lost, operator alerted) | P0 | I | ⬜ |

### 11.3 Wallet ledger

| ID | Title | Steps / data | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|---|
| WAL-01 | Empty wallet | driver without wallet row | GET → `balanceVnd=0`, `transactions=[]` | P1 | I | ⬜ |
| WAL-02 | Top-up credit | paid topup 100000 | balance +100000; txn `topup_credit`, `balance_after_vnd` correct | P0 | I | ✅ test_phase4_payments.py::test_topup_paid_credits_wallet (balance_after_vnd not asserted) |
| WAL-03 | Ledger invariant | after N mixed operations | `balance == last balance_after == Σ(credits) − Σ(debits)` | P0 | I | ⬜ |
| WAL-04 | Concurrent spends | balance 100000, two parallel 80000 spends | exactly one succeeds (`SELECT FOR UPDATE`); balance never < 0 | P0 | I | ⬜ |
| WAL-05 | Txn list order & limit | >20 txns | newest first, default 20 | P2 | I | ⬜ |
| WAL-06 | Note truncated | note > 255 chars | stored ≤ 255, no error | P2 | U | ⬜ |
| WAL-07 | Top-up has no tenant | topup row | `tenant_id` NULL; invisible in tenant feed | P0 | I | 🟡 test_phase4_payments.py::test_topup_tenant_cannot_refund_404 (feed exclusion gap) |

### 11.4 Paid exit & tenant refunds

| ID | Title | Steps / data | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|---|
| PEX-01 | Paid session grants one exit | unregistered plate, paid `session` payment within grace (default 15 min), EXIT at that site | allow `paid_exit`; `exit_granted_at` set | P0 | I | ✅ test_payments_api.py::test_paid_exit_grants_single_exit (exit_granted_at not asserted) |
| PEX-02 | Grant is single-use | second EXIT with same payment | deny | P0 | I | ✅ test_payments_api.py::test_paid_exit_grants_single_exit (reason not asserted) |
| PEX-03 | Outside grace | paid 16 min ago | deny `plate_not_registered` | P0 | I | ⬜ |
| PEX-04 | Tenant grace override | `paid_exit_grace_minutes=30`, paid 20 min ago | allow | P1 | I | ⬜ |
| PEX-05 | Blacklist never overridden | blacklisted plate + paid | deny `vehicle_blacklisted` | P0 | I | ✅ test_payments_api.py::test_blacklisted_plate_paid_exit_still_denied |
| PEX-06 | Deny rule beats paid exit | matching `deny_list` rule | deny; payment **not** consumed | P0 | I | ⬜ |
| PEX-07 | Wrong site / ENTRY direction | paid for site A, exit at site B; ENTRY | deny | P0 | I | ⬜ |
| PEX-08 | Anti-passback consumption | paid exit ends up denied by anti-passback | payment not consumed (`_stamp_final` only on allow) | P1 | I | ⬜ |
| REF-01 | Refund wallet payment | tenant refunds paid wallet payment | status `refunded`, `refunded_at`; ledger `refund_credit`; balance restored | P0 | I | ✅ test_phase4_payments.py::test_wallet_refund_credits_back |
| REF-02 | Refund MoMo payment | paid momo with `trans_id` | gateway `refund(order_id, trans_id, amount)` called once; status `refunded` | P0 | I | 🟡 test_payments_api.py::test_refund_momo_membership_revokes (gateway called; exactly-once + trans_id not asserted) |
| REF-03 | Missing trans id | paid via pull-refresh (no `trans_id`) | 409 "refund via the MoMo console"; status unchanged | P1 | I | ⬜ |
| REF-04 | Provider refuses refund | `MomoRejected` | 409; status stays `paid` | P0 | I | ⬜ |
| REF-05 | Refund non-paid | `created`/`failed`/already `refunded` | 409 "not paid" | P0 | I | 🟡 test_payments_api.py::test_refund_unpaid_payment_409 (created only) |
| REF-06 | Tenant cannot refund top-up | topup payment | 404 (invisible) or 409 | P0 | I | ✅ test_phase4_payments.py::test_topup_tenant_cannot_refund_404 |
| REF-07 | Refund activated membership | active membership | `revoked`, whitelist suspended, `admin_note` appended; gate denies | P0 | I | 🟡 test_payments_api.py::test_refund_momo_membership_revokes (admin_note + gate deny not asserted) |
| REF-08 | Refund pending membership | pending | `rejected` | P1 | I | ⬜ |
| REF-09 | Refund session payment | session paid, exit not yet used | status flips; later EXIT no longer matches `paid` → deny | P0 | I | ⬜ |
| REF-10 | Cross-tenant refund | Tenant B refunds tenant A payment | 404 | P0 | I | ✅ test_refund_foreign_tenant_404 |
| REF-11 | Refund authorisation | viewer / operator role | per role matrix (TEN-08) | P0 | I | ⬜ |
| REF-12 | Double refund | two parallel refund calls | one succeeds; no double credit | P0 | I | ⬜ |
| REF-13 | Tenant payments feed | filters `status`, `kind`, `siteId`, pagination | only own tenant; `meta.total` matches; driver name/email included; topups excluded | P1 | I | 🟡 test_phase4_payments.py::test_tenant_lists_payments (filters, pagination, total, topup exclusion gap) |

## 12. Edge client (Rust / Tauri)

Gate state machine (`fsm.rs`): states `Closed, Opening, Open, Closing, Locked, Fault`.
Defaults: stuck timeout **1.5 s**, auto-close **2.5 s** after loop clears, overcurrent **8.5 A**,
FSM tick **50 ms**. `request_open/close` rejected only in `Locked`/`Fault`.
Time is injected (`tick(now, dt)`), so all cases are deterministic with `SimulatedHal`.

### 12.1 Finite state machine

| ID | Title | Steps / data | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|---|
| FSM-01 | Full cycle | `request_open`; drive 1.6 s; loop clear; drive 5 s | `Opening → Open → Closing → Closed` | P0 | U | ✅ fsm::full_cycle_closed_open_open_closing_closed |
| FSM-02 | Stuck while opening | open, `inject_stuck` at 300 ms, drive 3 s | `Fault`; exactly **one** `Incident{kind:"fault", severity:"critical"}`; motor cut (angle frozen) | P0 | U | ✅ fsm::stuck_during_opening_faults_and_reports_incident |
| FSM-03 | Hold open while loop active | loop occupied 4 s+ | stays `Open`; closes ≥ 2.5 s after loop clears, not before | P0 | U | ✅ fsm::open_holds_while_loop_active_then_auto_closes_2_5s_after_clear |
| FSM-04 | Loop re-occupied resets timer | loop clears 2 s, re-occupied, clears again | auto-close timer restarts from second clear | P0 | U | ⬜ |
| FSM-05 | Overcurrent | current 8.6 A while energized | `Fault`, motor cut, one critical incident with current/angle in message | P0 | U | ⬜ |
| FSM-06 | Current exactly 8.5 A | boundary | no fault (strict `>`) | P2 | U | ⬜ |
| FSM-07 | Overcurrent while idle | current high in `Closed`/`Open` | ignored (only while `Opening`/`Closing`) | P1 | U | ⬜ |
| FSM-08 | Stuck while closing | stuck at >0° during `Closing` | `Fault`, incident "target 0° not reached" | P0 | U | ⬜ |
| FSM-09 | Incident de-duplication | stay in `Fault` for 10 s | still one incident (`fault_reported`) | P0 | U | ⬜ |
| FSM-10 | Request open in Fault/Locked | | `Err(Fault)` / `Err(Locked)`; HAL not energised | P0 | U | 🟡 fsm::locked_gate_rejects_open_and_close (Locked only; Fault case + "not energised" gap) |
| FSM-11 | Request open when already open/opening | | `Ok`, no second `energize_open` | P1 | U | ⬜ |
| FSM-12 | Request close when closed/closing | | `Ok`, no second `energize_close` | P1 | U | ⬜ |
| FSM-13 | Lock cuts motor | lock from `Opening` | state `Locked`; motor cut; second `lock` no-op | P0 | U | 🟡 same test covers lock from Closed only |
| FSM-14 | Unlock restores prior state | lock from `Open` (angle ≥ 90) → unlock; lock from `Opening` (angle < 90) → unlock; lock from `Closed` → unlock | `Open`; `Closed`; `Closed` | P0 | U | 🟡 only Closed→lock→unlock covered |
| FSM-15 | Unlock when not locked | | `Err(NotLocked)` | P1 | U | ⬜ |
| FSM-16 | Reboot only from Fault/Locked | reboot from `Closed`, `Open` | `Err(NotFaulted)`; from `Fault`: power-cycle + home-calibrate, state `Closed`, `fault_reported` reset so next fault reports again | P0 | U | 🟡 fsm::reboot_from_fault_recovers_to_closed, reboot_from_healthy_state_is_rejected (Closed only; `fault_reported` reset + Open case gap) |
| FSM-17 | Relay link loss/recovery | `link_ok` false then true | one `barrier_link_down` (warning) then one `barrier_link_up` (info); state unchanged | P1 | U | ✅ fsm::link_down_and_up_emit_one_incident_each |
| FSM-18 | No-feedback boards (`auto_close=None`) | contact relay; angle goes to 0 | `Open → Closed` when angle 0; FSM never pulses close | P0 | U | ✅ fsm::passive_close_when_board_owns_auto_close (+ manual_close_still_pulses_with_board_auto_close) |
| FSM-19 | Long stuck timeout on relay gates | tuning `stuck_timeout` larger | no premature fault | P1 | U | ✅ fsm::stuck_timeout_is_tunable |

Note: the `fsm.rs` test module has 13 tests; FSM-04…FSM-09, FSM-11/12/15 are confirmed gaps.
The only overcurrent test (`infinite_overcurrent_never_faults`) asserts the opposite direction
with an infinite threshold, so FSM-05 (default 8.5 A → Fault) is untested.

### 12.2 Barrier HAL & relay backends

Backends: Hikvision / Dahua alarm-out (HTTP digest), LCUS serial (CRC16), Modbus TCP/RTU,
ZKTeco C3 (TCP 4370). Use `MockBackend` (`fail_next`, `fail_off`, `attempts`, `outputs`) and
`httpmock` for HTTP backends.

| ID | Title | Steps / data | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|---|
| HAL-01 | Open pulse | `energize_open` on contact HAL | output ON on configured channel, then OFF after pulse width | P0 | U | 🟡 hal/contact.rs |
| HAL-02 | Fail-safe OFF | `fail_off=true` | retries/escalates; incident raised; relay not left ON silently | P0 | U | 🟡 |
| HAL-03 | Transient failure retry | `fail_next=2` | succeeds after retries; attempts recorded | P0 | U | 🟡 |
| HAL-04 | Persistent failure | `fail_next` > retries | error surfaced; `link_ok=false` | P0 | U | 🟡 |
| HAL-05 | Never blocks FSM tick | relay op takes 5 s (delayed mock) | FSM tick still returns within budget (per-gate actor) | P0 | U | ⬜ |
| HAL-06 | Commands serialised per gate | open+close issued back-to-back | executed in order, no interleaved outputs | P0 | U | ⬜ |
| HAL-07 | Digest auth (Hikvision/Dahua) | `httpmock` returns 401 + challenge then 200 | second request carries valid Digest header; wrong password → error, no loop | P0 | U | 🟡 backends/digest.rs |
| HAL-08 | LCUS frame/CRC | known vectors | bytes match protocol; bad CRC reply rejected | P1 | U | 🟡 |
| HAL-09 | Modbus coils/inputs | mock server | correct function codes; timeout handled | P1 | U | 🟡 |
| HAL-10 | ZKTeco C3 | mock TCP server on 4370 | session/checksum correct; reconnect after drop | P1 | U | 🟡 |
| HAL-11 | Loop sensor via input | `read_inputs` returns `[true]`/`None` | `loop_active` mapped; `None` → unknown handled | P1 | U | ✅ contact::inputs_drive_angle_and_loop, empty_input_snapshot_keeps_previous_state + per-backend read_inputs tests |
| HAL-12 | Probe | `probe` ok/fail | link state updates | P1 | U | ⬜ |
| HAL-13 | Hardware smoke | Real board: open/close, pull cable | physical pulse; link-down incident within expected time | P0 | M | ⬜ |
| HAL-14 | Safety: obstruction | Vehicle on loop while closing (real gate) | barrier does not close on vehicle (board safety loop) | P0 | M | ⬜ |

### 12.3 Config, activation, sync, queue

| ID | Title | Steps / data | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|---|
| EDG-01 | Config v3 round trip | save/load `gates[].barrier` | unchanged; older versions migrated | P0 | U | 🟡 config.rs |
| EDG-02 | Backend refresh keeps local barrier | activation pulls new config lacking `barrier` | local `barrier` settings preserved (AGENTS.md rule) | P0 | U | 🟡 activation.rs |
| EDG-03 | Activation success | valid activation code | device credentials stored; API key stored securely | P0 | I | ✅ test_edge_activation.py::test_activate_returns_bundle_and_mints_credential (backend side; edge-side secure storage not covered) |
| EDG-04 | Activation invalid/used/expired code | | 4xx; no credentials stored | P0 | I | ✅ test_edge_activation.py::test_activate_wrong_code_401, test_activate_expired_code_410, test_activate_consumed_code_rejected |
| EDG-05 | Secrets redacted | `format!("{:?}", config)` | API key and relay passwords show redacted | P0 | U | ✅ config::api_key_is_redacted_in_debug, hal/config::backend_password_redacted_in_debug |
| EDG-06 | Offline queue | network down; events produced; network up | events persisted in SQLite, replayed in order, none lost, none duplicated | P0 | I | 🟡 store.rs / sync.rs |
| EDG-07 | Queue durability | kill process mid-queue | pending items present after restart | P0 | I | ⬜ |
| EDG-08 | Offline whitelist decision | backend unreachable | gate decides from cached whitelist; unknown plate denied | P0 | I | ⬜ |
| EDG-09 | MQTT reconnect | broker restarts | client reconnects; resubscribes to command topic | P1 | I | 🟡 mqtt.rs |
| EDG-10 | Command handling | MQTT `open` for locked gate | ack `failed` with reason `locked` | P0 | I | ✅ commands::open_while_locked_acks_failure_locked |
| EDG-11 | Command dedupe | same `commandId` delivered twice (QoS 1) | executed once, stored ack replayed | P0 | I | ✅ commands::duplicate_command_id_replays_stored_ack_without_reexecuting, store::command_dedup_survives_reopen |
| EDG-12 | Telemetry cadence | run 10 s | heartbeat ~5 s; telemetry payload schema valid | P1 | I | 🟡 telemetry.rs |
| EDG-13 | Camera pipeline → access | detected plate → decision → FSM open | open requested only if allowed **and** loop condition per pipeline | P0 | I | 🟡 pipeline.rs / access.rs |
| EDG-14 | Kiosk UI lock | set password, verify right/wrong, clear, restart app | argon2 hash only in `edge-lock.json` (no plaintext); wrong password → `false`; with a password configured the app starts locked; API token unaffected | P2 | U | ✅ lock.rs::set_then_verify_roundtrip, clear_disables |
| EDG-16 | Offline ANPR event flush | publisher disconnected, ANPR event, reconnect | event queued in outbox, flushed on reconnect | P0 | I | ✅ runtime.rs::offline_anpr_event_flushes_on_reconnect |
| EDG-15 | Kiosk UI typecheck | `npm run lint` | passes | P2 | U | ⬜ (not in CI) |

## 13. ANPR worker

| ID | Title | Steps / data | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|---|
Derived from `anpr-worker/edge/` (`ocr_engine.py`, `vehicle_tracker.py`, `camera_runtime.py`,
`ipc_protocol.py`, `camera_ingest_client.py`). Existing pytest files live in `anpr-worker/edge/test_*.py`
(not run for this document). Key facts the cases rely on:

- **There is no Vietnamese plate-format validation.** `normalize_vietnamese_plate` only strips accents,
  maps Đ→D, uppercases and keeps `A-Z0-9` (`51F-678.90` → `51F67890`). No regex, no length check,
  no O/0 or I/1 correction. Junk is dropped only if it normalises to empty or is below the OCR threshold.
- Plate/vehicle events go to the backend over **HTTP** (`PlateRecognized`, `VehicleDetected`,
  `SnapshotSaved`), not MQTT and not the stdout IPC. Stdout JSON lines carry IPC events only.
- Deduplication is per track + per normalised plate; there is no time-based plate debounce.
- RTSP reconnect is a **fixed delay** (`--reconnect-seconds`, default 2 s), no backoff, no retry cap.

| ID | Title | Steps / data | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|---|
| ANP-01 | Dry-run (config check) | Copy the sample config and point `camera.source.path` at a real image (the sample's `../backend/test_image.png` does not exist); `python run_camera_pipeline.py --config <cfg> --dry-run` | exit 0; logs show source `ready` with image size, then motion / vehicle_detection / plate_detection / ocr / tracking / snapshot / event / ingest all `status:"skipped"`; **no models loaded, no events emitted, no output dir created** | P1 | I | 🟡 test_camera_config.py (`dry_run()` reads image, creates no dir) |
| ANP-01b | Dry-run with missing image | sample config unchanged | exit 3, message `camera.source.path ... does not exist` | P2 | I | ⬜ |
| ANP-01c | Dry-run sequence | `--dry-run-sequence static` / `moving-vehicle` | exit 0; `motion complete` log: `static` → 0 windows opened, `moving-vehicle` → ≥ 1 window with `activation_frame` | P2 | I | ⬜ |
| ANP-02 | Plate normalisation | `normalize_vietnamese_plate` / `build_ocr_observation` with `51F-678.90`, `30A-12345`, `99Z-00001`, `đà-123`, full-width `５９－Ｐ１ １２２．３３`, `O0-I1-B8`, `----`, `""` | `51F67890`, `30A12345`, `99Z00001`, `DA123`, `59P112233`, `O0I1B8` (no glyph correction), `""`, `""`; empty → disposition `no_text`, rejected. Alphanumeric junk such as `HELLO` is **not** rejected by format | P0 | U | 🟡 test_ocr_engine.py:104 (most inputs) |
| ANP-02b | Two normalisers agree | accented input through `OcrResult.normalized_text` (`camera_types.py`) vs `ocr_engine` | currently differ (types version does not strip accents, raises on empty) — pin behaviour or fix | P2 | U | ⬜ |
| ANP-03 | OCR confidence threshold | `ocr_confidence=0.8`; reads at 0.79 / 0.80 / 0.81, `None`, NaN, 1.5; policies `reject` and `accept_flagged` | `reject`: 0.79 → `low_confidence`, not forwarded; 0.80, 0.81 → `accepted`. `accept_flagged`: 0.79 labelled `low_confidence` but **is forwarded**. `None` → not accepted under both. NaN / out-of-range → `OcrInferenceError` | P0 | U | 🟡 test_ocr_engine.py:135, :182 |
| ANP-03b | Plate-detector threshold | `plate_confidence=0.6`; rows at 0.59 / 0.60 / 0.61; plates narrower than 20 px or shorter than 8 px | 0.59 dropped; 0.60 and 0.61 kept (`>=`); undersized plates dropped | P0 | U | 🟡 test_plate_detector.py |
| ANP-04 | Per-track plate dedup | `TrackStateManager(ttl_frames=30)`: same track + same plate for N frames; same track + different string; new track + same plate; track absent > `ttl_frames` | exactly one `PlateRecognized` for same track/plate regardless of N or confidence (`best_plate` keeps highest); different string → second event; new track → new event; `exit` only after absence **> ttl** (strict); dedup does not survive restart (new `session_id`) | P0 | U | 🟡 test_vehicle_tracker.py:87 |
| ANP-04b | Motion gate debounce | stub detector; frames before `warmup_frames` (30) + `min_consecutive_active_frames` (2); `cooldown_frames` (10) after quiet | no vehicle / plate / OCR stage runs until gate is ACTIVE | P1 | U | 🟡 test_motion_gate.py |
| ANP-04c | Plate without vehicle event | accepted OCR candidate but no matching `VehicleDetected` causation id | event skipped, ERROR logged (no orphan `PlateRecognized`) | P1 | U | ⬜ |
| ANP-05 | RTSP open failure → reconnect | RTSP `CameraSourceConfig`, fake `capture_factory` whose first open fails, `reconnect_seconds=0`, bounded `max_frames` | `stream.error` IPC line with code `RTSP_CONNECT_TIMEOUT`, log `capture/reconnecting`, `flush_ingest_queue` called, retry after the **fixed** delay (no backoff, no cap), then `stream.connected` and frames resume; no crash | P1 | I | 🟡 test_camera_runtime.py:69 (reconnect only; IPC output not asserted) |
| ANP-05b | Mid-stream read failure | `read()` returns False after some frames | loop breaks, logs `reconnecting`, reopens; **no** `stream.disconnected` is emitted (helper unused) | P1 | I | ⬜ |
| ANP-05c | File source cannot open | bad `file` path | `ConfigValidationError`, exit 3, no retry | P2 | I | ⬜ |
| ANP-06 | IPC contract: worker → edge | Capture real stdout lines (`stream.connected`, `stream.error`, `frame.observed`, `preview.frame`, `barrier.*`, structured logs) and feed each to `worker_ipc::parse_line` | `stream.connected` / `stream.error` / `preview.frame` map to matching `WorkerEvent` with cameraId, size, fps; structured logs (no `type`, has `stage`) → `Log`; `frame.observed`, `barrier.*` → `Other` without error; bad `cameraId` → nil UUID. `worker.ready/stopping/stopped`, `queue.depth`, `stream.disconnected` are never emitted by the worker | P0 | I | 🟡 worker_ipc.rs:130-237 (hand-written lines only, not real worker output) |
| ANP-06b | HTTP contract: worker → edge ingest | Run worker ingest client against edge `ingest.rs` | Per `docs/anpr-worker.md` §9.2 these known mismatches would currently fail: Rust returns **200** but Python requires **202** with `{"eventId", "status":"accepted"}`; Rust reads only the `snapshot` part while Python sends `original_frame` / `plate_crop`; generated config has `ocr.comparators=[]`, which Python rejects (exit 2) | P0 | I | ⬜ |
| ANP-06c | Event envelope shape | build `PlateRecognized` / `VehicleDetected` | `{eventId, eventType, cameraId, occurredAt, payload}`; payload has `eventVersion:1`, `pipeline`, `frame`, `tracker`, `vehicle`, `plate{text, normalizedText, detectionConfidence, recognitionConfidence, boundingBox}`, `models`; vehicle class only `car` or `motorbike`; headers `X-Camera-Id`, `X-Camera-Key`, `Idempotency-Key=eventId` | P1 | U | 🟡 test_camera_ingest_client.py |
| ANP-06d | Ingest retry & spool | server returns 408 / 425 / 429 / 5xx / connection error vs 4xx | retryable → exponential delay `min(retry_max, base·2^(n-1))` or `Retry-After`, then spooled to SQLite queue and replayed; non-retryable 4xx not retried | P0 | I | 🟡 test_camera_ingest_client.py |
| ANP-06e | Timestamp format | `frame.observed` with tz-aware datetime | `at` is valid ISO-8601; currently `isoformat()+"Z"` yields `+00:00Z` (malformed) — defect to fix or pin | P2 | U | ⬜ |
| ANP-07 | Model weights not baked in | `docker build -t parkvision-anpr anpr-worker/`; `docker run --rm --entrypoint sh parkvision-anpr -c 'find /app/model -name "*.pt" -o -name "*.onnx"; ls /app/model/paddleocr'` | no `.pt` / `.onnx` / `paddleocr` in the image (`.dockerignore` excludes them); `/app/model` holds only `ultralytics_yolov5_master`; weights mounted at runtime | P2 | M | ⬜ |
| ANP-08 | Docker test target | `docker build --target test anpr-worker/` (runs `python -m pytest edge/ -q`) | exits 0. Docs' "56 passed" was on Python 3.14 / numpy 2.x; the image uses Python 3.11 / `numpy<2.0`, so run it in the image | P1 | I | ⬜ |

Optional product decision: if a Vietnamese plate pattern is wanted (e.g. 2 digits + letter + 4–5 digits),
that is a **new feature**; do not assert it against current code.

## 14. Mobile driver app (Vitest + jsdom)

| ID | Title | Steps / data | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|---|
| MOB-01 | Bearer attached, JSON parsed | token set; `api('/driver/auth/me')` | `Authorization: Bearer a1`; parsed body | P0 | U | ✅ api.test::attaches bearer token |
| MOB-02 | Error envelope → `ApiError` | 409 `{error:{code,message}}` | `status 409`, `code conflict`, message | P0 | U | ✅ |
| MOB-03 | Single-flight refresh | two concurrent 401s | exactly **one** refresh call; both retried with new token | P0 | U | ✅ |
| MOB-04 | Refresh failure logs out | refresh 401 | tokens cleared; `pv:logout` emitted once; `ApiError` thrown | P0 | U | ✅ |
| MOB-05 | Non-JSON / network error | fetch rejects; HTML 502 | friendly `ApiError`/network error; no unhandled rejection | P1 | U | ⬜ |
| MOB-06 | Retry loop guard | endpoint always 401 after refresh | no infinite retry | P0 | U | ⬜ |
| MOB-07 | `auth:false` skips header | register/login | no `Authorization` | P1 | U | ⬜ |
| MOB-08 | `mapSite` full mapping | complete payload | pricing, capacity, facilities, hours `06:00–23:00`, distance | P1 | U | ✅ mapSite.test |
| MOB-09 | `mapSite` membership flags | `supportsMembership/membershipPriceFrom` | passed through | P1 | U | ✅ |
| MOB-10 | `mapSite` missing data | null coords/phone/image | left empty, never fabricated | P1 | U | ✅ |
| MOB-11 | `mapSite` 24/7 | `00:00–23:59` | `"24/7"`, `openNow=true` | P2 | U | ✅ |
| MOB-12 | Open-now across midnight | hours `22:00–06:00` at 23:00 / 03:00 / 12:00 | true / true / false | P1 | U | ⬜ |
| MOB-13 | Payment body typing | `payments.create` for each kind | membership/session send id; topup sends `amountVnd` only | P1 | U | ⬜ |
| MOB-14 | Hooks | `useAuth`, `usePayments`, `useSessionHints` via `renderHook` | login stores tokens; payment polling stops on terminal state; hint triggers refetch | P1 | U | ⬜ |
| MOB-15 | Login screen | RTL: invalid creds, loading, success | error shown, button disabled while pending | P1 | U | ⬜ |
| MOB-16 | Pay-to-activate flow | membership → pay → `payUrl` opened → status polled → active | UI reflects `paid`; failure/expiry shown with retry | P0 | E | ⬜ |
| MOB-17 | Wallet screen | balance, ledger order, top-up validation 10k–50M | blocks out-of-range before API call | P1 | U | ⬜ |
| MOB-18 | Find my vehicle / map | permissions denied | graceful fallback, no crash | P2 | U | ⬜ |
| MOB-19 | i18n | switch language | all strings translated; no missing keys | P2 | U | ⬜ |
| MOB-20 | Build & typecheck | `npm run lint && npm run build` | pass | P1 | U | ⬜ (not in CI) |

Note: the `@testing-library/react` packages are not in `mobile/package.json`; MOB-14/15/17
need `@testing-library/react` (+ `user-event`) added as dev dependencies.

## 15. Tenant dashboard (frontend)

The frontend has **no test runner** (`package.json` only has `lint` = `tsc --noEmit`).
Recommend adding Vitest + RTL for logic and Playwright for flows (per project rules).
Cases below are written for E2E (Playwright) unless noted.

| ID | Title | Steps / data | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|---|
| WEB-01 | Login / logout | valid & invalid creds | dashboard shown / inline error; logout returns to login | P0 | E | ⬜ |
| WEB-02 | MFA modal | MFA-enabled user | code prompt; wrong code error; success lands on dashboard | P0 | E | ⬜ |
| WEB-03 | Route guard | unauthenticated deep link | redirected to login, then back after login | P0 | E | ⬜ |
| WEB-04 | Role gating | viewer opens a page with mutations | buttons hidden/disabled; API still enforces | P0 | E | ⬜ |
| WEB-05 | Site listing & pricing editor | edit pricing, save | persisted; invalid values rejected inline | P1 | E | ⬜ |
| WEB-06 | Payments tab & refund | refund a paid payment | confirm dialog; status → refunded; error toast on 409 | P0 | E | ⬜ |
| WEB-07 | Realtime barrier map | push WS telemetry/incident | gate state and alert update without full refetch | P1 | E | ⬜ |
| WEB-08 | Gate control buttons | open/close/lock/unlock/reboot | `202` accepted, pending → acknowledged states; disabled when offline | P0 | E | ⬜ |
| WEB-09 | Known gap | `BarrierMapVisualization` | renders mock data (per spec analysis, dated 2026-09-25 — re-check) — assert it uses real data once fixed | P1 | E | ⬜ |
| WEB-10 | Vehicle CRUD & CSV import | create dup plate; import file | 409 message shown; import result summary | P1 | E | ⬜ |
| WEB-11 | Aggregation correctness | >200 events/vehicles | dashboard counts correct (client fetched `limit=200` per spec analysis — re-check) | P1 | E | ⬜ |
| WEB-12 | Language switch & theme | toggle | persists across reload | P2 | E | ⬜ |
| WEB-13 | Error boundary | force component error | fallback UI, app not blank | P2 | U | ⬜ |
| WEB-14 | Docker image | `docker build frontend/`; run with `API_UPSTREAM` | SPA fallback works on deep link; `/api` and `/ws` proxied | P1 | I | ⬜ |

## 16. Non-functional

| ID | Title | Method | Target / expected | Pri | Auto |
|---|---|---|---|---|---|
| NFR-01 | Gate decision latency | load test `decide_access` path (ANPR → event row) | p95 target to be set with ops (suggest < 200 ms backend-side) | P1 | ⬜ |
| NFR-02 | FSM tick budget | stress edge while relay I/O slow | tick jitter stays near 50 ms | P0 | ⬜ |
| NFR-03 | API throughput | k6/locust on read endpoints | no N+1 (query count per request asserted) | P2 | ⬜ |
| NFR-04 | WebSocket fan-out | 500 clients, 1 frame/s/gate | no unbounded memory growth | P2 | ⬜ |
| NFR-05 | Migrations | upgrade head on empty DB; downgrade/upgrade cycle | clean; RLS policies recreated | P1 | 🟡 conftest runs `upgrade head` |
| NFR-06 | Backup / restore | follow `docs/RUNBOOK_BACKUP_RESTORE.md` | restored data passes smoke e2e | P1 | M |
| NFR-07 | Dependency & secret scan | `bandit`, `pip-audit`, `cargo audit`, `npm audit`; grep for secrets | no high/critical; no secrets in repo | P0 | ⬜ |
| NFR-08 | Accessibility (mobile/web) | axe on main screens | no critical violations | P2 | ⬜ |

---

## 17. Findings from the test audit

- **ACC-01…ACC-07 are only covered indirectly.** `decide_access` outcomes appear inside other tests
  (`test_decision_engine_rules` for blacklist / unregistered, memberships tests for suspended / expired,
  e2e S7a for `vehicle_registered`) but none targets the decision order directly. A table-driven unit
  test of `decide_access` is the highest-value missing test. The occupancy updates (EVT-01…06) are
  never asserted either.
- **PAY-36 is invisible to the suite:** the `ipn_for` helper always sends the stored amount.
- **Loose assertion:** `test_expired_membership_swept_and_denied` accepts either `vehicle_suspended` or
  `vehicle_expired`, so it cannot tell the lazy sweep from the `valid_to` check.
- **Order-dependent tests:** `test_driver_api.py` session tests share a session-scoped DB and assert
  `len(r) == 1` for plate `51A12345`; `test_sessions_only_for_own_plates` adds another entry for the
  same plate. Use unique plates per test.
- **Not pure pytest:** `test_command_idempotency_and_outbox` needs live EMQX + mqtt-bridge.
- **e2e S6a** accepts `pending` or `sent`, while the pytest test asserts `sent`.
- **Edge:** no test for the default 8.5 A overcurrent trip (FSM-05) or stuck-while-closing (FSM-08);
  HAL-02 asserts retries and `link_ok=false` but not that an incident is raised.
- **ANPR worker:** no VN plate-pattern validation exists (feature gap, not a test gap); worker → edge
  HTTP contract has known mismatches (200 vs 202, snapshot part names, empty `ocr.comparators`),
  see ANP-06b.

## 18. Open questions found while writing these cases

These are places where the code's behaviour is surprising or unspecified; each needs a
product/engineering decision before the related case can assert a "correct" result.

1. **ACC-17 – Rule schedules use UTC.** `decide_access` compares `now.strftime("%H:%M")` (UTC) to
   `startTime/endTime`. A rule for 08:00–18:00 at a Vietnam site (UTC+7) will apply from 15:00–01:00 local.
2. **PAY-36 – IPN amount is not verified** against the stored `amount_vnd`. Signature check only.
3. **CMD-10 – Late ack overwrites `timeout`.** A command already reported as timed out can become `acknowledged`.
4. **TEN-08 – Role permissions** (`owner/admin/operator/viewer`) are not documented; the matrix must be agreed before asserting.
5. **ACC-14 – A rule with empty `conditions` applies to every vehicle**, including unregistered ones (an `allow_list` rule without conditions opens the gate to everyone).
6. **EVT-04 – Occupancy cap is 2× capacity**, not capacity; confirm intended (over-booking tolerance).
7. **Frontend has no automated tests**, and per the 2026-09-25 spec analysis `BarrierMapVisualization` rendered mock data (WEB-09) — re-verify against current code.

## 19. Suggested execution order

1. **P0 money & access** — §5 ACC, §11 PAY/WAL/PEX/REF, §10 MEM-09…MEM-17.
2. **P0 isolation & auth** — §2–§4 gaps (AUTH-04/12/13/22, TEN-04/07/08/11).
3. **P0 safety** — §12.1 FSM gaps (FSM-05, 08–10, 13–16), HAL-05/06.
4. **Pricing table tests** — §8 (cheap, pure, high value; one parametrised test covers most rows).
5. Everything else by priority.

Coverage target per project rules: 80 % line coverage (`pytest --cov=app`, `cargo llvm-cov`, `vitest --coverage`).
