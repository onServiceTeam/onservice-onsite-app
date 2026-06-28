# Security: test-mode reductions to REVERT before production launch

The staging box is deliberately open for testing right now (Ken authorized).
That openness is fine for testing but MUST be undone at the production cutover.
This is the checklist (from the 2026-06-28 security audit). Pair it with
[launch-cutover.md](launch-cutover.md). Nothing here is a code bug — these are
on/off switches and seeds that are correct for testing and wrong for launch.

## High — must revert

1. **nginx public gate is OFF.** `auth_basic off;` on the app + admin vhosts
   (nginx/nginx.conf). At cutover, either rely on real SMS OTP + admin 2FA being
   on, or restore the Basic Auth gate. Also re-check the api.onservice.ph
   `allow … deny all` IP lock.
2. **Dev OTP bypass (000000)** via `ALLOW_DEV_OTP=1` + `DEV_OTP_CODE` in the
   server `.env` — lets anyone log in as any phone with no SMS. Setting
   `NODE_ENV=production` alone disables it; also remove the env vars and wire a
   real SMS provider.
3. **Admin 2FA disabled** via `ADMIN_DISABLE_2FA` — makes the demo super-admin
   password a full back-office key. At cutover remove the flag (forces TOTP
   enrollment), build admin WITHOUT `VITE_DEMO_MODE=1`, and rotate the demo
   super-admin password (currently `OnServiceDemo2026`).
4. **PayMongo live key (`sk_live`) may be active on the open box.** On an open
   test box a booking payment could attempt a REAL charge. Recommended: run
   staging on PayMongo TEST keys (`pk_test_`/`sk_test_`) until cutover; switch to
   live keys on the production box only (launch-cutover Item 7), then
   `bash scripts/verify-paymongo.sh`. **Flagged for Ken — verify before inviting
   wide testing that involves the Pay button.**

## Medium — must revert

5. **Rate limiters + OTP brute-force lockout relaxed** via `RATE_LIMITS_RELAXED=1`.
   `NODE_ENV=production` neutralizes it; also remove the env var. (The feedback
   flood limiter stays on regardless.)
6. **Demo one-tap auto-login** (`EXPO_PUBLIC_DEMO_MODE=1` / `VITE_DEMO_MODE=1`).
   Rebuild both bundles WITHOUT those flags to drop every `?demo` auto-login.
7. **Seeded demo accounts** (002_test_users.sql) with known phones. Do NOT run
   that seed against the production DB; provision the real admin via
   `scripts/bootstrap-admin.ts` with a strong password.
8. **Test-fixture endpoints** (`/__test/*`, including a destructive DELETE) gated
   only by `ENABLE_TEST_FIXTURES`. Confirm it is unset on the open box (set only
   transiently during Maestro capture); `NODE_ENV=production` disables the router.

## Already fixed in code (not a revert — landed 2026-06-28)

The audit's real findings were fixed and deployed: CSP + Permissions-Policy +
X-Frame-Options + TLS ciphers on nginx; CSV-formula-injection neutralization in
all 3 CSV exports; admin-2FA-backup-code admin gate; dispute-response explicit
denial; booking-photo staff access; constant-time feedback-export key compare;
CAPTCHA bypass gated on the relaxed flag (not NODE_ENV); production secret
validator rejects dev defaults; admin-login per-account lockout; Redis-backed
feedback rate limiters. Infra was already sound (Postgres/Redis/Grafana not
internet-exposed, ufw active, only SSH+80+443 open).
