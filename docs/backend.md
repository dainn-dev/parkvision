# Backend ParkVision — kiến trúc, API và vận hành

Tài liệu tiếng Việt dành cho người phát triển, tích hợp và vận hành backend. Nội dung đối chiếu với `backend/app/`, migration, script seed, cấu hình Docker và test hiện có; không xem bản thiết kế hay nhãn “Phase” trong comment là bằng chứng chức năng đã hoàn tất.

Bắt đầu tại [backend/README.md](../backend/README.md) nếu chỉ cần chạy môi trường. Các đường dẫn mã nguồn bên dưới là tương đối từ gốc repository. Prefix REST mặc định là `/api/v1`; tài liệu dùng prefix này trừ khi ghi rõ.

## 1. Phạm vi và các tiến trình

Backend quản lý tenant, tài khoản vận hành, site/lane/gate/device/camera, xe đăng ký, rule vào/ra, access event, incident, vị trí xe, tài khoản tài xế, membership, payment và ví. Kết quả ANPR do thành phần bên ngoài gửi vào; backend không chứa pipeline nhận diện ảnh và không phải driver relay phần cứng.

Có ba tiến trình ứng dụng chính và một tiến trình migration:

1. **API** — `uvicorn app.main:app`: HTTP, auth, CRUD, truy vấn tổng hợp, presign và WebSocket.
2. **MQTT bridge** — `python -m app.realtime.mqtt_bridge`: giữ kết nối EMQX, nhận telemetry/incident/detection, lưu DB, phát Redis pub/sub và gửi command từ Redis lên MQTT.
3. **Worker** — `arq app.workers.worker.WorkerSettings`: job email/import/export và cron bảo trì.
4. **Migrate** — `alembic upgrade head`: cập nhật schema, rồi thoát; không chạy bên trong startup API.

Luồng dữ liệu chính:

```text
Dashboard/mobile ── HTTP ──> API ── SQLAlchemy async ──> PostgreSQL
                               ├── arq jobs ─────────> Redis ──> Worker
                               ├── mqtt:outbox ──────> Redis ──> MQTT bridge ──> EMQX ──> Edge
                               └── presign ──────────> S3-compatible storage

Edge/ANPR ── MQTT ──> EMQX ──> MQTT bridge ──> PostgreSQL
                                           └── Redis pub/sub ──> API WebSocket ──> Client
```

Redis không thay PostgreSQL làm nguồn sự thật cho resource và command record. Pub/sub không lưu lịch sử để replay; client cần refetch REST sau khi mất kết nối hoặc nhận hint.

**Nguồn:** `backend/app/main.py`, `backend/app/api/v1/__init__.py`, `backend/app/database.py`, `backend/app/redis_client.py`, `backend/app/realtime/mqtt_bridge.py`, `backend/app/workers/worker.py`.

### Stack thực tế

`backend/pyproject.toml` yêu cầu Python `>=3.10`, pin FastAPI `0.115.6`, SQLAlchemy `2.0.36`, asyncpg `0.30.0`, Alembic `1.14.0`, Pydantic `2.9.2`, arq `0.26.0`, aiomqtt `2.3.0`. Dockerfile dùng `python:3.12-slim`, chạy bằng user `appuser` UID 10001. Compose dùng PostgreSQL 16, Redis 7, EMQX 5.8.1, LocalStack S3 và Mailpit.

## 2. HTTP, schema và lỗi

### Khởi tạo ứng dụng

`backend/app/main.py` gắn router v1 bằng `settings.api_v1_prefix` và gắn WS trực tiếp ở app. Lifespan thử tạo bucket S3 theo kiểu best-effort, bỏ qua lỗi startup; API sống không chứng minh bucket dùng được. Khi dừng, app đóng Redis và engine DB.

Middleware tạo/tiếp nhận `X-Request-Id`, đo số request/độ trễ theo route template và thêm `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`. CORS đọc `CORS_ORIGINS`, bật credentials. Đây không phải cơ chế TLS hoặc kiểm soát toàn bộ truy cập mạng.

### Dạng dữ liệu

`backend/app/schemas/common.py` định nghĩa `CamelModel`: alias JSON camelCase, chấp nhận tên field Python và đọc từ ORM. Ví dụ field Python `plate_number` ra JSON `plateNumber`.

Không giả định mọi response là `{data: ...}`:

- Resource detail, nhiều endpoint tạo/sửa và driver auth trả object trực tiếp.
- Một số collection trả mảng trực tiếp, ví dụ driver vehicles/memberships/payments.
- Collection có phân trang dùng `Page`: `{data: [...], meta: {page, limit, total}}`.
- Login dashboard có `data`; `/auth/me` trả schema riêng. OpenAPI/schema từng endpoint là nguồn tra chính xác.
- Query parameter không tự động camelCase toàn bộ: có route dùng `site_id`, có route khai báo alias như `updatedSince`. Tra signature/router khi tích hợp.

`ApiError`, validation lỗi và lỗi không xử lý được được chuyển thành:

```json
{
  "error": {"code": "validation_error", "message": "Request validation failed", "details": {}},
  "requestId": "..."
}
```

Validation trả 422; lỗi không xử lý trả 500 với thông báo chung. Không suy diễn envelope này áp dụng cho mọi phản hồi tầng proxy, routing hoặc thư viện ngoài handler đã đăng ký.

**Nguồn:** `backend/app/main.py`, `backend/app/core/errors.py`, `backend/app/schemas/common.py`, `backend/app/schemas/auth.py`, `backend/app/schemas/resources.py`, `backend/app/schemas/driver.py`.

## 3. Xác thực, vai trò và tenant isolation

### 3.1 Dashboard: tenant user và platform admin

`POST /api/v1/auth/login` tìm tenant user theo email trước, sau đó platform admin. Mật khẩu hash bằng Argon2. Khi account có MFA, login chỉ tạo session staged và JWT `mfa_pending`, chưa có quyền gọi resource API. `/auth/mfa/verify` chấp nhận TOTP hoặc backup code, hoàn tất session rồi cấp bộ token thực.

- TOTP secret mã hóa Fernet; backup code lưu hash SHA-256, dùng một lần.
- Default access TTL 900 giây; refresh TTL 14 ngày; pending MFA 300 giây, tối đa 5 lần thử.
- Default lockout: 5 lỗi mật khẩu liên tiếp, khóa 900 giây; có audit/security alert liên quan.
- MFA session status/resend là quản lý giao dịch MFA hiện tại; không có bằng chứng triển khai OTP email/SMS chỉ từ tên `/mfa/resend`.
- Password forgot/reset dùng token hash, TTL mặc định 1800 giây; email do worker gửi. Invite tenant user tạo account `invited`, token hết hạn sau 72 giờ; `/auth/activate` đặt mật khẩu/kích hoạt.

Token dashboard được đưa vào cookie `vm_access` và `vm_refresh` với HttpOnly; `vm_csrf` không HttpOnly để SPA đọc. `Secure` theo cấu hình, **mặc định false**; SameSite mặc định `lax`. Các route áp dụng `csrf_protect` yêu cầu header `X-CSRF-Token` khớp cookie khi ghi bằng cookie auth, trừ nhánh miễn được code quy định. Đây là dependency gắn ở router/endpoint, không phải middleware CSRF toàn ứng dụng; không tuyên bố mọi route ghi đều được bảo vệ giống nhau.

Dependency auth chung chọn access cookie trước, chỉ dùng `Authorization: Bearer` nếu không có cookie. JWT phải không pending và `sid` phải trỏ session chưa revoke/chưa hết hạn. Vì vậy logout/revoke session ảnh hưởng HTTP request tiếp theo, không chỉ đợi JWT hết hạn.

### 3.2 Refresh/session

Refresh token là chuỗi ngẫu nhiên opaque, DB lưu hash hiện tại và hash trước đó trong `user_sessions`. Refresh xoay token; reuse token trước ngoài khoảng retry grace thu hồi session family và phát alert. Code chỉ lưu một token trước, không phải danh sách lịch sử vô hạn. Mặc định JWT dùng HS256; `JWT_PREVIOUS_SECRETS` cho phép kiểm chứng token ký bằng secret cũ trong giai đoạn chuyển khóa.

User có thể liệt kê/thu hồi session của mình. Platform có endpoint session riêng. Không coi việc đổi `status` tài khoản bằng mọi API là bảo đảm tự thu hồi mọi JWT: dependency validation chung kiểm tra trạng thái session; cần xem hành vi revoke cụ thể ở endpoint gọi.

### 3.3 Vai trò và phạm vi

Tenant role trong `backend/app/core/enums.py`:

- `owner`, `admin`, `operator` thuộc `WRITE_ROLES`: ghi resource vận hành, phát lệnh cổng, sửa settings, quản lý membership và refund.
- `owner`, `admin` thuộc `ADMIN_ROLES`: quản lý tenant users và đọc/export tenant audit.
- `viewer`: đọc các resource cho phép, không có quyền ghi theo `WRITE_ROLES`. User list và payment list không chỉ dành cho owner/admin trong code hiện tại.

Platform role: `super_admin`, `support`, `ops`:

- Router `/platform` bắt buộc actor platform admin.
- Tạo/sửa admin, reset MFA admin: `super_admin`.
- Tạo/sửa tenant/status, settings/flags, credentials, reboot device và impersonation: `super_admin` hoặc `ops`.
- Revoke session bất kỳ: `super_admin` hoặc `support`.
- Nhiều endpoint đọc và thao tác alert/export dùng quyền platform admin chung; không suy diễn `support` luôn read-only.

Tenant route có `tenant_match`: token tenant phải trùng `{tenant_id}`. Platform admin được bỏ qua so sánh tenant ở bước này, **không được bỏ qua `require_roles`** vì dependency đó yêu cầu actor tenant user. Do đó platform admin có thể đọc một số tenant resource nhưng không tự động ghi chúng. `/platform/tenants/{tenant_id}/impersonate` cho `super_admin`/`ops` tạo session tenant owner 15 phút, gắn `impersonator_id` và audit; thay cookie access/CSRF, giữ cookie refresh admin để khôi phục sau.

### 3.4 PostgreSQL RLS

`tenant_session(tenant_id)` mở một transaction và gọi `set_config('app.current_tenant_id', ..., true)`, tương đương phạm vi SET LOCAL. Runtime `DATABASE_URL` phải dùng role chịu RLS (`vehicle_app` trong dev), không dùng PostgreSQL superuser thay thế.

`platform_session()` bật `app.platform_bypass=true` và đặt nil tenant UUID. Được dùng có chủ đích cho login/platform, MQTT ingest và nhiều flow driver cross-tenant. `anonymous_session()` đặt nil tenant nhưng không bật bypass, dùng đọc dữ liệu tham chiếu public. Router public discovery dùng platform session rồi tự lọc thông tin được công bố.

RLS không áp dụng đồng nhất cho mọi bảng: bảng driver như `driver_users`, `driver_vehicles`, favorites, wallets/ledger là platform-scoped; service phải lọc `driver_id`/ownership. Payment, membership và resource tenant có chính sách/phạm vi tương ứng trong migration. Không bỏ điều kiện ownership vì đã có RLS.

### 3.5 Driver và edge

Driver đăng ký/login qua `/api/v1/driver/auth/*`, nhận `accessToken`, `refreshToken`, `expiresIn` trong JSON, không set cookie, không triển khai MFA cho driver. Resource driver yêu cầu actor `driver`, không nhận token tenant user. Không gửi cookie dashboard kèm Bearer driver vì thứ tự ưu tiên nói trên.

Edge dùng API key, không dùng JWT user. Key lưu hash trong `api_credentials`, thường có prefix `pk_` khi phát hành; scope `edge:ingest` cho whitelist/rules/upload, `edge:config` yêu cầu credential gắn device. Key tenant-bound không dùng để đọc tenant khác; key platform-wide mang `tenant_id=NULL` được phép sync nhiều tenant theo code.

**Nguồn:** `backend/app/api/deps.py`, `backend/app/api/v1/tenant/__init__.py`, `backend/app/api/v1/auth.py`, `backend/app/api/v1/driver/auth.py`, `backend/app/api/v1/platform.py`, `backend/app/api/v1/edge.py`, `backend/app/security.py`, `backend/app/services/auth_service.py`, `backend/app/services/credential_service.py`.

## 4. Bản đồ nhóm API

Các endpoint dưới đây dùng prefix mặc định. `{tenant_id}`, `{site_id}` và các ID resource là UUID trừ tham số slug/code được nêu rõ. Danh sách là nhóm API chính; payload, query và enum chính xác xem `/docs`, `/openapi.json` và schema.

### 4.1 Public — không có prefix public chung cho toàn nhóm

Nguồn: `backend/app/api/v1/public.py`.

- `GET /api/v1/plans`: gói SaaS public, **khác** gói gửi xe tại site.
- `GET /api/v1/legal/{doc_type}`: tài liệu pháp lý phiên bản mới nhất.
- `GET /api/v1/tenants/check-code?slug=...`: kiểm tra slug tenant.
- `POST /api/v1/register`: tạo tenant `trial` và owner `active`; không phải API đăng ký driver.
- `GET /api/v1/public/sites`: tìm bãi với `lat`, `lng`, `radiusKm`, `q`; tối đa 200 kết quả. Khoảng cách Haversine và lọc/sắp xếp thực hiện ở service Python, không phải PostGIS.
- `GET /api/v1/public/sites/{site_id}`: chi tiết bãi và tầng/zone; `GET .../{site_id}/plans`: gói membership active.
- `GET /api/v1/public/tenants/{slug}/parking/map`: map/occupancy, không trả danh sách biển số.
- `GET /api/v1/public/tenants/{slug}/parking/locate?plate=...`: tra exact normalized plate, input sau trim tối thiểu 4 ký tự; trả con trỏ tầng/zone và thời gian, không trả hồ sơ chủ xe.
- `POST /api/v1/public/payments/momo/ipn`: callback máy-chủ MoMo, kiểm chứng chữ ký trong payment service.

Discovery site chỉ công bố site active của tenant active và `public_profile.listed != false`; mặc định listed là true. Hai endpoint map/locate theo tenant slug chỉ kiểm tra tenant active theo nhánh code riêng, không lấy `listed` làm điều kiện giống site discovery. Các API public có giới hạn request theo route, không phải tất cả cùng một ngưỡng.

### 4.2 Auth dashboard

Prefix **`/api/v1/auth`**, nguồn `backend/app/api/v1/auth.py`:

- `POST /login`, `/refresh`, `/logout`, `/activate`.
- `GET /me`; `POST /password`, `/password/forgot`, `/password/reset`.
- `GET /mfa/session`; `POST /mfa/verify`, `/mfa/resend`, `/mfa/setup`, `/mfa/enable`, `/mfa/disable`.
- `GET /sessions`; `DELETE /sessions/{session_id}`.

### 4.3 Driver

Nguồn: `backend/app/api/v1/driver/`.

- **`/api/v1/driver/auth`**: `POST /register`, `/login`, `/refresh`, `/logout`, `/password`; `GET/PATCH /me`; `GET /sessions`, `DELETE /sessions/{session_id}`.
- **`/api/v1/driver/vehicles`**: `GET/POST` collection; `PATCH/DELETE /{vehicle_id}`. Thêm xe ở đây không tự thêm whitelist tenant.
- **`/api/v1/driver/favorites`**: `GET` collection; `PUT/DELETE /{site_id}`.
- **`/api/v1/driver/sessions`**: `GET /active`, `GET /history` — phiên đỗ xe, khác phiên đăng nhập `/driver/auth/sessions`.
- **`/api/v1/driver/memberships`**: `GET/POST` collection; `POST /{membership_id}/cancel`.
- **`/api/v1/driver/payments`**: `GET/POST` collection, `GET /{payment_id}`, `POST /{payment_id}/cancel`.
- **`GET /api/v1/driver/wallet`**: balance và 20 ledger transaction gần nhất.

### 4.4 Tenant

Mọi suffix bên dưới nối vào **`/api/v1/tenants/{tenant_id}`**. Router tương ứng nằm trong `backend/app/api/v1/tenant/`.

- **Site/lane (`sites.py`)**: `GET/POST /sites`, `GET/PATCH/DELETE /sites/{site_id}`; `GET/POST /sites/{site_id}/lanes`, `PATCH/DELETE /lanes/{lane_id}`; `GET /sites-gates` tổng hợp.
- **Gate/command (`gates.py`)**: `GET/POST /gates`, `GET/PATCH /gates/{gate_id}`; `GET/POST /gates/{gate_id}/commands`; `GET /commands/{command_id}`; `GET /gates/{gate_id}/telemetry`.
- **Edge device (`gates.py`)**: `GET/POST /devices`, `GET/PATCH/DELETE /devices/{device_id}`; `POST /devices/{device_id}/activation-codes`, `/revoke-token`, `/decommission`, `/reactivate`, `/reboot`. DELETE có điều kiện lifecycle, không coi là xóa tùy ý device đang hoạt động.
- **Camera (`cameras.py`)**: `GET/POST /cameras`, `GET/PATCH/DELETE /cameras/{camera_id}`, `PUT /cameras/{camera_id}/coverage`.
- **Bản đồ (`parking.py`)**: `GET/POST /parking/levels`, `PATCH/DELETE /parking/levels/{level_id}`; `GET/POST /parking/levels/{level_id}/zones`, `PATCH/DELETE /parking/zones/{zone_id}`; `GET /parking/map`, `/parking/presence`, `/parking/locate`; `POST /parking/presence`, `/parking/presence/checkout`, `/parking/map-image/presign`.
- **Xe whitelist (`vehicles.py`)**: `GET/POST /vehicles`, `GET/PATCH/DELETE /vehicles/{vehicle_id}`; `POST /vehicles/import`; `GET /jobs/{job_id}`.
- **Người dùng (`users.py`)**: `GET/POST /users`, `PATCH/DELETE /users/{user_id}`; `POST /users/{user_id}/resend-invite`, `/password-reset`. POST tạo lời mời; DELETE chuyển `disabled`, không phải xóa vật lý.
- **Rule (`rules.py`)**: `GET/POST /rules`, `PATCH/DELETE /rules/{rule_id}`, `POST /rules/simulate`.
- **Event/incident (`events.py`)**: `GET/POST /access-events`, `GET /access-events/{event_id}`, `PATCH /access-events/{event_id}/correct-plate`, `POST /access-events/presign`; `GET/POST /incidents`, `POST /incidents/{incident_id}/acknowledge`, `/resolve`; `POST /incidents/bulk-resolve`.
- **Settings/dashboard (`events.py`)**: `GET/PUT /settings`; `GET /dashboard/summary`, `/dashboard/hourly-flow`.
- **Membership (`memberships.py`)**: `GET/POST /sites/{site_id}/membership-plans`, `PATCH /membership-plans/{plan_id}`; `GET /memberships`; `POST /memberships/{membership_id}/activate`, `/reject`, `/revoke`.
- **Payment (`payments.py`)**: `GET /payments`; `POST /payments/{payment_id}/refund`.
- **Audit (`audit.py`)**: `GET /audit-logs`, `POST /audit-logs/export`.

### 4.5 Platform

Prefix **`/api/v1/platform`**, nguồn `backend/app/api/v1/platform.py`:

- Tenant: `GET/POST /tenants`, `GET/PATCH /tenants/{tenant_id}`, `PATCH /tenants/{tenant_id}/status`, `GET /tenants/{tenant_id}/users`, `POST /tenants/{tenant_id}/impersonate`.
- Admin: `GET/POST /admins`, `PATCH /admins/{admin_id}`, `POST /admins/{admin_id}/mfa/reset`.
- Cấu hình: `GET /settings`, `PUT /settings/{key}`; `GET /feature-flags`, `PUT /feature-flags/{key}`. Có CRUD dữ liệu không có nghĩa mọi feature flag được mọi service thực thi.
- Session: `GET /sessions`, `POST /sessions/{session_id}/revoke`.
- Audit/job: `GET /audit-logs`, `POST /audit-logs/export`, `GET /jobs/{job_id}`. Audit platform lọc hoạt động actor platform admin, không phải mặc nhiên mọi hoạt động tenant.
- Bảo mật: `GET /security/alerts`, `/security/login-events`; `POST /security/alerts/{alert_id}/acknowledge`, `/resolve`.
- Quan sát: `GET /infra/health`, `/metrics/overview`, `/metrics/throughput-chart`, `/monitoring/telemetry-snapshot`.
- Device: `POST /edge-devices/{device_id}/reboot`.
- Credential: `GET/POST /credentials`, `POST /credentials/{cred_id}/rotate`, `/revoke`; plaintext key chỉ trả lúc phát hành/rotate, không đưa vào log.

### 4.6 Edge và WebSocket

Prefix edge **`/api/v1/edge`**, nguồn `backend/app/api/v1/edge.py`:

- Public `GET /client-ip`, `POST /activate`.
- `GET /config`: key gắn device, loại API token/MQTT password khỏi response refresh.
- `GET /tenants/{tenant_id}/whitelist?updatedSince=...&limit=...`.
- `GET /tenants/{tenant_id}/rules`.
- `POST /tenants/{tenant_id}/uploads/presign`.
- `POST /mqtt-auth`: hook authn/authz cho broker, không phải API login dashboard.

WebSocket ở **cấp app, ngoài prefix REST**, nguồn `backend/app/api/v1/ws.py`:

- `/ws/tenants/{tenant_id}/barrier-telemetry`: cookie access hoặc `?token=...`; chỉ tenant user cùng tenant/platform admin; nhận fan-out tenant.
- `/ws/driver/sessions?token=...`: actor driver, đăng ký kênh theo các biển số của driver lúc kết nối; không có xe thì đóng 4404. Đổi danh sách xe cần reconnect để subscription đổi.
- Cả hai gửi ping mỗi 30 giây; token/session được kiểm tra lúc mở socket. Code hiện không kiểm tra lại JWT expiry/revoke định kỳ trên socket đã mở; không hứa hẹn revoke sẽ ngắt socket ngay.

## 5. Mô hình dữ liệu và migration

`backend/app/models.py` định nghĩa ORM, nhưng **DDL thực tế phải đọc cùng Alembic**: RLS, partition, CHECK, trigger, GRANT không được mô tả đầy đủ chỉ bằng model.

Các nhóm bảng chính:

- Nền tảng: `plans`, `legal_documents`, `tenants`, `platform_admins`, `feature_flags`, `platform_settings`, `api_credentials`, `security_alerts`, `background_jobs`.
- Danh tính: `tenant_users`, `user_sessions`; hồ sơ member tenant nằm trong profile JSONB, không đồng nghĩa tài khoản driver hay membership mua gói.
- Hạ tầng bãi: `tenant_sites`, `site_lanes`, `edge_devices`, `device_activation_codes`, `barrier_gates`, `cameras`.
- Vận hành: `registered_vehicles`, `tenant_access_rules`, `gate_commands`, `gate_telemetry_logs`, `access_events`, `barrier_incidents`, `audit_logs`.
- Vị trí: `parking_levels`, `parking_zones`, `camera_zone_coverage`, `vehicle_presences`, `vehicle_location_events`.
- Driver/kinh doanh: `driver_users`, `driver_vehicles`, `driver_favorites`, `site_membership_plans`, `driver_memberships`, `driver_payments`, `driver_wallets`, `wallet_transactions`.

Biển số được chuẩn hóa bằng uppercase và bỏ ký tự ngoài `A-Z0-9`. Whitelist là theo tenant; driver vehicle unique theo `plate_normalized` toàn hệ thống — mỗi biển số chỉ thuộc một tài khoản driver. Chủ xe có thể chia sẻ quyền xem phiên/thanh toán cho tài khoản khác theo ngày cụ thể qua bảng `driver_vehicle_shares` (`vehicle_id`, `shared_with_id`, `share_date`); quyền đó chỉ có hiệu lực cho đúng ngày được chia sẻ. Không mô tả nó như xác thực chủ xe pháp lý (không yêu cầu giấy tờ/OTP) — người đăng ký đầu tiên là chủ sở hữu.

### Lịch sử schema

Migration trong `backend/migrations/versions/` gồm các nhánh đã merge: hai nhánh `0002`, hai nhánh `0010`, hội tụ qua `0005_merge_heads` và `0012_auth_mfa_hardening`. Không tự sắp tên file rồi chạy SQL tuần tự; dùng đồ thị Alembic.

Các mốc sau: `0009_cameras`, nhánh activation/parking map, `0013_user_profile_vehicle_member`, `0014_security_alerts`, `0015_driver_accounts`, `0016_driver_memberships`, `0017_driver_payments`, `0018_wallet_refunds`. Revision cuối trong nguồn hiện tại là `0018_wallet_refunds`; không suy ra DB đang chạy đã ở revision đó.

Từ `backend/`:

```sh
python -m alembic heads
python -m alembic current
python -m alembic upgrade head
```

`backend/migrations/env.py` dùng `MIGRATION_DATABASE_URL`, engine NullPool và metadata ORM. Migration đầu tạo extension `pgcrypto`, role runtime `vehicle_app` và grants; mật khẩu role lấy `APP_DB_PASSWORD`, default dev `vehicle_app`. Trỏ `DATABASE_URL` đúng mật khẩu role đã cấp. `MIGRATION_DATABASE_URL` cần đủ quyền DDL/role/extension; không cấp URL đặc quyền đó cho đường xử lý HTTP thay cho runtime URL.

### Partition và dữ liệu lịch sử

- `gate_telemetry_logs`: theo tháng.
- `access_events`: theo quý.
- Có partition DEFAULT để chứa timestamp ngoài các khoảng đã tạo.
- Cron tạo partition tháng hiện tại và hai tháng tới; quý hiện tại và quý tiếp theo.
- Retention cron dùng `platform_settings.retention_months` (default 12) và `image_retention_days` (default 90), không tự lấy `tenants.settings.retention_days` thay thế.
- Chỉ drop partition đặt tên phù hợp, không drop DEFAULT. Ảnh cũ được xóa theo batch tối đa 500 event/lần và xóa reference ở DB sau khi xóa S3 thành công.

Cần cấp và thử quyền DDL cho tác vụ partition/retention: code dùng runtime `engine`, trong khi grants cơ bản cho `vehicle_app` là DML. Không mặc định cron CREATE/DETACH/DROP chạy được chỉ vì migration chạy được. Code tạo partition không triển khai chuyển row từ DEFAULT sang partition mới; dữ liệu trùng khoảng trong DEFAULT cần xử lý trước nếu PostgreSQL từ chối tạo partition.

## 6. Luồng vào/ra và quyết định truy cập

Nguồn chính: `backend/app/services/event_service.py`, `backend/app/api/v1/tenant/events.py`, `backend/app/realtime/mqtt_bridge.py`.

### 6.1 Từ nhận diện tới access event

Telemetry cổng có `plateNumber` được bridge đưa vào `record_access_event` với tenant/site/gate từ topic, `source=anpr`, confidence và image key từ payload. Nhánh này dùng thời gian tiếp nhận ở backend; không tự dùng `occurredAt` để backdate event. Camera detection phục vụ presence có xử lý timestamp riêng.

Guard có thể tạo manual access event qua REST, bao gồm force `decision`/`reason`. Việc **ghi event** và việc **phát command mở cổng** là hai API/luồng khác nhau: không có lời gọi `issue_command` tự động trong `record_access_event`. Không khẳng định backend cứ lưu event `allow` là đã mở relay vật lý.

### 6.2 Thứ tự đánh giá hiện tại

1. Không có biển số: deny `no_plate_detected`.
2. Tìm `registered_vehicles` theo tenant + normalized plate. Không có: deny `plate_not_registered`; blacklist: deny; suspended hoặc ngoài hạn: deny; hợp lệ: allow `vehicle_registered`.
3. Với exit vốn deny, có site và không bị blacklist: tìm session payment `paid` cùng tenant/plate/site, chưa dùng exit grant, còn trong grace. Nếu có, đổi kết quả nền thành allow `paid_exit`.
4. Đọc rule active của tenant, sort `priority` tăng dần. Điều kiện hiện dùng `conditions.tags` hoặc `conditions.plates`; schedule dùng ngày ISO và chuỗi giờ theo **UTC của backend**. Rule khớp đầu tiên thuộc `deny_list`/`allow_list` trả kết quả tương ứng.
5. Với allow, chạy anti-passback theo sự kiện gần nhất của biển số trong tenant: cùng hướng, trước đó allow, nằm trong window thì deny `anti_passback`. Window mặc định 5 phút; `anti_passback_enabled=false` tắt được. Không nhầm đây là chống passback dựa trên sensor vật lý.
6. Chỉ khi kết quả cuối allow, payment được chọn ở nhánh paid-exit mới đóng dấu `exit_granted_at`.

**Giới hạn rule:** schema/enum có `schedule`, `quota`, `site_id`, `applied_sites`, `target_category`, `holiday_override`, `action`, nhưng engine hiện không thực thi tất cả như một policy engine tổng quát. Nó không lọc rule theo site và không có xử lý quota riêng. Vì first-match theo priority, không mô tả “deny luôn thắng bất kể thứ tự”; allow-list ưu tiên trước có thể trả trước deny-list. `/rules/simulate` tái dùng engine với plate/direction, không truyền site nên không mô phỏng đầy đủ paid-exit tại site.

### 6.3 Hệ quả khi lưu event

Event chứa decision/reason, hướng, source, confidence, ảnh và timestamp. Nếu có site và decision allow, backend cộng occupancy khi entry, trừ khi exit, floor 0 và cap 2 lần capacity nếu capacity > 0. Đây là bộ đếm suy ra từ event, không phải đo chiếm chỗ chính xác hoặc giới hạn admission khi bãi đầy.

Hook presence hiện đóng vị trí theo plate khi ghi **bất kỳ event hướng exit có biển số**, không kiểm tra decision allow ở nhánh đóng presence. Không đồng nhất bộ đếm occupancy, presence và session driver; chúng có quy tắc cập nhật khác nhau.

Sửa biển số qua `/correct-plate` ghi `corrected_plate`, `verified_by_user_id`, `corrected_at` và audit, giữ biển số gốc. Truy vấn driver session hiện dùng `AccessEvent.plate_number`, không tự dùng `corrected_plate` để tái ghép lịch sử.

## 7. Presence, bản đồ và phiên đỗ xe driver

### 7.1 Vị trí trong bãi

Camera coverage nối camera với zone; zone thuộc level/site. Detection `vehicle_parked`/`vehicle_seen` gọi `parking_service.record_detection`:

- Tìm presence `parked`/`stale` theo tenant + normalized plate.
- Chưa có thì tạo presence và location event `parked`.
- Cùng zone thì cập nhật last seen/confidence/camera; không thêm location event mỗi frame.
- Khác zone thì cập nhật vị trí và ghi `relocated`.
- `vehicle_left`, checkout thủ công hoặc hook exit đóng presence và ghi `exited`.

Zone resolve theo explicit ID, code ưu tiên coverage/site của camera, hoặc suy ra khi camera chỉ cover một zone; không xác định được vẫn có thể tạo presence với zone null. Partial unique index cho presence `parked` giúp hạn chế trùng cùng tenant/plate; service dùng savepoint để xử lý insert race.

Map occupancy đếm presence `parked` và `stale`, không phải `tenant_sites.current_occupancy`. Public map chỉ trả geometry/occupancy; public locate vẫn tiết lộ vị trí nếu biết biển số chính xác, nên cần xem xét yêu cầu riêng tư khi công bố.

Cron stale presence có ý định dùng `parking_presence_ttl_hours` theo tenant (default 48 giờ), stale khi vượt TTL, exited khi vượt 4 lần TTL. **Giới hạn hiện tại:** vòng cron đọc từng tenant nhưng gọi `sweep_stale_presences` dưới `platform_session` mà không truyền tenant filter; không coi TTL khác nhau giữa các tenant đã được cách ly đúng trong job này.

**Nguồn:** `backend/app/services/parking_service.py`, `backend/app/api/v1/tenant/parking.py`, `backend/app/api/v1/tenant/cameras.py`, `backend/app/api/v1/public.py`, `backend/app/workers/jobs.py`.

### 7.2 Phiên gửi xe driver là dữ liệu suy ra

Không có bảng “parking sessions” riêng. `driver_session_service.py` lấy access event `allow`, có site và thuộc các biển số driver đã khai:

- Active: sự kiện allow mới nhất mỗi biển số là `entry` thì trả `PARKED`.
- History: ghép entry→exit theo `(plate, site)` bằng stack LIFO, trả `COMPLETED`, duration và phí ước tính.
- ID session là ID entry access event; payment dùng ID này làm `sessionId`/`session_ref`.
- Có bound scan: giới hạn truy vấn tổng 500 × số biển số, sau đó tối đa 500 event mỗi plate. History không phải lịch sử vô hạn; total là số cặp suy ra trong tập đã scan.
- Ảnh entry trả URL GET ký sẵn nếu có key; vị trí tầng/zone lấy từ presence hiện tại.

Không suy diễn xe có trong `driver_vehicles` thì backend tự cho vào cổng: đó chỉ là danh sách xe của tài khoản mobile; quyền cổng dựa whitelist/rule/payment nói trên.

## 8. Biểu phí

Cấu hình ở `tenant_sites.public_profile.pricing` (JSON camelCase), cập nhật qua site API. Không có nhóm API tariff riêng trong router hiện tại. Ví dụ phần pricing:

```json
{
  "hourlyFrom": 10000,
  "dailyFrom": 100000,
  "overnightFrom": 20000,
  "graceMinutes": 10,
  "blockMinutes": 60,
  "overnightStartHour": 22,
  "overnightEndHour": 6
}
```

`backend/app/services/pricing_service.py` là nguồn công thức:

1. Không có pricing hoặc `hourlyFrom=null`: trả `None`, không tự coi là miễn phí.
2. Duration không dương: 0. Duration ≤ grace: 0. Khi vượt grace, tính trên **toàn bộ duration**, không trừ grace.
3. `blocks = ceil(minutes / blockMinutes)`.
4. Phí cơ bản = `ceil(blocks × hourlyFrom × blockMinutes / 60)`: `hourlyFrom` được code dùng như đơn giá mỗi giờ, quy đổi theo độ dài block.
5. Nếu có daily cap: `min(phí cơ bản, ceil(minutes / 1440) × dailyFrom)`.
6. Cộng phụ thu `overnightFrom` cho mỗi cửa sổ qua đêm mà khoảng đỗ giao nhau, theo timezone site. Không phải chỉ xe đi xuyên trọn đêm mới bị tính; có giao với cửa sổ cũng được đếm. Timezone sai/thiếu tzdata fallback UTC.

`monthlyFrom` chỉ để hiển thị; giá membership lấy từ `site_membership_plans.price_vnd`. Không có engine thuế, hóa đơn điện tử, bậc giá theo loại xe hay lịch lễ được thực thi trong hàm này. Service gọi đây là **ước tính**; payment session hiện dùng chính kết quả đó để chốt amount phía server, vì vậy phải cấu hình/thử biểu phí trước khi bật thu tiền thật. Comment trong schema về đơn vị hourly không hoàn toàn thống nhất với công thức; ưu tiên công thức service và `tests/test_pricing.py`.

## 9. Membership và gói dịch vụ

Phân biệt ba khái niệm:

- `plans`/`Tenant.plan_code`: gói SaaS của tenant; giá tham chiếu có `price_monthly_cents`, không phải VND phí gửi xe. Public registration tạo trial, không có flow billing SaaS hoàn chỉnh chỉ từ trường plan.
- Profile “member” trên tenant user/registered vehicle: thông tin quản lý nội bộ; không tự là purchase của tài xế.
- `site_membership_plans` và `driver_memberships`: gói gửi xe tại site dành cho driver.

Luồng membership:

1. Tenant role ghi tạo plan với giá VND, `durationDays`, perks và status.
2. Driver xem plan public của site được listed/active, đăng ký bằng plan ID + xe thuộc tài khoản. Tạo `pending`; từ chối trùng pending/active cùng driver, site, plate theo kiểm tra service.
3. Tenant có thể activate thủ công; hoặc payment membership chuyển paid sẽ gọi cùng routine activate.
4. Activate tạo/tái sử dụng `registered_vehicles` theo **tenant + plate**, tag `member`, status active, valid window từ thời điểm kích hoạt đến `durationDays` sau đó. Plate blacklist bị từ chối kích hoạt.
5. Pending có thể `rejected`/`cancelled`; active có thể `expired`/`revoked`/`cancelled`. Rời active thì whitelist liên quan bị suspend; expiry được sweep lười khi đọc/ghi membership, valid_to cũng tham gia quyết định cổng.

Không có tự động gia hạn định kỳ/recurring charge trong service. Kích hoạt thủ công không yêu cầu đã thanh toán. Plan thuộc site nhưng whitelist được cấp ở mức tenant; engine không kiểm tra membership site để giới hạn cổng. Tái sử dụng whitelist có thể cập nhật tag/thời hạn record đã có; cần xem tác động nếu dùng nhiều membership chung biển số trong cùng tenant.

**Nguồn:** `backend/app/services/membership_service.py`, `backend/app/services/payment_service.py`, `backend/app/api/v1/tenant/memberships.py`, `backend/app/api/v1/driver/memberships.py`, `backend/app/models.py`.

## 10. Thanh toán, ví và refund

### 10.1 Tạo payment

`POST /api/v1/driver/payments` chấp nhận:

```json
{"kind": "session", "sessionId": "UUID-entry-event", "method": "momo"}
```

Hoặc `kind=membership` với `membershipId`, hoặc `kind=topup` với `amountVnd`. Đây là ví dụ cấu trúc payload, không phải ID có thể gọi trực tiếp.

- `membership`: thuộc driver hiện tại, đang pending; amount lấy giá plan, không tin số tiền client đưa vào.
- `session`: entry allow thuộc plate driver; service tìm exit cặp nếu đã rời bãi, nếu chưa thì tính tới thời điểm tạo payment. Không có pricing trả 422; phí ≤ 0 không tạo payment.
- `topup`: chỉ qua MoMo, từ 10.000 đến 50.000.000 VND; tenant/site NULL vì ví thuộc platform. Chỉ topup cho phép client chọn amount trong bound.
- `method=wallet`: chỉ membership/session, debit số dư và áp dụng paid trong một transaction DB, không cần gateway MoMo.
- Kiểm tra service từ chối payment membership/session khác đang `created` hoặc đã `paid` cùng reference; không coi kiểm tra này là bảo đảm exactly-once dưới mọi race.

### 10.2 Gateway MoMo

`PAYMENT_PROVIDER=none` là default. Tạo payment method MoMo khi gateway chưa cấu hình trả **503 `payments_not_configured`**, không giả thanh toán thành công. Provider triển khai trong `backend/app/services/payments/gateways.py` là MoMo v2 `payWithMethod`; không có adapter VNPay/Stripe được đăng ký ở đây.

- Cần `MOMO_PARTNER_CODE`, `MOMO_ACCESS_KEY`, `MOMO_SECRET_KEY`; endpoint default sandbox `https://test-payment.momo.vn/v2/gateway/api`.
- Create gọi `/create`, lấy `payUrl` để client mở trang/app thanh toán.
- Redirect URL chỉ đưa người dùng về app; không tin redirect là bằng chứng đã trả tiền.
- IPN tại `/api/v1/public/payments/momo/ipn`, kiểm chứng HMAC-SHA256 trước khi cập nhật.
- `GET /driver/payments/{payment_id}` có thể pull `/query` khi payment còn created. List payment không đồng nghĩa query provider từng row.
- State: `created → paid | failed | cancelled | expired`; `paid → refunded` qua refund API. Expiry default 30 phút, sweep lười trên một số reads/writes, không có cron payment riêng.
- IPN cho payment đã terminal hoặc order không biết được ACK theo nhánh code; không tự tái mở cancelled/expired. Không mô tả cancel ở backend là hủy giao dịch nhà cung cấp hoặc hoàn tiền.

Paid membership kích hoạt whitelist. Nếu tiền đã nhận nhưng activate thất bại (ví dụ blacklist), payment giữ `paid`, membership có `admin_note` báo lỗi; operator phải xử lý, không tự refund trong nhánh đó.

### 10.3 Pay-before-exit

Payment session paid cho phép nhánh access engine tìm một grant theo plate/site, grace default 15 phút; tenant setting `paid_exit_grace_minutes` có thể override. Khi final allow, đóng dấu đã dùng. Blacklist không được nhánh paid-exit tự vượt qua; rule/anti-passback vẫn có thể deny.

**Giới hạn:** kiểm tra trả tiền chỉ là đường fallback cho exit vốn deny. Xe whitelist hợp lệ vẫn allow mà không bắt buộc phải có payment, không phải cơ chế mọi xe đều “phải trả tiền mới ra”. Sau khi trả tiền, bộ nhớ offline edge không tự có một payment grant chỉ vì endpoint whitelist/rules tồn tại; không coi flow online này là bằng chứng paid-exit offline đã đồng bộ end-to-end.

**Vận hành khi edge mất mạng (GAP-PAY-002, 2026-10-24):** `decide_access` offline trên edge không biết về payment. Nếu khách đã `paid_exit` đúng lúc cổng mất mạng, lối thoát duy nhất là nhân viên vận hành dùng lệnh mở cổng thủ công (`manual_open`, `edge-client/src-tauri/src/lib.rs`) — không có đồng bộ tự động payment grant vào SQLite cục bộ. Quy trình này cần được truyền thông tới trạm vận hành.

### 10.4 Ví

Topup paid ghi `driver_wallets.balance_vnd` và ledger `topup_credit`. Thanh toán bằng ví ghi `spend_debit`; refund ghi `refund_credit`. Service khóa wallet có sẵn bằng `SELECT FOR UPDATE`, từ chối số dư âm bằng 409. Ledger chứa amount tuyệt đối và `balance_after_vnd`, hướng tiền phân biệt bằng kind.

API ví chỉ đọc số dư/transaction gần đây, không có route rút tiền hoặc chuyển ví trong nhóm router hiện tại. Dù comment có nhắc `refund_debit` cho topup, không có API tenant refund topup; không tài liệu hóa như tính năng vận hành đã sẵn sàng.

### 10.5 Refund tenant

`POST /api/v1/tenants/{tenant_id}/payments/{payment_id}/refund`, quyền `WRITE_ROLES`:

- Chỉ payment paid thuộc tenant; topup không xuất hiện trong feed tenant và không được refund qua tenant.
- Wallet: credit trả lại số dư.
- MoMo: gọi `/refund`, cần `provider_trans_id`; payment paid do query có thể thiếu transId, API trả conflict hướng dẫn xử lý ở console MoMo.
- Refund membership active chuyển revoked và suspend whitelist; pending chuyển rejected.
- Refund session khiến grant chưa dùng không còn match `status=paid`; không đảo ngược lần barrier đã mở hoặc event đã ghi.
- Chỉ refund toàn phần theo amount payment trong service hiện tại; không có partial-refund input.

Test payment dùng fake gateway; chúng không thay thử nghiệm sandbox thật, đối soát hoặc đánh giá race/callback lỗi trong vận hành tài chính.

**Nguồn:** `backend/app/services/payment_service.py`, `backend/app/services/payments/gateways.py`, `backend/app/services/wallet_service.py`, `backend/app/api/v1/tenant/payments.py`, `backend/app/schemas/driver.py`, `backend/tests/test_payments_api.py`, `backend/tests/test_phase4_payments.py`.

## 11. MQTT, command và kích hoạt edge

### 11.1 Topic bridge đăng ký

```text
tenants/{tenantId}/sites/{siteId}/gates/{gateId}/telemetry
tenants/{tenantId}/sites/{siteId}/gates/{gateId}/incident
tenants/{tenantId}/sites/{siteId}/gates/{gateId}/command
tenants/{tenantId}/sites/{siteId}/cameras/{cameraId}/detection
```

Bridge subscribe wildcard tương ứng với QoS 1. `command` là hướng backend→edge; bridge bỏ qua echo command của chính nó.

Telemetry thường cập nhật trạng thái gate, arm angle, nhiệt độ, relay, loop, pin/cycle và lưu raw payload. `type=heartbeat` với `deviceId` cập nhật last heartbeat/device online cùng CPU/RAM/storage/latency nếu có, không resurrect device decommissioned. `plateNumber` trên telemetry tạo access event riêng.

ACK mẫu trên telemetry:

```json
{"type": "command_ack", "commandId": "UUID-command", "success": true}
```

Camera detection hỗ trợ `vehicle_parked`, `vehicle_seen`, `vehicle_left`, `zone_snapshot`; xem [hợp đồng MQTT camera](mqtt-camera-detection.md). Nhánh camera xác minh camera của tenant trước khi ghi; snapshot key được lưu trên camera để lấy URL sau.

### 11.2 Lifecycle command

`command_service.issue_command` kiểm tra gate thuộc tenant, command được hỗ trợ (`open`, `close`, `lock`, `unlock`, `reboot`, `relink`), và `idempotencyKey`. Replay cùng gate/command trả record cũ; dùng key cho lệnh khác trả 409.

API tạo `gate_commands`, LPUSH `{topic,payload}` vào Redis key **`mqtt:outbox`**, đánh dấu `sent` ngay sau enqueue. Bridge BRPOP rồi publish QoS 1. ACK cập nhật `acknowledged`/`failed`; worker đánh dấu `timeout` nếu sent quá `timeout_at` (default 15 giây, sweep mỗi phút).

Đọc status bằng `/commands/{command_id}` và nhận frame WS `command_ack` khi ACK đến. Timeout sweep không tự phát cùng frame ACK. Reboot device fan-out command tới từng gate gắn device; không phải một RPC độc lập bảo đảm OS đã reboot.

**Giới hạn giao nhận:** DB transaction và Redis không commit nguyên tử; bridge pop trước publish, lỗi publish hiện chỉ log và không requeue item đã pop. `sent` là đã đưa vào Redis, không chứng minh broker/edge đã nhận. Không quảng bá đây là durable transactional outbox/exactly-once; cần theo dõi timeout và có quy trình retry/idempotency phía client/edge. Bridge cũng không tự dedupe mọi telemetry QoS 1 thành access event duy nhất.

### 11.3 Activation/config/sync

1. Tenant tạo device, gắn gate/lane/camera.
2. Tạo activation code một lần qua `/devices/{device_id}/activation-codes`; có expiry và optional `allowedIp` dạng IP/CIDR.
3. Edge gọi `/edge/activate`. Sai IP hoặc device chưa có gate được từ chối trước consume; consume bằng atomic update. Thành công trả bundle IDs, gate direction/camera stream, API token và MQTT credential.
4. `/edge/config` refresh không phát lại token/password. Relay barrier là cấu hình cục bộ edge; backend bundle không chứa relay HAL config. Khi backend refresh config, edge phải giữ cấu hình barrier local; xem [relay setup](barrier-relay-setup.md).
5. Whitelist sync trả `items`, `syncedAt`, `truncated`; `updatedSince` dùng `>=`, nên edge phải upsert và chịu được record lặp. Đây không phải change log có tombstone cho mọi delete: API xóa vật lý registered vehicle, không tự phát record xóa qua endpoint incremental. **Reconciliation (2026-10-24):** edge chạy full-snapshot reconciliation (`reconcile_whitelist` — fetch toàn bộ không cursor + purge local rows vắng mặt) khi kết nối lại lần đầu; các lần sync sau vẫn dùng incremental `updatedSince`. Cơ chế này xử lý hard-delete và trạng thái sai lệch do offline kéo dài.
6. `/edge/.../rules` trả snapshot rule active. Không suy diễn snapshot đã hỗ trợ toàn bộ rule semantics mà backend chưa thực thi.

Bundle MQTT dùng `MQTT_HOST` cấu hình server; nếu giá trị là hostname nội bộ Docker `emqx`, máy edge ngoài Docker sẽ không resolve được. Phải thiết kế địa chỉ broker truy cập được từ thiết bị, không chỉ kiểm tra bridge trong container kết nối được.

### 11.4 Auth broker và realtime

`/edge/mqtt-auth` có nhánh xác thực password là API key gắn device, username phải khớp MQTT client ID; nhánh authz kiểm tra topic prefix tenant. Đây không phải ACL chi tiết từng site/gate/action trong code hiện tại.

Compose dev đang cấu hình EMQX cho anonymous và không tự nối HTTP hook này vào broker. Có endpoint không đồng nghĩa broker production đã dùng nó; phải cấu hình authenticator/authorizer, TLS và kiểm chứng revoke/topic isolation tại broker trước khi triển khai.

Frame tenant WS gồm telemetry, access, command_ack, incident/incident_update, vehicle_location, camera_snapshot theo nơi phát. Driver WS nhận `{type: "session_event", plate, direction, decision, siteId, at}` như **hint refetch REST**, không phải trạng thái giao dịch authoritative. Hint driver có thể được phát fire-and-forget trước commit; client vẫn cần đọc REST/retry khi event chưa thấy.

**Nguồn:** `backend/app/realtime/mqtt_bridge.py`, `backend/app/services/command_service.py`, `backend/app/services/activation_service.py`, `backend/app/api/v1/edge.py`, `backend/app/api/v1/ws.py`, `backend/app/services/event_service.py`.

## 12. Worker, tích hợp và lưu trữ

### Job theo yêu cầu

`backend/app/workers/worker.py` đăng ký:

- `send_invite_email`, `send_password_reset_email`: SMTP qua aiosmtplib; link dùng `APP_BASE_URL`.
- `vehicle_import`: CSV upload tối đa 10 MiB ở endpoint, decode UTF-8 BOM được hỗ trợ, bắt buộc cột `plate_number`. Các cột worker đọc gồm `owner_name`, `owner_contact`, `vehicle_type`, `tag`, `notes`; thiếu plate/trùng normalized plate thì skip. Job không phải upsert toàn bộ hồ sơ xe có sẵn.
- `audit_export`: lọc tenant hoặc hoạt động platform-admin, tối đa 200.000 row, tạo CSV trên S3 và lưu key/download URL vào kết quả job.

Import/export trả 202, theo dõi `background_jobs` qua tenant/platform `/jobs/{job_id}`. Worker `max_jobs=10`, `job_timeout=300` giây. Không coi progress/job record là hệ thống retry/khôi phục lỗi tùy ý cho mọi side effect bên ngoài.

### Cron hiện có

- Tạo partition: 00:30.
- Expire command: mỗi phút, giây 10.
- Mark device offline: giây 0/15/30/45; online device không có heartbeat mới trong 20 giây chuyển offline, thực tế phụ thuộc lịch worker.
- Cleanup session: 03:15, xóa session có `expires_at` cũ hơn 30 ngày.
- Presence stale/expiry: phút 5/20/35/50, với giới hạn tenant-filter đã nêu.
- Retention: 02:00.
- Incident notify: mỗi phút, giây 45.

Các giờ/phút này là giá trị cron trong `WorkerSettings`; không diễn giải thành giờ địa phương từng bãi. Không có cron recurring subscription hay payment reconciliation riêng được đăng ký.

### Cảnh báo incident

Job lấy incident severity `critical`, chưa resolved/chưa notified, tối đa 50 mỗi lần. Cấu hình tenant trong `tenants.settings`: `webhook_url`, `telegram_chat_id`, `notify_on_critical`; Telegram bot token từ `platform_settings.telegram_bot_token`. Có guard URL webhook http(s) chỉ resolve IP public; tối đa 5 lần thử, lưu `notify_error`. Chưa cấu hình kênh có thể được đánh dấu done, không có nghĩa đã gửi thông báo. Hạ tầng email dev là Mailpit, không phải dịch vụ email production.

### S3 và địa chỉ truy cập

`backend/app/services/storage.py` dùng boto3 signature v4 và **một** `S3_ENDPOINT_URL` cho cả thao tác server lẫn URL presign. PUT trả `uploadUrl`, `objectKey`, `expiresIn`; default TTL 900 giây, key dạng `{tenant_id}/{kind}/{uuid}`. Các field có hậu tố `_url` trong DB có thể đang giữ object key, không phải URL public vĩnh viễn.

Trong Compose, `s3:4566` truy cập được từ container nhưng thường không từ trình duyệt/edge host; `localhost:9000` truy cập được từ host nhưng chỉ chính container khi nằm trong URL server-side. Cần hostname/reverse proxy S3 cùng truy cập được từ các bên hoặc cách triển khai mạng thích hợp. Không tự sửa hostname sau khi ký vì có thể làm sai chữ ký. Cấu hình CORS bucket nếu browser PUT trực tiếp; mã hiện không tự cấu hình đầy đủ bucket CORS cho production. Không cần ảnh đi qua API bằng multipart chỉ vì API cấp URL upload.

**Nguồn:** `backend/app/workers/jobs.py`, `backend/app/workers/worker.py`, `backend/app/api/v1/tenant/vehicles.py`, `backend/app/api/v1/tenant/audit.py`, `backend/app/services/storage.py`.

## 13. Biến môi trường và khởi động

`Settings` trong `backend/app/config.py` đọc `.env` UTF-8 ở thư mục làm việc, bỏ qua key lạ; biến môi trường tiến trình có thể override. `.env.example` tồn tại trong backend nhưng bị chặn đọc bởi thiết lập private-files trong phiên biên soạn này; các giá trị dưới đây lấy từ `config.py`, không khẳng định file mẫu đang giống hệt.

### Nhóm biến cần kiểm tra

- **Ứng dụng:** `APP_NAME`, `ENVIRONMENT`, `API_V1_PREFIX` (default `/api/v1`), `DEBUG`; đặt `ENVIRONMENT=production` đơn lẻ không tự khóa toàn bộ endpoint hoặc đổi secret/Cookie Secure.
- **DB:** `DATABASE_URL` runtime, `MIGRATION_DATABASE_URL` migration/seed; `DB_POOL_SIZE=10`, `DB_MAX_OVERFLOW=20`. `APP_DB_PASSWORD` được migration đầu đọc trực tiếp để cấp role, không phải field Settings.
- **Redis/rate limit:** `REDIS_URL`, `RATE_LIMIT_ENABLED=true`, `TRUST_PROXY_HEADERS=false`. Rate limiter fixed-window chia sẻ qua Redis, áp dụng ở các dependency đã gắn; Redis lỗi thì **fail open**, không phải bảo vệ DDoS toàn hệ thống.
- **JWT/session:** `JWT_SECRET`, `JWT_PREVIOUS_SECRETS`, `JWT_ALGORITHM=HS256`, `ACCESS_TOKEN_TTL_SECONDS=900`, `REFRESH_TOKEN_TTL_SECONDS=1209600`, `PASSWORD_RESET_TTL_SECONDS=1800`.
- **MFA/lockout:** `FIELD_ENCRYPTION_KEY`, `MFA_PENDING_TTL_SECONDS=300`, `MFA_MAX_ATTEMPTS=5`, `LOGIN_MAX_ATTEMPTS=5`, `LOGIN_LOCKOUT_SECONDS=900`.
- **Cookie/CORS:** `COOKIE_DOMAIN`, `COOKIE_SECURE=false` khi dev, `COOKIE_SAMESITE=lax`, `CSRF_COOKIE_NAME=vm_csrf`, `ACCESS_COOKIE_NAME=vm_access`, `REFRESH_COOKIE_NAME=vm_refresh`, `CORS_ORIGINS` default `["http://localhost:3000"]`. Dùng JSON array cho biến danh sách để tránh khác biệt parsing môi trường.
- **MQTT:** `MQTT_HOST=localhost`, `MQTT_PORT=1883`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_TLS=false`, `MQTT_COMMAND_TIMEOUT_SECONDS=15`. Thay credential dev và hostname theo vị trí chạy.
- **S3:** `S3_ENDPOINT_URL=http://localhost:9000`, `S3_REGION=us-east-1`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET=vehicle-events`, `S3_PRESIGN_TTL_SECONDS=900`.
- **Email:** `SMTP_HOST`, `SMTP_PORT=1025`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_TLS=false`, `APP_BASE_URL=http://localhost:3000`. Link email cần URL frontend thực, không chỉ URL API.
- **Payment:** `PAYMENT_PROVIDER=none`; `MOMO_PARTNER_CODE`, `MOMO_ACCESS_KEY`, `MOMO_SECRET_KEY`, `MOMO_ENDPOINT`; `PAYMENT_REDIRECT_URL=parkvision://payments/return`, `PAYMENT_IPN_BASE_URL`, `PAYMENT_TTL_MINUTES=30`, `PAID_EXIT_GRACE_MINUTES=15`.
- **Quan sát/seed:** `METRICS_TOKEN`, `SEED_PLATFORM_ADMIN_EMAIL`, `SEED_PLATFORM_ADMIN_PASSWORD`.

Secret mặc định chỉ phục vụ dev. `FIELD_ENCRYPTION_KEY` cần giữ ổn định/backup để giải mã TOTP; `_fernet()` có fallback derive key từ chuỗi không hợp lệ cho tiện dev, không có nghĩa chuỗi tùy ý là cấu hình production tốt. Tạo secret mạnh và lưu ngoài repository; không đưa API key, cookie, mật khẩu relay/camera, JWT hay raw payload payment vào log công khai.

### Docker Compose

Từ `backend/`, tạo `.env`, kiểm tra biến rồi:

```sh
docker compose up -d --build
docker compose exec api python -m scripts.seed
docker compose ps
docker compose logs --since 10m api worker mqtt-bridge migrate
```

Trong container DB/Redis/SMTP/MQTT dùng tên service `postgres`, `redis`, `mailpit`, `emqx`; S3 và broker trong activation bundle cần xử lý khả năng truy cập ngoài Docker như đã nêu. API công bố 8000; PostgreSQL 5432; Redis 6379; MQTT 1883; EMQX dashboard 18083; LocalStack S3 9000→4566; Mailpit SMTP 1025/UI 8025.

Compose hiện có service `omniroute` và volume riêng; không có bằng chứng từ các luồng service đã khảo sát rằng đó là dependency nghiệp vụ ANPR/payment. Giữ nguyên các tùy chỉnh Compose có sẵn khi làm việc tài liệu. Không dùng cấu hình dev gồm password mẫu, broker anonymous và cổng DB công bố trực tiếp làm cấu hình production.

### Chạy ứng dụng trên host

Cài `python -m venv .venv`, rồi dùng Python trong venv để `pip install -e ".[dev]"`, `alembic upgrade head`, `scripts.seed`, `uvicorn app.main:app --reload`. Chạy arq và bridge ở hai terminal khác nếu không dùng container cho chúng. Host URL dùng `localhost` và cổng công bố, khác URL service Docker. Lệnh chi tiết/cú pháp interpreter Windows tại [README](../backend/README.md).

Trên Windows, test fixture và realtime E2E cài `WindowsSelectorEventLoopPolicy` cho aiomqtt. Entrypoint bridge hiện không làm vậy; ưu tiên container Linux cho bridge nếu gặp lỗi `add_reader`/`add_writer`, không hứa native Windows hoạt động giống Docker chỉ vì API khởi động được.

## 14. Kiểm thử và mức độ bằng chứng

### Integration pytest

`backend/tests/conftest.py` dùng httpx ASGITransport, PostgreSQL và Redis thật. Fixture session:

1. Kiểm tra tên DB ở `MIGRATION_DATABASE_URL` kết thúc `_test`.
2. Tạo DB đó nếu cần, `DROP SCHEMA public CASCADE`, tạo schema, chạy Alembic head.
3. Mỗi test tạo dữ liệu fixture; fixture autouse xóa `mqtt:outbox` trước test.

**Cả `DATABASE_URL` và `MIGRATION_DATABASE_URL` phải trỏ cùng DB test riêng trên PostgreSQL instance cách ly.** Guard không chứng minh runtime URL cũng an toàn. Chỉ đổi tên DB trên cluster đang phục vụ dev/production chưa đủ: migration `0001_initial_schema.py` tạo hoặc `ALTER ROLE vehicle_app ... PASSWORD` ở cấp cluster, lấy `APP_DB_PASSWORD` từ môi trường tiến trình hoặc mặc định `vehicle_app`. Việc này có thể đổi mật khẩu runtime của ứng dụng khác trên cùng instance. Dùng Redis riêng, không chung queue với dev/production. Ngay cả chạy chọn `tests/test_pricing.py` cũng chịu autouse fixture của suite, không mặc định không cần DB/Redis.

Ví dụ POSIX, từ `backend/`; PostgreSQL/Redis ở các cổng dưới đây phải là instance test cách ly:

```sh
DATABASE_URL=postgresql+asyncpg://vehicle_app:vehicle_app@localhost:5432/vehicle_mgmt_test \
MIGRATION_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/vehicle_mgmt_test \
REDIS_URL=redis://localhost:6379/1 MQTT_HOST=localhost RATE_LIMIT_ENABLED=false \
.venv/bin/python -m pytest
```

Dùng cùng các biến khi chạy nhóm nhỏ, ví dụ `-m pytest tests/test_payments_api.py tests/test_phase4_payments.py`. Fixture đặt nhiều default qua `os.environ.setdefault`; biến đã tồn tại trong shell có thể giữ nguyên và trỏ nhầm dịch vụ nếu không kiểm tra.

Phạm vi test nguồn hiện có:

- `test_auth.py`: cookie, refresh/reuse, logout, MFA, lockout, reset password.
- `test_tenant_isolation.py`: path mismatch, RLS, CSRF, platform read scope.
- `test_resources_and_commands.py`, `test_schema_alignment.py`: resource, command idempotency/ACK, audit/column alignment.
- `test_security_and_members.py`: profile/member, invite, security alert/admin actions.
- `test_cameras.py`, `test_parking.py`: camera validation/coverage, presence/map/public locate, MQTT detection handler.
- `test_edge_activation.py`, `test_edge_devices.py`: activation/IP pinning, token/config, MQTT hook, lifecycle/reboot.
- `test_driver_api.py`: auth/vehicle/favorite/site discovery/session và ownership theo plate.
- `test_memberships_api.py`: plan/request/activate/revoke/expiry.
- `test_pricing.py`: block, grace, daily cap, overnight/timezone.
- `test_payments_api.py`, `test_phase4_payments.py`: payment, fake IPN/query/refund, paid exit, topup/wallet/hint.

Các tên test cho biết ý định kiểm tra, **không phải tuyên bố tất cả đang pass**. Fake gateway không kiểm tra chữ ký/network MoMo thật hay settlement thực.

### E2E qua mạng

`backend/tests/e2e/e2e_api.py` và `e2e_realtime.py` cần stack chạy, seed và dependency dev. Chúng dùng URL cố định `localhost:8000`, MQTT 1883, Mailpit 8025 và mật khẩu demo; `ids.py` khám phá resource demo và tạo tenant/vehicle thử ngay khi import. Vì có ghi dữ liệu, chỉ chạy môi trường thử riêng.

```sh
.venv/bin/python tests/e2e/e2e_api.py
.venv/bin/python tests/e2e/e2e_realtime.py
```

Đặt `RATE_LIMIT_ENABLED=false` cho API thử nghiệm để nhiều login không đụng limiter. Nếu API chạy trên host thì `MQTT_HOST=localhost`; nếu API/bridge trong Compose thì broker là `emqx`. Harness realtime kết nối MQTT không credential theo cấu hình anonymous dev, không đại diện kiểm thử ACL production.

Kiểm tra tĩnh: `.venv/bin/python -m ruff check app tests scripts`. Tài liệu này không khẳng định đã chạy pytest, E2E, Ruff, Docker build hoặc kiểm chứng tích hợp bên ngoài trong phiên biên soạn.

## 15. Triển khai, quan sát và xử lý sự cố

### Checklist trước khi đưa vào môi trường thật

- Chạy migration trước API/worker/bridge; kiểm tra revision DB và quyền DDL của maintenance cron, không dùng superuser cho HTTP runtime.
- Thay secret/JWT/field-encryption/DB/MQTT/S3/SMTP/payment và mật khẩu seed; không seed demo vào production.
- Đặt TLS qua reverse proxy, `COOKIE_SECURE=true`, CORS origin chính xác; chỉ bật `TRUST_PROXY_HEADERS` sau proxy tin cậy có ghi đè header. Edge IP pinning có logic XFF riêng: chỉ tin XFF khi peer private/loopback, không tự theo biến global đó.
- Proxy cả `/api` và `/ws` với WebSocket upgrade; bảo vệ URL query token khỏi access log, vì WS driver dùng `?token=`.
- Cấu hình broker TLS/authn/authz thật, không anonymous; kiểm tra username, topic prefix, credential revoke từ thiết bị thật.
- Kiểm tra URL S3 ký sẵn và MQTT bundle từ browser/edge ngoài Docker, không chỉ từ API container.
- Payment: thử sandbox create→IPN/query→membership/paid-exit/refund, IPN URL public phải đi tới backend; có quy trình đối soát và xử lý thiếu transId/tiền nhận nhưng activate lỗi.
- Backup PostgreSQL và object storage; giữ secret giải mã. Xem [runbook backup/restore](RUNBOOK_BACKUP_RESTORE.md), thử restore vào môi trường riêng trước khi tin bản backup.
- Cấu hình Redis persistence/availability và quy trình mất queue nếu cần; mã hiện tại không tự cung cấp bảo đảm giao nhận command/end-to-end đúng một lần.

### Health và metrics

- `GET /healthz`: trả `{"status":"ok"}`, không ping DB/MQTT/S3.
- `GET /readyz`: kiểm tra DB và Redis, trả body `ok`/`degraded` nhưng HTTP vẫn 200; readiness probe phải xét body nếu dùng endpoint hiện tại.
- `GET /api/v1/platform/infra/health`: cần platform auth, kiểm tra DB/Redis/MQTT/S3. MQTT check chỉ thử TCP connect, không chứng minh bridge subscribe, credential đúng hay command được ACK.
- `GET /metrics`: Prometheus HTTP request counter/histogram; khi có `METRICS_TOKEN` cần Bearer đúng token này. Mặc định không có token nên phải bảo vệ ingress nếu không muốn công khai. Không nhầm endpoint này với `/api/v1/platform/metrics/*` là business aggregate từ DB.
- Docker API healthcheck hiện gọi `/healthz`, không phải kiểm thử sẵn sàng toàn stack.

### Triệu chứng thường gặp

- **API 401 dù vừa có Bearer driver:** kiểm tra cookie dashboard còn gửi kèm, token type, session revoke/expiry.
- **Ghi resource 403:** kiểm tra CSRF cookie/header, tenant path và actor/role; platform admin không tự có `WRITE_ROLES` tenant.
- **Command sent rồi timeout:** xem `mqtt-bridge` log, Redis `mqtt:outbox`, broker topic, edge subscription/ACK và worker; không gửi key mới vô hạn trước khi hiểu gate đã thực thi hay chưa.
- **Không có ảnh/map:** bucket có thể chưa tạo do startup best-effort; kiểm tra key, endpoint truy cập từ client, S3 credentials, CORS và TTL URL.
- **Driver không thấy phiên:** event phải allow, có site, plate chuẩn hóa khớp xe đã khai; kiểm tra scan bound, event gốc và việc sửa biển số không tự replay session.
- **Bãi không hiện public:** tenant/site phải active, listed không false; tenant vừa self-register là trial nên chưa đáp ứng điều kiện discovery.
- **503 payment:** chưa cấu hình gateway MoMo/credentials; không thay bằng giả lập paid ở production. Wallet payment có nhánh riêng không cần gateway nếu đã có số dư.
- **Cron partition lỗi quyền hoặc DEFAULT conflict:** kiểm tra role runtime và row trong partition DEFAULT; migration thành công không giải quyết tự động hai vấn đề này.

## 16. Ranh giới đã xác minh từ nguồn

Không thấy stub trả thành công giả cho payment trong service: gateway không cấu hình trả lỗi rõ ràng. Tuy vậy những phần sau **không được coi là tính năng hoàn chỉnh chỉ vì schema/comment có tên**:

- Rule quota/site/holiday/action tổng quát; recurring membership và billing SaaS.
- Booking giữ chỗ, tự động thu phí mọi exit, hóa đơn/thuế, partial refund, chuyển/rút ví.
- ~~Chứng minh sở hữu biển số driver~~ — đã xử lý: mỗi biển số chỉ thuộc một tài khoản, chia sẻ theo ngày qua `driver_vehicle_shares` (GAP-BE-002).
- Payment grant offline và enforcement giống nhau hoàn toàn giữa backend/edge.
- Transactional outbox, telemetry dedupe, WS replay/revoke tức thời.
- TTL presence cách ly theo tenant trong cron hiện tại, quyền DDL maintenance và di chuyển row DEFAULT tự động.

Đây là các giới hạn đọc từ code, không phải kết quả pentest, thử tải hay xác nhận môi trường triển khai. Khi thay đổi hành vi, cập nhật tài liệu cùng service/router/test tương ứng thay vì biến mô tả thiết kế thành cam kết vận hành.
