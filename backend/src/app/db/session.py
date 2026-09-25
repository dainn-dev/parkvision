"""Async engine/session factory plus request-scoped RLS context.

Every tenant-scoped request runs inside a transaction where
`SET LOCAL app.current_tenant_id` (via set_config(..., true)) is applied on the
checked-out connection. RLS policies key off three GUCs:

  app.current_tenant_id   — uuid of the caller's tenant (empty = none)
  app.is_platform_admin   — 'on' when the caller is a platform admin
  app.is_system           — 'on' for workers/gateway doing cross-tenant I/O
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings

settings = get_settings()

engine = create_async_engine(settings.database_url, pool_size=10, max_overflow=20, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def set_rls_context(
    session: AsyncSession,
    *,
    tenant_id: UUID | None = None,
    is_platform_admin: bool = False,
    is_system: bool = False,
) -> None:
    """Apply GUCs for RLS on the session's current transaction.

    Must be called after `session.begin()` (or an equivalent transaction start)
    so set_config(..., is_local=true) is scoped to this transaction only.
    """
    await session.execute(
        text("SELECT set_config('app.current_tenant_id', :tid, true)"),
        {"tid": str(tenant_id) if tenant_id else ""},
    )
    await session.execute(
        text("SELECT set_config('app.is_platform_admin', :v, true)"),
        {"v": "on" if is_platform_admin else ""},
    )
    await session.execute(
        text("SELECT set_config('app.is_system', :v, true)"),
        {"v": "on" if is_system else ""},
    )


@asynccontextmanager
async def tenant_scoped_session(tenant_id: UUID) -> AsyncIterator[AsyncSession]:
    """Session with tenant RLS context; commits on success, rolls back on error."""
    async with SessionLocal() as session:
        async with session.begin():
            await set_rls_context(session, tenant_id=tenant_id)
            yield session


@asynccontextmanager
async def platform_scoped_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        async with session.begin():
            await set_rls_context(session, is_platform_admin=True)
            yield session


@asynccontextmanager
async def system_session(tenant_id: UUID | None = None) -> AsyncIterator[AsyncSession]:
    """For workers/gateways that act across tenants or on a known tenant."""
    async with SessionLocal() as session:
        async with session.begin():
            await set_rls_context(session, tenant_id=tenant_id, is_system=True)
            yield session
