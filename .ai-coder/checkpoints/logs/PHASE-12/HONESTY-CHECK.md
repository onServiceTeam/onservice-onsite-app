# Phase 12 — Honesty Check (Launch Readiness)

## Mandate
Final hardening before public launch — Sentry across all surfaces, admin 2FA force-enrolment, security pass per SEC-001..009, k6 load test smoke, deployment runbook, smoke test suite.

## What was actually delivered

### Sentry
- API (`packages/api/src/server.ts`) — pre-existing, unchanged.
- Mobile (`apps/mobile/app/_layout.tsx`) — pre-existing, unchanged.
- **NEW** Admin (`apps/admin/src/main.tsx`, `App.tsx`, `vite-env.d.ts`) — `@sentry/react@8.40.0` initialized guarded on `VITE_SENTRY_DSN`; `<Sentry.ErrorBoundary>` wraps the route tree with a graceful fallback. Adds ~30 kB gzip to the main entry chunk.

### Admin 2FA force-enrolment
- `packages/api/src/routes/auth.routes.ts`:
  - `/admin/login` returns `{ requires2FASetup: true, preAuthToken<5min, type='pre_auth_2fa_setup'>, userId }` when an admin/super_admin has `totp_enabled=false`.
  - New middleware `adminAuthOrSetupToken` accepts either a full admin JWT (existing reconfigure flow) or the short-lived `pre_auth_2fa_setup` token. `req.isSetupToken` is set so the `/enable` handler can mint full session tokens on first enrolment.
  - `/admin/2fa/setup` and `/admin/2fa/enable` accept the new middleware; `/enable` mints `accessToken + refreshToken + user` directly when called with the setup token.
- `apps/admin/src/pages/LoginPage.tsx`: handles `requires2FASetup` branch with inline QR + 6-digit code panel calling `/setup` then `/enable`.
- No DB migration required — behavior is hardcoded for admin roles.

### Smoke test suite
- `packages/api/__tests__/smoke.test.ts` (235 LOC, 13 tests). Hermetic, mock pattern from `marketing-admin.test.ts`. Coverage: health route, auth login validator, money-conservation invariant on synthetic 100-row sample, booking state-machine happy path + invalid transition, commission calculator fixed-point, TOTP utility known seed, audit-log CSV escaping (commas + quotes).

### Documentation
- `docs/DEPLOYMENT.md` (188 LOC): Render API deploy, Vercel admin deploy, EAS mobile deploy, migrations, env var inventory, rollback, on-call escalation, smoke gate.
- `docs/SECURITY-POSTURE.md` (105 LOC): SEC-001..009 verification table with file:line citations.

### Phase docs (this set)
- `.ai-coder/checkpoints/logs/PHASE-12/HONESTY-CHECK.md` (this file).
- `.ai-coder/checkpoints/logs/PHASE-12/EVIDENCE-MANIFEST.md`.
- `.ai-coder/checkpoints/logs/PHASE-12/gates/gate-2-paper-trace-phase-12.md`.
- `.ai-coder/checkpoints/logs/PHASE-12/gates/gate-2-boundaries-phase-12.md`.
- `.ai-coder/checkpoints/logs/PHASE-12/gates/gate-3-premortem.md`.
- `.ai-coder/checkpoints/logs/PHASE-12/gates/gate-3-future-bugs.md` (written by subagent; carries SEC-004/005/009 deferrals).
- `.ai-coder/checkpoints/logs/PHASE-12/checks/INDEX.md`.

## What was NOT delivered (carried forward)

- **SEC-004 (S3 SSE on uploads)** — `PutObjectCommand` lacks `ServerSideEncryption: 'AES256'`. Estimated ~10 LOC + bucket policy. Deferred to a security hardening sprint so the bucket-policy and key-rotation infra can ship together.
- **SEC-005 (PII masking in logs)** — `winston` logger has no redaction format. Estimated 80-120 LOC + per-call-site sweep. Exceeds Phase 12 >50-LOC budget for security-pass items.
- **SEC-009 (Admin web CSP)** — neither `index.html` meta CSP nor `vercel.json` headers exist. ~30 LOC plus an inline-script/style audit and origin allowlist (Sentry, PayMongo, map tiles, S3). Defer to its own focused PR.
- **CAPTCHA endpoint hardening (SEC-002)** — verified the existing rate-limit + IP-block pipeline; explicit hCaptcha/reCAPTCHA token check on registration is not present. Recorded as VERIFIED-with-caveat in SECURITY-POSTURE.
- **Load test smoke not auto-wired into CI** — k6 is not invoked by `verify-phase.sh`; running `k6 run load-tests/full-suite.js` is a manual ops step documented in DEPLOYMENT.md.

## Sacred-file touches
- `auth.routes.ts` — additive: a new middleware factory + a new branch in `/admin/login` + minor token-mint branch in `/enable`. Existing pre_auth_2fa flow byte-identical.
- `App.tsx`, `main.tsx`, `LoginPage.tsx` — additive frontend edits.

## Money math
None added or modified. Smoke test ASSERTS money conservation on synthetic fixtures but does not perform real money math.

## Verification
- `packages/api` tsc / eslint / jest: 802/802 pass (was 789; +13 smoke tests).
- `apps/admin` tsc / eslint / build: success (main entry +30 kB gzip due to Sentry; no new lazy chunks).
- repo-root `npm run lint`: clean.
