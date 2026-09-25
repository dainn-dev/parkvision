"""Uniform error envelope: {"error": {"code", "message", "details?"}}."""

from typing import Any

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class AppError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: Any = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details
        super().__init__(message)


def error_body(code: str, message: str, details: Any = None) -> dict[str, Any]:
    body: dict[str, Any] = {"error": {"code": code, "message": message}}
    if details is not None:
        body["error"]["details"] = details
    return body


async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=error_body(exc.code, exc.message, exc.details),
    )


async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=error_body("VALIDATION_ERROR", "Request validation failed", exc.errors()),
    )


async def unhandled_error_handler(_: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=error_body("INTERNAL_ERROR", "Unexpected server error"),
    )


def not_found(message: str = "Resource not found") -> AppError:
    return AppError(status.HTTP_404_NOT_FOUND, "NOT_FOUND", message)


def conflict(message: str, details: Any = None) -> AppError:
    return AppError(status.HTTP_409_CONFLICT, "CONFLICT", message, details)


def forbidden(message: str = "Insufficient permissions") -> AppError:
    return AppError(status.HTTP_403_FORBIDDEN, "FORBIDDEN", message)


def unauthorized(message: str = "Authentication required") -> AppError:
    return AppError(status.HTTP_401_UNAUTHORIZED, "UNAUTHORIZED", message)


def bad_request(message: str, details: Any = None) -> AppError:
    return AppError(status.HTTP_400_BAD_REQUEST, "BAD_REQUEST", message, details)


def unprocessable(message: str, details: Any = None) -> AppError:
    return AppError(status.HTTP_422_UNPROCESSABLE_ENTITY, "UNPROCESSABLE", message, details)
