"""ParkVision FastAPI application."""

import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from starlette.responses import Response

from app.api.errors import register_exception_handlers
from app.api.routes import (
    auth,
    platform,
    public,
    tenant_access,
    tenant_audit,
    tenant_barrier,
    tenant_infra,
    tenant_members,
    tenant_profile,
)
from app.api.ws import router as ws_router
from app.config import get_settings

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("parkvision")
settings = get_settings()

REQUEST_COUNT = Counter("pv_http_requests_total", "HTTP requests", ["method", "path", "status"])
REQUEST_LATENCY = Histogram("pv_http_request_seconds", "HTTP latency", ["method", "path"])


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("parkvision api starting (env=%s)", settings.environment)
    yield
    log.info("parkvision api stopped")


def create_app() -> FastAPI:
    app = FastAPI(
        title="ParkVision API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if not settings.is_production else None,
        redoc_url=None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def metrics_middleware(request, call_next):
        start = time.monotonic()
        resp = await call_next(request)
        elapsed = time.monotonic() - start
        path = request.scope.get("route").path if request.scope.get("route") else request.url.path
        REQUEST_COUNT.labels(request.method, path, resp.status_code).inc()
        REQUEST_LATENCY.labels(request.method, path).observe(elapsed)
        return resp

    register_exception_handlers(app)

    prefix = settings.api_prefix
    for r in (
        public.router,
        auth.router,
        platform.router,
        tenant_profile.router,
        tenant_infra.router,
        tenant_members.router,
        tenant_access.router,
        tenant_barrier.router,
        tenant_audit.router,
    ):
        app.include_router(r, prefix=prefix)
    app.include_router(ws_router)

    static_dir = Path(__file__).parent / "static"
    if static_dir.exists():
        app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

    @app.get("/healthz")
    async def healthz() -> dict:
        return {"status": "ok"}

    @app.get("/metrics")
    async def prometheus_metrics() -> Response:
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    return app


app = create_app()
