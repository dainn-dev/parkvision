"""Infrastructure health checks for platform monitoring."""

import asyncio
import time
from typing import Any

from sqlalchemy import text

from app.config import settings
from app.database import engine
from app.redis_client import get_redis
from app.services.storage import check_health as s3_health


async def check_database() -> dict[str, Any]:
    t0 = time.monotonic()
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "up", "latencyMs": round((time.monotonic() - t0) * 1000, 1)}
    except Exception as exc:
        return {"status": "down", "error": str(exc)}


async def check_redis() -> dict[str, Any]:
    t0 = time.monotonic()
    try:
        await get_redis().ping()
        return {"status": "up", "latencyMs": round((time.monotonic() - t0) * 1000, 1)}
    except Exception as exc:
        return {"status": "down", "error": str(exc)}


async def check_mqtt() -> dict[str, Any]:
    t0 = time.monotonic()
    try:
        reader, writer = await asyncio.open_connection(settings.mqtt_host, settings.mqtt_port)
        writer.close()
        await writer.wait_closed()
        _ = reader
        return {"status": "up", "latencyMs": round((time.monotonic() - t0) * 1000, 1)}
    except OSError as exc:
        return {"status": "down", "error": str(exc)}


async def check_s3() -> dict[str, Any]:
    try:
        ok = s3_health()
        return {"status": "up" if ok else "down"}
    except Exception as exc:
        return {"status": "down", "error": str(exc)}


async def infra_status() -> dict[str, Any]:
    checks = {
        "postgres": await check_database(),
        "redis": await check_redis(),
        "mqtt": await check_mqtt(),
        "s3": await check_s3(),
    }
    status = "ok" if all(c.get("status") == "up" for c in checks.values()) else "degraded"
    return {"status": status, "checks": checks}
