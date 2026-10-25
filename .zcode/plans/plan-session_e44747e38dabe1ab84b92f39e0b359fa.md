Sửa trọn 5 defect platform-admin đã phát hiện (DEFECT-15…19), thêm regression tests và kiểm tra UI sau sửa. Chưa có thay đổi code nào được áp dụng trong giai đoạn lập kế hoạch.

1. **Tenant list/detail stats (DEFECT-15)**
   - Mở rộng `TenantOut` bằng cấu trúc thống kê và admin primary có kiểu rõ ràng; không dùng các key JSON `settings.stats` chưa được ghi.
   - Tính counts thật cho users, vehicles, cameras, gates, edge devices; dùng storage hiện tại từ tenant. Chọn implementation aggregate theo batch/grouped query để tránh N+1 trong danh sách tenant; `GET /tenants/{id}` dùng cùng logic.
   - Lấy owner/admin từ tenant users và trả thông tin admin thật. Cập nhật API schema TypeScript, mapper, tenant list columns, Tenant Detail summary cards và tab badge; badge Enrolled Users dùng số liệu fetch được thật.

2. **Tenant Audit Activity cho platform admin (DEFECT-16)**
   - Giữ nguyên giới hạn owner/admin cho tenant users, nhưng cho platform admins quyền đọc audit log của tenant được chỉ định, phù hợp với `tenant_match` bypass hiện có. Không mở quyền ghi hay thay đổi role cho các endpoint khác.
   - Thêm regression tests: platform admin đọc được log tenant; tenant owner/admin đọc được; tenant viewer vẫn bị chặn; kiểm tra tenant/path isolation.
   - Rà cách `loadTenantData` hiện xử lý lỗi để không hiện toast 403 giả cho request hợp lệ sau khi sửa.

3. **Feature Flag metadata (DEFECT-17)**
   - Expose `updated_at` từ model hiện có qua `FeatureFlagOut`; thêm nullable `updated_by_email` bằng migration mới để lưu actor cho những cập nhật từ nay trở đi.
   - Khi tạo/cập nhật flag, resolve email admin đã xác thực, ghi email vào flag và cùng identity vào audit event. Với flag cũ chưa có actor, UI hiển thị nhãn “System”/“Not recorded”, không render `Invalid Date` hay chuỗi rỗng.
   - Cập nhật OpenAPI/TypeScript schema, mapper và UI timestamp/actor. Test list flag, update flag, timestamp tăng và actor được trả về.

4. **Platform-wide Edge Devices/Cameras fleet (DEFECT-18)**
   - Thêm endpoint platform-admin-only để lấy fleet tổng hợp qua mọi tenant, gồm dữ liệu cần cho bảng edge device và camera/stream. Tạo response type có tenant/site labels; không lấy tenant-scoped state từ `loadTenantData` làm nguồn cho trang platform.
   - Thêm state/loader riêng trong `PlatformContext` cho fleet platform-wide; giữ nguyên `edgeDevices`/`cameras` tenant-scoped để tránh làm hỏng portal tenant. Nạp khi platform workspace hoạt động và refresh theo cơ chế hiện có.
   - Kiểm tra UI tab, badges, empty/loading/error states; test endpoint RBAC, tenant labels, counts và dữ liệu nhiều tenant.

5. **Email trong platform audit logs (DEFECT-19)**
   - Tạo một cách resolve danh tính actor thống nhất từ authenticated platform-admin ID (ưu tiên query admin trong transaction hoặc helper hiện có; không dựa vào claim chưa được xác minh).
   - Dùng cho setting update, feature-flag update và các call site platform khác đang ghi `actor_email=None`. Với lịch sử cũ không có email, UI giữ fallback sang actor UUID.
   - Thêm test xác minh các action mới lưu `actor_email` và GET audit logs trả email thay vì UUID.

6. **Xác minh và báo cáo**
   - Chạy test backend mục tiêu trước, sau đó full backend pytest với role tách biệt đúng chuẩn (`DATABASE_URL=vehicle_app@…_test`, `MIGRATION_DATABASE_URL=postgres@…_test`).
   - Chạy frontend typecheck/build; rebuild local Docker stack, đăng nhập platform admin và kiểm tra tenant list/detail, audit tab, feature flags, edge/camera fleet và audit actor.
   - Cập nhật `Platform_Admin_Round1_Results.md` và defect backlog: DEFECT-15…19 được đánh dấu fixed chỉ sau khi kiểm tra tương ứng PASS.

Các phần có migration/schema/API và nhiều trang frontend; implementation sẽ theo thứ tự backend contract + tests, frontend wiring, rồi end-to-end verification. Không thay đổi status tenant, revoke sessions/admins hay để lại giá trị test ngoài baseline.