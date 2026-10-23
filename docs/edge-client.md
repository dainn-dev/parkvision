# ParkVision Edge — kiến trúc, cấu hình và vận hành

Tài liệu cho lập trình viên và kỹ thuật viên triển khai ứng dụng `edge-client`. Nội dung được đối chiếu trực tiếp với Rust/Tauri, frontend cấu hình và test trong repository; không coi design plan hoặc comment TODO là bằng chứng chức năng đã chạy.

Hướng dẫn cài môi trường, dev/build/test: [edge-client/README.md](../edge-client/README.md). Chi tiết đấu dây, giao thức relay và QA phần cứng: [barrier-relay-setup.md](barrier-relay-setup.md).

## 1. Vai trò và ranh giới

Edge chạy trên máy trực cổng, có danh tính tenant/site/device dùng chung và nhiều binding `gates[]`. Mỗi cổng có FSM, HAL, hàng nhận biển số và trạng thái riêng. MQTT, SQLite, đồng bộ REST và luồng sự kiện UI dùng chung ở cấp thiết bị.

Luồng chính:

```text
Camera RTSP/file → ANPR worker → HTTP loopback → PlateReading
                                                  ↓
Nhập biển số UI ───────────────────────────────→ pipeline
                                                  ↓
                                 access + cache SQLite
                                                  ↓ allow
                                                GateFsm
                                                  ↓
                             SimulatedHal hoặc ContactBarrierHal
                                                  ↓
                                   actor relay riêng mỗi cổng

Backend → MQTT command → dispatch tenantId/gateId → GateFsm
pipeline → MQTT telemetry có biển số / outbox khi offline
FSM → incident; runtime → telemetry và heartbeat
Rust → Tauri events → giao diện vận hành
```

Đường ANPR sidecar không điều khiển barrier trực tiếp: cấu hình worker sinh ra đặt `barrier.enabled=false`. Backend không cần được gọi cho từng quyết định local, nhưng cache quyền phải được đồng bộ trước đó.

**Không đồng nhất các trạng thái sau:**

- UI “Trực tuyến/Ngoại tuyến”: kết nối MQTT, không phải health tổng thể.
- `barrierLinkOk`: kết quả I/O relay gần nhất; không phải cảm biến xác nhận cần chắn đã tới đích.
- `gateState`: trạng thái logic FSM, có thể dựa trên góc ước lượng.
- Khóa kiosk: chỉ đổi màn hình UI; không khóa cổng.
- FSM `locked`: từ chối lệnh mở/đóng của cổng đó; không thu hồi API key.
- Credential revoked: dừng runtime, xóa config và yêu cầu kích hoạt lại.

Ứng dụng hiện mở cửa sổ 1280×800; cấu hình Tauri không bật chế độ kiosk/fullscreen hay tự khởi động cùng Windows. Muốn triển khai kiosk hệ điều hành cần quy trình riêng.

## 2. Bản đồ mã nguồn

Các đường dẫn trong phần này tương đối với [`edge-client/`](../edge-client/).

### Rust/Tauri

- `src-tauri/src/lib.rs`: setup Tauri, ConfigStore/LockStore, runtime slot, native commands, chuyển sự kiện sang UI và theo dõi thu hồi quyền.
- `config.rs`: schema JSON camelCase, validate, migration flat v1 và lưu config.
- `activation.rs`: redeem mã, refresh lúc khởi động, merge barrier local theo UUID và deprovision.
- `runtime.rs`: tạo runtime mỗi cổng, chọn PlateSource, chạy các vòng lặp và dispatch lệnh.
- `fsm.rs`: trạng thái, request mở/đóng, khóa/mở khóa, reboot và bảo vệ stuck/overcurrent.
- `hal/mod.rs`: `BarrierHal`, cảm biến, simulated hardware, chọn HAL/tuning. `hal/config.rs` và `hal/profiles.rs`: schema relay/preset/override.
- `hal/contact.rs`: queue lệnh không chặn FSM, actor I/O và snapshot cảm biến. `hal/relay.rs`: trait `RelayBackend`; `hal/backends/`: adapter Hikvision, Dahua, serial LCUS, Modbus và ZKTeco C3.
- `hal/commands.rs`: liệt kê serial, preset, probe, test output, đọc input từ cấu hình form chưa lưu.
- `anpr.rs`: `PlateReading`, manual source, debounce và nhánh RTSP/ONNX tùy chọn.
- `camera_worker.rs` + `worker_ipc.rs`: resolve/supervise sidecar, sinh config mỗi camera, parse JSONL preview/status.
- `ingest.rs`: HTTP loopback, auth camera key, route camera → gate, dedup eventId và check-vehicle.
- `access.rs`: normalize biển số, xét xe/rules/schedule và anti-passback local.
- `pipeline.rs`: nhận biển số → quyết định → request mở → ghi local event/UI → gửi ANPR telemetry hoặc enqueue offline.
- `store.rs`: SQLite cache, outbox, bảng lệnh đã xử lý, lịch sử local và key/value.
- `sync.rs`: REST whitelist incremental, rules snapshot, phân biệt lỗi auth và lỗi tạm thời.
- `mqtt.rs`, `payloads.rs`, `commands.rs`: transport, wire payload/topic, thực thi lệnh và ACK.
- `telemetry.rs`, `incidents.rs`: trạng thái cổng, metrics thiết bị và chống lặp incident theo loại.
- `lock.rs`: mật khẩu UI băm Argon2, trạng thái khóa trong phiên.

### Frontend

- `src/App.tsx`: chọn màn hình loading/setup/locked/operator; về setup khi nhận `edge://deprovisioned`.
- `src/lib/tauri.ts`: kiểu TypeScript và wrapper native commands/events; đối chiếu schema relay với Rust tại đây.
- `src/screens/SetupScreen.tsx`: URL API, mã dùng một lần, phát hiện public IP và mật khẩu kiosk tùy chọn.
- `src/screens/OperatorScreen.tsx`: danh sách gate, trạng thái MQTT/whitelist/outbox, resync và tối đa 100 sự kiện UI gần nhất trong RAM; poll status bổ sung mỗi 2 giây.
- `src/components/GatePanel.tsx`: preview camera, trạng thái gate/link, biển số gần nhất, nhập biển số và nút thao tác theo `gateId`.
- `src/screens/BarrierSettingsScreen.tsx`: form backend/brand/outputs/inputs/override, probe/test/read-input; lưu bản config mới giữ các cổng khác. Khi form có inputs, đọc thử mỗi 1 giây.

## 3. Kích hoạt, lưu cấu hình và thu hồi

### 3.1. Kích hoạt lần đầu

API base URL phải bao gồm prefix API, ví dụ `http://localhost:8000/api/v1` trong dev; production dùng URL HTTPS thực tế. Rust nối thêm `/edge/...`, không tự thêm `/api/v1`.

1. UI trim, viết hoa mã và bỏ khoảng trắng; gửi `activate` qua Tauri.
2. Rust `POST {apiBaseUrl}/edge/activate`, timeout 15 giây, body có `code` và `deviceInfo`.
3. Bundle trả về tenant/site/device, danh sách gate/lane/direction/cameras, `api.token` và MQTT.
4. `bundle_to_config` tạo version hiện tại là **3**, bỏ dấu `/` cuối API base. `apiKey` lấy token; MQTT password lấy bundle password, nếu thiếu thì dùng token.
5. `validate` rồi ghi `edge-config.json`; dừng runtime cũ nếu có và boot runtime mới.

Mã lỗi được UI diễn giải: 401 mã sai; 410 hết hạn; 409 đã dùng; 403 không được kích hoạt từ IP hiện tại. UI cũng có thông báo thiết bị chưa được gán cổng. `detect_public_ip` gọi `/edge/client-ip` với timeout 8 giây; IP này là IP backend nhìn thấy, không nhất thiết là IP LAN từ `device_ip`.

### 3.2. Khởi động lại và merge

Khi có config đọc được, setup Tauri gọi `refresh_and_boot`:

- `GET {apiBaseUrl}/edge/config` với `X-Api-Key`, timeout 10 giây.
- Thành công: nhận binding mới từ backend; giữ API key đã lưu nếu bundle không có token. MQTT password thiếu được suy ra từ token đã chọn, **không phải giữ riêng mọi MQTT password cũ**.
- Tạo map `gateId → BarrierConfig` từ config local rồi gắn vào các cổng **còn tồn tại với cùng `gateId`**. Cổng mới không có barrier; cổng đã bị gỡ không được giữ trong bundle mới.
- Chỉ ghi lại khi JSON thay đổi, sau đó boot bằng config đã merge.
- Lỗi gửi request hoặc HTTP không thành công khác 401/403: thử boot bằng config cache để hoạt động offline.
- **401/403**: deprovision, không boot cache.
- HTTP 2xx nhưng body decode/merge/save lỗi sẽ trả lỗi; không có fallback cache cho mọi lỗi trong nhánh 2xx.

Refresh bundle diễn ra **lúc boot**, không có vòng refresh `/edge/config` 60 giây. Vòng 60 giây chỉ sync whitelist/rules. Không kỳ vọng đổi binding camera trên dashboard tự áp dụng ngay khi app đang chạy.

**Bất biến cần giữ khi phát triển:** refresh từ backend không được xóa `gates[].barrier` local của cổng cùng UUID. Test `activation::tests::refresh_preserves_local_barrier_config` bảo vệ điều này.

### 3.3. Lưu từ form và deprovision

`save_config` validate rồi ghi file. Nếu runtime đang chạy, lệnh boot lại runtime để áp dụng. Nếu restart thất bại, lỗi có dạng `saved, but runtime restart failed: ...`: file đã đổi, không được giả định toàn bộ thao tác rollback. Đây không phải hot-reload riêng một relay.

401/403 trong **vòng sync định kỳ** phát `revoked_rx`; Tauri gọi deprovision: lấy runtime ra khỏi slot, dừng task/worker và xóa config; phát `edge://deprovisioned` để UI quay về setup. Native command `deprovision` làm tương tự khi được gọi thủ công.

Deprovision **không xóa `edge.db`, captures, worker JSON/queue hay `edge-lock.json`**. Đó không phải thao tác xóa sạch dữ liệu/secret. Sau khi xóa config, activation mới không còn bản wiring cũ để merge; cần bản sao lưu local an toàn và xác minh lại đúng cổng. Quy trình tái cấp thiết bị sang tenant khác phải xử lý dữ liệu tồn dư có kiểm soát, không coi API deprovision hiện tại là tenant-data isolation đầy đủ.

## 4. Config v3

### 4.1. Vị trí và migration

- `<app_config_dir>/edge-config.json`: provisioning và wiring local.
- `<app_config_dir>/edge-lock.json`: `passwordHash` Argon2 cho UI.
- `<app_data_dir>/edge.db`: whitelist/rules/local events/outbox/kv.
- `<app_data_dir>/captures`: ảnh nhận được.
- `<app_data_dir>/camera-workers`: JSON sinh ra, snapshots và queue riêng của mỗi camera.

Các thư mục do Tauri resolve, identifier `com.parkvision.edge`; trên Windows thường ở `%APPDATA%/com.parkvision.edge`. Không hardcode đường dẫn repo hay giả định config/data là hai thư mục vật lý khác nhau trên mọi OS.

`ConfigStore::load` xem file **không có `version`** là flat v1: bọc gate/lane/direction/camera thành `gates[]`, đặt version hiện tại, camera legacy dùng UUID nil và barrier `None`. Migration nằm trong bộ nhớ, ghi lại khi save. File có version dùng schema mới; v2 thiếu `barrier` vẫn đọc được thành `None`. Loader không tự nâng mọi giá trị version, và không chặn version lạ bằng một phép kiểm version riêng. Không dùng UUID camera legacy nil cho triển khai multi-camera mới.

### 4.2. Ví dụ đầy đủ, chỉ mô phỏng

JSON dưới đây **không phải credential hoặc cấu hình triển khai thật**. Tất cả UUID lặp số là ID minh họa phải thay bằng ID backend cấp. `REPLACE_ME_API_TOKEN`, `REPLACE_ME_MQTT_USERNAME`, `REPLACE_ME_MQTT_PASSWORD` là placeholder phải thay; hostname `*.example.invalid` cố ý không hoạt động. Khuyến nghị để activation tạo cấu hình thay vì nhập token bằng tay.

```json
{
  "version": 3,
  "tenantId": "11111111-1111-1111-1111-111111111111",
  "siteId": "22222222-2222-2222-2222-222222222222",
  "deviceId": "44444444-4444-4444-4444-444444444444",
  "apiKey": "REPLACE_ME_API_TOKEN",
  "apiBaseUrl": "https://api.example.invalid/api/v1",
  "mqtt": {
    "host": "mqtt.example.invalid",
    "port": 8883,
    "username": "REPLACE_ME_MQTT_USERNAME",
    "password": "REPLACE_ME_MQTT_PASSWORD",
    "tls": true
  },
  "gates": [
    {
      "gateId": "33333333-3333-3333-3333-333333333333",
      "laneId": "55555555-5555-5555-5555-555555555555",
      "direction": "entry",
      "cameras": [],
      "barrier": null
    },
    {
      "gateId": "66666666-6666-6666-6666-666666666666",
      "laneId": null,
      "direction": "exit",
      "cameras": [],
      "barrier": null
    }
  ]
}
```

`cameras: []` dùng cho thử thủ công. Phần tử camera có dạng sau; đây là **fragment**, không phải toàn bộ config. UUID/host/path là minh họa phải thay; URL không chứa secret thật:

```json
{
  "cameraId": "77777777-7777-7777-7777-777777777777",
  "purpose": "plate",
  "streamUrl": "rtsp://camera.example.invalid:554/REPLACE_ME_STREAM_PATH"
}
```

Camera thường có purpose `plate` hoặc `overview`. `plate_stream()` chọn camera `plate` đầu tiên, nếu không có thì camera bất kỳ đầu tiên cho nhánh Rust ONNX. Luồng sidecar hiện duyệt **tất cả cameras**, không lọc purpose; không mặc định cho rằng camera overview chỉ preview và không bao giờ sinh biển số.

### 4.3. Ví dụ barrier local

Thay `gates[n].barrier` bằng object dưới đây **chỉ sau khi xác minh relay và đấu nối thật**. Đây là fragment minh họa, không phải wiring mặc định an toàn cho mọi board. `COM_REPLACE_ME` là placeholder; thay bằng COM thực. Các relay 1/2/3 cũng chỉ là ví dụ phải đối chiếu dây tại site. Nút test và runtime có thể làm barrier chuyển động.

```json
{
  "backend": {
    "type": "serial",
    "port": "COM_REPLACE_ME",
    "protocol": "lcus",
    "baud": 9600,
    "unitId": 1
  },
  "brand": "generic",
  "outputs": {
    "open": 1,
    "close": 2,
    "stop": 3,
    "power": null
  },
  "inputs": null,
  "overrides": {
    "pulseMs": 500,
    "travelSec": 3.0,
    "mode": "openCloseStop",
    "autoClose": { "type": "board" },
    "boardHoldSec": 6.0,
    "pollMs": 200
  }
}
```

LCUS không có input feedback; không thêm mapping limit/loop giả. `stop` chỉ cấu hình khi có dây STOP đúng chức năng; nếu không có dùng `null`, đồng thời hiểu rằng `cut_motor()` sẽ không dừng vật lý qua adapter này. `power` chỉ dành cho mạch cấp nguồn/contactor được thiết kế phù hợp, không tự ý dùng relay tín hiệu để cắt nguồn motor.

Các biến thể backend được schema Rust/TS hỗ trợ:

- `hikvision`: `host`, `port` mặc định 80, `username`, `password`.
- `dahua`: tương tự, thêm `strobe` mặc định false.
- `serial`: `port`, `protocol` là `lcus` hoặc `modbusRtu`, `baud` mặc định 9600, `unitId` mặc định 1.
- `modbusTcp`: `host`, `port` mặc định 502, `unitId` mặc định 1.
- `zkC3`: `host`, `port` mặc định 4370, `password` mặc định chuỗi rỗng, `output` là `aux` (mặc định) hoặc `door`. Không dùng password rỗng như khuyến nghị bảo mật production.

Nếu minh họa password riêng trong bản cấu hình vận hành, dùng placeholder rõ như `REPLACE_ME_RELAY_PASSWORD`, không đưa secret site vào tài liệu. `host` là hostname/IP không gồm scheme; adapter HTTP hiện tự ghép `http://`.

### 4.4. Validate và preset

Các ràng buộc đang được mã kiểm tra:

- Có ít nhất một gate; `direction` chỉ nhận `entry`/`exit` chữ thường.
- API key, API base URL và MQTT host không được rỗng sau trim.
- UUID và kiểu số phải parse được theo serde.
- Relay host hoặc serial port không rỗng; output OPEN >= 1; mọi output được khai báo phải khác nhau và >= 1.
- `openCloseStop` bắt buộc CLOSE; `toggle` dùng lại OPEN khi đóng, nên CLOSE có thể `null`.
- Nhiều struct dùng `deny_unknown_fields`: viết đúng camelCase (`unitId`, `openLimit`, `delaySec`), không thêm field tùy ý.

Validate này **không chứng minh** URL/token/broker hoạt động, số relay có thật, input đúng cực tính, timing an toàn hay không trùng gate ID. Nó cũng không kiểm đủ mọi khoảng giá trị timing/input. Không coi việc save thành công là chứng nhận commissioning.

Brand có `bisen`, `faac`, `came`, `mag`, `zkteco`, `wonsun`, `generic`. Tất cả preset hiện có cùng số mặc định: pulse 500 ms, travel 3 s, mode `openCloseStop`, auto-close `board`, board hold 6 s, poll 200 ms. Override khác `null` ghi đè preset. Mọi preset hiện `verified: false`: tên hãng/wiring hint không bảo đảm tương thích từng model.

Các override `mode`, `autoClose`, `boardHoldSec`, `pollMs` có trong schema nhưng form hiện không cung cấp đầy đủ control chỉnh mọi field; form có pulse/travel và mapping/backend. Không suy ra giao diện đã có mọi tùy chọn trong TypeScript.

## 5. FSM cổng, sự kiện và thời gian

### 5.1. Các trạng thái

Wire/UI serialize chữ thường: `closed`, `opening`, `open`, `closing`, `locked`, `fault`. Khởi tạo FSM luôn ở `closed`, không phải bước dò vị trí vật lý khi app khởi động.

- `request_open`: bị từ chối khi `locked`/`fault`; nếu chưa `open`/`opening` thì gửi OPEN, vào `opening` và bắt đầu timeout.
- `opening`: góc >= 90° → `open`; quá stuck timeout → yêu cầu dừng, `fault` và incident critical.
- `open`, auto-close do edge: loop active làm reset thời gian chờ; loop clear liên tục đủ delay → gửi CLOSE, vào `closing`.
- `open`, auto-close do board: không chủ động CLOSE theo timer FSM; khi góc về 0° → thẳng `closed`.
- `request_close`: bị từ chối khi `locked`/`fault`; nếu chưa `closed`/`closing` thì gửi CLOSE và vào `closing`. Lệnh này không kiểm loop active.
- `closing`: góc 0° → `closed`; quá stuck timeout → yêu cầu dừng và `fault`.
- `lock`: lưu trạng thái trước khóa, gọi `cut_motor`, vào `locked`.
- `unlock`: chỉ hợp lệ từ `locked`. Nếu trước khóa là `open`/`opening`, dựa góc >= 90° để về `open`, còn lại về `closed`; các trạng thái trước khóa khác, kể cả `fault`, về `closed`.
- `reboot`: chỉ hợp lệ từ `fault` hoặc `locked`; yêu cầu power-cycle rồi home-calibrate và đặt FSM `closed`. Đây là hành động HAL, **không phải reboot Windows hay restart ứng dụng**, và không đợi xác nhận cần đã home.

Các mã từ chối: `locked`, `fault`, `not_locked`, `not_faulted`. Hàm mở/đóng bỏ qua kết quả lỗi HAL tại điểm gọi; ACK thành công biểu thị lệnh được FSM chấp nhận, không chứng minh hardware hoàn thành.

**Lưu ý an toàn:** comment FSM nói tới guard ANPR+loop, nhưng `pipeline.rs` hiện chỉ kiểm `decision == "allow"` rồi `request_open()`, không kiểm loop. Không có logic tự đảo chiều do vật cản khi đang đóng trong FSM hiện tại. Hệ thống không thay thế liên động/chống kẹp của board vật lý.

### 5.2. Tuning

- Tick runtime mục tiêu **50 ms**. HAL relay chỉ enqueue lệnh, đọc snapshot; network/serial I/O chạy trong actor riêng theo cổng. Không được thêm I/O chặn vào tick.
- Mô phỏng: góc 0–90°, tốc độ khoảng 60°/s; stuck timeout **1.500 ms**, auto-close **2.500 ms** sau loop clear, ngưỡng quá dòng **8,5 A** khi opening/closing.
- Contact relay: stuck timeout = `max(travelSec, 0) × 1,5 + 1` giây; preset 3 giây cho timeout 5,5 giây. Overcurrent threshold là vô hạn vì relay không đo dòng motor.
- `autoClose: {"type":"board"}` → FSM không tự gửi CLOSE sau delay. Không có limit input thì HAL báo góc 45° khi đang travel, 90° sau travel, rồi 0° khi đủ `travelSec + boardHoldSec` kể từ OPEN. Đây là giả định timer, không đo thực tế.
- `autoClose: {"type":"edge","delaySec":2.5}` → FSM chủ động CLOSE sau loop clear. Chỉ dùng sau khi thiết kế và thử đầy đủ safety feedback; không sao chép như mặc định cho barrier thật.
- Input polling của actor tối thiểu 50 ms, theo `pollMs`; sau lỗi input/I/O actor hoãn poll trong 5 giây. Lệnh mới vẫn được xử lý; không có queue tự replay mọi OPEN thất bại vô hạn.

Tick là lịch Tokio, không hard real-time: runtime còn await publish incident trong tác vụ tick sau khi rời mutex FSM. Actor không chặn FSM bằng relay I/O, nhưng không thể suy ra mọi tick luôn hoàn tất dưới 50 ms khi transport bị backpressure.

### 5.3. Sự kiện

`FsmEvent` nội bộ gồm `StateChanged(GateState)` và `Incident {kind,severity,message}`. Incident có `fault/critical`, `barrier_link_down/warning`, `barrier_link_up/info`. Mất link relay không tự chuyển FSM sang fault; stuck timeout có thể phát sinh riêng sau đó.

Runtime theo dõi state mỗi tick, publish incident và re-arm một số loại khi phục hồi. `IncidentReporter` chống lặp theo kind đang mở trong RAM; không phải hàng sự kiện bền vững. Không mặc định mọi lần link-up đều được lưu hay mọi incident offline sẽ được gửi lại.

Sự kiện Tauri:

- `edge://status`: MQTT, whitelist count, outbox depth, cursor sync và trạng thái từng gate; forwarder có nhịp cập nhật khoảng 200 ms, UI còn poll 2 giây.
- `edge://event`: quyết định local `{plate, gateId, direction, decision, reason, at}`.
- `edge://camera`: preview JPEG base64 và worker/stream status. Rust cũng phát heartbeat camera, nhưng union TypeScript hiện chỉ khai báo preview/status; chưa có health timeout camera đầy đủ trên UI.
- `edge://deprovisioned`: runtime/config bị thu hồi hoặc deprovision.

## 6. Offline, SQLite và đồng bộ

### 6.1. Các bảng và quyết định local

SQLite dùng một `Mutex<Connection>`, WAL và `synchronous=NORMAL`. Đây là persistence local, không phải cam kết chống mất dữ liệu khi mất điện ở mọi thời điểm.

- `whitelist`: xe theo biển chuẩn hóa, tag, validity, status, updated_at.
- `rules`: snapshot rule theo tenant, có `site_id`, priority, schedule và conditions.
- `local_events`: lịch sử quyết định dùng cho anti-passback, không phải xác nhận xe đã qua cổng thật.
- `pending_events`: outbox FIFO.
- `processed_commands`: có triển khai `CommandLog` bền vững, nhưng **runtime hiện không sử dụng nó cho command executor**.
- `kv`: cursor whitelist và tham số anti-passback local.

Luồng `decide_access`:

1. Không có biển/rỗng → `deny/no_plate_detected`; normalize viết hoa rồi giữ ASCII A–Z/0–9.
2. Tính quyết định nền: chưa đăng ký, blacklist, suspended, chưa tới hạn/hết hạn bị deny; xe active hợp lệ được allow.
3. Duyệt rules priority tăng dần; xét `conditions.tags` hoặc `conditions.plates`, lịch `daysOfWeek` (1 thứ Hai…7 Chủ nhật), `startTime`/`endTime` kiểu HH:MM theo **UTC**. Rule khớp `deny_list`/`allow_list` quyết định trước kết quả nền; allow rule có thể ghi đè deny nền.
4. Allow đi qua anti-passback: mặc định 5 phút, dựa sự kiện local mới nhất của biển (mọi chiều). Nếu mới nhất là allow cùng chiều trong cửa sổ thì deny `anti_passback`. `kv.anti_passback_enabled="false"` hoặc window <= 0 tắt kiểm tra.

Không giả định rules hiện đã lọc `site_id` tại local: evaluator đọc toàn bộ cache và không tự lọc theo site. Sync hiện chỉ lấy whitelist/rules, không đồng bộ riêng cấu hình anti-passback từ server. Rule schedule không có xử lý timezone site hoặc khoảng qua nửa đêm riêng. Cần đối chiếu policy thực tế trước khi tuyên bố online/offline luôn cho cùng kết quả.

Pipeline ghi **mọi** quyết định vào `local_events`, kể cả deny và allow nhưng mở bị FSM từ chối. Vì anti-passback nhìn sự kiện mới nhất, không được mô tả nó là khóa cứng 5 phút bất kể các lần deny xen giữa. Store dùng chung các gate của thiết bị; không có đồng bộ lịch sử anti-passback giữa nhiều edge độc lập trong đường này.

### 6.2. REST sync

Auth `X-Api-Key`, HTTP timeout 10 giây. Các endpoint đều nối sau API base:

```text
GET /edge/tenants/{tenantId}/whitelist?limit=500&updatedSince=...
GET /edge/tenants/{tenantId}/rules
```

Whitelist upsert từng item, sau đó ghi `syncedAt` vào `kv.whitelist_synced_at`; nếu `truncated=true` tiếp tục trang sau với cursor mới. Các upsert đi trước cursor, nên lỗi giữa chừng có thể replay idempotent; không phải một transaction nguyên trang. Rules được thay toàn bộ trong transaction.

Vòng định kỳ **60 giây**, tick đầu theo Tokio interval; bỏ qua khi publisher báo MQTT chưa kết nối. Vì vậy REST reachable nhưng MQTT down vẫn có thể không sync tự động. `resync` từ UI gọi whitelist rồi rules trực tiếp, không có điều kiện MQTT; lỗi auth tại lệnh resync được trả về UI, không tự phát cùng tín hiệu thu hồi như vòng định kỳ.

`lastSyncAt` trên UI là cursor whitelist, không khẳng định rules đã sync thành công cùng thời điểm. Whitelist count là số hàng cache, không riêng số xe đang active/hợp lệ.

### 6.3. Outbox và bảo đảm thực tế

Khi pipeline thấy MQTT disconnected, nó enqueue frame ANPR vào SQLite. Outbox tối đa **10.000** hàng, vượt mức xóa hàng cũ nhất. Mỗi **1 giây** khi MQTT connected, runtime lấy tối đa **50** hàng FIFO, chọn topic theo `gateId` trong body (thiếu thì gate đầu), publish QoS 1, xóa hàng khi `Publisher::publish` trả OK; gặp lỗi dừng batch, để hàng lại cho nhịp sau.

**Không mô tả đây là exactly-once hoặc đồng bộ tuyệt đối:**

- Pipeline thấy connected nhưng publish trả lỗi thì hiện chỉ log, **không enqueue lại**.
- `rumqttc::AsyncClient::publish` trả OK nghĩa là enqueue yêu cầu transport, không đợi backend commit hay map riêng PUBACK vào từng hàng SQLite. Cửa sổ mất/nhân đôi dữ liệu vẫn tồn tại.
- Frame ANPR không có event ID bền vững để bảo đảm dedup end-to-end và không mang verdict/reason local; chúng ở UI/local history. Backend có thể đánh giá theo policy hiện tại lúc nhận.
- Telemetry/heartbeat định kỳ bị bỏ qua offline, không lưu toàn bộ lịch sử. Incident reporter/command ACK không tích hợp durable outbox dù flush loop có nhánh xử lý kind `incident`.
- Queue worker Python là lớp riêng, khác với `pending_events` của Rust; giới hạn/retry xem phần camera.
- SQLite local history/captures chưa có chính sách retention đầy đủ trong runtime được khảo sát; theo dõi dung lượng ổ đĩa.

Offline vẫn có thể mở bằng cache và HAL local, nhưng credential bị thu hồi trên server chưa được phát hiện ngay khi không kết nối. Máy mới chưa có cache không có quyền xe mới nhất để quyết định; không suy ra “offline” đồng nghĩa mọi xe bị deny vì allow rule cache vẫn có thể cho phép.

## 7. MQTT và lệnh từ xa

Một kết nối MQTT cho các gate trên thiết bị. Client ID lấy `mqtt.username`, nếu thiếu dùng `edge-{deviceId}`. Chỉ gọi `set_credentials` khi có cả username và password. `tls=true` dùng transport TLS cấu hình mặc định; schema hiện không có field custom CA/client certificate.

Keepalive **10 giây**; event loop reconnect exponential backoff **1→30 giây**, reset khi ConnAck và subscribe lại. Cờ connected bật khi nhận ConnAck, tắt khi poll lỗi; kiểm tra trạng thái runtime mỗi 500 ms. Inbound channel 256 JSON bodies dùng `try_send`, đầy sẽ drop.

Các topic, chữ hoa/thường và camelCase có ý nghĩa:

```text
tenants/{tenantId}/sites/{siteId}/gates/{gateId}/command
tenants/{tenantId}/sites/{siteId}/gates/{gateId}/telemetry
tenants/{tenantId}/sites/{siteId}/gates/{gateId}/incident
```

- Subscribe command QoS 1; dispatch theo **tenantId + gateId trong body**, không theo một bộ route topic riêng trong receiver.
- Gate telemetry mỗi **1 giây**, QoS 0: state, angle, motor temp, relayState, loopDetectorActive, UPS, cycle counters và timestamp.
- Device heartbeat mỗi **5 giây**, QoS 0 trên **telemetry topic của gate đầu tiên**, `type="heartbeat"`, deviceId và CPU/RAM/storage. Latency chưa đo.
- ANPR dùng telemetry cùng gate, QoS 1, có `plateNumber`, `direction`, confidence, laneId/ảnh nếu có; không phải monitor-zone detection.
- Incident trên topic incident, QoS 1; ACK `type="command_ack"` trên telemetry, QoS 1.

Body lệnh cần `commandId` UUID, `correlationId`, `command`, `gateId`, `tenantId`, `issuedAt` ISO timestamp và `payload` tùy chọn. Lệnh có `open`, `close`, `lock`, `unlock`, `reboot`, `relink`; không hỗ trợ → ACK `unsupported_command`. `relink` chỉ ACK thành công, không sửa mạng hay chuyển FSM. Gate/tenant không khớp hoặc body sai bị bỏ, không ACK. `issuedAt` được parse nhưng không có kiểm TTL chống lệnh cũ tại executor.

**Dedup lệnh:** mỗi executor hiện được runtime cấp `InMemCommandLog`. Nó nhớ verdict theo `commandId`, ghi trước publish ACK và replay ACK khi nhận lại trong cùng runtime; lỗi replay trả `error="replay"`. Dù `Store` có bảng và test dedup sống qua reopen, runtime chưa nối Store vào đây. Restart/runtime reconfigure sẽ mất dedup RAM. Không dựa vào nó để bảo đảm relay chỉ kích một lần qua restart.

### MQTT detection camera monitor là hợp đồng khác

[MQTT monitor-camera detection](mqtt-camera-detection.md) mô tả `tenants/{tenantId}/sites/{siteId}/cameras/{cameraId}/detection`, với `vehicle_parked`, `vehicle_seen`, `vehicle_left`, `zone_snapshot`. Đó không phải topic ANPR gate hiện tại của edge-client. Mã `payloads.rs`/`runtime.rs` khảo sát không tạo publisher monitor-zone, upload presign snapshot hay detection zone tương ứng. Không coi việc có camera binding là đã hỗ trợ theo dõi vị trí xe trong bãi.

## 8. Camera/ANPR và ingest local

### 8.1. Sidecar Python

`WorkerCommand::resolve` ưu tiên `PARKVISION_ANPR_WORKER_CMD`, sau đó tìm `camera-edge.exe`/`camera-edge` cạnh executable. Biến command được tách bằng whitespace, không chạy qua shell và không hỗ trợ quoting đường dẫn có khoảng trắng. Tham số `--config <file> --run-camera` do supervisor thêm.

Mỗi camera có JSON tại `camera-workers/{cameraId}.json`, work dir `camera-workers/{cameraId}/`. Model root lấy `PARKVISION_ANPR_MODEL_DIR` hoặc `<app_data_dir>/models`; config trỏ tới `yolo11n.pt`, `LP_detector_nano_61.pt`, `paddleocr/`, chọn CPU. Artifact không được tự tải bởi mã supervisor.

Config sinh ra đặt pipeline frame interval 200 ms, preview tối đa 5 FPS/640 px; ingest timeout 10 s, tối đa 3 lần thử, backoff 0,5→5 s, queue bật với tối đa 5.000 event, retry queue 5 s và heartbeat 20 s. Đây là **giá trị truyền cho worker**, không phải cam kết FPS/độ chính xác hay bằng chứng worker/model đã được chạy trong lần kiểm tra tài liệu này.

Supervisor đọc JSONL stdout để phát preview/status; khi process thoát hoặc spawn lỗi thì thử lại với backoff 1→60 s. Drop manager abort task và child dùng `kill_on_drop`. Không có worker command/camera thì bỏ qua worker; lỗi khởi chạy được log, không buộc runtime barrier phải dừng. Thiếu model có thể làm worker lỗi/respawn liên tục.

### 8.2. HTTP loopback

Server bind `127.0.0.1` **cổng ngẫu nhiên**, không phải service LAN cố định. Mỗi lần server start sinh token ngẫu nhiên 24 byte, ghi vào worker config làm `X-Camera-Key`.

- `POST /api/v1/parking-events`: cần key và `X-Camera-Id` UUID đã được route. JSON envelope có `eventId`, `eventType`, `payload`; multipart hỗ trợ phần `event` + `snapshot`.
- `PlateRecognized`: lấy `payload.plate.normalizedText`, fallback `text`; confidence ưu tiên recognition rồi detection. Đẩy vào channel gate (capacity 16); snapshot tùy chọn được ghi local. `VehicleDetected`/`SnapshotSaved` được nhận nhưng không tạo reading mở cổng.
- `POST /api/vehicles/check-vehicle`: cần key, body `licensePlateNumber` và `type` tùy chọn (mặc định entry). Chỉ xét quyền từ cache, không ghi local event hay điều khiển cổng.
- `POST /api/cameras/{id}/heartbeat`: cần key và camera đã gán; ghi thời điểm heartbeat, phát sự kiện camera.

Dedup `eventId` ở RAM, clear toàn bộ khi đạt 10.000 ID; không bền qua restart. Hiện ID được nhớ **trước** validate plate/đẩy channel; lỗi plate hoặc channel đầy (503) rồi retry cùng ID có thể nhận OK do dedup mà reading chưa được xử lý. Không cam kết retry ingest là không mất event. Server khai báo body-limit layer 16 MiB, nhưng đường JSON đọc body trực tiếp với `usize::MAX`; không xem layer này là bằng chứng mọi nhánh đều giới hạn đúng 16 MiB.

### 8.3. Nhánh Rust RTSP/ONNX

Feature Cargo `onnx` mặc định **tắt**. Nếu bật và có stream, `build_plate_source` thử nguồn RTSP/FFmpeg với model `detector.onnx`, `recognizer.onnx` trong `EDGE_MODEL_DIR` (mặc định `models` theo working directory). Debounce cùng biển là 3 giây trong nhánh này, không phải guard chung cho manual/sidecar.

Đây là nhánh tách biệt với worker Python. Khi nguồn ONNX được chọn thành công, `manual_rx` không được dùng làm nguồn pipeline; đồng thời startup worker sidecar không bị tắt theo feature, nên không nên bật hai đường và giả định chúng tự phối hợp. Nếu ONNX spawn thất bại mới fallback manual; lỗi inference phát sinh sau spawn không có cơ chế tự chuyển nguồn về manual trong hàm chọn nguồn.

Code ONNX giả định detector output `[1,N,6]` sau NMS và recognizer CTC. Feature này chưa được xác nhận build/inference trong đợt viết tài liệu; cần kiểm API `ort`, preprocessing/postprocessing và artifact thật. Không quảng bá như đường production đã kiểm chứng chỉ vì dependency `ort` có trong Cargo.

Ảnh trong pipeline hiện được lưu/copied local và gửi key tên file; chưa có upload S3/presign trong luồng này. UI preview base64 không phải bằng chứng ảnh sự kiện đã tồn tại trên object storage.

## 9. HAL relay, bảo vệ và secret

### 9.1. Phân lớp và adapter

`BarrierHal` có thao tác đồng bộ ngắn; `ContactBarrierHal` enqueue vào actor theo gate để không đưa I/O network/serial vào tick 50 ms. Actor serialize thao tác cho cổng đó; không phải khóa toàn cục theo thiết bị vật lý. Nếu nhiều gate cùng trỏ một relay module/COM, phải đánh giá tranh chấp và khả năng mở kết nối, không mặc định đã có arbitration chung.

- Hikvision: HTTP ISAPI output trigger/input status, digest challenge; mặc định port 80.
- Dahua: HTTP CGI alarm-out, hoặc `trafficSnap ... openStrobe` khi bật `strobe`; OFF trong strobe là no-op của adapter.
- Serial LCUS: khung 4 byte `A0 channel on checksum`, mặc định 9600 8N1; không đọc inputs. Probe chỉ xác nhận mở được serial, không chứng minh board đã trả lời hay relay đã chuyển.
- Modbus RTU/TCP: write single coil FC05, đọc discrete input FC02, đổi index 1-based config sang 0-based protocol. Kết nối lazy; lỗi sẽ bỏ context để lần gọi sau nối lại.
- ZKTeco C3/inBIO: TCP native 4370, ControlDevice `0x05`, RTLog `0x0B`; chọn relay `aux`/`door`, không cần PullSDK DLL. Constructor hiện map limit từ door sensor, không map loop input tổng quát.

Xem [hướng dẫn relay](barrier-relay-setup.md) cho đấu nối; phải thử theo đúng model/firmware, không suy ra tương thích 100% từ tên hãng.

### 9.2. Hành vi cần hiểu khi commissioning

- `barrier: null` → simulated; có config thì build adapter/contact HAL. Constructor lỗi có thể tạo `FailedBackend`, không fallback mô phỏng lặng lẽ; link phản ánh lỗi khi I/O được thực hiện. Không có input polling thì không có health probe định kỳ chỉ để xác nhận link.
- Actor runtime ON → đợi pulse → OFF, tối đa **3 lần thử OFF tổng cộng**; không thành công ghi link lỗi. Không có bảo đảm OFF vật lý nếu mạng đã mất. Poll input lùi 5 giây sau lỗi, không phải mọi lệnh cũ tự replay.
- Settings test gọi `RelayBackend::pulse` của backend tạm, không qua actor runtime và không dùng cùng vòng retry OFF của `run_pulse`. Không thử song song khi gate đang vận hành; serial có thể bị chiếm bởi runtime.
- ZK `pulse()` native làm tròn lên giây (tối thiểu 1 s), nhưng actor runtime hiện gọi `set_output(true)`/sleep/`set_output(false)`, không gọi override `pulse()`. Không giả định test button và vận hành runtime dùng đúng cùng pulse path.
- Không có STOP mapping thì `cut_motor()` của contact HAL là no-op; power-cycle không có POWER mapping cũng là no-op. Có POWER thì actor tắt khoảng 2 giây rồi bật, sau đó mới đến lệnh queued tiếp theo. Reboot FSM không chờ các thao tác này hoàn tất.
- Có limit feedback thì snapshot xác định góc 90°/0°/45°; không có thì timer ước lượng. Input read lỗi/empty snapshot không reset snapshot trước đó; giá trị có thể cũ. `None` có nghĩa backend không cung cấp input.
- Contact HAL trả dòng 0,2 A, nhiệt độ 0°C và UPS 100% như giá trị tổng hợp, không đo thật. Overcurrent bảo vệ chỉ có ý nghĩa với nguồn dữ liệu phù hợp, đã bị tắt cho contact relay. Cycle counters được tạo mặc định trong runtime; chưa thấy nối tăng/lưu bền trong đường này, không dùng như thống kê vận hành đã hoàn chỉnh.

Giữ loop/safety/chống kẹp của board và nút dừng khẩn vật lý. Khi không có feedback thật, góc/FSM không được dùng làm điều kiện an toàn duy nhất. Relay command queue là unbounded; không gửi dồn lệnh để “thử cho tới khi được”.

### 9.3. Secret và khóa UI

`EdgeConfig::Debug` che API key; `MqttConfig::Debug` che password; `RelayBackendConfig::Debug` che password Hikvision/Dahua/ZK; `GateCtx::Debug` che URL camera. Có test kiểm tra redaction các kiểu cấu hình liên quan. Đây là bất biến khi sửa Debug/log, không phải bảo đảm tự động cho mọi kiểu dữ liệu/log.

Cấu hình JSON, worker JSON và URL RTSP vẫn có thể chứa secret dạng rõ; `get_config` gửi config đầy đủ sang webview. Không coi redaction Debug là encryption-at-rest. Một số log/tooltip/nhánh RTSP còn có thể đưa URL ra; không log nguyên bundle/config, và làm sạch RTSP URL, API/MQTT/relay password trước khi chia sẻ log hoặc ảnh chụp màn hình.

Khóa kiosk lưu hash Argon2 có salt, không gửi mật khẩu lên server. Native command kiểm độ dài tối thiểu bằng số byte Rust (`len() >= 4`). Khi có password, khởi động app mặc định khóa UI; sau setup, frontend hiện vào operator sau khi đặt password, nên không coi setup luôn lập tức hiển thị LockScreen. Không có kiểm `locked` chung trong các native command điều khiển: khóa màn hình không phải ranh giới bảo mật IPC/OS hay cơ chế dừng runtime.

Hikvision/Dahua adapter hiện dùng HTTP với digest, **không mã hóa toàn bộ đường truyền bằng TLS**. Tách mạng camera/relay, giới hạn ACL và quyền tài khoản. MQTT TLS/HTTPS API không tự bảo vệ đường HTTP relay. `tauri.conf.json` hiện đặt `csp: null`; không mô tả cấu hình webview này là đã harden production.

## 10. Checklist vận hành và xử lý lỗi

### Trước khi đưa vào sử dụng

1. Xác nhận OS/WebView2/CPU tương thích, đúng API base và MQTT host truy cập được từ máy edge, đồng bộ giờ hệ thống.
2. Activation đúng tenant/site/device, đúng gateId/lane/direction/camera; chờ whitelist/rules và thử policy với dữ liệu kiểm thử có kiểm soát.
3. Kiểm tra gate còn mô phỏng hay đã có relay; lưu bản wiring local có kiểm soát quyền truy cập. Đảm bảo refresh giữ wiring cùng gate UUID.
4. Dừng luồng xe trước probe/test. Xác minh dry-contact, OPEN/CLOSE/STOP, cực tính inputs, pulse/travel, ai sở hữu auto-close và liên động vật lý.
5. Kiểm tra thiếu model/worker, mất RTSP, relay unreachable và phục hồi. Không chỉ nhìn preview hay ACK để kết luận gate thật hoạt động.
6. Thử mất REST riêng, mất MQTT riêng, offline/reconnect và restart; kiểm outbox tăng/giảm, hiểu các cửa sổ mất/nhân đôi đã nêu.
7. Thử thu hồi credential và tái kích hoạt trong môi trường thử; xác nhận kế hoạch phục hồi wiring/dữ liệu. Không dùng deprovision như nút “xóa tất cả”.
8. Phân quyền thư mục chứa secret, kế hoạch dung lượng/retention, bảo vệ tài khoản OS, backup khi app đã dừng hoặc bằng phương thức SQLite-consistent. Không copy riêng `edge.db` đang hoạt động rồi bỏ qua WAL như một backup chắc chắn.

### Triệu chứng thường gặp

- **Vite có UI nhưng nút không chạy:** chạy qua `npm run tauri dev`, không chỉ trình duyệt.
- **Không activate được:** xác nhận prefix `/api/v1`, URL không phải localhost của nhầm máy, mã chưa dùng/chưa hết hạn, IP backend nhìn thấy và gate đã được gán.
- **Online nhưng whitelist cũ:** online chỉ là MQTT; kiểm lỗi REST/auth/cursor; thử “Đồng bộ lại”. `lastSyncAt` không phải rules timestamp.
- **Offline và không sync tự động dù REST sống:** vòng sync định kỳ đang gate theo MQTT; resync là đường gọi trực tiếp.
- **ACK mở OK nhưng cần không chuyển:** kiểm mô phỏng, wiring/backend, link, relay thật và sensor; ACK chỉ là chấp nhận logic.
- **Mất kết nối relay:** kiểm host/port/COM/driver/auth và quyền truy cập; lỗi constructor LCUS dùng FailedBackend không tự dựng lại adapter thành công khi cắm lại, có thể cần lưu/restart runtime sau khi sửa môi trường.
- **Camera không có tín hiệu:** kiểm worker resolve cạnh executable/biến env, đường dẫn không có khoảng trắng, dependency/model, RTSP credential và trạng thái worker. Nhãn live có thể vẫn dựa trên frame gần nhất; không mặc định frame luôn mới sau stream lỗi.
- **Mất binary/test trên Windows:** kiểm chính sách Smart App Control; dùng Docker dev/test như README thay vì vô hiệu hóa bảo vệ máy tùy tiện.
- **Outbox tăng mãi:** kiểm MQTT/TLS/ACL, dung lượng SQLite; tới 10.000 hàng sẽ mất hàng cũ nhất. Giảm count không chứng minh backend đã commit.

## 11. Nguồn đối chiếu, test và giới hạn xác minh

Nguồn chính có thể mở trực tiếp:

- Build/dependency: [package.json](../edge-client/package.json), [Cargo.toml](../edge-client/src-tauri/Cargo.toml), [Tauri config](../edge-client/src-tauri/tauri.conf.json), [Vite config](../edge-client/vite.config.ts), [Dockerfile.dev](../edge-client/Dockerfile.dev), [script test](../edge-client/scripts/cargo-test.sh).
- Provisioning: [config.rs](../edge-client/src-tauri/src/config.rs), [activation.rs](../edge-client/src-tauri/src/activation.rs), [SetupScreen](../edge-client/src/screens/SetupScreen.tsx).
- Runtime/FSM: [runtime.rs](../edge-client/src-tauri/src/runtime.rs), [fsm.rs](../edge-client/src-tauri/src/fsm.rs), [lib.rs](../edge-client/src-tauri/src/lib.rs).
- Offline/quyền: [access.rs](../edge-client/src-tauri/src/access.rs), [pipeline.rs](../edge-client/src-tauri/src/pipeline.rs), [store.rs](../edge-client/src-tauri/src/store.rs), [sync.rs](../edge-client/src-tauri/src/sync.rs).
- MQTT: [mqtt.rs](../edge-client/src-tauri/src/mqtt.rs), [payloads.rs](../edge-client/src-tauri/src/payloads.rs), [commands.rs](../edge-client/src-tauri/src/commands.rs), [telemetry.rs](../edge-client/src-tauri/src/telemetry.rs), [incidents.rs](../edge-client/src-tauri/src/incidents.rs).
- Camera: [camera_worker.rs](../edge-client/src-tauri/src/camera_worker.rs), [worker_ipc.rs](../edge-client/src-tauri/src/worker_ipc.rs), [ingest.rs](../edge-client/src-tauri/src/ingest.rs), [anpr.rs](../edge-client/src-tauri/src/anpr.rs), [ANPR worker README](../anpr-worker/README.md).
- Relay/UI: [hal/config.rs](../edge-client/src-tauri/src/hal/config.rs), [hal/profiles.rs](../edge-client/src-tauri/src/hal/profiles.rs), [hal/contact.rs](../edge-client/src-tauri/src/hal/contact.rs), [hal/backends](../edge-client/src-tauri/src/hal/backends/), [hal/commands.rs](../edge-client/src-tauri/src/hal/commands.rs), [BarrierSettingsScreen](../edge-client/src/screens/BarrierSettingsScreen.tsx), [IPC types](../edge-client/src/lib/tauri.ts), [lock.rs](../edge-client/src-tauri/src/lock.rs).

Các test inline đã được đọc để đối chiếu, không phải tất cả đều đã chạy thành công trong lần viết này:

- Config/activation: migration v1, v2 không barrier, round-trip wiring, validate sai, API/password Debug redaction, refresh giữ token và barrier.
- FSM: full cycle, loop hold/auto-close 2,5 giây, lock/reboot, stuck, board-owned close, link incident và tuning contact.
- HAL/adapters: pulse timing, feedback, empty snapshot, retry OFF, backoff polling; mock HTTP/digest, fake Modbus TCP/C3 và byte frame LCUS.
- Access/store/sync: normalize, trạng thái xe, rule/schedule/anti-passback, cursor nhiều trang, auth không tiến cursor, rules snapshot, outbox cap và Store dedup qua reopen.
- Pipeline/runtime: allow mở gate, deny vẫn ghi/gửi, queue offline và flush reconnect, route command đúng gate/drop gate lạ, telemetry/heartbeat.
- Camera/ingest: worker config tắt barrier, tách RTSP credentials, route plate/snapshot, dedup eventId, camera key, heartbeat và check-vehicle local.

**Kết quả kiểm tra khi biên soạn:** `npm run lint` và `npm run build` chạy thành công. `cargo test --locked` đã compile xong nhưng hết giới hạn 120 giây ngay khi bắt đầu chạy unit-test binary; chưa có kết quả suite, không thể tuyên bố test Rust pass. Chưa chạy native installer build, feature ONNX, worker/model inference, live broker test hay QA camera/relay vật lý. Những giới hạn và điểm chưa hoàn thiện nêu trên là kết quả đọc đường thực thi hiện tại, không phải kết quả pentest hoặc chứng nhận an toàn phần cứng.
