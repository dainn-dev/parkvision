# MQTT Contract — Monitor Camera Detection

Contract for the edge repos (`parkvision-edge-devices`, `parkvision-edge-client`).
Consumed by `backend/app/realtime/mqtt_bridge.py::handle_detection`.

## Topic

```
tenants/{tenantId}/sites/{siteId}/cameras/{cameraId}/detection
```

- `{cameraId}` = `cameras.id` (uuid) of a camera with `purpose = 'monitor'`.
- Publish QoS 1. Payload is JSON. All field names camelCase.

## Payload types

### `vehicle_parked` / `vehicle_seen`

A vehicle was detected parked (or still parked) in a monitored zone.

```json
{
  "type": "vehicle_parked",
  "plateNumber": "51F-123.45",
  "zoneId": "uuid-or-omit",
  "zoneCode": "S03",
  "confidence": 0.93,
  "occurredAt": "2026-09-29T08:30:00+07:00"
}
```

| Field | Req | Notes |
|---|---|---|
| `plateNumber` | yes | Raw plate; backend normalizes (`51F-123.45` → `51F12345`) |
| `zoneId` | one of `zoneId`/`zoneCode` recommended | `parking_zones.id` |
| `zoneCode` | one of `zoneId`/`zoneCode` recommended | `parking_zones.code` (e.g. `"S03"`) |
| `confidence` | no | 0..1 |
| `occurredAt` | no | ISO-8601; defaults to receive time |

**Zone resolution precedence** (backend `parking_service.resolve_zone`):
1. `zoneId` matching a zone of the tenant
2. `zoneCode` matching one of the camera's covered zones, else any zone in the camera's site with that code
3. Camera's single covered zone (only when the camera covers exactly one zone)
4. Otherwise the presence is still recorded with `zoneId: null` — the vehicle is "in lot, zone unknown"

Behavior: first detection → presence `parked`; same zone again → refresh (`seen`, no event row); **different zone → `relocated`**, presence moves to the new zone.

### `vehicle_left`

The vehicle left the monitored zone (edge-detected departure; gate ANPR exits
are closed automatically via `access_events`).

```json
{ "type": "vehicle_left", "plateNumber": "51F-123.45", "zoneId": "uuid-or-omit" }
```

### `zone_snapshot`

Camera snapshot of its coverage area (used when the tenant sets up the monitor
camera — the image becomes reference/background for drawing zones).

```json
{ "type": "zone_snapshot", "snapshotKey": "<objectKey from presign>" }
```

Upload flow:
1. `POST /api/v1/edge/tenants/{tenantId}/uploads/presign` with `X-Api-Key`
   (`edge:ingest` scope), body `{"kind": "zone-snapshot", "contentType": "image/jpeg"}`
   → `{uploadUrl, objectKey, expiresIn}`
2. `PUT` the JPEG to `uploadUrl`
3. Publish `zone_snapshot` with `snapshotKey = objectKey`

## Backend → frontend

Each processed detection fans out on the tenant WS channel
(`ws/tenants/{id}/barrier-telemetry`):

```json
{ "type": "vehicle_location", "eventType": "parked|relocated|exited|seen",
  "siteId": "...", "cameraId": "...",
  "presence": { "id", "plateNumber", "status", "zoneId", "levelId",
                "zoneCode", "zoneName", "lastSeenAt" } }
```

```json
{ "type": "camera_snapshot", "siteId": "...", "cameraId": "...", "snapshotKey": "..." }
```
