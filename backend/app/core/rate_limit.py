"""Redis fixed-window rate limiting for public/auth endpoints.

`INCR rl:<name>:<ip>` + `EXPIRE` on first hit — cheap, atomic, shared across
workers. Fails open when Redis is unavailable so a cache outage cannot lock
legitimate users out of login/register paths.
"""

import logging

from fastapi import Request

from app.config import settings
from app.core.errors import too_many_requests
from app.redis_client import get_redis

log = logging.getLogger(__name__)


async def hit(name: str, identity: str, limit: int, window_seconds: int) -> bool:
    client = get_redis()
    key = f"rl:{name}:{identity}"
    n = await client.incr(key)
    if n == 1:
        await client.expire(key, window_seconds)
    return n <= limit


def rate_limited(name: str, limit: int, window_seconds: int = 60):
    """FastAPI dependency: 429 once `identity` exceeds `limit` hits per window."""

    async def dep(request: Request) -> None:
        if not settings.rate_limit_enabled:
            return
        identity = request.client.host if request.client else "unknown"
        try:
            allowed = await hit(name, identity, limit, window_seconds)
        except Exception as exc:
            log.warning("rate limiter unavailable (%s) — allowing %s", exc.__class__.__name__, name)
            return
        if not allowed:
            raise too_many_requests(f"Too many attempts — retry in up to {window_seconds}s")

    return dep
