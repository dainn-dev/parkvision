"""In-process WebSocket registry, keyed by tenant.

Cross-process delivery goes through Redis pub/sub (see fanout.py) so multiple
API workers and the MQTT ingestor all converge on the same channel space.
"""

import asyncio
import json
import uuid
from collections import defaultdict

from fastapi import WebSocket

CHANNEL_PREFIX = "pv:rt:"


def tenant_channel(tenant_id: uuid.UUID) -> str:
    return f"{CHANNEL_PREFIX}{tenant_id}"


class WSManager:
    def __init__(self) -> None:
        self._conns: dict[uuid.UUID, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, tenant_id: uuid.UUID, ws: WebSocket) -> None:
        async with self._lock:
            self._conns[tenant_id].add(ws)

    async def disconnect(self, tenant_id: uuid.UUID, ws: WebSocket) -> None:
        async with self._lock:
            self._conns[tenant_id].discard(ws)
            if not self._conns[tenant_id]:
                self._conns.pop(tenant_id, None)

    async def send(self, tenant_id: uuid.UUID, message: dict) -> None:
        async with self._lock:
            targets = list(self._conns.get(tenant_id, ()))
        if not targets:
            return
        text = json.dumps(message, default=str)
        dead: list[WebSocket] = []
        for ws in targets:
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    self._conns[tenant_id].discard(ws)


ws_manager = WSManager()
