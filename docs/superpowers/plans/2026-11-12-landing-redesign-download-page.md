# Landing redesign + Download page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the public landing page (B2B, dark technical, ParkVision brand, vi+en) and add a `/download` page for the Edge Client (Windows x64) and driver APK, backed by two new public release endpoints.

**Architecture:** Public site moves to `react-router` behind an adapter (`onNavigate(view)` → `navigate(PUBLIC_ROUTES[view])`) so the existing 109 call sites keep working; the authenticated workspace stays state-driven. The landing is split into section components; `/download` reads `GET /api/v1/updates/latest` and links to `GET /api/v1/updates/download/{channel}` (302 to a fresh presigned URL).

**Tech Stack:** FastAPI + SQLAlchemy async + pytest (backend); React 19, Vite 6, Tailwind 4, i18next, vitest + jsdom, `react-router` v7, `@testing-library/react` (frontend).

**Spec:** `docs/superpowers/specs/2026-11-12-landing-redesign-download-page-design.md`

## Global Constraints

- Brand is **ParkVision**; remove "ANPR.CLOUD" and the "SaaS v4.8" badge.
- Copy exists in **vi and en**. English text is the i18n key (`keySeparator: false`, `nsSeparator: false`); only `vi` resource files exist (`frontend/src/i18n/locales/vi/*.json`); new namespace `download` must be registered in `frontend/src/i18n/index.ts` (`ns` list, import, `resources.vi`).
- No hard-coded hex. Use existing semantic tokens through Tailwind classes (`bg-background`, `bg-card`, `border-border`, `text-primary`, `text-muted-foreground`, `text-success`, `text-warning`). No new tokens.
- No unsourced claims: no named testimonials, no "250+ sites", no 99.8 % / 99.9 % / 90 % figures, no Unsplash images. Plan feature lists in the pricing fallback are commercial terms and stay as they are (restyle only). Do not claim payment works offline (GAP-PAY-002).
- No `dangerouslySetInnerHTML`. Release `notes` render as plain text (`whitespace-pre-line`).
- Download button is an `<a href="/api/v1/updates/download/{channel}">`. No URL is built or stored client-side beyond that path.
- Section files < 300 lines; every source file < 800 lines. Section anchor ids that must exist on the landing: `simulator`, `features`, `how-it-works`, `solutions`, `apps`, `pricing`, `faq` (navbar scrolls to them).
- Routes: `/`, `/download`, `/privacy`, `/terms`, `/sla`, `/login`, `/register`, `/activate`, `/reset-password`, `/find-my-car`; unknown path renders the landing.
- Backend: public endpoints use their own rate-limit bucket `rate_limited("release-public", 60, 60)`; `/latest` returns `Cache-Control: public, max-age=60`; `/download/{channel}` returns `Cache-Control: no-store` and `302`; never expose signature, unpublished releases, or URLs in `/latest`.
- Dependencies allowed to add: `react-router`, `@testing-library/react`, `@testing-library/user-event` (dev). Nothing else.
- Git: `git add` explicit paths only (the working tree contains unrelated modified files — never `git add -A` / `git commit -a`). Conventional commits.
- Parallel agents share one working tree (worktree isolation is refused in this repo): respect the **File ownership** table.

## Review Focus

1. Versions `0.9.0` and `0.10.0` both published → `/latest` and `/download` must pick `0.10.0` (numeric, not lexical order). Test in Task 1.
2. `/updates/download/{channel}` with an unknown or path-like channel (`windows`, `..%2Fandroid`) or a channel with only unpublished builds → 404, never a redirect. Test in Task 1.
3. Release notes containing `<script>alert(1)</script>` render as visible text, no script element. Test in Task 3.
4. `navigator.clipboard` undefined (plain http, old browser) → copy button does not throw and shows a failure hint. Test in Task 3.
5. `/download/` (trailing slash), `/DOWNLOAD`, `/nope` → download, download, landing; `/latest` returning `releases: []` → both cards show "no published release yet". Tests in Tasks 2 and 3.

## File ownership and execution order

```
Branch: feat/landing-redesign-download (create from docs/landing-redesign-spec before Task 1)

Wave 1 (parallel):  Task 1 (backend)   Task 2 (router foundation)
Wave 2 (parallel, after Task 2):  Task 3 (download)  Task 4 (landing)  Task 5 (navbar/footer)
Wave 3 (after all):  Task 6 (docs, integration, review)
```

| Task | Owns (only this agent edits) |
|---|---|
| 1 | `backend/app/api/v1/updates.py`, `backend/app/schemas/resources.py`, `backend/tests/test_app_releases.py` |
| 2 | `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/App.tsx`, `frontend/src/lib/publicRoutes.ts` (+ test), `frontend/src/pages/public/DownloadPage.tsx` (placeholder), one re-export line in `frontend/src/components/layout/PublicNavbar.tsx` |
| 3 | `frontend/src/pages/public/DownloadPage.tsx`, `frontend/src/pages/public/download/**`, `frontend/src/services/api/index.ts`, `frontend/src/i18n/index.ts`, `frontend/src/i18n/locales/vi/download.json` |
| 4 | `frontend/src/pages/public/LandingPage.tsx`, `frontend/src/pages/public/landing/**`, `frontend/src/i18n/locales/vi/landing.json` |
| 5 | `frontend/src/components/layout/PublicNavbar.tsx`, `frontend/src/components/layout/PublicFooter.tsx`, `frontend/src/i18n/locales/vi/layout.json` |
| 6 | `CLAUDE.md`, `docs/**`, final fixes from review |

---

### Task 1: Backend release endpoints

**Files:**
- Modify: `backend/app/schemas/resources.py` (after `AndroidUpdateOut`, ~line 1433)
- Modify: `backend/app/api/v1/updates.py`
- Test: `backend/tests/test_app_releases.py` (append; reuse `_platform_admin`, `_upload`, `_publish`, `bucket`, `EDGE`)

**Interfaces:**
- Produces (schemas, `CamelModel`): `LatestReleaseOut(channel: str, version: str, version_code: int | None, notes: str | None, size_bytes: int, sha256: str, published_at: datetime)` and `LatestReleasesOut(releases: list[LatestReleaseOut])`.
- Produces (HTTP, mounted by the existing `public_router`, prefix `/api/v1/updates`): `GET /latest -> LatestReleasesOut`; `GET /download/{channel} -> 302`.

- [ ] **Step 1: Write failing tests** (append to `test_app_releases.py`; each logs in as platform admin, uploads/publishes, then `client.cookies.clear()` so calls are anonymous; redirect test passes `follow_redirects=False`):
  - `test_latest_lists_only_published_highest_version_per_channel`: publish edge `0.9.0` and `0.10.0`, upload edge `0.11.0` unpublished, no android. Assert exactly one release, `version == "0.10.0"`, `channel == EDGE`, key set == `{channel, version, versionCode, notes, sizeBytes, sha256, publishedAt}`, header `cache-control == "public, max-age=60"`, and neither `signature` nor `url` appears in `res.text`.
  - `test_latest_is_empty_when_nothing_is_published`: `{"releases": []}`.
  - `test_download_redirects_to_fresh_presigned_url`: published android → `302`, `location` contains `X-Amz-Signature=`, `cache-control == "no-store"`.
  - `test_download_404_for_unknown_unpublished_or_pathlike_channel`: `/updates/download/windows` → 404; `/updates/download/..%2Fandroid` → 404; android with only an unpublished build → 404.

- [ ] **Step 2: Run to verify failure**

Run (from `backend/`, env per CLAUDE.md plus `S3_ENDPOINT_URL`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`): `.venv/Scripts/python.exe -m pytest tests/test_app_releases.py -k "latest or download" -v`
Expected: FAIL (404 on `/updates/latest`). If Postgres/Redis/S3 are not reachable, report "tests could not run" with the connection error — do not claim PASS; continue with Step 6 checks only.

- [ ] **Step 3: Add schemas** `LatestReleaseOut`, `LatestReleasesOut` in `schemas/resources.py` with the signature above.

- [ ] **Step 4: Implement endpoints in `updates.py`**: `_release_public_limit = Depends(rate_limited("release-public", 60, 60))`; `async def latest_releases(response: Response) -> LatestReleasesOut` iterating `release_service.CHANNELS` with `release_service.latest_published` inside one `platform_session()`, `published_at = row.published_at or row.created_at`, setting the `Cache-Control` header on `response`; `async def download_release(channel: str) -> RedirectResponse` that raises `not_found("Release", channel)` when `channel not in release_service.CHANNELS` or no published release, else `RedirectResponse(release_service.download_url(row), status_code=302, headers={"Cache-Control": "no-store"})`. Register both on `public_router` with `dependencies=[_release_public_limit]`.

- [ ] **Step 5: Run tests, expect PASS** (same command as Step 2).

- [ ] **Step 6: Lint and import check**

Run: `.venv/Scripts/python.exe -m ruff check app/api/v1/updates.py app/schemas/resources.py tests/test_app_releases.py` and `.venv/Scripts/python.exe -c "import app.main"`
Expected: no new findings in the touched files (pre-existing findings elsewhere are not this task's); import prints nothing.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/v1/updates.py backend/app/schemas/resources.py backend/tests/test_app_releases.py
git commit -m "feat(backend): public latest-release list and download redirect"
```

---

### Task 2: Router foundation

**Files:**
- Modify: `frontend/package.json`, `frontend/package-lock.json` (via `npm install react-router` and `npm install -D @testing-library/react @testing-library/user-event`)
- Create: `frontend/src/lib/publicRoutes.ts`, `frontend/src/lib/__tests__/publicRoutes.test.ts`
- Create (placeholder, replaced by Task 3): `frontend/src/pages/public/DownloadPage.tsx` exporting `export const DownloadPage: React.FC = () => <h1>Download</h1>`
- Modify: `frontend/src/App.tsx`, `frontend/src/components/layout/PublicNavbar.tsx` (replace the local `PublicViewType` definition with `export type { PublicViewType } from '../../lib/publicRoutes';`)

**Interfaces:**
- Produces in `lib/publicRoutes.ts`: `type PublicViewType = 'landing' | 'download' | 'login' | 'register' | 'privacy' | 'terms' | 'sla' | 'activate' | 'reset-password' | 'find-car'`; `const PUBLIC_ROUTES: Record<PublicViewType, string>` (`landing:'/'`, `download:'/download'`, `login:'/login'`, `register:'/register'`, `privacy:'/privacy'`, `terms:'/terms'`, `sla:'/sla'`, `activate:'/activate'`, `'reset-password':'/reset-password'`, `'find-car':'/find-my-car'`); `viewFromPath(pathname: string): PublicViewType` (lower-cases, strips trailing slash, unknown → `'landing'`).
- Produces for later tasks: `react-router` (`Link`, `NavLink`, `useNavigate`, `MemoryRouter`) importable from `'react-router'`; RTL and user-event installed.

- [ ] **Step 1: Write failing test** `publicRoutes.test.ts`: `viewFromPath(PUBLIC_ROUTES[v]) === v` for every view; `viewFromPath('/download/') === 'download'`; `viewFromPath('/DOWNLOAD') === 'download'`; `viewFromPath('/nope') === 'landing'`; `viewFromPath('') === 'landing'`.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/lib/__tests__/publicRoutes.test.ts` → FAIL (module missing).
- [ ] **Step 3: Install dependencies** (commands in Files); confirm `react-router` major version is 7+ in `package.json`.
- [ ] **Step 4: Implement `publicRoutes.ts`** with the interfaces above.
- [ ] **Step 5: Run test** → PASS.
- [ ] **Step 6: Wire `App.tsx`**: `App()` renders `<BrowserRouter><PlatformProvider><PlatformAppContent/></PlatformProvider></BrowserRouter>`; inside `PlatformAppContent` replace the `publicView` state with `viewFromPath(useLocation().pathname)`; pass pages `onNavigate = (view) => navigate(PUBLIC_ROUTES[view])` (same prop name and type as today); read `token`, `tenant`, `plate` from `useLocation().search`; `PlatformHeader.onViewLandingPage` navigates to `/` then sets preview; add an effect that, when `isAuthenticated` becomes true and the path is not `/`, calls `navigate('/', { replace: true })`; render `<DownloadPage />` for `publicView === 'download'`; hide navbar/footer exactly as today for `login | register | activate | reset-password`.
- [ ] **Step 7: Verify**

Run: `cd frontend && npm run lint && npm test && npm run build`
Expected: all exit 0. Manual: `npm run dev -- --port 3002`, open `/`, `/download` (placeholder heading), `/privacy`, hard-refresh `/download`, browser Back/Forward, `/login` then Sign in still reaches the workspace.

- [ ] **Step 8: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/lib/publicRoutes.ts frontend/src/lib/__tests__/publicRoutes.test.ts frontend/src/pages/public/DownloadPage.tsx frontend/src/App.tsx frontend/src/components/layout/PublicNavbar.tsx
git commit -m "feat(frontend): react-router for the public site behind an onNavigate adapter"
```

---

### Task 3: Download page

**Files:**
- Modify: `frontend/src/services/api/index.ts` (add to `publicApi`), `frontend/src/i18n/index.ts` (register `download`)
- Create: `frontend/src/i18n/locales/vi/download.json`, `frontend/src/pages/public/download/{formatRelease.ts,useLatestReleases.ts,ReleaseCard.tsx,InstallGuide.tsx}`
- Replace: `frontend/src/pages/public/DownloadPage.tsx`
- Test: `frontend/src/pages/public/download/__tests__/formatRelease.test.ts`, `frontend/src/pages/public/__tests__/DownloadPage.test.tsx`

**Interfaces:**
- Consumes: `GET /updates/latest` response shape (Task 1); `react-router`/RTL (Task 2).
- Produces: in `services/api/index.ts` `export type ReleaseChannel = 'edge-windows-x86_64' | 'android'`, `export interface LatestReleaseOut { channel: ReleaseChannel; version: string; versionCode: number | null; notes: string | null; sizeBytes: number; sha256: string; publishedAt: string }`, `publicApi.latestReleases: () => Promise<LatestReleaseOut[]>` (`api.get<{ releases: LatestReleaseOut[] }>('/updates/latest').then(r => r.releases)`).
- `formatBytes(bytes: number): string` (1024-based, one decimal, units B/KB/MB/GB: `48211456 → "46.0 MB"`, `0 → "0 B"`); `formatDate(iso: string, locale: string): string` (`Intl.DateTimeFormat(locale, { year:'numeric', month:'short', day:'numeric', timeZone:'UTC' })`: `('2026-11-10T08:00:00Z','en') → "Nov 10, 2026"`).
- `useLatestReleases(): { releases: LatestReleaseOut[] | null; isLoading: boolean; hasError: boolean; retry: () => void }` (cancels on unmount).
- `ReleaseCard({ channel: ReleaseChannel; release: LatestReleaseOut | undefined })`; `InstallGuide()`; `DownloadPage: React.FC`.

- [ ] **Step 1: Write failing unit tests** for `formatBytes` / `formatDate` with the examples above.
- [ ] **Step 2: Write failing component tests** in `DownloadPage.test.tsx` (first line `// @vitest-environment jsdom`; `afterEach(cleanup)`; `import '../../../i18n'`; render inside `MemoryRouter`; stub with `vi.spyOn(publicApi, 'latestReleases')`; query by role/text in English):
  - `shows a loading status while the request is pending` (role `status`, name "Loading releases").
  - `renders both releases with size, sha256 and download links` (links `href` end with `/api/v1/updates/download/edge-windows-x86_64` and `/android`).
  - `shows "No published release yet" only on the channel that is missing`.
  - `shows "No published release yet" on both cards when releases is empty`.
  - `shows one error alert with a retry button and recovers on retry` (reject once, then resolve; click Retry via `userEvent`).
  - `renders notes containing a script tag as text` (`<script>alert(1)</script>` visible; `document.querySelector('script')` is null).
  - `copy button does not throw when navigator.clipboard is undefined` (stub `navigator.clipboard` to `undefined`; click; a failure hint appears).
- [ ] **Step 3: Run** `cd frontend && npx vitest run src/pages` → FAIL.
- [ ] **Step 4: Implement** the interfaces above. Card content per spec §6: version, date, size, SHA-256 with copy button (`navigator.clipboard?.writeText` in try/catch), notes (`whitespace-pre-line`), download `<a>`; `InstallGuide` shows Edge steps (run the NSIS installer, activate with the code from the dashboard), APK steps (allow install from this source), and a verify block with `Get-FileHash -Algorithm SHA256 <file>` and `sha256sum <file>`. Add the `download` namespace to `i18n/index.ts` and write `download.json` with vi translations for every string used.
- [ ] **Step 5: Run tests, expect PASS**; then `npm run lint && npm run build`.
- [ ] **Step 6: Commit**

```bash
git add frontend/src/services/api/index.ts frontend/src/i18n/index.ts frontend/src/i18n/locales/vi/download.json frontend/src/pages/public/DownloadPage.tsx frontend/src/pages/public/download frontend/src/pages/public/__tests__
git commit -m "feat(frontend): download page for edge client and android apk"
```

---

### Task 4: Landing sections

**Files:**
- Replace: `frontend/src/pages/public/LandingPage.tsx` (composition only, < 80 lines; props unchanged: `{ onNavigate: (view: PublicViewType) => void; onSelectPlan?: (planId: string) => void }`)
- Create: `frontend/src/pages/public/landing/{HeroSection,PipelineSection,DemoSection,FeaturesSection,SolutionsSection,AppsSection,PricingSection,FaqSection,FinalCtaSection}.tsx`
- Modify: `frontend/src/i18n/locales/vi/landing.json` (rewrite for the new copy; delete keys no longer used)
- Test: `frontend/src/pages/public/__tests__/LandingPage.test.tsx`

**Interfaces:**
- Consumes: `PublicViewType` from `lib/publicRoutes`; `publicApi.plans()` (existing); `Link` from `react-router`.
- Produces: each section is a props-free component except those needing navigation: `HeroSection({ onNavigate })`, `PricingSection({ onNavigate, onSelectPlan })`, `FinalCtaSection({ onNavigate })`. `AppsSection` links with `<Link to="/download">`.
- Section order and anchors per Global Constraints and spec §5. `DemoSection` keeps the four preset scenarios and the custom-plate input but draws vehicle/plate with CSS/SVG (no remote images). `PricingSection` keeps the `business → pro` alias and the hard-coded fallback cards.

- [ ] **Step 1: Write failing tests** in `LandingPage.test.tsx` (`// @vitest-environment jsdom`, `afterEach(cleanup)`, `MemoryRouter`, `vi.spyOn(publicApi, 'plans')` resolving `[]`, `import '../../../i18n'`):
  - `primary CTA navigates to register` (click "Start 14-day free trial" → `onNavigate` called with `'register'`).
  - `apps section links to /download` (a link with `href="/download"`).
  - `landing exposes every anchor id used by the navbar` (`simulator, features, how-it-works, solutions, apps, pricing, faq`).
  - `contains no unsourced claims` (page text has none of `250+`, `99.8%`, `99.9%`, `Sunrise Tower`; no `img` whose `src` contains `unsplash`).
  - `still renders pricing cards when the plans request fails` (`plans` rejects).
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/pages/public/__tests__/LandingPage.test.tsx` → FAIL.
- [ ] **Step 3: Implement** sections one at a time, then compose them in `LandingPage.tsx`; rewrite `landing.json`; delete the old monolith content. Check each `t('…')` key used exists in `landing.json` and each key in the file is still used (grep).
- [ ] **Step 4: Run tests, expect PASS**; then `npm run lint && npm run build`.
- [ ] **Step 5: Manual check** (`npm run dev -- --port 3002`): all sections at desktop and 375 px width, dark and light theme, vi and en, demo scenarios, anchor scrolling from the navbar.
- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/public/LandingPage.tsx frontend/src/pages/public/landing frontend/src/i18n/locales/vi/landing.json frontend/src/pages/public/__tests__/LandingPage.test.tsx
git commit -m "feat(frontend): redesign landing page as composable sections"
```

---

### Task 5: Navbar and footer

**Files:**
- Modify: `frontend/src/components/layout/PublicNavbar.tsx`, `frontend/src/components/layout/PublicFooter.tsx`, `frontend/src/i18n/locales/vi/layout.json`
- Test: `frontend/src/components/layout/__tests__/PublicNavbar.test.tsx`

**Interfaces:**
- Consumes: `PublicViewType`, `PUBLIC_ROUTES` (Task 2); `Link`/`NavLink` from `react-router`. Props of `PublicNavbar` and `PublicFooter` are unchanged.
- Produces: brand text "ParkVision" linking to `/`; a "Download" nav link to `/download` in desktop and mobile menus; footer "Download" link; remove the "SaaS v4.8" badge.

- [ ] **Step 1: Write failing test** `PublicNavbar.test.tsx` (`// @vitest-environment jsdom`; `vi.mock` of `../../../context/PlatformContext` so `usePlatform()` returns `{ isAuthenticated: false, theme: 'dark', toggleTheme: vi.fn() }`; `MemoryRouter`): `shows the ParkVision brand and no ANPR.CLOUD text`; `has a Download link to /download`; `clicking a section link while on /download navigates to landing first` (`onNavigate` called with `'landing'`).
- [ ] **Step 2: Run** `npx vitest run src/components/layout/__tests__/PublicNavbar.test.tsx` → FAIL.
- [ ] **Step 3: Implement** the interface above; add vi strings to `layout.json`.
- [ ] **Step 4: Run tests, expect PASS**; `npm run lint && npm run build`.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/PublicNavbar.tsx frontend/src/components/layout/PublicFooter.tsx frontend/src/i18n/locales/vi/layout.json frontend/src/components/layout/__tests__
git commit -m "feat(frontend): ParkVision brand and download links in navbar and footer"
```

---

### Task 6: Docs, integration, review

**Files:**
- Modify: `CLAUDE.md` (frontend verification block: replace "No `npm test` script for the dashboard currently." with `cd frontend && npm test   # vitest`; add a short "Public site routes" note listing the routes and that the authenticated workspace is not routed), plus the docs page that documents the update endpoints (find it with `grep -rn "updates/android" docs`) to add `/updates/latest` and `/updates/download/{channel}`.

- [ ] **Step 1: Full verification** — `cd frontend && npm run lint && npm test && npm run build`; backend `ruff check` on touched files and, if Postgres/Redis/S3 exist, the Task 1 tests; record exactly what ran and what could not.
- [ ] **Step 2: Integration check** — with the backend running and one published release of each channel, open `/download` through the Vite proxy: cards show real versions; Download triggers a file; hard-refresh `/download`; Back button; language switch; dark/light; 375 px.
- [ ] **Step 3: Reviews (parallel, read-only)** — `ecc:react-reviewer` or `ecc:typescript-reviewer` on `frontend/`, `ecc:fastapi-reviewer` and `ecc:security-reviewer` on the two new public endpoints; fix CRITICAL and HIGH findings, re-run Step 1.
- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs
git commit -m "docs: public site routes, release endpoints, dashboard test script"
```
