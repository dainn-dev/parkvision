"""Exception handlers producing the standard error envelope."""

import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from app.core.exceptions import ApiError

log = logging.getLogger(__name__)


def _envelope(code: str, message: str, details: dict | None = None) -> dict:
    return {"error": {"code": code, "message": message, "details": details}}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
        headers = {}
        if exc.code == "mfa_required" and exc.details:
            headers["X-Mfa-Required"] = "true"
        return JSONResponse(
            status_code=exc.status_code,
            content=_envelope(exc.code, exc.message, exc.details),
            headers=headers,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_envelope(
                "validation_error",
                "request validation failed",
                {
                    "fields": [
                        {"loc": [str(p) for p in e["loc"]], "msg": e["msg"], "type": e["type"]}
                        for e in exc.errors()
                    ]
                },
            ),
        )

    @app.exception_handler(IntegrityError)
    async def integrity_handler(request: Request, exc: IntegrityError) -> JSONResponse:
        detail = str(exc.orig) if exc.orig else "constraint violation"
        code, sc = "conflict", status.HTTP_409_CONFLICT
        if "unique" in detail.lower() or "duplicate" in detail.lower():
            msg = "resource already exists"
        elif "foreign key" in detail.lower():
            msg = "referenced resource does not exist"
        elif "check" in detail.lower():
            msg, sc = "value violates a constraint", status.HTTP_422_UNPROCESSABLE_ENTITY
        else:
            msg = "database constraint violation"
        return JSONResponse(status_code=sc, content=_envelope(code, msg))

    @app.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_envelope("internal_error", "internal server error"),
        )
