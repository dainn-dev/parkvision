# ParkVision Edge — ứng dụng tại cổng

Ứng dụng desktop Tauri 2/Rust + React dành cho máy trực cổng, chủ yếu triển khai trên Windows. Một thiết bị có thể quản lý nhiều cổng vào/ra: nhận biển số, quyết định quyền qua cổng từ cache SQLite, điều khiển barrier, nhận lệnh MQTT và gửi dữ liệu về ParkVision.

**Đọc trước khi nối thiết bị thật:** cổng có `barrier: null` chạy `SimulatedHal`, không điều khiển relay. Cấu hình relay được lưu **cục bộ theo từng cổng**, không do backend cấp. Không dùng trạng thái mô phỏng hay góc cần ước lượng làm bằng chứng barrier vật lý đã mở/đóng.

- [Tài liệu kỹ thuật và vận hành chi tiết](../docs/edge-client.md): kiến trúc, activation, config v3, FSM, offline, MQTT, giới hạn và nguồn đối chiếu.
- [Đấu nối và cấu hình relay](../docs/barrier-relay-setup.md): hướng dẫn riêng cho barrier, không lặp lại tại đây.
- [ANPR worker](../anpr-worker/README.md): môi trường Python và model cho nhận diện camera.

## 1. Chuẩn bị môi trường

### Windows

- Node.js + npm; khuyến nghị Node.js 22.12+ hoặc bản LTS mới hơn tương thích dependency. Repo không ghim phiên bản Node riêng cho edge; dùng `npm ci` với `package-lock.json`.
- Rust stable qua rustup, target MSVC phù hợp máy. Repo dùng Rust edition 2021, không khai báo `rust-version`; image test Linux hiện dùng Rust 1.98. Không hiểu edition là phiên bản compiler tối thiểu.
- Visual Studio Build Tools với workload **Desktop development with C++**, MSVC và Windows SDK.
- Microsoft Edge WebView2 Runtime cho Tauri trên Windows.
- Truy cập được REST API, broker MQTT và camera/relay của site. Cần driver USB/serial nếu dùng COM.
- `.cargo/config.toml` đặt `target-cpu=x86-64-v2`: kiểm tra CPU máy đích có hỗ trợ. Không mặc định coi bản build hiện tại là portable cho mọi CPU/ARM.

Python, model và worker **không cần** để build UI hoặc thử nhập biển số thủ công. Chúng cần cho luồng camera sidecar. Docker chỉ là lựa chọn cho kiểm thử Rust/Linux, không thay thế bộ cài kiosk Windows.

### Linux để phát triển/kiểm thử

Cần các thư viện native GTK/WebKitGTK và udev của Tauri/serial. Danh sách đang dùng nằm trong [`Dockerfile.dev`](Dockerfile.dev). Repo có script Bash [`scripts/cargo-test.sh`](scripts/cargo-test.sh), hỗ trợ Git Bash/cygpath trên Windows.

## 2. Cài và chạy

Các lệnh dưới đây chạy từ thư mục `edge-client`:

```sh
npm ci
npm run tauri dev
```

`tauri dev` tự chạy `npm run dev`, mở Vite tại `http://localhost:1420` rồi khởi động ứng dụng native. Cổng 1420 được đặt `strictPort`; giải phóng cổng nếu đã bị chiếm. `TAURI_DEV_HOST` là tùy chọn của Vite; khi đặt, HMR dùng cổng 1421.

Chỉ xem giao diện bằng Vite:

```sh
npm run dev
```

Đây **không phải bản kiosk chạy đầy đủ** trong trình duyệt: các thao tác `invoke`/event cần Tauri. Vite không cấu hình proxy `/api`; Rust gọi trực tiếp `apiBaseUrl` lưu trong cấu hình.

## 3. Kích hoạt thiết bị

1. Quản trị viên cấp mã kích hoạt dùng một lần và gán cổng/làn/camera cho thiết bị.
2. Nhập API base URL, ví dụ dev `http://localhost:8000/api/v1`. Máy trực cổng khác máy backend phải dùng địa chỉ truy cập được từ máy đó; `localhost` luôn là chính máy đang chạy ứng dụng. Production nên dùng HTTPS.
3. Nếu mã bị ràng buộc IP, dùng **“IP server nhìn thấy thiết bị”** ở màn hình kích hoạt. IP góc dưới ứng dụng là IP local, không nhất thiết trùng IP backend nhìn thấy sau NAT/proxy.
4. Nhập mã, tùy chọn mật khẩu khóa giao diện rồi kích hoạt. Ứng dụng nhận danh tính tenant/site/device, API key, MQTT và `gates[]`, lưu cấu hình, khởi chạy runtime.
5. Chờ whitelist/rules đồng bộ; kiểm tra số lượng whitelist và thời điểm đồng bộ. Nhãn **Trực tuyến** chỉ phản ánh MQTT, không xác nhận REST hay relay hoạt động.
6. Dùng biểu tượng bánh răng trên đúng cổng để cấu hình barrier. Sau khi lưu, runtime được khởi tạo lại để áp dụng; thao tác trong thời gian bảo trì an toàn.

Mật khẩu kiosk chỉ khóa UI, khác với trạng thái FSM `locked` của cổng và khác với credential backend. Nó không dừng nhận diện hay lệnh từ xa. Các lệnh native hiện không kiểm tra khóa UI như một lớp phân quyền.

## 4. Nhận diện camera (tùy chọn)

Luồng sidecar hiện có: một worker cho **mỗi camera được gán**, POST về HTTP loopback của Rust; Rust giữ quyền quyết định và điều khiển barrier. Mặc định Cargo không bật feature `onnx`, nhưng worker Python vẫn có thể nhận diện nếu được cài và cấu hình riêng.

Xem [hướng dẫn worker](../anpr-worker/README.md) để chuẩn bị virtualenv, dependency và các artifact:

```text
models/
  yolo11n.pt
  LP_detector_nano_61.pt
  ultralytics_yolov5_master/
  paddleocr/
    det/
    rec/
```

Thư mục `ultralytics_yolov5_master/` phải chứa source YOLOv5 vendored, đặt **cạnh plate checkpoint** kể cả khi chuyển model ra ngoài checkout. Python loader tìm source theo thư mục cha checkpoint, không tự dùng source trong checkout worker nếu model nằm chỗ khác.

Rust tìm executable `camera-edge.exe`/`camera-edge` cạnh executable ứng dụng; hoặc dùng biến môi trường `PARKVISION_ANPR_WORKER_CMD`. Thư mục model là `PARKVISION_ANPR_MODEL_DIR`, mặc định `<app_data_dir>/models`.

Ví dụ **mẫu PowerShell, phải thay toàn bộ đường dẫn** bằng đường dẫn thực, không chứa khoảng trắng trong command worker:

```powershell
$env:PARKVISION_ANPR_WORKER_CMD = 'C:/REPLACE_ME/anpr-worker/.venv/Scripts/python.exe C:/REPLACE_ME/anpr-worker/run_camera_pipeline.py'
$env:PARKVISION_ANPR_MODEL_DIR = 'C:/REPLACE_ME/models'
npm run tauri dev
```

`REPLACE_ME` là placeholder, không phải thư mục có sẵn. Bộ tách command đang dùng `split_whitespace`, không xử lý shell quoting cho đường dẫn chứa khoảng trắng. Không thêm `--config`/`--run-camera`: supervisor tự thêm chúng.

Không resolve được command hoặc không có camera thì không khởi chạy worker. Lỗi worker không nhất thiết làm toàn bộ runtime dừng: kiểm tra trạng thái camera và log. `tauri.conf.json` hiện không khai báo đóng gói sidecar/model tự động; build app thành công không đồng nghĩa đã có đủ ANPR artifact.

Nhánh Rust RTSP/ONNX là lựa chọn khác, cần FFmpeg trong PATH và `detector.onnx`/`recognizer.onnx` trong `EDGE_MODEL_DIR` (mặc định `models` tương đối working directory). Không nhầm biến này với `PARKVISION_ANPR_MODEL_DIR`; xem giới hạn của nhánh ONNX trong tài liệu chi tiết trước khi dùng.

## 5. Kiểm tra và build

Từ `edge-client`:

```sh
npm run lint
npm run build
npm run tauri build
```

- `lint` là `tsc --noEmit`, không phải ESLint.
- `build` chỉ tạo web asset trong `dist/`.
- `tauri build` tự build frontend rồi build/bundle ứng dụng native. Với target mặc định, artifact thường ở `src-tauri/target/release/`, bundle trong thư mục `bundle/`; không coi đây là cam kết installer đã ký số hay đã kiểm thử trên máy đích.
- `npm run preview` chỉ xem web build, không thay cho Tauri.
- `package.json` không có script `npm test` cho frontend edge.

Từ `edge-client/src-tauri`:

```sh
cargo test --locked
```

Test Rust bao phủ config/activation, FSM, HAL/adapters, local access, SQLite, ingest và orchestration qua fake/mock. Test broker thật bị `#[ignore]`; chỉ chạy khi đã chuẩn bị broker dev tương thích, không dùng credential production:

```sh
cargo test --locked mqtt::tests::live_broker_roundtrip -- --ignored
```

Test này dùng `localhost:1883`, không truyền username/password. Broker yêu cầu auth/ACL có thể không phù hợp test hiện tại; test pass với fake không chứng minh wiring phần cứng đúng.

### Kiểm thử Rust qua Docker

Từ `edge-client`, sau khi Docker Engine hoạt động:

```sh
docker build -f Dockerfile.dev -t parkvision-edge-dev .
bash scripts/cargo-test.sh test --locked
```

Script mount `src-tauri` vào `/app`, cache registry ở volume `edge-cargo-registry`, target ở volume `edge-cargo-target` (`CARGO_TARGET_DIR=/target`). Cách này hữu ích khi Windows Smart App Control chặn binary build-script/test chưa ký. Đây là kiểm thử Linux; không xác nhận build MSI/NSIS, WebView2 hay thiết bị COM thật trên Windows.

## 6. Dữ liệu và an toàn vận hành

- Config: `<app_config_dir>/edge-config.json`; khóa UI: `<app_config_dir>/edge-lock.json`.
- SQLite: `<app_data_dir>/edge.db`; ảnh: `captures/`; cấu hình và dữ liệu worker: `camera-workers/`. Thư mục do Tauri resolve với identifier `com.parkvision.edge`, không nằm mặc định trong source tree. Trên Windows thường dưới `%APPDATA%/com.parkvision.edge`; hãy xác nhận đường dẫn trên máy thực tế.
- API key, MQTT password và relay password được che trong các `Debug` implementation liên quan. **JSON config vẫn chứa secret dạng rõ**, kể cả URL RTSP/cấu hình worker. Không commit, gửi log nguyên khối, hoặc chia sẻ bản sao chưa làm sạch.
- Refresh config từ backend giữ `gates[].barrier` của cổng có cùng `gateId`. Activation mới không khôi phục wiring đã mất sau deprovision; sao lưu cục bộ có kiểm soát trước bảo trì.
- Offline dùng whitelist/rules đã cache; không phải cập nhật quyền theo thời gian thực. Outbox ANPR hữu hạn 10.000 bản ghi; xem [giới hạn lưu/gửi lại](../docs/edge-client.md#6-offline-sqlite-và-đồng-bộ).
- Tick FSM mục tiêu 50 ms: relay I/O được chuyển sang actor theo cổng, không được thêm network/serial I/O chặn trong FSM. Đây không phải cam kết hard real-time cho toàn bộ runtime.
- Giữ cơ chế chống kẹp/loop của board barrier và nút dừng khẩn vật lý. Nút test relay tác động **ngay cả trước khi lưu form**. Chỉ thử khi khu vực chuyển động đã an toàn.

## 7. Đọc mã từ đâu?

- Khởi tạo app/Tauri: [`src-tauri/src/lib.rs`](src-tauri/src/lib.rs), [`tauri.conf.json`](src-tauri/tauri.conf.json).
- Runtime và các vòng lặp: [`runtime.rs`](src-tauri/src/runtime.rs).
- Cấu hình/activation: [`config.rs`](src-tauri/src/config.rs), [`activation.rs`](src-tauri/src/activation.rs).
- Điều khiển: [`fsm.rs`](src-tauri/src/fsm.rs), [`hal/`](src-tauri/src/hal/).
- Quyền/offline: [`access.rs`](src-tauri/src/access.rs), [`pipeline.rs`](src-tauri/src/pipeline.rs), [`store.rs`](src-tauri/src/store.rs), [`sync.rs`](src-tauri/src/sync.rs).
- Giao diện và hợp đồng IPC: [`src/App.tsx`](src/App.tsx), [`src/lib/tauri.ts`](src/lib/tauri.ts), [`src/screens/`](src/screens/).

Tài liệu mô tả triển khai hiện tại, không lấy các comment “later/Task …” làm tính năng đã hoàn thành. Danh sách nguồn, test đối chiếu và giới hạn nằm trong [tài liệu chi tiết](../docs/edge-client.md).
