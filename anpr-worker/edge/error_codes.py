"""
Standardized error codes for camera pipeline runtime errors.
These codes are sent via IPC to Rust supervisor and displayed on website.
"""

from enum import Enum


class CameraErrorCode(str, Enum):
    """Standardized error codes for external reporting (no secrets)"""

    # RTSP connection errors
    RTSP_DNS_FAILED = "RTSP_DNS_FAILED"
    RTSP_CONNECT_TIMEOUT = "RTSP_CONNECT_TIMEOUT"
    RTSP_CONNECTION_REFUSED = "RTSP_CONNECTION_REFUSED"
    RTSP_AUTH_FAILED = "RTSP_AUTH_FAILED"
    RTSP_UNSUPPORTED_CODEC = "RTSP_UNSUPPORTED_CODEC"
    RTSP_NO_FRAMES = "RTSP_NO_FRAMES"
    RTSP_STREAM_ERROR = "RTSP_STREAM_ERROR"

    # Model/inference errors
    MODEL_LOAD_FAILED = "MODEL_LOAD_FAILED"
    MODEL_INFERENCE_ERROR = "MODEL_INFERENCE_ERROR"

    # Backend communication errors
    INGEST_UNAUTHORIZED = "INGEST_UNAUTHORIZED"
    INGEST_RATE_LIMITED = "INGEST_RATE_LIMITED"
    BACKEND_UNREACHABLE = "BACKEND_UNREACHABLE"

    # Worker errors
    WORKER_CRASHED = "WORKER_CRASHED"
    CONFIG_INVALID = "CONFIG_INVALID"


def redact_url(url: str) -> str:
    """
    Redact RTSP URL to remove credentials from logs and error messages.

    Example:
        rtsp://admin:password@192.168.0.121:554/ch1
        -> rtsp://***@192.168.0.121:554/ch1
    """
    from urllib.parse import urlparse, urlunparse

    try:
        parsed = urlparse(url)
        if parsed.username or parsed.password:
            # Replace username:password with ***
            netloc = parsed.hostname or ""
            if parsed.port:
                netloc += f":{parsed.port}"
            netloc = f"***@{netloc}"

            return urlunparse((
                parsed.scheme,
                netloc,
                parsed.path,
                parsed.params,
                parsed.query,
                parsed.fragment
            ))
    except Exception:
        return "***"

    return url


def classify_opencv_error(error_msg: str) -> CameraErrorCode:
    """Classify OpenCV/FFmpeg error messages into standardized codes"""
    error_lower = error_msg.lower()

    if "401" in error_msg or "unauthorized" in error_lower:
        return CameraErrorCode.RTSP_AUTH_FAILED
    if "403" in error_msg or "forbidden" in error_lower:
        return CameraErrorCode.RTSP_AUTH_FAILED
    if "timeout" in error_lower or "timed out" in error_lower:
        return CameraErrorCode.RTSP_CONNECT_TIMEOUT
    if "connection refused" in error_lower or "refused" in error_lower:
        return CameraErrorCode.RTSP_CONNECTION_REFUSED
    if "name resolution" in error_lower or "unknown host" in error_lower:
        return CameraErrorCode.RTSP_DNS_FAILED
    if "codec" in error_lower or "unsupported" in error_lower:
        return CameraErrorCode.RTSP_UNSUPPORTED_CODEC

    return CameraErrorCode.RTSP_STREAM_ERROR
