# Gate 3 — Pre-mortem (Phase 12)

## Production failure scenarios

1. **Admin loses TOTP device after force-enrolment** — locked out. Mitigation: `/admin/2fa/disable` exists for super_admin to clear another admin's totp_secret. Document this in DEPLOYMENT.md ops runbook (currently noted under on-call escalation).
2. **First admin tries to log in fresh in production** — they will hit force-enrolment immediately. UX must be discoverable. LoginPage shows clear "Set up 2FA" panel with QR. Verified manually.
3. **Sentry DSN leaked publicly** — Sentry DSNs are intended public credentials (write-only). Risk is event-flooding by attacker. Mitigation: production should set Sentry rate-limit at the project level.
4. **Sentry blocks main thread on init** — `@sentry/react@8.40.0` init is synchronous but small. Bundle size +30 kB gzip on main entry. Acceptable.
5. **`pre_auth_2fa_setup` token replay** — 5-minute expiry; signed with same JWT secret as access tokens. After `/enable` succeeds, totp_enabled=true and any further use of the token still works for setup but the setup operation is idempotent (regenerate secret).
6. **Smoke test flake in CI** — all hermetic; mocks db.query and logger. No network. No randomness beyond TOTP seed (which uses fixed time).
7. **Admin opens app with no internet** — Sentry init wrapped in try/catch implicitly via env-guard. ErrorBoundary fallback shows "Something went wrong. Please refresh." which works offline.
8. **CSP not configured (SEC-009 deferral)** — without admin CSP, an injected script could exfiltrate tokens. Documented as known gap; mitigation is the existing input sanitization on every admin form. Risk is low because admin web is authenticated-only and inputs are typed/encoded by React.
9. **Logger PII leak (SEC-005 deferral)** — full email + IP currently logged on auth attempts. Documented; ops should configure log-aggregation-side redaction in the meantime.
10. **S3 uploads not server-side encrypted (SEC-004 deferral)** — government IDs sit in S3 without SSE. Mitigated by S3 bucket-level default encryption if the bucket is configured (verify in AWS console; not enforced in code). Documented.
11. **Force-enrolment locks out legacy admins** — any pre-existing admin with `totp_enabled=false` will be forced through setup on next login. This is the desired behavior but ops should pre-warn the team before deploying.
12. **Mobile Sentry overlap** — pre-existing init unchanged, but Sentry SDK can clash with React Native `LogBox`. No new code; no new risk.
