"""Async engine / session helpers.

The API connects as the non-superuser ``app_user`` so row-level security is
enforced. Tenant context is propagated with ``SET LOCAL app.current_tenant_id``
which only has effect inside a transaction — therefore every scoped request
runs all of its queries inside a single transaction on one checked-out
connection (see ``tenant_session``).
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID

from sqlalchemy import text
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
            str(settings.database_dsn),
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_pre_ping=True,
        )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            get_engine(), expire_on_commit=False, autoflush=False
        )
    return _session_factory


async def dispose_engine() -> None:
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None


@asynccontextmanager
async def db_session() -> AsyncIterator[AsyncSession]:
    """Plain session with implicit transaction; no tenant context."""
    factory = get_session_factory()
    async with factory() as session:
        async with session.begin():
            yield session


@asynccontextmanager
async def tenant_session(
    tenant_id: UUID | None, *, platform_admin: bool = False
) -> AsyncIterator[AsyncSession]:
    """Session wrapped in a transaction with RLS context variables set.

    ``app.current_tenant_id`` scopes tenant rows; ``app.platform_admin='on'``
    activates the platform bypass policy for cross-tenant administration.
    """
    factory = get_session_factory()
    async with factory() as session:
        async with session.begin():
            if platform_admin:
                await session.execute(
                    text("SELECT set_config('app.platform_admin', 'on', true)")
                )
            if tenant_id is not None:
                await session.execute(
                    text("SELECT set_config('app.current_tenant_id', :tid, true)"),
                    {"tid": str(tenant_id)},
                )
            yield session
