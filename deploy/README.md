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
| S3 presigned endpoint | http://192.168.0.153:9000 |
| Mailpit (this host only) | http://127.0.0.1:8025 |
| EMQX dashboard (this host only) | http://127.0.0.1:18083 (`admin` / `public`) |
| PostgreSQL / Redis (this host only) | `127.0.0.1:5432` / `127.0.0.1:6379` |

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

## What runs here

- `api`, `worker` (arq), `mqtt-bridge`, one-shot `migrate`
- `postgres`, `redis`, `emqx`, `s3` (LocalStack), `mailpit`
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
- EMQX allows anonymous MQTT and LocalStack S3 uses `test`/`test` keys.
  Configure MQTT auth/ACL and real object storage (e.g. MinIO) for production.
- Demo seed accounts and `omniroute` defaults must not be used in production.
- Postgres/Redis/Mailpit/EMQX-dashboard are bound to loopback on this host.
- Review `docs/development-and-operations.md` §7 before a real deployment.

## Data / backup

Docker volumes hold all state: `vehicle-management_pgdata`,
`vehicle-management_s3data`, plus Redis/EMQX volumes. See
`docs/RUNBOOK_BACKUP_RESTORE.md` before relying on this for real data.
