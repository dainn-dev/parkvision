# Phát triển, triển khai và vận hành ParkVision

Hướng dẫn liên thành phần cho checkout hiện tại. Các câu lệnh là hướng dẫn thao tác, không phải tuyên bố đã chạy thành công trên hệ thống của người đọc. Bắt đầu tại [README gốc](../README.md), sau đó đọc README module cần làm việc.

## 1. Chọn topology trước khi cấu hình

### A. Toàn bộ backend trong Compose

Từ `backend/`, sau khi chuẩn bị `.env` theo [backend README](../backend/README.md):

```sh
docker compose up -d --build
docker compose ps -a
docker compose logs --since 10m migrate api worker mqtt-bridge
```

Compose gồm PostgreSQL, Redis, EMQX, LocalStack S3, Mailpit và các tiến trình ứng dụng. `migrate` phải thoát thành công trước API/worker/bridge; đây không phải service cần chạy liên tục. Tệp Compose trong workspace còn có `omniroute` và volume riêng; source ParkVision được mô tả ở đây không yêu cầu nó cho luồng cổng/ANPR/thanh toán. Khi chỉ cần stack ParkVision, có thể chỉ định service:

```sh
docker compose up -d --build api worker mqtt-bridge mailpit
```

Compose sẽ khởi động các dependency được khai báo. Không xóa service/volume phụ để làm theo tài liệu.

Địa chỉ nội bộ container:

- PostgreSQL: `postgres:5432`; Redis: `redis:6379`.
- MQTT: `emqx:1883`; SMTP: `mailpit:1025`.
- LocalStack: `s3:4566` cho truy cập mạng container, nhưng cần cân nhắc URL ký sẵn bên dưới.
- Migration/seed dùng tài khoản DB đặc quyền; runtime dùng `vehicle_app` chịu RLS. `APP_DB_PASSWORD` khi migration phải tương ứng mật khẩu trong runtime `DATABASE_URL` nếu đổi khỏi dev default.

### B. Backend chạy trên host, hạ tầng trong Compose

```sh
# backend/
docker compose up -d postgres redis emqx s3 mailpit
```

Sau đó cài Python environment, migrate, seed, và chạy API/worker/bridge ở các terminal riêng theo [backend README](../backend/README.md). Đặt URL tới `localhost` với các cổng publish: DB 5432, Redis 6379, MQTT 1883, SMTP 1025, S3 9000. Không dùng `emqx` hoặc `postgres` làm hostname của tiến trình host nếu không có DNS tương ứng.

MQTT Python trên Windows có yêu cầu event loop; entrypoint bridge chưa tự cấu hình Selector policy. Nếu gặp lỗi `add_reader`/`add_writer`, dùng container Linux cho bridge thay vì sửa ngẫu nhiên mã ứng dụng.

### C. Edge/camera trên máy khác

`localhost:8000` trên kiosk là **chính kiosk**, không phải server backend. Dùng DNS/IP server có thể truy cập từ máy edge; API base cho activation phải bao gồm `/api/v1`. MQTT host trong activation/config cũng phải truy cập được từ edge, không dùng hostname Compose `emqx` nếu thiết bị không ở mạng đó.

Camera RTSP phải truy cập từ máy chạy ANPR. Không mở HTTP ingest loopback của edge ra Internet để “sửa” kết nối camera; camera được worker đọc, kết quả gửi tới loopback trên cùng máy. Cấu hình monitor-camera MQTT là đường khác, xem [hợp đồng detection](mqtt-camera-detection.md).

### S3 và presigned URL

`S3_ENDPOINT_URL` hiện được dùng để tạo client S3 và URL ký sẵn; không có biến public endpoint riêng trong `Settings`. Do đó cùng hostname/port cần khả dụng từ backend tạo request và browser/edge tải hoặc upload ảnh.

- `http://s3:4566` hợp lệ giữa container nhưng browser host thường không resolve `s3`.
- `http://localhost:9000` hợp lệ trên host nhưng `localhost` trong API container không phải LocalStack.
- Không thay hostname trong URL đã ký ở phía client: chữ ký phụ thuộc request được ký.
- Chọn hostname/reverse proxy hoặc DNS/mạng phù hợp với mọi bên; xác minh PUT và GET thực tế từ cả browser lẫn backend. `host.docker.internal` là cơ chế Docker Desktop, không phải hostname được bảo đảm ở mọi host/thiết bị.

Nguồn: [`config.py`](../backend/app/config.py), [`storage.py`](../backend/app/services/storage.py), [Compose](../backend/docker-compose.yml).

## 2. Biến môi trường và secret

### Backend

`Settings` đọc `.env` từ working directory. Chi tiết/default ở [`app/config.py`](../backend/app/config.py) và [backend docs](backend.md).

Trước khi chạy, rà soát các nhóm:

- `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `APP_DB_PASSWORD`: phân biệt runtime và migration, thống nhất DB/mật khẩu.
- `REDIS_URL`, `MQTT_HOST`, `MQTT_PORT`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_TLS`.
- `S3_ENDPOINT_URL`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`.
- `JWT_SECRET`, `JWT_PREVIOUS_SECRETS`, `FIELD_ENCRYPTION_KEY`: khóa ký và khóa Fernet thật; không dùng chuỗi `change-me`.
- `COOKIE_SECURE`, `COOKIE_SAMESITE`, `COOKIE_DOMAIN`, `CORS_ORIGINS`, `APP_BASE_URL`.
- `SMTP_HOST`, `SMTP_PORT`, SMTP credentials/TLS; Mailpit chỉ để dev.
- `PAYMENT_PROVIDER`, các biến `MOMO_*`, `PAYMENT_REDIRECT_URL`, `PAYMENT_IPN_BASE_URL` khi bật thanh toán.
- `METRICS_TOKEN`, `TRUST_PROXY_HEADERS`, `RATE_LIMIT_ENABLED`.

Không coi `.env` hợp lệ về cú pháp là cấu hình an toàn. Default JWT/cookie/MQTT trong source là baseline dev. Cấu hình CORS dạng danh sách nên dùng JSON, ví dụ `CORS_ORIGINS=["http://localhost:3000","http://localhost:3001"]`; không thay bằng wildcard khi cần cookie credentials.

### Dashboard và mobile

Dashboard dùng REST `/api/v1` cùng origin; Vite dev đọc proxy từ **môi trường tiến trình** `VITE_API_PROXY_TARGET`. Mobile dùng `VITE_API_PROXY` cho dev proxy và `VITE_API_BASE_URL` cho REST client; URL WebSocket suy ra host của REST base và scheme của trang hiện tại, không có biến `VITE_WS_BASE_URL` trong client hiện tại. Đối chiếu cách ghép URL trong [web apps docs](web-apps.md), không mặc định các biến này có cùng ý nghĩa.

Cả hai script dev mặc định cổng 3000. Chạy mobile với `npm run dev -- --port 3001` khi chạy song song. Mobile Vite config hiện **không có proxy `/ws`**: REST chạy không chứng minh realtime chạy. Thiết lập WS tới backend hoặc dùng reverse proxy hỗ trợ upgrade và phù hợp cơ chế auth.

### Edge và ANPR

Edge lưu API key, MQTT credential và relay config local; ANPR có JSON runtime, model, queue và ảnh local. Che secret trong `Debug` không có nghĩa file trên đĩa được mã hóa. Bảo vệ quyền file, backup và quy trình bàn giao máy; xem [edge docs](edge-client.md) và [ANPR docs](anpr-worker.md).

## 3. Kiểm tra sau khởi động

### Hạ tầng và API

```sh
# backend/
docker compose ps -a
docker compose logs --since 10m api worker mqtt-bridge migrate
curl http://localhost:8000/healthz
curl http://localhost:8000/readyz
```

- `/healthz`: chỉ trả trạng thái sống của API, không kiểm chứng DB, MQTT, S3, worker hoặc relay.
- `/readyz`: kiểm tra PostgreSQL/Redis; **HTTP vẫn 200** khi JSON `status` là `degraded`. Giám sát phải đọc body và từng check.
- `/metrics`: Prometheus; yêu cầu Bearer khi có `METRICS_TOKEN`. Chưa cấu hình token thì endpoint mở.
- Bucket creation ở startup là best-effort; cần thử presign/upload/download ảnh riêng.
- Compose API healthcheck dùng `/healthz`, nên container “healthy” không có nghĩa nghiệp vụ toàn hệ thống sẵn sàng.

### Smoke test nghiệp vụ

1. Seed **chỉ trên dev** rồi login platform và tenant owner; xác minh `/auth/me`, role/tenant và cookie/CSRF.
2. Mở dashboard, tạo/đọc tài nguyên đúng tenant. Không thử test bằng DB superuser thay cho runtime role.
3. Tạo device/activation code, activate edge; kiểm tra gate binding và sync whitelist/rules.
4. Thử nhập biển số thủ công với HAL mô phỏng trước khi nối phần cứng. `barrier: null` không kiểm chứng relay.
5. Gửi command qua dashboard, quan sát command record, MQTT/ACK, edge FSM và trạng thái cảm biến. Không gửi liên tục để “ép mở”.
6. Với ANPR, kiểm chứng ACK, ảnh và queue/retry trước khi bật quyết định cổng tự động. Chênh lệch Python/Rust đã được liệt kê trong [ANPR docs](anpr-worker.md).
7. Với vị trí xe, kiểm chứng camera coverage/zone và đường monitor detection riêng.
8. Với payment, dùng sandbox trước; kiểm tra webhook/query, idempotency và paid-exit với edge online. Không chỉ nhìn màn “thành công” phía browser.

## 4. Đóng gói dashboard và ứng dụng khác

Từ gốc repository:

```sh
docker build -t parkvision-frontend frontend/
```

Image build Vite rồi Nginx serve static; `/api/` và `/ws` proxy tới `API_UPSTREAM` (mặc định `http://api:8000`). Default chỉ hoạt động khi container dashboard cùng mạng có thể resolve `api`. Nếu API publish trên Docker Desktop host, ví dụ:

```sh
docker run --rm -p 8080:80 -e API_UPSTREAM=http://host.docker.internal:8000 parkvision-frontend
```

Ví dụ này không thay thế DNS/HTTPS production và không khả dụng như nhau trên mọi hệ điều hành. Với cùng Compose network, chọn đúng tên mạng đã kiểm tra bằng `docker network ls`; không đoán tên hoặc sửa service ngoài phạm vi.

Nginx có SPA fallback, không có TLS trong template hiện tại. Cookie/CSRF, WebSocket upgrade và URL ảnh phải được thử qua chính origin public sẽ dùng. `APP_BASE_URL` cần trỏ URL dashboard phục vụ link email, không để `localhost` trong email production.

Mobile hiện không có Dockerfile riêng; `npm run build` tạo `dist/`, cần static host/reverse proxy SPA cho REST/WS. Edge installer/ANPR sidecar là quy trình native riêng; build Vite thành công **không** chứng minh đã đóng gói được Tauri và model.

Nguồn: [frontend Dockerfile](../frontend/Dockerfile), [Nginx template](../frontend/nginx.conf.template), [frontend CI](../.github/workflows/frontend-ci.yml).

## 5. Kiểm thử và CI

### Web apps

Từ `frontend/`: `npm ci`, `npm run lint`, `npm run build`. `lint` thực tế là `tsc --noEmit`, không phải ESLint. Chưa có npm test script dashboard.

Từ `mobile/`: `npm ci`, `npm run lint`, `npm test`, `npm run build`. Tests là Vitest; không suy ra có browser E2E từ việc unit test pass.

### Edge

Từ `edge-client/`: `npm ci`, `npm run lint`, `npm run build`. Từ `edge-client/src-tauri/`: `cargo test`. Rust tests có thể cần native dependency phù hợp OS; test HAL không thay thế nghiệm thu wiring/relay thật.

### Backend

Đọc cảnh báo và lệnh đầy đủ trong [backend README](../backend/README.md#kiểm-thử). Fixture autouse integration drop/recreate schema; cả `DATABASE_URL` và `MIGRATION_DATABASE_URL` phải trỏ cùng database riêng có hậu tố `_test`, trên **PostgreSQL instance cách ly**, và Redis phải tách khỏi vận hành thật. Chỉ tách database trên cùng cluster chưa đủ: migration đầu có thể đổi mật khẩu role `vehicle_app` cấp cluster từ `APP_DB_PASSWORD` của tiến trình hoặc default. Không chạy suite trên instance đang phục vụ dev/production.

Harness E2E cần API, worker, bridge, EMQX, Mailpit, seed dev và cấu hình địa chỉ host. `RATE_LIMIT_ENABLED=false` chỉ dành cho API kiểm thử, không là cấu hình production. E2E sinh dữ liệu, có địa chỉ localhost cố định; không trỏ vào hệ thống live.

### ANPR

Từ gốc repo, có thể build target test:

```sh
docker build --target test anpr-worker/
```

Lệnh pytest/cài môi trường ở [ANPR README](../anpr-worker/README.md). Unit tests dùng adapter/fake để không cần toàn bộ model; không chứng minh inference, CUDA hay RTSP thực. Docker CPU baseline và GPU build có prerequisite riêng.

### Phạm vi CI hiện có

- [`backend-ci.yml`](../.github/workflows/backend-ci.yml): Python 3.12, PostgreSQL/Redis/EMQX, cài dev dependencies, Ruff lint/format, migrate, chạy bridge và pytest.
- [`frontend-ci.yml`](../.github/workflows/frontend-ci.yml): Node 24, `npm ci`, typecheck, Vite build.
- Hai workflow lọc path tương ứng backend/frontend; chưa có workflow riêng được khai báo ở đây cho mobile, ANPR hoặc edge.
- Cấu hình CI là mô tả cách chạy, không phải kết quả CI. Docs-only thay đổi trong `docs/` hoặc README gốc không tự kích hoạt hai workflow theo bộ lọc hiện tại.

## 6. Chẩn đoán thường gặp

### API sống nhưng thao tác lỗi

Đọc body `/readyz`, log `migrate`, DB URL/runtime role và Redis. Nếu tạo ảnh lỗi, kiểm tra S3 riêng; nếu command không tới, kiểm tra `mqtt-bridge` và broker; nếu email/job không chạy, kiểm tra arq `worker`. Không restart toàn bộ stack ngay khi chưa xác định thành phần lỗi.

### Không login hoặc không giữ session

Kiểm tra cùng origin/proxy, CORS credentials, domain/SameSite/Secure cookie và CSRF header. Dashboard cookie và mobile bearer là hai luồng khác nhau; dependency backend ưu tiên cookie access nếu có, nên tránh gửi cookie dashboard kèm Bearer driver khi gọi trực tiếp API.

### Gate command treo hoặc timeout

Theo dõi command ID/idempotency key, Redis outbox, bridge, topic tenant/site/gate và edge connection. ACK thành công không thay thế sensor. Redis pub/sub/list không phải transactional outbox end-to-end; xem [backend docs](backend.md) và [edge docs](edge-client.md) trước khi thiết kế retry.

### Camera thấy ảnh nhưng không có event

Kiểm tra motion state/warmup, class detector hỗ trợ, model path, confidence, OCR, HTTP ACK và queue. Source hiện có ACK Python đòi 202 trong khi Rust trả 200; multipart ảnh cũng khác tên. Không che vấn đề bằng cách xóa queue hoặc tắt dedup.

### Edge mất cấu hình relay sau thay đổi

Refresh phải giữ `barrier` của gate cùng UUID. Nếu xóa gate/tạo gate mới, UUID khác không được merge; deprovision xóa config và không phải backup wiring. Kiểm tra bundle và local backup, không sao chép secret/wiring sang cổng khác mà không nghiệm thu.

### Không có realtime nhưng REST bình thường

Kiểm tra `/ws` upgrade/proxy, đúng tenant/actor, token URL theo client và Redis pub/sub. Mobile Vite thiếu `/ws` proxy theo mặc định. Sau reconnect, refetch REST: WS không có replay lịch sử bảo đảm.

## 7. Checklist trước triển khai

- Tách dev/staging/production và thay toàn bộ mật khẩu/secret mẫu, account seed.
- Chọn DNS/public origin, TLS, cookie Secure và trust proxy đúng trust boundary.
- Không public PostgreSQL, Redis, SMTP dev, dashboard EMQX hoặc ingest loopback không cần thiết. Compose dev hiện publish nhiều cổng ra host.
- Bật MQTT authentication/ACL và TLS phù hợp; không dựa vào `EMQX_ALLOW_ANONYMOUS=true` để cách ly tenant.
- Cấu hình S3, CORS/object policy, presign và retention; xác minh ảnh từ máy người dùng/edge.
- Sao lưu PostgreSQL/S3, role/secret và cấu hình edge; diễn tập restore trên môi trường cách ly theo [runbook](RUNBOOK_BACKUP_RESTORE.md).
- Nghiệm thu relay, sensor, emergency procedure và mất mạng; phần mềm FSM không thay thế safety interlock vật lý.
- Xác minh model, tài nguyên CPU/GPU, disk quota/queue/captures và điều kiện chiếu sáng/camera thật.
- Kiểm tra payment sandbox/callback/paid-exit/refund trước tiền thật; ghi nhận giới hạn offline.
- Bổ sung giám sát theo body readiness, bridge/worker/edge heartbeat, outbox/queue, disk, lỗi ảnh và command timeout.

Tài liệu không khẳng định hệ thống đã production-ready hoặc đã được security audit. Các giới hạn cụ thể được ghi tại từng tài liệu thành phần.
