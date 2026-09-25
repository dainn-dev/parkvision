"""FastAPI application factory."""

import contextlib
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, ORJSONResponse

from app.api.v1 import api_v1, ws_router
from app.config import settings
from app.core.errors import ApiError
from app.database import dispose_engine
from app.redis_client import close_redis
from app.services.storage import ensure_bucket


def _envelope(code: str, message: str, details: dict, request_id: str, status_code: int) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {"code": code, "message": message, "details": details},
            "requestId": request_id,
        },
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Startup: best-effort bucket creation (S3 may still be starting; the
    # worker/health check will retry on demand).
    with contextlib.suppress(Exception):
        ensure_bucket()
    yield
    await close_redis()
    await dispose_engine()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Vehicle Management API",
        version="0.1.0",
        default_response_class=ORJSONResponse,
        lifespan=lifespan,
        openapi_tags=[
            {"name": "public", "description": "Plans, legal docs, tenant registration"},
            {"name": "auth", "description": "Login, MFA, sessions"},
            {"name": "platform", "description": "Platform administration"},
            {"name": "sites", "description": "Tenant sites and lanes"},
            {"name": "gates", "description": "Barrier gates, commands, telemetry"},
            {"name": "devices", "description": "Edge devices"},
            {"name": "vehicles", "description": "Registered vehicles + bulk import"},
            {"name": "users", "description": "Tenant users"},
            {"name": "rules", "description": "Access rules"},
            {"name": "events", "description": "Access events"},
            {"name": "incidents", "description": "Barrier incidents"},
            {"name": "audit", "description": "Audit logs + export"},
            {"name": "websocket", "description": "Barrier telemetry stream"},
        ],
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-Id"],
    )

    from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
    from starlette.responses import Response as StarletteResponse

    http_requests = Counter(
        "vm_http_requests_total",
        "HTTP requests by route template and status",
        ["method", "route", "status"],
    )
    http_duration = Histogram(
        "vm_http_request_duration_seconds",
        "HTTP request latency by route template",
        ["method", "route"],
        buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5),
    )

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        import time

        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        request.state.request_id = request_id
        start = time.perf_counter()
        response = await call_next(request)
        route = request.scope.get("route")
        route_label = getattr(route, "path", request.url.path)
        if route_label != "/metrics":
            http_requests.labels(request.method, route_label, response.status_code).inc()
            http_duration.labels(request.method, route_label).observe(time.perf_counter() - start)
        response.headers["X-Request-Id"] = request_id
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        return response

    @app.exception_handler(ApiError)
    async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
        return _envelope(
            exc.code, exc.message, exc.details, getattr(request.state, "request_id", "-"), exc.status_code
        )

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        return _envelope(
            "validation_error",
            "Request validation failed",
            {"errors": exc.errors()},
            getattr(request.state, "request_id", "-"),
            422,
        )

    @app.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
        return _envelope(
            "internal_error",
            "Internal server error",
            {},
            getattr(request.state, "request_id", "-"),
            500,
        )

    @app.get("/healthz", tags=["health"])
    async def healthz() -> dict:
        return {"status": "ok"}

    @app.get("/metrics", include_in_schema=False)
    async def metrics() -> StarletteResponse:
        return StarletteResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    @app.get("/readyz", tags=["health"])
    async def readyz() -> dict:
        from app.services.infra_service import check_database, check_redis

        db = await check_database()
        redis = await check_redis()
        ok = db["status"] == "up" and redis["status"] == "up"
        return {"status": "ok" if ok else "degraded", "checks": {"postgres": db, "redis": redis}}

    app.include_router(api_v1, prefix=settings.api_v1_prefix)
    app.include_router(ws_router)
    return app


app = create_app()
