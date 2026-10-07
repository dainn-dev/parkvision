"""Driver API tests — schema (Task 1), schemas (Task 2), auth (Task 3),
vehicles/favorites (Task 4), public sites (Task 5), sessions (Task 6)."""

import pytest
from sqlalchemy import text


@pytest.mark.asyncio
async def test_driver_tables_exist(admin_engine):
    async with admin_engine.connect() as conn:
        for t in ("driver_users", "driver_vehicles", "driver_favorites"):
            assert (
                await conn.execute(
                    text("SELECT 1 FROM information_schema.tables WHERE table_name=:t"),
                    {"t": t},
                )
            ).scalar() == 1
        assert (
            await conn.execute(
                text(
                    "SELECT 1 FROM information_schema.columns "
                    "WHERE table_name='tenant_sites' AND column_name='public_profile'"
                )
            )
        ).scalar() == 1
