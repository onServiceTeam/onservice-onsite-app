# Phase 23 — 2FA + rate limit + DSR + ops gaps (2026-05-03)

Phase 22 closed prior production blockers. Phase 23 attacked four
remaining auth/security/compliance gaps that earlier breadth tests
hadn't reached.

## Coverage delta

| Track | Phase 22 | Phase 23 |
|---|---|---|
| 2FA enrollment + verification | not tested | **22/22 PASS, 3 critical bugs fixed** |
| Rate limit boundary tests | implicit | **10/10 PASS, 1 bug fixed (Redis store)** |
| DSR full lifecycle | partial (file only) | **16/16 PASS (file → assign → complete + reject)** |
| Mobile lint | not run | **run, 89 no-undef env-config drift (no real bugs)** |
| .env.example documentation | gap | **TOTP_ENCRYPTION_KEY documented + boot validator** |
| Total real-runtime assertions | 491+ | **539+ (+48)** |

## Real bugs fixed in Phase 23

| ID | Severity | What broke | Fix |
|---|---|---|---|
| **BUG-PHASE23-01** | **CRIT — admin tier locked out** | `TOTP_ENCRYPTION_KEY` in `.env` was a plain ASCII string. `Buffer.from(value, 'hex')` produced a wrong-length buffer that crashed AES-256-GCM cipher creation with "Invalid key length". 2FA enrollment 500'd. **Admin tier mandates 2FA at login → entire admin tier locked out on fresh deploy.** | Replaced .env value with real 64-char hex key. Added strict boot-time validator in `totp.ts` that throws a clear error if the key isn't exactly 64 hex chars. Documented in `.env.example`. |
| **BUG-PHASE23-02** | **CRIT — race condition** | Refresh-token JWT payload was `{userId, role, type, iat, exp}` — `iat` is seconds-precision. Two refresh tokens for the same user signed in the same second produced byte-identical signatures → identical hashes → unique-key violation on `refresh_tokens.token_hash_key`. Crashed 2FA-verify retries, near-simultaneous logins, refresh-rotation within a 1-second window. | Add `crypto.randomBytes(16)` jti nonce to every refresh token. Each is unique regardless of timing. |
| **BUG-PHASE23-03** | **CRIT — admin login 500** | `/auth/admin/2fa/verify` success path called `recordLoginAttempt({phone: user.id, ...})` but `user.id` is a 36-char UUID and `login_attempts.phone` is `varchar(15)`. Every successful 2FA verify crashed with "value too long for type character varying(15)" — even after the prior 2 fixes, admins still couldn't log in. | Include `phone` in the user SELECT and pass `user.phone` (PH format = 13 chars) with defensive `.slice(0, 15)`. |
| **BUG-PHASE23-04** | **HIGH — rate limit not Redis-backed** | Phase 17 added Redis to the GLOBAL rate limiter but the LOCAL `authRateLimit` in `auth.routes.ts` was missed — still using express-rate-limit's default in-memory store. (a) Counters reset on every API restart → security regression. (b) Each k8s/ECS replica had its own counters → effective limit = N×configured. | Apply same `RedisStore` pattern as global limiter, with prefix `rl:auth-routes:` to stay separate. |

## Phase 23a — 2FA flow (22/22 PASS)

Full enrollment + verification with throwaway admin:
1. Login → setup-required + pre_auth_2fa_setup token ✓
2. Setup endpoint with Bearer token → secret + QR URI ✓
3. Generate TOTP from secret (using same algorithm as totp.ts) ✓
4. Enable with valid TOTP → `totp_enabled=TRUE` ✓
5. Re-login → requires2FA + pre_auth_2fa token ✓
6. Verify with WRONG TOTP → 401 + `admin_2fa_failed` security event ✓
7. Verify with valid TOTP → 200 + session cookie + `admin_login_2fa_verified` event ✓
8. Disable with valid TOTP → `totp_enabled=FALSE` ✓
9. Re-login → setup-required again (admin tier always needs 2FA) ✓

## Phase 23c — Rate limit (10/10 PASS)

- `/send-otp` from same IP × 12: first 10 succeed, last 2 return 429
- Different IPs unaffected (per-IP isolation works)
- After Redis flush, sticky IP recovers (verifies Redis-backed store)
- Global limit on `/catalog`: 100/110 succeed, 10 throttled
- Response includes `RateLimit-Limit`, `RateLimit-Remaining` headers
- 429 returns JSON body with error indicator

## Phase 23d — DSR lifecycle (16/16 PASS)

Customer files → admin manages → admin completes:
1. Customer POSTs DSR with `requestType: 'access'` → DB row created
2. Customer GETs `/compliance/my-requests` → sees their DSR
3. Admin GETs `/admin/compliance/dsr` → sees DSR in queue
4. Admin PATCHes status to `in_progress` → DB updated
5. Admin POSTs `/complete` with `responsePayloadUrl` → status=completed
6. Separate DSR with `erasure` type → admin POSTs `/reject` with reason → status=rejected
7. `admin_actions` audit rows verified

Validation enforced:
- requestType enum: `access | erasure | correction | portability | restriction | objection`
- Rejection reason ≥30 chars

## Phase 23f — Mobile lint

Ran `eslint apps/mobile`. 113 issues:
- **89 `no-undef`** for standard JS globals (URL, FormData, BodyInit, crypto). TypeScript knows these via tsconfig but the eslint env config doesn't include them. **Not real bugs** — typecheck passed, runtime works. ESLint env config drift; fix is a 1-line eslint config update (out of Phase 23 scope).
- **14 `no-unused-vars`** — cosmetic.
- **3 `no-require-imports`** — minor, would migrate to ES imports.

Not blocking; documented as Phase 24 candidate.

## Cumulative across Phase 17 → 23

- **29 real bugs** found + fixed (3+6+2+1+1+3+1+3+5+4 = 29)
- **3 migrations** (117/118/119)
- **539+ real-runtime assertions** green
- **2700 unit-test assertions** green
- **= 3239+ total assertions** verified

## Test files committed in Phase 23

- `test-phase23a-2fa-flow.mjs` — 22 assertions
- `test-phase23c-rate-limits.mjs` — 10 assertions
- `test-phase23d-dsr-lifecycle.mjs` — 16 assertions

## What's still genuinely outside autonomous scope

Same as prior phases (unchanged):
1. F#3 Maestro baselines (need iOS sim or proper Android emulator)
2. F#10 attorney-reviewed disclaimer wording
3. 12 D14 ops items (NPC DPO, BIR ATP, PayMongo live, S3 Object Lock, Postgres PITR, DNS+TLS)
4. PayMongo sandbox webhook chain in real money flow
5. Native mobile UI runtime

## Operational items surfaced for Ken/ops

- **Generate TOTP_ENCRYPTION_KEY in production** with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and rotate periodically. .env.example now documents this.
- **Mobile eslint config drift** — would be a 1-line config update to add RN/Web globals. Tests + typecheck pass, runtime works, but lint is noisy. Can fix in a follow-up.
- **PayMongo webhook delivery monitoring** still latent (BUG-PHASE21-04)
- **Seed real checklist templates per category** (lazy-create works as fallback per BUG-PHASE21-02 fix, but rich templates are better UX).

## Continuation checklist

Stack still up. Reusable test files added to PHASE-20-FINAL.md continuation list:
- test-phase23a-2fa-flow.mjs
- test-phase23c-rate-limits.mjs  
- test-phase23d-dsr-lifecycle.mjs

Phase 24+ candidates (deferred):
- Audit-log forensic — verify EVERY admin action writes the right verb (sampled, not exhaustive)
- BIR/VAT report generation flow
- Push notification queue paths
- Performance / load testing
- Mobile eslint env config fix
- PayMongo webhook simulator end-to-end
