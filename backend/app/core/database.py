"""Async engine, session factory, and RLS-aware scoped sessions."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        settings = get_settings()
        _engine = create_async_engine(
            settings.database_url,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_pre_ping=True,
        )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            get_engine(), class_=AsyncSession, expire_on_commit=False, autoflush=False
        )
    return _session_factory


async def dispose_engine() -> None:
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None


async def get_db() -> AsyncIterator[AsyncSession]:
    """Plain session; RLS-context is NOT set. Only for unscoped/platform tables."""
    async with get_session_factory()() as session:
        yield session


@asynccontextmanager
async def scoped_db(
    *, tenant_id: UUID | None, is_platform_admin: bool = False
) -> AsyncIterator[AsyncSession]:
    """Session whose every transaction carries the RLS context vars.

    `set_config(..., true)` is transaction-local; the `after_begin` listener
    re-applies it at the start of each transaction on this session, so
    endpoints may commit freely while the tenant id can never leak into
    another request through the connection pool.
    """
    tenant = str(tenant_id) if tenant_id else ""
    admin = "true" if is_platform_admin else "false"

    async with get_session_factory()() as session:

        @event.listens_for(session.sync_session, "after_begin")
        def _apply_rls_context(sess, transaction, connection):
            connection.exec_driver_sql(
                "SELECT set_config('app.current_tenant_id', $1, true)", (tenant,)
            )
            connection.exec_driver_sql(
                "SELECT set_config('app.is_platform_admin', $1, true)", (admin,)
            )

        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        else:
            if session.is_active:
                await session.commit()
            else:
                await session.rollback()
