"""Test harness: real Postgres + Redis from docker compose.

Requires the compose services running locally:
    docker compose up -d postgres redis minio mailpit emqx minio-init
"""

import os
import subprocess
import sys
import uuid
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
TEST_DB = "parkvision_test"
PG_HOST = os.environ.get("TEST_PG_HOST", "localhost")

os.environ.setdefault("DATABASE_URL", f"postgresql+asyncpg://app_user:app_password@{PG_HOST}:5432/{TEST_DB}")
os.environ.setdefault(
    "ALEMBIC_DATABASE_URL", f"postgresql+asyncpg://postgres:postgres@{PG_HOST}:5432/{TEST_DB}"
)
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-pytest-0123456789")
os.environ.setdefault("COOKIE_SECURE", "false")
os.environ.setdefault("S3_ENDPOINT_URL", "http://localhost:9000")
os.environ.setdefault("MQTT_HOST", "localhost")

sys.path.insert(0, str(BACKEND_DIR / "src"))

import asyncpg  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _setup_database():
    """Create the test DB and migrate it once per run."""
    import asyncio

    async def _create():
        conn = await asyncpg.connect(
            host=PG_HOST, port=5432, user="postgres", password="postgres", database="postgres"
        )
        try:
            await conn.execute(f"DROP DATABASE IF EXISTS {TEST_DB} WITH (FORCE)")
            await conn.execute(f"CREATE DATABASE {TEST_DB}")
            await conn.execute(f"GRANT ALL PRIVILEGES ON DATABASE {TEST_DB} TO app_user")
        finally:
            await conn.close()

    asyncio.run(_create())

    env = {**os.environ}
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"alembic failed: {result.stdout}\n{result.stderr}"

    # grants for objects created after the docker init script ran
    async def _grant():
        conn = await asyncpg.connect(
            host=PG_HOST, port=5432, user="postgres", password="postgres", database=TEST_DB
        )
        try:
            await conn.execute("GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO app_user")
            await conn.execute("GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user")
        finally:
            await conn.close()

    asyncio.run(_grant())
    yield


@pytest_asyncio.fixture
async def client():
    from app.main import create_app

    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def db():
    """System-context session for fixture setup (bypasses RLS as workers do)."""
    from app.db.session import SessionLocal, set_rls_context

    async with SessionLocal() as session:
        await session.begin()
        await set_rls_context(session, is_system=True)
        yield session
        await session.rollback()


def uniq(prefix: str = "t") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


async def db_commit(db, tenant_id=None) -> None:
    """Commit setup data and begin a fresh txn with system RLS context."""
    from app.db.session import set_rls_context

    await db.commit()
    await db.begin()
    await set_rls_context(db, tenant_id=tenant_id, is_system=True)


async def make_tenant(db, *, name=None, slug=None) -> object:
    from app.models.identity import Tenant

    tenant = Tenant(name=name or uniq("tenant"), slug=slug or uniq("slug"), plan="growth", status="active")
    db.add(tenant)
    await db_commit(db)
    return tenant


async def make_user(db, tenant, *, email=None, password="Test1234!", role="owner", status="active") -> object:
    from app.core import security
    from app.models.identity import TenantUser

    user = TenantUser(
        tenant_id=tenant.id,
        email=email or f"{uniq('user')}@example.com",
        full_name="Test User",
        password_hash=security.hash_password(password),
        role=role,
        status=status,
    )
    db.add(user)
    await db_commit(db)
    return user


async def login(client: AsyncClient, email: str, password: str) -> dict:
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    return {"csrf": body["csrfToken"], "cookies": dict(resp.cookies)}


def csrf_headers(cookies_csrf: str) -> dict:
    return {"X-CSRF-Token": cookies_csrf}
