# Hai ứng dụng web ParkVision — tài liệu đối chiếu mã nguồn

Tài liệu mô tả **hành vi có trong source** của `frontend/` và `mobile/`, không xem nội dung marketing, tên dependency hay comment cũ là bằng chứng một tính năng đã chạy production. “Đã tích hợp” dưới đây nghĩa là UI có lời gọi API và xử lý response; chưa có nghĩa đã kiểm chứng backend, thiết bị hoặc cổng thanh toán thực tế.

Hướng dẫn chạy riêng: [Web quản trị](../frontend/README.md), [Web tài xế](../mobile/README.md). Phạm vi tài liệu này không thay thế thiết kế backend, edge FSM hoặc ANPR worker.

## 1. Ranh giới và cấu trúc

### Web quản trị (`frontend`)

React 19 + TypeScript + Vite 6 + Tailwind CSS 4, D3 cho barrier map, Recharts cho chart, i18next/react-i18next cho Việt/Anh. `@google/genai` còn được khai báo nhưng không thấy được gọi trong source đã quét; không cần Gemini API key để dùng app hiện tại.

- [`src/main.tsx`](../frontend/src/main.tsx): điểm khởi động React.
- [`src/App.tsx`](../frontend/src/App.tsx): quyết định public/platform/tenant và render màn theo state.
- [`src/context/PlatformContext.tsx`](../frontend/src/context/PlatformContext.tsx): session, tải dữ liệu, mutation, navigation, realtime, toast.
- [`src/services/api/index.ts`](../frontend/src/services/api/index.ts): các nhóm API.
- [`src/services/api/client.ts`](../frontend/src/services/api/client.ts): cookie/CSRF/refresh/error handling.
- [`src/services/api/schema.d.ts`](../frontend/src/services/api/schema.d.ts), [`mappers.ts`](../frontend/src/services/api/mappers.ts): DTO/kiểu API và chuyển model UI; không có npm script sinh schema trong `package.json`.
- `src/pages/` và `src/components/tenant/`: màn nghiệp vụ và modal/editor.
- [`src/services/barrierMapData.ts`](../frontend/src/services/barrierMapData.ts): ghép dữ liệu site/gate/device/lane/event/live frame lên bản đồ.

### Web tài xế (`mobile`)

React/Vite/TypeScript/Tailwind và Leaflet. Đây là SPA giao diện mobile, không phải project native. Cây nguồn hiện tại không cung cấp Dockerfile hay pipeline đóng gói Android/iOS.

- [`src/App.tsx`](../mobile/src/App.tsx): auth gate, 5 tab, bộ lọc và modal toàn cục.
- [`src/hooks/useAuth.tsx`](../mobile/src/hooks/useAuth.tsx): trạng thái tài khoản và guest.
- [`src/lib/api.ts`](../mobile/src/lib/api.ts): REST bearer client, token store, URL socket.
- [`src/api/driver.ts`](../mobile/src/api/driver.ts), [`public.ts`](../mobile/src/api/public.ts), [`types.ts`](../mobile/src/api/types.ts): API driver/công khai và DTO.
- `src/hooks/`: sites, phiên active/lịch sử, favorites, vehicles, memberships, payments, WS hints.
- `src/components/discover/`, `views/`, `profile/`, `auth/`: giao diện và form.

**Chú ý định danh:** model `Tenant` phía mobile là một **site/bãi** hiển thị cho người lái; `id` và `siteId` cùng là site ID. `tenantId` là tổ chức sở hữu và `tenantSlug` phục vụ tra xe. Không truyền nhầm site ID vào API tenant.

## 2. Điều hướng, màn hình và vai trò

### 2.1. Public và auth của dashboard

Site public dùng react-router với các route `/`, `/download`, `/privacy`, `/terms`, `/sla`, `/login`, `/register`, `/activate`, `/reset-password`, `/find-my-car`; path không khớp render landing. Workspace đã đăng nhập **không** được route: điều hướng bằng `primaryTab`, `platformSubTab`, `tenantNavTab` và các state khác, URL bị bỏ qua khi đã xác thực, nên Back/Forward và reload không phục hồi đầy đủ màn/tab hiện tại.

`/download` liệt kê bản build mới nhất (edge Windows, Android) từ `GET /api/v1/updates/latest` và tải qua `GET /api/v1/updates/download/{channel}`.

Ba route đọc query từ router location:

- `/activate?token=...`: form đặt mật khẩu kích hoạt lời mời.
- `/reset-password?token=...`: đặt lại mật khẩu bằng token.
- `/find-my-car?tenant=<slug>&plate=<bien-so>`: tra vị trí xe; `tenant` bắt buộc, `plate` tùy chọn để auto-search, tối thiểu 4 ký tự sau trim.

Các pathname không khớp render landing. Màn public được render khi chưa đăng nhập hoặc khi admin đã đăng nhập bật chế độ preview landing; trong preview, mọi route public vẫn điều hướng được. Ngoài preview, sau khi đăng nhập URL bị thay bằng `/` (`navigate('/', { replace: true })`) và workspace được render thay cho màn public; thoát preview ('Back to Admin Dashboard') khi đang ở route khác `/` cũng đưa về `/` qua cùng cơ chế.

Landing có nội dung marketing, simulator và bảng giá. Login có credentials, MFA challenge, backup code, quên mật khẩu; thử phục hồi MFA pending qua `/auth/mfa/session`. Register kiểm tra slug có debounce 350 ms, chọn gói rồi `POST /register`, sau đó đăng nhập. Các trường có trên form không nhất thiết được gửi: payload đăng ký được thể hiện trực tiếp trong `RegisterPage.tsx`.

Privacy/Terms/SLA là trang nội dung tĩnh. `publicApi.legal` tồn tại trong API module không đồng nghĩa các trang này đã render nội dung từ server.

Nguồn: [`App.tsx`](../frontend/src/App.tsx), [`LoginPage.tsx`](../frontend/src/pages/auth/LoginPage.tsx), [`RegisterPage.tsx`](../frontend/src/pages/auth/RegisterPage.tsx), [`FindMyCarPage.tsx`](../frontend/src/pages/public/FindMyCarPage.tsx).

### 2.2. Platform console

Workspace được suy ra từ `/auth/me`: `userType === 'platform_admin'` mở platform; không có công tắc chọn workspace tùy ý.

- **Dashboard:** metrics overview, throughput 24 giờ, tổng hợp tenant/users/events, health và các danh sách liên quan. Có server metrics riêng; một số số liệu fallback từ các collection đang tải.
- **Tenants:** danh sách, tạo tenant và owner, chi tiết/cập nhật trạng thái; có impersonation API.
- **Platform:** settings, feature flags và overrides, platform admins và reset MFA.
- **Monitoring:** service health, edge fleet/reboot, camera registry, barrier map, incidents/ack/resolve/bulk resolve.
- **Security:** security alerts/ack/resolve, login activity, phiên đăng nhập/revoke, API credentials/create/rotate/revoke.
- **Audit:** lọc/hiển thị và export job.

`PlatformContext.loadPlatformData` tải tenants/admins/sessions/flags/settings/infra health/credentials/alerts/login events/audit. Nó không tự tải toàn bộ fleet/gate/camera mọi tenant; các collection tenant được tải khi có active tenant. Không coi mọi bộ đếm trên platform là số liệu fleet toàn cục nếu chúng chỉ dựa trên state tenant.

Nguồn: [`DashboardPage.tsx`](../frontend/src/pages/DashboardPage.tsx), [`MonitoringPage.tsx`](../frontend/src/pages/monitoring/MonitoringPage.tsx), [`PlatformContext.tsx`](../frontend/src/context/PlatformContext.tsx).

### 2.3. Tenant portal

Tenant user lấy tenant từ session; platform admin chọn tenant để tải dữ liệu. Sau impersonation, app gọi lại `/auth/me` để áp workspace theo session mới.

- **Dashboard:** summary và hourly flow API, access events, occupancy, alerts/health, thao tác gate.
- **Location/sites:** thông tin site, địa chỉ/GPS/capacity/giờ hoạt động/public profile; camera và liên kết site/lane.
- **Users & members:** lời mời, vai trò, trạng thái, membership profile, reset password, import/export.
- **Vehicles/whitelist:** tạo/sửa biển số/owner association/trạng thái, import CSV qua job.
- **Rules:** tạo/sửa/nhân bản/bật tắt/xóa/ưu tiên, kiểm tra conflict tại UI và gọi simulator server.
- **Access events:** lọc, drawer ảnh, sửa biển số; cần phân biệt event do ANPR và event `source: manual`.
- **Edge devices:** đăng ký/cập nhật/decommission/reactivate/delete, reboot, tạo activation code, ràng buộc IP và thu hồi token qua API.
- **Barrier map:** quan sát trạng thái, command pending, telemetry và heuristic bất thường.
- **Parking map:** tầng/zone, ảnh nền, camera coverage, presences/locate và manual check-in/check-out. Upload ảnh đi qua presign API rồi PUT lên upload URL.
- **Memberships:** ba tab requests/plans/payments; CRUD gói theo site, activate/reject/revoke yêu cầu, lọc payment và refund.
- **Settings:** lưu org/contact, OCR threshold, delay, barrier policy, webhook/Telegram, backup/retention/notification fields qua API. UI OCR nhập phần trăm và đổi về 0–1 trước gửi.

Vai trò UI hiển thị từ dữ liệu server, không phải cơ chế bảo vệ tài nguyên. Điểm thực thi quyền là backend; quy tắc đầy đủ theo vai trò × thao tác nằm ở [mục 2.5](#25-ma-trận-vai-trò--thao-tác-nhạy-cảm-backend-enforcement). Các giới hạn/guard UI không thay thế authorization backend.

Nguồn: [`App.tsx`](../frontend/src/App.tsx), [`PlatformSidebar.tsx`](../frontend/src/components/layout/PlatformSidebar.tsx), [`TenantMembershipsPage.tsx`](../frontend/src/pages/tenant/TenantMembershipsPage.tsx), [`TenantSettingsPage.tsx`](../frontend/src/pages/tenant/TenantSettingsPage.tsx), `frontend/src/pages/tenant/` và `frontend/src/components/tenant/`.

### 2.4. Driver/guest

Mobile có `loading`, `unauthenticated`, `guest`, `authed`. Khi unauthenticated, login screen thay toàn bộ nội dung. Guest xem Discover/Map, các tab riêng tư hiện yêu cầu đăng nhập.

- **Discover:** search, availability/distance/price/type/facilities/membership filters, danh sách bãi, bản đồ và active parking card.
- **Map:** bản đồ lớn, marker/preview/detail, directions qua URL Google Maps.
- **My Parking:** phiên `PARKED` đầu tiên và lịch sử 20 bản ghi/trang. API active có thể trả nhiều phiên nhưng hook chỉ lấy một phiên để hiển thị.
- **Memberships:** trạng thái yêu cầu/hội viên, hủy, nút thanh toán; chọn gói và xe tại modal chi tiết bãi.
- **Profile:** thông tin user, CRUD xe/chọn xe chính, language, payment sheet, notification preferences, security/password/session revoke, logout.
- **Find vehicle:** lookup public bằng tenant slug + biển số phiên active; hiện tên tầng/zone/ảnh nếu có. Không triển khai định vị GPS trong nhà hay chỉ đường tới một ô đỗ xác định.

Tab/modal dùng state, không có route URL riêng. `driverApi.updateMe` có trong API module nhưng `ProfileScreen` đã quét chủ yếu hiển thị hồ sơ và quản lý xe; sự tồn tại helper không đảm bảo có UI sửa mọi trường hồ sơ.

Nguồn: [`mobile/src/App.tsx`](../mobile/src/App.tsx), [`ProfileScreen.tsx`](../mobile/src/components/views/ProfileScreen.tsx), [`FindMyVehicleModal.tsx`](../mobile/src/components/discover/FindMyVehicleModal.tsx).

### 2.5. Ma trận vai trò × thao tác nhạy cảm (backend enforcement)

Backend là điểm thực thi duy nhất. Vai trò lấy từ claim `role` của access token (`deps.get_auth_context`); không có kiểm tra quyền theo site, theo tài nguyên riêng lẻ hay theo MFA (xem mục 3, MFA và step-up).

**Vai trò tồn tại** (`backend/app/core/enums.py`):

- Tenant user (`TenantUserRole`): `owner`, `admin`, `operator`, `viewer`.
- Platform admin (`PlatformAdminRole`): `super_admin`, `ops`, `support`.

**Các dependency quyết định kết quả** (`backend/app/api/deps.py`):

| Dependency | Ai qua được | Từ chối |
|---|---|---|
| `tenant_ctx` → `tenant_match` | Tenant user có `tid` = `{tenant_id}` trên path (mọi role), **mọi** platform admin (bypass) | 403 `Tenant mismatch` |
| `require_roles(*WRITE_ROLES)` | Tenant user `owner`/`admin`/`operator` | 403 `Tenant user required` (platform admin, driver), 403 `Insufficient role` (`viewer`) |
| `require_roles(*ADMIN_ROLES)` | Tenant user `owner`/`admin` | 403 `Tenant user required`, 403 `Insufficient role` |
| `require_tenant_audit_reader` | Tenant user `owner`/`admin` của đúng tenant, mọi platform admin | 403 `Tenant mismatch` / `Insufficient role` |
| `require_platform_admin()` (gắn ở router `/platform`) | Mọi platform admin | 403 `Platform admin required` |
| `require_platform_admin((...))` theo route | Platform role nằm trong tuple | 403 `Insufficient platform role` |
| `csrf_protect` | Ghi bằng cookie có `X-CSRF-Token` khớp `vm_csrf`; request có header `Authorization` được miễn | 403 `CSRF token missing or mismatched` |

Token thiếu/hết hạn/bị thu hồi hoặc còn `mfa_pending` trả **401** trước mọi kiểm tra role (`get_auth_context`). Mọi lỗi 403 có `code: forbidden`.

**Hệ quả quan trọng:** `require_roles` gọi `require_tenant_user` trước, nên **platform admin không impersonate chỉ đọc được dữ liệu tenant**; mọi endpoint ghi dưới `/tenants/{tenantId}` trả 403 `Tenant user required`. Muốn ghi, platform admin phải impersonate (xem dưới).

**Tenant portal** (`/api/v1/tenants/{tenantId}/...`):

| Thao tác | owner | admin | operator | viewer | Platform admin (không impersonate) | Nguồn |
|---|:-:|:-:|:-:|:-:|:-:|---|
| Đọc mọi danh sách/chi tiết: sites, gates, commands, telemetry, devices, cameras, vehicles, rules, users, access events, incidents, parking, memberships, payments, walk-ins, dashboard | ✓ | ✓ | ✓ | ✓ | ✓ (đọc) | `tenant_ctx`, không có `require_roles` trên các route `GET` |
| Đọc settings | ✓ | ✓ | ✓ | ✓, các khóa thông báo nhạy cảm bị che `•••` | ✓, bị che như viewer | `events.get_tenant_settings` |
| Gửi lệnh gate (open/close/lock/`reboot`…) | ✓ | ✓ | ✓ | 403 | 403 | `gates.send_command` |
| Edge device: đăng ký, sửa, **decommission**, reactivate, xóa, **reboot**, tạo activation code, **thu hồi token**, `edge-setup` | ✓ | ✓ | ✓ | 403 | 403 | `gates.register_device`, `update_device`, `decommission_device`, `reactivate_device`, `delete_device`, `reboot_device`, `create_activation_code`, `revoke_device_token`, `setup_edge_client` |
| Sites/lanes/gates/cameras/parking levels/zones: tạo, sửa, xóa; presign ảnh | ✓ | ✓ | ✓ | 403 | 403 | `sites.py`, `gates.create_gate/update_gate`, `cameras.py`, `parking.py` |
| Vehicles/whitelist: tạo, sửa, xóa, import CSV | ✓ | ✓ | ✓ | 403 | 403 | `vehicles.create_vehicle/update_vehicle/delete_vehicle/import_vehicles` |
| Rules: tạo, sửa, xóa, simulate | ✓ | ✓ | ✓ | 403 | 403 | `rules.py` |
| Access events: tạo thủ công, **sửa biển số**, presign; incidents: tạo, ack, resolve, bulk resolve | ✓ | ✓ | ✓ | 403 | 403 | `events.create_access_event`, `correct_plate`, `acknowledge_incident`, `resolve_incident`, `bulk_resolve_incidents` |
| Manual check-in/check-out presence | ✓ | ✓ | ✓ | 403 | 403 | `parking.manual_checkin/manual_checkout` |
| Ghi settings | ✓ | ✓ | ✓ | 403 | 403 | `events.put_tenant_settings` |
| Membership plans: tạo, sửa | ✓ | ✓ | ✓ | 403 | 403 | `memberships.create_plan/update_plan` |
| Membership: activate, reject, **revoke** | ✓ | ✓ | ✓ | 403 | 403 | `memberships.activate_membership/reject_membership/revoke_membership` |
| **Refund** payment `paid` (membership/session; không phải top-up) | ✓ | ✓ | ✓ | 403 | 403 | `payments.refund_payment` |
| Users: mời, sửa role/trạng thái, vô hiệu hóa, gửi lại lời mời, **reset password** | ✓ | ✓ (trừ tài khoản owner) | 403 | 403 | 403 | `users.invite_user/update_user/deactivate_user/resend_invite/admin_password_reset` |
| Cấp/đổi/gỡ role `owner`, vô hiệu hóa hoặc reset password của một owner | ✓ | 403 `Only an owner can manage owner accounts` | 403 | 403 | 403 | `users._require_owner_for_owner_change` |
| Hạ cấp/vô hiệu hóa owner active cuối cùng | 409 `A tenant must keep at least one active owner` | — | — | — | — | `users._require_other_active_owner` |
| Đọc audit log tenant | ✓ | ✓ | 403 | 403 | ✓ | `audit.list_audit_logs` (`require_tenant_audit_reader`) |
| Export audit log tenant | ✓ | ✓ | 403 | 403 | 403 | `audit.export_audit_logs` (`require_roles(*ADMIN_ROLES)`) |

Tenant user của tenant khác nhận 403 `Tenant mismatch` cho mọi route trên, bất kể role. Các bảng tenant còn được RLS lọc theo tenant (`get_tenant_db` → `tenant_session`). Kiểm thử neo: `backend/tests/test_rbac_matrix.py`.

**Platform console** (`/api/v1/platform/...`, router đã yêu cầu platform admin):

| Thao tác | super_admin | ops | support | Nguồn (`backend/app/api/v1/platform.py`) |
|---|:-:|:-:|:-:|---|
| Đọc tenants, users của tenant, admins, sessions, settings, feature flags, infra health, security alerts, login events, metrics, telemetry snapshot, audit logs, credentials, jobs | ✓ | ✓ | ✓ | router dependency `require_platform_admin()` |
| Export audit; ack/resolve security alert | ✓ | ✓ | ✓ | `export_platform_audit_logs`, `acknowledge_security_alert`, `resolve_security_alert` |
| Tạo/sửa tenant, **đổi trạng thái tenant** (suspend…) | ✓ | ✓ | 403 | `create_tenant`, `update_tenant`, `update_tenant_status` |
| **Impersonate** tenant | ✓ | ✓ | 403 | `impersonate_tenant` |
| Ghi platform settings, feature flags | ✓ | ✓ | 403 | `put_setting`, `put_flag` |
| **Reboot** edge device (mọi tenant) | ✓ | ✓ | 403 | `reboot_edge_device` |
| API credentials: tạo, **rotate**, **revoke** | ✓ | ✓ | 403 | `create_credential`, `rotate_credential`, `revoke_credential` |
| **Refund top-up ví** (MoMo, toàn phần) | ✓ | ✓ | 403 | `refund_topup` |
| **Revoke phiên** bất kỳ (admin hoặc tenant user) | ✓ | 403 | ✓ | `revoke_any_session` |
| Tạo/sửa platform admin | ✓ | 403 | 403 | `create_admin`, `update_admin` (không tự vô hiệu hóa chính mình: 409) |
| **Reset MFA** của platform admin | ✓ | 403 | 403 | `reset_admin_mfa` |

**Impersonation:** `impersonate_tenant` phát token 15 phút (`ttl = 900`) đăng nhập với tư cách **một owner active** của tenant (query `.first()` không `ORDER BY`, nên khi có nhiều owner thì không xác định là owner nào) (`role=owner`, `mfa_verified=False`); tenant không có owner active → 409. Trong thời gian đó platform admin có toàn bộ quyền owner ở bảng tenant portal. Audit ghi `TENANT_IMPERSONATE`; các audit ghi trong phiên impersonate mang `impersonator_id` (`audit_service.write_audit` đọc `deps.impersonator_ctx`).

**Gating UI so với backend** (`frontend/src/lib/permissions.ts` sao chép các tuple trên):

- Có gating theo role: các trang tenant dùng `canTenantWrite` (Dashboard thao tác gate, Location, Vehicles, Rules, Edge devices, Parking map, Memberships gồm refund, Settings, AccessEventDrawer, BarrierMapVisualization) và `canManageTenantUsers`/`canExportTenantAudit`; platform dùng `canManagePlatformOps` (Settings, Feature flags, Credentials ở Security), `canManagePlatformAdmins` (Admins, reset MFA), `canRevokePlatformSessions`.
- **Không gating theo platform role (chỉ backend chặn):** nút Impersonate và đổi trạng thái tenant ở `TenantDetailPage.tsx`/`TenantsListPage.tsx`, `CreateTenantModal.tsx`, nút Reboot edge ở `MonitoringPage.tsx` (chỉ kiểm `userType === 'platform_admin'`). Role `support` vẫn thấy các nút này và nhận 403.
- Refund top-up (`/platform/payments/{id}/refund-topup`) **không có UI** trong cả hai app; chỉ gọi qua API.

## 3. Session, state và hợp đồng HTTP

### Dashboard: cookie + CSRF

REST client cố định `/api/v1`, gửi `credentials: 'include'`. Với `POST/PUT/PATCH/DELETE`, đọc cookie `vm_csrf` và gửi `X-CSRF-Token`. Không dùng token dashboard trong localStorage.

401 của request ngoài `/auth/*` kích hoạt một refresh promise dùng chung rồi thử lại một lần. Client unwrap `{data: ...}` nếu không có `meta`; giữ nguyên response phân trang `{data, meta}`. `ApiError` có `status`, `code`, `details`, `requestId`.

`PlatformProvider` gọi `/auth/me` khi mount, giữ userType/tenantId/tenantSlug/MFA state. `logout` gọi server và xóa trạng thái auth cục bộ. Khi refresh thất bại ở HTTP client, không có cơ chế phát event logout toàn cục giống mobile; không nên suy ra mọi 401 tự chuyển màn login.

Impersonation: POST `/platform/tenants/{id}/impersonate`, đọc lại `/auth/me`, hiển thị banner với `expiresIn`. Thoát bằng refresh session rồi `/auth/me`. Banner dùng số phút từ response, không phải đồng hồ countdown đáng tin cậy cho thời hạn server.

### Dashboard: MFA và step-up

MFA chỉ được thực thi **một lần, lúc đăng nhập**, và chỉ với tài khoản đã bật MFA (`auth_service`: `user.mfa_enabled` → token `mfa_pending`; `deps.get_auth_context` trả 401 `MFA verification required` cho token này trên mọi endpoint). Sau khi đăng nhập, quy tắc là:

- **Không có step-up phía server.** Claim `mfa` được đọc vào `AuthContext.mfa_verified` nhưng không dependency/router nào kiểm tra nó; không endpoint nào yêu cầu xác thực lại OTP trước thao tác nhạy cảm. Mọi thao tác ở mục 2.5 (refund, revoke, reboot, impersonate, reset MFA, decommission…) chỉ phụ thuộc role.
- Không có chính sách bắt buộc bật MFA theo role (kể cả `super_admin`); bật/tắt là lựa chọn của từng tài khoản.
- Thao tác MFA có xác thực server thật: enroll (`authApi.mfaEnable` với OTP đầu tiên), disable (`authApi.mfaDisable` cần **mật khẩu + OTP hiện tại**, server thu hồi mọi phiên), reset MFA của admin khác (`platformApi.resetAdminMfa`, chỉ `super_admin`; server xóa secret/backup codes, thu hồi phiên của admin đó, phát security alert `MFA_RESET`).
- Phiên impersonate luôn có `mfa_verified=False`; vì không có step-up nên điều này không giới hạn thao tác nào.
- Mode `challenge` của `MfaFlowModal`: **không có lời gọi nào mở mode này** (`openMfaModal` chỉ được gọi với `enroll`, `disable`, `reset_admin`). Nếu bị mở, `handleVerifyOtp` luôn hiển thị lỗi `Step-up verification is not available for active sessions.` và không bao giờ báo thành công; nó không gọi server và không mở khóa thao tác nào.

Việc có cần step-up cho thao tác nhạy cảm hay không là quyết định sản phẩm chưa có (mục 10).

Nguồn: [`MfaFlowModal.tsx`](../frontend/src/components/modals/MfaFlowModal.tsx), [`PlatformContext.tsx`](../frontend/src/context/PlatformContext.tsx) (`openMfaModal`), `backend/app/api/deps.py`, `backend/app/services/auth_service.py`, `backend/app/api/v1/platform.py` (`reset_admin_mfa`).

### Driver: bearer token

REST prefix lấy từ `VITE_API_BASE_URL`, mặc định `/api/v1`. `tokenStore` lưu `pv_driver_access`, `pv_driver_refresh`; `api()` gắn bearer token trừ khi `auth: false`. Register/login lưu token rồi gọi `/driver/auth/me`; logout gửi refresh token và luôn xóa local token trong `finally`.

Refresh POST `/driver/auth/refresh` dùng refresh token JSON. Các 401 đồng thời chia sẻ refresh promise; refresh lỗi xóa token và phát `pv:logout`. Client trả body trực tiếp, không áp dụng quy tắc unwrap `{data}` của dashboard; 204 trả `undefined`.

### State và độ đầy đủ dữ liệu

Không thấy Redux/TanStack Query trong dependency của hai app. Dashboard giữ collection tập trung bằng context; mobile phân chia hooks/local state. Theme dashboard lưu `theme`, language lưu `pv-language` (mặc định Anh). Mobile language lưu `vision_parking_lang` (mặc định Việt), guest lưu `pv_guest`, notification preferences `pv_notif_prefs`, recent searches `pv_recent_searches` (tối đa 5).

Loaders dashboard thường lấy 100/200 bản ghi; một số KPI/lọc/tính tần suất dựa trên cửa sổ này. Membership/payment page có phân trang API riêng 20 bản ghi. Import users context thực hiện các lời mời lần lượt; không đồng nhất với import CSV vehicles qua job. Một số loader dùng `.catch(() => [])`/default/null; lỗi quyền hoặc hạ tầng có thể trông giống dữ liệu rỗng.

Nguồn: hai HTTP client, hai auth/context module, [`useFavorites.ts`](../mobile/src/hooks/useFavorites.ts), [`recentSearches.ts`](../mobile/src/lib/recentSearches.ts).

## 4. API đang được frontend sử dụng

Các đường dẫn dưới đây đều có prefix REST `/api/v1` mặc định; đây là nhóm hợp đồng client, không phải bản liệt kê toàn bộ API backend.

### Quản trị

- `authApi`: `/auth/login`, `/auth/me`, `/auth/logout`, `/auth/refresh`, `/auth/mfa/*`, `/auth/activate`, `/auth/password/*`, `/auth/sessions`.
- `publicApi`: `/plans`, `/tenants/check-code`, `/register`, `/public/tenants/{slug}/parking/map` và `/parking/locate?plate=...`; có helper `/legal/{doc}` nhưng trang pháp lý hiện tĩnh.
- `platformApi`: `/platform/tenants`, `/admins`, `/sessions`, `/settings`, `/feature-flags`, `/infra/health`, `/security/alerts`, `/security/login-events`, `/credentials`, `/metrics/*`, `/monitoring/telemetry-snapshot`, `/edge-devices/{id}/reboot`, `/audit-logs`, `/jobs` (các suffix này ở dưới `/platform`).
- `tenantApi`: mọi tài nguyên dưới `/tenants/{tenantId}` gồm sites/lanes/gates/commands/devices/cameras/parking levels/zones/map/presence/locate/check-in/out/vehicles/rules/users/access-events/incidents/audit/jobs/settings/dashboard/membership-plans/memberships/payments.

Lệnh gate gọi `sendCommand(..., command, requestId)` với UUID; `RESET` ở UI được đổi thành `reboot`. Lệnh gửi thành công chỉ là đã nhận/queue request, cần ACK và thực tế thiết bị để kết luận.

### Tài xế

- Public: `GET /public/sites` với `lat`, `lng`, `radiusKm`, `q`; `GET /public/sites/{id}`, `/plans`; `GET /public/tenants/{slug}/parking/locate?plate=...`.
- Auth/profile: `/driver/auth/register|login|refresh|logout|me|password|sessions`.
- Xe: `GET/POST /driver/vehicles`, `PATCH/DELETE /driver/vehicles/{id}`.
- Favorite: `GET /driver/favorites`, `PUT/DELETE /driver/favorites/{siteId}`.
- Phiên: `GET /driver/sessions/active`, `/driver/sessions/history?page=...&limit=...`.
- Hội viên: `GET/POST /driver/memberships`, `POST /driver/memberships/{id}/cancel`.
- Thanh toán: `GET/POST /driver/payments`, `GET /driver/payments/{id}`, `POST /driver/payments/{id}/cancel`; `GET /driver/wallet`.

Nguồn đầy đủ: [`frontend API module`](../frontend/src/services/api/index.ts), [`driver API`](../mobile/src/api/driver.ts), [`public API`](../mobile/src/api/public.ts).

## 5. Realtime và cập nhật dữ liệu

### Dashboard

Khi đăng nhập và có active tenant, mở socket cùng origin `/ws/tenants/{tenantId}/barrier-telemetry`. Context xử lý telemetry, heartbeat, ACK, access-event và `vehicle_location` để cập nhật live frames/presences/zone occupancy. Không phải mọi frame đều dẫn tới reload toàn bộ dữ liệu.

Đóng socket: thử lại tối đa 5 lần với delay tăng tuyến tính 3, 6, 9, 12, 15 giây. Biến retry không reset sau một kết nối thành công; đây không phải reconnect vô hạn. Không có polling toàn bộ context định kỳ khi WS mất kết nối.

Command ACK có poll REST 1,5 giây/lượt, tối đa 10 lượt; lỗi request dừng poll. Mất socket không nhất thiết mất khả năng gửi command nhưng quan sát trạng thái có thể chậm/cũ. Nginx và Vite dashboard đã cấu hình proxy `/ws`.

### Driver

- Sites/capacity: poll **15 giây**, debounce search **300 ms**; request bán kính **50 km**, rồi filter client theo lựa chọn UI. Không có capacity socket riêng trong source.
- Active parking: tải ngay và poll **20 giây**, lấy phiên `PARKED` đầu tiên; lỗi tạm thời giữ phiên cũ.
- `/ws/driver/sessions?token=<access-token>`: nhận frame `type: 'session_event'`, refetch REST; retry sau **8 giây** khi đóng socket.
- History: tải khi mount, load-more và hint WS; **không có interval polling**. Khi hint thất lạc và màn vẫn mở, không có bảo đảm lịch sử cập nhật tự động theo chu kỳ.
- Payment: poll riêng 4 giây sau tạo payment (xem phần 6), không phải session WS.

`driverSessionsWsUrl()` lấy host từ REST base URL, chọn `ws/wss` theo protocol trang. Với base mặc định, host là Vite. **`mobile/vite.config.ts` chỉ proxy `/api`, không proxy `/ws`**, nên mặc định dev không có WS đi xuyên tới backend. Có thể dùng reverse proxy chung hỗ trợ WS hoặc base URL tuyệt đối với CORS/WS origin/TLS phù hợp. Nếu chỉ đổi proxy target REST, URL socket không tự đổi tới host đó.

Nguồn: [`PlatformContext.tsx`](../frontend/src/context/PlatformContext.tsx), [`useSites.ts`](../mobile/src/hooks/useSites.ts), [`useActiveSession.ts`](../mobile/src/hooks/useActiveSession.ts), [`useParkingHistory.ts`](../mobile/src/hooks/useParkingHistory.ts), [`useSessionHints.ts`](../mobile/src/hooks/useSessionHints.ts), [`mobile/lib/api.ts`](../mobile/src/lib/api.ts).

## 6. Hội viên, phí, thanh toán và ví

### Hội viên xuyên hai app

1. Tenant tạo/sửa gói theo site trong Memberships → Plans, gồm giá, số ngày, perks và trạng thái.
2. Driver xem gói public tại chi tiết site; chọn một xe đã đăng ký rồi gửi `planId` + `vehicleId` tới `/driver/memberships`.
3. UI hiển thị trạng thái backend (`pending`, `active`, `rejected`, `cancelled`, `expired`, `revoked`), cho hủy/thanh toán khi phù hợp.
4. Tenant activate/reject/revoke qua API (role ghi, mục 2.5), hoặc membership tự kích hoạt khi payment `paid`. UI không tự cấp quyền ANPR chỉ vì người lái đã gửi yêu cầu. Kích hoạt tạo/bật dòng whitelist `registered_vehicles` tag `member`; revoke/cancel/expire chuyển dòng đó sang `suspended`; edge nhận thay đổi qua REST sync (eventual). Chi tiết ở "Hệ quả nghiệp vụ theo trạng thái payment".

### Phí và tạo giao dịch

Driver session mapper lấy `feeVnd` thành `currentFeeVnd`; UI không tự tính hóa đơn từ đồng hồ đếm thời gian. Null được hiển thị `—`; lịch sử thể hiện phí ước tính. Form payment không gửi số tiền tự tính cho session/membership, chỉ gửi ID tham chiếu; top-up có `amountVnd`.

`PaymentEWalletModal` từ Profile lấy memberships, active sessions và **trang đầu 20 phiên lịch sử** để tạo danh sách cần trả; lấy payments + wallet. Không phải sổ công nợ đầy đủ tất cả lịch sử.

**Phương thức thanh toán (`method`):**

- Backend chỉ chấp nhận `momo` hoặc `wallet`; **thiếu `method` thì mặc định là `momo`** (`PaymentCreateIn.method: Literal["momo", "wallet"] = "momo"` trong `backend/app/schemas/driver.py`; `payment_service.create_payment(method="momo")`). Backend không bao giờ tự chọn ví.
- Nút "Thanh toán để kích hoạt" ở tab Memberships (`App.tsx` → `onPay` của `MembershipsScreen`) gửi `{kind: 'membership', membershipId}` không kèm `method`, nên **luôn là MoMo**. Tab không hiển thị phương thức, không có bước xác nhận và không cho chọn ví. Muốn trả bằng ví, người lái phải dùng nút ví trong payment sheet ở Profile.
- Trong payment sheet, nút số tiền (MoMo) cũng không gửi `method` (→ `momo`); nút ví gửi `method: 'wallet'` tường minh. Top-up luôn là `momo`; `method: wallet` cho top-up bị 400.
- Với `momo`: nếu deployment không có gateway (`PAYMENT_PROVIDER=none`), backend trả 503 `payments_not_configured` và không tạo payment. Payment sheet hiển thị panel "chưa bật thanh toán"; tab Memberships chỉ hiện `Error.message`. Nếu có gateway, backend tạo payment `created` với `payUrl`, hết hạn sau `payment_ttl_minutes` (mặc định 30); không trừ tiền ví.
- Với `wallet`: trừ ví và đánh dấu `paid` trong **một transaction**; thiếu số dư thì rollback, không tạo payment.

Việc nút ở tab Memberships có phải cho chọn/xác nhận phương thức hay không là quyết định sản phẩm chưa có (mục 10).

`usePayments.payAndWatch()`:

1. `POST /driver/payments` với `kind: membership/session/topup`.
2. Nếu có `payUrl`, mở tab nhà cung cấp (`window.open`). Popup có thể bị browser chặn; mở tab không phải bằng chứng trả thành công.
3. Nếu `status === created`, poll `GET /driver/payments/{id}` mỗi 4 giây. Khi response thành công có trạng thái khác `created` hoặc đã vượt 120 giây, dừng poll, tải lại list/wallet và gọi callback.
4. Response có trạng thái cuối ngay (ví dụ wallet settlement) sẽ refetch và gọi callback mà không mở polling.
5. Cancel gọi API cancel rồi refetch.

**Giới hạn:** nhánh lỗi poll không kiểm tra deadline, nên 120 giây không phải hard timeout khi mạng liên tục lỗi. Một instance hook chỉ giữ một poll timer, tạo lượt theo dõi mới sẽ thay timer cũ. State hook không là tiến trình reconciliation bền vững sau reload. Không có bằng chứng E2E thanh toán trong các unit test hiện tại.

Payment sheet bắt riêng mã `payments_not_configured` và chuyển sang thông báo chưa bật thanh toán/đề nghị trả tại bãi. Tab Memberships chỉ bắt lỗi và hiển thị `Error.message`, không có cùng panel fallback. Không có nhánh giả lập giao dịch paid. Credentials/secret/cấu hình provider phải ở backend, không đưa vào `VITE_*`.

### Ví và refund

Wallet API trả balance và ledger; sheet có top-up, trả session/membership bằng `method: wallet` và hiển thị một phần giao dịch gần nhất. UI kiểm tra đủ số dư để bật nút, nhưng kiểm tra nguyên tử số dư/hoàn tiền thuộc backend. Khi dữ liệu ví chưa có, UI có thể hiển thị 0, không nên xem đó là số dư đã đối soát.

Tenant Payments cho xem trạng thái `created/paid/failed/cancelled/expired/refunded` và `POST /tenants/{tenantId}/payments/{id}/refund`, rồi refetch. Nút refund chỉ hiện cho role ghi (`canTenantWrite`) với payment `paid` không phải top-up; hộp xác nhận ghi rõ nơi hoàn tiền theo `method`.

### Hệ quả nghiệp vụ theo trạng thái payment (backend)

Quy tắc dưới đây đọc từ `backend/app/services/payment_service.py`, `membership_service.py` và `event_service.py`. Đây là hành vi source; chưa có bằng chứng E2E với gateway thật.

**Vòng đời payment:** `created` → `paid` | `failed` | `cancelled` | `expired`; `paid` → `refunded`. Trạng thái cuối không bị IPN/refresh ghi đè lại (`_TERMINAL`).

| Sự kiện | Payment | Membership (`kind=membership`) | Ví | Ra vào |
|---|---|---|---|---|
| Trả `wallet` thành công | `paid` ngay | Tự kích hoạt nếu đang `pending` (như dòng `paid` bên dưới) | Trừ `spend_debit` | Như dòng `paid` |
| MoMo IPN thành công hoặc pull-refresh báo `paid` (`handle_momo_ipn`, `_refresh_from_gateway`) | `paid` | `_apply_paid` → `_activate_membership_row`: `active`, `ends_at = now + duration_days` (thiếu plan: 30 ngày), tạo/kích hoạt `registered_vehicles` tag `member` với `valid_to = ends_at`; membership active khác trên cùng xe bị `revoked` | Top-up: cộng `topup_credit` | Membership: whitelist mới tới edge qua REST sync (eventual, xem `docs/edge-client.md`) |
| `paid` nhưng không kích hoạt được (membership không còn tồn tại, không còn `pending`, hoặc biển số bị blacklist) | **Giữ `paid`**, ghi `raw_payload.activation_error` | Giữ nguyên trạng thái (thường `pending`), `admin_note = "payment received; activation failed: …"` | Không đổi | Không cấp quyền. **Không tự hoàn tiền**; operator phải activate tay hoặc refund |
| MoMo từ chối lúc tạo order | `failed` (API trả 409) | Giữ `pending`, được tạo payment mới | Không đổi | Không |
| IPN thất bại / query báo `failed` | `failed` | Giữ `pending`, được tạo payment mới | Không đổi | Không |
| Driver hủy (chỉ khi `created`) | `cancelled` | Giữ `pending` | Không đổi | Không |
| Quá `payment_ttl_minutes` (30) khi còn `created` | `expired` (quét lười khi đọc/ghi) | Giữ `pending` | Không đổi | Không |
| Tenant refund (`refund_payment`, chỉ khi `paid`, không phải top-up) | `refunded`, `refunded_at` | `active` → `revoked` + whitelist `suspended`; `pending` → `rejected`; trạng thái khác giữ nguyên; luôn nối note `refunded by operator` | `method=wallet`: **hoàn về ví** (`refund_credit`), không về MoMo. `method=momo`: gọi gateway `/refund` **toàn phần** | Session: grant thoát chưa dùng hết hiệu lực (không còn `status='paid'`) |
| Platform refund top-up (`platform_refund_topup`, `super_admin`/`ops`) | `refunded` | — | Chỉ khi top-up MoMo và số dư ví ≥ số tiền top-up; trừ `refund_debit` toàn phần, gọi gateway `/refund`. Đã tiêu một phần → 409 | — |

**Quy tắc refund:**

- Chỉ hoàn **toàn phần** `amount_vnd`; không có refund một phần. Chỉ payment `paid` (khác → 409 `Payment is …, not paid`).
- Tenant không refund top-up (409); top-up chỉ platform refund.
- MoMo payment thiếu `provider_trans_id` (ví dụ được đánh dấu paid qua pull-refresh) → 409 `refund via the MoMo console`; payment **vẫn `paid`** trong hệ thống, không có API đánh dấu đã hoàn ngoài hệ thống.
- Gateway từ chối refund → 409, payment giữ `paid`. Thiếu gateway → 503.
- Refund chạy dưới khóa dòng; refund đồng thời lần hai nhận 409.

**Không tự sinh hoàn tiền trong các trường hợp sau** (payment giữ `paid`): tenant revoke/reject membership, driver hủy membership `active`, membership hết hạn, membership `pending` bị tự hủy sau 7 ngày (`membership_service._expire_stale`, áp cả khi đã trả nhưng kích hoạt thất bại), tenant activate tay một membership đã có payment `paid` bị gắn cờ. Ngược lại, tenant activate tay một membership có gói trả phí **không cần payment** (`activate_membership` không kiểm tra payment); sau đó driver tạo payment sẽ nhận 409 `Membership is active, not pending`.

**Session payment và ra cổng:** khi một payment `kind=session` `paid`, `event_service.decide_access` đổi quyết định **deny chiều exit** thành `allow` (`reason: paid_exit`) **một lần** cho đúng biển số + site trong `paid_exit_grace_minutes` (mặc định 15, tenant setting ghi đè), không áp cho blacklist và rule deny vẫn thắng. Đây là quyết định **backend ghi cho access event** nhận qua telemetry. Edge quyết định mở cổng cục bộ từ SQLite (`edge-client/src-tauri/src/access.rs::decide_access`) và trong source edge không có đầu vào payment/`paid_exit`; `payment_service` cũng không phát lệnh mở cổng khi `paid`. Vì vậy source không chứng minh payment `paid` tự mở barrier; với trường hợp edge mất mạng, tài liệu backend đã ghi lối thoát duy nhất là lệnh `manual_open` của nhân viên (GAP-PAY-002, `docs/backend.md`). Xem mục 10.

Nguồn: [`TenantMembershipsPage.tsx`](../frontend/src/pages/tenant/TenantMembershipsPage.tsx), [`TenantDetailModal.tsx`](../mobile/src/components/discover/TenantDetailModal.tsx), [`PaymentEWalletModal.tsx`](../mobile/src/components/profile/PaymentEWalletModal.tsx), [`MembershipsScreen.tsx`](../mobile/src/components/views/MembershipsScreen.tsx), [`usePayments.ts`](../mobile/src/hooks/usePayments.ts), [`driver.ts`](../mobile/src/api/driver.ts); backend `schemas/driver.py` (`PaymentCreateIn`), `services/payment_service.py` (`create_payment`, `_apply_paid`, `_flag_activation_failure`, `handle_momo_ipn`, `refund_payment`, `platform_refund_topup`), `services/membership_service.py` (`_activate_membership_row`, `_expire_stale`, `revoke_membership`, `cancel_membership`), `services/event_service.py` (`_paid_exit`, `decide_access`).

## 7. Phần demo, stub và nội dung không nên diễn giải quá mức

### Dashboard

- **Landing simulator:** kịch bản biển số, confidence/latency, logic VIP/block và animation barrier là demo phía trình duyệt, không gọi OCR/relay. Pricing lấy `/plans` nhưng fallback marketing khi lỗi; các cam kết marketing/pháp lý không tự chứng minh tính năng vận hành.
- **MFA:** login MFA/resume/resend, setup/enroll/disable/reset-admin có API. Mode `challenge` trong `MfaFlowModal` không được màn nào mở, không gọi server và luôn trả lỗi "not available"; nó không phải cổng bảo mật và không có thao tác nào phụ thuộc nó. Backend không có step-up (mục 3, MFA và step-up).
- **Heuristic anomaly:** detector dùng Z-score/EWMA và baseline chung cố định, không phải mô hình ML đã huấn luyện từng bãi. “Mitigate” cập nhật detector/UI và append audit cục bộ; không chứng minh edge rate-limit/CCTV đã được bật.
- **Mock data filenames:** `data/mockData.ts` chứa defaults settings, `tenantMockData.ts` chứa location rỗng. `barrierMockData.ts` cung cấp outline Việt Nam cho bản đồ. Phải đọc cách dùng, không kết luận toàn bộ dashboard là mock vì tên tệp.
- **Bản đồ barrier:** phép chiếu tọa độ xấp xỉ; site thiếu GPS có vị trí rải xác định để vẽ, không phải tọa độ địa lý được đo.
- **Audit UI:** `pushAuditLog` append vào state, không ghi audit server. Không lấy dòng đó làm bằng chứng backend đã chấp nhận thao tác.
- **Simulate Event ở dev:** gọi API tạo access event thật với `source: manual`, `reason: Manual simulation entry`. Không phải thao tác chỉ thay đổi UI; chỉ nút trên dashboard được bọc `import.meta.env.DEV`.
- **Health/stream:** registry camera không đồng nghĩa live video stream. Một số badge normal/online và defaults/fallback không đủ chứng minh end-to-end health; đối chiếu response và telemetry thực tế.

Nguồn: [`LandingPage.tsx`](../frontend/src/pages/public/LandingPage.tsx), [`MfaFlowModal.tsx`](../frontend/src/components/modals/MfaFlowModal.tsx), [`anomalyDetectionService.ts`](../frontend/src/services/anomalyDetectionService.ts), [`BarrierMapVisualization.tsx`](../frontend/src/components/monitoring/BarrierMapVisualization.tsx), [`barrierMapData.ts`](../frontend/src/services/barrierMapData.ts), [`TenantDashboardPage.tsx`](../frontend/src/pages/tenant/TenantDashboardPage.tsx).

### Driver

- Notification preferences chỉ lưu trên thiết bị; chưa có push delivery. Nút chuông Discover được truyền callback rỗng.
- Biometric, driver 2FA, privacy preferences, export/delete dữ liệu còn “coming soon”; đổi mật khẩu và quản lý auth sessions có API thật.
- Reviews chưa có backend/UI đánh giá thực; tab hiển thị empty state, rating không được tự thêm trong mapper.
- GPS mặc định ở Quận 7, TP.HCM. Browser geolocation là thật nếu được cho phép, nhưng danh sách chọn vị trí thủ công là tọa độ có sẵn, không geocoding. Chuỗi địa chỉ/thành phố sau GPS không phải reverse-geocoding.
- `openNow` dùng giờ local của thiết bị với `open/close`, hỗ trợ qua đêm; thiếu giờ coi là mở. Không phải lịch bãi đầy đủ theo timezone/ngày lễ.
- Bộ lọc có state `vehicleType` nhưng pipeline lọc danh sách trong App chưa dùng trường này. “recommended” thực tế sắp theo khoảng cách; “rating” không có ý nghĩa nếu API mapper không cung cấp rating.
- Bản đồ dùng tiles OpenStreetMap, directions mở Google Maps; có phụ thuộc dịch vụ ngoài và yêu cầu mạng/attribution/tile usage. Ảnh lấy từ URL được API cung cấp, không đảm bảo có luồng camera trực tiếp.
- `useSites` giữ error riêng nhưng App chủ yếu dùng sites/loading; một số lỗi loader được nuốt. Dữ liệu cũ/empty state không phải chứng nhận backend bình thường.

Nguồn: [`NotificationSettingsModal.tsx`](../mobile/src/components/profile/NotificationSettingsModal.tsx), [`SecurityPrivacyModal.tsx`](../mobile/src/components/profile/SecurityPrivacyModal.tsx), [`ParkingMap.tsx`](../mobile/src/components/discover/ParkingMap.tsx), [`public.ts`](../mobile/src/api/public.ts), [`App.tsx`](../mobile/src/App.tsx), [`location.ts`](../mobile/src/lib/location.ts).

## 8. Kiểm thử và checklist vận hành

### Lệnh thực tế

Cả hai `package.json` có:

```sh
npm ci
npm run dev       # vite --port=3000 --host=0.0.0.0
npm run lint      # tsc --noEmit, không phải ESLint
npm run build     # vite build, không tự chạy lint/test
npm run preview   # xem thử dist, không phải production gateway
npm run clean     # rm -rf dist server.js, cần shell hỗ trợ rm
```

Mobile có `npm test` → `vitest run`; frontend cũng có `npm test` (vitest). Baseline đã biết: `src/lib/__tests__/theme.test.ts` hiện fail 6 test trên Windows (`The URL must be of scheme file`). Hai app cùng cổng mặc định, nên chạy mobile với `npm run dev -- --port 3001` nếu dashboard dùng 3000. Vite có thể tự tăng cổng khi cổng bận; đọc log thay vì mặc định URL luôn đúng.

### Kết quả xác minh của đợt tài liệu này

- `frontend`: đã chạy `npm run lint`, đạt.
- `mobile`: đã chạy `npm run lint`, đạt; `npm test`, **2 tệp / 8 test đạt**.
- Test mobile chạy jsdom; 4 test HTTP client kiểm bearer/error/concurrent refresh/logout và 4 test `mapSite` kiểm mapping/membership/missing fields/24-7.
- Test mock fetch, không có bằng chứng phủ UI, live backend, WS hoặc gateway. Không suy ra coverage 80% hay E2E đã đạt.
- Chưa chạy `npm run build`, Docker build/run, browser/E2E, thanh toán thật hoặc thao tác relay. Không build trong lượt tài liệu để tránh sinh lại `dist` ngoài phạm vi ghi được giao.

Nguồn: [`frontend/package.json`](../frontend/package.json), [`mobile/package.json`](../mobile/package.json), [`vitest.config.ts`](../mobile/vitest.config.ts), [`api.test.ts`](../mobile/src/lib/__tests__/api.test.ts), [`mapSite.test.ts`](../mobile/src/api/__tests__/mapSite.test.ts).

### Checklist smoke test đề xuất, chưa chạy

1. Xác nhận backend, seed/account và role đúng; đăng nhập dashboard/driver bằng tài khoản tương ứng, không dùng dữ liệu điền sẵn form như credential hợp lệ.
2. Kiểm tra cookie/CSRF dashboard, refresh/logout; với driver kiểm bearer/refresh/revoke và guest không truy cập màn riêng tư.
3. Dùng hai tenant kiểm cross-tenant authorization trên server; kiểm role thao tác nhạy cảm. Không dựa vào việc ẩn tab/nút.
4. Tạo/cập nhật site/public profile/GPS/giá, xác nhận driver tìm được site; thiếu GPS không được tạo marker giả.
5. Mở Network xem REST và WS Upgrade thành công; kiểm driver WS không bị dừng ở Vite do thiếu proxy. Mất WS phải quan sát được sự khác biệt giữa active-session polling và lịch sử không polling.
6. Với thiết bị thử nghiệm/cổng an toàn: gửi command, đối chiếu request ID/ACK/telemetry và barrier thật; không coi toast “sent” là ACK.
7. Dùng sandbox gateway: membership request → payment → đối soát server → trạng thái; kiểm cancel/failed/expired/refund và ví thiếu số dư. Không thanh toán thật chỉ để kiểm tài liệu.
8. Reload tab/đóng tab payment/mất mạng; xác nhận người vận hành hiểu dữ liệu có thể cũ và hạn chế timeout polling.
9. Kiểm deep links activation/reset/find-my-car trên static host với SPA fallback, HTTPS và chính sách cookie/origin.
10. Test browser mobile: GPS permission/HTTPS, popup provider, tiles bản đồ, khả năng cuộn/modal, Việt/Anh; kiểm dữ liệu nhạy cảm đã được che trong logs/screenshots.

## 9. Proxy, env, build và deploy

### Các biến không được dùng lẫn

- Dashboard dev: **`VITE_API_PROXY_TARGET`**, mặc định `http://localhost:8000`, proxy `/api` và `/ws`.
- Driver dev: **`VITE_API_PROXY`**, cùng default, chỉ proxy `/api`.
- Driver client: **`VITE_API_BASE_URL`**, mặc định `/api/v1`, là cấu hình build/dev client. Dashboard client không đọc biến này.
- Cả hai Vite config: **`DISABLE_HMR`** đọc qua `process.env`.
- Nginx image dashboard: **`API_UPSTREAM`**, runtime default `http://api:8000`.

Hai `vite.config.ts` đọc proxy/HMR trực tiếp từ `process.env` và không gọi `loadEnv`. Truyền biến proxy bằng môi trường tiến trình là cách chắc chắn; không chỉ dẫn copy `.env.example` vì tệp đó không có trong hai thư mục đã quét. `VITE_API_BASE_URL` qua `import.meta.env` vẫn là biến client thông thường, có thể khai báo `.env.local` và cần build lại cho production.

Ví dụ `sh` (chạy trong từng app):

```sh
# frontend/
VITE_API_PROXY_TARGET=http://localhost:8000 npm run dev
# mobile/
VITE_API_PROXY=http://localhost:8000 npm run dev -- --port 3001
```

Với PowerShell, dùng `$env:VITE_API_PROXY_TARGET = 'http://localhost:8000'` hoặc `$env:VITE_API_PROXY = 'http://localhost:8000'` rồi chạy npm. Với base URL tuyệt đối tới host khác, kiểm CORS cho REST và origin/auth cho WS; URL WS chọn protocol theo trang nên HTTPS cần endpoint WSS thích hợp.

### Dashboard Docker

[`frontend/Dockerfile`](../frontend/Dockerfile): Node 20 Alpine → `npm ci` → `npm run lint && npm run build`; runtime Nginx 1.27 Alpine, port 80. Template nhận `API_UPSTREAM` lúc khởi động.

Từ repository root:

```sh
docker build -t parkvision-frontend frontend/
```

Chạy container trên mạng có service `api` để dùng default upstream, hoặc truyền một URL mà container truy cập được. Trên Docker Desktop, ví dụ khi backend đã publish host port 8000:

```sh
docker run --rm -p 8080:80 -e API_UPSTREAM=http://host.docker.internal:8000 parkvision-frontend
```

Không mặc định `localhost` bên trong container là host. `nginx.conf.template` giữ `/api` path, hỗ trợ upgrade `/ws` và fallback `index.html`; comment nhắc React Router trong template là comment cũ, app thực tế state-based. TLS/cookie policy/domain cần cấu hình ở ingress/reverse proxy môi trường triển khai.

### Driver static deploy

`npm run build` sinh `mobile/dist/`. Không có Dockerfile riêng; dùng static hosting/reverse proxy tùy hạ tầng. Phải cấu hình proxy REST và WS production riêng; Vite dev proxy không được đưa vào output build. Nếu dùng relative base mặc định, host phục vụ trang phải định tuyến `/api` và `/ws/driver/sessions`. Nếu dùng absolute base, cấu hình lúc build và kiểm domain/TLS/CORS; không kỳ vọng env runtime của static server tự thay bundle.

Không đặt API keys, gateway secrets hay relay credentials trong frontend environment. Driver bearer token có thể nằm trong query WS, biển số có trong lookup URL; cần che query/logs, giới hạn chia sẻ dữ liệu và dùng HTTPS. Các hướng dẫn ở đây không sửa backend Compose hay bảo đảm sẵn cấu hình production cho hệ thống.

## 10. Quyết định sản phẩm còn mở

> **Đã chốt và triển khai (2026-11-18, nhánh `fix/qa-criticals`).** Phần "Hiện tại" ở từng mục là ghi chép trước quyết định.
>
> | # | Quyết định | Triển khai |
> |---|---|---|
> | 1 | (a) không có step-up | Bỏ mode `challenge` khỏi `MfaFlowModal` |
> | 2 | (b) bắt buộc MFA cho mọi platform admin | `PLATFORM_ADMIN_MFA_REQUIRED` (mặc định: bật ngoài `ENVIRONMENT=development`); 403 `mfa_enrollment_required` (WS đóng 4403); dashboard mở luồng đăng ký MFA |
> | 3 | (b) ẩn nút cho `support` | `canManagePlatformOps` cho Impersonate, đổi trạng thái/tạo tenant, Reboot |
> | 4 | (b) refund chỉ owner/admin | Endpoint refund dùng `ADMIN_ROLES`; revoke membership giữ `WRITE_ROLES` |
> | 5 | (a) giữ, nhưng impersonate chọn owner active cũ nhất (`created_at`, `id`) | `platform.impersonate_tenant` |
> | 6 | (b) chọn phương thức trước khi trả | Mobile `PaymentMethodSheet` (MoMo/Ví, hiện số dư, MoMo tắt khi 503); luôn gửi `method`. Backend vẫn mặc định `momo` để tương thích |
> | 7 | xem `backend.md` §17 mục 1 | |
> | 8 | (a) giữ: refund là thao tác riêng, toàn phần | — |
> | 9 | (c) cho phép nhưng bắt buộc lý do | 422 `activation_reason_required` khi gói có phí và chưa có payment `paid`; lý do vào `admin_note` + audit |
> | 10 | (b) "Đánh dấu đã hoàn ngoài hệ thống" | `POST /tenants/{id}/payments/{pid}/mark-refunded-externally` `{note}` (owner/admin, audit `payment.refunded_externally`); áp cho payment `paid` (kèm side effect như refund) hoặc payment chưa `paid` có `late_ipn`/`amount_mismatch` (không side effect) |
> | 11 | xem `backend.md` §17 mục 3 | |

Các mục dưới đây mô tả hành vi **hiện tại** của source và các phương án cụ thể; chưa có quyết định BA/PO nên không nên coi hành vi hiện tại là yêu cầu đã được duyệt.

1. **[Đã quyết – xem bảng] Step-up MFA cho thao tác nhạy cảm** (GAP-WEB-002). Hiện tại: không có step-up; chỉ role quyết định (mục 3). Phương án: (a) chấp nhận hiện trạng, xóa mode `challenge` khỏi `MfaFlowModal`; (b) thêm endpoint step-up server (OTP trong N phút) và bắt buộc cho tập thao tác chọn lọc (refund, impersonate, reset MFA, revoke credential, decommission/reboot); (c) chỉ bắt buộc phiên đăng nhập có `mfa_verified=True` cho các thao tác đó, không hỏi lại OTP.
2. **[Đã quyết – xem bảng] Bắt buộc bật MFA theo role** (GAP-WEB-002). Hiện tại: tùy từng tài khoản, kể cả `super_admin`. Phương án: (a) giữ tùy chọn; (b) bắt buộc với mọi platform admin; (c) bắt buộc với platform admin và tenant `owner`/`admin`.
3. **[Đã quyết – xem bảng] Gating UI cho các nút platform chỉ có backend chặn** (GAP-WEB-001). Hiện tại: `support` thấy Impersonate, đổi trạng thái tenant, tạo tenant, Reboot edge và nhận 403. Phương án: (a) giữ, coi 403 là đủ; (b) ẩn/disable bằng `canManagePlatformOps` như các trang Settings/Flags.
4. **[Đã quyết – xem bảng] `operator` có được refund và revoke membership không** (GAP-WEB-001). Hiện tại: có, vì refund/revoke dùng `WRITE_ROLES` như mọi thao tác ghi vận hành. Phương án: (a) giữ; (b) chuyển refund (và tùy chọn revoke membership, decommission/xóa device, thu hồi token) sang `ADMIN_ROLES`.
5. **[Đã quyết – xem bảng] Platform admin ghi vào tenant mà không impersonate** (GAP-WEB-001). Hiện tại: chỉ đọc; ghi trả 403 `Tenant user required`; impersonate cho toàn quyền owner 15 phút và chọn owner không xác định khi có nhiều owner. Phương án: (a) giữ; (b) giới hạn quyền trong phiên impersonate (ví dụ read-only hoặc loại trừ refund/users); (c) cho platform `ops` ghi trực tiếp với audit riêng.
6. **[Đã quyết – xem bảng] Phương thức mặc định ở nút trả tab Memberships** (GAP-WEB-004). Hiện tại: không gửi `method` → backend `momo`, không hiển thị, không xác nhận; deployment không có gateway thì báo lỗi dù ví đủ tiền. Phương án: (a) giữ MoMo nhưng ghi rõ "Thanh toán qua MoMo" trên nút; (b) mở payment sheet/bộ chọn MoMo/ví trước khi tạo payment; (c) tự chọn ví khi đủ số dư, kèm bước xác nhận. Kèm theo: có bắt buộc client gửi `method` tường minh (bỏ default ở `PaymentCreateIn`) hay không.
7. **[Đã quyết – xem bảng] Paid nhưng không kích hoạt được membership** (GAP-WEB-003). Hiện tại: payment giữ `paid`, membership giữ trạng thái cũ và được gắn note; không tự hoàn tiền; membership `pending` vẫn bị tự hủy sau 7 ngày mà payment vẫn `paid`; UI tenant không có hàng đợi riêng cho các ca này (chỉ thấy qua `admin_note`). Phương án: (a) giữ xử lý tay; (b) tự refund ngay; (c) tự refund sau thời hạn nếu operator không xử lý; kèm quyết định có loại trừ membership đã trả tiền khỏi auto-cancel 7 ngày.
8. **[Đã quyết – xem bảng] Hoàn tiền khi membership kết thúc sớm** (GAP-WEB-003). Hiện tại: revoke/reject của tenant, driver tự hủy membership `active` đều không hoàn tiền; chỉ refund tường minh mới hoàn (toàn phần). Phương án: (a) giữ, refund là thao tác riêng; (b) hoàn tỷ lệ theo số ngày còn lại (cần thêm refund một phần); (c) tự refund toàn phần khi tenant revoke/reject trong một khoảng thời gian.
9. **[Đã quyết – xem bảng] Activate tay membership có gói trả phí khi chưa trả tiền** (GAP-WEB-003). Hiện tại: được phép, không cần payment. Phương án: (a) giữ (thu tiền ngoài hệ thống); (b) chặn activate khi `price_vnd > 0` và chưa có payment `paid`; (c) cho phép nhưng bắt buộc ghi lý do.
10. **[Đã quyết – xem bảng] Nơi nhận tiền hoàn** (GAP-WEB-003). Hiện tại: payment `wallet` hoàn về ví, payment `momo` hoàn về MoMo; MoMo thiếu `provider_trans_id` phải hoàn tay trên console và payment vẫn `paid` trong hệ thống. Phương án: (a) giữ; (b) thêm thao tác "đánh dấu đã hoàn ngoài hệ thống" có audit; (c) cho phép hoàn MoMo về ví khi gateway không hoàn được.
11. **[Đã quyết – xem bảng] Session payment `paid` có tự mở barrier không** (GAP-WEB-003, liên quan GAP-PAY-002). Hiện tại: backend chỉ đổi quyết định của access event ghi nhận (`paid_exit`, 1 lần, 15 phút); edge không có đầu vào payment và không có lệnh mở cổng tự động khi `paid`. Phương án: (a) giữ, nhân viên mở tay; (b) backend phát lệnh mở cổng khi `paid` và xe đang ở làn ra; (c) đồng bộ grant `paid_exit` xuống SQLite edge để quyết định cục bộ, kể cả khi offline.
