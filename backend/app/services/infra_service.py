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
        # boto3 is blocking; a slow/unreachable S3 endpoint would otherwise
        # freeze the event loop and stall every concurrent request.
        ok = await asyncio.to_thread(s3_health)
        return {"status": "up" if ok else "down"}
    except Exception as exc:
        return {"status": "down", "error": str(exc)}


async def infra_status() -> dict[str, Any]:
    postgres, redis, mqtt, s3 = await asyncio.gather(
        check_database(),
        check_redis(),
        check_mqtt(),
        check_s3(),
    )
    checks = {"postgres": postgres, "redis": redis, "mqtt": mqtt, "s3": s3}
    status = "ok" if all(c.get("status") == "up" for c in checks.values()) else "degraded"
    return {"status": status, "checks": checks}
