# ParkVision — Backend

Backend FastAPI của hệ thống ANPR quản lý bãi xe đa tenant: quản trị bãi/cổng/camera, danh sách xe được phép, sự kiện vào/ra, vị trí xe, tài khoản tài xế, gói gửi xe và thanh toán. Backend nhận kết quả nhận diện từ edge/ANPR qua MQTT; **không chạy mô hình OCR và không trực tiếp điều khiển relay barrier**.

Tài liệu này dành cho khởi động và phát triển backend. Xem [tài liệu backend chi tiết](../docs/backend.md) để tra kiến trúc, quyền, API, luồng nghiệp vụ và giới hạn triển khai.

## Thành phần

- Python `>=3.10`; image Docker dùng Python 3.12.
- FastAPI, Uvicorn, Pydantic 2; SQLAlchemy 2 async + asyncpg; PostgreSQL 16 và Alembic.
- Redis 7: rate limit, hàng đợi arq, danh sách lệnh MQTT và pub/sub WebSocket.
- EMQX 5: broker MQTT; tiến trình `mqtt-bridge` ghi dữ liệu vào PostgreSQL và phát realtime.
- S3-compatible: URL PUT/GET ký sẵn cho ảnh và CSV; Compose dùng LocalStack, không phải MinIO.
- arq worker: email, import xe, export audit và cron bảo trì; Mailpit nhận SMTP khi phát triển.
- Argon2, JWT access token, refresh token xoay vòng; dashboard dùng cookie/CSRF, tài xế dùng Bearer token, edge dùng `X-Api-Key`.

Nguồn phiên bản và cấu hình: [`pyproject.toml`](pyproject.toml), [`Dockerfile`](Dockerfile), [`app/config.py`](app/config.py), [`docker-compose.yml`](docker-compose.yml).

## Chạy bằng Docker Compose

Thực hiện trong thư mục `backend/`, với Docker Engine và Docker Compose đang hoạt động:

```sh
cp .env.example .env
# Kiểm tra/sửa .env theo hướng dẫn bên dưới trước khi chạy.
docker compose up -d --build
docker compose exec api python -m scripts.seed
```

PowerShell có thể dùng `Copy-Item .env.example .env` thay cho `cp`.

**Không mặc định cho rằng một `.env` dùng chung được cho cả Docker và host.** Các biến trong [`app/config.py`](app/config.py) mặc định trỏ `localhost`; trong container phải trỏ tới tên service:

- `DATABASE_URL`: `postgresql+asyncpg://vehicle_app:vehicle_app@postgres:5432/vehicle_mgmt` cho môi trường dev mặc định.
- `MIGRATION_DATABASE_URL`: `postgresql+asyncpg://postgres:postgres@postgres:5432/vehicle_mgmt` cho migration/seed dev.
- `REDIS_URL=redis://redis:6379/0`, `MQTT_HOST=emqx`, `SMTP_HOST=mailpit`.
- `MQTT_PUBLIC_HOST`: địa chỉ MQTT mà thiết bị edge bên ngoài mạng Docker kết nối tới (LAN/public). Để trống sẽ dùng `MQTT_HOST` — chỉ phân giải được trong Compose network, nên cần đặt biến này khi triển khai thiết bị thật.
- `S3_ENDPOINT_URL`: phải là địa chỉ S3 mà bên sử dụng URL ký sẵn cũng truy cập được; xem phần [S3 và mạng](../docs/backend.md#s3-và-địa-chỉ-truy-cập) trước khi triển khai qua container/trình duyệt.

Compose có các tiến trình `api`, `worker`, `mqtt-bridge`, và `migrate` chạy `alembic upgrade head` rồi thoát. API/worker/bridge chờ migration hoàn tất. Tệp Compose hiện còn có service `omniroute`; đó không phải thành phần bắt buộc của luồng ANPR/thanh toán được mô tả ở đây. Không cần sửa Compose để làm theo tài liệu này.

Các cổng host trong cấu hình hiện tại:

- API: `http://localhost:8000`; Swagger `/docs`, OpenAPI `/openapi.json`.
- PostgreSQL `5432`, Redis `6379`.
- MQTT `1883`, EMQX dashboard `http://localhost:18083`.
- LocalStack S3 `http://localhost:9000` (container LocalStack nghe `4566`).
- SMTP Mailpit `1025`, giao diện `http://localhost:8025`.

Kiểm tra và xem log:

```sh
docker compose ps
docker compose logs --since 10m api worker mqtt-bridge migrate
curl http://localhost:8000/healthz
curl http://localhost:8000/readyz
```

`/healthz` chỉ báo tiến trình sống. `/readyz` kiểm tra PostgreSQL và Redis, nhưng vẫn trả HTTP 200 khi `status` là `degraded`; không dùng riêng mã HTTP để kết luận sẵn sàng.

### Dữ liệu mẫu

[`scripts/seed.py`](scripts/seed.py) dùng `MIGRATION_DATABASE_URL`, tạo admin, tenant `demo`, owner, site `HQ Garage`, edge, gate và xe mẫu nếu chưa có:

- Platform admin mặc định: `admin@example.com` / `ChangeMe!123`; có thể đổi bằng `SEED_PLATFORM_ADMIN_EMAIL`, `SEED_PLATFORM_ADMIN_PASSWORD`.
- Tenant owner demo: `owner@demo.example.com` / `DemoOwner!123`.

Chỉ dùng các tài khoản/mật khẩu này ở môi trường phát triển. Seed không tạo đầy đủ camera, bản đồ, biểu phí hay tài khoản MoMo. Chạy seed lại không đồng nghĩa cập nhật mật khẩu tài khoản đã tồn tại.

## Phát triển trên host

Chạy PostgreSQL/Redis và các dịch vụ tích hợp cần thiết; có thể dùng các service hạ tầng của Compose:

```sh
docker compose up -d postgres redis emqx s3 mailpit
python -m venv .venv
```

Cài và chạy từ `backend/`:

```sh
# Linux/macOS; Windows dùng .venv/Scripts/python.exe tương ứng.
.venv/bin/python -m pip install -e ".[dev]"
.venv/bin/python -m alembic upgrade head
.venv/bin/python -m scripts.seed
.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

Nếu không dùng Docker cho tiến trình ứng dụng, mở terminal riêng cho (Windows dùng `.venv/Scripts/arq.exe` và `.venv/Scripts/python.exe`):

```sh
.venv/bin/arq app.workers.worker.WorkerSettings
.venv/bin/python -m app.realtime.mqtt_bridge
```

Trong `.env` của tiến trình host, đổi DB/Redis/MQTT/S3/SMTP sang địa chỉ host (`localhost` với cổng công bố bên trên). `Settings` đọc `.env` theo thư mục làm việc; luôn chạy từ `backend/`. Trên Windows, MQTT cần event loop hỗ trợ `add_reader`/`add_writer`; harness realtime/test đã cài Selector policy, còn entrypoint bridge hiện không tự cài policy này. Có thể chạy bridge trong container Linux.

## Hợp đồng API cần biết

- REST mặc định nằm dưới `/api/v1` (`API_V1_PREFIX`); tenant resource dưới `/api/v1/tenants/{tenant_id}`. Public không đồng nghĩa mọi route bắt đầu bằng `/public`: có `/plans`, `/legal/{doc_type}`, `/register`, `/tenants/check-code`.
- Dashboard: `POST /api/v1/auth/login`; request ghi dùng cookie cần `X-CSRF-Token` khớp `vm_csrf`. `vm_access`, `vm_refresh` là HttpOnly; cờ Secure theo `COOKIE_SECURE`, mặc định **false** khi dev.
- Driver: `/api/v1/driver/auth/*` trả token trong JSON; dùng `Authorization: Bearer ...`. Không gửi kèm cookie dashboard khi đổi loại tài khoản vì dependency chung ưu tiên cookie hơn Bearer.
- Edge: `/api/v1/edge/*`; activation code một lần, sau đó `X-Api-Key` có scope `edge:ingest`/`edge:config`.
- JSON schema dùng camelCase. Không có envelope thành công thống nhất: có object trực tiếp, mảng và `Page` dạng `{data, meta: {page, limit, total}}`; lỗi ứng dụng/validation theo `{error: {code, message, details}, requestId}`.
- Gửi lệnh bằng `POST /api/v1/tenants/{tenant_id}/gates/{gate_id}/commands`, body có `command`, `idempotencyKey`, `payload` tùy chọn. HTTP **202 không chứng minh barrier đã chuyển động**; xem command status/ACK.
- WebSocket không nằm dưới `/api/v1`: `/ws/tenants/{tenant_id}/barrier-telemetry` và `/ws/driver/sessions`.

## Kiểm thử

**Cảnh báo:** fixture integration trong [`tests/conftest.py`](tests/conftest.py) tạo DB test nếu cần, rồi `DROP SCHEMA public CASCADE` và migrate lại. Guard hậu tố `_test` kiểm tra URL migration; phải trỏ **cả hai URL DB** tới cùng một DB test riêng, không dùng DB dev/production. **Dùng PostgreSQL instance riêng cho test**, không chỉ database tên khác: migration đầu có thể `ALTER ROLE vehicle_app ... PASSWORD` ở cấp cluster, lấy `APP_DB_PASSWORD` từ môi trường tiến trình hoặc mặc định `vehicle_app`, làm đổi mật khẩu runtime của ứng dụng khác dùng chung cluster. Fixture cũng xóa Redis key `mqtt:outbox`; dùng Redis riêng, không chạy chung bridge đang phục vụ thật.

Ví dụ POSIX, chạy từ `backend/` sau khi cài dependency dev; các cổng localhost dưới đây phải thuộc **PostgreSQL/Redis test cách ly**, không phải stack dev đang sử dụng:

```sh
DATABASE_URL=postgresql+asyncpg://vehicle_app:vehicle_app@localhost:5432/vehicle_mgmt_test \
MIGRATION_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/vehicle_mgmt_test \
REDIS_URL=redis://localhost:6379/1 MQTT_HOST=localhost RATE_LIMIT_ENABLED=false \
.venv/bin/python -m pytest
```

Trên Windows dùng interpreter `.venv/Scripts/python.exe` và cú pháp đặt biến môi trường của shell đang dùng. Các test phí thuần nằm ở `tests/test_pricing.py`, nhưng fixture autouse của suite vẫn yêu cầu hạ tầng DB/Redis.

Kiểm tra mã nguồn riêng:

```sh
.venv/bin/python -m ruff check app tests scripts
```

Harness E2E cần API + worker + bridge + EMQX + Mailpit đang chạy và đã seed. Đặt `RATE_LIMIT_ENABLED=false` cho **tiến trình API thử nghiệm**; host dùng `MQTT_HOST=localhost`:

```sh
.venv/bin/python tests/e2e/e2e_api.py
.venv/bin/python tests/e2e/e2e_realtime.py
```

E2E dùng cố định `localhost:8000`, `localhost:1883`, `localhost:8025`, tài khoản demo và tạo thêm dữ liệu; không chạy trên production. Test thanh toán dùng fake gateway, không xác nhận MoMo thật hoạt động. Tài liệu này không khẳng định các lệnh kiểm thử đã chạy hoặc đã pass.

## Cấu trúc và tài liệu liên quan

```text
app/main.py          Khởi tạo API, middleware, health, metrics
app/config.py        Settings và giá trị mặc định
app/api/deps.py      JWT/session, RBAC, tenant matching, CSRF
app/api/v1/          Public, auth, driver, platform, edge, tenant, WS
app/models.py        ORM; migrations mới là nguồn DDL/RLS/constraint
app/schemas/         Schema request/response
app/services/        Nghiệp vụ access, parking, pricing, membership, payment, wallet
app/realtime/        MQTT bridge
app/workers/         arq jobs và cron
migrations/          Alembic, RLS, partition, constraint, seed tham chiếu
scripts/seed.py      Dữ liệu demo
tests/               Integration và harness E2E
```

- [Backend chi tiết](../docs/backend.md): quyền, prefix API, flow, env, vận hành, giới hạn.
- [MQTT camera detection](../docs/mqtt-camera-detection.md).
- [Thiết lập barrier relay phía edge](../docs/barrier-relay-setup.md).
- [Runbook backup/restore](../docs/RUNBOOK_BACKUP_RESTORE.md).
