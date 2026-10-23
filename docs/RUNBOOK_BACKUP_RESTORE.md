# Runbook sao lưu và khôi phục ParkVision

Phạm vi: PostgreSQL, object S3, secret/cấu hình và dữ liệu local edge. Thực hiện lệnh Compose từ `backend/`. Mục tiêu là khôi phục được dữ liệu nghiệp vụ **cùng** ảnh/object tương ứng, không chỉ có một file dump.

**Các lệnh dưới đây dành cho môi trường dev hoặc buổi diễn tập đã cách ly.** Trước production phải xác nhận DB, bucket, Compose project và maintenance window. Không chạy test integration để “kiểm tra restore”: fixture có thể drop schema.

## 1. Dữ liệu cần bảo vệ

- **PostgreSQL:** tenant, user/session, cấu hình site/gate/camera, access events, membership, payment/ledger, audit, partition và Alembic revision.
- **S3:** ảnh event, ảnh nền/snapshot và các object khác mà DB lưu key. Compose gọi service này là **`s3`**, không phải `localstack`; volume là `s3data`.
- **Secret/cấu hình:** khóa Fernet `FIELD_ENCRYPTION_KEY`, khóa JWT nếu cần giữ token tương thích, DB credentials, MQTT credentials/ACL, S3 keys và payment secrets. Lưu trong secret manager hoặc backup mã hóa tách quyền.
- **Edge:** `edge-config.json` với wiring `gates[].barrier`, SQLite `edge.db`, dữ liệu lock nếu cần, ảnh/captures, ANPR runtime config và queue local. File có thể chứa API key hoặc mật khẩu thiết bị.
- **Model:** ghi rõ phiên bản/hash và vị trí artifact detector/OCR để tái triển khai. Không xem artifact model là một phần PostgreSQL dump.

Redis Compose hiện không có volume khai báo. Queue/job/outbox và realtime không tự được khôi phục chỉ từ dump DB; phải có kế hoạch đối soát command/job/payment sau sự cố. Workspace còn có volume `omniroute-data` cho service bổ sung, ngoài phạm vi dữ liệu ParkVision được mô tả ở đây.

### Cảnh báo LocalStack

Compose chỉ mount `/var/lib/localstack`, **không khai báo `PERSISTENCE=1`**. Không được giả định có volume `s3data` là bucket/object chắc chắn sống qua restart. Tar thư mục volume không đủ chứng minh backup S3 có thể restore. Dùng backup object qua API S3 khi service còn chạy và diễn tập khôi phục. Với production, chọn object store có durability/versioning/backup được quản lý rõ ràng.

## 2. Chuẩn bị backup

1. Chọn backup ID riêng và thư mục mới. Ví dụ dưới dùng `backups/backup-set`; **không tái sử dụng** thư mục đã có vì có thể trộn nhiều thời điểm backup.
2. Ghi lại commit/build, Alembic revision, thời gian bắt đầu/kết thúc, tên DB/bucket, số lượng object và checksum của artifact.
3. Đặt maintenance mode ở ingress, dừng nguồn ghi/ingest và chờ request đang xử lý hoàn tất; tạm dừng các edge theo quy trình hiện trường. Đặc biệt URL S3 đã ký có thể vẫn upload trực tiếp dù API đã dừng.
4. Dừng tiến trình ghi backend; giữ PostgreSQL, Redis và S3 hoạt động để xuất dữ liệu:

```sh
docker compose stop api worker mqtt-bridge
mkdir -p backups
mkdir backups/backup-set
```

Nếu `mkdir backups/backup-set` báo đã tồn tại, chọn ID/thư mục khác trước khi tiếp tục. Các lệnh shell minh họa dùng POSIX; PowerShell có `New-Item -ItemType Directory` tương ứng.

DB dump là snapshot nhất quán của PostgreSQL; nó **không** tự tạo snapshot phân tán với S3. Quiesce nguồn ghi trong suốt hai bước backup là điều kiện để các object reference và ảnh phù hợp.

## 3. Sao lưu PostgreSQL

Xuất vào file trong container rồi copy ra host để tránh vấn đề redirect binary ở một số phiên bản PowerShell:

```sh
docker compose exec -T postgres pg_dump -U postgres -Fc -f /tmp/parkvision-backup.dump vehicle_mgmt
docker compose cp postgres:/tmp/parkvision-backup.dump backups/backup-set/database.dump

docker compose exec -T postgres pg_dumpall -U postgres --roles-only -f /tmp/parkvision-roles.sql
docker compose cp postgres:/tmp/parkvision-roles.sql backups/backup-set/roles.sql

docker compose exec -T postgres pg_restore --list /tmp/parkvision-backup.dump
```

Chỉ tiếp tục nếu từng lệnh thành công. `pg_restore --list` chỉ kiểm tra archive đọc được, chưa chứng minh restore thành công.

- `pg_dump` gồm schema/data/partition trong DB, **không gồm cluster roles**; vì vậy cần xử lý roles riêng khi khôi phục sang cluster mới.
- `roles.sql` có thể chứa password hash của **mọi role trong cluster**, không chỉ `vehicle_app`; bảo vệ như secret và review trước khi dùng.
- PostgreSQL trong Compose dùng credential dev. Nếu đã đổi DB/user, điều chỉnh command đúng môi trường.
- Không copy trực tiếp thư mục `pgdata` khi PostgreSQL đang ghi. Physical backup cần quy trình snapshot/basebackup/WAL riêng.
- Xóa file tạm trong container theo chính sách bảo mật sau khi kiểm tra và chuyển backup tới nơi an toàn.

## 4. Sao lưu object S3 qua API

Máy thực hiện cần **AWS CLI** được cài riêng; đây không phải dependency ứng dụng được repo cài tự động. Ví dụ cho Compose LocalStack mặc định, chạy trên host có endpoint `http://localhost:9000`:

Lệnh POSIX với credential **chỉ dành cho LocalStack dev**:

```sh
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_DEFAULT_REGION=us-east-1 aws --endpoint-url http://localhost:9000 s3 sync s3://vehicle-events backups/backup-set/s3/ --no-follow-symlinks
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_DEFAULT_REGION=us-east-1 aws --endpoint-url http://localhost:9000 s3 ls s3://vehicle-events --recursive --summarize
```

Với PowerShell, đặt `$env:AWS_ACCESS_KEY_ID`, `$env:AWS_SECRET_ACCESS_KEY`, `$env:AWS_DEFAULT_REGION` theo cú pháp PowerShell hoặc dùng AWS profile rồi gọi `aws`. Không đưa secret thật vào lịch sử shell; production dùng profile/role có quyền tối thiểu và endpoint/bucket đúng môi trường.

Ghi lại số lượng/bytes và kiểm tra checksum theo chính sách backup. `aws s3 sync` xuống filesystem giữ key tương đối và bytes, **không phải backup đầy đủ** version history, ACL, bucket policy, CORS, tags hoặc metadata từng object như `ContentType`. Key ứng dụng có thể không có đuôi file; khi upload lại, không dựa vào MIME guessing để phục hồi metadata chính xác. Production cần lưu manifest metadata/cấu hình bucket hoặc dùng cơ chế replication/versioned backup của object store.

Nếu key có ký tự không biểu diễn được trên filesystem Windows, chọn công cụ backup S3 hỗ trợ mapping/manifest hoặc chạy trên môi trường phù hợp; không bỏ qua object lỗi.

Sau khi DB và S3 backup thành công, lưu secret backup theo quyền riêng, tạo checksum, chuyển bản sao off-host. Mở lại ứng dụng:

```sh
docker compose up -d api worker mqtt-bridge
```

Chỉ bỏ maintenance mode/khôi phục nguồn ingest khi health và smoke test đạt. Ví dụ retention vận hành đề xuất: bản ngày 14 ngày, bản tuần 12 tuần; đây là chính sách đề xuất, chưa có job repo tự thực hiện backup này.

## 5. Diễn tập restore vào đích mới

### 5.1. Nguyên tắc

- Dùng Compose project/host cách ly; không kết nối edge thật, không gửi email/Telegram/webhook/MoMo production.
- Giữ API, worker và bridge đích dừng cho tới khi đối soát xong. Cron retention có thể xóa partition/ảnh cũ ngay sau khi khởi động worker.
- Khôi phục cùng phiên bản schema/code trước; chạy migration nâng phiên bản **sau** khi đã restore thành công.
- Chỉ restore vào DB/bucket mới. Không dùng `dropdb`, `docker compose down -v` hoặc `--delete` như bước mặc định của runbook.

### 5.2. PostgreSQL

Trên cluster đích mới, tạo các role cần thiết từ `roles.sql` **đã review** hoặc qua quy trình provisioning DB. Không chạy nguyên file role dump lên cluster có sẵn một cách mù quáng: role `postgres`/role khác có thể đã tồn tại và có quyền/mật khẩu khác. `vehicle_app` phải là runtime role chịu RLS; grants/ownership từ dump yêu cầu role tương ứng tồn tại.

Ví dụ khôi phục vào DB mới `vehicle_mgmt_restore`:

```sh
docker compose up -d postgres redis
docker compose cp backups/backup-set/database.dump postgres:/tmp/parkvision-restore.dump
docker compose exec -T postgres createdb -U postgres vehicle_mgmt_restore
docker compose exec -T postgres pg_restore -U postgres --exit-on-error -d vehicle_mgmt_restore /tmp/parkvision-restore.dump
```

Nếu DB đã tồn tại hoặc bất kỳ bước nào lỗi, dừng và điều tra; không tự xóa DB để chạy tiếp. Sau restore, cấu hình **cả** `DATABASE_URL` và `MIGRATION_DATABASE_URL` của môi trường đích tới `vehicle_mgmt_restore`, với runtime/migration role riêng.

Full custom-format dump mang theo partition DDL/data; không cần tạo lại thủ công mọi partition trước khi full restore. Khôi phục chọn lọc partition hoặc dùng data-only archive là quy trình khác, cần kiểm tra parent, bound, constraint và Alembic revision riêng.

### 5.3. S3

Giữ S3 đích đang hoạt động. Với LocalStack dev trên host, tạo bucket mới để không ghi đè bucket nguồn:

```sh
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_DEFAULT_REGION=us-east-1 aws --endpoint-url http://localhost:9000 s3 mb s3://vehicle-events-restore
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_DEFAULT_REGION=us-east-1 aws --endpoint-url http://localhost:9000 s3 sync backups/backup-set/s3/ s3://vehicle-events-restore --no-follow-symlinks
```

Đặt `S3_BUCKET=vehicle-events-restore` ở môi trường đích. Giữ nguyên object key; DB lưu key, không phải URL presigned lâu dài. Áp lại metadata/policy/CORS từ manifest hoặc cấu hình đã backup. URL presigned cũ hết hạn là bình thường; app phải tạo URL mới.

## 6. Kiểm chứng sau restore

Trong môi trường cách ly:

```sh
docker compose exec -T postgres psql -U postgres -d vehicle_mgmt_restore -c "SELECT version_num FROM alembic_version;"
docker compose exec -T postgres psql -U postgres -d vehicle_mgmt_restore -c "SELECT count(*) FROM access_events;"
```

So sánh thêm tenant/user/payment/ledger/partition và số lượng object với manifest backup. Count đúng chưa đủ chứng minh toàn vẹn dữ liệu.

Sau khi cập nhật URL DB, bucket và secret đúng môi trường đích, xác nhận PostgreSQL/Redis đã chạy từ bước 5.2, S3 đích đã sẵn sàng và `REDIS_URL` trỏ Redis cách ly. Bật API trước, **chưa bật migration/worker/bridge**:

```sh
docker compose up -d --no-deps api
curl http://localhost:8000/healthz
curl http://localhost:8000/readyz
```

`/readyz` vẫn trả HTTP 200 khi degraded; kiểm tra body. Nếu đích publish port khác, dùng đúng port đích. Đăng nhập, thử đọc đúng tenant qua runtime role, mở ảnh/ảnh nền, kiểm tra `ContentType`, ownership và MFA giải mã được bằng khóa Fernet đã backup.

Sau đó kiểm tra có kiểm soát job/cron, command timeout, trạng thái edge, membership/payment và pending operations trước khi bật worker/bridge. Không replay command mở cổng hay payment request cũ một cách tự động chỉ vì đã restore DB. Ghi nhận RPO/RTO đo thực tế và lỗi cần sửa; file dump tồn tại chưa phải bằng chứng DR thành công.

## 7. Sao lưu và khôi phục edge

- Dừng runtime/ứng dụng edge và ANPR trước khi copy SQLite/config/queue; nếu không dừng, dùng SQLite backup API có xử lý WAL, không copy riêng `.db` đang ghi.
- Xác định đường dẫn data thực từ [edge docs](edge-client.md), không đoán thư mục cài đặt là nơi chứa dữ liệu.
- Backup wiring theo `gateId`, credential, queue và ảnh phù hợp cùng thời điểm. Giới hạn quyền đọc và mã hóa bản sao.
- Backend config refresh giữ barrier local cho UUID cũ, nhưng **deprovision xóa config**; không dùng deprovision như thao tác backup/reset an toàn.
- Khôi phục sang máy mới hoặc tenant mới cần quy trình identity/activation riêng. Không clone API key của thiết bị đang chạy song song.
- Khi phục hồi queue, đánh giá trùng event/idempotency và tuổi dữ liệu; runtime dedup không bảo đảm exactly-once qua restart.
- Probe relay/input và nghiệm thu từng cổng trước khi bật auto-open. Không dùng event/command lịch sử để thử barrier trên làn đang phục vụ.

## Nguồn đối chiếu

- [Compose](../backend/docker-compose.yml): service, volume, dependency và cấu hình LocalStack.
- [Settings](../backend/app/config.py), [S3 client](../backend/app/services/storage.py).
- [Alembic env](../backend/migrations/env.py), [migration ban đầu](../backend/migrations/versions/0001_initial_schema.py): role và schema.
- [Worker lịch cron](../backend/app/workers/worker.py), [retention jobs](../backend/app/workers/jobs.py).
- [Edge chi tiết](edge-client.md), [ANPR chi tiết](anpr-worker.md).

Runbook này chưa phải bằng chứng restore đã được diễn tập; cần chạy và lưu kết quả trên môi trường đích trước khi dùng làm cam kết vận hành.
