# PHÂN TÍCH & KẾ HOẠCH TRIỂN KHAI — ParkVision (ANPR Barrier SaaS)

Đối chiếu `frontend/SYSTEM_ARCHITECTURE_AND_DATABASE_DESIGN.md` (1378 dòng) với codebase thực tế tại `main@f69f294`.
Ngày phân tích: 2026-09-25.

---

## 1. TÓM TẮT ĐIỀU HÀNH

| Tầng | Trạng thái so với spec | Ghi chú chính |
|---|---|---|
| **Database (Mục 3)** | ✅ ~95% — vượt spec | Đủ 14 bảng + 6 bảng bổ sung; RLS có `platform_bypass`; phân vùng có DEFAULT + auto-create |
| **REST API (Mục 4)** | 🟡 ~75% | Đủ CRUD lõi; thiếu check-code, rules/simulate, correct-plate, bulk-resolve, impersonate, dashboard metrics, monitoring snapshot, credentials |
| **MQTT/WebSocket (Mục 5)** | 🟡 ~80% | Bridge EMQX→PG→Redis→WS hoạt động đúng topic; tên event WS và QoS khác spec |
| **State machine (Mục 6)** | 🟡 ~60% | Command async + ack + timeout có; stuck/offline remediation qua incident endpoints chưa đủ chiến lược; threshold offline 120s ≠ spec 15s |
| **Frontend 25 màn hình (Mục 2)** | 🟡 ~85% | Đủ 25 màn hình; hầu hết nối API thật; **ngoại lệ lớn: `BarrierMapVisualization` vẫn render mock** |
| **Bảo mật (Mục 7)** | ✅ ~90% | RLS + non-superuser `vehicle_app`, refresh-rotation, CSRF cookie, MFA TOTP — nhiều điểm tốt hơn spec |
| **Infra/Test** | ✅ | compose đủ (pg16/redis/emqx/localstack/mailpit/api/worker/mqtt-bridge); CI ruff+mypy+pytest; E2E black-box API+realtime |

**Kết luận nhanh:** Backend đã được xây tới mức production-reasonable và ở nhiều chỗ *đúng hơn spec* (RLS bypass cho platform admin, DEFAULT partitions, command bất đồng bộ có idempotency/ack, cookie+CSRF thay Bearer). Việc còn lại không phải "xây backend từ đầu" mà là **(a) nối màn hình trung tâm vào dữ liệu thật**, **(b) bổ sung ~10 endpoint còn thiếu**, và **(c) thống nhất contract giữa spec ↔ code ↔ firmware edge**.

---

## 2. ĐIỂM MẠNH ĐÃ CÓ (không cần làm lại)

### Backend (`backend/app/`)
- **Schema đầy đủ hơn spec**: 14 bảng spec + `plans`, `legal_documents`, `feature_flags`, `platform_settings`, `gate_commands`, `background_jobs` (`migrations/versions/0001_initial_schema.py`).
- **RLS đúng chuẩn production**: policy `tenant_id = app.current_tenant_id OR platform_bypass` trên mọi bảng tenant + app chạy bằng role non-superuser `vehicle_app` (spec viết policy nhưng quên rằng platform admin sẽ bị RLS chặn luôn — code đã xử lý).
- **Partition an toàn**: monthly cho `gate_telemetry_logs`, quarterly cho `access_events`, **có DEFAULT partition** (spec chỉ tạo 4 quý 2026 → insert ngoài range sẽ crash) + worker `create_future_partitions` tạo trước phân vùng tương lai.
- **Auth vượt spec**: httpOnly cookie `vm_access`/`vm_refresh`/`vm_csrf` + CSRF header cho mutation; refresh-token rotation kèm reuse-detection và revoke cả family; TOTP MFA đầy đủ (`/auth/mfa/setup|enable|disable|verify`), claim `mfa_pending` chặn cả WS.
- **Command path đúng cho phần cứng thật**: `POST /gates/{id}/commands` → ghi `gate_commands` (idempotency key + correlation id) → Redis outbox → mqtt-bridge publish EMQX → edge ack `command_ack` → `acknowledged/timeout`. Spec mô tả `POST /gates/:id/control` đồng bộ trả `newStatus` ngay — mô hình async của code thực tế đúng hơn cho IoT (không chặn HTTP chờ relay).
- **MQTT bridge** (`app/realtime/mqtt_bridge.py`): subscribe `tenants/+/sites/+/gates/+/{telemetry,incident,command}`; telemetry → `gate_telemetry_logs` + cập nhật `barrier_gates.status`; heartbeat → `edge_devices.last_heartbeat_at`; payload có `plateNumber` → ghi `access_events` (chạy qua `decide_access`); incident → `barrier_incidents`; mọi thứ fan-out qua Redis pub/sub → WS.
- **Rule engine có thật**: `services/event_service.py::decide_access` — kiểm tra xe đăng ký (blacklist/expired/…) rồi duyệt rules theo `priority` + `schedule` JSONB.
- **Workers (arq)**: `create_future_partitions`, `expire_stale_commands`, `mark_offline_devices`, `cleanup_expired_sessions`, `send_invite_email`, `vehicle_import` (CSV async job), `audit_export` (S3 presigned).
- **Tests**: unit (auth, isolation RLS, resources/commands) + **black-box E2E** (`tests/e2e/e2e_api.py`, `e2e_realtime.py`) chạy qua mạng thật gồm cả MQTT→ack→WS fan-out. CI: ruff + format + mypy + pytest trên PG/Redis services thật.

### Frontend (`frontend/src/`)
- Đủ **25/25 màn hình** của spec (đếm theo routing trong `App.tsx`), gồm cả `MfaFlowModal`, `RuleSimulatorModal`, `ActivatePage` (invite flow).
- `PlatformContext` fetch API thật cho mọi collection: tenants, admins, sessions, flags, settings, infra health, sites, gates, devices, vehicles, rules, users, access-events, incidents, audit-logs, lanes.
- API client typed từ OpenAPI (`schema.d.ts` 4496 dòng, generated) + camelCase mappers.
- WebSocket thật: `new WebSocket(barrierTelemetryWsUrl(tenantId))` với reconnect backoff; access-event frames map vào `accessEvents` state; telemetry/incident frame → refetch REST.
- Chủ động "honest-empty": cameras / security-alerts / credentials render rỗng thay vì mock khi chưa có API (comment tại `PlatformContext.tsx:448`).
- Anomaly detection engine client-side (Z-score + EWMA + Poisson burst) — vượt spec, nhưng xem mục 3.2 về vấn đề baseline cứng.

---

## 3. KHOẢNG TRỐNG & MÂU THUẪN

### 3.1. Gap lớn nhất: màn hình trung tâm chạy mock
`components/monitoring/BarrierMapVisualization.tsx` (2728 dòng — màn hình #19, "linh hồn" của spec):

```ts
const [sites, setSites] = useState<TenantSiteBarrierLocation[]>(INITIAL_TENANT_BARRIER_SITES);
```
- Render từ `data/barrierMockData.ts` (sites `site-b-00x`, gates `bg-00x-0x`) — **không đọc** `tenantSites`/`gates`/`incidents` từ `PlatformContext`, không nhận frame WS.
- Toast/alerts khởi tạo bằng record mẫu (`alert-init-tsn`), các nút "Kích hoạt sự cố" là simulator local.
- `anomalyDetectionService` có baseline **hardcode theo mock gate id** (`bg-001-01`…) → khi nối dữ liệu thật sẽ không khớp id nào.
- Hệ quả: toàn bộ hành vi Mục 6 (toast stack + Web Audio + radar ping khi `INCIDENT_ALERT`, cập nhật góc cần khi `GATE_STATE_CHANGE`) chưa bao giờ chạy với dữ liệu thật.

### 3.2. Endpoint thiếu so với spec Mục 4

| Endpoint spec | Trạng thái | Hiện trạng/Ghi chú |
|---|---|---|
| `GET /public/tenants/check-code` | ❌ | RegisterPage không kiểm tra trùng `code` realtime |
| `POST /tenants/{id}/rules/simulate` | ❌ | Frontend tự evaluate client-side (`simulateAccessDecision`, comment ghi "the API has no simulate endpoint") — logic có thể lệch `decide_access` |
| `PATCH /tenants/{id}/access-events/{id}/correct-plate` | ❌ | Chức năng sửa biển số chưa có cả FE lẫn BE |
| `POST /incidents/bulk-resolve` | ❌ | Có per-incident acknowledge/resolve; thiếu bulk |
| `POST /platform/tenants/{id}/impersonate` | ❌ | Màn TenantDetail có nút nhưng không có API |
| `GET /platform/metrics/overview` + `throughput-chart` | ❌ | DashboardPage tổng hợp phía client |
| `GET /tenants/{id}/dashboard/summary` + `hourly-flow` | ❌ | FE fetch `limit=200` rồi tự đếm — **không scale** khi events/vehicles vượt page limit |
| `GET /platform/monitoring/telemetry-snapshot`, `POST .../edge-devices/{id}/reboot` | ❌ | Chỉ có `/platform/infra/health`; Monitoring tab gates/edge chưa có API snapshot chuyên dụng (đang đọc devices/gates qua tenant API) |
| `GET /security/sessions`, `DELETE .../{id}`, `POST /credentials/{id}/rotate` | 🟡 | `/platform/sessions` + `/auth/sessions` + revoke có; **không có model API credentials** nào |
| `PUT /tenants/{id}/settings` | ❌ | Không có route settings dưới tenant; TenantSettingsPage chưa persist (spec mục 25: OCR threshold, loop-clear delay, webhook/Telegram) |
| Occupancy (`current_occupancy`) | ❌ | Không ai cập nhật — site hiển thị 0; cần tăng/giảm theo access_events hoặc telemetry |
| Notification channels (webhook/Telegram/SMS khi incident) | ❌ | `audit_export`/mail có; dispatcher cảnh báo ra ngoài chưa có |

### 3.3. Mâu thuẫn contract spec ↔ code (cần quyết định trước khi viết firmware)

| Hạng mục | Spec | Code thực tế | Đánh giá |
|---|---|---|---|
| Stack backend | "Node.js / Express / Go" | FastAPI + SQLAlchemy async | Deviation có chủ đích; **sửa spec** |
| Auth | Response trả `accessToken` Bearer | httpOnly cookies + `X-CSRF-Token` | Code tốt hơn (chống XSS steal token); **sửa spec** |
| Gate control | `POST /gates/:id/control` đồng bộ → `newStatus` | `POST /gates/:id/commands` → 202 + `command_ack` qua telemetry topic | Code đúng cho IoT thật; **sửa spec** |
| WS event names | `INCIDENT_ALERT`, `GATE_STATE_CHANGE`, `INCIDENT_RESOLVED` | `{"type": "telemetry"|"incident"|"command_ack"|"ping"}` | Chọn một — khuyến nghị giữ code, sửa spec, vì FE đang parse `type` |
| Enum values | `IN/OUT`, `ALLOWED/DENIED`, `OPEN/CLOSED/LOCKED/STUCK`, `ALLOW_OPEN/DENY_KEEP_CLOSED`, roles `TENANT_ADMIN/SITE_MANAGER/...` | lowercase: `entry/exit`, `allow/deny`, `open/closed/locked/fault`, `allow_list/deny_list/schedule/quota`, roles `owner/admin/operator/viewer` | **Phải chuẩn hóa trước khi edge code** — đề xuất giữ lowercase ở API, doc spec ghi mapping |
| Incident QoS | QoS 2 bắt buộc | bridge subscribe QoS 1 (downgrade tối đa 1) | Chấp nhận được; nếu muốn QoS2 đúng nghĩa cần subscribe qos=2 |
| Heartbeat/offline | ping 5s, offline sau 15s | worker sweep `mark_offline_devices` mặc định **120s** | Đổi cron/arg xuống ~15-30s hoặc sửa spec |
| Error/response envelope | `{success:true,...}` | `{data, meta}` + `{error:{code,message}, requestId}` | **Sửa spec** |
| Kafka/RabbitMQ giữa EMQX và backend | Có trong diagram | Không có — bridge consume MQTT trực tiếp | Đơn giản hơn, phù hợp quy mô hiện tại; sửa spec hoặc đánh dấu "phase sau" |
| `POST /gates/:id/remediate` strategies | `REBOOT_RELAY/FORCE_OPEN/RE_LINK_HEARTBEAT` | Command enum chỉ có `open/close/lock/unlock/reboot` | Cần map: REBOOT_RELAY→`reboot`, FORCE_OPEN→`open`, RE_LINK_HEARTBEAT→cần command mới |
| `audit_logs` categories | `MONITORING/SECURITY/BARRIER_CONTROL/VEHICLES/TENANTS` | free-text `action`/`actor_type` | Chưa chặt; cân nhắc enum hoá khi làm export thanh tra |
| Spec partition DDL | chỉ 4 quý/2 tháng 2026, không DEFAULT | DEFAULT partition + worker tạo trước | Code đúng; spec nên ghi nhận |

### 3.4. Điểm spec thiếu/thừa so với thực tế
- Spec không có: `gate_commands` (idempotency), `background_jobs` (import/export async), `plans`/`legal_documents`/`feature_flags`/`platform_settings` — code cần thiết cho các màn hình public/admin; **spec nên bổ sung các bảng này vào Mục 3** để tài liệu không lệch sự thật.
- Spec có nhưng chưa xây: `user_sessions.device_fingerprint`, `risk_level` có cột nhưng chưa có logic chấm rủi ro IP; `tenants.settings` có JSONB nhưng chưa có API update per-tenant.

### 3.5. Rủi ro kỹ thuật cần ghi nhận
1. **Aggregation phía client**: dashboard tenant & platform fetch `limit=200` mỗi bảng rồi đếm — sẽ sai ngay khi vượt limit, và N+1 ở `sitesPage.data.map(s => tenantApi.lanes(...))`.
2. **WS → refetch toàn bộ**: mỗi frame telemetry (spec: mỗi 1s/gate) trigger `loadTenantData` = ~10 REST calls → self-DDoS khi nhiều gate. Cần apply-delta vào state thay vì refetch.
3. **Refresh-token reuse grace 60s** hợp lý nhưng cần giám sát `risk_level`/alert khi reuse xảy ra (đã có cột, chưa có detection).
4. Partition drop/archive chiến lược retention 90 ngày ảnh + dữ liệu event chưa có worker dọn (spec 7.2 nói lợi ích nhưng chưa ai DROP).
5. Frontend chưa có CI workflow (`tsc --noEmit` chỉ chạy tay); schema.d.ts cần job regenerate khi OpenAPI đổi.

---

## 4. KẾ HOẠCH TRIỂN KHAI (5 phase, theo thứ tự ưu tiên)

> Ước lượng theo throughput của Devin (1 session ≈ 1-2 ngày khối lượng tương đương). Mỗi phase độc lập merge được.

### Phase 0 — Chuẩn hoá contract & tài liệu (0.5 session)
- Sửa `SYSTEM_ARCHITECTURE_AND_DATABASE_DESIGN.md`: stack FastAPI, cookie+CSRF auth, async command model, WS event thực tế, enum mapping lowercase↔UPPERCASE, DEFAULT partitions, `platform_bypass`.
- Pin MQTT payload schema thành JSON Schema (file `docs/mqtt-contract.md` hoặc `contracts/`) — làm chuẩn cho firmware sau này.
- Quyết định danh nghĩa: giữ envelope `{data,meta}`/`{error}` và lowercase enums (ít phá code nhất).

### Phase 1 — Nối `BarrierMapVisualization` vào dữ liệu thật (1 session) ⭐ ROI cao nhất
- Map `tenantSites`/`gates`/`devices`/`incidents` từ `PlatformContext` → `TenantSiteBarrierLocation`/`BarrierGateItem` (bỏ `INITIAL_TENANT_BARRIER_SITES` khỏi render path; giữ file mock chỉ cho storybook/test).
- WS apply-delta: `telemetry` → cập nhật `armAngleDeg/status/motorTemp` của gate trong state; `incident` → push `BarrierAlertEvent` + toast + âm thanh (đã có synth); `command_ack` → cập nhật trạng thái nút.
- Sửa vòng lặp refetch: chỉ refetch khi `incident` cần hydrate thêm, telemetry 1s thì mutate state trực tiếp.
- Control buttons → `POST /gates/{id}/commands` (open/close/lock/unlock/reboot) + poll `GET /commands/{id}` hoặc chờ `command_ack` trên WS; disable khi gate offline (spec 6.3).
- Anomaly service: đổi key baseline từ mock-id sang `gateId` thật hoặc default profile; nếu chưa có baseline theo tenant thì tắt overlay mặc định.
- Xoá/honest-empty phần "simulate incident" hoặc gate sau flag `demo_mode`.
- Điều chỉnh `mark_offline_devices` còn ~15-30s (config) cho khớp trải nghiệm spec.

### Phase 2 — Bù endpoint thiếu phục vụ màn hình hiện có (1-1.5 session)
- `GET /public/tenants/check-code` (check unique `code`/`slug`, kèm normalize rule).
- `POST /tenants/{id}/rules/simulate` — tái dùng `decide_access` trả `{decision, matchedRuleId, matchedRuleName, explanation}`; FE bỏ client-eval.
- `PATCH /tenants/{id}/access-events/{id}/correct-plate` — lưu `corrected_plate` + `verified_by` + audit log.
- `POST /incidents/bulk-resolve` + bulk action trên UI drawer.
- `GET/PUT /tenants/{id}/settings` → cột `tenants.settings` (OCR threshold, loop-clear delay, webhook_url, telegram_chat_id) + FE persist.
- Dashboard aggregation: `GET /platform/metrics/overview`, `GET /tenants/{id}/dashboard/summary`, `GET .../hourly-flow` (SQL aggregate, không để FE đếm).
- Occupancy: cập nhật `tenant_sites.current_occupancy` trong `record_access_event` (IN +1 / OUT −1, floor 0, capacity cap) — cho dashboard thật.
- Rà soát `GET /platform/monitoring/telemetry-snapshot` — aggregate mới nhất mỗi gate/device qua `DISTINCT ON` hoặc Redis cache.

### Phase 3 — Governance & vận hành nâng cao (1-1.5 session)
- `POST /platform/tenants/{id}/impersonate`: JWT 15 phút, claim `impersonator_id`, audit `TENANT_IMPERSONATE`, FE banner "đang mạo danh".
- `POST /platform/edge-devices/{id}/reboot` → reuse `gate_commands`/command channel (device-scoped command type `reboot_device`).
- API credentials: bảng `api_credentials` (hash, prefix, scopes, rotated_from, expires) + `POST /security/credentials/{id}/rotate` giữ cũ 24h; SecurityPage bật thật.
- Notification dispatcher: worker đọc `barrier_incidents` CRITICAL → webhook URL/Telegram (từ `tenants.settings`), retry + dead-letter; mail qua Mailpit sẵn có.
- `risk_level`/`device_fingerprint` scoring nhẹ (IP mới + UA lạ → SUSPICIOUS) phục vụ SecurityPage.

### Phase 4 — Edge firmware & vận hành dữ liệu (song song, ~1 session phía backend)
- Firmware theo contract Phase 0: state machine Mục 6 (OPENING/STUCK khi encoder <90° trong 1.5s hoặc current >8.5A → publish `incident` QoS1), heartbeat 5s, offline whitelist cache + REST fallback đối soát rule (Mục 6.4).
- Backend hỗ trợ edge: endpoint sync whitelist incremental (`GET /tenants/{id}/vehicles?updated_since=` → ETag), endpoint edge auth (device token — tách khỏi user JWT).
- Retention worker: `DETACH PARTITION` + drop >12 tháng, purge ảnh S3 > retention_days (theo `platform_settings`).
- CI frontend: job `bun run lint` (`tsc --noEmit`) + `vite build` + regenerate-check `schema.d.ts`.

### Phase 5 — Hardening (liên tục)
- Rate limit public endpoints (login/register/check-code), captcha cho register.
- Anti-passback query dùng `ix_access_plate`, observability (Prometheus `/metrics`, tracing MQTT→DB→WS latency), backup/restore runbook cho `pgdata`/`s3data`.
- E2E cho BarrierMap với dữ liệu thật (đã có harness `e2e_realtime.py` — thêm assert WS frame → UI state qua Playwright khi cần).

---

## 5. QUYẾT ĐỊNH CẦN DUYỆT (trước khi vào Phase 1-2)

1. **Contract freeze**: giữ lowercase enums + envelope hiện tại và sửa spec? (khuyến nghị: CÓ — đổi code cho khớp spec sẽ phá vỡ FE đang chạy).
2. **Impersonate**: cho phép platform admin vào tenant portal? (spec có; rủi ro bảo mật cần audit + TTL ngắn — khuyến nghị CÓ với guard).
3. **Sync `/control` shim**: có cần endpoint tương thích spec (`POST /gates/:id/control` trả 200 sau ack, timeout 3s) cho đúng chữ tài liệu, hay chấp nhận async-only? (khuyến nghị async-only, sửa spec).
4. **Anomaly overlay**: giữ tính năng client-side này? Nếu giữ, cần baseline per-gate từ telemetry thật thay vì hardcode.

---

*Sinh bởi Devin — phân tích trên `main@f69f294`, repo `dainn-dev/parkvision`.*
