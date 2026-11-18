"""Best-effort EMQX management calls (D-MQTT-4).

Revoking an edge credential makes /edge/mqtt-auth deny the *next* connect, but
EMQX keeps an already-established session alive. `kick_client` asks EMQX to
drop it (`DELETE /api/v5/clients/{clientid}`) so the device must reconnect and
re-authenticate. It never raises: an unset URL is a silent no-op and any
failure is only logged, so a revoke/decommission is never blocked by EMQX.
"""

import logging
from urllib.parse import quote

import httpx

from app.config import settings

log = logging.getLogger(__name__)

# Tests swap in an httpx.MockTransport.
_transport: httpx.AsyncBaseTransport | None = None
_TIMEOUT_SECONDS = 5.0


def device_client_id(device) -> str:
    """The MQTT client id / username an edge device connects with."""
    return device.mqtt_client_id or f"edge-{device.id}"


async def kick_client(client_id: str) -> None:
    base = settings.emqx_api_url.strip().rstrip("/")
    if not base or not client_id:
        return
    url = f"{base}/api/v5/clients/{quote(client_id, safe='')}"
    auth = httpx.BasicAuth(settings.emqx_api_key, settings.emqx_api_secret) if settings.emqx_api_key else None
    try:
        async with httpx.AsyncClient(transport=_transport, timeout=_TIMEOUT_SECONDS) as http:
            res = await http.delete(url, auth=auth)
    except Exception as exc:  # network errors, bad URL, ...
        log.warning("emqx kick of %s failed: %s", client_id, exc)
        return
    # 204 = kicked, 404 = not connected right now; both are fine.
    if res.status_code not in (204, 404):
        log.warning("emqx kick of %s returned HTTP %s", client_id, res.status_code)
