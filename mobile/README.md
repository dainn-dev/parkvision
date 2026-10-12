# ParkVision Driver (mobile)

Driver-facing app for discovering nearby parking with realtime capacity,
favorites, vehicle management, and parking-session tracking — backed by the
ParkVision FastAPI backend (`/api/v1`).

## Run locally

**Prerequisites:** Node.js 20+, and the backend running
(`cd ../backend && docker compose up -d`).

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` (defaults work when the backend is on
   `localhost:8000` — the dev server proxies `/api` there)
3. `npm run dev` → http://localhost:3000

## Verify

- `npm run lint` — TypeScript typecheck (`tsc --noEmit`)
- `npm test` — vitest unit tests
- `npm run build` — production build

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api/v1` | Request prefix used by `src/lib/api.ts` |
| `VITE_API_PROXY` | `http://localhost:8000` | Dev-server proxy target for `/api/*` |

## Auth

Email/password driver accounts via `POST /api/v1/driver/auth/*` (bearer
tokens in `localStorage`, refresh-once on 401). Guest mode is browse-only.

Memberships are real: plans are published per-site by the tenant
(`GET /api/v1/public/sites/{id}/plans`), drivers request via
`POST /api/v1/driver/memberships`, and the tenant activates them (which
whitelists the plate for ANPR entry). Wallets and in-app payments are not
yet supported by the backend — those screens render honest "coming soon"
states, and membership payment itself is handled offline by the operator
before activation.
