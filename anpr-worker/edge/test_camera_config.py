"""DAI-290 configuration and typed event contract checks.

Run directly with ``python edge/edge/test_camera_config.py`` or under pytest.
No backend, camera, model framework, or OCR engine is required.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import tempfile
from uuid import UUID, uuid4

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from edge.camera_config import (
    ConfigValidationError,
    load_camera_pipeline_config,
    validate_dry_run,
    validate_runtime,
)
from edge.camera_processing_service import CameraProcessingService, configure_json_logging
from edge.camera_types import (
    BoundingBox,
    FrameMetadata,
    ModelProvenance,
    OcrResult,
    OutboundEvent,
    PlateDetection,
    SnapshotDescriptor,
    TrackIdentity,
    VehicleDetection,
)

SAMPLE_PROFILE = ROOT / "camera-pipeline.dry-run.example.json"


def _profile() -> dict:
    return json.loads(SAMPLE_PROFILE.read_text(encoding="utf-8"))


def _write_image(path: Path) -> None:
    # Tiny PPM image; Pillow detects it by content rather than relying on a native camera/model.
    path.write_bytes(b"P6\n1 1\n255\n\xff\x00\x00")


def _write_profile(directory: Path, profile: dict | None = None) -> tuple[Path, Path]:
    image = directory / "input.ppm"
    _write_image(image)
    data = deepcopy(profile if profile is not None else _profile())
    data["camera"]["source"] = {"type": "file", "path": "input.ppm", "username": "", "password": ""}
    path = directory / "camera.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return path, image


def _expect_validation(callable_, *expected_fragments: str) -> ConfigValidationError:
    try:
        callable_()
    except ConfigValidationError as exc:
        message = str(exc)
        for fragment in expected_fragments:
            assert fragment in message, f"Expected {fragment!r} in {message!r}"
        return exc
    raise AssertionError("expected ConfigValidationError")


def test_happy_path_resolves_relative_paths_and_profile_defaults() -> None:
    with tempfile.TemporaryDirectory() as raw:
        directory = Path(raw)
        path, image = _write_profile(directory)
        config = load_camera_pipeline_config(path, environ={})

        assert config.path == path.resolve()
        assert config.camera.source.path == image.resolve()
        assert config.pipeline.profile_id == "lpr-mvp-v1"
        assert config.pipeline.frame_interval_ms == 200
        assert config.models.vehicle_detector.device == "cpu"
        assert config.models.plate_detector.device == "cpu"
        assert config.models.plate_detector.image_size == 640
        assert config.models.ocr.device == "cpu"
        assert config.thresholds.motion.history == 500
        assert config.thresholds.vehicle.confidence == 0.4
        assert config.thresholds.plate_confidence == 0.6
        assert config.thresholds.plate_padding_ratio == 0.1
        assert config.thresholds.min_plate_width_px == 20
        assert config.thresholds.min_plate_height_px == 8
        assert config.snapshot.backend == "local"
        assert config.thresholds.ocr_confidence == 0.8
        assert config.thresholds.tracker.min_hits == 3
        assert config.ocr.primary == "PaddleOCR"
        assert config.ocr.automatic_fallback is False
        assert config.ocr.low_confidence_policy == "reject"
        assert config.configuration_hash.startswith("sha256:")
        validate_dry_run(config)


def test_environment_overrides_take_precedence_without_changing_profile_hash() -> None:
    with tempfile.TemporaryDirectory() as raw:
        directory = Path(raw)
        path, _ = _write_profile(directory)
        base = load_camera_pipeline_config(path, environ={})
        overridden = load_camera_pipeline_config(path, environ={
            "DAI_TENANT_ID": "10000000-0000-0000-0000-000000000099",
            "DAI_SITE_ID": "20000000-0000-0000-0000-000000000099",
            "DAI_CAMERA_ID": "30000000-0000-0000-0000-000000000099",
            "DAI_CAMERA_SOURCE": "another-input.ppm",
            "DAI_CAMERA_SOURCE_PASSWORD": "do-not-hash-or-log",
            "DAI_INGEST_URL": "https://ingest.example.test/api/v1/parking-events",
            "DAI_CAMERA_KEY": "secret-camera-key",
            "DAI_SNAPSHOT_OUTPUT_DIR": "host-specific-output",
        })

        assert overridden.camera.camera_id.endswith("99")
        assert overridden.camera.source.path == (directory / "another-input.ppm").resolve()
        assert overridden.ingest.url.startswith("https://ingest.example.test")
        assert overridden.ingest.camera_key == "secret-camera-key"
        assert overridden.configuration_hash == base.configuration_hash
        assert "secret-camera-key" not in str(overridden.safe_metadata())
        assert "do-not-hash-or-log" not in str(overridden.safe_metadata())


def test_invalid_configuration_reports_multiple_actionable_issues() -> None:
    with tempfile.TemporaryDirectory() as raw:
        directory = Path(raw)
        profile_path, _ = _write_profile(directory)
        data = json.loads(profile_path.read_text(encoding="utf-8"))
        del data["pipeline"]
        data["camera"]["tenant_id"] = "not-a-uuid"
        data["camera"]["source"]["type"] = "webcam"
        data["models"]["vehicle_detector"]["device"] = "cuda:-1"
        data["models"]["plate_detector"]["device"] = "gpu"
        data["models"]["ocr"]["device"] = "auto"
        data["ocr"]["low_confidence_policy"] = "vote"
        data["thresholds"]["vehicle"]["confidence"] = 1.1
        data["thresholds"]["plate_padding_ratio"] = 1.1
        data["thresholds"]["min_plate_width_px"] = 0
        data["snapshot"]["backend"] = "remote"
        data["ingest"]["url"] = "not-a-url"
        profile_path.write_text(json.dumps(data), encoding="utf-8")

        _expect_validation(
            lambda: load_camera_pipeline_config(profile_path, environ={}),
            "pipeline is required",
            "camera.tenant_id / DAI_TENANT_ID must be a UUID",
            "camera.source.type must be 'file' or 'rtsp'",
            "models.vehicle_detector.device must be 'cpu', 'cuda', or 'cuda:<non-negative-index>'",
            "models.plate_detector.device must be 'cpu', 'cuda', or 'cuda:<non-negative-index>'",
            "models.ocr.device must be 'cpu', 'cuda', or 'cuda:<non-negative-index>'",
            "ocr.low_confidence_policy must be 'reject' or 'accept_flagged'",
            "thresholds.vehicle.confidence must be at most 1",
            "thresholds.plate_padding_ratio must be at most 1",
            "thresholds.min_plate_width_px must be at least 1",
            "snapshot.backend must be 'local'",
            "ingest.url / DAI_INGEST_URL must be an absolute URL",
        )


def test_vehicle_device_changes_configuration_hash() -> None:
    with tempfile.TemporaryDirectory() as raw:
        directory = Path(raw)
        first_path, _ = _write_profile(directory)
        first = load_camera_pipeline_config(first_path, environ={})
        changed = json.loads(first_path.read_text(encoding="utf-8"))
        changed["models"]["vehicle_detector"]["device"] = "cuda:0"
        second_path = directory / "cuda.json"
        second_path.write_text(json.dumps(changed), encoding="utf-8")
        second = load_camera_pipeline_config(second_path, environ={})
        assert first.configuration_hash != second.configuration_hash


def test_plate_and_snapshot_settings_change_configuration_hash() -> None:
    with tempfile.TemporaryDirectory() as raw:
        directory = Path(raw)
        first_path, _ = _write_profile(directory)
        first = load_camera_pipeline_config(first_path, environ={})
        changed = json.loads(first_path.read_text(encoding="utf-8"))
        changed["thresholds"]["plate_padding_ratio"] = 0.2
        changed["snapshot"]["jpeg_quality"] = 70
        second_path = directory / "plate-settings.json"
        second_path.write_text(json.dumps(changed), encoding="utf-8")
        second = load_camera_pipeline_config(second_path, environ={})
        assert first.configuration_hash != second.configuration_hash


def test_ocr_device_policy_and_threshold_change_configuration_hash() -> None:
    with tempfile.TemporaryDirectory() as raw:
        directory = Path(raw)
        first_path, _ = _write_profile(directory)
        first = load_camera_pipeline_config(first_path, environ={})
        changed = json.loads(first_path.read_text(encoding="utf-8"))
        changed["models"]["ocr"]["device"] = "cuda:0"
        changed["ocr"]["low_confidence_policy"] = "accept_flagged"
        changed["thresholds"]["ocr_confidence"] = 0.75
        second_path = directory / "ocr-settings.json"
        second_path.write_text(json.dumps(changed), encoding="utf-8")
        second = load_camera_pipeline_config(second_path, environ={})
        assert first.configuration_hash != second.configuration_hash


def test_malformed_json_reports_the_file_location() -> None:
    with tempfile.TemporaryDirectory() as raw:
        path = Path(raw) / "broken.json"
        path.write_text("{not-json", encoding="utf-8")
        _expect_validation(lambda: load_camera_pipeline_config(path, environ={}), "malformed JSON", "line")


def test_dry_run_allows_uninstalled_future_models_but_runtime_reports_them() -> None:
    with tempfile.TemporaryDirectory() as raw:
        directory = Path(raw)
        path, _ = _write_profile(directory)
        config = load_camera_pipeline_config(path, environ={})

        validate_dry_run(config)
        _expect_validation(
            lambda: validate_runtime(config),
            "ingest.camera_key / DAI_CAMERA_KEY is required",
            "models.vehicle_detector.artifact_path",
            "models.plate_detector.artifact_path",
            "models.ocr.artifact_path",
        )


def test_missing_file_source_fails_before_pipeline_stages_are_ready() -> None:
    with tempfile.TemporaryDirectory() as raw:
        directory = Path(raw)
        path, _ = _write_profile(directory)
        data = json.loads(path.read_text(encoding="utf-8"))
        data["camera"]["source"]["path"] = "missing.ppm"
        path.write_text(json.dumps(data), encoding="utf-8")
        config = load_camera_pipeline_config(path, environ={})
        _expect_validation(lambda: validate_dry_run(config), "camera.source.path")


def test_dry_run_reads_image_without_creating_snapshot_output() -> None:
    with tempfile.TemporaryDirectory() as raw:
        directory = Path(raw)
        path, _ = _write_profile(directory)
        data = json.loads(path.read_text(encoding="utf-8"))
        data["snapshot"]["output_dir"] = "must-not-exist/nested"
        path.write_text(json.dumps(data), encoding="utf-8")
        config = load_camera_pipeline_config(path, environ={})
        frame = CameraProcessingService(config, configure_json_logging("ERROR")).dry_run()

        assert frame.width == 1 and frame.height == 1
        assert not (directory / "must-not-exist").exists()


def test_typed_events_match_the_camera_ingest_envelope_without_tenant_or_storage_fields() -> None:
    now = datetime.now(timezone.utc)
    frame = FrameMetadata(now, 1920, 1080)
    track = TrackIdentity(uuid4(), "42")
    vehicle = VehicleDetection("car", 0.93, BoundingBox(492, 243, 916, 540))
    vehicle_model = ModelProvenance("yolo11n", "2026.07.0", confidence_threshold=0.4)
    event = OutboundEvent.vehicle_detected(
        camera_id=UUID("30000000-0000-0000-0000-000000000290"),
        occurred_at=now,
        pipeline_id="lpr-mvp-v1",
        configuration_hash="sha256:12345678",
        frame=frame,
        track=track,
        vehicle=vehicle,
        vehicle_model=vehicle_model,
    )
    envelope = event.to_ingest_envelope()

    assert set(envelope) == {"eventId", "eventType", "cameraId", "occurredAt", "payload"}
    assert envelope["payload"]["eventVersion"] == 1
    assert "tenantId" not in json.dumps(envelope)
    assert "objectKey" not in json.dumps(envelope)

    crop = SnapshotDescriptor(
        "plate_crop", "image/jpeg", 242, 78, "sha256:12345678",
        source_bounding_box=BoundingBox(780, 554, 242, 78),
    )
    plate_event = OutboundEvent.plate_recognized(
        camera_id=UUID(envelope["cameraId"]),
        occurred_at=now,
        causation_event_id=UUID(envelope["eventId"]),
        pipeline_id="lpr-mvp-v1",
        configuration_hash="sha256:12345678",
        frame=frame,
        track=track,
        vehicle=vehicle,
        plate=PlateDetection(0.94, BoundingBox(780, 554, 242, 78)),
        ocr=OcrResult("51A-123.45", 0.96),
        vehicle_model=vehicle_model,
        plate_model=ModelProvenance("lp-detector-nano", "61", confidence_threshold=0.6),
        ocr_model=ModelProvenance("PaddleOCR", "pp-ocr-mobile", recognition_confidence_threshold=0.8),
        snapshots=[crop],
    )
    assert plate_event.to_ingest_envelope()["payload"]["snapshotUpload"] == {
        "part": "snapshot", "kind": "plate_crop"
    }


def run() -> None:
    tests = (
        test_happy_path_resolves_relative_paths_and_profile_defaults,
        test_environment_overrides_take_precedence_without_changing_profile_hash,
        test_invalid_configuration_reports_multiple_actionable_issues,
        test_vehicle_device_changes_configuration_hash,
        test_plate_and_snapshot_settings_change_configuration_hash,
        test_ocr_device_policy_and_threshold_change_configuration_hash,
        test_malformed_json_reports_the_file_location,
        test_dry_run_allows_uninstalled_future_models_but_runtime_reports_them,
        test_missing_file_source_fails_before_pipeline_stages_are_ready,
        test_dry_run_reads_image_without_creating_snapshot_output,
        test_typed_events_match_the_camera_ingest_envelope_without_tenant_or_storage_fields,
    )
    for test in tests:
        test()
        print(f"  ok: {test.__name__}")
    print("\nAll DAI-290 camera pipeline configuration checks passed.")


if __name__ == "__main__":
    run()
