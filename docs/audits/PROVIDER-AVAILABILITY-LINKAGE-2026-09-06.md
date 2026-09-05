# Provider availability: storage, matching and assignment gaps

Date: 2026-09-06, Asia/Singapore. Baseline `39f5c78ba683c537c38842700978da11123420d0`.
Candidate engineering work. No production records, schema or payments changed.

## Contract and observed linkage

US-P008 in `docs/architecture/SPEC.md` requires working hours, date overrides and
an instant availability toggle so providers receive offers when they can work.
The provider availability screen says date overrides take priority over weekly
hours. Its server write already replaces the complete selected date.

| Path | Finding at baseline | This checkpoint |
| --- | --- | --- |
| Weekly schedule | Saved to `provider_availability`; both matchers read it | Existing rules unchanged |
| Date override | Saved/displayed, but neither matcher read it | OPS-496 gives the scheduled Manila date precedence |
| Replacement save | Separate DELETE then INSERT; failure loses the old date | OPS-497 wraps replacement and provider lock in one transaction |
| Override validation | Format check accepts impossible dates | OPS-498 reuses the existing real-calendar-date validator |
| Customer `GET /bookings/:id/match` | Calls the simple matcher | Inherits OPS-496 |
| Automatic offer cycle | Calls the full matcher, optionally with subcategory | Inherits OPS-496 |
| Customer/admin direct assignment | Approval and overlap checks, but not the same complete eligibility contract | Still open; not changed here |
| Admin reassignment | Checks account activity, approval, instant availability, service/radius and overlap, but not weekly/date hours | Still open; not changed here |
| Outstanding offer acceptance | Checks booking/offer state, owner and expiry; no equivalent current-provider eligibility recheck | Still open; not changed here |
| Public provider search | Approved active accounts may remain discoverable while instant availability is off | Provider's “hidden from search” copy is inaccurate; separate follow-up |
| Provider 360 support | Inspected page/service references do not expose a weekly/date-override diagnostic workspace | Not claimed fully audited or implemented |

Existing D29 already identifies direct assignment as an unsafe substitute for a
preferred-provider offer. This checkpoint does not wire that endpoint into new UI,
implement D29's offer/fallback lifecycle or claim those wider gaps are resolved.

## Implementation boundaries

OPS-496 uses the existing provider/date lookup index and a shared SQL predicate
in both matchers. No date row means existing weekly behavior applies. A valid
custom window replaces weekly hours, including a normally nonworking day. An
explicit blocked date wins over a conflicting legacy window. An incomplete
legacy custom window cannot manufacture all-day availability. The instant toggle,
approval, category/radius filtering, ranking and existing inclusive time boundaries
remain in effect. The query uses the scheduled date in Asia/Manila, not UTC-today
or the server timezone. It does not cancel, reassign, reprice or refund anything.

OPS-497 keeps the existing complete-date replacement behavior. It locks the
provider row to serialize two saves even when no override exists yet, and commits
the delete plus insert together. A failed insert rolls back the previous date.
No global unique constraint is invented: migration 043's unique index only covers
all-day rows, so a generic date-key upsert would be incorrect. No production
backfill or cleanup of legacy rows is performed. Historical booking fields and
financial terms are outside this mutation.

OPS-498 rejects impossible dates at the request validator. Valid leap days remain
valid; the existing Manila-today and time-window rules are unchanged.

## Verification and honest limitations

OPS-498 failed against the old parser because `2099-02-29` was accepted. The
three-file RED attempt took 4.739 seconds: one genuine failing validator test and
two explicitly skipped database tests. After the corrections, the focused eight-
file run passed **45 tests / six suites**, with the same **two database skips**,
in 7.693 seconds. No local PostgreSQL behavior pass is claimed.

OPS-496 executes both actual matchers, with and without subcategory, against
real PostgreSQL fixtures and the actual migration-043 table/index definitions.
It exercises save/read-match/delete, weekly fallback, bounded custom hours,
instant-off and suspension exclusions, another owner's override, Manila-versus-
UTC date separation, incomplete/conflicting legacy windows, and unchanged stored
booking fields. It is not actual customer HTTP, full account/money authorization,
dispatch delivery, race-free offer acceptance, capacity/performance or full-schema
migration acceptance. Ranking settings are stubbed, not production configuration.

OPS-497 uses an actual failed-insert trigger to test rollback, then two real
concurrent writers held behind an observed provider-row lock. It checks one final
date window and unchanged other-owner rows. The isolated schema is generated,
restored and removed by the harness. Only localhost databases ending in `_test`
with `NODE_ENV=test` are accepted; CI fails rather than silently skipping if its
database contract is missing. These tests remain unverified until fresh CI runs.

API TypeScript and changed-file ESLint passed. The unchanged unique-ID gate
passed with 1,540 titled regressions. Actual CI execution must be recorded
before this candidate is accepted. Local Docker/PostgreSQL availability is not
treated as a reason to weaken tests or run them on the live database.

## Continue and release boundary

Do not call this “availability works end to end” yet. Finish the named database
tests, then fix truthful provider guidance, inspect every assignment transaction
and build a shared, locked eligibility check consistent with the recommended D29
direction. Recheck account restrictions, active service/market, working window,
existing-job duration/conflict, and competing offers at the actual assignment
boundary. Preserve existing accepted work and immutable financial evidence.
No admin bypass or automatic cancellation/refund is approved by a layout or
matching test. Until those checks and release rehearsals pass, publication stays
on the candidate branch; master/live alignment and client readiness remain open.
