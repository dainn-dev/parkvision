"""Tests for camera pipeline error-code classification and RTSP URL
redaction (SCENARIO-CAM-001 / SCENARIO-ANPR-001): crash/error messages
surfaced over IPC, logs, or incident reports must never leak RTSP
credentials embedded in a camera's stream URL.
"""

from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from edge.error_codes import CameraErrorCode, classify_opencv_error, redact_url


# ---------- redact_url ----------


def test_redact_url_hides_username_and_password() -> None:
    assert (
        redact_url("rtsp://admin:password@192.168.0.121:554/ch1")
        == "rtsp://***@192.168.0.121:554/ch1"
    )


def test_redact_url_hides_username_only() -> None:
    result = redact_url("rtsp://admin@192.168.0.121:554/ch1")
    assert "admin" not in result
    assert result == "rtsp://***@192.168.0.121:554/ch1"


def test_redact_url_without_credentials_is_unchanged() -> None:
    url = "rtsp://192.168.0.121:554/ch1"
    assert redact_url(url) == url


def test_redact_url_preserves_path_and_query_string() -> None:
    result = redact_url("rtsp://user:s3cret@host:554/ch1/main?transport=tcp")
    assert "user" not in result
    assert "s3cret" not in result
    assert "/ch1/main" in result
    assert "transport=tcp" in result


def test_redact_url_never_raises_on_malformed_input() -> None:
    # Must degrade safely rather than propagate an exception up into an
    # error/incident path that is supposed to be redacting, not crashing.
    result = redact_url("not a valid url ://[[[")
    assert isinstance(result, str)


# ---------- classify_opencv_error ----------


def test_classify_auth_failure_401() -> None:
    assert classify_opencv_error("server returned 401 Unauthorized") == CameraErrorCode.RTSP_AUTH_FAILED


def test_classify_auth_failure_403() -> None:
    assert classify_opencv_error("403 Forbidden") == CameraErrorCode.RTSP_AUTH_FAILED


def test_classify_connect_timeout() -> None:
    assert classify_opencv_error("Connection timed out") == CameraErrorCode.RTSP_CONNECT_TIMEOUT


def test_classify_connection_refused() -> None:
    assert (
        classify_opencv_error("Connection refused by remote host")
        == CameraErrorCode.RTSP_CONNECTION_REFUSED
    )


def test_classify_dns_failure() -> None:
    assert classify_opencv_error("Name resolution failed for host") == CameraErrorCode.RTSP_DNS_FAILED


def test_classify_unsupported_codec() -> None:
    assert (
        classify_opencv_error("Unsupported codec: h265")
        == CameraErrorCode.RTSP_UNSUPPORTED_CODEC
    )


def test_classify_unknown_error_falls_back_to_generic_stream_error() -> None:
    assert classify_opencv_error("some unexpected ffmpeg noise") == CameraErrorCode.RTSP_STREAM_ERROR


def run() -> None:
    tests = (
        test_redact_url_hides_username_and_password,
        test_redact_url_hides_username_only,
        test_redact_url_without_credentials_is_unchanged,
        test_redact_url_preserves_path_and_query_string,
        test_redact_url_never_raises_on_malformed_input,
        test_classify_auth_failure_401,
        test_classify_auth_failure_403,
        test_classify_connect_timeout,
        test_classify_connection_refused,
        test_classify_dns_failure,
        test_classify_unsupported_codec,
        test_classify_unknown_error_falls_back_to_generic_stream_error,
    )
    for test in tests:
        test()
        print(f"  ok: {test.__name__}")
    print("\nAll error-code/redaction checks passed.")


if __name__ == "__main__":
    run()
