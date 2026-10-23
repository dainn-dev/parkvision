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

App không sử dụng React Router; điều hướng bằng `publicView`, `primaryTab`, `platformSubTab`, `tenantNavTab` và các state khác. Browser Back/Forward và reload không phục hồi đầy đủ màn/tab hiện tại.

Khi khởi tạo, chỉ ba pathname đặc biệt được ánh xạ:

- `/activate?token=...`: form đặt mật khẩu kích hoạt lời mời.
- `/reset-password?token=...`: đặt lại mật khẩu bằng token.
- `/find-my-car?tenant=<slug>&plate=<bien-so>`: tra vị trí xe; `tenant` bắt buộc, `plate` tùy chọn để auto-search, tối thiểu 4 ký tự sau trim.

Các pathname khác khởi tạo landing, không mặc định `/login` hay `/register` là route riêng. Màn public được render khi chưa đăng nhập hoặc qua chế độ preview landing của admin.

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

Vai trò UI hiển thị từ dữ liệu server, không phải cơ chế bảo vệ tài nguyên. Nhiều nút không bị ẩn hoàn toàn theo từng role; server vẫn phải kiểm tra quyền. Các giới hạn/guard UI không thay thế authorization backend.

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

## 3. Session, state và hợp đồng HTTP

### Dashboard: cookie + CSRF

REST client cố định `/api/v1`, gửi `credentials: 'include'`. Với `POST/PUT/PATCH/DELETE`, đọc cookie `vm_csrf` và gửi `X-CSRF-Token`. Không dùng token dashboard trong localStorage.

401 của request ngoài `/auth/*` kích hoạt một refresh promise dùng chung rồi thử lại một lần. Client unwrap `{data: ...}` nếu không có `meta`; giữ nguyên response phân trang `{data, meta}`. `ApiError` có `status`, `code`, `details`, `requestId`.

`PlatformProvider` gọi `/auth/me` khi mount, giữ userType/tenantId/tenantSlug/MFA state. `logout` gọi server và xóa trạng thái auth cục bộ. Khi refresh thất bại ở HTTP client, không có cơ chế phát event logout toàn cục giống mobile; không nên suy ra mọi 401 tự chuyển màn login.

Impersonation: POST `/platform/tenants/{id}/impersonate`, đọc lại `/auth/me`, hiển thị banner với `expiresIn`. Thoát bằng refresh session rồi `/auth/me`. Banner dùng số phút từ response, không phải đồng hồ countdown đáng tin cậy cho thời hạn server.

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
4. Tenant activate/reject/revoke qua API. UI không tự cấp quyền ANPR chỉ vì người lái đã gửi yêu cầu; tác động whitelist/edge synchronization phải xác minh từ hệ thống backend/edge.

### Phí và tạo giao dịch

Driver session mapper lấy `feeVnd` thành `currentFeeVnd`; UI không tự tính hóa đơn từ đồng hồ đếm thời gian. Null được hiển thị `—`; lịch sử thể hiện phí ước tính. Form payment không gửi số tiền tự tính cho session/membership, chỉ gửi ID tham chiếu; top-up có `amountVnd`.

`PaymentEWalletModal` từ Profile lấy memberships, active sessions và **trang đầu 20 phiên lịch sử** để tạo danh sách cần trả; lấy payments + wallet. Không phải sổ công nợ đầy đủ tất cả lịch sử. Trong sheet có MoMo/wallet; nút trả ở tab Memberships gửi body không kèm `method` để backend áp default.

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

Tenant Payments cho xem trạng thái `created/paid/failed/cancelled/expired/refunded` và `POST /tenants/{tenantId}/payments/{id}/refund`, rồi refetch. Việc tiền thực sự được trả về provider/wallet, tự kích hoạt membership, grace window hay gate release không thể chứng minh chỉ từ source hai web app.

Nguồn: [`TenantMembershipsPage.tsx`](../frontend/src/pages/tenant/TenantMembershipsPage.tsx), [`TenantDetailModal.tsx`](../mobile/src/components/discover/TenantDetailModal.tsx), [`PaymentEWalletModal.tsx`](../mobile/src/components/profile/PaymentEWalletModal.tsx), [`usePayments.ts`](../mobile/src/hooks/usePayments.ts), [`driver.ts`](../mobile/src/api/driver.ts).

## 7. Phần demo, stub và nội dung không nên diễn giải quá mức

### Dashboard

- **Landing simulator:** kịch bản biển số, confidence/latency, logic VIP/block và animation barrier là demo phía trình duyệt, không gọi OCR/relay. Pricing lấy `/plans` nhưng fallback marketing khi lỗi; các cam kết marketing/pháp lý không tự chứng minh tính năng vận hành.
- **MFA:** login MFA/resume/resend, setup/enroll/disable/reset-admin có API. Riêng nhánh `challenge` trong `MfaFlowModal` là demo step-up: xử lý sau timeout, không gọi endpoint server xác thực nâng quyền. Không dùng nhánh này làm cổng bảo mật thật.
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

Chỉ mobile có `npm test` → `vitest run`; frontend không có script test hay test file trong source đã quét. Hai app cùng cổng mặc định, nên chạy mobile với `npm run dev -- --port 3001` nếu dashboard dùng 3000. Vite có thể tự tăng cổng khi cổng bận; đọc log thay vì mặc định URL luôn đúng.

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
