# Security: test-mode reductions to REVERT before production launch

> **HISTORICAL TEST-MODE CHECKLIST, updated 2026-08-24.** The current shared host
> is the production/demo deployment, not a disposable staging box. Verify every
> flag and response on the deployed container; do not assume this June snapshot
> still describes it.

> **LIVE VERIFICATION 2026-08-24:** developer OTP, relaxed rate limits, and the
> admin 2FA bypass were found enabled and were disabled together after a full
> backup. The fixed OTP value was removed, the API was recreated healthy, and
> fixtures remain off. One privileged account using a formerly published demo
> password was deactivated and its 13 refresh sessions revoked. The remaining
> privileged account has TOTP. `NODE_ENV` cannot yet be promoted because the
> host has no real Turnstile secret; see `LAUNCH-LIMITATIONS.md` §41.

Any test-mode reduction must be removed before production use. This is the
checklist (from the 2026-06-28 security audit). Pair it with
[launch-cutover.md](launch-cutover.md). Nothing here is a code bug — these are
on/off switches and seeds that are correct for testing and wrong for launch.

## High — must revert

1. **nginx public gate is OFF.** `auth_basic off;` on the app + admin vhosts
   (nginx/nginx.conf). At cutover, either rely on real SMS OTP + admin 2FA being
   on, or restore the Basic Auth gate. Also re-check the api.onservice.ph
   `allow … deny all` IP lock.
2. **RESOLVED 2026-08-24; hardened 2026-08-25 — Dev OTP bypass** requires
   `ALLOW_DEV_OTP=1`, an explicit `DEV_OTP_CODE`, and
   `DEV_OTP_ALLOWED_PHONES`. It can authenticate only the listed synthetic or
   seeded audit accounts and skips SMS for those phones. Production refuses to
   boot with the flag. Remove all three values at cutover and wire a real SMS
   provider.
3. **RESOLVED 2026-08-24 — Admin 2FA disabled** via `ADMIN_DISABLE_2FA` makes any admin password a
   full back-office key. Production now refuses to boot with that flag. Build
   admin without `VITE_DEMO_MODE=1`, and rotate every historical/demo credential.
   A former demo password was once committed to this file, so it must be treated
   as permanently exposed even though the literal has now been removed.
4. **PayMongo live key (`sk_live`) may be active on the open box.** On an open
   test box a booking payment could attempt a REAL charge. Recommended: run
   staging on PayMongo TEST keys (`pk_test_`/`sk_test_`) until cutover; switch to
   live keys on the production box only (launch-cutover Item 7), then
   `bash scripts/verify-paymongo.sh`. **Flagged for Ken — verify before inviting
   wide testing that involves the Pay button.**

## Medium — must revert

5. **RESOLVED 2026-08-24 — Rate limiters + OTP brute-force lockout relaxed** via `RATE_LIMITS_RELAXED=1`.
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
