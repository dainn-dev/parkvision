# Tài liệu ParkVision

Điểm bắt đầu: [README dự án](../README.md). Bộ tài liệu này mô tả implementation trong checkout được rà soát, bằng tiếng Việt; không xem tài liệu thiết kế, comment TODO hoặc tên dependency là bằng chứng tính năng đã hoàn tất.

## Theo đối tượng đọc

### Người mới và lập trình viên

1. [README dự án](../README.md): thành phần, kiến trúc và chạy nhanh.
2. [Phát triển và vận hành](development-and-operations.md): mạng host/container, biến môi trường, quy trình test và CI.
3. README theo module: [backend](../backend/README.md), [dashboard](../frontend/README.md), [mobile](../mobile/README.md), [edge](../edge-client/README.md), [ANPR](../anpr-worker/README.md).

### Người phát triển nghiệp vụ và tích hợp

- [Backend](backend.md): tiến trình, schema API, auth/session/MFA, tenant/RLS, route groups, rule/access, parking, membership, pricing, payment, wallet, jobs và vận hành.
- [Web apps](web-apps.md): dashboard platform/tenant và mobile driver; điều hướng, state, quyền, HTTP, realtime, phần cục bộ/demo và giới hạn.
- [Edge](edge-client.md): native commands, config v3, activate/revoke, FSM, cache/access, MQTT, offline queue, relay và bảo vệ secret.
- [ANPR](anpr-worker.md): xử lý frame, motion gate, detection/tracking/OCR, cấu hình, model, HTTP/JSONL, retry và đóng gói.
- [MQTT monitor-camera](mqtt-camera-detection.md): topic, payload, zone resolution, snapshot và fan-out vị trí xe.

### Kỹ thuật viên và người vận hành

- [Phát triển và vận hành](development-and-operations.md): khởi động, triển khai web, health, log, mạng và kiểm tra trước triển khai.
- [Thiết lập relay barrier](barrier-relay-setup.md): các backend relay, wiring/preset, input/output, probe và QA phần cứng. Tài liệu chuyên biệt được giữ lại; đối chiếu schema và hành vi hiện tại trong [edge docs](edge-client.md).
- [Backup/restore](RUNBOOK_BACKUP_RESTORE.md): backup phối hợp PostgreSQL/S3, restore an toàn, khóa mã hóa và dữ liệu local edge.

## Nguồn sự thật khi có khác biệt

1. **Mã nguồn và migration của checkout đang chạy** quyết định hành vi, constraint và quyền thực tế.
2. **OpenAPI của API đang chạy** (`/openapi.json`, `/docs`) quyết định schema HTTP của phiên bản được triển khai; không bao phủ toàn bộ MQTT/IPC và các điều kiện nghiệp vụ trong service.
3. **Test và cấu hình build/deploy** là bằng chứng hợp đồng được kiểm tra hoặc cách đóng gói; việc tồn tại test không có nghĩa test đang pass ở mọi môi trường.
4. **Bộ docs hiện tại** tổng hợp và dẫn tới nguồn liên quan. Cần cập nhật docs khi đổi hành vi/schema.
5. **`superpowers/specs/`, `superpowers/plans/` và `SPEC_ANALYSIS_AND_PLAN.md` ở gốc** là tài liệu thiết kế/lịch sử, có thể chứa chức năng dự kiến hoặc hành vi cũ; không phải cam kết production.

## Giới hạn đã ghi nhận

- Python ANPR và Rust sidecar ingest có chênh lệch giao thức/config cần xử lý trước khi nghiệm thu end-to-end.
- Mobile là web SPA, chưa có bằng chứng build native hay push notification hoàn chỉnh.
- Một số thao tác security/anomaly trên dashboard chỉ có hiệu ứng cục bộ; xem mục giới hạn web apps.
- MQTT QoS, HTTP ACK và hàng đợi không bảo đảm exactly-once hay trạng thái phần cứng thực.
- Thanh toán cần gateway và callback thực; fake gateway trong tests không chứng minh MoMo production.
- Các bước có camera, relay, installer, Docker/GPU và restore phải được thử trên môi trường mục tiêu. Không suy ra đã kiểm chứng chỉ vì tài liệu có câu lệnh.

## Quy ước cập nhật tài liệu

- Dẫn đường tới file nguồn thay vì sao chép nguyên implementation hoặc toàn bộ OpenAPI.
- Giữ tên biến môi trường, endpoint, topic, state và JSON field đúng với source; giải thích bằng tiếng Việt.
- Phân biệt rõ “đã nối API”, “chỉ lưu local”, “chưa nối runtime” và “đã chạy kiểm chứng”.
- Không đưa secret thật, dữ liệu cá nhân, API key hoặc RTSP URL chứa mật khẩu thật vào ví dụ.
- Không sửa bản thiết kế lịch sử để giả vờ đó là mô tả implementation mới; thêm/cập nhật docs vận hành tương ứng.
