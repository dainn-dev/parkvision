# ParkVision — Ứng dụng web cho tài xế

`mobile/` là **web SPA responsive** viết bằng React 19, TypeScript, Vite 6, Tailwind CSS 4 và Leaflet; không phải React Native hay app Android/iOS đóng gói sẵn. Source hiện tại tích hợp API ParkVision cho tìm bãi, xe cá nhân, phiên đỗ xe, hội viên, thanh toán và ví.

Chi tiết liên ứng dụng và giới hạn đã đối chiếu source: [docs/web-apps.md](../docs/web-apps.md).

## Chạy phát triển

Khuyến nghị Node.js 20 và npm. Cần backend phục vụ `/api/v1`; không có tài khoản demo/offline tự thay thế backend.

Từ `mobile/`:

```sh
npm ci
npm run dev
```

Mở `http://localhost:3000`. Script bind `0.0.0.0`; khi mở từ điện thoại, dùng địa chỉ LAN của máy phát triển. Backend mặc định vẫn được Vite truy cập từ máy chạy Vite, không phải từ điện thoại.

Cả `frontend` và `mobile` mặc định cổng 3000. Chạy app tài xế ở cổng riêng khi dùng đồng thời:

```sh
npm run dev -- --port 3001
```

Có thể khởi động stack backend từ `backend/` bằng `docker compose up -d --build`; xem tài liệu backend cho cấu hình dữ liệu, email và thanh toán.

### Cấu hình môi trường

- `VITE_API_BASE_URL`: client đọc bằng `import.meta.env`, mặc định `/api/v1`; dùng làm prefix REST và lấy host để tạo URL WebSocket. Có thể đặt trong `.env.local`, cần restart dev server hoặc build lại khi thay đổi.
- `VITE_API_PROXY`: Vite đọc bằng `process.env`, mặc định `http://localhost:8000`; **chỉ proxy `/api` trong dev**. Không nhầm với `VITE_API_PROXY_TARGET` của dashboard.
- `DISABLE_HMR=true`: cấu hình tắt HMR/theo dõi file như trong `vite.config.ts`.

Ví dụ `sh`:

```sh
VITE_API_PROXY=http://localhost:8000 npm run dev -- --port 3001
```

PowerShell:

```powershell
$env:VITE_API_PROXY = 'http://localhost:8000'
npm run dev -- --port 3001
```

Không có `.env.example` trong thư mục ở thời điểm rà soát, nên không cần bước copy tệp này. `vite.config.ts` không gọi `loadEnv`; để chắc chắn biến proxy đọc qua `process.env` có hiệu lực, truyền ở môi trường tiến trình. Ngược lại `VITE_API_BASE_URL` là biến client được Vite nạp/đóng gói; không đặt secret trong biến `VITE_*`.

**Giới hạn realtime ở dev:** cấu hình Vite hiện tại không proxy `/ws`. Với base URL mặc định, socket `/ws/driver/sessions` đi tới host/cổng của Vite, không tới backend. REST vẫn hoạt động, phiên đang đỗ vẫn poll mỗi 20 giây nhưng cập nhật tức thời và lịch sử qua WS không hoạt động qua proxy này. Có thể dùng một reverse proxy hỗ trợ cả `/api` và `/ws`, hoặc đặt base URL tuyệt đối tới API đã cấu hình CORS/origin phù hợp. Với trang HTTPS, host WS cũng phải phục vụ WSS vì helper chọn protocol theo trang.

## Màn hình và quyền sử dụng

Nguồn: [`src/App.tsx`](src/App.tsx) và `src/components/`.

1. **Login/Register/Guest:** đăng nhập, tạo tài khoản driver qua email/password hoặc tiếp tục xem với guest. Driver và tài khoản tenant/platform dùng hai cơ chế session khác nhau.
2. **Discover:** tìm tên/địa chỉ/thành phố, lọc chỗ trống/khoảng cách/giá/loại bãi/tiện ích/hội viên; bản đồ Leaflet, danh sách bãi và active parking banner.
3. **Map:** màn bản đồ lớn, chọn marker, preview và chi tiết bãi; mở Google Maps khi có tọa độ.
4. **My Parking:** phiên `PARKED` đầu tiên, ảnh ANPR nếu có, phí ước tính từ API; lịch sử phân trang 20 bản ghi và “Xem thêm”.
5. **Memberships:** danh sách yêu cầu/gói, trạng thái, hủy và thanh toán yêu cầu phù hợp. Chọn gói/xe để yêu cầu trong modal chi tiết bãi.
6. **Profile:** hiển thị hồ sơ, thêm/sửa/xóa/chọn xe chính; modal ví/thanh toán, bảo mật/phiên đăng nhập, tùy chọn thông báo, ngôn ngữ, đăng xuất.
7. **Find My Vehicle:** từ phiên đang đỗ, tra biển số theo tenant slug; hiện tầng/zone và ảnh vào bãi nếu backend cung cấp, không tự dựng sơ đồ dẫn đường trong nhà.

Guest được duyệt Discover/Map và dữ liệu bãi công khai; My Parking/Memberships/Profile yêu cầu login. Favorite và yêu cầu hội viên cũng dẫn tới login nếu là guest. Tab/modal dùng state, không có router URL/deep link riêng hay khôi phục lịch sử tab qua browser Back.

## State, auth và API

- [`useAuth.tsx`](src/hooks/useAuth.tsx): các trạng thái `loading`, `guest`, `authed`, `unauthenticated`; khôi phục bằng `/driver/auth/me`. Guest marker là `pv_guest` trong `localStorage`.
- [`src/lib/api.ts`](src/lib/api.ts): access/refresh token trong `pv_driver_access` và `pv_driver_refresh`; gửi `Authorization: Bearer ...`. Các 401 đồng thời chia sẻ một request refresh, sau đó thử lại; refresh thất bại thì xóa token và phát `pv:logout`.
- [`src/api/driver.ts`](src/api/driver.ts): auth/profile/password/auth sessions, vehicles, favorites, parking sessions, memberships, payments, wallet.
- [`src/api/public.ts`](src/api/public.ts): list/detail sites, plans và locate plate. Model UI tên `Tenant` thực chất đại diện **site/bãi**, `id`/`siteId` là site ID, còn `tenantId` là tổ chức sở hữu.
- Hooks trong `src/hooks/` giữ state và gọi API, không dùng Redux hay query-cache thư viện. Favorite cập nhật optimistic và rollback khi lỗi.
- `useSites`: debounce từ khóa 300 ms, request bán kính 50 km, poll 15 giây; bộ lọc khoảng cách/giá/tiện ích phía client áp dụng tiếp. Giá/ảnh/rating/tọa độ thiếu không được bịa thêm; bãi thiếu tọa độ không có marker.
- `useActiveSession`: tải ngay, poll 20 giây, giữ phiên cuối khi lỗi tạm thời. `useSessionHints` nối `/ws/driver/sessions?token=...`, nhận `session_event` rồi refetch REST, thử nối lại sau 8 giây.
- `useParkingHistory`: tải lúc mount, nhận hint WS và load-more; **không có polling định kỳ**. Không nên hiểu “REST fallback” là mọi màn hình đều được poll.
- Việt/Anh qua `LanguageProvider`, mặc định Việt, lưu `vision_parking_lang`; tìm kiếm gần đây tối đa 5 mục trong `pv_recent_searches`.

Token driver ở `localStorage` có thể bị đọc nếu xảy ra XSS. Dùng HTTPS, không log token query của WS và không chia sẻ ảnh/URL chứa biển số khi chưa che dữ liệu.

## Hội viên, thanh toán và ví: có request thật, phụ thuộc backend

- Chi tiết bãi lấy `GET /public/sites/{id}/plans`; chọn xe đã đăng ký rồi `POST /driver/memberships` với `planId`, `vehicleId`. UI đọc trạng thái trả về; gửi yêu cầu không có nghĩa đã được cấp quyền vào bãi.
- [`PaymentEWalletModal.tsx`](src/components/profile/PaymentEWalletModal.tsx) trong Profile là nơi thanh toán phiên đỗ, hội viên và nạp ví. Nó lấy phiên active + trang đầu 20 lịch sử, không liệt kê mọi khoản quá khứ không giới hạn.
- [`usePayments.ts`](src/hooks/usePayments.ts) tạo `POST /driver/payments` với `kind: 'membership' | 'session' | 'topup'`; hai loại đầu hỗ trợ `method: 'momo' | 'wallet'`. UI chọn phương thức tại payment sheet; nút trả tiền trong tab Memberships gửi không kèm method.
- Khi response có `payUrl`, mở trang nhà cung cấp ở tab mới. Nếu `status === 'created'`, poll payment mỗi 4 giây; trên response thành công sẽ dừng khi trạng thái đổi hoặc đã quá 120 giây. Wallet settlement có thể trả trạng thái cuối ngay. Không tự đánh dấu paid dựa vào việc đóng tab.
- **Caveat timeout:** nếu mọi request poll đều lỗi, nhánh `catch` không kiểm tra mốc 120 giây, nên có thể tiếp tục poll lâu hơn. Hook chỉ theo dõi một payment mỗi instance; không phải hàng đợi theo dõi nhiều giao dịch bền vững.
- Sheet hiển thị balance + các giao dịch ví; thiếu balance có thể hiện 0. Lỗi `payments_not_configured` chuyển sang thông báo thanh toán tại bãi, không giả lập thanh toán thành công. Credentials gateway chỉ cấu hình phía backend.
- Quyết toán/refund, kích hoạt membership, grace window và mở cổng sau trả phí thuộc backend/edge; source UI có lời gọi thật nhưng không đủ chứng minh các tác động đó trong một deployment.

## Mock/stub và giới hạn cần biết

- Thông báo (`NotificationSettingsModal`) chỉ lưu `pv_notif_prefs` trên thiết bị; chưa tích hợp push delivery. Chuông Discover có callback rỗng.
- Biometric, driver 2FA, tùy chọn riêng tư, xuất/xóa dữ liệu có trạng thái “coming soon” trong `SecurityPrivacyModal`; đổi mật khẩu và xem/thu hồi auth session là API thật.
- Tab reviews của chi tiết bãi là empty state; không có hệ thống đánh giá thật trong luồng hiện tại.
- GPS gọi browser geolocation; vị trí ban đầu là Quận 7, TP.HCM, và lựa chọn vị trí thủ công là dữ liệu có sẵn (`permissionStatus: 'simulated'`), không phải geocoding địa chỉ. GPS thường cần HTTPS/localhost và người dùng cho phép.
- `openNow` suy ra từ `open`/`close` bằng giờ thiết bị; thiếu giờ coi là mở. Đây không phải tính toán lịch hoạt động đầy đủ theo timezone của bãi.
- Nhãn “realtime” trên bản đồ không đồng nghĩa capacity dùng socket: capacity hiện cập nhật qua poll sites 15 giây. Một số lỗi list được nuốt/giữ dữ liệu cũ; empty state không luôn đồng nghĩa không có dữ liệu trên server.

## Lệnh và triển khai

Theo [`package.json`](package.json):

```sh
npm run lint      # tsc --noEmit, không phải ESLint
npm test          # vitest run, không watch
npm run build     # vite build -> dist/
npm run preview   # xem thử build local
npm run clean     # rm -rf dist server.js, cần shell hỗ trợ rm
```

`build` không tự chạy typecheck hoặc tests. Không có Dockerfile/package script native build trong `mobile/`. Triển khai `dist/` lên static host/reverse proxy; cấu hình `/api` tới backend và `/ws/driver/sessions` với WebSocket Upgrade. Vite proxy không đi vào `dist` và `preview` không phải API gateway production. Nếu dùng base URL tuyệt đối, build với URL đúng và kiểm tra CORS/WS origin/TLS; không chỉ set env runtime của static server.

Leaflet tải tile từ `*.tile.openstreetmap.org`; Google Maps mở URL ngoài; ảnh bãi và ảnh ANPR dùng URL API cấp. Cần kết nối mạng, chính sách dữ liệu và kiểm tra quy định attribution/tile usage trước phát hành.

## Kiểm thử đã xác minh

Đã chạy trong đợt rà soát này:

- `npm run lint`: đạt.
- `npm test`: **2 tệp, 8 test đạt**, môi trường jsdom theo [`vitest.config.ts`](vitest.config.ts).
- [`api.test.ts`](src/lib/__tests__/api.test.ts): bearer token, error envelope, refresh chia sẻ khi 401 đồng thời, logout khi refresh thất bại.
- [`mapSite.test.ts`](src/api/__tests__/mapSite.test.ts): mapping profile/giá/capacity, hỗ trợ hội viên, thiếu dữ liệu, giờ 24/7.

Tests mock `fetch`, không xác minh backend/WS/gateway thật hay thao tác màn hình. **Chưa chạy** `npm run build`, kiểm thử E2E/trình duyệt/điện thoại hoặc thanh toán thật. Xem thêm [checklist liên ứng dụng](../docs/web-apps.md#8-kiểm-thử-và-checklist-vận-hành).
