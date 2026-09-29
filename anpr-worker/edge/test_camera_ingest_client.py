"""DAI-294 Camera ingest transport, retry, payload, and pipeline checks."""

from __future__ import annotations

from datetime import datetime, timezone
from dataclasses import replace
import json
import logging
from pathlib import Path
import sys
import tempfile
import threading
from uuid import UUID

import numpy as np
import requests

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from edge.camera_config import IngestConfig, load_camera_pipeline_config
from edge.camera_ingest_client import CameraIngestClient, IngestResult
from edge.camera_processing_service import CameraProcessingService
from edge.camera_types import (
    BoundingBox,
    FrameMetadata,
    ModelProvenance,
    OutboundEvent,
    PlateCandidate,
    PlateCandidateArtifacts,
    PlateDetection,
    PlateOcrObservation,
    RetainedFrame,
    SnapshotDescriptor,
    StoredSnapshot,
    TrackIdentity,
    VehicleDetection,
)
from edge.vehicle_tracker import TrackEventType, TrackLifecycleEvent, TrackedVehicle


NOW = datetime(2026, 7, 13, tzinfo=timezone.utc)
CAMERA_ID = "30000000-0000-0000-0000-000000000294"
PROFILE = ROOT / "camera-pipeline.dry-run.example.json"


def _config(*, dry_run=False, max_attempts=3) -> IngestConfig:
    return IngestConfig(
        "https://ingest.example.test/api/v1/parking-events", 4, "camera-secret",
        "snapshot", dry_run, max_attempts, 0.5, 5.0)


def _event(event_id="50000000-0000-0000-0000-000000000294") -> OutboundEvent:
    frame = FrameMetadata(NOW, 200, 100)
    return OutboundEvent.vehicle_detected(
        camera_id=UUID(CAMERA_ID), occurred_at=NOW,
        pipeline_id="lpr-mvp-v1", configuration_hash="sha256:12345678",
        frame=frame, track=TrackIdentity(UUID(CAMERA_ID), "42"),
        vehicle=VehicleDetection("car", 0.91, BoundingBox(10, 10, 80, 40)),
        vehicle_model=ModelProvenance("yolo11n", "2026.07.0", 0.4),
        event_id=UUID(event_id),
    )


class _Response:
    def __init__(self, status, body=None, text="", headers=None):
        self.status_code = status
        self._body = body
        self.text = text
        self.headers = headers or {}

    def json(self):
        if isinstance(self._body, Exception):
            raise self._body
        return self._body


class _Backend:
    def __init__(self, responses):
        self.responses = iter(responses)
        self.calls = []

    def post(self, url, **kwargs):
        self.calls.append({"url": url, **kwargs})
        value = next(self.responses)
        if isinstance(value, Exception):
            raise value
        return value


def _accepted(event):
    return _Response(202, {"eventId": str(event.event_id), "status": "accepted"})


def test_json_auth_idempotency_and_ack_contract() -> None:
    event = _event()
    backend = _Backend([_accepted(event)])
    client = CameraIngestClient(_config(), CAMERA_ID, post=backend.post)

    result = client.send(event)

    assert result.delivered and result.attempts == 1 and result.status_code == 202
    call = backend.calls[0]
    assert call["headers"]["X-Camera-Id"] == CAMERA_ID
    assert call["headers"]["X-Camera-Key"] == "camera-secret"
    assert call["headers"]["Idempotency-Key"] == str(event.event_id)
    assert call["json"] == event.to_ingest_envelope()
    assert "tenantId" not in json.dumps(call["json"])
    assert "siteId" not in json.dumps(call["json"])


def test_retry_preserves_event_id_and_honors_retry_after() -> None:
    event = _event()
    backend = _Backend([
        requests.exceptions.Timeout("timeout"),
        _Response(429, text="busy", headers={"Retry-After": "2"}),
        _accepted(event),
    ])
    delays = []
    client = CameraIngestClient(
        _config(), CAMERA_ID, post=backend.post, sleep=delays.append)

    result = client.send(event)

    assert result.delivered and result.attempts == 3
    assert delays == [0.5, 2.0]
    assert {call["headers"]["Idempotency-Key"] for call in backend.calls} == {
        str(event.event_id)}
    assert {call["json"]["eventId"] for call in backend.calls} == {
        str(event.event_id)}


def test_permanent_rejection_is_not_retried() -> None:
    event = _event()
    backend = _Backend([_Response(400, text="invalid payload")])
    client = CameraIngestClient(_config(), CAMERA_ID, post=backend.post)

    result = client.send(event)

    assert not result.delivered and not result.retryable
    assert result.attempts == 1 and result.status_code == 400
    assert "invalid payload" in result.error
    assert len(backend.calls) == 1


def test_snapshot_uses_multipart_event_and_binary_part() -> None:
    event = _event()
    event = OutboundEvent(
        event.event_id, event.event_type, event.camera_id, event.occurred_at,
        event.payload, SnapshotDescriptor("plate_crop", "image/jpeg", 20, 10,
                                          "sha256:12345678"))
    backend = _Backend([_accepted(event)])
    client = CameraIngestClient(_config(), CAMERA_ID, post=backend.post)
    with tempfile.TemporaryDirectory() as raw:
        path = Path(raw) / "plate.jpg"
        path.write_bytes(b"jpeg-bytes")
        result = client.send(event, path)

    assert result.delivered
    call = backend.calls[0]
    assert "json" not in call and "Content-Type" not in call["headers"]
    assert json.loads(call["files"]["event"][1]) == event.to_ingest_envelope()
    assert call["files"]["snapshot"][1] == b"jpeg-bytes"
    assert call["files"]["snapshot"][2] == "image/jpeg"


def test_original_and_plate_crop_are_uploaded_and_spooled_together() -> None:
    event = _event()
    with tempfile.TemporaryDirectory() as raw:
        root = Path(raw)
        original = root / "original.jpg"
        crop = root / "plate.jpg"
        original.write_bytes(b"original")
        crop.write_bytes(b"crop")
        config = replace(_config(max_attempts=1), queue_enabled=True,
                         queue_path=root / "queue.sqlite3", queue_retry_seconds=0.0)
        offline = _Backend([requests.exceptions.ConnectionError("offline")])
        client = CameraIngestClient(config, CAMERA_ID, post=offline.post)

        result = client.send(event, {"original_frame": original, "plate_crop": crop})
        queued = client.queue.due_events()[0]

        assert result.retryable
        assert queued["snapshots"]["original_frame"][1] == b"original"
        assert queued["snapshots"]["plate_crop"][1] == b"crop"
        recovered = _Backend([_accepted(event)])
        client._post = recovered.post
        assert client.flush_pending()["delivered"] == 1
        assert recovered.calls[0]["files"]["original_frame"][1] == b"original"
        assert recovered.calls[0]["files"]["plate_crop"][1] == b"crop"
        client.close()


def test_dry_run_returns_exact_payload_without_network() -> None:
    event = _event()

    def fail_post(*_args, **_kwargs):
        raise AssertionError("dry-run must not send HTTP")

    result = CameraIngestClient(
        _config(dry_run=True), CAMERA_ID, post=fail_post).send(event)

    assert result.dry_run and not result.delivered and result.attempts == 0
    assert result.response == event.to_ingest_envelope()


def test_heartbeat_posts_immediately_to_camera_endpoint_and_stops_cleanly() -> None:
    called = threading.Event()

    class HeartbeatBackend:
        def __init__(self):
            self.calls = []

        def post(self, url, **kwargs):
            self.calls.append({"url": url, **kwargs})
            called.set()
            return _Response(200)

    backend = HeartbeatBackend()
    config = replace(
        _config(),
        url="https://edge.example.test/reverse-proxy/api/v1/parking-events?source=edge",
        heartbeat_interval_seconds=60.0,
    )
    client = CameraIngestClient(config, CAMERA_ID, post=backend.post)

    client.start_heartbeat()
    assert called.wait(1.0), "heartbeat was not sent immediately"
    client.close()

    assert backend.calls == [{
        "url": (
            "https://edge.example.test/reverse-proxy/api/cameras/"
            f"{CAMERA_ID}/heartbeat"
        ),
        "headers": {
            "Accept": "application/json",
            "X-Camera-Id": CAMERA_ID,
            "X-Camera-Key": "camera-secret",
        },
        "timeout": 4,
    }]
    assert client._heartbeat_thread is None


def test_heartbeat_rejection_is_not_treated_as_success() -> None:
    backend = _Backend([_Response(401, text="invalid camera credential")])
    client = CameraIngestClient(_config(), CAMERA_ID, post=backend.post)

    status, error = client._send_heartbeat()

    assert status == 401
    assert error is not None and "invalid camera credential" in error


def test_heartbeat_respects_dry_run() -> None:
    def fail_post(*_args, **_kwargs):
        raise AssertionError("dry-run must not send heartbeat HTTP")

    client = CameraIngestClient(
        _config(dry_run=True), CAMERA_ID, post=fail_post)

    client.start_heartbeat()
    client.close()

    assert client._heartbeat_thread is None


class _RecordingIngest:
    def __init__(self):
        self.sent = []

    def ensure_ready(self):
        return None

    def send(self, event, snapshot_path=None):
        self.sent.append((event, snapshot_path))
        return IngestResult(True, False, False, 1, 202, {
            "eventId": str(event.event_id), "status": "accepted"})


def _logger(records):
    class Capture(logging.Handler):
        def emit(self, record):
            records.append(json.loads(record.getMessage()))

    logger = logging.Logger("ingest-test", level=logging.DEBUG)
    logger.addHandler(Capture())
    return logger


def test_pipeline_builds_vehicle_and_plate_contracts_with_snapshot_context() -> None:
    config = load_camera_pipeline_config(PROFILE, environ={})
    ingest = _RecordingIngest()
    records = []
    service = CameraProcessingService(config, _logger(records), ingest_client=ingest)
    frame = RetainedFrame.from_bgr(1, NOW, np.zeros((100, 200, 3), dtype=np.uint8))
    vehicle = VehicleDetection("car", 0.91, BoundingBox(10, 10, 80, 40))
    track = TrackedVehicle("42", vehicle)
    candidate = PlateCandidate(
        UUID("40000000-0000-0000-0000-000000000294"), frame, vehicle,
        PlateDetection(0.93, BoundingBox(30, 30, 40, 15)),
        np.zeros((15, 40, 3), dtype=np.uint8))
    crop = StoredSnapshot(
        SnapshotDescriptor("plate_crop", "image/jpeg", 40, 15, "sha256:12345678",
                           NOW, candidate.plate.bounding_box),
        "frame/plate.jpg")
    original = StoredSnapshot(
        SnapshotDescriptor("original_frame", "image/jpeg", 200, 100,
                           "sha256:87654321", NOW),
        "frame/original.jpg")
    artifacts = PlateCandidateArtifacts(candidate, original, crop)
    observation = PlateOcrObservation(
        candidate.candidate_id, "frame/plate.jpg", "PaddleOCR", "51A-123.45",
        "51A12345", 0.96, 0.8, "accepted", True, {})

    service._emit_ingest_event(
        TrackLifecycleEvent(TrackEventType.ENTER, "42", NOW, vehicle.bounding_box),
        frame, [track], [(candidate, observation)], {candidate.candidate_id: artifacts},
        [original, crop])
    service._emit_ingest_event(
        TrackLifecycleEvent(
            TrackEventType.PLATE_RECOGNIZED, "42", NOW, vehicle.bounding_box, "51A12345"),
        frame, [track], [(candidate, observation)], {candidate.candidate_id: artifacts})
    service._emit_ingest_event(
        TrackLifecycleEvent(TrackEventType.RELOCATE, "42", NOW, vehicle.bounding_box, "51A12345"),
        frame, [track], [], {}, [original, crop])
    service._emit_ingest_event(
        TrackLifecycleEvent(TrackEventType.EXIT, "42", NOW, vehicle.bounding_box, "51A12345"),
        frame, [], [], {}, [original, crop])

    assert [item[0].event_type for item in ingest.sent] == [
        "VehicleDetected", "PlateRecognized", "SnapshotSaved", "SnapshotSaved"]
    vehicle_event, plate_event = [item[0] for item in ingest.sent[:2]]
    assert [item["kind"] for item in vehicle_event.payload["snapshots"]] == [
        "original_frame", "plate_crop"]
    assert vehicle_event.payload["snapshotUpload"] == {
        "part": "snapshot", "kind": "original_frame"}
    assert ingest.sent[0][1] == {
        "original_frame": config.snapshot.output_dir / "frame/original.jpg",
        "plate_crop": config.snapshot.output_dir / "frame/plate.jpg",
    }
    assert plate_event.payload["causationEventId"] == str(vehicle_event.event_id)
    assert plate_event.payload["tracker"]["trackId"] == "42"
    assert plate_event.payload["plate"]["normalizedText"] == "51A12345"
    assert len(plate_event.payload["snapshots"]) == 2
    assert ingest.sent[1][1] == {
        "original_frame": config.snapshot.output_dir / "frame/original.jpg",
        "plate_crop": config.snapshot.output_dir / "frame/plate.jpg",
    }
    assert [item[0].payload["lifecycle"] for item in ingest.sent[2:]] == ["relocate", "exit"]
    assert all(set(item[1]) == {"original_frame", "plate_crop"} for item in ingest.sent[2:])
    delivered_log = [item for item in records if item["stage"] == "ingest"][-1]
    assert delivered_log["tenant_id"] == config.camera.tenant_id
    assert delivered_log["site_id"] == config.camera.site_id
    assert delivered_log["camera_id"] == config.camera.camera_id


def test_unexpected_transport_failure_logs_complete_event_context() -> None:
    class FailingIngest(_RecordingIngest):
        def send(self, event, snapshot_path=None):
            raise RuntimeError("synthetic transport failure")

    config = load_camera_pipeline_config(PROFILE, environ={})
    records = []
    service = CameraProcessingService(
        config, _logger(records), ingest_client=FailingIngest())

    service._send_ingest(_event())

    failure = [item for item in records
               if item["stage"] == "ingest" and item["status"] == "failed"][-1]
    assert failure["event"]["eventId"] == str(_event().event_id)
    assert failure["event"]["eventType"] == "VehicleDetected"
    assert failure["tenant_id"] == config.camera.tenant_id
    assert failure["camera_id"] == config.camera.camera_id
    assert failure["error"] == "synthetic transport failure"


def test_retryable_failure_is_spooled_and_replayed_with_same_idempotency_key() -> None:
    event = _event()
    with tempfile.TemporaryDirectory() as raw:
        config = replace(
            _config(max_attempts=1),
            queue_enabled=True,
            queue_path=Path(raw) / "camera-events.sqlite3",
            queue_retry_seconds=0.0,
        )
        offline = _Backend([requests.exceptions.ConnectionError("offline")])
        client = CameraIngestClient(config, CAMERA_ID, post=offline.post, sleep=lambda _: None)

        result = client.send(event)

        assert result.retryable is True
        assert client.queue is not None and client.queue.count() == 1
        recovered = _Backend([_accepted(event)])
        client._post = recovered.post
        stats = client.flush_pending()
        assert stats == {"attempted": 1, "delivered": 1, "discarded": 0, "remaining": 0}
        assert recovered.calls[0]["headers"]["Idempotency-Key"] == str(event.event_id)
        client.close()


def run() -> None:
    tests = (
        test_json_auth_idempotency_and_ack_contract,
        test_retry_preserves_event_id_and_honors_retry_after,
        test_permanent_rejection_is_not_retried,
        test_snapshot_uses_multipart_event_and_binary_part,
        test_dry_run_returns_exact_payload_without_network,
        test_heartbeat_posts_immediately_to_camera_endpoint_and_stops_cleanly,
        test_heartbeat_rejection_is_not_treated_as_success,
        test_heartbeat_respects_dry_run,
        test_pipeline_builds_vehicle_and_plate_contracts_with_snapshot_context,
        test_unexpected_transport_failure_logs_complete_event_context,
        test_retryable_failure_is_spooled_and_replayed_with_same_idempotency_key,
    )
    for test in tests:
        test()
        print(f"  ok: {test.__name__}")
    print("\nAll DAI-294 camera ingest checks passed.")


if __name__ == "__main__":
    run()
