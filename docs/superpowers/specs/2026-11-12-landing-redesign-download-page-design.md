# Landing redesign + Download page — design

Date: 2026-11-12
Status: approved in conversation, pending written-spec review
Scope: `frontend/` (public site) and `backend/app/api/v1/updates.py`

## 1. Goal

Rebuild the public landing page from scratch and add a `/download` page where
users fetch the **Edge Client (Windows x64)** and the **driver Android APK**
from the self-hosted release channel (backend + SeaweedFS, see
`release_service.py`).

Primary audience: **parking-lot / building owners (B2B)** deciding whether to
register a tenant. Secondary audience on `/download`: gatehouse staff
(Edge Client) and the owner's drivers (APK).

Success: the landing reads as a credible product page for a B2B buyer, and a
non-technical person can reach `/download`, pick the right file, verify it, and
install it without asking anyone.

## 2. Decisions taken (do not re-litigate)

| Decision | Choice |
|---|---|
| Primary audience | Parking-lot owners (B2B) |
| Routing | `react-router` for the public site (not state+pushState, not a separate marketing site) |
| Visual direction | Dark technical — keep the spirit of the current page, redo layout, drop glow effects, add whitespace |
| Brand | **ParkVision** (replaces "ANPR.CLOUD · SaaS v4.8") |
| Languages | Vietnamese and English |

## 3. Current state (facts verified in the repo)

- `frontend/src/pages/public/LandingPage.tsx` is a single 1,150-line file with
  hard-coded hex colours, a demo using external Unsplash images, and unsourced
  claims (named testimonials, "250+ sites", 99.8 % / 99.9 % figures).
- No router. `App.tsx` switches on a `publicView` state and reads `pathname`
  once at start-up (`/activate`, `/reset-password`, `/find-my-car`).
- 109 occurrences of `onNavigate` / `PublicViewType` / `setPublicView` across 11
  files (navbar, footer, landing, privacy/terms/SLA, login, register, activate,
  reset-password, App).
- `react-router` is not a dependency. `vitest` and `jsdom` are; the
  `test` script is `vitest run`. React Testing Library and MSW are not installed.
  (`CLAUDE.md` still says the dashboard has no `npm test`; that line is stale
  and is corrected as part of this work.)
- Backend exposes only update-check endpoints (`/updates/edge/...`,
  `/updates/android?versionCode=`); nothing lists the latest releases for a web
  page. Download URLs are presigned and expire, so they cannot be embedded in
  the page.
- Release channels in `release_service.CHANNELS`: `edge-windows-x86_64` (`.exe`)
  and `android` (`.apk`). The edge bundle target is `nsis` with
  `createUpdaterArtifacts`, so the `.exe` is the full NSIS installer.

## 4. Routing and code structure

### 4.1 Router

- Add `react-router` and wrap the **public** tree (unauthenticated, and the
  authenticated "preview landing" mode) in `BrowserRouter`.
- Routes: `/`, `/download`, `/privacy`, `/terms`, `/sla`, `/login`,
  `/register`, `/activate`, `/reset-password`, `/find-my-car`; unknown paths
  render the landing.
- The authenticated workspace (platform admin / tenant portal) stays
  state-driven and is **not** routed in this work. While authenticated the URL
  is ignored, as today.
- After a successful login/registration the app navigates to `/` with
  `replace`, so a stale `/login` is not left in the address bar.
- The `activate` / `reset-password` / `find-my-car` query parameters
  (`token`, `tenant`, `plate`) are read from the router location instead of
  `window.location` at start-up.
- Production Nginx already serves an SPA fallback; verify `/download` and a hard
  refresh on it in `nginx.conf.template` during implementation.

### 4.2 Incremental migration (no big bang)

A single mapping `PUBLIC_ROUTES: Record<PublicViewType, string>` defines
view → path. `App.tsx` passes pages an adapter
`onNavigate(view) => navigate(PUBLIC_ROUTES[view])`, so the existing 109 call
sites keep working unchanged. Only the navbar, footer, landing and download
pages use `<Link>` / `<NavLink>` directly. `PublicViewType` gains `'download'`.
Moving remaining pages to `<Link>` is explicitly out of scope.

### 4.3 File layout

```
frontend/src/pages/public/
  LandingPage.tsx            # composes sections only (< 80 lines)
  landing/
    HeroSection.tsx
    PipelineSection.tsx      # Camera -> Edge -> Cloud, offline-first
    DemoSection.tsx          # plate-recognition simulator (no external images)
    FeaturesSection.tsx
    SolutionsSection.tsx
    AppsSection.tsx          # Dashboard / Edge Client / Driver app -> /download
    PricingSection.tsx       # plans from API, hard-coded fallback kept
    FaqSection.tsx
    FinalCtaSection.tsx
  DownloadPage.tsx
  download/
    ReleaseCard.tsx
    InstallGuide.tsx
    useLatestReleases.ts
    formatRelease.ts         # formatBytes, formatDate
frontend/src/lib/publicRoutes.ts   # PUBLIC_ROUTES + path -> view helper
```

Each section file stays under 300 lines. Colours use the semantic tokens that
already exist in `index.css` (`--background`, `--card`, `--border`,
`--primary`, `--muted-foreground`, `--success`, `--warning`; the `.dark` class
switches them) through Tailwind classes such as `bg-background`, `bg-card`,
`border-border`, `text-primary`, `text-muted-foreground`. No hard-coded hex and
no new token definitions.

## 5. Landing page (B2B)

Section order:

1. **Hero** — headline, primary CTA "start trial" (-> `/register`), secondary
   CTA "see the demo", and a Camera -> Edge -> Cloud diagram instead of the
   metrics row.
2. **Pipeline / how it works** — the edge decides locally from its synced
   cache, keeps working offline, and syncs back; three deployment steps.
3. **Demo** — the existing recognition simulator, trimmed, with no external
   images (CSS/SVG plate and vehicle placeholders).
4. **Features**.
5. **Solutions by industry**.
6. **Apps strip** — Dashboard (web), Edge Client (Windows), Driver app
   (Android) with a link to `/download`.
7. **Pricing** — live plans from `publicApi.plans()`, current hard-coded cards
   as fallback.
8. **FAQ**.
9. **Final CTA**.

Content rules:

- Remove the named testimonials and "250+ sites". Remove 99.8 % / 99.9 % /
  90 % figures unless the owner supplies a source; otherwise describe the
  capability in words. Copy follows the repository's conservative stance
  (docs are reverse-engineered, features are not claimed beyond what is
  proven — see `docs/README.md`).
- Do not claim payment features work offline (GAP-PAY-002).
- Copy is written for both `vi` and `en`; new keys go in the `landing` and a new
  `download` i18n namespace, following the existing `t('English key')` pattern.

## 6. Download page (`/download`)

- Two equal cards: **Edge Client — Windows x64** and **Driver app — Android**.
- Each card shows: version, release date, size, SHA-256 with a copy button,
  release notes, and a **Download** button pointing at
  `GET /api/v1/updates/download/{channel}`.
- Below the cards: install guide (Edge: run the NSIS installer, activate with
  the code from the dashboard; APK: allow install from this source), and a
  "verify your download" block with
  `Get-FileHash -Algorithm SHA256 <file>` (Windows) and `sha256sum <file>`.
- States: while the single `/updates/latest` request is pending both cards show
  a skeleton; a failed request shows one page-level error with a retry button;
  a channel absent from a successful response shows "no published release yet"
  on its own card without affecting the other card.
- Not shown: `minSupportedVersion`, internal ids, unpublished builds.

## 7. Backend

Both endpoints live in `updates.py`'s public router, outside auth, rate-limited
with their own bucket (`release-public`, 60 requests / 60 s) so they do not
share the update-check budget.

### 7.1 `GET /api/v1/updates/latest`

Response (camelCase via the existing schema base):

```json
{
  "releases": [
    {
      "channel": "edge-windows-x86_64",
      "version": "1.2.0",
      "versionCode": null,
      "notes": "…",
      "sizeBytes": 48211456,
      "sha256": "…",
      "publishedAt": "2026-11-10T08:00:00Z"
    }
  ]
}
```

- One entry per channel that has a published release (highest version, via
  `release_service.latest_published`). Channels with none are omitted.
- Returns `Cache-Control: public, max-age=60`.
- Never includes download URLs, signatures, or unpublished releases.

### 7.2 `GET /api/v1/updates/download/{channel}`

- `channel` must be in `release_service.CHANNELS`, otherwise 404.
- No published release for the channel -> 404.
- Otherwise `302` with `Location` set to a freshly generated presigned URL
  (`release_service.download_url`). The URL is server-generated; no user input
  reaches the object key, so this is not an open redirect.
- `Cache-Control: no-store`.

### 7.3 Schemas

Add `LatestReleaseOut` and `LatestReleasesOut` to `schemas/resources.py`
(next to `AndroidUpdateOut`).

## 8. Error handling and security

- Frontend treats any non-2xx or network failure on `/latest` as a per-page
  error state with retry; it never blocks the landing page.
- Download button is a plain link to the redirect endpoint; no URL is built or
  stored client-side.
- All text rendered through React (no `dangerouslySetInnerHTML`); release
  `notes` are rendered as plain text with preserved line breaks.
- The download button is an `<a href>`, so it works without client-side JS
  beyond page load.
- Public endpoints expose only metadata already intended for download; rate
  limited; audited admin actions are unchanged.

## 9. Testing and verification

Backend (`backend/tests/test_app_releases.py`; needs the isolated Postgres/Redis
per CLAUDE.md **and** a real S3 endpoint via `S3_ENDPOINT_URL`, `S3_ACCESS_KEY`,
`S3_SECRET_KEY`, because uploads go to the bucket):

- `/updates/latest`: returns only published releases, highest version per
  channel, omits empty channels, no URL/signature fields, correct cache header.
- `/updates/download/{channel}`: 302 with presigned location for a published
  channel; 404 for unknown channel; 404 when nothing is published.
- `ruff check` clean for the touched files.

Frontend (vitest + jsdom already present):

- Unit: `publicRoutes` (view <-> path round trip, unknown path -> landing),
  `formatRelease` (bytes/date).
- Component: add `@testing-library/react` (+ `user-event`) as dev dependencies
  and test `DownloadPage` states (loading, both releases, one channel missing,
  error + retry) with `publicApi.latestReleases` stubbed via `vi.spyOn` (MSW
  is not introduced).
  `vite.config.ts` has no `test` block, so vitest runs in the `node`
  environment: each component test file starts with
  `// @vitest-environment jsdom` and calls RTL `cleanup()` in `afterEach`
  (no globals, no jest-dom).
- `npm run lint` (tsc) and `npm run build` pass.
- Manual browser check: `/`, `/download`, hard refresh on `/download`, Back
  button, dark and light theme, mobile width, vi and en.

## 10. Delivery order

1. Backend endpoints + schemas + tests.
2. Router adapter and `publicRoutes` (no visual change yet), pages still work.
3. Download page + hooks + tests.
4. Landing sections, one at a time, replacing the old file.
5. Navbar/footer: brand, links to `/download`, `<Link>` usage.
6. i18n copy (vi/en), `CLAUDE.md` + docs corrections (dashboard test script,
   public routes, new endpoints).

## 11. Out of scope

QR codes, OS auto-detection, macOS/Linux/iOS builds, Play Store listing, edge
builds for other architectures (backend has no such channel), routing the
authenticated workspace, rewriting every `onNavigate` call site, real customer
testimonials or metrics.

## 12. Risks

- New dependency (`react-router`) and a router wrapper around a tree that today
  assumes full control of the URL — mitigated by the adapter and by leaving the
  authenticated workspace untouched.
- Copy is rewritten in two languages; stale old English keys in the `landing`
  namespace must be removed to avoid dead translations.
- Backend tests need the isolated Postgres/Redis described in CLAUDE.md; they
  cannot run in an environment without it.
