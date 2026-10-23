# ANPR worker: kiến trúc, cấu hình và vận hành

Tài liệu đối chiếu implementation tại `anpr-worker/` và các điểm kết nối trong `edge-client`/`backend`. Nội dung mô tả hành vi hiện có, không coi tên class, comment hoặc CLI help là bằng chứng tính năng đã được nối vào runtime.

Chạy nhanh và cài dependency: [anpr-worker/README.md](../anpr-worker/README.md). Hợp đồng MQTT camera giám sát: [mqtt-camera-detection.md](mqtt-camera-detection.md). Điều khiển relay thật của kiosk: [barrier-relay-setup.md](barrier-relay-setup.md).

## Mục lục

1. [Ranh giới trách nhiệm và source](#1-ranh-gioi-trach-nhiem-va-source)
2. [Pipeline nhận diện và tracking](#2-pipeline-nhan-dien-va-tracking)
3. [Nguồn camera, CLI và vòng đời](#3-nguon-camera-cli-va-vong-doi)
4. [Cấu hình JSON và biến môi trường](#4-cau-hinh-json-va-bien-moi-truong)
5. [Model và dependency](#5-model-va-dependency)
6. [HTTP, IPC và MQTT/external detection](#6-http-ipc-va-mqtt-external-detection)
7. [Snapshot, retry, queue và trạng thái](#7-snapshot-retry-queue-va-trang-thai)
8. [Triển khai Docker CPU/GPU](#8-trien-khai-docker-cpu-gpu)
9. [Sidecar Tauri và giới hạn tích hợp](#9-sidecar-tauri-va-gioi-han-tich-hop)
10. [Tests và kiểm tra vận hành](#10-tests-va-kiem-tra-van-hanh)
11. [Chẩn đoán và giới hạn còn lại](#11-chan-doan-va-gioi-han-con-lai)

<a id="1-ranh-gioi-trach-nhiem-va-source"></a>
## 1. Ranh giới trách nhiệm và source

Worker chạy một camera/profile mỗi tiến trình, không cung cấp API nhận ảnh để suy luận từ xa. Đầu vào là ảnh/video cục bộ hoặc stream RTSP qua OpenCV. Đầu ra chính là event HTTP và JSON-Lines IPC stdout; snapshot/queue/audit nằm trên đĩa local.

Trong kiến trúc kiosk:

```text
camera file/RTSP
  → Python worker theo camera
      → HTTP ingest localhost của edge-client
          → kênh PlateReading của gate → Rust FSM / access / relay
      → stdout JSONL → Rust supervisor → trạng thái/preview cho UI
```

Không có MQTT client trong worker, không có broker URL/user/password hoặc MQTT reconnect trong config worker. Luồng camera monitor qua MQTT của backend là hợp đồng riêng, chưa được worker này tự chuyển đổi/phát ra.

Các source dùng để kiểm chứng:

- [CLI](../anpr-worker/run_camera_pipeline.py), [parser/default/validation](../anpr-worker/edge/camera_config.py), [runtime OpenCV](../anpr-worker/edge/camera_runtime.py).
- [Orchestration](../anpr-worker/edge/camera_processing_service.py), [MOG2](../anpr-worker/edge/motion_gate.py), [vehicle detector](../anpr-worker/edge/vehicle_detector.py), [plate detector](../anpr-worker/edge/plate_detector.py), [OCR](../anpr-worker/edge/ocr_engine.py), [ByteTrack/lifecycle](../anpr-worker/edge/vehicle_tracker.py).
- [HTTP ingest/retry/heartbeat](../anpr-worker/edge/camera_ingest_client.py), [event types](../anpr-worker/edge/camera_types.py), [queue](../anpr-worker/edge/camera_event_queue.py), [snapshots](../anpr-worker/edge/snapshot_store.py), [tracker audit](../anpr-worker/edge/tracker_state_store.py).
- [IPC](../anpr-worker/edge/ipc_protocol.py), [metrics](../anpr-worker/edge/prometheus_metrics.py), [access adapter](../anpr-worker/edge/plate_access_client.py), [barrier Python](../anpr-worker/edge/barrier_controller.py).
- [Sinh config/giám sát trong Rust](../edge-client/src-tauri/src/camera_worker.rs), [HTTP ingest Rust](../edge-client/src-tauri/src/ingest.rs), [MQTT bridge backend](../backend/app/realtime/mqtt_bridge.py).
- [Profile mẫu](../anpr-worker/camera-pipeline.dry-run.example.json), [Dockerfile](../anpr-worker/Dockerfile), [core requirements](../anpr-worker/requirements.txt), [OCR requirements](../anpr-worker/requirements-ocr.txt), [PyInstaller spec](../anpr-worker/camera-edge.spec).

<a id="2-pipeline-nhan-dien-va-tracking"></a>
## 2. Pipeline nhận diện và tracking

### 2.1 Trình tự xử lý một frame

`CameraProcessingService.process_frame()` thực hiện tuần tự:

1. Flush các event đã đến hạn trong queue HTTP, tăng số frame, giữ ảnh BGR `uint8` và metadata.
2. MOG2 đánh giá chuyển động. Chỉ trạng thái **`active`** mới chạy detector xe, detector biển số và OCR.
3. YOLOv11 phát hiện xe; ByteTrack được cập nhật ở **mọi frame được xử lý**, kể cả với danh sách rỗng khi motion không active.
4. YOLOv5 chạy trên vùng xe đã padding. Candidate hợp lệ được lưu ảnh gốc/plate crop trước khi OCR.
5. PaddleOCR đọc trực tiếp crop trong RAM, không đọc lại JPEG đã nén. Candidate không lưu được crop bị loại khỏi bước OCR; lỗi ảnh gốc không ngăn lưu crop/OCR.
6. Lifecycle manager kết hợp tracks và quan sát OCR, cập nhật audit SQLite, phát các event lifecycle và HTTP.
7. Nếu có sự kiện nhận biển số và barrier Python bật, gọi access API rồi thử mở barrier khi được duyệt.

Lỗi vehicle inference/tracking trả về danh sách rỗng và ghi log; lỗi plate/OCR/snapshot được cô lập theo xe/candidate để các candidate khác tiếp tục. Điều này tránh một lỗi inference làm chết toàn bộ vòng xử lý, nhưng có thể gây track mất dấu/exit khi lỗi kéo dài. Không có luồng riêng cho inference hoặc gửi event: HTTP retry/flush và access check có thể làm chậm capture loop.

### 2.2 Motion gate MOG2

Ảnh được chuyển grayscale, MOG2 tạo mask. Chỉ pixel giá trị `255` tính là foreground; shadow `127` không tính. Ngưỡng diện tích là `max(1, ceil(width × height × min_foreground_area_ratio))`.

Vòng trạng thái: `warming_up → inactive → active → cooldown → inactive`.

- Warmup cập nhật background, chưa chạy detector.
- Cần đủ `min_consecutive_active_frames` liên tiếp đạt ngưỡng để active.
- Một frame yên tĩnh kết thúc active; cooldown bỏ qua kích hoạt mới cho tới hết số frame cấu hình.
- `MotionWindow` giữ các frame debounce, nhưng service hiện chỉ suy luận trên frame hiện tại khi active, không chạy bù toàn bộ frame đã giữ.
- Các tham số là **số frame đã được pipeline xử lý**, không phải FPS gốc camera. Với interval `200 ms`, warmup `30` tương đương khoảng 6 giây nếu đạt đúng 5 frame/s.

Xe đứng yên có thể bị MOG2 hấp thụ vào background. Đây không phải bộ theo dõi occupancy liên tục hoặc phép xác định xe đã rời bãi.

### 2.3 Vehicle detector

Adapter `UltralyticsVehicleDetector` dùng `ultralytics.YOLO` và `.predict()`, truyền `imgsz`, `conf`, `iou`, `device`, chỉ chọn class tên `car`, `motorcycle` hoặc `motorbike`. Output chuẩn hóa về `car`/`motorbike`; **truck/bus không được giữ**. Model không có các class tương ứng bị từ chối ở readiness.

Bounding box được floor/ceil, clamp về kích thước ảnh gốc, loại box rỗng hoặc dữ liệu không hữu hạn. Không có ROI/polygon zone configurable trong pipeline này.

### 2.4 Plate detector

`LocalYoloV5PlateDetector` dùng `torch.hub.load(..., "custom", source="local")` với source vendored, không chọn hub GitHub thay thế trong adapter.

- Mở rộng box xe theo `plate_padding_ratio`, clamp về ảnh gốc, suy luận trên crop xe.
- Áp confidence threshold, chuyển tọa độ crop về ảnh gốc, loại biển nhỏ hơn `min_plate_width_px`/`min_plate_height_px`.
- Cùng `plate_padding_ratio` được dùng để padding crop biển số phục vụ OCR; không có hai cấu hình padding độc lập.
- Có thể giữ nhiều candidate trên cùng một xe; không có bước chọn duy nhất một biển số hoặc hiệu chỉnh phối cảnh/deskew trong adapter.

### 2.5 OCR tiếng Việt

Production chỉ có `LocalPaddleOcrEngine`, sử dụng local `det/` và `rec/`, `use_angle_cls=false`, gọi `.ocr(..., det=True, cls=False)`.

- `ocr.languages` là danh sách nhưng factory chỉ nhận **phần tử đầu tiên** làm `lang`; mẫu `["en", "vi"]` không có nghĩa chạy hai engine hoặc ensemble tiếng Anh–Việt.
- Các text box được gom hàng theo vị trí, sắp từ trên xuống dưới và trái sang phải. Confidence tổng hợp có trọng số theo số ký tự sau chuẩn hóa.
- Chuẩn hóa NFKC/NFKD, bỏ dấu, chuyển `Đ/đ` thành `D/d`, uppercase, chỉ giữ `A–Z`, `0–9`. Ví dụ `51F-123.45 → 51F12345`.
- Không sửa suy đoán `O↔0`, không kiểm tra regex biển số Việt Nam, không vote nhiều frame để xác nhận chuỗi.
- Text rỗng không được nhận. Với confidence thấp hơn ngưỡng: `reject` loại; `accept_flagged` cho downstream nếu có confidence, vẫn giữ disposition `low_confidence` trong quan sát/log.
- Disposition `low_confidence` không được thêm thành flag riêng vào HTTP `PlateRecognized`; bên nhận phải dựa score và model threshold nếu cần phân biệt.
- `comparators` chỉ là metadata cho so sánh offline; EasyOCR/VietOCR không được khởi tạo, không có fallback tự động. Parser buộc `automatic_fallback=false`.

Output debug bị giới hạn: 16 item, text/item 64 ký tự, display text 128 ký tự, ngân sách debug 8192 byte. Đây không phải benchmark chất lượng nhận diện trên dữ liệu production.

### 2.6 Tracking và lifecycle

ByteTrack của Ultralytics nhận box xe, ngưỡng high/low/match/buffer; track chỉ được service nhìn thấy khi đủ `min_hits`. Adapter hỗ trợ cả API có và không có tham số `frame_rate`.

`TrackStateManager` phát:

- `enter`: track xuất hiện lần đầu → HTTP `VehicleDetected`.
- `plate-recognize`: mỗi biển số chuẩn hóa được chấp nhận chỉ phát một lần trong một track → HTTP `PlateRecognized`, liên kết `causationEventId` tới event xe.
- `relocate`: tâm box dịch ít nhất `0.25 × đường chéo box trước đó` giữa hai quan sát liên tiếp → HTTP `SnapshotSaved`, `lifecycle="relocate"`.
- `exit`: track vắng mặt quá `buffer_frames` (**`>`**, không phải `>=`) tính theo frame pipeline → HTTP `SnapshotSaved`, `lifecycle="exit"`.

Liên kết OCR với track theo IoU vùng xe lớn nhất, chỉ cần overlap > 0. `best_plate` là quan sát có confidence cao nhất; những chuỗi OCR khác nhau vẫn có thể mỗi chuỗi phát một event trong cùng track. Không có global dedup giữa camera, track hoặc lần restart. `relocate` là chuyển động tọa độ ảnh, **không đồng nghĩa đổi parking zone**; `exit` là mất dấu, không tự biến thành event xe ra cổng.

<a id="3-nguon-camera-cli-va-vong-doi"></a>
## 3. Nguồn camera, CLI và vòng đời

Từ thư mục `anpr-worker/`, mọi mode cần `--config FILE` và chỉ chọn **một** mode:

```sh
python run_camera_pipeline.py --help
python run_camera_pipeline.py --config camera-pipeline.dry-run.example.json --dry-run-sequence static
```

### Các mode

- `--dry-run`: chỉ đọc/verify một **ảnh** local qua Pillow, ghi metadata và log các stage bị skip. Không mở RTSP, không nạp model, không xử lý video. Với profile `ingest.dry_run=true`, tracker audit nằm trong RAM; xem lưu ý tác dụng phụ phía dưới.
- `--dry-run-sequence static|moving-vehicle`: tạo ảnh BGR tổng hợp trong RAM, gọi service thật. Không mở nguồn camera. Nhánh moving có thể gọi model, snapshots, ingest/access nếu cấu hình cho phép. Summary ghi số cửa sổ motion và độ trễ debounce; lỗi adapter có thể chỉ được log rồi tiếp tục.
- `--validate-runtime`: kiểm tra source file, camera key, tồn tại artifact, quyền ghi; sau đó `ensure_ready()` nạp vehicle/plate/OCR, khởi tạo ByteTrack và kiểm tra store/ingest. Không capture/inference nhưng **không phải validation hoàn toàn không tác dụng phụ** như CLI help mô tả.
- `--run-feed PATH`: CLI path tính từ working directory, được resolve rồi thay nguồn config thành `file`. Ảnh xử lý một lần khi `--max-frames=0`, hoặc lặp đúng N lần; video đọc hết hoặc tới N frame. Timestamp tổng hợp từ thời điểm bắt đầu cộng `frame_interval_ms`, không sleep/pacing theo thời gian thật. Một ảnh duy nhất thường chưa vượt warmup/debounce/tracker min hits.
- `--run-camera`: dùng nguồn file/RTSP cấu hình; file đọc một lượt rồi thoát, RTSP reconnect tới khi dừng hoặc đủ số frame. Có heartbeat HTTP riêng nếu không dry-run ingest.

### Tham số và exit code

- `--max-frames`: mặc định **0**; với `--run-camera` là không giới hạn (file vẫn dừng khi EOF), đếm frame đã gọi `process_frame`, không đếm mọi frame decode. Với `--run-feed`, 0 nghĩa đọc cả video hoặc một ảnh. Số âm bị từ chối ở hai mode này; không áp dụng cho mode diagnostic.
- `--reconnect-seconds`: mặc định **2.0 giây**, phải >= 0 khi chạy camera. Chỉ dùng cho RTSP reconnect, không phải timeout socket hay backoff HTTP.
- `0`: mode hoàn thành bình thường; không chứng minh có nhận diện hoặc đã gửi event thành công.
- `2`: parse config hoặc giá trị `DAI_EDGE_METRICS_PORT` không hợp lệ; argparse cũng dùng 2 cho lỗi CLI.
- `3`: `ConfigValidationError` trong readiness/chạy mode.
- `4`: nhánh unsupported mode dự phòng; argparse thông thường đã ngăn tới nhánh này.
- Ngoại lệ không được bắt có thể tạo traceback/exit khác, không được đảm bảo nằm trong nhóm code trên.

### RTSP và tốc độ

Config chỉ chấp nhận `source.type="file"` hoặc `"rtsp"`; RTSP URL hỗ trợ scheme `rtsp`/`rtsps`. Không có webcam index, USB, HTTP/MJPEG source hoặc ONVIF discovery trong schema hiện tại.

Credentials riêng được percent-encode rồi chèn vào URL khi mở capture. Khi không có username riêng, giữ URL như đã cấu hình. Ưu tiên trường/env riêng thay vì nhúng secret vào URL.

RTSP dùng `cv2.CAP_FFMPEG`; file dùng backend OpenCV mặc định. Loop decode liên tục nhưng chỉ inference khi đến hạn interval, bỏ frame giữa hai lần inference. File ở `--run-camera` cũng dùng pacing dựa monotonic, không dùng timestamp video để lấy mẫu đều; để replay offline dùng `--run-feed`.

Khi mở/read RTSP thất bại: release capture, log reconnect, flush queue, đợi khoảng cấu hình rồi mở lại. Không giới hạn số lần, không exponential backoff, không cấu hình open/read timeout OpenCV trong source. `stop_event` không đảm bảo ngắt ngay một `capture.read()` đang block. SIGINT/SIGTERM chỉ được gắn handler trong `--run-camera`.

**Không nhầm hai loại dry-run:** `ingest.dry_run=true` chỉ tắt event/heartbeat HTTP và dùng tracker audit trong RAM; snapshot vẫn có thể ghi, `check-vehicle` vẫn có thể gọi mạng nếu barrier bật. Ngược lại, `--dry-run` không tự sửa `ingest.dry_run`: service được tạo trước khi chọn mode nên với ingest thật vẫn có thể tạo `tracker-state.sqlite3`. Để smoke test ít tác dụng phụ, dùng profile `ingest.dry_run=true`, `barrier.enabled=false`, metrics tắt.

<a id="4-cau-hinh-json-va-bien-moi-truong"></a>
## 4. Cấu hình JSON và biến môi trường

### 4.1 Quy tắc nạp

Bắt đầu từ [camera-pipeline.dry-run.example.json](../anpr-worker/camera-pipeline.dry-run.example.json). Không có `.env` loader, không tự tìm config, không hot reload. Muốn đổi cấu hình tiến trình đang chạy phải khởi động lại.

- JSON phải là object; nhóm bắt buộc: `pipeline`, `camera`, `models`, `thresholds`, `ocr`, `snapshot`, `ingest`, `logging`. `barrier`, `preview` được bỏ qua và dùng default nếu thiếu.
- File source, model, snapshot output và queue path tương đối tính từ **thư mục JSON**; `~` được expand. Di chuyển JSON sang thư mục khác có thể làm toàn bộ relative paths sai.
- Env override chỉ được áp sau khi đọc trường JSON. Không dùng env để bù việc bỏ các trường JSON bắt buộc; parser vẫn thu thập lỗi thiếu trường.
- Override chỉ nhận chuỗi sau trim không rỗng. Env trống không xóa được giá trị JSON.
- Ba ID camera/tenant/site phải là UUID. Worker không gọi backend kiểm chứng quan hệ tenant/site/camera.
- Các trường `artifact_version` là provenance do người triển khai cung cấp, không tải model theo version, không hash file trọng số.

### 4.2 Trường bắt buộc: giá trị mẫu, KHÔNG phải default

Nếu không ghi rõ là tùy chọn ở phần sau, phải khai báo trường. Các giá trị dưới đây lấy từ profile mẫu:

- `pipeline.id="lpr-mvp-v1"`, `event_version=1`: chỉ chấp nhận đúng cặp này. `frame_interval_ms=200`, số nguyên >= 1.
- `camera.tenant_id`, `site_id`, `id`: UUID. `source.type="file"` + `path="../backend/test_image.png"` trong mẫu; đổi sang `type="rtsp"` + `url` để dùng stream. Ảnh mẫu đó **không có trong repo đã kiểm tra**. `username`/`password` tùy chọn, mặc định chuỗi rỗng.
- `models.vehicle_detector`: `name="yolo11n"`, `artifact_path="model/yolo11n.pt"`, `artifact_version="2026.07.0"`, `image_size=640`, `device="cpu"`.
- `models.plate_detector`: `name="lp-detector-nano"`, `artifact_path="model/LP_detector_nano_61.pt"`, `artifact_version="61"`, `image_size=640`, `device="cpu"`.
- `models.ocr`: `name="PaddleOCR"`, `artifact_path="model/paddleocr"`, `artifact_version="pp-ocr-mobile"`, `device="cpu"`; không yêu cầu `image_size` cho OCR.
- Cả ba `device` chỉ chấp nhận `cpu`, `cuda`, `cuda:<chỉ số không âm>`. Không tự fallback CPU khi CUDA không sẵn sàng.
- `thresholds.motion`: `history=500` (>= 1), `var_threshold=16` (>= 0), `detect_shadows=false`, `min_foreground_area_ratio=0.005` (> 0 và <= 1), `min_consecutive_active_frames=2` (>= 1), `warmup_frames=30`, `cooldown_frames=10` (đều >= 0).
- `thresholds.vehicle`: `confidence=0.4`, `nms_iou=0.5`, đều trong [0, 1].
- `thresholds.plate_confidence=0.6`, `plate_padding_ratio=0.1`, `ocr_confidence=0.8`, đều trong [0, 1]; `min_plate_width_px=20`, `min_plate_height_px=8`, số nguyên >= 1.
- `thresholds.tracker`: `high_confidence=0.4`, `low_confidence=0.1`, `match=0.8` trong [0, 1], low không vượt high; `buffer_frames=30`, `min_hits=3`, số nguyên >= 1.
- `ocr.primary="PaddleOCR"`, `languages=["en", "vi"]`, `comparators=["EasyOCR", "VietOCR"]`, `automatic_fallback=false`, `low_confidence_policy="reject"`. Policy có thể là `accept_flagged`. Cả `languages` và `comparators` hiện buộc là danh sách **không rỗng**, dù comparators không được chạy.
- `snapshot.backend="local"`, `content_type="image/jpeg"`: chỉ hỗ trợ đúng hai giá trị này. `output_dir="camera-snapshots"`, `jpeg_quality=80` (1..100), `max_width=1280` (>= 1).
- `ingest.url="http://localhost:8080/api/v1/parking-events"`: URL ví dụ, không phải endpoint tự chạy. Phải là HTTP(S). `timeout_seconds=10` (nguyên >= 1), `snapshot_part="snapshot"` (chỉ chấp nhận tên này), `dry_run=true`, `max_attempts=3` (>= 1), `retry_base_seconds=0.5`, `retry_max_seconds=5.0` (>= base, đều >= 0). `camera_key` tùy chọn lúc parse, mặc định rỗng; runtime validation vẫn buộc key không rỗng, kể cả ingest dry-run.
- `logging.level="INFO"`, `service="camera-pipeline"`: level còn hỗ trợ DEBUG/WARNING/ERROR/CRITICAL. Logger chính ghi JSON qua stderr; `service` là nhãn trong JSON, không đổi tên tiến trình.

### 4.3 Trường tùy chọn: default thực của JSON parser

**Ingest queue/heartbeat:**

- `ingest.queue_enabled`: **true** khi thiếu trong JSON. Dataclass `IngestConfig` dùng trực tiếp trong Python có default **false**; đừng lấy default dataclass làm default CLI.
- `ingest.queue_path`: **`camera-event-queue.sqlite3`**, relative theo JSON.
- `ingest.queue_max_events`: **5000**, số nguyên >= 1.
- `ingest.queue_retry_seconds`: **5.0**, >= 0.1 giây.
- `ingest.heartbeat_interval_seconds`: **20.0**, >= 0.1 giây.

**Preview:**

- `preview.enabled`: **false**.
- `preview.max_fps`: **5.0**, >= 0.1.
- `preview.max_width`: **640**, số nguyên >= 32.
- `preview.jpeg_quality`: **60**, parser chỉ kiểm tra >= 1, hiện không có trần 100; khi vận hành nên chọn 1..100.

**Barrier Python:**

- `barrier.enabled`: **true**; `backend`: **`simulation`**.
- `barrier.open_duration_s`: **5.0**, `close_cooldown_s`: **2.0**; >= 0, nhưng phải > 0 nếu bật barrier.
- `pin_open`/`pin_close`: **null** ở simulation; khi backend `gpio`, parser dùng default **17/27**, số nguyên >= 0.

Đối với ParkVision kiosk, đặt `barrier.enabled=false`; phần điều khiển thật nằm trong Rust, không dùng default standalone này để triển khai relay.

### 4.4 Biến môi trường worker

Không có giá trị env mặc định cứng cho các override sau; khi thiếu/trống sẽ giữ giá trị JSON (riêng credential tùy chọn mặc định rỗng):

- `DAI_CAMERA_SOURCE` → `camera.source.path` hoặc `url`, **không đổi `source.type`**.
- `DAI_CAMERA_SOURCE_USERNAME` → `camera.source.username`.
- `DAI_CAMERA_SOURCE_PASSWORD` → `camera.source.password`.
- `DAI_TENANT_ID` → `camera.tenant_id`.
- `DAI_SITE_ID` → `camera.site_id`.
- `DAI_CAMERA_ID` → `camera.id`.
- `DAI_INGEST_URL` → `ingest.url`.
- `DAI_CAMERA_KEY` → `ingest.camera_key`.
- `DAI_SNAPSHOT_OUTPUT_DIR` → `snapshot.output_dir`; path tương đối vẫn tính theo JSON.

`DAI_EDGE_METRICS_PORT` được CLI đọc riêng: mặc định chuỗi **`"0"`** (tắt); nhận số nguyên 0..65535, > 0 mở HTTP server trên **`0.0.0.0:<port>`**. Endpoint `GET /metrics` hoặc `/metrics/`, không có auth. Chỉ có `edge_ocr_attempts_total{camera="...",outcome="complete|failed"}`; `complete` gồm cả OCR text rỗng/low-confidence nếu inference không lỗi, không phải số biển được chấp nhận. Chọn port khác nhau cho nhiều worker và chỉ expose qua mạng tin cậy.

Không có override worker cho model path, GPU, threshold, queue hay `ingest.dry_run`: sửa JSON rồi restart.

### 4.5 Env của host Rust, không phải parser Python

- `PARKVISION_ANPR_WORKER_CMD`: tùy chọn; nếu thiếu, tìm `camera-edge.exe` rồi `camera-edge` cạnh executable ứng dụng. Chuỗi override bị `split_whitespace()`, **không parse shell quoting**; đường dẫn có khoảng trắng dễ thất bại.
- `PARKVISION_ANPR_MODEL_DIR`: tùy chọn; default **`<app_data>/models`**. Rust dùng nó để sinh ba model paths, không phải Python trực tiếp đọc biến này. Nên dùng absolute path.

Rust thêm `--config <generated.json> --run-camera` khi spawn. Child kế thừa môi trường host; một `DAI_*` toàn cục có thể override ngoài ý muốn cấu hình riêng nhiều camera.

`configurationHash` là SHA-256 của các setting pipeline/model/threshold/OCR/snapshot/barrier đã chọn, không bao gồm secret, UUID camera, path host, ingest, logging hay preview. Nó không phải checksum model hoặc toàn bộ cấu hình deployment.

<a id="5-model-va-dependency"></a>
## 5. Model và dependency

### 5.1 Bố trí artifact bắt buộc

Profile mẫu nằm trong `anpr-worker/` mong đợi:

```text
anpr-worker/model/
├── yolo11n.pt
├── LP_detector_nano_61.pt
├── ultralytics_yolov5_master/
│   ├── hubconf.py
│   ├── models/
│   └── utils/
└── paddleocr/
    ├── det/
    └── rec/
```

Repo chỉ có source YOLOv5 vendored tại vị trí này; checkpoint và bundle PaddleOCR không đi kèm. Không có script cấp phát toàn bộ model production, manifest checksum hoặc URL tải trọng số riêng của ParkVision trong worker. Không dùng script download vendor như thể nó cấp đúng `LP_detector_nano_61.pt`.

**Ràng buộc quan trọng:** loader biển số tính repository bằng `plate_checkpoint.parent / "ultralytics_yolov5_master"`, không tìm cố định trong `/app/model`. Nếu checkpoint ở `/models/LP_detector_nano_61.pt`, source phải nằm ở `/models/ultralytics_yolov5_master/`. Mount trọng số nơi khác mà chỉ giữ source ở `/app/model` sẽ không đủ.

PaddleOCR yêu cầu `det/` và `rec/` là bundle inference tương thích PaddleOCR 2.10/Paddle runtime đã cài. Adapter kiểm tra thư mục, sau đó để thư viện nạp nội dung; không định nghĩa một bộ tên file/checksum riêng hay xác minh bundle chỉ bằng việc thư mục tồn tại. Không cần bundle angle classifier vì `use_angle_cls=false`. Chọn model recognition/character dictionary phù hợp `lang` thực dùng, không suy ra hỗ trợ tiếng Việt đầy đủ chỉ từ tên config.

Artifact `.pt` phải từ nguồn tin cậy vì checkpoint có thể dùng cơ chế deserialize Python. Không cấp model từ upload tùy ý của người dùng. `artifact_version` là nhãn, không chứng minh toàn vẹn.

### 5.2 Dependency và khả năng offline

Core requirements: `opencv-python`, `numpy<2.0`, `Pillow`, `torch`, `torchvision`, `tqdm`, `pyyaml`, `requests`, `pandas`, `ultralytics`, `lap>=0.5.12`, `scipy`. Không cài GUI desktop PyQt/âm thanh. Pytest/PyInstaller không nằm trong requirements runtime, cần cài riêng cho test/build sidecar.

OCR CPU pin `paddleocr==2.10.0`, `paddlepaddle==3.0.0`. GPU thay Paddle CPU bằng build Paddle GPU phù hợp CUDA/driver; không cài cả hai. Dependency core đa phần không pin nên cài lại ở thời điểm khác có thể đổi API/khả năng tương thích checkpoint. Python 3.11 là baseline Docker; không có cam kết source hỗ trợ mọi Python mới hơn.

Các adapter yêu cầu local artifact và plate adapter dùng `source="local"`; **không nên diễn giải thành bảo đảm tuyệt đối không truy cập mạng**. `hubconf.py` vendored vẫn gọi `check_requirements(...)`, cùng helper tải model của vendor; thư viện có thể kiểm tra/cài dependency khi thiếu. Kiểm thử cold-start với đầy đủ artifact/dependency và chính sách mạng mong muốn trước khi đưa vào môi trường offline.

<a id="6-http-ipc-va-mqtt-external-detection"></a>
## 6. HTTP, IPC và MQTT/external detection

### 6.1 Event HTTP outbound

`CameraIngestClient` gửi `POST ingest.url`, không tự thêm `/api/v1/parking-events`. Đây là giao thức worker với bên nhận (trong ParkVision là HTTP localhost của Rust), **không phải route FastAPI hiện có chỉ cần trỏ sang port backend là dùng được**. Không thấy route cùng tên trong `backend/app/` đã đối chiếu.

Headers:

```text
Accept: application/json
X-Camera-Id: <camera UUID>
X-Camera-Key: <camera key>
Idempotency-Key: <eventId>
```

Envelope luôn có `eventId`, `eventType`, `cameraId`, `occurredAt`, `payload`. Không gửi `tenantId`/`siteId` ở envelope. `occurredAt` là timestamp có timezone; bên nhận phải định tuyến/ủy quyền camera bằng credential và registry của mình.

- `VehicleDetected`: payload chứa `eventVersion=1`, `pipeline.id/configurationHash`, `frame`, `tracker.sessionId/trackId`, `vehicle`, provenance `models.vehicleDetector`, snapshot descriptors nếu có.
- `PlateRecognized`: các trường trên cộng `causationEventId`, `plate.text`, `normalizedText`, `detectionConfidence`, `recognitionConfidence`, `boundingBox`, provenance cả ba model và descriptors ảnh.
- `SnapshotSaved`: `eventVersion=1`, `lifecycle` (`relocate`/`exit`), `tracker`, `snapshots`, `causationEventId` nếu có. Không phải HTTP event type `VehicleExited` hay MQTT `vehicle_left`.

Box dùng tọa độ ảnh gốc dạng `{x,y,width,height}`. Descriptors chứa thông tin ảnh/hash/kích thước, không phải local storage path để bên nhận tự đọc đĩa.

Không có ảnh thì gửi JSON với `Content-Type: application/json`. Có ảnh thì gửi `multipart/form-data` do Requests dựng boundary, part **`event`** là JSON.

**Tên part ảnh theo đường gọi:**

- Nếu gọi `CameraIngestClient.send(event, Path(...))` trực tiếp: part **`snapshot`**.
- Pipeline thật truyền dictionary, part theo kind: **`original_frame`**, **`plate_crop`**. Queue replay giữ các tên này.
- Dù vậy metadata event `snapshotUpload.part` hiện vẫn ghi **`snapshot`**, và `ingest.snapshot_part` parser chỉ chấp nhận `snapshot`. Không dùng metadata đó như mô tả chính xác các part pipeline hiện gửi.

ACK thành công duy nhất được Python nhận:

```http
HTTP/1.1 202 Accepted
Content-Type: application/json

{"eventId":"50000000-0000-0000-0000-000000000001","status":"accepted"}
```

`eventId` phải trùng event đang gửi. `200`, `201`, `204` không được coi là thành công; `202` thiếu/sai body là lỗi không retry. Bên nhận do bên ngoài triển khai cần giữ cùng ID khi ACK và hỗ trợ idempotency, không chỉ trả một mã 2xx bất kỳ.

### 6.2 Heartbeat HTTP

Chỉ `--run-camera` tự khởi động heartbeat, gửi ngay rồi theo chu kỳ; `ingest.dry_run=true` tắt heartbeat. URL suy ra từ `ingest.url`: giữ scheme/authority và prefix trước `/api/`, thay suffix bằng `/api/cameras/<cameraId>/heartbeat`; nếu không có `/api/`, dùng path hiện tại đã bỏ slash cuối làm prefix. Query/fragment bị bỏ.

Gửi POST không body, headers `Accept`, `X-Camera-Id`, `X-Camera-Key`, timeout bằng ingest timeout. Chỉ `200` là thành công. Khi thất bại, interval tăng gấp đôi tới tối đa 300 giây theo công thức `min(300, max(base_interval, previous_interval × 2))`; thành công reset base. Đây không phải retry queue event và không xác nhận đang đọc được camera: heartbeat thread vẫn có thể gửi trong lúc RTSP reconnect.

### 6.3 Access check và barrier Python

Khi `PlateRecognized` được tạo, nếu `barrier.enabled=true` thì sau lời gọi ingest sẽ POST tới **`/api/vehicles/check-vehicle`** trên cùng scheme/authority với ingest (bỏ toàn bộ path prefix/query). Session dùng `X-Camera-Key`, không thực sự gửi `X-Gate-Key` dù docstring nhắc tên đó.

Body:

```json
{"licensePlateNumber":"51F12345","type":"entry"}
```

Pipeline không truyền direction nên luôn dùng default **`entry`**. Client đọc `success` (thiếu thì true), `approved` (thiếu thì false), `message`. Không có retry bền vững cho access check. Lỗi mạng trả kết quả từ chối; exception được service log/cô lập. Việc kiểm tra không phụ thuộc ingest đã nhận ACK hay chưa, và **không bị chặn bởi `ingest.dry_run`**.

Standalone mặc định dùng `SimulatedBarrierController`, không điều khiển phần cứng. Nhánh GPIO dùng `gpiozero.OutputDevice`, nhưng dependency `gpiozero` không nằm trong requirements và service readiness không gọi barrier `ensure_ready()`. Timer tự đóng chỉ được kiểm tra khi đọc `.state` hoặc gọi `.open()`, không có scheduler tự chạy; service không poll state liên tục. Vì vậy không xem đây là đường điều khiển barrier production đã hoàn chỉnh. Kiosk ParkVision tắt nhánh này, sử dụng Rust FSM và relay HAL theo [barrier-relay-setup.md](barrier-relay-setup.md).

### 6.4 IPC stdout và preview

IPC là mỗi dòng một JSON, `print(..., flush=True)`. Logger service chính dùng stderr; supervisor cần tách hai kênh, không parse toàn bộ stderr như IPC.

Các event thực sự nối vào đường chạy được kiểm tra:

- `stream.connected`: RTSP mở được, gồm camera ID, width/height/FPS; codec hiện hardcode **`h264`**, không phải codec được dò. FPS không có thì fallback 15.0.
- `stream.error`: lỗi không mở được RTSP dùng code `RTSP_CONNECT_TIMEOUT` chung; không phải luôn phân loại chính xác lỗi auth/DNS/timeout.
- `frame.observed`: mỗi **150 frame pipeline**, không phải mỗi 10 giây cố định. Interval 200 ms cho khoảng 30 giây nếu đạt 5 FPS. Timestamp hàm emit nối thêm `Z` kể cả input đã có offset, có thể tạo chuỗi kiểu `+00:00Z` không chuẩn; không dùng như timestamp chuẩn đã xác minh.
- `preview.frame`: khi `preview.enabled`, JPEG base64, `format="jpeg"`, width/height, cameraId, `at`. Downscale nếu vượt max width; không upscale; được giới hạn FPS trước bước inference. Lỗi encode bị bỏ qua để không làm chết pipeline.
- Các event barrier khi nhánh Python được kích hoạt. `barrier.opened/closed` từ controller hiện có thể có `cameraId=null`.

`worker.ready/stopping/stopped`, `queue.depth`, `stream.disconnected` có helper trong `ipc_protocol.py`, nhưng entry point/service/runtime hiện không gọi các helper đó. Không dùng chúng làm cam kết readiness/shutdown/queue telemetry. Việc một helper tồn tại không có nghĩa có event tương ứng trên stdout.

`edge/preview_server.py` chứa server MJPEG Python mặc định `127.0.0.1:8765`, nhưng **không được entry point hiện tại khởi động**. Preview đang chạy đi qua IPC tới host Rust; không có HTTP preview port mặc định được worker mở.

### 6.5 MQTT và bộ nhận diện bên ngoài

Hợp đồng monitor camera của backend nằm tại [mqtt-camera-detection.md](mqtt-camera-detection.md):

```text
tenants/{tenantId}/sites/{siteId}/cameras/{cameraId}/detection
QoS 1, JSON camelCase
```

Ví dụ payload của một publisher bên ngoài:

```json
{
  "type": "vehicle_parked",
  "plateNumber": "51F-123.45",
  "zoneCode": "S03",
  "confidence": 0.93,
  "occurredAt": "2026-09-29T08:30:00+07:00"
}
```

`vehicle_parked`/`vehicle_seen` cập nhật presence, `vehicle_left` đánh dấu rời vùng, `zone_snapshot` tham chiếu `snapshotKey` đã upload. Backend resolve zone theo `zoneId`, `zoneCode`, hoặc single covered zone; có thể ghi presence với zone unknown. Upload zone snapshot dùng REST presign riêng rồi PUT ảnh, không dùng multipart HTTP worker.

**Không gửi nguyên envelope `PlateRecognized` lên topic này.** Topic cần `type`/`plateNumber`, còn worker xuất `eventType`/`payload.plate.normalizedText`. Worker không có adapter chuyển đổi, zone geometry, publish credentials, hoặc logic quyết định parked/seen/left. Mất track hoặc `relocate` trong ảnh không đủ suy ra sự kiện monitor tương ứng.

Nếu tích hợp bộ nhận diện bên ngoài, chọn giao thức đúng ranh giới:

- Cấp biển số cho gate: bên ngoài đóng vai producer HTTP theo hợp đồng localhost, headers/auth/camera routing và hạn chế ACK của implementation Rust ở mục 9.
- Theo dõi vị trí trong bãi: bên ngoài publish MQTT monitor theo tài liệu riêng, chịu trách nhiệm zone/loại sự kiện/upload.

Worker không có listener nhận detection JSON từ bên ngoài hoặc endpoint inference HTTP. MQTT subscriber/backend bridge không được nhúng trong worker. QoS 1/retry MQTT thuộc publisher/broker phía ngoài, không phải cơ chế retry HTTP mô tả tiếp theo.

<a id="7-snapshot-retry-queue-va-trang-thai"></a>
## 7. Snapshot, retry, queue và trạng thái

### 7.1 Snapshot local

Chỉ có backend `local`, định dạng JPEG. Ảnh gốc downscale theo `snapshot.max_width`, plate crop không bị giới hạn max width. Encode dùng `jpeg_quality`; lưu file tạm ngắn rồi `os.replace()` để thay atomic.

Layout dưới `snapshot.output_dir`:

```text
tenant-<12 ký tự hash>/site-<12 ký tự hash>/camera-<12 ký tự hash>/
  YYYY/MM/DD/frame-<frame number>-<timestamp>/
    original-frame.jpg
    candidate-<12 ký tự UUID>/plate-crop.jpg
```

ID scope là prefix SHA-256, không phải UUID nguyên bản; mục đích là giảm độ dài path Windows. Descriptor chứa SHA-256 byte JPEG. Không có S3 snapshot backend, upload presign, cleanup/retention/quota hoặc mã hóa ổ đĩa tự động trong worker.

Lifecycle `exit` dùng frame cuối của track và có thể ghép crop gần nhất từ frame trước; không mặc định hai ảnh luôn chụp cùng thời điểm. Thông tin `capturedAt` descriptor cần được giữ khi xử lý chứng cứ.

### 7.2 Retry trực tiếp

Mỗi event thử tối đa `ingest.max_attempts`. Các lần thử giữ nguyên `eventId`, `Idempotency-Key`, envelope và bytes ảnh.

- Retry `requests.RequestException` (gồm timeout/kết nối), HTTP `408`, `425`, `429`, và status >= 500.
- Không retry các status khác, kể cả `200` và lỗi xác thực 401/403. `202` ACK sai cũng không retry.
- Delay mặc định theo profile: `min(5.0, 0.5 × 2^(attempt−1))` giây. Nếu `Retry-After` parse được dạng số giây thì dùng giá trị đó, clamp 0..retry_max; không parse HTTP-date.
- Không có jitter. Snapshot không đọc được là lỗi permanent trước khi gửi, không enqueue.

`timeout_seconds` được truyền cho Requests trên mỗi request; không phải giới hạn tổng thời gian toàn frame/event. Retry/backoff là đồng bộ trong luồng xử lý camera.

### 7.3 Queue SQLite bền vững

Khi hết direct retries nhưng lỗi vẫn retryable và queue bật, event cùng ảnh được spool vào `ingest.queue_path`. Snapshot bundle lưu dữ liệu trong SQLite (base64 trong JSON và cột BLOB tương thích cũ), không chỉ trỏ file bên ngoài. Queue có thể lớn hơn nhiều so với kích thước envelope; cap theo **số event**, không theo byte.

- Unique `event_id` tránh enqueue trùng. Replay giữ event ID; không tạo một sự kiện mới.
- Mặc định tối đa 5000; tràn cap **xóa event cũ nhất**, không chặn producer. Không có bảo đảm không mất dữ liệu khi đầy.
- `flush_pending(limit=20)` đọc event đến hạn theo thứ tự ID, gọi lại cùng direct retry policy; thành công thì xóa, permanent thì discard, retryable thì hẹn lại.
- Delay queue `min(300, queue_retry_seconds × 2^min(attempts,8))`. Lần hẹn đầu khi enqueue là hiện tại + queue_retry_seconds. Với default, replay đầu lỗi lại hẹn 5 giây, rồi 10, 20… tới 300.
- Flush diễn ra đầu mỗi `process_frame()` và khi RTSP chuẩn bị reconnect; **không có queue worker timer độc lập**. `queue_retry_seconds` là lịch đến hạn, không phải cam kết thời gian flush.
- Shutdown chỉ close client/DB/controller; không drain chắc chắn queue hoặc phát `queueFlushed=true`.
- Queue restart-safe nếu volume được giữ, nhưng delivery là best-effort với cap/discard; không phải exactly-once và không đảm bảo causation event đã tới trước event biển số khi lỗi/replay xen kẽ.

### 7.4 Tracker audit không phải phục hồi ByteTrack

`TrackerStateStore` lưu projection `session_id`, `track_id`, plate, box và `observed_at` trong bảng `tracker_observation`. Với ingest thật, path là **`tracker-state.sqlite3` cạnh queue DB**, ngay khi service được tạo; với ingest dry-run dùng `:memory:`.

Projection tồn tại qua restart DB, nhưng service tạo `session_id` mới và **không đọc DB để phục hồi ByteTrack, lifecycle, emitted plates hay causation IDs**. Không có retention audit. Dùng thư mục riêng từng camera: chỉ đổi tên queue file trong cùng thư mục vẫn có thể dùng chung `tracker-state.sqlite3`.

Giữ queue/audit/snapshot trên volume bền vững, kiểm soát quyền truy cập và dung lượng vì chứa biển số/hình ảnh. Log INFO cũng có thể chứa OCR, vị trí, event payload, path; metadata an toàn không có nghĩa toàn bộ exception/URL log đều đã redacted.

<a id="8-trien-khai-docker-cpu-gpu"></a>
## 8. Triển khai Docker CPU/GPU

### 8.1 CPU và stages

Từ root repo:

```sh
docker build -t parkvision-anpr anpr-worker/
docker build --target test -t parkvision-anpr:test anpr-worker/
docker run --rm parkvision-anpr --help
```

Build mặc định **không chạy stage test**; `--target test` mới cài pytest và chạy `python -m pytest edge/ -q`. Runtime default chỉ in help rồi thoát, không tự chọn config/chạy camera.

Build args/default:

- `BASE_IMAGE=python:3.11-slim-bookworm`.
- `PADDLE_PACKAGE=paddlepaddle==3.0.0`.
- `TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu`; nếu không rỗng thì cài Torch/Torchvision từ index này trước core requirements.

Docker cài `libgl1`, `libglib2.0-0`, `libgomp1`, sau đó core requirements và `paddleocr==2.10.0` + `PADDLE_PACKAGE`. Không chạy `pip install -r requirements-ocr.txt` trực tiếp nhưng giữ cùng baseline CPU. ENV image: `PYTHONUNBUFFERED=1`, `PYTHONDONTWRITEBYTECODE=1`, `PIP_NO_CACHE_DIR=1`. Working dir `/app`, entrypoint `python run_camera_pipeline.py`.

`.dockerignore` loại `model/*.pt`, `model/*.onnx`, `model/paddleocr`, venv/build/dist/cache. Source YOLOv5 được COPY. Quy tắc loại weight đó chỉ bao phủ các path khai báo; không đưa artifact/secret vào vị trí tùy ý trong build context rồi mặc định chúng đều bị loại.

### 8.2 Ví dụ runtime có volume

Ví dụ cho Windows PowerShell: chuẩn bị thư mục ngoài repo `D:/ParkVision/anpr-runtime` với `camera.json` và `state/`, cùng `D:/ParkVision/anpr-models` chứa **cả weights, Paddle bundle và source YOLOv5 cạnh plate checkpoint**. Tên/đường dẫn dưới đây là bố trí triển khai mẫu, không có sẵn trong repository.

Trong `camera.json` đặt các path absolute theo container:

```text
models.vehicle_detector.artifact_path = /models/yolo11n.pt
models.plate_detector.artifact_path   = /models/LP_detector_nano_61.pt
models.ocr.artifact_path              = /models/paddleocr
snapshot.output_dir                  = /runtime/state/snapshots
ingest.queue_path                    = /runtime/state/camera-event-queue.sqlite3
barrier.enabled                      = false
```

JSON thật vẫn cần toàn bộ field bắt buộc; danh sách trên chỉ là phần phải chỉnh. Tạo trước thư mục cha ghi được, giữ config hợp lệ `ocr.comparators` không rỗng, cung cấp camera key và URL receiver đúng hợp đồng.

```powershell
# Từ root repo; các thư mục đã được chuẩn bị trước.
docker run --rm --mount type=bind,source=D:/ParkVision/anpr-models,target=/models,readonly --mount type=bind,source=D:/ParkVision/anpr-runtime,target=/runtime parkvision-anpr --config /runtime/camera.json --validate-runtime

docker run --rm --mount type=bind,source=D:/ParkVision/anpr-models,target=/models,readonly --mount type=bind,source=D:/ParkVision/anpr-runtime,target=/runtime parkvision-anpr --config /runtime/camera.json --run-camera
```

Không mount đè `/app/model` bằng bundle thiếu source, cũng không giả định giữ source `/app/model` là đủ khi checkpoint nằm ở `/models`. Thư mục model read-only phù hợp mục tiêu không sửa weights, nhưng phải xác nhận dependency/vendor cold-start không cần ghi/cài thêm.

`localhost` bên trong container là container, không phải máy Windows hay ứng dụng kiosk. Chọn receiver HTTP có thể truy cập từ container; server Rust hiện chỉ bind `127.0.0.1` nên không mặc định gọi được từ container Docker Desktop. Cần phương án mạng/proxy có kiểm soát hoặc chạy worker native cùng kiosk. Không đưa camera key thật vào image/commit; dùng config riêng được bảo vệ hoặc truyền env theo cơ chế secret của môi trường vận hành.

Để scrape metrics, cấp `DAI_EDGE_METRICS_PORT` khác 0 và publish port có giới hạn, ví dụ tùy chọn Docker `-e DAI_EDGE_METRICS_PORT=9108 -p 127.0.0.1:9108:9108`. Không cần publish port nếu chỉ chạy worker HTTP outbound/IPC.

### 8.3 GPU

Ví dụ build dựa trên phương án nêu trong Dockerfile, thêm **index Torch rỗng** để không chạy bước cài CPU Torch trên base CUDA:

```sh
docker build --build-arg BASE_IMAGE=pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime --build-arg PADDLE_PACKAGE=paddlepaddle-gpu==3.0.0 --build-arg TORCH_INDEX_URL= -t parkvision-anpr:cuda anpr-worker/
```

Khi chạy dùng image `parkvision-anpr:cuda` và thêm `--gpus all` vào `docker run`. Host cần NVIDIA driver/container GPU support phù hợp. Trong JSON đổi **từng** model `device` sang `cuda`/`cuda:0`; chỉ đổi image không tự bật GPU. Có thể cấu hình OCR CPU và detector CUDA nếu dependency tương thích.

Vehicle/plate kiểm tra `torch.cuda.is_available()`, OCR kiểm tra Paddle có compile CUDA; không có benchmark hay probe inference thực xác nhận toàn bộ driver/model tương thích. Tag/base/package trên là recipe từ repo, không phải bằng chứng GPU deployment đã được chạy thành công. Phải kiểm tra wheel Paddle GPU có sẵn cho Python/CUDA chọn, registry/network, bộ nhớ GPU và cold-start thật; requirements core không khóa hoàn toàn phiên bản Torch/Ultralytics.

<a id="9-sidecar-tauri-va-gioi-han-tich-hop"></a>
## 9. Sidecar Tauri và giới hạn tích hợp

### 9.1 Đường tích hợp dự kiến

Rust sinh `<app_data>/camera-workers/<camera UUID>.json`, dữ liệu riêng tại `<app_data>/camera-workers/<camera UUID>/`. Model từ `PARKVISION_ANPR_MODEL_DIR` hoặc `<app_data>/models`. Config sinh có `device="cpu"` cả ba model, preview bật 5 FPS/640/60, barrier Python tắt và ingest thật tới port loopback ngẫu nhiên.

HTTP server Rust bind `127.0.0.1:0`, sinh key ngẫu nhiên mỗi boot rồi đưa vào JSON child. Không có cổng ingest cố định 8080 mặc định cho kiosk. Worker chỉ cần camera key loopback, không phải API token tenant dùng để publish MQTT.

Supervisor thêm CLI args, đọc stdout JSONL, phát camera UI events, restart khi child thoát/spawn lỗi theo delay **1, 2, 4… tối đa 60 giây**. Đây là retry tiến trình, tách biệt RTSP reconnect và HTTP retry. Không thấy reset backoff sau một phiên chạy ổn định.

### 9.2 Các lệch hợp đồng đã xác nhận

Không coi các mục này đã được sửa bởi tài liệu:

1. **Generated config bị từ chối.** `camera_worker.rs::render_worker_config` sinh `ocr.comparators=[]`, trong khi `_string_list` ở Python yêu cầu danh sách không rỗng. Parser báo `ocr.comparators is required and must be a non-empty list of strings`, exit 2 trước inference. Việc để comparators rỗng về ý nghĩa runtime là hợp lý nhưng chưa được parser hiện tại chấp nhận.
2. **ACK HTTP.** Rust trả `200 OK` cả sự kiện mới và trùng; Python chỉ coi `202` + JSON ACK đúng ID là delivered. Sự kiện có thể đã được route tới gate nhưng worker log lỗi không retryable; queue không cứu được mismatch này.
3. **Ảnh multipart.** Rust chỉ đọc part `snapshot`; pipeline gửi `original_frame`/`plate_crop`. Text biển số vẫn có thể được route nhưng ảnh bị bỏ qua. `snapshotUpload.part="snapshot"` cũng không phản ánh tên part thực gửi.
4. **Không phải exactly-once.** Rust dedup bằng HashSet trong RAM, xóa khi đạt 10.000 và mất sau restart; ghi nhớ event ID trước khi `try_send` vào channel. Nếu channel đầy trả 503, lần retry có thể bị xem là duplicate dù reading chưa được route. Cần kiểm chứng riêng luồng lỗi này trước khi dựa vào retry để tránh mất event.
5. **stderr có thể làm child nghẽn.** Supervisor hiện đọc stdout tới EOF rồi mới drain stderr, không drain hai pipe đồng thời. Worker log nhiều ở INFO; buffer stderr có thể đầy khi chạy lâu, làm child block. Không khẳng định pipeline đã ổn định lâu dài chỉ từ tests unit.

Các lỗi trên cần thay đổi source trong công việc khác; không thể giải quyết chỉ bằng lựa chọn env. Chỉnh JSON generated thủ công cũng có thể bị ghi đè khi host sinh lại. Khi vận hành standalone với receiver riêng, receiver cần chủ động đáp ứng đúng hợp đồng Python.

### 9.3 Build sidecar

Từ `anpr-worker/`, lệnh hiện có:

```sh
python -m pip install pyinstaller
python build_sidecar.py
```

Script gọi `pyinstaller --clean camera-edge.spec`. Spec tạo **one-directory bundle** `dist/camera-edge/`, executable Windows `camera-edge.exe`; không phải một file độc lập tự chứa toàn bộ model.

Hạn chế cụ thể:

- `datas` còn tham chiếu `config.example.json` không có trong `anpr-worker/`; build có thể thất bại ngay bước gom dữ liệu.
- Không gom source YOLOv5 hoặc weights/Paddle bundles vào `datas`; cần provision riêng ở đúng vị trí loader tìm.
- Spec exclude `scipy`, `pandas`, `matplotlib` dù dependency/model stack có thể cần; không coi executable inference đã được chứng minh chỉ vì PyInstaller tạo file.
- Cần phát hành cả dependency bundle thư mục, không chỉ copy `.exe`. Host hiện tìm binary cạnh executable ứng dụng; script không tự cài bundle hoặc provision model cho Tauri.

Không chạy build này như một bước phát hành bảo đảm thành công trước khi xử lý các điểm trên và kiểm tra inference bằng executable thật trên máy đích.

<a id="10-tests-va-kiem-tra-van-hanh"></a>
## 10. Tests và kiểm tra vận hành

### 10.1 Suite hiện có

Từ `anpr-worker/`:

```sh
python -m pip install pytest
python -m pytest edge/ -q
```

Không sinh pytest cache/bytecode, shell POSIX:

```sh
PYTHONDONTWRITEBYTECODE=1 python -m pytest edge/ -q -p no:cacheprovider
```

Trong PowerShell, đặt `$env:PYTHONDONTWRITEBYTECODE='1'` rồi chạy cùng lệnh pytest không có prefix assignment.

Chạy hẹp ví dụ:

```sh
python -m pytest edge/test_camera_config.py edge/test_camera_ingest_client.py edge/test_camera_runtime.py -q
```

Các file `edge/test_*.py` bao phủ parser/path/env/hash, motion MOG2, adapter detector, crop/bbox, OCR normalization/confidence/failure isolation, ByteTrack/lifecycle, snapshot JPEG, queue replay/heartbeat, tracker audit SQLite và metrics HTTP.

Tests phần lớn dùng model factory/capture/HTTP giả; không cần weights production hoặc broker MQTT. Một số test chạy MOG2, encode JPEG, SQLite và HTTP metrics local thật. Test ingest pipeline hiện có thể chạm nhánh access check theo cấu hình barrier mẫu, nên không coi toàn bộ suite là air-gapped tuyệt đối.

Lần kiểm tra phục vụ tài liệu này: **56 passed, 4 warnings** khi chạy suite không cache/bytecode. Warnings liên quan `datetime.utcnow()` deprecated trong IPC. Máy chạy tests dùng Python 3.14 và NumPy 2.5.3 với `opencv-python-headless`, khác baseline Python 3.11/`numpy<2.0`; kết quả này chỉ chứng minh suite đã chạy trong môi trường đó, không xác nhận đã cài/kiểm thử đầy đủ requirements production. CLI `--help` cũng đã chạy thành công.

Docker test stage cung cấp đường kiểm tra theo dependency image, nhưng không tự chứng minh model/GPU và các lệch hợp đồng Rust–Python; lần cập nhật tài liệu này chưa chạy Docker build, inference thật hoặc PyInstaller.

### 10.2 Trình tự kiểm tra local

1. Dùng venv Python 3.11, cài core/OCR requirements và pytest theo [README](../anpr-worker/README.md).
2. Chuẩn bị profile riêng, ảnh/video thật và artifact. Không dùng đường ảnh mẫu thiếu sẵn trong repo. Đảm bảo `ocr.comparators` không rỗng và `barrier.enabled=false`.
3. Chạy `--dry-run` với ảnh local và `ingest.dry_run=true` để kiểm tra metadata/path, hoặc `--dry-run-sequence static` để xem motion summary. Không coi mode này là test nhận diện.
4. Chạy `--validate-runtime` với camera key đã cấu hình. Bước này có nạp model/tạo audit DB; kiểm tra quyền ghi trước khi chạy.
5. Chạy `--run-feed` với clip đủ dài để vượt warmup/min hits. Nếu giữ `ingest.dry_run=true`, payload chỉ được log nhưng snapshot vẫn ghi. Quan sát từng stage thay vì chỉ exit code.
6. Kết nối receiver có ACK/multipart tương thích, chuyển `ingest.dry_run=false`, thử lỗi mạng/replay, duplicate và kiểm tra ảnh thực nhận.
7. Cuối cùng mới chạy RTSP thật và kiểm tra reconnect/stop, CPU/GPU/RAM, dung lượng, metrics. Nếu dùng Tauri, phải xử lý các mismatch ở mục 9 trước khi kết luận end-to-end sẵn sàng.

Ví dụ CLI (các file do người triển khai chuẩn bị):

```sh
python run_camera_pipeline.py --config camera.local.json --dry-run
python run_camera_pipeline.py --config camera.local.json --validate-runtime
python run_camera_pipeline.py --config camera.local.json --run-feed gate.mp4 --max-frames 300
python run_camera_pipeline.py --config camera.local.json --run-camera --max-frames 300 --reconnect-seconds 2
```

<a id="11-chan-doan-va-gioi-han-con-lai"></a>
## 11. Chẩn đoán và giới hạn còn lại

- **Exit 2 ngay khi Tauri spawn:** kiểm tra `ocr.comparators=[]` trong generated JSON và các `DAI_*` kế thừa. Không chỉ nhìn file weight.
- **`camera.source.path` thiếu:** path tính theo JSON. Profile mẫu tham chiếu ảnh không có sẵn; chuyển tới file thật.
- **Thiếu `ultralytics_yolov5_master`:** đặt source cạnh plate checkpoint; mount ở `/models` khác `/app/model` là nguyên nhân thường gặp.
- **Không nạp được PaddleOCR:** kiểm tra package đúng file `requirements-ocr.txt`, bundle `det/rec` thực, Python/wheel/device tương thích; tên `requirements-ocr-production.txt` trong lỗi là tham chiếu cũ.
- **Có xe nhưng không có plate event:** kiểm tra motion active, class car/motorbike, kích thước crop/confidence, quyền lưu crop, OCR policy, `min_hits`, overlap track và causation event. Clip ngắn/ảnh một frame không đủ warmup là hành vi bình thường.
- **HTTP 200 nhưng worker log thất bại:** mismatch ACK với Rust, không phải lỗi retry hoặc khóa.
- **Có biển số nhưng không có ảnh UI:** kiểm tra tên multipart ở cả producer và receiver, không chỉ file local.
- **Queue tăng:** receiver không reachable hoặc 5xx/408/425/429; inspect log `queue_flush`, volume và cap. Không có `queue.depth` IPC runtime để thay log/DB.
- **Không thấy metrics:** default port 0; mỗi process cần port riêng; `--run-feed` tạo lại service không truyền metrics ban đầu nên endpoint có thể không phản ánh OCR của feed đó. Hiện metrics hữu ích nhất cho `--run-camera`.
- **Không có `worker.ready` hoặc HTTP preview 8765:** các helper/server đó chưa được entry point gọi. Đừng chờ event/port không được nối runtime.
- **Pipeline đứng sau thời gian dài:** kiểm tra RTSP read block, HTTP đồng bộ/retries/flush và pipe stderr supervisor trước khi tăng GPU hoặc tắt log tùy tiện.

Giới hạn chung: không có scheduler nhiều camera trong một Python process, benchmark throughput/accuracy production, zone occupancy mapping, training/export pipeline riêng của ParkVision, fallback OCR thực, phục hồi ByteTrack qua restart, retention dữ liệu, hoặc bảo đảm barrier Python an toàn phần cứng. Các artifact, GPU recipe, PyInstaller và integration cần kiểm thử riêng trên môi trường triển khai. Tài liệu này ghi lại hiện trạng; không thay đổi implementation hay hợp đồng MQTT hiện hữu.
