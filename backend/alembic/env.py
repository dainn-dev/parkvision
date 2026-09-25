import asyncio
import os
from logging.config import fileConfig

from sqlalchemy.ext.asyncio import create_async_engine

from alembic import context

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Migrations run as the DBA role (schema owner) — never the app_user role,
# which is deliberately non-BYPASSRLS.
DSN = os.environ.get(
    "PV_MIGRATION_DSN",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/vehicle_mgmt",
)


def run_migrations_offline() -> None:
    import app.models  # noqa: F401  (register tables)
    from app.db.base import Base

    context.configure(
        url=DSN,
        target_metadata=Base.metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    import app.models  # noqa: F401
    from app.db.base import Base

    context.configure(connection=connection, target_metadata=Base.metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    engine = create_async_engine(DSN)
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
