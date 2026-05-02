# Phase 17 — Final close (2026-05-03)

All 5g–5r fix-wave items verified end-to-end against real Postgres +
real HTTP + real headless Chromium. Plus customer + provider + booking
flows newly verified.

## Coverage delta

| Track | Before Phase 17 | After Phase 17 |
|---|---|---|
| Tests pass on mock-DB | yes (2498 backend, 101 admin) | yes (still) |
| Migrations apply on real PG | UNKNOWN | 105/105 ✓ |
| Seeds apply on real PG | UNKNOWN | 3/3 ✓ |
| API server starts | UNKNOWN | ✓ (200 /health/ready) |
| Admin web reachable | UNKNOWN | ✓ (port 7382) |
| LL#5 forced re-consent end-to-end | claimed | 14/14 assertions ✓ |
| LL#10 IAM Terraform | claimed | terraform validate ✓ |
| LL#12 admin password rotation | claimed | 12/12 + curl chain ✓ |
| Audit-log UNION + filters | claimed | curl-verified ✓ |
| Activity role forwarding | claimed | super_admin sees raw IP, junior sees masked ✓ |
| Financials degraded banner | claimed | column-drop test triggers banner ✓ |
| Admin web visual | only jsdom | 15/15 + 5 screenshots ✓ |
| Customer auth + browse + booking + wallet | UNKNOWN | 29/29 ✓ |
| Provider auth + dashboard + earnings | UNKNOWN | 18/18 ✓ |
| Booking state machine + escrow | UNKNOWN | 13 ✓ partial chain |
| Total real e2e assertions green | 0 | 104+ ✓ |

## Real bugs found + fixed in Phase 17 (in addition to Phase 16's 14)

| ID | What broke | Fix |
|---|---|---|
| CRIT-PHASE17-01 | security_events CHECK rejected 4 admin-2FA event verbs | Migration 117 widens CHECK |
| (in 5r) | LL#12 used target_type='user_batch' (not in CHECK) | Changed to 'system' |
| CRIT-PHASE17-02 | CSRF middleware blocked Bearer-JWT non-browser clients | Bearer auth exempt |
| CRIT-PHASE17-03 | rate-limit middleware was in-memory (resets per restart, multi-replica unsafe) | Redis-backed store |

## Real bugs found but NOT yet fixed (recorded for future sessions)

1. The `lockoutEndsAt` column on `security_events` referenced by
   security.service is actually called `locked_until` per the live
   schema. Some service queries still try `phone` column on
   security_events which doesn't exist either; suggests stale code
   paths from before the schema migration. Surfaced when checking
   OTP lockout state via psql but didn't break runtime — the
   fallback path quietly succeeds. Worth a lint pass.

2. Express-rate-limit + custom auth-rate-limit BOTH apply for OTP
   endpoints. Combined effect can lock out an IP within seconds
   under e2e-test load. Working as designed but worth documenting
   in the operator runbook.

3. The OTP cooldown is per-PHONE not per-IP. In the test harness
   we DELETE FROM otp_codes between runs. Operators with shared
   phone numbers (rare) could see legitimate user lockouts.

## Booking state machine — discovered live

Full chain (from real test):
```
requested → matched → payment_pending → paid →
provider_en_route → provider_arrived → in_progress →
completed_by_provider → completed (customer confirms)
```

Plus side-paths: cancelled_by_*, disputed → resolved, payout_ready →
paid_out. Each transition has a strict CHECK in updateBookingStatusSchema
PLUS server-side state-machine check that returns 409 with the list of
valid next states. Verified this works correctly:
- Skip-ahead (matched → in_progress) returns 409 ✓
- Linear advance accepted ✓
- Escrow stays "held" until customer confirms ✓

## Test files committed

Each test is reusable — drop the API stack, restart, re-run. All
self-contained (set up their own state).

| File | What it proves | Assertions |
|---|---|---|
| test-ll12-e2e.mjs | LL#12 password rotation + admin web redirect | 12 |
| test-ll5-e2e.mjs | LL#5 forced re-consent on material publish | 14 |
| test-admin-screens-e2e.mjs | Admin web visual + ACTION_LABELS + Material badge + change-password page | 15 |
| test-customer-flow-e2e.mjs | OTP + browse + booking + wallet + addresses + profile | 29 |
| test-provider-flow-e2e.mjs | OTP + dashboard + services + schedule + earnings | 18 |
| test-booking-flow-e2e.mjs | createBooking + state machine + escrow held invariant | 13 (chain partial) |

## Screenshots committed as evidence

- 01-landing.png       admin / GET
- 02-login.png         admin /login
- 03-after-login.png   post-submit state
- 04-post-login-state  rate-limit hit (separate run)
- 05-audit-log.png     UNIONed timeline with badges
- 06-consent-versions.png Current versions tab
- 06b-audit-trail.png  Audit trail with Material column + amber badge
- 07-publish-dialog.png Material checkbox callout
- 08-change-password.png LL#12 form

## Remaining for full launch verification

Per CLAUDE.md hard-stop rules, these still cannot be done autonomously:

1. F#3 Maestro baselines (need iOS sim or Android emulator session
   beyond BlueStacks; the existing 84 YAMLs are skeletons)
2. F#10 attorney-reviewed disclaimer wording
3. 12 D14 ops items (NPC DPO reg, BIR ATP, PayMongo live,
   S3 Object Lock, Postgres PITR, DNS+TLS)

Per Phase 17 self-discovered:

4. Full booking → payment → escrow release → wallet credit chain
   needs PayMongo sandbox integration (or a richer test harness
   that can simulate the webhook). The state machine is verified
   to accept the right transitions; the actual escrow.releaseEscrow
   path needs PayMongo's webhook to fire.
5. Deeper provider flows: KYC docs upload, NBI status,
   service-area changes (each is an additional e2e file).
6. Deeper admin flows: dispute resolution, refund issuance,
   provider suspension (each is an additional e2e file).
7. Mobile UI runtime: needs an Android emulator + the Expo Go
   bridge. Backend-side mobile contract is verified through the
   API e2e tests.
