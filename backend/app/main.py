"""FastAPI application factory + entrypoint."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.database import dispose_engine
from app.core.errors import (
    AppError,
    app_error_handler,
    unhandled_error_handler,
    validation_error_handler,
)
from app.core.redis_client import close_redis
from app.services.commands import close_publisher

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("parkvision")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    await _bootstrap_admin(settings)
    yield
    await close_publisher()
    await close_redis()
    await dispose_engine()


async def _bootstrap_admin(settings) -> None:
    """Create the initial platform admin when none exists (local bootstrap only)."""
    if not settings.bootstrap_platform_admin_email or not settings.bootstrap_platform_admin_password:
        return
    from sqlalchemy import select

    from app.core.database import get_session_factory
    from app.core.security import hash_password
    from app.models import PlatformAdmin

    async with get_session_factory()() as session:
        exists = (
            await session.execute(select(PlatformAdmin).limit(1))
        ).scalar_one_or_none()
        if exists is not None:
            return
        session.add(
            PlatformAdmin(
                email=settings.bootstrap_platform_admin_email.lower(),
                full_name="Platform Administrator",
                password_hash=hash_password(settings.bootstrap_platform_admin_password),
                role="super_admin",
            )
        )
        await session.commit()
        log.info("bootstrapped platform admin %s", settings.bootstrap_platform_admin_email)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="ParkVision API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.app_env != "production" else None,
        openapi_url="/openapi.json" if settings.app_env != "production" else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_error_handler)

    app.include_router(api_router)
    return app


app = create_app()


def run() -> None:
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=False)  # noqa: S104 — container bind


if __name__ == "__main__":
    run()
