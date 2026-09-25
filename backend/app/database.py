"""Async engine + request-scoped sessions with PostgreSQL RLS tenant context.

Tenant-scoped queries run inside one transaction where
`app.current_tenant_id` is SET LOCAL — row-level security policies rely on it.
Controlled paths (login, platform admin) may set `app.platform_bypass`.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import settings

engine: AsyncEngine = create_async_engine(
    settings.database_url,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@asynccontextmanager
async def tenant_session(tenant_id: str) -> AsyncIterator[AsyncSession]:
    """Session bound to a tenant: RLS policies see `app.current_tenant_id`."""
    async with AsyncSessionLocal() as session, session.begin():
        await session.execute(
            text("SELECT set_config('app.current_tenant_id', :tid, true)"),
            {"tid": str(tenant_id)},
        )
        yield session


@asynccontextmanager
async def platform_session() -> AsyncIterator[AsyncSession]:
    """Session bypassing tenant RLS — for login lookup and platform admin paths only."""
    async with AsyncSessionLocal() as session, session.begin():
        await session.execute(
            text("SELECT set_config('app.platform_bypass', 'true', true)")
        )
        yield session


@asynccontextmanager
async def anonymous_session() -> AsyncIterator[AsyncSession]:
    """Session for public/unauthenticated reads (plans, legal docs)."""
    async with AsyncSessionLocal() as session, session.begin():
        yield session


async def dispose_engine() -> None:
    await engine.dispose()
