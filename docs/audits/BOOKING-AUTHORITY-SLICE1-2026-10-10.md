# Booking status authority, Slice 1 (2026-10-10)

Claude Code continues the Stage 1 booking-authority work on PR81 (`codex/financials-operator-truth`). Each sub-slice below is finished and re-checked before the next one starts:

1. a failing test first;
2. the fix;
3. focused and full regressions;
4. gates;
5. an independent review;
6. exact-commit CI.

Owner questions that this slice does not answer are in `.ai-coder/decisions/D35-booking-status-authority-slice1.md`. Their held parts are not built.

**Test environment.** Local SQL tests run on a private PostgreSQL 17.9 test cluster on loopback (`127.0.0.1:55432`, database `onservice_test`). Live is PostgreSQL 17.5; CI uses PostGIS 18.

**Local load-timeout pattern.** A full parallel API run on this Windows machine times out in the same five SQL suites (token issuer, admin enable, email link HTTP, email link, email sign-in) and sometimes the paired web release suite. Each sub-slice re-runs those suites serially and records both results. The two nginx container suites need Docker, which is not available locally; CI runs them.

## S1-0: shared guarded fixture (commit `da01b001`)

**What changed.** No application change. The guarded PostgreSQL booking/refund fixture moved from `__tests__/refund-transaction-postgres.test.ts` into `__tests__/helpers/booking-participant-postgres.ts`:

- the moved lines are byte-identical apart from `export`, `refundIt` becoming `bookingIntegrationIt`, and paths one directory deeper;
- all 28 test titles and bodies are unchanged.

**Evidence:**

- refund suite 28/28;
- without a database: 27 skipped and 1 run;
- with `CI=1` and no database: the suite still refuses to load;
- Gate C 1640 titled regressions (unchanged);
- gate smoke tests 7/7;
- Gate A 10/10.

**Exact-commit CI.** CI `38009612782` and Gates `38009612795` both succeeded on `da01b001`.

- API job `114086319040`: 1,032/1,032 suites; 3,652 passed, 2 todo, 0 skipped. `refund-transaction-postgres.test.ts` passed against the CI PostGIS service.
- The admin, mobile and Docker jobs succeeded.

## S1-1: authority before disclosure (SEC-088, SEC-089)

### Defect, reproduced before the fix

The four outsider requests below were captured against unchanged code. Booking B was paid and unassigned, with service coordinates set. Booking A was paid and belonged to customer A.

| Request | Response before the fix |
|---|---|
| Unassigned provider marks booking B "arrived" from about 500 m away | `409 You must be within 200 meters ... Current distance: 500 meters.` |
| An unrelated customer does the same | the same 409, with the distance |
| An unrelated customer asks for `paid_out` on booking A | `409 Cannot transition from "paid" to "paid_out". Allowed transitions: ...` |
| An unassigned provider asks to complete booking B | `409 You must be on-site for at least 15 minutes ... Please wait 15 more minute(s).` |

**Cause.**

- The PATCH route ran the arrival radius and minimum on-site checks before calling the service, from an unlocked read (`routes/booking.routes.ts`, pre-fix lines 580-632).
- The service ran `canTransition`, whose 409 names the current status, before `validateRoleForTransition`.

**Also found.** The owner's own completion attempt from `paid` got the minimum-time message instead of the state-machine message, because the time check ran first.

### Fix

`transitionBookingStatus` now runs, in order:

1. lock the booking (`FOR UPDATE`);
2. actor guard;
3. state machine;
4. arrival radius check for `provider_arrived`;
5. minimum on-site time for `completed_by_provider`;
6. the existing checklist and photo gates;
7. the write.

Other points:

- **Same message texts.** The two checks moved verbatim into `assertArrivalWithinRadius` and `assertMinimumTimeOnSite`. They read the locked row, and the message texts are unchanged.
- **Which refusal shows first.** Because of the new order, a legitimate caller asking for a step that is not allowed now sees the state-machine or guard refusal first. Every such case was a refusal before and is still a refusal:
  - an assigned provider completing from `paid` or `provider_arrived` now gets the state-machine 409, not the on-site-time 409;
  - an assigned provider or admin asking for `provider_arrived` from a state that does not allow it, without coordinates, now gets the state-machine 409, not the 400;
  - a booking's own customer asking for a status customers cannot set now gets the guard's 403.
- **Every role still gets the checks.** They are not role-gated, so admin roles still get them, exactly as before.
- **Route.** It pre-reads only `status, escrow_status, is_hourly` for the unchanged post-transition money steps. It passes `{ latitude, longitude }` as a new trailing argument, so `completionNotes` stays positional.
- **Utility.** `haversineDistanceMeters` moved unchanged to `src/utils/geo.ts`.

### Tests

**New regression files** (guarded real SQL plus a mounted HTTP router):

- `bug-sec-088-arrival-distance-before-authority.test.ts`:
  - the regression: outsiders get 403 with no distance text, and the database snapshot is unchanged. This is checked both for a paid booking with no provider yet and for a booking assigned to another provider who is on the way, which exercises the guard's ownership lookup;
  - the assigned provider still gets the 400 "location required", the 409 with the distance, and 200 when within 200 m;
  - admin and super admin still face the 400 and the radius 409;
  - a booking without coordinates still answers 409.
- `bug-sec-089-state-before-authority.test.ts`:
  - the regression: outsiders get 403 with no status or timing text;
  - the assigned provider gets the state-machine 409 from `paid`, and the minimum-time 409 one minute into the job.

**Pinned tests updated:**

- `bug-ux-302-completion-clock.test.ts`: re-homed from the route (with a mocked service) to the real service function. The old seam would no longer reach the timer. Changes:
  - the title and scenario are kept;
  - the inverse case was added (an old `updated_at` with a fresh `work_started_at` must wait);
  - a route-level test was added: the real router over the real service returns 200 when a proof upload just changed `updated_at`.

  All three fail if the timer reads `updated_at`. Route forwarding of the location is covered end to end by the SEC-088 companion test, whose near-arrival returns 200.
- `services/booking-completion.test.ts`: the locked-row fixture gained `work_started_at`, so its checklist and photo assertions still run. The assertions are unchanged.

**Mutation checks.** Each one was applied temporarily, then reverted, and the file was confirmed byte-identical afterwards. Each made the named tests fail:

- timer reading `updated_at` instead of the start marker: UX-302 tests fail;
- arrival check before the guard: SEC-088 fails;
- state machine before the guard: SEC-089 fails.

### Verification

All results below are from the final tree, after the independent-review fixes.

- **Focused tests:** 8 suites, 52/52 tests, zero skips, on PostgreSQL 17.9. The suites are:
  - SEC-088 (4 tests), SEC-089 (2 tests) and UX-302 (3 tests);
  - the refund suite (28 tests);
  - the pinned booking completion, CRIT-N10, BUG-PHASE151-01 and MED-N68 tests.
- **Static checks:** API `tsc` passes, and eslint is clean on every changed file.
- **Gates:**
  - gate smoke 7/7;
  - Gate C passes, including money-in-transaction. The unique regression ids went from 1,640 to 1,642: SEC-088 and SEC-089 are new, and UX-302 keeps its title;
  - Gate A passes.
- **Full API run (final tree):** 1,027/1,034 suites passed and 3,643 tests passed. The failures were the two Docker-only nginx suites and load timeouts in the five SQL suites listed above. Serial re-run: 5/5 suites, 79/79 tests passed.
- **Earlier run.** An earlier full run on this slice, before the review fixes, also timed out `paired-web-release`: its child test run hit its spawn timeout while every subtest was passing. Its serial re-run passed.

### Independent review

No blockers. The review's should-fix items were applied:

- the wording above and in LAUNCH-LIMITATIONS 103 now says which refusal shows first;
- the route-level UX-302 test;
- the admin arrival-check test;
- the assigned-to-another-provider outsider case.

One suggestion was not applied: making `BookingRow.work_started_at` required breaks nine route casts against the route's separate `BookingRow` type. The field stays optional and the reason is commented. The lock query reads `SELECT *`, and the UX-302 tests catch a fallback to `updated_at`.

### Scope and limits

- **Not deployed.** Live still answers in the old order (LAUNCH-LIMITATIONS 103).
- **Minor leaks that remain** (older behavior, not changed here):
  - a booking id that does not exist answers 404, while someone else's booking answers 403;
  - an outsider's request briefly takes the booking row lock before the guard rejects it;
  - the guard skips its provider lookup for unassigned bookings, so response time hints whether a booking has a provider.
- **Unlocked pre-read** (older behavior, not changed here). The route's pre-read is still unlocked, and it still feeds the post-transition release and cancellation decisions. S1-5 replaces it for cancellation.
- **What is not yet tightened.** Which targets each role may request (admin exemption, flow-only targets) is S1-3 and S1-4. This step changes only the order of checks.
- **Authority lookups.** The guard's provider and staff lookups still use the shared pool while the booking lock is held. S1-2 moves them onto the transaction client.
