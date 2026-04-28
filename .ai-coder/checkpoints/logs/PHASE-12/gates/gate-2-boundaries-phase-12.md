# Gate 2 — Boundaries (Phase 12)

## Trust boundaries

| Boundary | Where | Validation |
|---|---|---|
| Browser → /admin/login | rate limit + IP-block (existing) + bcrypt verify | Wrong password counts toward IP block. |
| Browser → /admin/2fa/{setup,enable} | `adminAuthOrSetupToken` middleware | Accepts either full admin JWT (existing) OR `pre_auth_2fa_setup` token (5-min). Rejects all other JWT types incl. `pre_auth_2fa`, `refresh`, `customer/provider access`. |
| `pre_auth_2fa_setup` token scope | JWT `type` claim | Token cannot be used for any other route — middleware checks type explicitly. Token expires in 5 minutes. |
| Sentry init (admin) | `import.meta.env.VITE_SENTRY_DSN` | No DSN → no init → no telemetry leak. ErrorBoundary still wraps app for graceful failure. |
| Sentry replay | `replaysSessionSampleRate: 0` | Session replays disabled to avoid PII capture. |
| Smoke tests | `__tests__/smoke.test.ts` | Hermetic — db.query mocked, no real network. Safe in any CI environment. |

## SQL injection
N/A — no new SQL added this phase. The /enable handler reuses existing parametric UPDATE.

## Data exposure
- `pre_auth_2fa_setup` token contains `{ userId, role, type }`. Loss does not allow login (cannot call /login again without password); does allow setup of 2FA on the victim's account ⇒ but only the legitimate user can complete since they must scan the QR. Mitigation: 5-minute expiry; token transmitted only over HTTPS.
- Sentry events may contain stack traces with variable values. The admin Sentry init does NOT enable replay; default Sentry scrubbing is active. PII masking in event payloads is a SEC-005 deferral documented in future-bugs.

## Sacred files
- `auth.routes.ts` — additive new middleware + new branch + new mint inside /enable. Existing pre_auth_2fa and existing /enable-from-fully-authed-admin paths byte-identical.
- `main.tsx`, `App.tsx`, `LoginPage.tsx` — additive frontend.

## Money math
NONE. Smoke tests assert conservation on synthetic data; production money paths untouched.
