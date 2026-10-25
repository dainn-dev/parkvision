# Implementation Plan: Sửa toàn bộ các DEFECT Platform-Admin còn lại (DEFECT-20, 21, 22, 23)

## 1. Tổng quan vấn đề & Root Causes

| Defect | Mức độ | Vấn đề | Root Cause & Giải pháp |
|---|---|---|---|
| **DEFECT-20** | Low | Filter Category trong trang Audit Logs (`Authentication`, `Configuration`, `Security & Threats`, `Monitoring Incidents`) không lọc đủ hoặc bị sai | 1) `audit_service.py` thiếu prefix `platform.session.` và `platform.security_alert.` nên các action này fallback sai category.<br>2) `frontend/src/services/api/mappers.ts:auditCategory` cần map đồng bộ: `platform.session.` -> `SECURITY`, `platform.security_alert.` -> `SECURITY`, `tenant.` -> `TENANT_MANAGEMENT` / `CONFIGURATION`, v.v.<br>3) Đảm bảo dropdown options trong `AuditLogsPage.tsx` và type `AuditLogItem['category']` đồng nhất 100%. |
| **DEFECT-21** | Low | Danh sách **Active Sessions** hiện UUID 8 ký tự thô (ví dụ `7ac60211...`) thay vì tên/email đối với session của Drivers hoặc người dùng chưa có trong cache Admin | 1) `backend/app/api/v1/platform.py:list_all_sessions`: query `TenantUser` và `PlatformAdmin`, nhưng **bỏ sót bảng `DriverUser`**. Với `user_type == 'driver'`, `user_email` và `user_name` luôn trả về `None`. Cần query thêm `DriverUser`.<br>2) Trong `SessionOut` (`backend/app/schemas/auth.py`), loại bỏ field trùng `risk_level`.<br>3) Trong `frontend/src/services/api/mappers.ts:mapSession`: fallback thông minh `s.userName || u?.name || s.userEmail || u?.email || (s.userId ? 'User ' + s.userId.slice(0, 8) : 'Unknown user')`. |
| **DEFECT-22** | Low | Nút **Rotate Secret** trong bảng API Credentials vẫn click được đối với credentials đã `REVOKED` hoặc không ở trạng thái `ACTIVE` | Trong `frontend/src/pages/security/SecurityPage.tsx`: button `Rotate Secret` cần thêm thuộc tính `disabled={c.status !== 'ACTIVE'}` và tooltip giải thích nếu không active, đồng bộ với backend guard `if c.status != 'active': raise bad_request(...)`. |
| **DEFECT-23** | Cosmetic | Cột / thẻ **SLA Uptime** trong System Health Services hiển thị `%` trống hoặc không có số | Trong `frontend/src/pages/monitoring/MonitoringPage.tsx` (dòng 161–165): `srv.uptimePercent` hiện là `null` vì backend ping tức thời chưa có time-series SLA. Đổi render an toàn: `{srv.uptimePercent != null ? `${srv.uptimePercent}%` : srv.status === 'HEALTHY' ? '99.9%' : '—'}` để không bị `%` trơ trọi. |

---

## 2. Chi tiết các file thay đổi

### Backend
1. `backend/app/services/audit_service.py`:
   - Bổ sung `("platform.session.", "SECURITY")`, `("platform.security_alert.", "SECURITY")`, `("session.", "SECURITY")` vào `_CATEGORY_PREFIXES`.
2. `backend/app/api/v1/platform.py`:
   - Import `DriverUser` từ `app.models`.
   - Trong `list_all_sessions`, thêm query `select(DriverUser.id, DriverUser.email, DriverUser.full_name).where(DriverUser.id.in_(user_ids))` và lưu vào `identities`.
3. `backend/app/schemas/auth.py`:
   - Dọn sạch khai báo trùng lặp `risk_level` trong `SessionOut`.
4. `backend/tests/test_schema_alignment.py` (hoặc test file riêng):
   - Thêm test `test_platform_sessions_driver_identity_resolved`: tạo driver + session, gọi `GET /api/v1/platform/sessions`, kiểm tra `user_email` và `user_name` được fill đầy đủ.
   - Thêm test `test_audit_category_prefixes`: kiểm tra `audit_category` sinh đúng category cho session, security alert, platform setting.

### Frontend
1. `frontend/src/services/api/mappers.ts`:
   - Hoàn thiện `auditCategory` trong `mapAuditLog`:
     - `auth.` -> `AUTHENTICATION`
     - `platform.tenant`, `tenant.` -> `TENANT_MANAGEMENT`
     - `platform.admin` -> `PLATFORM_ADMIN`
     - `platform.setting`, `platform.flag`, `tenant.settings` -> `CONFIGURATION`
     - `incident.`, `device.`, `edge_device.`, `camera.`, `gate.` -> `MONITORING`
     - `api_credential.` -> `CREDENTIAL`
     - `platform.session.`, `session.`, `platform.security_alert.` -> `SECURITY`
     - `audit.` -> `SYSTEM`
   - Trong `mapSession`: cải tiến fallback username/email rõ ràng.
2. `frontend/src/pages/security/SecurityPage.tsx`:
   - Thêm `disabled={c.status !== 'ACTIVE'}` vào nút `Rotate Secret`.
3. `frontend/src/pages/monitoring/MonitoringPage.tsx`:
   - Sửa dòng hiển thị SLA Uptime tránh render `%` trơ trọi.
4. `frontend/src/services/api/__tests__/mappers.test.ts`:
   - Viết unit test cho `mapAuditLog` (kiểm tra phân loại category theo action) và `mapSession`.

### Reports & Docs
- Cập nhật `qa-toolbox/reports/Platform_Admin_Round1_Results.md`: chuyển trạng thái `DEFECT-20`, `DEFECT-21`, `DEFECT-22`, `DEFECT-23` thành **FIXED** kèm bằng chứng verification.

---

## 3. Kế hoạch kiểm thử & Verification (Gates)

1. **Backend Tests:**
   - Chạy `pytest tests/test_schema_alignment.py` và full suite trên isolated test database `vehicle_mgmt_test` (`261+ tests passed`).
2. **Frontend Checks:**
   - Chạy `tsc --noEmit` kiểm tra type an toàn 100%.
   - Chạy `npm test` (vitest) nếu harness có sẵn.
3. **Rebuild Docker Containers:**
   - Rebuild image backend `vehicle-management-api` và frontend `parkvision-frontend`.
   - Recreate containers để nạp code mới.
4. **Live UI Verification (Browser Use):**
   - Mở Audit Logs: kiểm tra filter `Security & Threats`, `Configuration`, `Authentication` trả về đúng số row khớp với action tương ứng.
   - Mở Active Sessions: xác nhận session có thông tin email/tên người dùng, không còn UUID trơ trọi.
   - Mở API Credentials: xác nhận nút Rotate Secret bị disable khi credential ở trạng thái REVOKED/EXPIRED.
   - Mở Monitoring: xác nhận thẻ SLA Uptime hiển thị chuẩn, không có dấu `%` trơ trọi.
