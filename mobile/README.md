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
`POST /api/v1/driver/memberships`, and activation whitelists the plate
for ANPR entry.

Payments (Phase 3+) are real when the backend has a gateway configured
(`payment_provider=momo` + MoMo credentials): session fees are estimated
server-side from the site's pricing rules, `POST /api/v1/driver/payments`
returns a hosted `payUrl`, and paid membership payments auto-activate
while paid session payments let the exit gate release the vehicle once
within a grace window. When no gateway is configured the API answers
`503 payments_not_configured` and the app shows an honest
pay-at-the-office notice.

The driver wallet (Phase 4) shows balance + ledger in the payments sheet:
top-ups go through the gateway (`kind='topup'` payments), and payable
items can be settled with `method='wallet'` — wallet spends need no
configured gateway since the balance came from a settled top-up. Operator
refunds credit wallet-paid amounts back automatically. Active-session and
history screens subscribe to `/ws/driver/sessions` for instant entry/exit
hints and keep REST polling as fallback.
