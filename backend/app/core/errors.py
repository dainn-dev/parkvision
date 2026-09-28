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


def conflict(message: str, details: dict[str, Any] | None = None) -> ApiError:
    return ApiError(status.HTTP_409_CONFLICT, "conflict", message, details)


def bad_request(message: str, details: dict[str, Any] | None = None) -> ApiError:
    return ApiError(status.HTTP_400_BAD_REQUEST, "bad_request", message, details)


def unprocessable(message: str, details: dict[str, Any] | None = None) -> ApiError:
    return ApiError(status.HTTP_422_UNPROCESSABLE_ENTITY, "unprocessable_entity", message, details)


def too_many_requests(message: str = "Rate limit exceeded") -> ApiError:
    return ApiError(status.HTTP_429_TOO_MANY_REQUESTS, "rate_limited", message)
