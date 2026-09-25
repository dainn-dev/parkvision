"""Integration test fixtures — run against compose Postgres + Redis on localhost.

Env expected (see README):
  MIGRATION_DATABASE_URL, DATABASE_URL, REDIS_URL
"""

import os
import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://vehicle_app:vehicle_app@localhost:5432/vehicle_mgmt",
)
os.environ.setdefault(
    "MIGRATION_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/vehicle_mgmt",
)
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("JWT_SECRET", "test-secret-0123456789abcdef0123456789abcdef")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "test-fernet-key")
os.environ.setdefault("COOKIE_SECURE", "false")

from app.config import settings  # noqa: E402


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest_asyncio.fixture(scope="session")
async def migrated():
    """Run migrations once per test session (alembic CLI equivalent)."""
    engine = create_async_engine(settings.migration_database_url)
    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
    await engine.dispose()

    from alembic import command
    from alembic.config import Config

    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cfg = Config(os.path.join(backend_dir, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(backend_dir, "migrations"))
    import asyncio

    await asyncio.to_thread(command.upgrade, cfg, "head")
    yield


@pytest_asyncio.fixture
async def admin_engine(migrated):
    engine = create_async_engine(settings.migration_database_url)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def tenant(admin_engine):
    """Fresh tenant + owner user per test."""
    from app.models import Tenant, TenantUser
    from app.security import hash_password

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    suffix = uuid.uuid4().hex[:8]
    async with Session() as db:
        t = Tenant(
            name=f"T-{suffix}", slug=f"t-{suffix}", plan_code="pro",
            status="active", contact_email=f"ops-{suffix}@example.com",
        )
        db.add(t)
        await db.flush()
        u = TenantUser(
            tenant_id=t.id, email=f"owner-{suffix}@example.com",
            password_hash=hash_password("Password!123"), full_name="Owner",
            role="owner", status="active",
        )
        db.add(u)
        await db.commit()
    return {"tenant_id": t.id, "email": u.email, "password": "Password!123", "slug": t.slug}


@pytest_asyncio.fixture
async def other_tenant(admin_engine):
    from app.models import Tenant, TenantUser
    from app.security import hash_password

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    suffix = uuid.uuid4().hex[:8]
    async with Session() as db:
        t = Tenant(
            name=f"X-{suffix}", slug=f"x-{suffix}", plan_code="starter",
            status="active", contact_email=f"ops-{suffix}@example.com",
        )
        db.add(t)
        await db.flush()
        u = TenantUser(
            tenant_id=t.id, email=f"owner-{suffix}@example.com",
            password_hash=hash_password("Password!123"), full_name="Owner X",
            role="owner", status="active",
        )
        db.add(u)
        await db.commit()
    return {"tenant_id": t.id, "email": u.email, "password": "Password!123"}


@pytest_asyncio.fixture
async def client(migrated):
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture(autouse=True)
async def _clean_outbox(migrated):
    from app.redis_client import get_redis

    await get_redis().delete("mqtt:outbox")
    yield


async def login(client: AsyncClient, email: str, password: str) -> dict:
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return res.json()["data"]


def csrf(client: AsyncClient) -> dict:
    token = client.cookies.get("vm_csrf")
    return {"x-csrf-token": token} if token else {}
