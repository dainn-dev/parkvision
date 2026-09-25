# TÀI LIỆU TOÀN DIỆN KIẾN TRÚC HỆ THỐNG, THIẾT KẾ CƠ SỞ DỮ LIỆU, ĐẶC TẢ API & STATE MACHINE
## Hệ Thống Quản Lý Ra Vào Thông Minh Qua Biển Số Xe (ANPR & Barrier Access Control Multi-Tenant SaaS)

---

## MỤC LỤC
1. [TỔNG QUAN KIẾN TRÚC HỆ THỐNG (SYSTEM ARCHITECTURE)](#1-tổng-quan-kiến-trúc-hệ-thống-system-architecture)
2. [PHÂN TÍCH TOÀN BỘ 25 MÀN HÌNH & MODAL (SCREEN & UI STATE ANALYSIS)](#2-phân-tích-toàn-bộ-25-màn-hình--modal-screen--ui-state-analysis)
   - [2.1. Phân hệ Public, Marketing & Authentication (6 màn hình)](#21-phân-hệ-public-marketing--authentication-6-màn-hình)
   - [2.2. Phân hệ Platform Governance - Super Admin (10 màn hình & modal)](#22-phân-hệ-platform-governance---super-admin-10-màn-hình--modal)
   - [2.3. Phân hệ Tenant Portal - Site Operations (9 màn hình)](#23-phân-hệ-tenant-portal---site-operations-9-màn-hình)
3. [THIẾT KẾ CƠ SỞ DỮ LIỆU TOÀN DIỆN (DATABASE SCHEMA & DDL SCRIPT)](#3-thiết-kế-cơ-sở-dữ-liệu-toàn-diện-database-schema--ddl-script)
   - [3.1. Sơ đồ Thực thể Quan hệ (ERD Diagram)](#31-sơ-đồ-thực-thể-quan-hệ-erd-diagram)
   - [3.2. Data Dictionary Chi Tiết](#32-data-dictionary-chi-tiết)
   - [3.3. DDL Script (PostgreSQL 16 Production Ready)](#33-ddl-script-postgresql-16-production-ready)
4. [ĐẶC TẢ HỆ THỐNG API (RESTFUL API SPECIFICATION)](#4-đặc-tả-hệ-thống-api-restful-api-specification)
   - [4.1. Authentication & Session APIs](#41-authentication--session-apis)
   - [4.2. Platform Governance APIs](#42-platform-governance-apis)
   - [4.3. Tenant Sites & Barrier Hardware Control APIs](#43-tenant-sites--barrier-hardware-control-apis)
   - [4.4. Access Events & ANPR History APIs](#44-access-events--anpr-history-apis)
   - [4.5. Vehicle Registry & Policy Rules APIs](#45-vehicle-registry--policy-rules-apis)
5. [GIAO THỨC TRUYỀN THÔNG REAL-TIME (MQTT & WEBSOCKET PROTOCOL)](#5-giao-thức-truyền-thông-real-time-mqtt--websocket-protocol)
   - [5.1. MQTT Topics giữa Edge AI Gateway và Backend](#51-mqtt-topics-giữa-edge-ai-gateway-và-backend)
   - [5.2. WebSocket Stream tới Web Client Dashboard](#52-websocket-stream-tới-web-client-dashboard)
6. [STATE MACHINE VÀ ĐẶC TẢ HÀNH VI NGHIỆP VỤ (BEHAVIOR & EDGE CASES)](#6-state-machine-và-đặc-tả-hành-vi-nghiệp-vụ-behavior--edge-cases)
   - [6.1. State Machine của Barrier Servo & Rơ-le](#61-state-machine-của-barrier-servo--rơ-le)
   - [6.2. Phát hiện & Xử lý Kẹt cần cơ học (Stuck Detection & Remediation)](#62-phát-hiện--xử-lý-kẹt-cần-cơ-học-stuck-detection--remediation)
   - [6.3. Phát hiện Mất kết nối Telemetry (Offline Heartbeat & Re-linking)](#63-phát-hiện-mất-kết-nối-telemetry-offline-heartbeat--re-linking)
   - [6.4. Pipeline Xử lý Phương tiện Qua làn (Ingress/Egress Flow)](#64-pipeline-xử-lý-phương-tiện-qua-làn-ingressegress-flow)
7. [CHIẾN LƯỢC TỐI ƯU VẬN HÀNH & BẢO MẬT (PERFORMANCE & SECURITY)](#7-chiến-lược-tối-ưu-vận-hành--bảo-mật-performance--security)
   - [7.1. Row-Level Security (RLS)](#71-row-level-security-rls)
   - [7.2. Partitioning Chiến lược cho Bảng Sự Kiện & Telemetry](#72-partitioning-chiến-lược-cho-bảng-sự-kiện--telemetry)
   - [7.3. Đánh Index Tối ưu Tốc độ Tra cứu Biển số ANPR](#73-đánh-index-tối-ưu-tốc-độ-tra-cứu-biển-số-anpr)

---

# 1. TỔNG QUAN KIẾN TRÚC HỆ THỐNG (SYSTEM ARCHITECTURE)

Hệ thống được thiết kế theo mô hình **B2B Multi-Tenant SaaS** chuyên dụng cho các tổ chức, khu công nghiệp, tòa nhà văn phòng, khu đô thị thông minh và trung tâm logistics nhằm tự động hóa quy trình kiểm soát barrier bằng công nghệ nhận dạng biển số xe (ANPR - Automatic Number Plate Recognition).

Hệ thống phân tách thành 3 phân hệ hoàn chỉnh:
- **Public & Onboarding**: Dành cho khách hàng vãng lai, đăng ký Tenant, đăng nhập, các trang chính sách SLA.
- **Platform Governance**: Dành cho đơn vị cung cấp giải pháp SaaS quản lý khách hàng, giấy phép (licensing), cấu hình phần cứng hạ tầng, kiểm toán và bảo mật MFA.
- **Tenant Portal**: Dành cho khách hàng doanh nghiệp, ban quản lý tòa nhà, bộ phận an ninh điều hành trực tiếp các cơ sở, làn xe và cần barrier.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                CLIENT APPLICATION LAYER                                │
│                                (React 19 + TypeScript)                                 │
├──────────────────────────┬─────────────────────────────┬───────────────────────────────┤
│    1. Public & Auth      │   2. Platform Governance    │       3. Tenant Portal        │
│ • Landing & Calculators  │ • Tenant Accounts & Quotas  │ • D3 Vector Map & Real-time   │
│ • Login & Register Form  │ • Global Edge Monitoring    │ • Gate Actuation (Open/Lock)  │
│ • Terms & SLA Policies   │ • Audit Logs & MFA Security │ • ANPR Ingress/Egress Events  │
│ • Interactive Simulator  │ • Feature Flags & Rollouts  │ • Rules Engine & Whitelist    │
└────────────┬─────────────┴──────────────┬──────────────┴───────────────▲───────────────┘
             │ HTTP/2 REST                │ HTTP/2 REST                  │ WebSocket (WSS)
             ▼                            ▼                              │ Telemetry / Toasts
┌────────────────────────────────────────────────────────────────────────┴───────────────┐
│                        API GATEWAY / APPLICATION SERVER                                │
│                     (Node.js / Express / Go Backend Service)                           │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ • Authentication & MFA Service (JWT + TOTP Otplib)                                     │
│ • Tenant Context & Multi-Tenant RLS Injector                                           │
│ • Deterministic Policy Rules Engine (Allow/Deny Evaluation)                            │
│ • Hardware Command Actuator (Remote Open / Reset Relay / Emergency Lock)               │
│ • Incident & Alert Notification Dispatcher (Web Audio, Toasts, Webhooks)               │
└────────────────────────────┬───────────────────────────────────────────▲───────────────┘
                             │ SQL Queries / Timeseries                  │ MQTT Subscribe
                             ▼                                           │ (Telemetry / Events)
┌──────────────────────────────────────────────┐        ┌────────────────┴───────────────┐
│       POSTGRESQL 16 ENTERPRISE DB            │        │       MQTT BROKER (EMQX)       │
│ • Multi-Tenant Schema with RLS Policies      │        │ • Topics: sites/gates/telemetry│
│ • Partitioned access_events (Monthly/Quarter)│        │ • QoS 1 Hardware Keep-Alive    │
│ • Partitioned gate_telemetry_logs            │        └────────────────▲───────────────┘
└──────────────────────────────────────────────┘                         │
                                                                         │ MQTT Telemetry
                                                        ┌────────────────┴───────────────┐
                                                        │      EDGE AI IOT GATEWAY       │
                                                        │  (NVIDIA Jetson / RK3588 PLC)  │
                                                        ├────────────────────────────────┤
                                                        │ • ANPR OCR Inference (YOLOv8)  │
                                                        │ • Loop Coil Sensor Trigger     │
                                                        │ • Barrier Servo Motor Relay    │
                                                        │ • Offline Whitelist Local Cache│
                                                        └────────────────────────────────┘
```

---

# 2. PHÂN TÍCH TOÀN BỘ 25 MÀN HÌNH & MODAL (SCREEN & UI STATE ANALYSIS)

---

## 2.1. Phân hệ Public, Marketing & Authentication (6 màn hình)

### 1. `LandingPage.tsx` — Cổng thông tin giải pháp & Máy tính giá cước
* **Mục tiêu**: Giới thiệu công nghệ ANPR Barrier, các chỉ số benchmark độ chính xác (99.8%) và tốc độ mở cần (0.6s), bảng giá cước tự động tính toán.
* **Các thành phần UI**:
  - Hero banner với CTA "Bắt đầu Dùng Thử" và "Trải nghiệm Simulator".
  - Feature Grid: Nhận diện ban đêm IR, Khả năng hoạt động Offline Edge Cache, Cảnh báo kẹt cần real-time.
  - Interactive Pricing Calculator: Slider chọn số lượng trạm (Sites) và số làn xe (Gates), tính ra chi phí hàng tháng/năm.
  - Pricing Plans: 3 gói `STARTER`, `BUSINESS`, `ENTERPRISE`.
* **State & Data**:
  - `selectedPlan`: Lưu lựa chọn của người dùng trước khi điều hướng sang trang đăng ký.
* **API Backend**:
  - `GET /api/v1/public/plans`: Lấy cấu hình gói dịch vụ và mức giá hiện hành.

---

### 2. `LoginPage.tsx` — Đăng nhập & Xác thực Đa tầng
* **Mục tiêu**: Đăng nhập người dùng hệ thống (cả Super Admin và Tenant User), tự động kích hoạt thử thách 2FA nếu tài khoản đã cấu hình MFA.
* **Các thành phần UI**:
  - Form nhập Email và Password với validation thời gian thực.
  - Checkbox "Ghi nhớ phiên làm việc trên thiết bị này".
  - Bước nhập mã OTP 6 số (chỉ xuất hiện khi tài khoản yêu cầu MFA).
* **State & Data**:
  - `isSubmitting`, `loginError`, `requiresMfaStep`, `tempToken`.
* **API Backend**:
  - `POST /api/v1/auth/login`:
    - Payload: `{ "email": "admin@example.com", "password": "SecretPassword123!" }`
    - Response (No MFA): `{ "token": "jwt_token", "refreshToken": "ref_token", "workspace": "tenant" }`
    - Response (MFA Required): `{ "requiresMfa": true, "tempToken": "jwt_temp_challenge" }`
  - `POST /api/v1/auth/mfa/verify`:
    - Payload: `{ "tempToken": "jwt_temp_challenge", "otp": "481920" }`

---

### 3. `RegisterPage.tsx` — Đăng ký Doanh nghiệp / Tenant Mới
* **Mục tiêu**: Khách hàng doanh nghiệp tự đăng ký tài khoản Tenant SaaS để nhận 14 ngày dùng thử miễn phí.
* **Các thành phần UI**:
  - Form Wizard:
    1. Thông tin Tổ chức: Tên doanh nghiệp, Mã định danh (`code`), Số điện thoại liên hệ.
    2. Thông tin Quản trị viên: Họ tên, Email quản trị, Mật khẩu quản trị.
    3. Gói cước đã chọn từ Landing Page (Starter/Business/Enterprise).
* **State & Data**:
  - Form state, `isCodeAvailable` (debounce kiểm tra tính duy nhất của mã định danh).
* **API Backend**:
  - `GET /api/v1/public/tenants/check-code?code=VIN-HOMES`: Kiểm tra trùng mã.
  - `POST /api/v1/public/tenants/register`:
    - Payload: `{ "organizationName": "Vinhomes Grand Park", "code": "VH-GP", "adminEmail": "it@vinhomes.vn", "adminPassword": "...", "planTier": "BUSINESS" }`
    - Response: `{ "tenantId": "t-002", "status": "TRIAL", "expiresAt": "2026-10-08T00:00:00Z" }`

---

### 4. `TermsOfServicePage.tsx` — Điều khoản Sử dụng Dịch vụ SaaS
* **Mục tiêu**: Công bố văn bản thỏa thuận cấp phép sử dụng phần mềm, trách nhiệm bảo mật thiết bị đầu cuối, điều khoản thanh toán định kỳ.
* **API Backend**:
  - `GET /api/v1/public/legal/terms`: Trả về nội dung HTML/Markdown bản mới nhất.

---

### 5. `PrivacyPolicyPage.tsx` — Chính sách Quyền riêng tư & Bảo vệ Dữ liệu Camera
* **Mục tiêu**: Tuân thủ Nghị định 13/2023/NĐ-CP và chuẩn GDPR về bảo vệ hình ảnh khuôn mặt và biển số xe của cư dân/khách vãng lai, quy trình mã hóa ảnh tại Edge.
* **API Backend**:
  - `GET /api/v1/public/legal/privacy`: Trả về quy định lưu trữ và tiêu hủy ảnh chụp.

---

### 6. `SlaPolicyPage.tsx` — Cam kết Chất lượng Dịch vụ (SLA 99.9%)
* **Mục tiêu**: Cam kết thời gian phản hồi API < 100ms, độ trễ tín hiệu nâng cần < 300ms, và thời hạn bồi thường nếu thời gian chết (downtime) vượt quá 43 phút/tháng.
* **API Backend**:
  - `GET /api/v1/public/legal/sla`: Chi tiết bảng mức độ xử lý sự cố P1/P2/P3.

---

## 2.2. Phân hệ Platform Governance - Super Admin (10 màn hình & modal)

### 7. `DashboardPage.tsx` — Trung tâm Chỉ huy Toàn cầu
* **Mục tiêu**: Cung cấp bức tranh toàn cảnh về sức khỏe nền tảng, tăng trưởng doanh thu thuê bao và lưu lượng quét xe toàn quốc.
* **Các thành phần UI**:
  - KPI Cards: Doanh thu MRR (`$182,450`), Tổng số Tenant đang hoạt động (`128`), Tổng số Barrier Gate kết nối (`1,420`), Uptime toàn mạng (`99.98%`).
  - Live Alert Banner: Cảnh báo khi có Tenant có tỷ lệ kẹt cần cao bất thường.
  - Biểu đồ lưu lượng quét OCR toàn quốc theo 24 giờ.
* **API Backend**:
  - `GET /api/v1/platform/metrics/overview`: Thống kê tổng hợp từ Redis.
  - `GET /api/v1/platform/metrics/throughput-chart?timeRange=24h`.

---

### 8. `TenantsListPage.tsx` — Quản trị Vòng đời Doanh nghiệp Khách hàng
* **Mục tiêu**: Theo dõi, lọc, tìm kiếm và thay đổi trạng thái hoạt động của các Tenant trên hệ thống.
* **Các thành phần UI**:
  - Bảng danh sách: Tên doanh nghiệp, Mã code, Gói cước (`BUSINESS`), Số trạm/làn, Dung lượng lưu trữ đã dùng / Hạn mức, Trạng thái (`ACTIVE`, `SUSPENDED`, `TRIAL`).
  - Nút chuyển nhanh trạng thái (Kích hoạt / Tạm ngưng) và nút truy cập hồ sơ chi tiết.
* **API Backend**:
  - `GET /api/v1/platform/tenants`: Query: `page, limit, search, status, tier`.
  - `PATCH /api/v1/platform/tenants/:id/status`: Đổi trạng thái (`ACTIVE`, `SUSPENDED`) kèm lý do kiểm toán.

---

### 9. `CreateTenantModal.tsx` — Modal Cấp phát Doanh nghiệp Mới
* **Mục tiêu**: Cho phép Super Admin tạo thủ công một tài khoản Tenant mới với các quota tùy chỉnh theo hợp đồng riêng (Custom SLA).
* **Các thành phần UI**:
  - Form nhập thông tin công ty, người đại diện, số điện thoại.
  - Cấu hình hạn mức: Số trạm tối đa (`maxSites`), Số cần tối đa (`maxGates`), Dung lượng ảnh S3 (`storageQuotaGb`).
* **API Backend**:
  - `POST /api/v1/platform/tenants`: Tạo Tenant và gửi email tự kích hoạt mật khẩu cho khách hàng.

---

### 10. `TenantDetailPage.tsx` — Hồ sơ Chi tiết Doanh nghiệp & Quota
* **Mục tiêu**: Xem chi tiết hợp đồng, danh sách trạm đỗ xe, cấu hình Add-on và tính năng mạo danh (Impersonation) hỗ trợ kỹ thuật.
* **Các thành phần UI**:
  - Tab 1: Tổng quan & Quota lưu trữ (Progress bar hiển thị % dung lượng S3 đã dùng).
  - Tab 2: Danh sách cơ sở trạm đỗ (`Sites`) và danh sách Edge Gateway trực thuộc.
  - Tab 3: Cấu hình gói dịch vụ và API Credentials.
  - Nút "Truy cập với tư cách Tenant" (Impersonate Tenant).
* **API Backend**:
  - `GET /api/v1/platform/tenants/:id`: Lấy đầy đủ thông tin quan hệ.
  - `PUT /api/v1/platform/tenants/:id/quotas`: Điều chỉnh hạn mức phần cứng và dung lượng.
  - `POST /api/v1/platform/tenants/:id/impersonate`: Sinh JWT ngắn hạn (15 phút) cấp quyền truy cập Tenant Portal.

---

### 11. `PlatformAdminsPage.tsx` — Quản trị Đội ngũ Super Admin
* **Mục tiêu**: Phân quyền nhân sự nội bộ vận hành nền tảng SaaS, kiểm soát chính sách bảo mật bắt buộc bật MFA.
* **Các thành phần UI**:
  - Danh sách admin: Họ tên, Email, Vai trò (`SUPER_ADMIN`, `SUPPORT`, `SECURITY`), Trạng thái MFA, Lần đăng nhập gần nhất.
  - Nút "Thêm Admin", "Khóa tài khoản", "Yêu cầu Reset MFA".
* **API Backend**:
  - `GET /api/v1/platform/admins`: Danh sách quản trị viên nền tảng.
  - `POST /api/v1/platform/admins`: Thêm admin mới.
  - `POST /api/v1/platform/admins/:id/reset-mfa`: Hủy secret MFA để admin cài đặt lại.

---

### 12. `MfaFlowModal.tsx` — Modal Thiết lập & Kiểm tra Bảo mật 2FA (TOTP)
* **Mục tiêu**: Hỗ trợ quy trình quét mã QR bằng ứng dụng Authenticator và kiểm tra mã OTP 6 số trước khi kích hoạt.
* **Các thành phần UI**:
  - Chế độ **Enroll**: Mã QR hiển thị chuỗi bí mật `otpauth://...`, mã khôi phục khẩn cấp (Backup codes).
  - Chế độ **Challenge**: Nhập 6 chữ số để xác thực trước các thao tác nhạy cảm (Xóa Tenant, Đổi cấu hình Global).
* **API Backend**:
  - `POST /api/v1/auth/mfa/generate`: Sinh Secret mới và trả về Data URI ảnh QR code.
  - `POST /api/v1/auth/mfa/enable`: Xác nhận mã hợp lệ và lưu `mfa_enabled = true`.

---

### 13. `PlatformSettingsPage.tsx` — Cấu hình Hệ thống Toàn cầu
* **Mục tiêu**: Điều chỉnh các tham số cốt lõi của toàn bộ nền tảng SaaS.
* **Các thành phần UI**:
  - 4 Phân khu:
    1. **Bảo mật & Phiên**: Thời gian hết hạn JWT, số lần đăng nhập sai tối đa trước khi khóa IP.
    2. **Lưu trữ & Dữ liệu**: Thời hạn lưu trữ ảnh biển số xe (Retention days, mặc định 90 ngày).
    3. **Cổng Thông báo**: Cấu hình SMTP Host, SendGrid API Key, Twilio SMS, Telegram Bot Token.
    4. **Giao thức IoT**: Thời gian timeout Heartbeat của Edge Gateway (15 giây).
* **API Backend**:
  - `GET /api/v1/platform/settings`: Lấy cấu hình JSON hiện tại.
  - `PUT /api/v1/platform/settings/:section`: Lưu thay đổi và publish event reload tới các microservice.

---

### 14. `FeatureFlagsPage.tsx` — Quản trị Công tắc Tính năng (Feature Toggles)
* **Mục tiêu**: Bật/tắt các module tính năng mới hoặc triển khai thử nghiệm (Canary/Beta rollout).
* **Các thành phần UI**:
  - Danh sách flags: `ANPR_V2_TRANSFORMER_MODEL`, `D3_VECTOR_RADAR_PULSE`, `AUTO_REBOOT_RELAY_ON_STUCK`, `EXPORT_REPORT_EXCEL`.
  - Công tắc Toggle (Bật / Tắt), phạm vi áp dụng (Toàn mạng, Beta list, hoặc Tenant cụ thể).
* **API Backend**:
  - `GET /api/v1/platform/feature-flags`: Danh sách flags.
  - `PATCH /api/v1/platform/feature-flags/:id/toggle`: Đổi trạng thái bật/tắt.

---

### 15. `MonitoringPage.tsx` — Bảng Giám sát Sức khỏe Hạ tầng 4 Tầng
* **Mục tiêu**: Giám sát tình trạng vận hành từ tầng Cloud Microservices đến tầng thiết bị biên Edge Gateway, Camera và Servo Motor.
* **Các thành phần UI**:
  - Tab **Services**: Trạng thái API Server, PostgreSQL Primary/Replica, Redis Cache, EMQX MQTT Broker.
  - Tab **Edge Devices**: Mức tải CPU, nhiệt độ chip AI Jetson Orin, tỷ lệ RAM sử dụng, độ trễ ping mạng.
  - Tab **Cameras**: Luồng video RTSP, FPS trung bình, tỷ lệ rớt khung hình (dropped frames).
  - Tab **Gates**: Tình trạng rơ-le, chu kỳ quay trong ngày, nhiệt độ motor servo.
* **API Backend**:
  - `GET /api/v1/platform/monitoring/telemetry-snapshot`: Trả về dữ liệu giám sát tức thời.
  - `POST /api/v1/platform/monitoring/edge-devices/:id/reboot`: Gửi lệnh khởi động lại thiết bị từ xa.

---

### 16. `SecurityPage.tsx` — Trung tâm Giám sát Phiên truy cập & Rủi ro IP
* **Mục tiêu**: Theo dõi các phiên đăng nhập đang hoạt động, phát hiện truy cập bất thường từ IP lạ, quản lý thu hồi khóa API.
* **Các thành phần UI**:
  - Bảng Active Sessions: Người dùng, Loại tài khoản, Địa chỉ IP, Trình duyệt, Vị trí địa lý, Mức rủi ro (`NORMAL`, `SUSPICIOUS`).
  - Nút "Ngắt phiên từ xa" (Kill Session) và "Thu hồi tất cả phiên".
  - Danh mục API Keys: Cấp mới, Xoay vòng khóa (Rotate Secret), Vô hiệu hóa khóa bị lộ.
* **API Backend**:
  - `GET /api/v1/security/sessions`: Danh sách phiên đang online.
  - `DELETE /api/v1/security/sessions/:sessionId`: Đóng phiên từ xa.
  - `POST /api/v1/security/credentials/:id/rotate`: Cấp secret mới, duy trì secret cũ thêm 24 giờ.

---

### 17. `AuditLogsPage.tsx` — Nhật ký Kiểm toán Toàn hệ thống Bất biến
* **Mục tiêu**: Tra cứu bằng chứng pháp lý đối với mọi hành vi thay đổi dữ liệu hoặc điều khiển phần cứng trên toàn hệ thống.
* **Các thành phần UI**:
  - Bảng Audit Log: Thời gian, Người thực hiện (Actor), Phân loại (`MONITORING`, `SECURITY`, `BARRIER_CONTROL`, `TENANTS`), Hành vi (`GATE_EMERGENCY_LOCK`, `BARRIER_REBOOT_RELAY`, `CREDENTIAL_ROTATE`), Tài nguyên tác động, IP, User Agent.
  - Bộ lọc đa tiêu chí và nút xuất file Excel/CSV báo cáo thanh tra.
* **API Backend**:
  - `GET /api/v1/audit/logs`: Query: `actorId, category, dateFrom, dateTo, search, page`.
  - `GET /api/v1/audit/logs/export-csv`: Tải file CSV xuất dữ liệu kiểm toán.

---

## 2.3. Phân hệ Tenant Portal - Site Operations (9 màn hình)

---

### 18. `TenantDashboardPage.tsx` — Trung tâm Điều hành Bãi xe của Tenant
* **Mục tiêu**: Cung cấp cho Ban quản lý trạm các chỉ số vận hành tức thời và cảnh báo an ninh tại cơ sở.
* **Các thành phần UI**:
  - Chỉ số KPI: Số lượt xe vào/ra hôm nay, Tỷ lệ lấp đầy bãi xe (Occupancy), Số sự cố kẹt cần đang diễn ra.
  - Biểu đồ lưu lượng phương tiện theo từng khung giờ trong ngày (Peak Hour Detection).
  - Danh sách 5 phương tiện vừa qua làn gần nhất kèm ảnh thumbnail biển số.
* **API Backend**:
  - `GET /api/v1/tenants/:tenantId/dashboard/summary`: Trả về dữ liệu KPI tổng hợp.
  - `GET /api/v1/tenants/:tenantId/dashboard/hourly-flow`: Dữ liệu biểu đồ lưu lượng 24h.

---

### 19. `BarrierMapVisualization.tsx` — Bản đồ Vector D3.js & Trung tâm Điều khiển Barrier
* **Mục tiêu**: Trực quan hóa vị trí địa lý của các cơ sở bãi xe trên bản đồ vector D3.js, theo dõi trạng thái cần barrier theo thời gian thực, phát hiện sự cố kẹt cần và mất kết nối, điều khiển nâng/hạ/khóa khẩn cấp.
* **Các thành phần UI**:
  1. **Top Metrics Ribbon**: Tổng số cơ sở, Tổng số barrier gates, Số cổng đang mở, Độ trễ Edge Gateway, Số sự cố kẹt cần (`tabular-nums`).
  2. **Bản đồ Tương tác D3.js**: Tọa độ các trạm trên nền bản đồ Việt Nam; nốt xanh (hoạt động tốt), nốt đỏ nhấp nháy hiệu ứng radar ping (`animate-ping`) khi có cần bị kẹt, nốt vàng viền nét đứt khi trạm offline.
  3. **Bố cục Lưới Trực quan (Grid View)**: Thẻ chi tiết từng trạm, mô phỏng sơ đồ cơ cấu tay cần với góc mở hiện tại (0° đến 90°), trạng thái cảm biến vòng từ ("CÓ XE" / "TRỐNG").
  4. **Hệ thống Toast Cảnh báo Nổi (Floating Toast Stack)**: Tự động bật lên góc trên bên phải khi phát hiện cần kẹt hoặc mất kết nối, kèm thanh đếm ngược thời gian và nút xử lý nhanh ngay trên Toast.
  5. **Bộ Tổng Hợp Âm Thanh Cảnh Báo (Web Audio Chime)**: Phát chuông cảnh báo âm tần kép dồn dập khi kẹt cơ học và âm đơn khi rớt mạng (kèm nút Bật/Tắt chuông).
  6. **Drawer Quản lý & Khắc phục Sự cố (Incidents & Alert Resolution Center)**: Danh sách chi tiết các sự cố đang diễn ra, nút "Reset Rơ-le", "Nâng Cưỡng Bức", "Re-link Heartbeat", và nút "Khắc Phục Tất Cả".
  7. **Modal Chẩn đoán Phần cứng Từng Cần**: Xem góc cần, nhiệt độ cuộn dây motor servo, điện áp UPS dự phòng, ảnh xe quét gần nhất.
* **API & Giao thức Realtime**:
  - `GET /api/v1/tenants/:tenantId/sites-gates`: Lấy dữ liệu cấu trúc ban đầu của các trạm và cổng.
  - `WS /ws/tenants/:tenantId/barrier-telemetry`: Luồng WebSocket nhận sự kiện thay đổi góc mở, kẹt cần và mất kết nối.
  - `POST /api/v1/gates/:gateId/control`: Gửi lệnh điều khiển `{ "action": "OPEN" | "CLOSE" | "LOCK" | "UNLOCK" }`.
  - `POST /api/v1/gates/:gateId/remediate`: Khắc phục sự cố `{ "strategy": "REBOOT_RELAY" | "FORCE_OPEN" | "RE_LINK_HEARTBEAT" }`.
  - `POST /api/v1/incidents/bulk-resolve`: Khắc phục đồng loạt tất cả sự cố đang có.

---

### 20. `TenantEventsPage.tsx` — Nhật ký Sự kiện Xe Qua Làn & Bằng chứng ANPR
* **Mục tiêu**: Tra cứu lịch sử xe ra vào, xem ảnh bằng chứng camera chụp, kiểm tra độ tin cậy AI và đối soát khi có tranh chấp phí gửi xe.
* **Các thành phần UI**:
  - Bảng sự kiện: Thời gian chính xác (ms), Biển số xe, Ảnh thu nhỏ biển số, Loại xe phát hiện, Độ chính xác OCR (98.5%), Làn xe, Hướng (Vào/Ra), Quyết định (Cho phép / Từ chối).
  - Modal xem ảnh full HD: Ảnh cắt cận cảnh biển số (Plate Crop) và ảnh chụp toàn cảnh chiếc xe và tài xế (Overview Shot).
  - Chức năng chỉnh sửa biển số thủ công (Manual Plate Correction) nếu camera đọc nhầm do biển dính bùn đất.
* **API Backend**:
  - `GET /api/v1/tenants/:tenantId/access-events`: Query: `plate, direction, siteId, result, dateFrom, dateTo, page`.
  - `PATCH /api/v1/tenants/:tenantId/access-events/:id/correct-plate`:
    - Payload: `{ "correctedPlate": "51H-982.11", "reason": "Biển số dính bùn đất, AI đọc nhầm số 1 thành chữ I" }`

---

### 21. `TenantVehiclesPage.tsx` — Quản trị Danh mục Phương tiện Đăng ký
* **Mục tiêu**: Quản lý danh sách phương tiện nội bộ (cư dân, cán bộ công nhân viên), thẻ vé tháng, khách VIP và danh sách phương tiện bị cấm (Blacklist).
* **Các thành phần UI**:
  - Bảng phương tiện: Biển số xe, Loại xe, Hãng/Màu sắc, Tên chủ xe, Số điện thoại, Căn hộ/Phòng ban, Mã thẻ từ RFID, Hạn sử dụng thẻ, Trạng thái truy cập (`ALLOWED`, `DENIED`, `EXPIRED`).
  - Nút thêm xe mới, sửa thông tin, gia hạn thời gian vé tháng.
  - Công cụ Import danh sách phương tiện từ file Excel/CSV và nút Export dữ liệu.
* **API Backend**:
  - `GET /api/v1/tenants/:tenantId/vehicles`: Lấy danh sách phương tiện kèm tìm kiếm và phân trang.
  - `POST /api/v1/tenants/:tenantId/vehicles`: Thêm xe mới vào Whitelist.
  - `PUT /api/v1/tenants/:tenantId/vehicles/:id`: Cập nhật thông tin chủ xe và hạn sử dụng.
  - `POST /api/v1/tenants/:tenantId/vehicles/bulk-import`: Upload file Excel danh sách xe.

---

### 22. `TenantRulesPage.tsx` — Bộ Quy tắc Mở Cần Tự Động & Trình Giả Lập
* **Mục tiêu**: Định nghĩa các chính sách phân quyền cho phép barrier tự động mở cần khi camera nhận diện biển số; kiểm tra tính hợp lệ của luật bằng công cụ mô phỏng.
* **Các thành phần UI**:
  - Bảng danh sách quy tắc (Access Rules): Tên luật, Độ ưu tiên (`priority`), Nhóm áp dụng (`VIP`, `EMPLOYEE`, `RESIDENT`, `BLACKLIST`), Hành động (`ALLOW_OPEN`, `DENY_KEEP_CLOSED`), Khung giờ hiệu lực (VD: Thứ 2 - Thứ 6 từ 07:00 đến 19:00).
  - Form thêm/sửa quy tắc với giao diện chọn lịch trực quan.
  - **Trình giả lập Luật (Rule Simulator)**: Nhập biển số giả định, chọn trạm đỗ, chọn ngày và giờ -> Hệ thống tính toán và hiển thị kết quả mở cần hay đóng cần kèm luật khớp tương ứng.
* **API Backend**:
  - `GET /api/v1/tenants/:tenantId/rules`: Lấy danh sách quy tắc đang có.
  - `POST /api/v1/tenants/:tenantId/rules`: Tạo quy tắc phân quyền mới.
  - `POST /api/v1/tenants/:tenantId/rules/simulate`:
    - Payload: `{ "plateNumber": "30A-999.88", "siteId": "s-001", "timestamp": "2026-09-24T14:30:00Z" }`
    - Response: `{ "decision": "ALLOW_OPEN", "matchedRuleId": "r-001", "matchedRuleName": "Cư Dân Giờ Bình Thường" }`

---

### 23. `TenantLocationPage.tsx` & `TenantSitesPage.tsx` — Quản trị Mặt bằng & Trạm Đỗ
* **Mục tiêu**: Cấu hình địa chỉ trạm, định vị tọa độ GPS (hiển thị lên bản đồ D3), sức chứa bãi xe và giờ mở cửa trong tuần.
* **Các thành phần UI**:
  - Danh sách các cơ sở / bãi xe trực thuộc Tenant.
  - Form cấu hình: Tên trạm, Địa chỉ chi tiết, Tọa độ GPS (`latitude`, `longitude`), Sức chứa tối đa (`capacity`).
  - Ma trận giờ làm việc 7 ngày trong tuần (Operating Hours Schedule).
  - Tích hợp chế độ mở cần khẩn cấp khi có tín hiệu báo cháy (Fire Alarm Integration).
* **API Backend**:
  - `GET /api/v1/tenants/:tenantId/sites`: Danh sách các trạm.
  - `POST /api/v1/tenants/:tenantId/sites`: Thêm trạm mới.
  - `PUT /api/v1/tenants/:tenantId/sites/:siteId`: Cập nhật tọa độ GPS và thông tin trạm.

---

### 24. `TenantUsersPage.tsx` & `TenantTeamPage.tsx` — Quản lý Đội ngũ Nhân sự Trạm
* **Mục tiêu**: Quản lý tài khoản và phân quyền cho nhân sự nội bộ của Tenant (Quản lý bãi, Bảo vệ trực làn, Kế toán đối soát).
* **Các thành phần UI**:
  - Bảng thành viên: Họ tên, Email, Số điện thoại, Vai trò (`SITE_MANAGER`, `SECURITY_GUARD`, `OPERATOR`, `AUDITOR`), Trạng thái (`ACTIVE`, `INVITED`).
  - Modal gửi thư mời tham gia tổ chức qua Email.
  - Phân quyền chi tiết: Quyền điều khiển nâng cần khẩn cấp, quyền sửa biển số, quyền xem báo cáo doanh thu.
* **API Backend**:
  - `GET /api/v1/tenants/:tenantId/users`: Danh sách nhân sự.
  - `POST /api/v1/tenants/:tenantId/invitations`: Gửi email kích hoạt tài khoản nhân viên.
  - `PATCH /api/v1/tenants/:tenantId/users/:userId/role`: Cập nhật vai trò và quyền hạn.

---

### 25. `TenantSettingsPage.tsx` — Cài đặt Vận hành Riêng của Trạm
* **Mục tiêu**: Tùy chỉnh các ngưỡng tham số tự động hóa cho các làn barrier thuộc Tenant.
* **Các thành phần UI**:
  - Ngưỡng độ tin cậy AI OCR tối thiểu để mở cần tự động (Mặc định: 90%).
  - Thời gian trễ tự động hạ cần sau khi xe rời khỏi vòng từ (Loop Sensor Clear Delay: 1.5s - 5s).
  - Cấu hình kênh nhận cảnh báo kẹt cần: Webhook URL, Telegram Group Chat ID, Số điện thoại nhận tin nhắn khẩn cấp.
* **API Backend**:
  - `GET /api/v1/tenants/:tenantId/settings`: Lấy cấu hình trạm.
  - `PUT /api/v1/tenants/:tenantId/settings`: Lưu cấu hình ngưỡng vận hành mới.

---

# 3. THIẾT KẾ CƠ SỞ DỮ LIỆU TOÀN DIỆN (DATABASE SCHEMA & DDL SCRIPT)

---

## 3.1. Sơ đồ Thực thể Quan hệ (ERD Diagram)

```
┌─────────────────┐       ┌──────────────────────┐       ┌────────────────────────┐
│     tenants     │───1:N─│     tenant_users     │───1:N─│      user_sessions     │
└────────┬────────┘       └──────────────────────┘       └────────────────────────┘
         │
         ├────────1:N─► ┌──────────────────────┐       ┌────────────────────────┐
         │              │     tenant_sites     │───1:N─│      edge_devices      │
         │              └──────────┬───────────┘       └───────────┬────────────┘
         │                         │                               │
         │                         ├───────1:N─► ┌─────────────┐   │ 1:N
         │                         │             │ site_lanes  │◄──┘
         │                         │             └──────┬──────┘
         │                         │                    │ 1:1
         │                         ├───────1:N─► ┌──────▼──────┐
         │                         │             │barrier_gates│
         │                         │             └──────┬──────┘
         │                         │                    │ 1:N
         │                         │             ┌──────▼───────────────┐
         │                         │             │ gate_telemetry_logs  │
         │                         │             └──────────────────────┘
         │                         │
         │                         ├───────1:N─► ┌──────────────────────┐
         │                         │             │  barrier_incidents   │
         │                         │             └──────────────────────┘
         │                         │
         │                         └───────1:N─► ┌──────────────────────┐
         │                                       │    access_events     │
         │                                       └──────────────────────┘
         ├────────1:N─► ┌──────────────────────┐
         │              │ registered_vehicles  │
         │              └──────────────────────┘
         ├────────1:N─► ┌──────────────────────┐
         │              │  tenant_access_rules │
         │              └──────────────────────┘
         └────────1:N─► ┌──────────────────────┐
                        │      audit_logs      │
                        └──────────────────────┘
```

---

## 3.2. Data Dictionary Chi Tiết

| Tên Bảng (Table) | Mục Đích Lưu Trữ | Khóa Chính (PK) | Khóa Ngoại (FK) | Chiến Lược Đánh Index |
| :--- | :--- | :--- | :--- | :--- |
| `tenants` | Doanh nghiệp / Tổ chức khách hàng | `id (UUID)` | - | `UNIQUE(code)` |
| `tenant_users` | Người dùng thuộc doanh nghiệp | `id (UUID)` | `tenant_id` -> `tenants.id` | `UNIQUE(tenant_id, email)` |
| `platform_admins`| Quản trị viên Super Admin nền tảng | `id (UUID)` | - | `UNIQUE(email)` |
| `user_sessions` | Phiên đăng nhập, IP, token hash | `id (UUID)` | `tenant_id` -> `tenants.id` | `UNIQUE(token_hash)` |
| `tenant_sites` | Cơ sở bãi đỗ xe, vị trí GPS | `id (UUID)` | `tenant_id` -> `tenants.id` | `UNIQUE(tenant_id, code)` |
| `edge_devices` | Thiết bị IoT biên (Jetson, PLC) | `id (UUID)` | `site_id` -> `tenant_sites.id` | `UNIQUE(device_serial)` |
| `site_lanes` | Làn xe vào/ra | `id (UUID)` | `site_id` -> `tenant_sites.id` | B-tree trên `site_id` |
| `barrier_gates` | Cần barrier, động cơ servo, rơ-le | `id (UUID)` | `site_id`, `lane_id` | `UNIQUE(site_id, code)` |
| `gate_telemetry_logs` | Lịch sử góc mở, nhiệt độ servo | `(id, recorded_at)` | `gate_id` -> `barrier_gates.id`| **Partition by Range (recorded_at)** |
| `barrier_incidents` | Sự cố kẹt cần cơ học, mất kết nối | `id (UUID)` | `gate_id`, `tenant_id` | B-tree trên `(tenant_id, status)` |
| `registered_vehicles` | Danh mục xe nội bộ / Whitelist | `id (UUID)` | `tenant_id` -> `tenants.id` | `UNIQUE(tenant_id, plate_number)` |
| `tenant_access_rules` | Quy tắc phân quyền tự động mở cần | `id (UUID)` | `tenant_id` -> `tenants.id` | B-tree trên `(tenant_id, priority)` |
| `access_events` | Nhật ký xe qua làn, ảnh ANPR OCR | `(id, timestamp)` | `site_id`, `gate_id`, `tenant_id` | **Partition by Range (timestamp)** |
| `audit_logs` | Bằng chứng kiểm toán bất biến | `id (UUID)` | `tenant_id` -> `tenants.id` | B-tree trên `(tenant_id, created_at DESC)` |

---

## 3.3. DDL Script (PostgreSQL 16 Production Ready)

```sql
-- Kích hoạt extension sinh mã định danh UUID ngẫu nhiên
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. BẢNG TỔ CHỨC / DOANH NGHIỆP (TENANTS)
-- ============================================================================
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'TRIAL', 'SUSPENDED', 'DISABLED'
    tier_plan VARCHAR(50) NOT NULL DEFAULT 'BUSINESS', -- 'STARTER', 'BUSINESS', 'ENTERPRISE'
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    timezone VARCHAR(50) DEFAULT 'Asia/Ho_Chi_Minh',
    max_sites INT DEFAULT 10,
    max_gates INT DEFAULT 30,
    max_vehicles INT DEFAULT 5000,
    storage_quota_gb NUMERIC(10, 2) DEFAULT 100.00,
    storage_used_gb NUMERIC(10, 2) DEFAULT 0.00,
    settings JSONB DEFAULT '{"anprConfidenceThreshold": 0.90, "loopClearDelaySeconds": 2.5}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. BẢNG NGƯỜI DÙNG THUỘC DOANH NGHIỆP (TENANT USERS)
-- ============================================================================
CREATE TABLE tenant_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'OPERATOR', -- 'TENANT_ADMIN', 'SITE_MANAGER', 'OPERATOR', 'SECURITY_GUARD', 'AUDITOR'
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'INVITED', 'SUSPENDED'
    phone VARCHAR(50),
    department VARCHAR(100),
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_secret VARCHAR(255),
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_tenant_user_email UNIQUE (tenant_id, email)
);

-- ============================================================================
-- 3. BẢNG QUẢN TRỊ VIÊN NỀN TẢNG (PLATFORM ADMINS)
-- ============================================================================
CREATE TABLE platform_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'PLATFORM_SUPERADMIN', -- 'PLATFORM_SUPERADMIN', 'PLATFORM_SUPPORT', 'PLATFORM_SECURITY'
    status VARCHAR(20) DEFAULT 'ACTIVE',
    mfa_enabled BOOLEAN DEFAULT TRUE,
    mfa_secret VARCHAR(255),
    failed_login_attempts INT DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 4. BẢNG QUẢN LÝ PHIÊN TRUY CẬP (USER SESSIONS)
-- ============================================================================
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    user_type VARCHAR(30) NOT NULL, -- 'PLATFORM_ADMIN', 'TENANT_USER'
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    refresh_token_hash VARCHAR(255) UNIQUE,
    ip_address INET NOT NULL,
    user_agent TEXT,
    device_fingerprint VARCHAR(255),
    risk_level VARCHAR(20) DEFAULT 'NORMAL', -- 'NORMAL', 'SUSPICIOUS', 'HIGH_RISK'
    is_revoked BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 5. BẢNG CƠ SỞ BÃI ĐỖ XE (TENANT SITES)
-- ============================================================================
CREATE TABLE tenant_sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    capacity INT NOT NULL DEFAULT 500,
    current_occupancy INT NOT NULL DEFAULT 0,
    operating_hours JSONB NOT NULL DEFAULT '{"isOpen24_7": true}'::jsonb,
    overall_health VARCHAR(20) DEFAULT 'HEALTHY', -- 'HEALTHY', 'WARNING', 'CRITICAL', 'OFFLINE'
    contact_phone VARCHAR(50),
    manager_name VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_tenant_site_code UNIQUE (tenant_id, code)
);

-- ============================================================================
-- 6. BẢNG THIẾT BỊ BIÊN (EDGE DEVICES)
-- ============================================================================
CREATE TABLE edge_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES tenant_sites(id) ON DELETE CASCADE,
    device_serial VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    hardware_model VARCHAR(100) DEFAULT 'NVIDIA Jetson Orin Nano / RK3588',
    ip_address INET NOT NULL,
    mac_address MACADDR NOT NULL,
    firmware_version VARCHAR(50) NOT NULL,
    mqtt_client_id VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'ONLINE', -- 'ONLINE', 'OFFLINE', 'DEGRADED'
    cpu_usage_pct NUMERIC(5, 2) DEFAULT 0.00,
    ram_usage_pct NUMERIC(5, 2) DEFAULT 0.00,
    storage_usage_pct NUMERIC(5, 2) DEFAULT 0.00,
    latency_ms INT DEFAULT 15,
    last_heartbeat_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 7. BẢNG LÀN XE (SITE LANES)
-- ============================================================================
CREATE TABLE site_lanes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES tenant_sites(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    direction VARCHAR(10) NOT NULL, -- 'IN', 'OUT', 'BIDIRECTIONAL'
    vehicle_allowed_type VARCHAR(50) DEFAULT 'ALL',
    edge_device_id UUID REFERENCES edge_devices(id),
    camera_rtsp_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 8. BẢNG CẦN BARRIER & MOTOR RELAY (BARRIER GATES)
-- ============================================================================
CREATE TABLE barrier_gates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES tenant_sites(id) ON DELETE CASCADE,
    lane_id UUID REFERENCES site_lanes(id) ON DELETE SET NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    model_type VARCHAR(100) DEFAULT 'High-Speed Brushless DC Servo 0.6s',
    status VARCHAR(20) NOT NULL DEFAULT 'CLOSED', -- 'OPEN', 'CLOSED', 'LOCKED', 'STUCK'
    health VARCHAR(20) NOT NULL DEFAULT 'HEALTHY', -- 'HEALTHY', 'WARNING', 'OFFLINE', 'FAULT'
    arm_angle_deg INT NOT NULL DEFAULT 0,          -- 0 (hạ) đến 90 (mở)
    relay_state VARCHAR(30) DEFAULT 'NORMAL',     -- 'NORMAL', 'OVERCURRENT_TRIPPED', 'POWER_FAIL'
    loop_detector_active BOOLEAN DEFAULT FALSE,
    motor_temperature_c NUMERIC(5, 1) DEFAULT 38.0,
    ups_battery_pct INT DEFAULT 100,
    daily_cycles_count INT DEFAULT 0,
    total_lifetime_cycles INT DEFAULT 0,
    last_action_by VARCHAR(100) DEFAULT 'SYSTEM',
    last_passage_plate VARCHAR(50),
    warning_note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_site_gate_code UNIQUE (site_id, code)
);

-- ============================================================================
-- 9. BẢNG LỊCH SỬ TELEMETRY PHẦN CỨNG (PARTITION THEO THÁNG)
-- ============================================================================
CREATE TABLE gate_telemetry_logs (
    id BIGSERIAL,
    gate_id UUID NOT NULL REFERENCES barrier_gates(id) ON DELETE CASCADE,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    arm_angle_deg INT NOT NULL,
    status VARCHAR(20) NOT NULL,
    motor_temperature_c NUMERIC(5, 1),
    loop_detector_active BOOLEAN,
    relay_voltage NUMERIC(5, 2),
    relay_current_a NUMERIC(5, 2),
    PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);

-- ============================================================================
-- 10. BẢNG SỰ CỐ VẬN HÀNH BARRIER (BARRIER INCIDENTS)
-- ============================================================================
CREATE TABLE barrier_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES tenant_sites(id) ON DELETE CASCADE,
    gate_id UUID NOT NULL REFERENCES barrier_gates(id) ON DELETE CASCADE,
    incident_type VARCHAR(50) NOT NULL, -- 'STUCK', 'OFFLINE', 'RELAY_OVERHEAT', 'LOOP_FAULT', 'TAMPER'
    severity VARCHAR(20) NOT NULL,      -- 'CRITICAL', 'WARNING', 'INFO'
    status VARCHAR(20) DEFAULT 'ACTIVE', -- 'ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'
    title VARCHAR(255) NOT NULL,
    details TEXT,
    telemetry_snapshot JSONB,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by UUID REFERENCES tenant_users(id),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES tenant_users(id),
    resolution_method VARCHAR(50), -- 'AUTO_SELF_HEAL', 'REMOTE_REBOOT', 'REMOTE_FORCE_OPEN', 'FIELD_DISPATCH'
    resolution_notes TEXT
);

-- ============================================================================
-- 11. BẢNG DANH MỤC PHƯƠNG TIỆN ĐĂNG KÝ (REGISTERED VEHICLES)
-- ============================================================================
CREATE TABLE registered_vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plate_number VARCHAR(50) NOT NULL,
    vehicle_type VARCHAR(50) NOT NULL, -- 'CAR', 'MOTORBIKE', 'ELECTRIC_VEHICLE', 'TRUCK'
    brand VARCHAR(100),
    model VARCHAR(100),
    color VARCHAR(50),
    owner_name VARCHAR(255) NOT NULL,
    owner_phone VARCHAR(50),
    owner_email VARCHAR(255),
    owner_department VARCHAR(100),
    owner_category VARCHAR(50) DEFAULT 'EMPLOYEE', -- 'EMPLOYEE', 'RESIDENT', 'VISITOR', 'VIP', 'CONTRACTOR'
    access_status VARCHAR(20) DEFAULT 'ALLOWED',   -- 'ALLOWED', 'DENIED', 'EXPIRED', 'PENDING'
    rfid_card_number VARCHAR(100),
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_tenant_vehicle_plate UNIQUE (tenant_id, plate_number)
);

-- ============================================================================
-- 12. BẢNG QUY TẮC PHÂN QUYỀN MỞ BARRIER (ACCESS RULES)
-- ============================================================================
CREATE TABLE tenant_access_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    priority INT NOT NULL DEFAULT 10,
    status VARCHAR(20) DEFAULT 'ACTIVE', -- 'ACTIVE', 'DISABLED'
    target_category VARCHAR(50) DEFAULT 'ALL',
    applied_sites JSONB DEFAULT '["ALL"]'::jsonb,
    action VARCHAR(30) NOT NULL, -- 'ALLOW_OPEN', 'DENY_KEEP_CLOSED', 'REQUIRE_MANUAL_REVIEW'
    time_schedule JSONB NOT NULL,
    holiday_override BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 13. BẢNG SỰ KIỆN QUÉT XE QUA LÀN (ACCESS EVENTS - PARTITION THEO QUÝ)
-- ============================================================================
CREATE TABLE access_events (
    id UUID DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES tenant_sites(id) ON DELETE CASCADE,
    gate_id UUID NOT NULL REFERENCES barrier_gates(id) ON DELETE CASCADE,
    lane_id UUID REFERENCES site_lanes(id),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    direction VARCHAR(10) NOT NULL, -- 'IN', 'OUT'
    plate_number VARCHAR(50) NOT NULL,
    ocr_confidence NUMERIC(4, 3) NOT NULL,
    vehicle_detected_type VARCHAR(50),
    decision VARCHAR(20) NOT NULL, -- 'ALLOWED', 'DENIED', 'MANUAL_OVERRIDE', 'BLOCKED'
    decision_reason VARCHAR(255),
    matching_rule_id UUID REFERENCES tenant_access_rules(id),
    registered_vehicle_id UUID REFERENCES registered_vehicles(id),
    plate_crop_image_url TEXT,
    overview_image_url TEXT,
    processing_time_ms INT DEFAULT 240,
    verified_by_user_id UUID REFERENCES tenant_users(id),
    PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- ============================================================================
-- 14. BẢNG NHẬT KÝ KIỂM TOÁN HỆ THỐNG BẤT BIẾN (AUDIT LOGS)
-- ============================================================================
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    actor_id UUID NOT NULL,
    actor_email VARCHAR(255) NOT NULL,
    actor_type VARCHAR(50) NOT NULL, -- 'PLATFORM_ADMIN', 'TENANT_USER', 'EDGE_GATEWAY'
    category VARCHAR(50) NOT NULL,   -- 'MONITORING', 'SECURITY', 'BARRIER_CONTROL', 'VEHICLES', 'TENANTS'
    action VARCHAR(100) NOT NULL,
    target_resource_type VARCHAR(50) NOT NULL,
    target_resource_id VARCHAR(100) NOT NULL,
    changes JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 15. TẠO CÁC PHÂN VÙNG DỮ LIỆU BAN ĐẦU (INITIAL PARTITIONS)
-- ============================================================================
CREATE TABLE access_events_y2026_q1 PARTITION OF access_events
    FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2026-04-01 00:00:00+00');
CREATE TABLE access_events_y2026_q2 PARTITION OF access_events
    FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');
CREATE TABLE access_events_y2026_q3 PARTITION OF access_events
    FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');
CREATE TABLE access_events_y2026_q4 PARTITION OF access_events
    FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');

CREATE TABLE telemetry_logs_y2026_m09 PARTITION OF gate_telemetry_logs
    FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');
CREATE TABLE telemetry_logs_y2026_m10 PARTITION OF gate_telemetry_logs
    FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');
```

---

# 4. ĐẶC TẢ HỆ THỐNG API (RESTFUL API SPECIFICATION)

---

## 4.1. Authentication & Session APIs

### `POST /api/v1/auth/login`
* **Mô tả**: Đăng nhập tài khoản Super Admin hoặc Tenant User.
* **Headers**: `Content-Type: application/json`
* **Request Body**:
```json
{
  "email": "anh.nh@kyanon.digital",
  "password": "SuperSecretPassword123!"
}
```
* **Response (200 OK - Không bật MFA)**:
```json
{
  "success": true,
  "requiresMfa": false,
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
  "expiresIn": 900,
  "workspace": "tenant",
  "user": {
    "id": "u-001",
    "email": "anh.nh@kyanon.digital",
    "fullName": "Nguyen Hoang Anh",
    "role": "TENANT_ADMIN",
    "tenantId": "t-001"
  }
}
```
* **Response (200 OK - Yêu cầu nhập mã MFA)**:
```json
{
  "success": true,
  "requiresMfa": true,
  "tempToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
}
```

---

### `POST /api/v1/auth/mfa/verify`
* **Request Body**:
```json
{
  "tempToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
  "otp": "481920"
}
```
* **Response (200 OK)**:
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
  "expiresIn": 900,
  "workspace": "tenant",
  "user": { ... }
}
```

---

## 4.2. Platform Governance APIs

### `GET /api/v1/platform/tenants`
* **Quyền hạn**: `PLATFORM_SUPERADMIN`, `PLATFORM_SUPPORT`
* **Query Params**: `page=1&limit=20&search=vinhomes&status=ACTIVE&tier=BUSINESS`
* **Response (200 OK)**:
```json
{
  "items": [
    {
      "id": "t-001",
      "code": "VIN-CENTRAL",
      "name": "Vinhomes Central Park",
      "status": "ACTIVE",
      "tierPlan": "BUSINESS",
      "maxSites": 5,
      "maxGates": 20,
      "sitesCount": 4,
      "gatesCount": 16,
      "storageUsedGb": 42.8,
      "storageQuotaGb": 100.0,
      "createdAt": "2026-01-15T08:00:00Z"
    }
  ],
  "total": 128,
  "page": 1,
  "limit": 20
}
```

---

### `PATCH /api/v1/platform/tenants/:id/status`
* **Request Body**:
```json
{
  "status": "SUSPENDED",
  "reason": "Quá hạn thanh toán cước thuê bao 30 ngày"
}
```
* **Response (200 OK)**:
```json
{
  "success": true,
  "tenantId": "t-001",
  "newStatus": "SUSPENDED",
  "revokedSessionsCount": 14
}
```

---

## 4.3. Tenant Sites & Barrier Hardware Control APIs

### `GET /api/v1/tenants/:tenantId/sites-gates`
* **Quyền hạn**: Tất cả vai trò thuộc Tenant
* **Response (200 OK)**:
```json
{
  "sites": [
    {
      "id": "s-001",
      "code": "SITE-LM81",
      "name": "Trạm Landmark 81 Central",
      "city": "TP. Hồ Chí Minh",
      "latitude": 10.7952,
      "longitude": 106.7218,
      "capacity": 850,
      "currentOccupancy": 512,
      "overallHealth": "HEALTHY",
      "gates": [
        {
          "id": "g-001",
          "code": "GATE-IN-01",
          "name": "Làn Vào 01 (Cần Servo 0.6s)",
          "status": "CLOSED",
          "health": "HEALTHY",
          "armAngleDeg": 0,
          "relayState": "NORMAL",
          "loopDetectorActive": false,
          "motorTempC": 38.5,
          "upsBatteryPercent": 100,
          "dailyCycles": 412
        }
      ]
    }
  ]
}
```

---

### `POST /api/v1/gates/:gateId/control`
* **Mô tả**: Điều khiển đóng/mở/khóa cần barrier từ xa.
* **Quyền hạn**: `TENANT_ADMIN`, `SITE_MANAGER`, `SECURITY_GUARD`
* **Request Body**:
```json
{
  "action": "OPEN", // "OPEN" | "CLOSE" | "LOCK" | "UNLOCK"
  "reason": "Mở cưỡng bức cho xe cấp cứu vào hiện trường"
}
```
* **Response (200 OK)**:
```json
{
  "success": true,
  "gateId": "g-001",
  "newStatus": "OPEN",
  "armAngleDeg": 90,
  "executedAt": "2026-09-24T08:30:15.120Z",
  "latencyMs": 42
}
```

---

### `POST /api/v1/gates/:gateId/remediate`
* **Mô tả**: Xử lý và tự khắc phục sự cố kẹt cần hoặc mất kết nối.
* **Request Body**:
```json
{
  "incidentId": "inc-0091",
  "strategy": "REBOOT_RELAY" // "REBOOT_RELAY" | "FORCE_OPEN" | "RE_LINK_HEARTBEAT"
}
```
* **Response (200 OK)**:
```json
{
  "success": true,
  "incidentId": "inc-0091",
  "gateId": "g-001",
  "status": "RESOLVED",
  "remediatedAt": "2026-09-24T08:30:18.410Z"
}
```

---

## 4.4. Access Events & ANPR History APIs

### `GET /api/v1/tenants/:tenantId/access-events`
* **Query Params**: `page=1&limit=25&plate=30E&direction=IN&siteId=s-001`
* **Response (200 OK)**:
```json
{
  "items": [
    {
      "id": "evt-99120",
      "timestamp": "2026-09-24T08:29:45.312Z",
      "plateNumber": "30E-892.41",
      "direction": "IN",
      "ocrConfidence": 0.985,
      "vehicleDetectedType": "CAR",
      "decision": "ALLOWED",
      "decisionReason": "Xe Cư Dân Vé Tháng",
      "gateName": "Làn Vào 01",
      "plateCropImageUrl": "https://storage.cdn/crops/30E89241.jpg",
      "overviewImageUrl": "https://storage.cdn/overview/snap-99120.jpg",
      "processingTimeMs": 185
    }
  ],
  "total": 4810,
  "page": 1,
  "limit": 25
}
```

---

## 4.5. Vehicle Registry & Policy Rules APIs

### `POST /api/v1/tenants/:tenantId/vehicles`
* **Request Body**:
```json
{
  "plateNumber": "51K-888.99",
  "vehicleType": "CAR",
  "ownerName": "Trần Văn An",
  "ownerPhone": "0912345678",
  "ownerCategory": "RESIDENT",
  "rfidCardNumber": "E280-1105-0000",
  "validFrom": "2026-09-01T00:00:00Z",
  "validUntil": "2027-09-01T00:00:00Z"
}
```
* **Response (201 Created)**:
```json
{
  "id": "v-882",
  "plateNumber": "51K-888.99",
  "accessStatus": "ALLOWED",
  "syncedToEdgeCount": 4
}
```

---

### `POST /api/v1/tenants/:tenantId/rules/simulate`
* **Request Body**:
```json
{
  "plateNumber": "51K-888.99",
  "siteId": "s-001",
  "timestamp": "2026-09-24T22:30:00Z"
}
```
* **Response (200 OK)**:
```json
{
  "decision": "ALLOW_OPEN",
  "matchedRuleId": "r-002",
  "matchedRuleName": "Cư Dân Được Ra Vào 24/7",
  "explanation": "Biển số thuộc nhóm RESIDENT, trạm Landmark 81 áp dụng lịch mở 24/7"
}
```

---

# 5. GIAO THỨC TRUYỀN THÔNG REAL-TIME (MQTT & WEBSOCKET PROTOCOL)

---

## 5.1. MQTT Topics giữa Edge AI Gateway và Backend

Mạng lưới thiết bị biên giao tiếp với Cloud qua giao thức **MQTT 5.0 (TLS Port 8883)** với broker tập trung **EMQX**:

```
[Edge Camera & Sensor] ──MQTT Publish──► [EMQX Broker] ──Kafka/RabbitMQ──► [Backend Engine]
```

### 1. Topic Telemetry Trạng thái Cần (`QoS 0` - Gửi mỗi 1 giây):
* **Topic**: `tenants/{tenantId}/sites/{siteId}/gates/{gateId}/telemetry`
* **Payload**:
```json
{
  "gateId": "g-001",
  "armAngleDeg": 0,
  "status": "CLOSED",
  "motorTempC": 41.2,
  "relayState": "NORMAL",
  "loopDetectorActive": false,
  "upsBattery": 100,
  "timestamp": "2026-09-24T08:30:10.000Z"
}
```

### 2. Topic Cảnh báo Kẹt Cần Khẩn Cấp (`QoS 2` - Bắt buộc xác nhận nhận tin):
* **Topic**: `tenants/{tenantId}/sites/{siteId}/gates/{gateId}/incident`
* **Payload**:
```json
{
  "incidentId": "inc-0092",
  "incidentType": "STUCK",
  "severity": "CRITICAL",
  "armAngleDeg": 42,
  "relayCurrentA": 9.4,
  "message": "Cần dừng bất thường tại 42°. Rơ-le quá tải đã tự ngắt bảo vệ cuộn dây.",
  "timestamp": "2026-09-24T08:30:12.150Z"
}
```

### 3. Topic Lệnh Điều Khiển Phần Cứng (`QoS 1`):
* **Topic**: `tenants/{tenantId}/sites/{siteId}/gates/{gateId}/command`
* **Payload**:
```json
{
  "commandId": "cmd-8812",
  "action": "FORCE_OPEN",
  "operator": "anh.nh@kyanon.digital",
  "timeoutMs": 3000
}
```

---

## 5.2. WebSocket Stream tới Web Client Dashboard

Backend Web Service duy trì kết nối WebSocket hai chiều bảo mật (`WSS`) với trình duyệt của Admin và Operator:

```
[Backend WebSocket Server] ──────WSS Frame Broadcast──────► [Browser React App]
```

### 1. Event: `INCIDENT_ALERT` (Kích hoạt Floating Toast & Chuông Âm Thanh):
```json
{
  "event": "INCIDENT_ALERT",
  "data": {
    "id": "inc-0092",
    "type": "STUCK",
    "siteId": "s-001",
    "siteName": "Trạm Landmark 81 Central",
    "gateId": "g-001",
    "gateName": "Làn Vào 01 (Cần Servo 0.6s)",
    "armAngleDeg": 42,
    "title": "CẢNH BÁO KẸT CẦN BARRIER (STUCK)",
    "description": "Cần dừng tại 42°. Rơ-le ngắt quá dòng bảo vệ motor.",
    "timestamp": "08:30:12"
  }
}
```

### 2. Event: `GATE_STATE_CHANGE` (Cập nhật góc quay trên Bản đồ D3):
```json
{
  "event": "GATE_STATE_CHANGE",
  "data": {
    "siteId": "s-001",
    "gateId": "g-001",
    "status": "OPEN",
    "armAngleDeg": 90,
    "lastPlate": "30E-892.41"
  }
}
```

### 3. Event: `INCIDENT_RESOLVED` (Xóa Toast và tắt chuông):
```json
{
  "event": "INCIDENT_RESOLVED",
  "data": {
    "incidentId": "inc-0092",
    "gateId": "g-001",
    "resolvedAt": "08:30:25"
  }
}
```

---

# 6. STATE MACHINE VÀ ĐẶC TẢ HÀNH VI NGHIỆP VỤ (BEHAVIOR & EDGE CASES)

---

## 6.1. State Machine của Barrier Servo & Rơ-le

```
                     ┌──────────────────┐
                     │      CLOSED      │◄─────────────────────────────┐
                     └────────┬─────────┘                              │
                              │ Loop Sensor = TRUE & ANPR = ALLOWED   │ Loop Sensor = FALSE
                              ▼                                        │ (Xe đã đi qua an toàn)
                     ┌──────────────────┐                              │
       ┌────────────►│     OPENING      │                              │
       │             └────────┬─────────┘                              │
       │                      │                                        │
       │ (Motor kẹt góc <90°) │ (Mở tới góc 90° an toàn)              │
       │                      ▼                                        │
┌──────┴───────┐     ┌──────────────────┐                     ┌────────┴────────┐
│    STUCK     │     │       OPEN       │────────────────────►│     CLOSING     │
│ (Báo Động Đỏ)│     └──────────────────┘  Loop clears timer  └────────┬────────┘
└──────┬───────┘                                                       │
       │                                                               │ (Vướng dị vật)
       │ Remote Reset Relay / Nâng Ép                                  │
       └───────────────────────────────────────────────────────────────┘
```

---

## 6.2. Phát hiện & Xử lý Kẹt Cần Cơ Học (Stuck Detection & Remediation)

### 1. Điều kiện Kích hoạt Kẹt cần:
- Khi có lệnh `OPEN` hoặc `CLOSE`, nếu Encoder đo góc của động cơ không đạt được trạng thái đích trong vòng **1.5 giây**.
- Cảm biến dòng rò đo được dòng điện cuộn dây tăng vọt > **8.5 Amperes**.
- Rơ-le bảo vệ quá tải nhiệt ngắt mạch (`OVERCURRENT_TRIPPED`).

### 2. Hành vi Hệ thống:
1. **Edge Gateway**: Ngay lập tức ngắt điện động cơ để tránh cháy cuộn dây và publish MQTT message `STUCK`.
2. **Backend**:
   - Ghi bản ghi vào bảng `barrier_incidents` với `severity = 'CRITICAL'`.
   - Bắn WebSocket event `INCIDENT_ALERT` tới mọi client đang mở Tenant Portal.
3. **Web Client (`BarrierMapVisualization.tsx`)**:
   - Đổi màu nốt trạm trên bản đồ D3 sang Đỏ `#f85149`, kích hoạt hiệu ứng radar ping (`animate-ping`).
   - Đẩy thông báo nổi vào **Floating Toast Stack** với thanh progress bar thời gian.
   - Web Audio Synth phát âm thanh báo động âm tần kép (Dual-tone frequency alarm: 880Hz / 440Hz).
   - Tăng số đếm Incident trên Top Ribbon (`tabular-nums`).

### 3. Quy trình Khắc phục (Remediation Workflow):
- Người dùng bấm **"Reset Rơ-le"** trên Toast hoặc Drawer:
  1. Gửi `POST /api/v1/gates/:gateId/remediate` với `strategy: 'REBOOT_RELAY'`.
  2. Edge Gateway ngắt nguồn phụ tải trong 2 giây rồi cấp lại để xả dòng rò.
  3. Motor servo tự động quay về vị trí Home (Zero-point calibration).
  4. Trạng thái Gate đổi về `CLOSED` an toàn, Toast tự ẩn, nốt trên bản đồ D3 trở về màu xanh.

---

## 6.3. Phát hiện Mất kết nối Telemetry (Offline Heartbeat & Re-linking)

### 1. Điều kiện Kích hoạt Offline:
- Edge Gateway tại bãi xe gửi Heartbeat ping định kỳ mỗi 5 giây qua MQTT.
- Nếu Backend không nhận được gói tin trong **15 giây liên tiếp** (3 chu kỳ ping trượt):
  - Chuyển `edge_devices.status = 'OFFLINE'` và `barrier_gates.health = 'OFFLINE'`.

### 2. Hành vi Hệ thống:
- Bản đồ D3 hiển thị nốt trạm màu Vàng hổ phách `#e3b341` với viền nét đứt.
- Toast hiển thị cảnh báo mất tín hiệu telemetry.
- Web Audio phát âm báo đơn (Single-tone alert: 520Hz).
- Vô hiệu hóa các nút điều khiển trực tiếp trên giao diện để tránh gửi lệnh mù.
- Cung cấp nút **"Re-link Heartbeat"** để cưỡng bức mở lại socket kết nối.

---

## 6.4. Pipeline Xử lý Phương tiện Qua làn (Ingress/Egress Flow)

```
1. Phương tiện đè lên vòng từ (Loop Coil Sensor = TRUE)
   │
2. Camera IP kích hoạt chụp 2 khung hình (Cận cảnh biển số + Toàn cảnh)
   │
3. Edge AI Inference Engine (YOLOv8-ANPR) đọc biển số trong 180ms
   │
4. Edge Gateway đối soát Offline Whitelist Cache nội bộ
   ├──► [HỢP LỆ]: Kích hoạt Rơ-le mở cần Barrier ngay lập tức (< 300ms)
   │              và gửi gói tin bất đồng bộ lên Cloud.
   │
   └──► [CHƯA RÕ]: Gửi REST Call lên Cloud đối soát `tenant_access_rules`
                  ├──► [ĐẠT]: Mở cần, hiển thị biển số lên bảng LED trạm.
                  └──► [TỪ CHỐI]: Cần giữ nguyên hạ, phát còi cảnh báo tại trạm.
   │
5. Xe đi qua khỏi cổng (Loop Coil Sensor = FALSE)
   │
6. Cần Barrier tự động hạ xuống sau 2.5 giây.
```

---

# 7. CHIẾN LƯỢC TỐI ƯU VẬN HÀNH & BẢO MẬT (PERFORMANCE & SECURITY)

---

## 7.1. Row-Level Security (RLS)

Để bảo đảm tuyệt đối không bao giờ xảy ra rò rỉ dữ liệu chéo giữa các Tenant, PostgreSQL kích hoạt chính sách **Row-Level Security (RLS)** trên toàn bộ các bảng nghiệp vụ:

```sql
-- 1. Kích hoạt RLS trên bảng phương tiện
ALTER TABLE registered_vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_vehicles ON registered_vehicles
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 2. Kích hoạt RLS trên bảng sự kiện quét biển số
ALTER TABLE access_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_events ON access_events
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 3. Kích hoạt RLS trên bảng cần barrier
ALTER TABLE barrier_gates ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_gates ON barrier_gates
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
```

Mỗi khi nhận request từ người dùng, API Gateway giải mã JWT, lấy `tenant_id` và gán vào session context của kết nối database:
```sql
SET LOCAL app.current_tenant_id = 'c8b21104-5821-4f11-9a72-78d10129a001';
```

---

## 7.2. Partitioning Chiến lược cho Bảng Sự Kiện & Telemetry

Bảng `access_events` và `gate_telemetry_logs` là các bảng sinh dữ liệu liên tục với tốc độ cao (hàng chục nghìn records mỗi ngày trên mỗi trạm).
* **Bảng `access_events`**: Phân vùng theo **Quý (Quarterly Range Partitioning)**.
* **Bảng `gate_telemetry_logs`**: Phân vùng theo **Tháng (Monthly Range Partitioning)**.
* **Lợi ích**:
  1. **Partition Pruning**: Các câu lệnh lọc theo ngày tháng chỉ quét đúng 1 phân vùng dữ liệu, tăng tốc độ truy vấn gấp 12 lần.
  2. **Zero-Lock Data Purging**: Dễ dàng dọn dẹp dữ liệu cũ quá 1 năm bằng lệnh `DROP TABLE access_events_y2025_q1` chỉ mất 5ms, không gây khóa bảng và không làm phân mảnh database.

---

## 7.3. Đánh Index Tối ưu Tốc độ Tra cứu Biển số ANPR

```sql
-- 1. Tra cứu biển số xe đăng ký tức thời (Tối ưu cho Edge Cache Sync)
CREATE INDEX idx_registered_vehicles_lookup 
ON registered_vehicles (tenant_id, plate_number) 
WHERE access_status = 'ALLOWED';

-- 2. Đánh giá nhanh luật mở cần theo thứ tự ưu tiên
CREATE INDEX idx_access_rules_priority 
ON tenant_access_rules (tenant_id, priority ASC) 
WHERE status = 'ACTIVE';

-- 3. Tra cứu lịch sử xe ra vào gần nhất (Kiểm tra Anti-Passback)
CREATE INDEX idx_events_antipassback 
ON access_events (tenant_id, plate_number, timestamp DESC);

-- 4. Báo cáo thống kê bảng điều khiển theo trạm và kết quả quyết định
CREATE INDEX idx_events_site_metrics 
ON access_events (tenant_id, site_id, decision, timestamp DESC);
```

---

# 8. KẾT LUẬN & LỘ TRÌNH TRIỂN KHAI (IMPLEMENTATION ROADMAP)

Hệ thống Frontend đã hoàn thiện 100% giao diện, tích hợp đầy đủ các logic xử lý sự cố kẹt cần, mất kết nối, bản đồ D3.js vector, hệ thống toast và audio synthesizer. Khi phía Backend triển khai theo đúng tài liệu này:
1. **Giai đoạn 1**: Khởi tạo Database PostgreSQL theo script DDL tại Mục 3 và kích hoạt RLS.
2. **Giai đoạn 2**: Dựng API Gateway (REST API) theo đặc tả Mục 4 để phục vụ dữ liệu CRUD cho Frontend.
3. **Giai đoạn 3**: Cấu hình EMQX Broker và cài đặt luồng WebSocket theo chuẩn Mục 5 để kết nối trực tiếp với giao diện giám sát `BarrierMapVisualization`.
4. **Giai đoạn 4**: Đồng bộ firmware thiết bị biên Edge Gateway theo State Machine tại Mục 6 để hoàn tất hệ thống tự động hóa khép kín 100%.
