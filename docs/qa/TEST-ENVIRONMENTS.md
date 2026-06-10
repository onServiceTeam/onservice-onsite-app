# onService — Test Environments & Data Governance

How the test environments are set up, the hazards in them, and how to get
repeatable runs.

## Environments

### Local dev stack (primary for automated/integration testing)
- Brought up with `scripts/dev/up.sh`: Postgres + PostGIS, Redis, MinIO, MailHog,
  Prometheus/Grafana, and the API on `:7381`.
- Seeded: 5 customers (`+63917…`–`+63921…`), 5 providers (`+63922…`–`+63926…`),
  catalog, Cebu service areas, demo bookings in every status.
- Dev OTP `000000`. No real money, no real SMS.
- **This is the right place** for API/security/integration tests and any run that
  needs to be deterministic and resettable.

### Staging (`*.onservice.ph`, password-gated)
- Real-ish deployment used for E2E confidence and the tester program.
- Dev OTP still on, gated behind HTTP Basic Auth (E07).
- See hazards below before running anything money-related here.

## Hazards (read before testing)

### H-1 — PayMongo is in LIVE mode on staging (P1)
Checkout on staging hits the **live** payment processor, so a real card is really
charged. **Do not complete a payment on staging.**

**Fix (operator):** load PayMongo **test** keys into the staging box `.env`
(`PAYMONGO_PUBLIC_KEY`, `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET` with the
`sk_test_…` / `pk_test_…` pair) and restart the API. Then payment flows can be
tested end to end with test cards safely. Until then, payment-path testing belongs
on the local stack.

### H-2 — Rate limiting blocks repeatable automated login (by design)
The OTP/auth endpoints are rate-limited (10/min per IP, plus per-phone and
per-IP failure lockouts). This is correct production behavior, but it makes
"log in fresh in every test" flaky.

**How automation handles it:**
- **Reuse sessions** — log in once per role, save the session, reuse it (the
  Playwright live suite does this via `storageState`).
- **Mint tokens directly** — the API security suite (`qa/api-security/`) signs
  HS256 tokens from the dev JWT secret in CI mode, never touching the limiter.
- **Reset when stuck** (local only):
  ```
  docker exec onservice-redis redis-cli FLUSHDB
  docker exec onservice-postgres psql -U onservice -d onservice_dev -c "DELETE FROM login_attempts"
  ```

**Recommended improvement:** a dedicated test-mode flag (or a seeded
`auth_rate_limit_max_requests` override) on non-production boxes so suites don't
have to reset or mint around the limiter. Tracked in the risk register (R-10).

## Test data

- **Seed:** `packages/api/seeds/*.sql`, applied by `scripts/dev/up.sh`. Stable
  accounts; booking UUIDs are regenerated per seed, so tests discover ids
  dynamically rather than hard-coding them.
- **Reset to a clean slate:** `scripts/dev/down.sh` (drops volumes) then
  `scripts/dev/up.sh` re-seeds. For a soft reset of just the rate limiters, use
  the FLUSHDB + DELETE above.
- **Don't** seed admin passwords (Gate C blocks it). Admin users are created via
  `packages/api/scripts/bootstrap-admin.ts` with a strong env-provided password.

## Quick reference

| Need | Where | How |
|---|---|---|
| API security / IDOR / multi-actor | local | `cd qa/api-security && node --test` (see its README) |
| Web E2E (customer/provider/admin) | staging | `apps/admin` Playwright live config |
| Unit / component | local (in-process) | `npx jest` in `packages/api` / `apps/mobile` |
| Visual regression (admin) | local | Playwright `tests/visual` |
| Payment-path testing | local only | until staging gets PayMongo test keys (H-1) |
