# ANPR worker — nhận diện biển số từ camera

Worker Python chạy headless, xử lý một nguồn camera trong mỗi tiến trình. Luồng chính: **file/RTSP → MOG2 motion gate → YOLOv11 nhận diện xe → YOLOv5 tìm biển số trong vùng xe → PaddleOCR → sự kiện theo ByteTrack → HTTP ingest**. ByteTrack được cập nhật sau bước phát hiện xe, trước OCR; trạng thái track kết hợp kết quả OCR để phát sự kiện.

Trong ParkVision, `edge-client` sinh cấu hình theo camera, giám sát tiến trình và nhận kết quả qua HTTP localhost. Worker không trực tiếp publish MQTT, không phải API backend và không phải dịch vụ tự động điều khiển barrier thật trên Windows.

**[Hướng dẫn vận hành và tham chiếu đầy đủ](../docs/anpr-worker.md)**: cấu hình/default, biến môi trường, model, HTTP/IPC/MQTT, retry/queue, Docker CPU/GPU, tests và các giới hạn đã xác nhận từ source.

## Cấu trúc

- `run_camera_pipeline.py`: CLI cho diagnostics, ảnh/video cục bộ và camera chạy lâu dài.
- `edge/`: cấu hình, runtime OpenCV, motion gate, detector, OCR, tracker, snapshot, HTTP ingest, SQLite queue, metrics và IPC.
- `model/ultralytics_yolov5_master/`: source YOLOv5 vendored; không phải bộ trọng số được cấp sẵn.
- `camera-pipeline.dry-run.example.json`: profile mẫu; các ngưỡng trong đó là **giá trị ví dụ**, phần lớn không phải default nếu bỏ trường.
- `requirements.txt`, `requirements-ocr.txt`: dependency nền và PaddleOCR CPU.
- `Dockerfile`: các stage `base`, `test`, `runtime`.
- `build_sidecar.py`, `camera-edge.spec`: đóng gói PyInstaller; còn hạn chế, xem bên dưới.

## Cài đặt local

Python 3.11 là baseline của Docker. Từ `anpr-worker/`, dùng môi trường riêng:

```powershell
# Windows PowerShell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m pip install -r requirements-ocr.txt
python -m pip install pytest
```

```sh
# Linux / shell POSIX
python3.11 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python -m pip install -r requirements-ocr.txt
python -m pip install pytest
```

`requirements-ocr.txt` pin `paddleocr==2.10.0`, `paddlepaddle==3.0.0`. Core có `numpy<2.0`; nhiều package khác, gồm Torch và Ultralytics, chưa pin phiên bản. Không cài đồng thời Paddle CPU và Paddle GPU. Những thông báo source nhắc `requirements-ocr-production.txt` hoặc `edge/edge/requirements.txt` là tên cũ; dùng hai file requirements thực có ở đây.

## Chạy kiểm tra không cần model

```sh
python run_camera_pipeline.py --help
python run_camera_pipeline.py --config camera-pipeline.dry-run.example.json --dry-run-sequence static
```

Profile mẫu trỏ tới `../backend/test_image.png`, nhưng ảnh này không có trong cây source đã kiểm tra. Với `--dry-run`, hãy đặt `camera.source.path` tới ảnh thật hoặc dùng `DAI_CAMERA_SOURCE`:

```powershell
$env:DAI_CAMERA_SOURCE = 'D:/samples/gate.jpg'
python run_camera_pipeline.py --config camera-pipeline.dry-run.example.json --dry-run
```

`--dry-run` chỉ đọc metadata ảnh, không chạy nhận diện. `--dry-run-sequence` gọi pipeline với ảnh tổng hợp; nhánh `moving-vehicle` có thể chạm tới adapter model, không phải chỉ kiểm tra metadata.

Để diagnostics không tạo tracker DB hay gọi access API, giữ `ingest.dry_run=true`, đặt `barrier.enabled=false`, không bật `DAI_EDGE_METRICS_PORT`. `ingest.dry_run` **chỉ** chặn event/heartbeat HTTP; không chặn snapshot hoặc lời gọi `check-vehicle` nếu barrier vẫn bật và OCR tạo được sự kiện.

## Model và chạy thật

Với profile đặt ngay trong `anpr-worker/`, bố trí:

```text
model/
├── yolo11n.pt
├── LP_detector_nano_61.pt
├── ultralytics_yolov5_master/   # source đã vendored
└── paddleocr/
    ├── det/                   # bộ inference detection PaddleOCR
    └── rec/                   # bộ inference recognition PaddleOCR
```

Trọng số/bundle không có sẵn. Cần cấp artifact tương thích và đáng tin cậy; chỉ tạo thư mục rỗng không đủ. Loader biển số tìm source tại **thư mục cha của plate checkpoint** cộng `/ultralytics_yolov5_master`, kể cả khi đổi vị trí model.

Dùng bản sao profile dành cho triển khai, sửa đường dẫn, UUID, source, `ingest.url`, khóa và đặt `ingest.dry_run=false`. Các path tương đối trong JSON tính từ **thư mục chứa JSON**, không phải thư mục đang chạy CLI. Với ParkVision, nên tắt barrier Python; relay/FSM thuộc Rust.

```sh
python run_camera_pipeline.py --config camera.local.json --validate-runtime
python run_camera_pipeline.py --config camera.local.json --run-feed sample.mp4 --max-frames 200
python run_camera_pipeline.py --config camera.local.json --run-camera
```

Các tên `camera.local.json`, `sample.mp4` là file do người triển khai chuẩn bị, không phải file đi kèm repo. `--validate-runtime` thực sự nạp model/khởi tạo adapter; vẫn đòi camera key khi `ingest.dry_run=true` và có thể tạo tracker DB trước khi validation hoàn tất.

## Docker

Từ root repository:

```sh
docker build -t parkvision-anpr anpr-worker/
docker build --target test -t parkvision-anpr:test anpr-worker/
docker run --rm parkvision-anpr --help
```

Image không chứa trọng số. Khi mount checkpoint ở `/models/LP_detector_nano_61.pt`, phải có cả `/models/ultralytics_yolov5_master/`. Không mount đè toàn bộ `/app/model` nếu bundle bên ngoài thiếu source YOLOv5. Xem [triển khai CPU/GPU](../docs/anpr-worker.md#8-trien-khai-docker-cpu-gpu) để bố trí volume, path ghi được và ingest bên ngoài container.

## Tests

Từ `anpr-worker/`:

```sh
python -m pytest edge/ -q
# Không tạo bytecode/pytest cache (shell POSIX):
PYTHONDONTWRITEBYTECODE=1 python -m pytest edge/ -q -p no:cacheprovider
```

Tests dùng adapter/factory/capture/HTTP giả cùng ảnh tổng hợp; có kiểm tra MOG2, JPEG, SQLite và metrics HTTP thật ở local. Tests pass không chứng minh checkpoint production, RTSP thật, CUDA hay luồng Tauri–worker hoạt động end-to-end.

## Các điểm phải biết trước khi triển khai

- **ACK không khớp:** Python chỉ chấp nhận `202` kèm `{"eventId":"...","status":"accepted"}`; `edge-client/src-tauri/src/ingest.rs` hiện trả `200`. Worker có thể log thất bại dù Rust đã nhận sự kiện.
- **Multipart không khớp:** service gửi ảnh dưới tên `original_frame`/`plate_crop`; Rust chỉ lấy part `snapshot`. Không được mặc định rằng ảnh sẽ tới UI.
- **Config sinh từ Rust chưa qua parser Python:** Rust ghi `ocr.comparators=[]`, trong khi Python yêu cầu danh sách không rỗng. Worker có thể thoát với code `2` ngay lúc đọc cấu hình.
- PyInstaller spec tham chiếu `config.example.json` không tồn tại và không tự đóng gói model/source YOLOv5 ngoài bundle. Chưa thể coi `python build_sidecar.py` là quy trình phát hành đã hoàn thiện.
- Không có MQTT publisher hay bộ chuyển đổi sự kiện monitor trong worker. Hợp đồng [MQTT monitor-camera detection](../docs/mqtt-camera-detection.md) là luồng khác, không phải payload HTTP `PlateRecognized`.

Chi tiết và hướng kiểm tra từng lỗi: [docs/anpr-worker.md](../docs/anpr-worker.md). Các hạn chế trên được ghi nhận, không sửa source trong lần cập nhật tài liệu này.
