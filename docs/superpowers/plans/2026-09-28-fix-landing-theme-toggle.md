# Fix Landing Page Light/Dark Theme Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the light/dark theme toggle on the landing page (and all public pages) actually switch themes.

**Architecture:** The app already has a complete light-theme stylesheet scoped under the `.light` class on `<html>` (`frontend/src/index.css`), and a theme state + `toggleTheme` in `PlatformContext`. The wiring between them is broken: the context only toggles the `dark` class, so `.light` rules never match. Fix the class application in the context effect, and add a pre-paint boot script in `index.html` so a saved `light` preference does not flash dark on reload.

**Tech Stack:** React 19, Vite 6, Tailwind CSS v4 (`@tailwindcss/vite`), plain CSS overrides in `index.css`.

**Spec:** User report — "light mode and darkmode not working in landing page". Expected behavior: clicking the sun/moon button in `PublicNavbar` switches the whole page between the dark `:root` theme and the `.light` overrides, persists across reloads via `localStorage.theme`, and the icon reflects the current theme.

## Root Cause (already diagnosed)

- `frontend/src/context/PlatformContext.tsx:399-402` runs `document.documentElement.classList.toggle('dark', theme === 'dark')` — it never adds the `light` class that every light-mode rule in `index.css` is scoped under. The `dark` class matches nothing in the stylesheet (dark is the `:root` default), so toggling changes no CSS.
- `frontend/index.html` applies no theme class before React mounts, so even after the fix, a saved `light` preference renders dark until the first effect runs (flash of wrong theme).

## Global Constraints

- No test runner exists in `frontend/package.json` (scripts: `dev`, `build`, `preview`, `clean`, `lint`). Verification is `npm run lint` (`tsc --noEmit`) plus manual browser checks — do not add a test framework.
- Do not change `localStorage` key (`theme`) or its values (`'light'` / `'dark'`); other code may already depend on them.
- Keep dark as the default theme when no/unknown value is stored.
- Theme values are exactly `'dark' | 'light'` — do not introduce a third theme or `system` option.

## Review Focus

- Saved `light` preference + page reload → must render light on first paint, no dark flash (Task 2).
- Toggle button icon in `PublicNavbar.tsx:126` reads `theme` state, not DOM class — confirm it still matches visuals after the fix (covered by manual check).
- Other entry points that read `localStorage.getItem('theme')` — none besides `PlatformContext.tsx:396`; the boot script must duplicate the same default logic (`'light'` only when stored value is `'light'`).
- Pages outside the landing page (dashboard, auth) share the same `<html>` class — fix must not regress them; the `.light` overrides are global by design.
- `localStorage` unavailable (private mode edge) → `getItem` throws only in exotic setups; existing code already assumes it works, boot script should wrap access in try/catch since it runs before any framework code.

---

### Task 1: Apply the `light` class in `PlatformContext`

**Files:**
- Modify: `frontend/src/context/PlatformContext.tsx:399-402`

**Interfaces:**
- Consumes: existing `theme` state (`'dark' | 'light'`) and `localStorage` key `theme`.
- Produces: `<html>` carries exactly one of `class="dark"` / `class="light"` after mount and on every toggle; `toggleTheme()` signature unchanged — no other file changes needed.

- [ ] **Step 1: Update the theme effect**

Replace the single `dark` toggle with explicit add/remove of both classes:

```ts
useEffect(() => {
  document.documentElement.classList.remove('dark', 'light');
  document.documentElement.classList.add(theme);
  localStorage.setItem('theme', theme);
}, [theme]);
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS, no output errors.

- [ ] **Step 3: Manual verify toggle works**

Dev server already runs on `http://localhost:3001`. Steps:
1. Open landing page → dark by default.
2. Click the theme button (sun icon, top-right navbar) → page switches to light: white background, dark text.
3. Click again → back to dark.
4. Confirm icon swaps (`Sun` in dark mode → `Moon` in light mode) — driven by `theme` state, no DOM change needed.

Expected: visual theme flips each click.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/context/PlatformContext.tsx
git commit -m "fix: apply light class on <html> so .light theme overrides activate"
```

### Task 2: Pre-paint theme boot script in `index.html`

**Files:**
- Modify: `frontend/index.html` (inside `<head>`, before the module script)

**Interfaces:**
- Consumes: `localStorage.getItem('theme')` — same key/values as `PlatformContext`.
- Produces: `<html>` has the correct theme class before first paint; React effect in Task 1 re-asserts the same class on mount, so no conflict.

- [ ] **Step 1: Add inline boot script**

Insert as the first element inside `<head>` (before any stylesheet-linked render path):

```html
<script>
  try {
    var t = localStorage.getItem('theme') === 'light' ? 'light' : 'dark';
    document.documentElement.classList.add(t);
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
</script>
```

Keep it a plain synchronous script — do not defer/module it.

- [ ] **Step 2: Manual verify no flash**

Steps:
1. Toggle to light, reload the page → first paint is already light (no dark flash).
2. Clear `localStorage` (DevTools → Application), reload → dark, no flash either way.

Expected: correct theme on first paint in both cases.

- [ ] **Step 3: Typecheck + build sanity**

Run: `cd frontend && npm run lint && npm run build`
Expected: PASS; build succeeds (inline script is inert to Vite).

- [ ] **Step 4: Commit**

```bash
git add frontend/index.html
git commit -m "fix: apply saved theme class before first paint to prevent flash"
```

---

## Self-Review Notes

- Spec coverage: toggle now works (Task 1), persists across reload without flash (Task 2 + existing localStorage write). Icon already follows `theme` state — no change needed.
- No test infrastructure exists; manual verification steps are the checkable results, matching this repo's conventions.
- Both tasks are independent and order-agnostic; Task 1 is the bug fix, Task 2 removes the residual flash.
