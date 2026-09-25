"""ParkVision FastAPI application entrypoint."""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.router import api_router
from app.api.ws import ws_router
from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.core.middleware import CSRFMiddleware
from app.db.session import db_session, dispose_engine
from app.realtime.fanout import fanout_task

log = logging.getLogger("parkvision")


@asynccontextmanager
async def lifespan(app: FastAPI):
    stop = asyncio.Event()
    fanout = asyncio.create_task(fanout_task(stop))
    try:
        async with db_session() as session:
            await session.execute(text("SELECT ensure_future_partitions()"))
    except Exception:
        log.warning("partition ensure failed at startup (non-fatal)", exc_info=True)
    yield
    stop.set()
    fanout.cancel()
    try:
        await fanout
    except asyncio.CancelledError:
        pass
    await dispose_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="ParkVision API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.env != "prod" else None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(CSRFMiddleware)
    register_error_handlers(app)
    app.include_router(api_router)
    app.include_router(ws_router)

    @app.get("/healthz")
    async def healthz():
        return {"status": "ok"}

    return app


app = create_app()
