from typing import Any

from fastapi import status


class ApiError(Exception):
    """Application error rendered as the shared error envelope."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or {}
        super().__init__(message)


def not_found(resource: str, resource_id: Any = None) -> ApiError:
    return ApiError(
        status.HTTP_404_NOT_FOUND,
        "not_found",
        f"{resource} not found",
        {"resource": resource, "id": str(resource_id) if resource_id is not None else None},
    )


def forbidden(message: str = "Insufficient permissions") -> ApiError:
    return ApiError(status.HTTP_403_FORBIDDEN, "forbidden", message)


def unauthorized(message: str = "Authentication required") -> ApiError:
    return ApiError(status.HTTP_401_UNAUTHORIZED, "unauthorized", message)


# --- auth-flow error codes (login / MFA transaction) ---
# Codes are snake_case to match the rest of the error envelope.


def invalid_credentials() -> ApiError:
    # Deliberately identical for unknown user vs wrong password — no enumeration.
    return ApiError(
        status.HTTP_401_UNAUTHORIZED,
        "invalid_credentials",
        "Invalid username or password.",
    )


def account_disabled() -> ApiError:
    return ApiError(
        status.HTTP_403_FORBIDDEN, "account_disabled", "This account is currently unavailable."
    )


def account_locked() -> ApiError:
    return ApiError(
        status.HTTP_423_LOCKED, "account_locked", "This account is temporarily locked."
    )


def invalid_mfa_code() -> ApiError:
    return ApiError(
        status.HTTP_401_UNAUTHORIZED, "invalid_mfa_code", "The authentication code is invalid."
    )


def mfa_session_invalid() -> ApiError:
    return ApiError(
        status.HTTP_401_UNAUTHORIZED,
        "mfa_session_invalid",
        "The authentication session is invalid. Please login again.",
    )


def mfa_session_expired() -> ApiError:
    return ApiError(
        status.HTTP_401_UNAUTHORIZED,
        "mfa_session_expired",
        "The authentication session has expired. Please login again.",
    )


def mfa_too_many_attempts() -> ApiError:
    return ApiError(
        status.HTTP_429_TOO_MANY_REQUESTS,
        "mfa_too_many_attempts",
        "Too many verification attempts. Please try again later.",
    )


def invalid_reset_token() -> ApiError:
    return ApiError(
        status.HTTP_401_UNAUTHORIZED,
        "invalid_reset_token",
        "The password reset link is invalid or has expired.",
    )


def conflict(message: str, details: dict[str, Any] | None = None) -> ApiError:
    return ApiError(status.HTTP_409_CONFLICT, "conflict", message, details)


def bad_request(message: str, details: dict[str, Any] | None = None) -> ApiError:
    return ApiError(status.HTTP_400_BAD_REQUEST, "bad_request", message, details)


def unprocessable(message: str, details: dict[str, Any] | None = None) -> ApiError:
    return ApiError(status.HTTP_422_UNPROCESSABLE_ENTITY, "unprocessable_entity", message, details)


def too_many_requests(message: str = "Rate limit exceeded") -> ApiError:
    return ApiError(status.HTTP_429_TOO_MANY_REQUESTS, "rate_limited", message)
