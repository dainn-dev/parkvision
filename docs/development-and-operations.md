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

Compose gồm PostgreSQL, Redis, EMQX, SeaweedFS (S3), Mailpit và các tiến trình ứng dụng. `migrate` phải thoát thành công trước API/worker/bridge; đây không phải service cần chạy liên tục. Tệp Compose trong workspace còn có `omniroute` và volume riêng; source ParkVision được mô tả ở đây không yêu cầu nó cho luồng cổng/ANPR/thanh toán. Khi chỉ cần stack ParkVision, có thể chỉ định service:

```sh
docker compose up -d --build api worker mqtt-bridge mailpit
```

Compose sẽ khởi động các dependency được khai báo. Không xóa service/volume phụ để làm theo tài liệu.

Địa chỉ nội bộ container:

- PostgreSQL: `postgres:5432`; Redis: `redis:6379`.
- MQTT: `emqx:1883` (TCP không TLS) và `emqx:8083` (WebSocket `/mqtt`); SMTP: `mailpit:1025`. EMQX trong Compose xác thực/phân quyền mọi client qua hook HTTP `POST /api/v1/edge/mqtt-auth` của API — xem [§8.1](#81-mqtt-xác-thực-acl-tls-và-cách-ly-tenant) cho phạm vi thật sự của ACL.
- S3 (SeaweedFS): `s3:4566` cho truy cập mạng container; chỉ nhận request ký bằng `S3_ACCESS_KEY`/`S3_SECRET_KEY`, nhưng cần cân nhắc URL ký sẵn bên dưới.
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

`S3_ENDPOINT_URL` tạo client cho thao tác server; `S3_PUBLIC_ENDPOINT_URL` dùng để ký URL presign mà browser mở (nếu trống thì dùng chung endpoint nội bộ). `ensure_bucket()` đặt bucket CORS theo `S3_CORS_ORIGINS` (default `["*"]`) lúc API khởi động, và frontend nginx phải khai báo origin presign qua `S3_PUBLIC_ORIGIN` (default `http://localhost:9000`) trong CSP `img-src`/`connect-src`.

- `http://s3:4566` hợp lệ giữa container nhưng browser host thường không resolve `s3` — chỉ dùng cho `S3_ENDPOINT_URL`.
- `http://localhost:9000` hợp lệ trên host nhưng `localhost` trong API container không phải S3 — dùng cho `S3_PUBLIC_ENDPOINT_URL`.
- Không thay hostname trong URL đã ký ở phía client: chữ ký phụ thuộc request được ký.
- Chọn hostname/reverse proxy hoặc DNS/mạng phù hợp với mọi bên; xác minh PUT và GET thực tế từ cả browser lẫn backend. `host.docker.internal` là cơ chế Docker Desktop, không phải hostname được bảo đảm ở mọi host/thiết bị.

Nguồn: [`config.py`](../backend/app/config.py), [`storage.py`](../backend/app/services/storage.py), [Compose](../backend/docker-compose.yml).

## 2. Biến môi trường và secret

### Backend

`Settings` đọc `.env` từ working directory. Chi tiết/default ở [`app/config.py`](../backend/app/config.py) và [backend docs](backend.md).

Trước khi chạy, rà soát các nhóm:

- `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `APP_DB_PASSWORD`: phân biệt runtime và migration, thống nhất DB/mật khẩu.
- `REDIS_URL`, `MQTT_HOST`, `MQTT_PORT`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_TLS`.
- `S3_ENDPOINT_URL`, `S3_PUBLIC_ENDPOINT_URL`, `S3_CORS_ORIGINS`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`; frontend `S3_PUBLIC_ORIGIN` cho CSP.
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
8. Với payment, dùng sandbox trước và chạy đủ tiêu chí P1–P11 ở [§8.2](#82-thanh-toán-tiêu-chí-đạt-trước-khi-dùng-tiền-thật). Không chỉ nhìn màn “thành công” phía browser: redirect về app không phải xác nhận thanh toán.

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
- MQTT: đạt toàn bộ tiêu chí M1–M10 ở [§8.1](#81-mqtt-xác-thực-acl-tls-và-cách-ly-tenant) trên chính broker production. Không dùng `EMQX_ALLOW_ANONYMOUS=true` (CI hiện dùng giá trị này, nên CI không kiểm chứng ACL).
- Cấu hình S3, CORS/object policy, presign và retention; xác minh ảnh từ máy người dùng/edge.
- Sao lưu PostgreSQL/S3, role/secret và cấu hình edge; diễn tập restore trên môi trường cách ly theo [runbook](RUNBOOK_BACKUP_RESTORE.md).
- Nghiệm thu relay, sensor, emergency procedure và mất mạng; phần mềm FSM không thay thế safety interlock vật lý.
- Xác minh model, tài nguyên CPU/GPU, disk quota/queue/captures và điều kiện chiếu sáng/camera thật.
- Payment: đạt tiêu chí P1–P11 ở [§8.2](#82-thanh-toán-tiêu-chí-đạt-trước-khi-dùng-tiền-thật) trên MoMo sandbox trước tiền thật, và có quyết định cho các mục `[Decision needed]` ở §8.3.
- Khi khách đã trả session payment (`paid_exit`), barrier **không tự mở** — kể cả khi edge online (§8.2 P11) — vì `decide_access` trên edge không biết về payment; khi edge mất mạng (GAP-PAY-002) càng không có đường nào khác. Lối thoát là lệnh mở cổng thủ công (`manual_open` trên kiosk hoặc lệnh cổng từ dashboard); cần đào tạo nhân viên vận hành quy trình này cho tới khi có quyết định D-PAY-3.
- Bổ sung giám sát theo body readiness, bridge/worker/edge heartbeat, outbox/queue, disk, lỗi ảnh và command timeout.

## 8. Tiêu chí nghiệm thu bảo mật MQTT và thanh toán

Mục này thay các câu “bật auth/ACL/TLS phù hợp” và “kiểm tra webhook/query/idempotency” bằng tiêu chí có thể kiểm. Mỗi tiêu chí mô tả **hành vi mã hiện tại**; chỗ nào mã chưa làm được thì ghi rõ “hiện **không đạt**” thay vì giả định đã có. Đối chiếu ngày 2026-11-18 bằng đọc mã; chưa chạy trên broker/MoMo sandbox thật.

### 8.1. MQTT: xác thực, ACL, TLS và cách ly tenant

**Cơ chế hiện có** (nguồn: [`docker-compose.yml`](../backend/docker-compose.yml) service `emqx`; [`edge.py`](../backend/app/api/v1/edge.py) `mqtt_auth`, `_is_backend_bridge`, `_exposed_deployment`):

- EMQX 5.8 dùng **một** hook HTTP `POST http://api:8000/api/v1/edge/mqtt-auth` cho cả authentication (`EMQX_AUTHENTICATION`, body `username/password/clientid`) và authorization (`EMQX_AUTHORIZATION__SOURCES`, body `username/clientid/action/topic`, không có password). `EMQX_AUTHORIZATION__NO_MATCH=deny`.
- Header `X-Mqtt-Hook-Secret` phải khớp `MQTT_HOOK_SECRET`. Nếu secret trống: `ENVIRONMENT=development` thì hook nhận request không ký; môi trường khác thì hook **deny tất cả** (fail closed). `docker-compose.override.yml` trong repo bắt buộc `MQTT_HOOK_SECRET` và `MQTT_PASSWORD`.
- Thiết bị edge: username = `mqtt_client_id` của device (mặc định `edge-{device_id}`), password = token `pk_` của device (cùng credential với `X-Api-Key` REST). Token bị revoke → authn deny.
- Bridge backend: `MQTT_USERNAME`/`MQTT_PASSWORD` → `is_superuser=true` (EMQX bỏ qua authz). Khi `MQTT_HOOK_SECRET` có giá trị hoặc `ENVIRONMENT≠development`, password mặc định (`""`, `backend-secret`) bị từ chối.
- **ACL chỉ ở mức tenant:** authz cho phép mọi topic bắt đầu bằng `tenants/{tenant_id của credential}/`. Không giới hạn theo site/gate của device, không phân biệt publish/subscribe, không phân biệt `telemetry`/`incident`/`command`.
- **TLS:** Compose chỉ mở listener `1883` (TCP thường) và `8083` (WebSocket), không có listener TLS/8883 và không có cert. Edge hỗ trợ `tls`/`wss` một chiều (`edge-client/src-tauri/src/mqtt.rs`, `Transport::tls_with_default_config`/`wss_with_default_config`) — TLS phải được kết thúc ở reverse proxy (ví dụ `/mqtt` qua HTTPS) hoặc do người vận hành tự cấu hình listener EMQX. **Không có mTLS / client certificate.**

**Tiêu chí đạt** (chạy trên broker sẽ dùng thật; `$H` = host broker, `$API` = API base gồm `/api/v1`; thiết bị A thuộc tenant A, thiết bị B thuộc tenant B; dùng `mosquitto_sub`/`mosquitto_pub` ≥ 2.0):

| ID | Kiểm tra | Kết quả bắt buộc | Trạng thái mã hiện tại |
|----|----------|------------------|------------------------|
| M1 | `mosquitto_sub -h $H -p 1883 -t '#' -C 1 -W 5` (không user/password) | CONNACK bị từ chối (`not authorised`) | Kỳ vọng đạt (EMQX có authenticator, hook trả deny) — phải chạy để xác nhận |
| M2 | `curl -s -X POST $API/edge/mqtt-auth -H 'content-type: application/json' -d '{"username":"<userA>","password":"<tokenA>"}'` **không** có `X-Mqtt-Hook-Secret`, trên môi trường có `MQTT_HOOK_SECRET` | `{"result":"deny",...}` | Đạt theo test `test_mqtt_auth_requires_hook_secret_when_configured`, `test_unsigned_hook_fails_closed_outside_development` |
| M3 | Thiết bị A kết nối bằng `mqtt.username` + `api.token` trong bundle activation và publish QoS1 vào `tenants/<A>/sites/<sA>/gates/<gA>/telemetry` | Kết nối thành công; bridge ghi telemetry cho gate `gA` | Đạt ở mức hook theo `test_mqtt_auth_allows_active_device_token`, `test_mqtt_authz_scopes_topics_to_tenant` |
| M4 | Thiết bị A: `mosquitto_sub -u <userA> -P <tokenA> -t 'tenants/<B>/#'`, rồi lặp với `-t '#'` và `-t 'tenants/+/#'` | Cả ba subscription bị từ chối (SUBACK `0x80`/`0x87`; mosquitto in `All subscription requests were denied.`) | Kỳ vọng đạt (filter không bắt đầu bằng `tenants/<A>/`) — phải chạy để xác nhận |
| M5 | Thiết bị A: `mosquitto_pub -V mqttv5 -q 1 -u <userA> -P <tokenA> -t 'tenants/<B>/sites/<sB>/gates/<gB>/telemetry' -m '{"type":"telemetry","state":"open"}'` | PUBACK `0x87 Not authorized` **và** không có bản ghi mới trong `gate_telemetry_logs` cho `gB` | Kỳ vọng đạt; với MQTT 3.1.1 EMQX mặc định bỏ im lặng nên phải kiểm phía DB |
| M6 | Token của A với username của device khác | deny | Đạt theo `test_mqtt_auth_denies_username_mismatch` |
| M7 | Revoke token A trên dashboard (`POST /tenants/{t}/devices/{d}/revoke-token`), rồi kết nối lại bằng token cũ | CONNACK bị từ chối | Đạt ở mức hook (`test_mqtt_auth_denies_revoked_token`). Phiên **đang mở** không bị ngắt — xem G3 |
| M8 | Thiết bị A kết nối **không có password**: `mosquitto_sub -h $H -u <userA> -t 'tenants/<A>/#' -C 1 -W 5` (hoặc `curl` hook với `"password":""` và header secret đúng) | Bị từ chối | **Đạt** (đã sửa G1; test `test_mqtt_authn_without_password_is_denied`; xác nhận trên EMQX thật 2026-11-18: CONNACK 135 Not authorized) |
| M9 | Bridge đăng nhập bằng `backend`/`backend-secret` trên môi trường có `MQTT_HOOK_SECRET` | deny | Đạt theo `test_exposed_deployment_refuses_default_bridge_password` |
| M10 | Từ Internet: `nc -vz $H 1883` và `nc -vz $H 18083`; thiết bị ngoài LAN có `mqtt.tls=true` trong `edge-config.json` | Cổng 1883/18083 đóng từ Internet; thiết bị ngoài LAN chỉ dùng `wss://…/mqtt` qua HTTPS | Phụ thuộc triển khai; Compose gốc publish 1883 và 18083 ra mọi interface |

Test tự động ở mức hook nằm trong [`backend/tests/test_edge_activation.py`](../backend/tests/test_edge_activation.py) (nhóm `test_mqtt_auth*`). Chúng gọi thẳng API, **không** đi qua EMQX; CI ([`backend-ci.yml`](../.github/workflows/backend-ci.yml)) chạy EMQX với `EMQX_ALLOW_ANONYMOUS=true`, nên M1, M4, M5, M8, M10 chỉ được chứng minh bằng chạy tay trên broker thật.

**Khoảng trống bảo mật đã biết (đọc mã, chưa khai thác thử):**

- **G1 — đăng nhập không cần password (ĐÃ SỬA).** Trước đây `mqtt_auth` trả `allow` cho yêu cầu không có password và không có topic. Nay yêu cầu authn (không có `topic`) bắt buộc phải có device token, chỉ yêu cầu authz mới được thiếu password (`backend/app/api/v1/edge.py::mqtt_auth`). Đã xác nhận trên EMQX thật: kết nối không password bị từ chối (CONNACK 135).
- **G2 — không cách ly site/gate trong cùng tenant.** Một device được publish lên `tenants/<A>/sites/*/gates/*/command` (giả lệnh cho cổng khác của cùng tenant) và subscribe `tenants/<A>/#`. Bridge `handle_telemetry` tin `site_id`/`gate_id` lấy từ topic.
- **G3 — revoke không ngắt phiên MQTT đang mở.** `revoke_device_token` chỉ đổi trạng thái credential; không gọi API EMQX để kick client. Pub/sub sau đó bị deny khi authz chạy lại (sau khi cache authz của EMQX hết hạn), nhưng kết nối vẫn còn.
- **G4 — không có TLS ở broker và không có mTLS.** Kết nối qua `1883` gửi token `pk_` dạng rõ; token này cũng là API key REST.
- **G5 — dev hook là credential oracle.** Với `ENVIRONMENT=development` và không có `MQTT_HOOK_SECRET`, `/api/v1/edge/mqtt-auth` trả allow/deny cho bất kỳ ai gọi tới API.

### 8.2. Thanh toán: tiêu chí đạt trước khi dùng tiền thật

**Thuật ngữ thống nhất** (thay cho “webhook/query” ở §3 và “callback” ở §7 — chỉ có MoMo; nguồn: [`payment_service.py`](../backend/app/services/payment_service.py), [`gateways.py`](../backend/app/services/payments/gateways.py), [`public.py`](../backend/app/api/v1/public.py) `momo_ipn`, [`jobs.py`](../backend/app/workers/jobs.py) `reconcile_pending_payments`):

| Thuật ngữ | Là gì | Có xác nhận thanh toán không |
|-----------|-------|------------------------------|
| **IPN** (= “webhook” = “callback” trong tài liệu cũ) | MoMo POST server-to-server tới `POST /api/v1/public/payments/momo/ipn` (URL = `PAYMENT_IPN_BASE_URL` hoặc `APP_BASE_URL` + đường dẫn trên, `_ipn_url`). `handle_momo_ipn` kiểm HMAC-SHA256 (`MomoGateway.verify_signature`) rồi khóa hàng `driver_payments` | **Có** — đường chính |
| **Query** (pull) | `_refresh_from_gateway` → `MomoGateway.query_status` (`POST {MOMO_ENDPOINT}/query`). Chạy khi driver gọi `GET /driver/payments/{id}` và khi cron `reconcile_pending_payments` (mỗi 5 phút, payment `created` + `momo` cũ hơn 10 phút, tối đa 100) | **Có** — đường phục hồi khi IPN mất. Trạng thái `paid` qua query **không có `transId`** |
| **Redirect** (`PAYMENT_REDIRECT_URL`, mặc định `parkvision://payments/return`) | Trình duyệt/app quay về sau khi trả tiền; backend không có handler | **Không** — không bao giờ dùng làm bằng chứng |

**Nguồn sự thật:** cột `driver_payments.status`. Hàng chuyển `created → paid|failed` bởi IPN hoặc query, bên nào tới trước dưới `SELECT … FOR UPDATE`; `paid`/`failed`/`cancelled`/`expired`/`refunded` là terminal, IPN tới sau trả `{"resultCode":0,"message":"already processed"}` và không đổi gì. `method=wallet` không qua cổng: debit + `paid` trong một transaction.

**Tiêu chí đạt** (MoMo sandbox, `PAYMENT_PROVIDER=momo`; ghi lại `payment.id` và kiểm DB bằng role có quyền đọc):

| ID | Kịch bản | Kết quả bắt buộc |
|----|----------|------------------|
| P1 | `PAYMENT_PROVIDER=none` hoặc thiếu một trong `MOMO_PARTNER_CODE`/`MOMO_ACCESS_KEY`/`MOMO_SECRET_KEY`, tạo payment `method=momo` | HTTP 503 `payments_not_configured`; không có hàng `driver_payments` mới |
| P2 | Tạo payment và trả tiền trên sandbox, IPN URL public HTTPS | `status='paid'`, `paid_at` có giá trị, `provider_trans_id` = `transId` của MoMo; log API có `POST …/momo/ipn` 200 |
| P3 | Gửi lại IPN của P2 với `signature` sai | HTTP 400 `Invalid signature`; hàng không đổi (`test_ipn_bad_signature_400`) |
| P4 | **IPN trùng:** gửi lại nguyên payload IPN hợp lệ của P2 (≥ 2 lần, có thể song song) | Mỗi lần HTTP 200 `already processed`; side effect chỉ một lần: topup có đúng **1** dòng ledger `topup_credit` tham chiếu payment id; membership chỉ activate một lần |
| P5 | IPN với `resultCode≠0` | `status='failed'`, `raw_payload` lưu payload (`test_ipn_failed_marks_payment_failed`) |
| P6 | **Mất IPN:** đặt `PAYMENT_IPN_BASE_URL` sai trên sandbox, trả tiền, rồi gọi `GET /driver/payments/{id}` (hoặc chờ cron, ≥ 10 phút) | `status='paid'`, `raw_payload={"query":"paid"}`, `provider_trans_id` NULL |
| P7 | **Double submit:** gửi song song 2 request tạo payment cho cùng session/membership | Chỉ 1 hàng in-flight; request sau nhận lại cùng `id` (`test_concurrent_session_payments_create_single_row`, `test_duplicate_in_flight_returns_existing`) |
| P8 | Hủy payment đã `paid` | HTTP 409, `status` vẫn `paid` (`test_cancel_waits_for_row_lock_and_cannot_overwrite_paid`) |
| P9 | **Refund** payment `paid` có `provider_trans_id` (`refund_payment`, tenant operator) | MoMo `/refund` `resultCode=0`; `status='refunded'`, `refunded_at` có giá trị; hoàn **toàn bộ** số tiền (không có partial); membership `active` → `revoked` và whitelist bị suspend, `pending` → `rejected`. Refund lần 2 → 409 `Payment is refunded, not paid`. Refund payment của P6 → 409 `Provider transaction id is unknown — refund via the MoMo console` (hành vi đúng hiện tại) |
| P10 | Payment `method=wallet` refund 2 lần song song | Đúng 1 dòng `refund_credit` (`test_concurrent_wallet_refund_credits_once`) |
| P11 | **Paid-exit, edge online:** xe có session payment `paid` đi ra trong `PAID_EXIT_GRACE_MINUTES` (mặc định 15) | Backend ghi `access_events` `decision='allow'`, `reason='paid_exit'` và đóng dấu `driver_payments.exit_granted_at` (`event_service.record_access_event`, gọi từ `mqtt_bridge.handle_telemetry`). **Barrier không tự mở:** edge quyết định cục bộ (`pipeline.rs` `run_pipeline` → `access::decide_access`), không biết payment, và backend không phát lệnh mở. Đạt = nhân viên thấy sự kiện `paid_exit` và mở bằng lệnh cổng. Xem D-PAY-3 |

Test liên quan: [`test_payments_api.py`](../backend/tests/test_payments_api.py), [`test_phase4_payments.py`](../backend/tests/test_phase4_payments.py) — dùng gateway giả, không gọi MoMo thật.

**Khoảng trống đã biết (đọc mã):**

- **PG1 — tiền về sau khi payment đã `expired`/`cancelled` bị bỏ qua.** `_expire_stale` chuyển `created` → `expired` sau `PAYMENT_TTL_MINUTES` (mặc định 30); cron query chỉ xét `created`. IPN thành công tới sau đó trả `already processed`, không lưu payload, không có cờ cho đối soát.
- **PG2 — không đối chiếu số tiền.** `handle_momo_ipn` không so `amount` với `amount_vnd`; `query_status` coi `resultCode=0` là paid, không kiểm chữ ký/amount của response.
- **PG3 — payment `paid` qua query không refund được qua API** (thiếu `transId`), phải refund trên MoMo console.
- **PG4 — đã thu tiền nhưng activate membership lỗi** chỉ được gắn cờ (`raw_payload.activation_error`, `admin_note`); không tự refund.
- **PG5 — lỗi mạng/HTTP khi gọi MoMo `/refund`** (`MomoGateway.refund` dùng `raise_for_status`, `refund_payment` chỉ bắt `MomoRejected`): request lỗi, hàng vẫn `paid`, trong khi MoMo có thể đã hoàn tiền — phải đối soát với console.
- **PG6 — paid-exit không tới edge**, cả online (P11) lẫn offline (GAP-PAY-002).

### 8.3. Quyết định sản phẩm còn mở

- ~~D-MQTT-1 (G1)~~ — đã sửa trong mã, không còn là quyết định mở.
- `[Decision needed]` **D-MQTT-2 — độ hạt ACL (G2):** (a) giữ prefix tenant, chấp nhận mọi device trong tenant tin nhau; (b) theo device: chỉ `tenants/{t}/sites/{s}/gates/{g}/…` của gate gắn với device, publish `telemetry`/`incident`, subscribe `command`; (c) như (b) cộng `cameras/{c}/detection` của camera gắn với device.
- `[Decision needed]` **D-MQTT-3 — transport:** (a) TLS một chiều kết thúc ở reverse proxy, chỉ `wss://…/mqtt`, đóng 1883 khỏi Internet; (b) listener TLS 8883 trên EMQX với cert server; (c) mTLS cert riêng mỗi device (cần PKI và hỗ trợ client cert trong edge — hiện chưa có).
- `[Decision needed]` **D-MQTT-4 — revoke (G3):** (a) chấp nhận phiên còn mở tới khi authz deny; (b) API gọi REST EMQX kick client khi revoke/decommission.
- `[Decision needed]` **D-PAY-1 — tiền về muộn (PG1):** (a) chấp nhận IPN thành công cho payment `expired`/`cancelled` và áp dụng side effect; (b) lưu payload + tự refund; (c) lưu payload + cờ đối soát để refund tay.
- `[Decision needed]` **D-PAY-2 — đối chiếu amount (PG2):** (a) từ chối/gắn cờ khi `amount` của IPN/query khác `amount_vnd`; (b) tin chữ ký MoMo, không kiểm.
- `[Decision needed]` **D-PAY-3 — paid-exit tới barrier (P11, PG6):** (a) backend phát lệnh `open` tới cổng ra khi ghi `paid_exit`; (b) đồng bộ payment grant xuống SQLite edge (cũng giảm GAP-PAY-002); (c) giữ quy trình nhân viên mở tay và ghi vào SOP.
- `[Decision needed]` **D-PAY-4 — refund payment không có `transId` (PG3):** (a) lưu `transId` từ response `/query`; (b) giữ quy trình refund trên console.
- `[Decision needed]` **D-PAY-5 — activate lỗi sau khi thu tiền (PG4):** (a) tự refund; (b) nhân viên xử lý theo cờ trong thời hạn cam kết.

Tài liệu không khẳng định hệ thống đã production-ready hoặc đã được security audit. Các giới hạn cụ thể được ghi tại từng tài liệu thành phần.
