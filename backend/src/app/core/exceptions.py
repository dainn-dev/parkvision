"""Domain exceptions rendered as the standard error envelope."""

from fastapi import status


class ApiError(Exception):
    status_code: int = status.HTTP_400_BAD_REQUEST
    code: str = "bad_request"

    def __init__(self, message: str | None = None, *, details: dict | None = None):
        super().__init__(message or self.code)
        self.message = message or self.code
        self.details = details


class UnauthorizedError(ApiError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "unauthorized"


class ForbiddenError(ApiError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "forbidden"


class NotFoundError(ApiError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "not_found"


class ConflictError(ApiError):
    status_code = status.HTTP_409_CONFLICT
    code = "conflict"


class RateLimitedError(ApiError):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    code = "rate_limited"


class ValidationError(ApiError):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    code = "validation_error"


class MfaRequiredError(ApiError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "mfa_required"


def not_found(what: str = "resource") -> NotFoundError:
    return NotFoundError(f"{what} not found")
