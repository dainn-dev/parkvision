"""Typed, non-mutating configuration for the DAI-290 camera pipeline scaffold."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from hashlib import sha256
import json
import math
import os
from pathlib import Path
from typing import Mapping
from urllib.parse import urlparse
from uuid import UUID


class ConfigValidationError(ValueError):
    """All configuration issues found during parsing or readiness validation."""

    def __init__(self, issues: list[str]):
        self.issues = tuple(issues)
        super().__init__("Configuration validation failed:\n" + "\n".join(
            f"- {issue}" for issue in self.issues))


@dataclass(frozen=True)
class PipelineConfig:
    profile_id: str
    event_version: int
    frame_interval_ms: int


@dataclass(frozen=True)
class CameraSourceConfig:
    source_type: str
    location: str
    username: str
    password: str

    @property
    def path(self) -> Path:
        return Path(self.location)


@dataclass(frozen=True)
class CameraConfig:
    tenant_id: str
    site_id: str
    camera_id: str
    source: CameraSourceConfig


@dataclass(frozen=True)
class ModelArtifactConfig:
    name: str
    artifact_path: Path
    artifact_version: str
    image_size: int | None = None
    device: str | None = None


@dataclass(frozen=True)
class ModelsConfig:
    vehicle_detector: ModelArtifactConfig
    plate_detector: ModelArtifactConfig
    ocr: ModelArtifactConfig


@dataclass(frozen=True)
class MotionThresholds:
    history: int
    var_threshold: float
    detect_shadows: bool
    min_foreground_area_ratio: float
    min_consecutive_active_frames: int
    warmup_frames: int
    cooldown_frames: int


@dataclass(frozen=True)
class VehicleThresholds:
    confidence: float
    nms_iou: float


@dataclass(frozen=True)
class TrackerThresholds:
    high_confidence: float
    low_confidence: float
    match: float
    buffer_frames: int
    min_hits: int


@dataclass(frozen=True)
class ThresholdsConfig:
    motion: MotionThresholds
    vehicle: VehicleThresholds
    plate_confidence: float
    plate_padding_ratio: float
    min_plate_width_px: int
    min_plate_height_px: int
    ocr_confidence: float
    tracker: TrackerThresholds


@dataclass(frozen=True)
class OcrConfig:
    primary: str
    languages: tuple[str, ...]
    comparators: tuple[str, ...]
    automatic_fallback: bool
    low_confidence_policy: str


@dataclass(frozen=True)
class SnapshotConfig:
    backend: str
    output_dir: Path
    content_type: str
    jpeg_quality: int
    max_width: int


@dataclass(frozen=True)
class IngestConfig:
    url: str
    timeout_seconds: int
    camera_key: str
    snapshot_part: str
    dry_run: bool
    max_attempts: int
    retry_base_seconds: float
    retry_max_seconds: float
    queue_enabled: bool = False
    queue_path: Path = Path("camera-event-queue.sqlite3")
    queue_max_events: int = 5000
    queue_retry_seconds: float = 5.0
    heartbeat_interval_seconds: float = 20.0


@dataclass(frozen=True)
class LoggingConfig:
    level: str
    service: str


@dataclass(frozen=True)
class PreviewConfig:
    """Downscaled JPEG frames emitted over IPC (`preview.frame`) for the host
    application's live tiles. Disabled by default — zero encoding cost."""
    enabled: bool = False
    max_fps: float = 5.0
    max_width: int = 640
    jpeg_quality: int = 60


@dataclass(frozen=True)
class BarrierConfig:
    """Configuration for automatic gate (barrier) control.

    Attributes:
        enabled: Whether barrier control is active.
        backend: 'simulation' (default, no hardware) or 'gpio' (Raspberry Pi/Jetson).
        open_duration_s: How long the barrier stays open before auto-closing.
        close_cooldown_s: Minimum seconds after closing before a new open is accepted.
        pin_open: GPIO pin (BCM) used for the open relay pulse (gpio backend only).
        pin_close: GPIO pin (BCM) used for the close relay pulse (gpio backend only).
    """
    enabled: bool = True
    backend: str = "simulation"
    open_duration_s: float = 5.0
    close_cooldown_s: float = 2.0
    pin_open: int | None = None
    pin_close: int | None = None


@dataclass(frozen=True)
class CameraPipelineConfig:
    path: Path
    pipeline: PipelineConfig
    camera: CameraConfig
    models: ModelsConfig
    thresholds: ThresholdsConfig
    ocr: OcrConfig
    snapshot: SnapshotConfig
    ingest: IngestConfig
    logging: LoggingConfig
    barrier: BarrierConfig
    preview: PreviewConfig
    configuration_hash: str

    def safe_metadata(self) -> dict[str, str]:
        """Operational identifiers safe for structured logs; no secrets or source URL."""
        return {
            "profile_id": self.pipeline.profile_id,
            "configuration_hash": self.configuration_hash,
            "tenant_id": self.camera.tenant_id,
            "site_id": self.camera.site_id,
            "camera_id": self.camera.camera_id,
        }


def load_camera_pipeline_config(path: str | Path,
                                environ: Mapping[str, str] | None = None) -> CameraPipelineConfig:
    """Load JSON plus DAI_* overrides without writing or creating any files."""
    config_path = Path(path).expanduser().resolve()
    issues: list[str] = []
    if not config_path.is_file():
        raise ConfigValidationError([
            f"config file '{config_path}' does not exist; pass --config with a readable JSON profile"
        ])
    try:
        root = json.loads(config_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ConfigValidationError([
            f"config file '{config_path}' contains malformed JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}"
        ]) from exc
    except OSError as exc:
        raise ConfigValidationError([f"cannot read config file '{config_path}': {exc}"]) from exc

    if not isinstance(root, dict):
        raise ConfigValidationError(["config root must be a JSON object"])

    env = os.environ if environ is None else environ
    base_dir = config_path.parent
    pipeline = _mapping(root, "pipeline", "pipeline", issues)
    camera = _mapping(root, "camera", "camera", issues)
    source = _mapping(camera, "source", "camera.source", issues)
    models = _mapping(root, "models", "models", issues)
    thresholds = _mapping(root, "thresholds", "thresholds", issues)
    motion = _mapping(thresholds, "motion", "thresholds.motion", issues)
    vehicle = _mapping(thresholds, "vehicle", "thresholds.vehicle", issues)
    tracker = _mapping(thresholds, "tracker", "thresholds.tracker", issues)
    ocr = _mapping(root, "ocr", "ocr", issues)
    snapshot = _mapping(root, "snapshot", "snapshot", issues)
    ingest = _mapping(root, "ingest", "ingest", issues)
    logging = _mapping(root, "logging", "logging", issues)
    barrier = _mapping(root, "barrier", "barrier", issues) if "barrier" in root else {}
    preview = _mapping(root, "preview", "preview", issues) if "preview" in root else {}

    source_type = _string(source, "type", "camera.source.type", issues).lower()
    source_location_key = "path" if source_type == "file" else "url"
    source_location = _string(source, source_location_key, f"camera.source.{source_location_key}", issues)
    source_username = _optional_string(source, "username")
    source_password = _optional_string(source, "password")

    source_location = _override(env, "DAI_CAMERA_SOURCE", source_location)
    source_username = _override(env, "DAI_CAMERA_SOURCE_USERNAME", source_username)
    source_password = _override(env, "DAI_CAMERA_SOURCE_PASSWORD", source_password)
    tenant_id = _override(env, "DAI_TENANT_ID", _string(camera, "tenant_id", "camera.tenant_id", issues))
    site_id = _override(env, "DAI_SITE_ID", _string(camera, "site_id", "camera.site_id", issues))
    camera_id = _override(env, "DAI_CAMERA_ID", _string(camera, "id", "camera.id", issues))
    ingest_url = _override(env, "DAI_INGEST_URL", _string(ingest, "url", "ingest.url", issues))
    camera_key = _override(env, "DAI_CAMERA_KEY", _optional_string(ingest, "camera_key"))
    output_dir = _override(env, "DAI_SNAPSHOT_OUTPUT_DIR",
                           _string(snapshot, "output_dir", "snapshot.output_dir", issues))

    _validate_uuid(tenant_id, "camera.tenant_id / DAI_TENANT_ID", issues)
    _validate_uuid(site_id, "camera.site_id / DAI_SITE_ID", issues)
    _validate_uuid(camera_id, "camera.id / DAI_CAMERA_ID", issues)
    if source_type not in {"file", "rtsp"}:
        issues.append("camera.source.type must be 'file' or 'rtsp'")
    if source_type == "rtsp":
        _validate_url(source_location, "camera.source.url / DAI_CAMERA_SOURCE", issues,
                      allowed_schemes={"rtsp", "rtsps"})
    _validate_url(ingest_url, "ingest.url / DAI_INGEST_URL", issues,
                  allowed_schemes={"http", "https"})

    pipeline_config = PipelineConfig(
        profile_id=_string(pipeline, "id", "pipeline.id", issues),
        event_version=_integer(pipeline, "event_version", "pipeline.event_version", issues, minimum=1),
        frame_interval_ms=_integer(pipeline, "frame_interval_ms", "pipeline.frame_interval_ms", issues, minimum=1),
    )
    if pipeline_config.profile_id != "lpr-mvp-v1":
        issues.append("pipeline.id must be 'lpr-mvp-v1'")
    if pipeline_config.event_version != 1:
        issues.append("pipeline.event_version must be 1 for lpr-mvp-v1")

    model_config = ModelsConfig(
        vehicle_detector=_model(models, "vehicle_detector", base_dir, issues),
        plate_detector=_model(models, "plate_detector", base_dir, issues),
        ocr=_model(models, "ocr", base_dir, issues),
    )
    thresholds_config = ThresholdsConfig(
        motion=MotionThresholds(
            history=_integer(motion, "history", "thresholds.motion.history", issues, minimum=1),
            var_threshold=_number(motion, "var_threshold", "thresholds.motion.var_threshold", issues, minimum=0),
            detect_shadows=_boolean(motion, "detect_shadows", "thresholds.motion.detect_shadows", issues),
            min_foreground_area_ratio=_number(motion, "min_foreground_area_ratio",
                                              "thresholds.motion.min_foreground_area_ratio", issues,
                                              minimum=0, maximum=1),
            min_consecutive_active_frames=_integer(motion, "min_consecutive_active_frames",
                                                    "thresholds.motion.min_consecutive_active_frames", issues,
                                                    minimum=1),
            warmup_frames=_integer(motion, "warmup_frames", "thresholds.motion.warmup_frames", issues,
                                   minimum=0),
            cooldown_frames=_integer(motion, "cooldown_frames", "thresholds.motion.cooldown_frames", issues,
                                     minimum=0),
        ),
        vehicle=VehicleThresholds(
            confidence=_number(vehicle, "confidence", "thresholds.vehicle.confidence", issues,
                               minimum=0, maximum=1),
            nms_iou=_number(vehicle, "nms_iou", "thresholds.vehicle.nms_iou", issues,
                            minimum=0, maximum=1),
        ),
        plate_confidence=_number(thresholds, "plate_confidence", "thresholds.plate_confidence", issues,
                                 minimum=0, maximum=1),
        plate_padding_ratio=_number(thresholds, "plate_padding_ratio",
                                    "thresholds.plate_padding_ratio", issues, minimum=0, maximum=1),
        min_plate_width_px=_integer(thresholds, "min_plate_width_px",
                                    "thresholds.min_plate_width_px", issues, minimum=1),
        min_plate_height_px=_integer(thresholds, "min_plate_height_px",
                                     "thresholds.min_plate_height_px", issues, minimum=1),
        ocr_confidence=_number(thresholds, "ocr_confidence", "thresholds.ocr_confidence", issues,
                               minimum=0, maximum=1),
        tracker=TrackerThresholds(
            high_confidence=_number(tracker, "high_confidence", "thresholds.tracker.high_confidence", issues,
                                    minimum=0, maximum=1),
            low_confidence=_number(tracker, "low_confidence", "thresholds.tracker.low_confidence", issues,
                                   minimum=0, maximum=1),
            match=_number(tracker, "match", "thresholds.tracker.match", issues, minimum=0, maximum=1),
            buffer_frames=_integer(tracker, "buffer_frames", "thresholds.tracker.buffer_frames", issues,
                                   minimum=1),
            min_hits=_integer(tracker, "min_hits", "thresholds.tracker.min_hits", issues, minimum=1),
        ),
    )
    if thresholds_config.tracker.low_confidence > thresholds_config.tracker.high_confidence:
        issues.append("thresholds.tracker.low_confidence cannot exceed high_confidence")
    if thresholds_config.motion.min_foreground_area_ratio <= 0:
        issues.append("thresholds.motion.min_foreground_area_ratio must be greater than 0")

    languages = _string_list(ocr, "languages", "ocr.languages", issues)
    comparators = _string_list(ocr, "comparators", "ocr.comparators", issues)
    ocr_config = OcrConfig(
        primary=_string(ocr, "primary", "ocr.primary", issues),
        languages=tuple(languages),
        comparators=tuple(comparators),
        automatic_fallback=_boolean(ocr, "automatic_fallback", "ocr.automatic_fallback", issues),
        low_confidence_policy=_string(
            ocr, "low_confidence_policy", "ocr.low_confidence_policy", issues).lower(),
    )
    if ocr_config.primary != "PaddleOCR":
        issues.append("ocr.primary must be 'PaddleOCR' for lpr-mvp-v1")
    if ocr_config.automatic_fallback:
        issues.append("ocr.automatic_fallback must be false; comparators are benchmark-only")
    if ocr_config.low_confidence_policy not in {"reject", "accept_flagged"}:
        issues.append("ocr.low_confidence_policy must be 'reject' or 'accept_flagged'")

    snapshot_config = SnapshotConfig(
        backend=_string(snapshot, "backend", "snapshot.backend", issues).lower(),
        output_dir=_resolve_path(output_dir, base_dir),
        content_type=_string(snapshot, "content_type", "snapshot.content_type", issues),
        jpeg_quality=_integer(snapshot, "jpeg_quality", "snapshot.jpeg_quality", issues, minimum=1, maximum=100),
        max_width=_integer(snapshot, "max_width", "snapshot.max_width", issues, minimum=1),
    )
    if snapshot_config.backend != "local":
        issues.append("snapshot.backend must be 'local' for the MVP snapshot store")
    if snapshot_config.content_type != "image/jpeg":
        issues.append("snapshot.content_type must be 'image/jpeg'")

    ingest_config = IngestConfig(
        url=ingest_url,
        timeout_seconds=_integer(ingest, "timeout_seconds", "ingest.timeout_seconds", issues, minimum=1),
        camera_key=camera_key,
        snapshot_part=_string(ingest, "snapshot_part", "ingest.snapshot_part", issues),
        dry_run=_boolean(ingest, "dry_run", "ingest.dry_run", issues),
        max_attempts=_integer(ingest, "max_attempts", "ingest.max_attempts", issues, minimum=1),
        retry_base_seconds=_number(
            ingest, "retry_base_seconds", "ingest.retry_base_seconds", issues, minimum=0),
        retry_max_seconds=_number(
            ingest, "retry_max_seconds", "ingest.retry_max_seconds", issues, minimum=0),
        queue_enabled=_value_or_default(
            ingest, "queue_enabled", "ingest.queue_enabled", issues, True, bool),
        queue_path=_resolve_path(
            _value_or_default(
                ingest, "queue_path", "ingest.queue_path", issues,
                "camera-event-queue.sqlite3", str),
            base_dir),
        queue_max_events=_integer_or_default(
            ingest, "queue_max_events", "ingest.queue_max_events", issues,
            5000, minimum=1),
        queue_retry_seconds=_number_or_default(
            ingest, "queue_retry_seconds", "ingest.queue_retry_seconds", issues,
            5.0, minimum=0.1),
        heartbeat_interval_seconds=_number_or_default(
            ingest, "heartbeat_interval_seconds", "ingest.heartbeat_interval_seconds", issues,
            20.0, minimum=0.1),
    )
    if ingest_config.snapshot_part != "snapshot":
        issues.append("ingest.snapshot_part must be 'snapshot'")
    if ingest_config.retry_max_seconds < ingest_config.retry_base_seconds:
        issues.append("ingest.retry_max_seconds cannot be less than retry_base_seconds")

    logging_config = LoggingConfig(
        level=_string(logging, "level", "logging.level", issues).upper(),
        service=_string(logging, "service", "logging.service", issues),
    )
    if logging_config.level not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
        issues.append("logging.level must be DEBUG, INFO, WARNING, ERROR, or CRITICAL")

    barrier_backend = _value_or_default(
        barrier, "backend", "barrier.backend", issues, "simulation", str).lower()
    if barrier_backend not in {"simulation", "gpio"}:
        issues.append("barrier.backend must be 'simulation' or 'gpio'")
    pin_open = None
    pin_close = None
    if barrier_backend == "gpio":
        pin_open = _integer_or_default(barrier, "pin_open", "barrier.pin_open", issues, 17, minimum=0)
        pin_close = _integer_or_default(barrier, "pin_close", "barrier.pin_close", issues, 27, minimum=0)
    barrier_config = BarrierConfig(
        enabled=_value_or_default(barrier, "enabled", "barrier.enabled", issues, True, bool),
        backend=barrier_backend,
        open_duration_s=_number_or_default(
            barrier, "open_duration_s", "barrier.open_duration_s", issues, 5.0, minimum=0),
        close_cooldown_s=_number_or_default(
            barrier, "close_cooldown_s", "barrier.close_cooldown_s", issues, 2.0, minimum=0),
        pin_open=pin_open,
        pin_close=pin_close,
    )
    if barrier_config.enabled and barrier_config.open_duration_s <= 0:
        issues.append("barrier.open_duration_s must be greater than 0 when barrier is enabled")
    if barrier_config.enabled and barrier_config.close_cooldown_s <= 0:
        issues.append("barrier.close_cooldown_s must be greater than 0 when barrier is enabled")

    preview_config = PreviewConfig(
        enabled=_value_or_default(preview, "enabled", "preview.enabled", issues, False, bool),
        max_fps=_number_or_default(
            preview, "max_fps", "preview.max_fps", issues, 5.0, minimum=0.1),
        max_width=_integer_or_default(
            preview, "max_width", "preview.max_width", issues, 640, minimum=32),
        jpeg_quality=_integer_or_default(
            preview, "jpeg_quality", "preview.jpeg_quality", issues, 60, minimum=1),
    )

    if issues:
        raise ConfigValidationError(issues)

    camera_config = CameraConfig(
        tenant_id=tenant_id,
        site_id=site_id,
        camera_id=camera_id,
        source=CameraSourceConfig(
            source_type=source_type,
            location=str(_resolve_path(source_location, base_dir)) if source_type == "file" else source_location,
            username=source_username,
            password=source_password,
        ),
    )
    configuration_hash = _configuration_hash(
        pipeline_config, model_config, thresholds_config, ocr_config, snapshot_config,
        barrier_config)
    return CameraPipelineConfig(
        path=config_path,
        pipeline=pipeline_config,
        camera=camera_config,
        models=model_config,
        thresholds=thresholds_config,
        ocr=ocr_config,
        snapshot=snapshot_config,
        ingest=ingest_config,
        logging=logging_config,
        barrier=barrier_config,
        preview=preview_config,
        configuration_hash=configuration_hash,
    )


def validate_dry_run(config: CameraPipelineConfig) -> None:
    """Ensure a local file feed is safe to read without requiring models or secrets."""
    issues: list[str] = []
    if config.camera.source.source_type != "file":
        issues.append("camera.source.type must be 'file' for --dry-run; RTSP is not opened by the scaffold")
    elif not config.camera.source.path.is_file():
        issues.append(f"camera.source.path '{config.camera.source.path}' does not exist or is not a file; provide a local sample image")
    if issues:
        raise ConfigValidationError(issues)


def validate_runtime(config: CameraPipelineConfig) -> None:
    """Validate future runtime readiness without loading models or opening a camera."""
    issues: list[str] = []
    if not config.ingest.camera_key.strip():
        issues.append("ingest.camera_key / DAI_CAMERA_KEY is required for runtime ingest; set DAI_CAMERA_KEY securely")
    if config.camera.source.source_type == "file" and not config.camera.source.path.is_file():
        issues.append(f"camera.source.path '{config.camera.source.path}' does not exist; configure a readable file source")
    for name, artifact in (
        ("models.vehicle_detector.artifact_path", config.models.vehicle_detector),
        ("models.plate_detector.artifact_path", config.models.plate_detector),
        ("models.ocr.artifact_path", config.models.ocr),
    ):
        if not artifact.artifact_path.exists():
            issues.append(f"{name} '{artifact.artifact_path}' does not exist; install or configure the {artifact.name} artifact")
    output_parent = config.snapshot.output_dir.parent
    if not output_parent.is_dir() or not os.access(output_parent, os.W_OK):
        issues.append(f"snapshot.output_dir parent '{output_parent}' is not a writable directory; create or configure it before runtime")
    if issues:
        raise ConfigValidationError(issues)


def _mapping(parent: Mapping[str, object], key: str, path: str, issues: list[str]) -> dict[str, object]:
    value = parent.get(key)
    if not isinstance(value, dict):
        issues.append(f"{path} is required and must be an object")
        return {}
    return value


def _string(parent: Mapping[str, object], key: str, path: str, issues: list[str]) -> str:
    value = parent.get(key)
    if not isinstance(value, str) or not value.strip():
        issues.append(f"{path} is required and must be a non-empty string")
        return ""
    return value.strip()


def _optional_string(parent: Mapping[str, object], key: str) -> str:
    value = parent.get(key, "")
    return value.strip() if isinstance(value, str) else ""


def _value_or_default(parent: Mapping[str, object], key: str, path: str,
                      issues: list[str], default: object,
                      expected_type: type) -> object:
    value = parent.get(key, default)
    if not isinstance(value, expected_type) or (
            expected_type is str and not value.strip()):
        issues.append(f"{path} must be a {expected_type.__name__}")
        return default
    return value.strip() if expected_type is str else value


def _integer_or_default(parent: Mapping[str, object], key: str, path: str,
                        issues: list[str], default: int,
                        minimum: int | None = None) -> int:
    if key not in parent:
        return default
    return _integer(parent, key, path, issues, minimum=minimum)


def _number_or_default(parent: Mapping[str, object], key: str, path: str,
                       issues: list[str], default: float,
                       minimum: float | None = None) -> float:
    if key not in parent:
        return default
    return _number(parent, key, path, issues, minimum=minimum)


def _integer(parent: Mapping[str, object], key: str, path: str, issues: list[str],
             minimum: int | None = None, maximum: int | None = None) -> int:
    value = parent.get(key)
    if isinstance(value, bool) or not isinstance(value, int):
        issues.append(f"{path} is required and must be an integer")
        return 0
    if minimum is not None and value < minimum:
        issues.append(f"{path} must be at least {minimum}")
    if maximum is not None and value > maximum:
        issues.append(f"{path} must be at most {maximum}")
    return value


def _number(parent: Mapping[str, object], key: str, path: str, issues: list[str],
            minimum: float | None = None, maximum: float | None = None) -> float:
    value = parent.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        issues.append(f"{path} is required and must be a finite number")
        return 0.0
    number = float(value)
    if minimum is not None and number < minimum:
        issues.append(f"{path} must be at least {minimum}")
    if maximum is not None and number > maximum:
        issues.append(f"{path} must be at most {maximum}")
    return number


def _boolean(parent: Mapping[str, object], key: str, path: str, issues: list[str]) -> bool:
    value = parent.get(key)
    if not isinstance(value, bool):
        issues.append(f"{path} is required and must be true or false")
        return False
    return value


def _string_list(parent: Mapping[str, object], key: str, path: str, issues: list[str]) -> list[str]:
    value = parent.get(key)
    if not isinstance(value, list) or not value or any(not isinstance(item, str) or not item.strip() for item in value):
        issues.append(f"{path} is required and must be a non-empty list of strings")
        return []
    return [item.strip() for item in value]


def _model(parent: Mapping[str, object], key: str, base_dir: Path, issues: list[str]) -> ModelArtifactConfig:
    model = _mapping(parent, key, f"models.{key}", issues)
    image_size = None
    device = None
    if key in {"vehicle_detector", "plate_detector"}:
        image_size = _integer(model, "image_size", f"models.{key}.image_size", issues, minimum=1)
    if key in {"vehicle_detector", "plate_detector", "ocr"}:
        device = _string(model, "device", f"models.{key}.device", issues).lower()
        _validate_model_device(device, f"models.{key}.device", issues)
    return ModelArtifactConfig(
        name=_string(model, "name", f"models.{key}.name", issues),
        artifact_path=_resolve_path(_string(model, "artifact_path", f"models.{key}.artifact_path", issues), base_dir),
        artifact_version=_string(model, "artifact_version", f"models.{key}.artifact_version", issues),
        image_size=image_size,
        device=device,
    )


def _validate_model_device(value: str, path: str, issues: list[str]) -> None:
    if value == "cpu" or value == "cuda":
        return
    if value.startswith("cuda:") and value[5:].isdigit():
        return
    issues.append(f"{path} must be 'cpu', 'cuda', or 'cuda:<non-negative-index>'")


def _validate_uuid(value: str, path: str, issues: list[str]) -> None:
    try:
        UUID(value)
    except (TypeError, ValueError):
        issues.append(f"{path} must be a UUID")


def _validate_url(value: str, path: str, issues: list[str], allowed_schemes: set[str]) -> None:
    parsed = urlparse(value)
    if parsed.scheme not in allowed_schemes or not parsed.netloc:
        schemes = ", ".join(sorted(allowed_schemes))
        issues.append(f"{path} must be an absolute URL using one of: {schemes}")


def _override(environ: Mapping[str, str], key: str, current: str) -> str:
    value = environ.get(key)
    return value.strip() if isinstance(value, str) and value.strip() else current


def _resolve_path(value: str, base_dir: Path) -> Path:
    path = Path(value).expanduser()
    return path.resolve() if path.is_absolute() else (base_dir / path).resolve()


def _configuration_hash(pipeline: PipelineConfig, models: ModelsConfig,
                        thresholds: ThresholdsConfig, ocr: OcrConfig,
                        snapshot: SnapshotConfig,
                        barrier: BarrierConfig) -> str:
    """Hash only portable pipeline/model settings, never credentials or host paths."""
    payload = {
        "pipeline": asdict(pipeline),
        "models": {
            "vehicle_detector": {
                "name": models.vehicle_detector.name,
                "artifact_version": models.vehicle_detector.artifact_version,
                "image_size": models.vehicle_detector.image_size,
                "device": models.vehicle_detector.device,
            },
            "plate_detector": {
                "name": models.plate_detector.name,
                "artifact_version": models.plate_detector.artifact_version,
                "image_size": models.plate_detector.image_size,
                "device": models.plate_detector.device,
            },
            "ocr": {
                "name": models.ocr.name,
                "artifact_version": models.ocr.artifact_version,
                "device": models.ocr.device,
            },
        },
        "thresholds": asdict(thresholds),
        "ocr": asdict(ocr),
        "snapshot": {
            "backend": snapshot.backend,
            "content_type": snapshot.content_type,
            "jpeg_quality": snapshot.jpeg_quality,
            "max_width": snapshot.max_width,
        },
        "barrier": {
            "enabled": barrier.enabled,
            "backend": barrier.backend,
            "open_duration_s": barrier.open_duration_s,
            "close_cooldown_s": barrier.close_cooldown_s,
        },
    }
    digest = sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    return f"sha256:{digest}"
