# ParkVision — Web quản trị

Ứng dụng SPA cho **quản trị nền tảng** và **vận hành tenant/bãi xe**, kèm landing page, đăng ký tenant và trang tìm xe công khai. Mã hiện tại dùng React 19, TypeScript, Vite 6, Tailwind CSS 4, D3/Recharts và i18next. Đây không phải backend hay chương trình điều khiển relay trực tiếp.

Tài liệu đối chiếu hai ứng dụng, API, realtime, thanh toán và các phần demo: [docs/web-apps.md](../docs/web-apps.md).

## Chạy phát triển

Dùng Node.js 20 (cũng là phiên bản trong Dockerfile) và npm. Backend phải hoạt động ở địa chỉ proxy; tài khoản/quyền do backend quản lý, không có chế độ đăng nhập mock tự động.

Từ thư mục `frontend/`:

```sh
npm ci
npm run dev
```

Mở `http://localhost:3000`. Script dev bind `0.0.0.0`, vì vậy cân nhắc mạng đang sử dụng. Nếu chạy đồng thời ứng dụng tài xế:

```sh
# Chạy trong mobile/, giữ dashboard ở cổng 3000
npm run dev -- --port 3001
```

Khởi động stack backend theo hướng dẫn riêng của backend. Từ `backend/`, lệnh dự án là `docker compose up -d --build`; không cần chỉnh Compose để chạy riêng frontend.

### Biến môi trường thực sự được đọc

- `VITE_API_PROXY_TARGET`: `vite.config.ts` đọc qua `process.env`, mặc định `http://localhost:8000`; proxy cả `/api` và `/ws` trong dev.
- `DISABLE_HMR=true`: tắt HMR và thay đổi cấu hình theo dõi file trong Vite.
- `API_UPSTREAM`: biến **runtime của image Nginx**, mặc định `http://api:8000`; dùng cho cả REST và WebSocket, không phải biến client Vite.

Ví dụ shell `sh`:

```sh
VITE_API_PROXY_TARGET=http://localhost:8000 npm run dev
```

PowerShell:

```powershell
$env:VITE_API_PROXY_TARGET = 'http://localhost:8000'
npm run dev
```

Cấu hình Vite không gọi `loadEnv`, nên với biến proxy đọc từ `process.env`, cách chắc chắn là truyền bằng môi trường của tiến trình như trên; không mặc định rằng chỉ tạo `.env` sẽ có hiệu lực. Không có `.env.example` trong thư mục tại thời điểm rà soát.

Client REST cố định tiền tố `/api/v1` trong [`src/services/api/client.ts`](src/services/api/client.ts); không đọc `VITE_API_BASE_URL`. Không cần `GEMINI_API_KEY`: source hiện tại không gọi Gemini dù dependency `@google/genai` còn trong `package.json`. Không đặt bí mật backend/cổng thanh toán vào bundle trình duyệt.

## Màn hình và điều hướng

Nguồn chính: [`src/App.tsx`](src/App.tsx), [`PlatformContext.tsx`](src/context/PlatformContext.tsx), [`PlatformSidebar.tsx`](src/components/layout/PlatformSidebar.tsx).

- **Công khai:** landing/demo ANPR, bảng giá, privacy/terms/SLA, đăng nhập, đăng ký tenant, kích hoạt lời mời, reset mật khẩu, tìm xe.
- **Platform:** dashboard thống kê, danh sách/chi tiết tenant, settings, feature flags, tài khoản quản trị, monitoring (dịch vụ/edge/camera/barrier/incidents), security (alerts/login activity/sessions/credentials), audit logs.
- **Tenant:** dashboard, location/sites/camera, users & members, xe/whitelist, access rules và simulator, access events/ảnh/sửa biển số, edge devices/kích hoạt thiết bị, barrier map, sơ đồ tầng/zone/tìm xe/check-in/check-out, gói hội viên/yêu cầu/thanh toán/refund, settings tenant.

Điều hướng chủ yếu bằng React state, **không dùng React Router**. Tab dashboard không tương ứng một URL riêng và không được phục hồi đầy đủ khi reload. Chỉ khởi tạo trực tiếp các pathname sau:

- `/activate?token=...`
- `/reset-password?token=...`
- `/find-my-car?tenant=<slug>&plate=<bien-so>` (`plate` không bắt buộc)

Đường dẫn `/login` không được ánh xạ trực tiếp thành màn login; bình thường dùng nút đăng nhập từ landing. Nhánh public chỉ render khi chưa đăng nhập hoặc đang preview landing.

## State, xác thực và API

- `PlatformProvider` giữ session, workspace, bộ lọc, tenant đang chọn, dữ liệu nghiệp vụ, toast và telemetry. `/auth/me` xác định `userType`; `platform_admin` vào platform, tenant user vào tenant. UI role không thay thế kiểm tra quyền phía server.
- HTTP gửi `credentials: 'include'`; cookie xác thực do backend quản lý. Các request ghi echo cookie `vm_csrf` vào `X-CSRF-Token`. Khi request ngoài `/auth/*` trả 401, client thử `/auth/refresh` một lần và gửi lại.
- `authApi` có login, MFA login/resume/resend, activation, quên/reset/đổi mật khẩu, enroll/disable MFA và session management. Modal **challenge sau đăng nhập vẫn là demo**, khác với MFA login thật.
- [`src/services/api/index.ts`](src/services/api/index.ts) tập trung `authApi`, `publicApi`, `platformApi`, `tenantApi`; `schema.d.ts` chứa kiểu API và `mappers.ts` chuyển DTO sang model UI.
- Dữ liệu tải khi đăng nhập/chọn tenant và sau các thao tác; nhiều danh sách context chỉ tải tối đa 100/200 bản ghi. Lọc/phân trang UI trên dữ liệu đó không đảm bảo đại diện toàn bộ cơ sở dữ liệu.
- Ngôn ngữ Anh/Việt qua i18next, mặc định Anh, lưu `pv-language`; theme lưu `theme` trong `localStorage`.

### Realtime và lệnh barrier

Khi có active tenant, context mở `/ws/tenants/{tenantId}/barrier-telemetry` trên **cùng host của trang**, đổi `ws`/`wss` theo protocol. Frame cập nhật telemetry, command ACK, access events, heartbeat và vị trí xe/occupancy. Khi socket đóng, thử nối lại tối đa 5 lần, chờ lần lượt 3/6/9/12/15 giây; không có polling toàn bộ context định kỳ thay thế.

Lệnh gate đi qua REST tenant API, kèm `crypto.randomUUID()` làm request ID; UI poll command mỗi 1,5 giây, tối đa 10 lượt. “Command sent” không có nghĩa barrier vật lý đã chạy; kiểm tra ACK/trạng thái và telemetry. Đừng thử lệnh trên bãi đang vận hành nếu chưa có quy trình an toàn.

## Phần đã tích hợp và phần chưa hoàn chỉnh

- **Đã nối API trong source:** CRUD/đọc dữ liệu nêu trên, plans/membership/payment/refund, tải ảnh sơ đồ bằng URL presign, tra xe công khai, rule simulator gọi server. Việc có request không chứng minh deployment đã cấu hình hoặc thiết bị đã phản hồi.
- **Demo marketing:** ANPR ở landing dùng kịch bản/animation và giá trị confidence/latency dựng sẵn; không chạy OCR. Giá SaaS thử tải `/plans`, có fallback nội dung marketing; trang pháp lý là nội dung tĩnh.
- **MFA step-up demo:** nhánh `challenge` trong [`MfaFlowModal.tsx`](src/components/modals/MfaFlowModal.tsx) xử lý cục bộ, không phải server xác nhận nâng quyền. Enroll, disable và MFA lúc login có API riêng.
- **Anomaly heuristic cục bộ:** detector dùng baseline mặc định, chưa học lịch sử từng gate. Nút “mitigate” thay đổi trạng thái detector/UI và append audit cục bộ, không tự bật rate-limit trên edge. Xem `src/services/anomalyDetectionService.ts` và `src/components/monitoring/BarrierMapVisualization.tsx`.
- **Mock filename không đồng nghĩa dữ liệu bãi giả:** `data/mockData.ts` hiện chứa defaults settings; `tenantMockData.ts` chứa location rỗng; barrier map dùng outline địa lý tĩnh. Pin thiếu GPS được đặt theo phép rải xác định, không phải tọa độ thật.
- **Simulate Event có ghi thật:** nút dev ở `TenantDashboardPage.tsx` gọi tạo access event `source: 'manual'`; chỉ nút này bị ẩn ở production. Không dùng để kiểm chứng ANPR.
- `pushAuditLog` chỉ append state hiển thị; audit bền vững phải do server ghi. Một số lỗi API được chuyển thành danh sách rỗng/default, vì vậy UI rỗng hoặc badge “normal” không đủ chứng minh hệ thống khỏe.

## Lệnh, build và triển khai

Các script đúng theo [`package.json`](package.json):

```sh
npm run dev       # vite --port=3000 --host=0.0.0.0
npm run lint      # tsc --noEmit, không phải ESLint
npm run build    # vite build -> dist/
npm run preview  # xem thử bản build; không dùng làm production server
npm run clean    # rm -rf dist server.js; cần shell hỗ trợ rm
```

Không có script `test`, `typecheck`, `start` hay bộ test frontend trong cây source đã quét. `build` không tự typecheck; chạy `lint` riêng. Dockerfile có chạy cả `lint` và `build`.

Từ repository root:

```sh
docker build -t parkvision-frontend frontend/
# Chỉ dùng ví dụ này nếu API thực sự truy cập được từ container qua host.docker.internal
docker run --rm -p 8080:80 -e API_UPSTREAM=http://host.docker.internal:8000 parkvision-frontend
```

Nếu dùng mặc định `http://api:8000`, container frontend cần ở mạng Docker phân giải được service `api`. [`Dockerfile`](Dockerfile) build bằng Node 20 Alpine rồi phục vụ `dist` bằng Nginx 1.27. [`nginx.conf.template`](nginx.conf.template) proxy `/api/`, upgrade `/ws`, và fallback các đường dẫn SPA về `index.html`. Comment “React Router” trong template không mô tả đúng cách điều hướng hiện tại. TLS/domain/cookie policy cần được bố trí ở môi trường triển khai.

## Kiểm chứng khi cập nhật tài liệu

Đã chạy `npm run lint` và đạt khi rà soát này. **Chưa chạy** build Docker, `npm run build`, kiểm thử trình duyệt, backend integration hoặc lệnh barrier thật. Kiểm tra smoke test và các caveat liên ứng dụng trong [web-apps.md](../docs/web-apps.md#8-kiểm-thử-và-checklist-vận-hành).
