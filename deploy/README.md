# ParkVision — Raspberry Pi deployment notes

Local deployment of the ParkVision monorepo on this Raspberry Pi 5
(aarch64, Debian 13, Docker 29). Upstream docs are in the repository root and
`docs/`; this file records what is actually running here.

## URLs (LAN: 192.168.0.153)

| Service | URL |
|---|---|
| Admin dashboard | http://192.168.0.153:8080 |
| Driver web app | http://192.168.0.153:8081 |
| REST API | http://192.168.0.153:8000 |
| Swagger / OpenAPI | http://192.168.0.153:8000/docs |
| Health | http://192.168.0.153:8000/healthz · `/readyz` |
| MQTT (edge devices) | `192.168.0.153:1883` |
| S3 presigned endpoint | https://s3-parking.dainn.online (LAN: http://192.168.0.153:9000) |
| Mailpit (this host only) | http://127.0.0.1:8025 |
| EMQX dashboard (this host only) | http://127.0.0.1:18083 (`admin` / `EMQX_DASHBOARD_PASSWORD` from `backend/.env`) |
| PostgreSQL / Redis (this host only) | `127.0.0.1:5432` / `127.0.0.1:6379` |

## Public access (Cloudflare)

| Hostname | Serves |
|---|---|
| `https://parkvision.dainn.online` | Admin dashboard (`frontend`, port 8080); also proxies `/api`, `/ws` and `/mqtt` |
| `https://api-parkvision.dainn.online` | REST API + WebSocket (`api`, port 8000) — used by the driver APK and the edge client |

Cloudflare only proxies HTTP(S), so plain MQTT on 1883 is LAN-only. Edge
devices outside the LAN use **MQTT over WebSocket** through the dashboard's
`/mqtt` route (`frontend` → `emqx:8083`). Add to `backend/.env`:

```sh
MQTT_PUBLIC_HOST=parkvision.dainn.online
MQTT_PUBLIC_TRANSPORT=websocket
MQTT_PUBLIC_PORT=443
MQTT_PUBLIC_TLS=true
MQTT_PUBLIC_WS_PATH=/mqtt
# Generate each once, e.g. `openssl rand -hex 32`.
MQTT_HOOK_SECRET=<random>      # shared by the API and EMQX
MQTT_PASSWORD=<random>         # the mqtt-bridge's login; must not be backend-secret
EMQX_DASHBOARD_PASSWORD=<random>
```

`docker compose` refuses to start without these three (or without the S3 keys below). With a hook secret
set, the API also refuses the published default bridge password
(`backend-secret`) and logs `refusing bridge login with the default
MQTT_PASSWORD` — the bridge then cannot connect until a unique password is set.

EMQX authenticates **every** MQTT client through the API's
`/api/v1/edge/mqtt-auth` hook: devices log in with their activation
credential and may only use their own `tenants/<id>/` topics; the
`mqtt-bridge` logs in with `MQTT_USERNAME` / `MQTT_PASSWORD` as superuser.
Anonymous MQTT is no longer accepted.

Devices activated before this change keep the old MQTT address until their
config is refreshed: restart the edge app (it re-reads `/edge/config` on
start) or re-activate it.

### S3 / camera snapshots

Object storage is SeaweedFS (`s3` service), published on host port 9000 and
proxied by Cloudflare as `https://s3-parking.dainn.online`. It accepts only
requests signed with `S3_ACCESS_KEY` / `S3_SECRET_KEY`: unsigned, forged or
expired presigned URLs get 403, so the public hostname only serves the links
the API hands out. Objects persist in the `s3data` volume. Add to
`backend/.env`:

```sh
S3_ACCESS_KEY=<random>                 # e.g. openssl rand -hex 16
S3_SECRET_KEY=<random>                 # e.g. openssl rand -hex 32
S3_PUBLIC_ENDPOINT_URL=https://s3-parking.dainn.online
S3_PUBLIC_ORIGIN_URL=https://s3-parking.dainn.online
S3_CORS_ORIGINS=["https://parkvision.dainn.online"]
```

`S3_ENDPOINT_URL=http://s3:4566` stays as is (API → s3 inside Docker). The API
creates the bucket and its CORS rule on start-up. Switching from LocalStack
starts with an empty bucket: images stored in LocalStack are not migrated
(LocalStack kept them only in memory anyway).

## Accounts

- Platform admin: `admin@example.com` — password is generated and stored in
  `backend/.env` as `SEED_PLATFORM_ADMIN_PASSWORD`.
  Read it with: `grep SEED_PLATFORM_ADMIN_PASSWORD backend/.env`
- Demo tenant owner: `owner@demo.example.com` / `DemoOwner!123`
  (hardcoded by `backend/scripts/seed.py`; change it after first login).

All other secrets (JWT, Fernet, DB, MQTT, metrics token) are generated in
`backend/.env` (mode 600).

## Common commands

Run from `backend/`:

```sh
docker compose ps
docker compose logs -f --tail=100 api worker mqtt-bridge
docker compose up -d                 # start / reconcile
docker compose down                  # stop (volumes preserved)
docker compose exec api python -m scripts.seed
docker compose exec api curl -sf http://localhost:8000/readyz
```

Rebuild after pulling new source:

```sh
cd backend
docker compose build api frontend mobile
docker compose up -d
```

`emqx` is recreated by `up -d` when its environment changes (auth hook).
Check afterwards that the bridge logs in:

```sh
docker compose logs --tail=20 mqtt-bridge   # expect "subscribed to 4 topic patterns"
```

## What runs here

- `api`, `worker` (arq), `mqtt-bridge`, one-shot `migrate`
- `postgres`, `redis`, `emqx`, `s3` (SeaweedFS), `mailpit`
- `frontend` (dashboard, Nginx, `/api` + `/ws` proxy to `api:8000`)
- `mobile` (driver SPA, same-origin proxy)

`backend/docker-compose.override.yml` contains the Pi-specific port bindings
and the dashboard/mobile services. It is a local file, not upstream.

## Not running here (by design)

- **`edge-client`** — Tauri desktop app for the gate PC (Windows); talks to
  this server's API/MQTT and controls the barrier relay locally.
- **`anpr-worker`** — runs next to the camera on the edge machine, not on the
  server; model weights are mounted at runtime.
- **`omniroute`** — optional compose service, kept behind the `omniroute`
  profile; port 20128 is already used by the existing `9router` container.

Start the optional service with `docker compose --profile omniroute up -d`
only after resolving the port conflict.

## Security / production gaps

This is the documented **development baseline** exposed on the LAN over HTTP:

- No TLS; cookies are `COOKIE_SECURE=false`. Put a TLS reverse proxy in front
  before using real credentials, then set `COOKIE_SECURE=true`.
- MQTT clients are authenticated and topic-scoped by the API hook, and S3
  only accepts requests signed with the configured key pair (see above).
- Demo seed accounts and `omniroute` defaults must not be used in production.
- Postgres/Redis/Mailpit/EMQX-dashboard are bound to loopback on this host.
- Review `docs/development-and-operations.md` §7 before a real deployment.

## Data / backup

Docker volumes hold all state: `vehicle-management_pgdata`,
`vehicle-management_s3data`, plus Redis/EMQX volumes. See
`docs/RUNBOOK_BACKUP_RESTORE.md` before relying on this for real data.
