# Remove Login Demo UI & Wire Real MFA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all demo/test UI from `LoginPage.tsx` (preset account pills, fake client-side MFA toggle, auto-fill demo code, prefilled credentials) so the page purely reflects the real backend auth flow, which is already fully implemented.

**Architecture:** The FastAPI backend already implements real TOTP MFA (`pyotp`, Fernet-encrypted secrets, hashed backup codes, `mfa_pending` short-lived token cookie, rate-limited login). The frontend `PlatformContext.login(email, pass, otp?)` already calls real endpoints: `POST /api/v1/auth/login` → `{mfaRequired}` → `POST /api/v1/auth/mfa/verify` (accepts both TOTP and backup codes) → `GET /auth/me`. So this plan is **frontend cleanup only** — no backend changes, no API contract changes.

**Tech Stack:** React 19 + TypeScript + Vite, Tailwind v4, `motion/react`, `lucide-react`, `react-i18next` (vi locale only). Backend: FastAPI + pyotp (untouched).

**Spec:** User request — "UI vẫn còn hiển thị thử nghiệm luồng, lên plan để remove UI thử nghiệm và implement thật" (remove the test-flow UI from the login screen; the real flow is the server-driven MFA challenge). Footer badge decision: change "FIDO2 / TOTP Enabled" to TOTP-only wording (backend has no FIDO2/WebAuthn).

**Scope note:** `frontend/src/pages/auth/LoginPage.tsx` exists identically in 3 sibling checkouts of the same GitHub repo (`parkvision-parking-map` on `feat/parking-map`, `parkvision-edge-client` on `feat/edge-client-tauri`, `parkvision-edge-devices` on `feat/tenant-edge-devices`). This plan modifies only `D:\Projects\parkvision` (branch `main`). Feature branches inherit the fix via merge/rebase from `main` — do NOT edit sibling checkouts.

## Global Constraints

- No new dependencies. No backend changes. No changes to `PlatformContext.login` signature: `(email, pass, otp?) => Promise<{ requiresMfa: boolean; success: boolean; message?: string }>`.
- The frontend has **no test runner** (no vitest/jest; `npm run lint` = `tsc --noEmit`). Verification is typecheck + manual browser checks; backend regression via `pytest`.
- Keep all existing i18n `t(...)` calls for strings that remain; remove `t()` keys that become orphaned (Task 2).
- Keep real features: the 3-step flow (credentials → mfa_challenge → backup_code), 6-digit OTP grid with paste/backspace handling, 30s TOTP countdown, "Use a recovery code" link, eye-toggle password, toasts.
- Demo accounts `admin.normal@vehicleplatform.io` / `admin.mfa@vehicleplatform.io` and demo code `123456` do NOT exist in the real backend — they must disappear from the UI.

## Review Focus

- **MFA pending token expires after 600s** (backend `auth.py` login sets `max_age=600`). If the user idles on the OTP step >10 min, `mfa/verify` returns 401 "Invalid token"/"No pending MFA session" — `LoginPage` must surface `res.message` (it already does via `errorMessage`); manual check in Task 3.
- **Backup codes are single-use** server-side (`complete_mfa` deletes the used hash). Reusing a consumed code must show "Invalid recovery code." — not hang or silently pass.
- **Stale state on Back navigation**: going Back from `mfa_challenge`/`backup_code` must reset `errorMessage` (already done); also confirm `otpDigits` reset is not required for correctness — `handleMfaSubmit` reads current state on submit. Decide: leave `otpDigits` as-is (back + re-entry keeps digits) — acceptable; pin a manual check.
- **Login rate limit** (`10 req / 60s`): repeated wrong passwords surface the backend error message — no extra UI needed.
- **`step` state on success**: after successful login the component unmounts (`isAuthenticated` flips). No reset needed, but verify no toast/error flashes during unmount.

---

### Task 1: Strip demo UI and fake MFA toggle from `LoginPage.tsx`

**Files:**
- Modify: `D:\Projects\parkvision\frontend\src\pages\auth\LoginPage.tsx`

**Interfaces:**
- Consumes: `usePlatform().login` / `usePlatform().addToast` — unchanged.
- Produces: `LoginPage` component with unchanged props `{ onNavigate?: (view: PublicViewType) => void }`. No exports change.

- [ ] **Step 1: Remove prefilled demo credentials and fake MFA state**

  In `frontend/src/pages/auth/LoginPage.tsx`:
  - Line 40: `useState('anh.nh@kyanon.digital')` → `useState('')`
  - Line 41: `useState('••••••••••••')` → `useState('')`
  - Delete line 43 entirely: `const [isMfaEnabledForAccount, setIsMfaEnabledForAccount] = useState(false);`
  - In `handleCredentialsSubmit` (~line 117-119): delete `setIsMfaEnabledForAccount(true);` — keep `setStep('mfa_challenge');` and the warning toast.

- [ ] **Step 2: Delete `handleSelectPreset` and `handleFillDemoCode`**

  - Delete the whole `handleSelectPreset` function (lines 75-98), including the "Preset demo accounts selection" comment.
  - Delete `handleFillDemoCode` (lines 170-174), including the "Auto fill test passcode 123456" comment.

- [ ] **Step 3: Delete the "Try a flow:" preset pills markup**

  Delete the entire `{/* Demo Account Quick Selector Pills */}` block (lines 276-302) — the `<div className="p-3 bg-[#0d0e12]/80 ...">` containing `{t('Try a flow:')}` and both `handleSelectPreset` buttons.

- [ ] **Step 4: Delete the fake MFA toggle**

  Delete the entire `{/* MFA Toggle Option Switch */}` block (lines 350-373) — the `<div className="p-3 bg-[#0d0e12] border ...">` containing `{t('Account has MFA (TOTP) enabled')}` and the `isMfaEnabledForAccount` checkbox. Whether MFA is required is decided by the backend via `res.requiresMfa` — a client toggle can only lie.

- [ ] **Step 5: Remove the "Auto-fill demo code" button, keep "Use a recovery code"**

  In the `{/* Helper Auto Fill Demo */}` block (lines 456-475): delete the `<button>` calling `handleFillDemoCode` (with `<Sparkles>`). Keep the "Use a recovery code" button. Update the wrapper comment to `{/* Recovery code link */}` and adjust the flex container to `justify-end` since only one child remains.

- [ ] **Step 6: Fix the footer claim**

  Line 566: change `<Check className="w-3 h-3" /> FIDO2 / TOTP Enabled` → `<Check className="w-3 h-3" /> TOTP 2FA Enabled` (per user decision; backend implements TOTP only). Leave `VehiclePlatform v4.8.2-prod` unchanged.

- [ ] **Step 7: Remove now-unused imports**

  In the import blocks (lines 3-29): delete `ShieldAlert`, `Smartphone`, `Sparkles`, `User`, `Shield`, `Layers`, `Activity`. Change line 25 `import { Button, Badge }` → `import { Button }` (Badge unused). Keep `Key` (still used at the recovery-code badge, ~line 509) and everything else (`Check`, `Clock`, `ChevronLeft`, `Eye`/`EyeOff`, `ArrowLeft`, `ArrowRight`, `Mail`, `Lock`, `ShieldCheck`, `CheckCircle2`, `AlertCircle`).

- [ ] **Step 8: Typecheck**

  Run: `cd /d/Projects/parkvision/frontend && npm run lint`
  Expected: exit 0, no TS errors. (Note: `noUnusedLocals` is NOT enabled, so tsc will not flag unused imports — Step 7 must be done by hand; do a final `grep -n "ShieldAlert\|Smartphone\|Sparkles\|Layers\|Activity\|Badge" src/pages/auth/LoginPage.tsx` expecting zero hits.)

- [ ] **Step 9: Commit**

  ```bash
  cd /d/Projects/parkvision
  git add frontend/src/pages/auth/LoginPage.tsx
  git commit -m "feat(auth): remove demo login UI, use real server-driven MFA flow"
  ```

### Task 2: Remove orphaned i18n keys

**Files:**
- Modify: `D:\Projects\parkvision\frontend\src\i18n\locales\vi\auth.json` (lines 1-5, 23-25, 28-30, 37)

**Interfaces:**
- Consumes: Task 1 must be complete (keys deleted here must have zero `t('...')` references left in `LoginPage.tsx`).

- [ ] **Step 1: Delete orphaned keys**

  Remove these keys from `frontend/src/i18n/locales/vi/auth.json` (all become unreferenced after Task 1):
  - `"Selected account without MFA"`, `"Password will sign you in directly."`, `"Selected account WITH MFA enabled"`, `"A 6-digit TOTP code is required after the password."`
  - `"Try a flow:"`, `"MFA Disabled"`, `"MFA Enabled (2FA)"`
  - `"Account has MFA (TOTP) enabled"`, `"A 6-digit code is required after the password"`, `"Sign in directly with password only"`
  - `"Auto-fill demo code (123456)"`

  Keep every other key — the remaining ones map to strings still rendered (toasts, OTP step, recovery-code step, footer, register page strings).

- [ ] **Step 2: Verify no dangling references**

  Run: `cd /d/Projects/parkvision/frontend && grep -rn "Try a flow\|Auto-fill demo code\|Account has MFA" src/`
  Expected: zero matches outside `i18n/locales`.
  Then `npm run lint` → exit 0.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/i18n/locales/vi/auth.json
  git commit -m "chore(i18n): drop orphaned login demo keys"
  ```

### Task 3: Verify the real MFA flow end-to-end

**Files:** none (verification only)

**Interfaces:**
- Consumes: Tasks 1-2. Backend endpoints `POST /api/v1/auth/login`, `POST /api/v1/auth/mfa/verify`, `POST /api/v1/auth/mfa/setup`, `POST /api/v1/auth/mfa/enable`, `GET /auth/me`.

- [ ] **Step 1: Backend regression**

  Run: `cd /d/Projects/parkvision/backend && python -m pytest tests/test_auth.py -v`
  Expected: all MFA/login tests PASS (suite covers `mfa_required` staging, TOTP verify, backup codes).

- [ ] **Step 2: Start backend + frontend**

  Backend: `cd backend && docker compose up -d` (or the project's documented run command — check `backend/README.md`); ensure `scripts/seed.py` has been run or use the in-app Register flow to create a tenant + admin.
  Frontend: `cd frontend && npm run dev` → http://localhost:3000.

- [ ] **Step 3: Manual checks (all must hold)**

  - Login page shows: email + password fields (empty), eye toggle, submit button — NO "Thử nghiệm luồng:" pills, NO MFA toggle switch, NO prefilled values.
  - Login with a non-MFA account → lands in dashboard directly (no OTP step).
  - Enable MFA for that account via `MfaFlowModal` (enroll) — reachable from Platform settings/admins UI (`openMfaModal('enroll')`). Save the shown backup codes.
  - Log out → log in again with password → `mfa_challenge` step appears → enter live TOTP (from authenticator, or generate with `python -c "import pyotp; print(pyotp.TOTP('<secret>').now())"`) → dashboard loads.
  - Repeat login → "Dùng mã khôi phục" → enter one saved backup code → dashboard loads; a SECOND login attempt reusing the same code shows "Mã khôi phục không hợp lệ." (single-use).
  - Wrong TOTP → inline error "Mã TOTP không chính xác hoặc đã hết hạn."; fields stay on OTP step.
  - Footer reads `TOTP 2FA Enabled`.
  - (Optional, slow) Pending-token expiry: leave the OTP step idle >10 min, then submit — UI must show the backend error (e.g. "Invalid token") rather than hang; pressing Back to credentials and re-submitting the password recovers.

- [ ] **Step 4: Report**

  Note any manual-check failures back to the user before claiming completion; no code changes expected from this task.
