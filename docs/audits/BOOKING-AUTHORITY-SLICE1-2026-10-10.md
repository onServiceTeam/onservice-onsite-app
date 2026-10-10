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

### Exact-commit CI (commit `5b65a0c2`)

CI `38011724059` and Gates `38011724064` both succeeded.

- API job `114093012031`: 1,034/1,034 suites; 3,660 passed, 2 todo, 0 skipped. These suites passed against the CI PostGIS service:
  - `bug-sec-088-arrival-distance-before-authority`
  - `bug-sec-089-state-before-authority`
  - `bug-ux-302-completion-clock`
  - `services/booking-completion`
  - `refund-transaction-postgres`
- The admin, mobile and Docker jobs succeeded.

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
- **Authority lookups.** After S1-1 the guard's provider and staff lookups, and the completion gates, still used the shared pool while the booking lock was held. S1-2 moves them onto the transaction client.

## S1-2: authority and gates on the booking transaction (OPS-555)

### Defect, reproduced before the fix

`transitionBookingStatus` holds the booking row lock on one transaction connection. While holding it, four awaited lookups asked the shared pool for a second connection:

- the guard's provider ownership lookup;
- the guard's staff ownership lookup;
- the checklist completion gate;
- the after-photo gate.

When the pool has no free connection, every status change waits for one, times out and returns 500. With a one-connection pool (`max: 1`, `connectionTimeoutMillis: 1000`) on the fixture schema, these two legitimate requests both got `500 An unexpected error occurred`, and the server logged `timeout exceeded when trying to connect`:

- the approved staff performer moving booking A to `provider_en_route`;
- the assigned provider completing booking B (an hour on site, complete checklist, two after-photos).

The production pool has 10 connections by default (20 in the production env example; the live value is not verified). So roughly that many simultaneous provider status changes could make every request fail.

### Fix

- `validateRoleForTransition` now takes the transaction client as its first parameter and runs both ownership lookups on it.
- `getChecklistCompletionStatus` (checklist.service) and `countAfterPhotos` (booking-photo.service) accept an optional executor (default `db`), and the transition passes its client.
- Their other callers keep the default, so their behavior is unchanged.
- The lookups are plain SELECTs, so no row locks were added and the lock order is unchanged.

### Tests

**New file: `bug-ops-555-guard-pool-starvation.test.ts`.** It uses guarded real SQL, the mounted router and a temporary one-connection pool, which is restored in `finally`.

- Both requests above now return 200 and the statuses change.
- Wallets and the ledger are unchanged.
- The customer notices are written after commit, on the same single connection.
- The focused gate tables hold only what the gates read, plus ids and the uploader reference. The completion columns `completed_at` and `work_completed_at` were added because the completion write stamps them.

**Fixture error found and fixed.** The first run after the fix failed with `column "work_completed_at" does not exist`. This was a gap in the test fixture, not a product bug. After adding the columns:

- the test passes with the fix;
- against the S1-1 code (`5b65a0c2`) it fails 500/500 again, on the connection timeout.

**Pinned tests updated.** All three mocked the provider lookup on the pool. The lookup is now answered by the transaction client, and each assertion is stronger than before:

- `services/booking-completion.test.ts`:
  - the stale pool stubs and their outdated comment were removed;
  - the happy path asserts both gates receive the transaction client and that the pool is never used.
- `bug-ux-302-completion-clock.test.ts`:
  - the service-level tests assert the pool is never used;
  - the route test keeps a pool stub only for the route's after-commit lookup.
- `booking-provider-cancellation-accounting-med-n68.test.ts`:
  - the client step order gains the provider lookup;
  - the pool assertion changed from one call to none.

**Mutation checks.** Each one was reverted, and the file was confirmed byte-identical afterwards.

| Mutation | Tests that failed |
|---|---|
| Gates back on the pool | OPS-555 provider completion; booking-completion happy path |
| Provider lookup back on the pool | OPS-555, MED-N68 and booking-completion (7/7 in those files) |
| Staff lookup back on the pool | OPS-555 |

The independent reviewer also moved each gate onto the pool separately: either one alone fails the provider completion.

### Verification

- **Focused tests:** 10 suites, 67/67, zero skips, on PostgreSQL 17.9. They are OPS-555, SEC-088, SEC-089, the refund suite, UX-302, booking completion, CRIT-N10, BUG-PHASE151-01, MED-N68 and the checklist service.
- **Static checks:** API `tsc` passes, and eslint is clean on the changed files.
- **Gates:**
  - gate smoke 7/7;
  - Gate C passes, including money-in-transaction. The unique regression ids went from 1,642 to 1,643;
  - Gate A passes.
- **Full API run:** 1,028/1,035 suites passed and 3,645 tests passed. The failures were the two Docker-only nginx suites and the five load-timeout SQL suites. Serial re-run: 5/5 suites, 79/79 tests passed.

### Exact-commit CI (commit `810d62ca`)

CI `38013291302` and Gates `38013291258` both succeeded.

- API job `114097935320`: 1,035/1,035 suites; 3,661 passed, 2 todo, 0 skipped. `bug-ops-555-guard-pool-starvation` passed against the CI PostGIS service with its one-second connection timeout. So did `services/booking-completion`, `bug-ux-302-completion-clock`, `booking-provider-cancellation-accounting-med-n68` and `refund-transaction-postgres`.
- The first log download failed with a transient GitHub TLS timeout. The retry succeeded.
- The admin, mobile and Docker jobs succeeded.

### Independent review

No blockers.

**Applied:**

- this audit section;
- a fixture comment correction;
- a stale line-number comment in `checklist.service.ts`.

**Recorded, not changed here:**

- **Waitlist notice before commit.** The slot-waitlist notification (`processSlotAvailability`) is started inside the booking transaction, before the provider-cancellation counter update and before COMMIT, and nothing waits for it. If that later update fails, the cancellation rolls back, but waitlisted customers may already have been told a slot opened. This only affects `cancelled_by_provider` and `cancelled_by_admin`. Moving it after commit is in S1-5, which restructures the cancellation path.
- **Gate default executor.** The gates default to `db`. A future caller that holds a booking lock must pass its client; OPS-555 covers only the status transition.

## S1-3: admin roles on the general status route (SEC-090, SEC-091)

### Defect, reproduced before the fix

`validateRoleForTransition` returned immediately for `admin` and `super_admin`. Through `PATCH /api/v1/bookings/:id/status` either admin role could therefore request any transition the state machine allowed:

- a cancellation, which runs the cancellation refund;
- `confirmed`, which releases escrow;
- `paid`, which marks escrow held with no money received;
- `disputed`, `payout_ready`, `paid_out` and the others.

None of this needed the reason and `admin_actions` audit row that the super-admin-only admin routes require.

Captured against the S1-2 code (`810d62ca`):

| Role | Request on a paid, unassigned wallet booking | Result |
|---|---|---|
| plain admin | PATCH `cancelled_by_admin` | `200`; status `cancelled_by_admin`, escrow `refunded`, customer wallet back to 250,000 centavos (a full ₱1,000 refund), **0 admin_actions rows** |
| super admin | PATCH `cancelled_by_admin` | the same, with no reason and no audit row |

No admin web page calls this route. Every admin money action in the admin app uses the dedicated routes.

### This supersedes an earlier audit statement

`docs/audits/BOOKING-STATUS-ROLE-2026-10-09.md` (lines 15 and 47-48) recorded that the admin and super admin exemption was preserved. That statement no longer holds. The exemption is now limited to the targets D35 Q1 has not decided. The 2026-10-09 file is left unchanged, as history.

### Fix

The basis is F3 (`docs/operations/00-DECISIONS-FOR-KEN.md`): money controls belong to the super admin's audited admin actions. The open parts are listed in `.ai-coder/decisions/D35-booking-status-authority-slice1.md` Q1.

**Plain admin.** Refused with `403 Your admin role cannot make this booking change.` on 14 statuses:

- every cancel kind, `confirmed`, `paid`, `disputed`, `resolved`;
- `payout_ready`, `paid_out`;
- `completed_by_provider`, which starts the 24-hour automatic release;
- `requested`, `quoted`, `matched`, `payment_pending`.

It keeps the on-site steps `provider_en_route`, `provider_arrived` and `in_progress` (held, D35 Q1a).

**Super admin.** Refused with `409`, code `BOOKING_TRANSITION_FLOW_ONLY`, on every cancel kind, `confirmed`, `paid`, `disputed`, `requested`, `quoted`, `matched` and `payment_pending`. Those have audited admin actions (cancel, force complete) or their own participant flows.

It keeps these, held for D35 Q1b:

- the on-site steps;
- `completed_by_provider`;
- `payout_ready` and `paid_out` (today the only way to advance a booking after a manual escrow release);
- `resolved`.

**Why `resolved` is held.** The first version of S1-3 refused it. The independent review showed that would remove the only way out for a booking a customer marked `disputed` without a dispute record, which customers can do through this route until S1-4:

- every dispute resolution path needs the dispute record;
- cancel, force complete and release do not accept `disputed`.

It is held until Ken answers D35 Q1b.

**Other changes:**

- Any status not listed is refused by default.
- The held lists are module-level constants.
- The non-admin `cancelled_by_admin` message now reads "Only the admin cancel action can cancel a booking as admin."

### Tests

**New:**

- `bug-sec-090-plain-admin-status-money.test.ts`: the plain admin `cancelled_by_admin` on a paid booking gets 403 with the snapshot unchanged. All 14 refused targets get 403 from two different starting states.
- `bug-sec-091-super-admin-patch-bypasses-audited-flows.test.ts`:
  - **the regression:** a super admin `cancelled_by_admin` gets 409 FLOW_ONLY; `paid` on an unfunded `payment_pending` booking gets 409; all 10 refused targets get 409 FLOW_ONLY; the snapshot is unchanged;
  - **the audited cancel still works:** POST `/admin/bookings/:id/cancel` with a 10+ character reason gives 200, the full unassigned refund to the wallet, the reason on the booking, and one `booking_cancelled` audit row;
  - **held targets unchanged:** super admin `payout_ready`, `paid_out` and `in_progress` get 200; super admin `completed_by_provider` reaches the ordinary on-site time 409 (no FLOW_ONLY code); super admin `resolved` from `disputed` gets 200; plain admin `in_progress` gets 200; no wallet, ledger or payment-intent change.

**Renamed:** in `refund-transaction-postgres.test.ts`, "canonical admin and super-admin roles retain the existing explicit booking-operation exemption" is now "admin and super admin keep the on-site en-route step on the status route while D35 Q1 is open". The body is unchanged and still asserts both roles get 200 for en route.

**Pinned seam BUG-PHASE117-01.** The source-text test still finds the `cancelled_by_provider || cancelled_by_admin` waitlist block in `booking.service.ts`. After S1-3 the `cancelled_by_admin` arm is unreachable through PATCH. The dedicated admin cancel has never kicked the waitlist or emitted the admin socket event, so admin cancellations do not notify waitlisted customers. This is older behavior, left unchanged here and recorded for S1-8, where the admin cancel moves onto the shared cancellation core.

**Mutation checks.** Each one was reverted, and the file was confirmed byte-identical afterwards.

| Mutation | Tests that failed |
|---|---|
| Restore the old early return | SEC-090 and SEC-091 |
| Let plain admin request `cancelled_by_admin` | SEC-090 |
| Drop `payout_ready` from the super admin held list | the held-targets test |
| Drop `resolved` from the super admin held list | the held-targets test |
| Drop `completed_by_provider` from the super admin held list | the held-targets test |
| Drop `in_progress` from the shared held list | the held-targets test |

### Verification

Final numbers are recorded in the commit message of this step.

- **Focused tests:** SEC-090, SEC-091, SEC-088, the refund suite and BUG-PHASE117-01 pass 40/40.
- **Gates:**
  - gate smoke 7/7;
  - Gate C passes, including money-in-transaction. The unique regression ids went from 1,643 to 1,645;
  - Gate A passes.
- **Full API run (before the review fixes):** it matched the baseline, with only the Docker-only and load-timeout suites failing. The serial re-run passed 6/6 suites and 80/80 tests.

### Exact-commit CI (commit `f9f62950`)

CI `38015573010` and Gates `38015573084` both succeeded. All six Gates jobs (A to E and "All gates passed") succeeded.

- API job `114104958361`: 1,037/1,037 suites; 3,665 passed, 2 todo, 0 skipped. `bug-sec-090-plain-admin-status-money`, `bug-sec-091-super-admin-patch-bypasses-audited-flows` and `refund-transaction-postgres` passed against the CI PostGIS service.
- The admin, mobile and Docker jobs succeeded.

### Independent review

No blockers.

**Applied:**

- `resolved` held for the super admin, as above;
- the super admin `in_progress` and `completed_by_provider` held behavior is now pinned by a test;
- the BUG-PHASE117-01 seam is recorded;
- the plain admin message no longer claims a super admin action exists for every target;
- the stale non-admin message is corrected;
- the "today" comments are now "before SEC-090/091";
- the redundant role update is removed;
- SEC-090 now uses two starting states;
- the held lists are module-level.

**Recorded, not changed here:**

- the D35 Q1b note on `payout_ready` set while escrow is still held;
- the uppercase error code, which follows the plan; other codes in the codebase are lowercase.

## S1-4: participant statuses that belong to dedicated flows (SEC-092, OPS-556, SEC-093)

### Defect, reproduced before the fix

Through `PATCH /api/v1/bookings/:id/status` a customer or provider could request four statuses that only a dedicated flow should set. Each request was a valid step in the state machine, so the route accepted it.

Captured against the S1-3 code (`f9f62950`):

| Who | Request | Result before S1-4 | Why it matters |
|---|---|---|---|
| the booking's customer | `disputed` on a `completed_by_provider` booking | `200`; status `disputed`, escrow still held, no dispute record | every dispute resolution path needs the dispute record that POST `/api/v1/disputes` creates, so no dispute flow could resolve it |
| the booking's customer | `payment_pending` on a `requested` booking | `200`; status `payment_pending` | the wallet payment then refuses the booking (`payment.routes.ts:51`: it pays only bookings that can still move to `payment_pending`), so it can only be cancelled |
| the assigned provider | `quoted` on a `requested` booking | `200`; no quote row | quotes are created by quote submission |
| the assigned provider | `matched` on a `requested` booking | `200`; no accepted offer or quote | `matched` comes from offer or quote acceptance or admin assignment |

No app sends these statuses to this route:

- the customer app sends only `confirmed` and `cancelled_by_customer`;
- the provider and team-member apps send only the on-site steps, completion and cancel;
- disputes use POST `/api/v1/disputes`.

`transitionBookingStatus` has one caller, the PATCH route. The dedicated flows set their own statuses:

- `fileDispute` sets `disputed`;
- `submitQuote` sets `quoted`;
- offer acceptance and admin assignment set `matched`;
- `acceptQuote` sets `payment_pending`.

### Fix

The basis is the repair contract K07 `TRANSITION_ACTORS`. That contract is in the private repair folder, not in this repository. It marks ten statuses as set only by a dedicated flow:

- `requested`, `quoted`, `matched`;
- `payment_pending`, `paid`;
- `disputed`, `resolved`;
- `payout_ready`, `paid_out`;
- `cancelled_by_admin`.

In `validateRoleForTransition` (`booking.service.ts`) these are now the module constant `PARTICIPANT_FLOW_ONLY_TARGETS`.

**Customer.**

- The ownership check runs first.
- A flow-only status then gets `409`, code `BOOKING_TRANSITION_FLOW_ONLY`, message "This booking change can't be made from here."
- The customer keeps `cancelled_by_customer` and `confirmed`.
- The provider's steps stay `403 Customers cannot perform this action.`

**Provider.**

- The role filter lets flow-only statuses through, so that the SEC-076 assignment checks answer first.
- After the assignment checks, a flow-only status gets the same `409` FLOW_ONLY.
- The provider keeps the on-site steps, completion and `cancelled_by_provider`.
- `confirmed` and `cancelled_by_customer` stay `403 Providers cannot perform this action.`

**The admin-cancel check moved.** The non-admin `cancelled_by_admin` refusal ran before every role branch. It now runs after the customer and provider branches, so it applies to team members and other roles exactly as before. For a customer or provider, `cancelled_by_admin` is a K07 flow-only status like the others.

**Team members are unchanged**, as the Slice 1 plan requires. K07 also gives them the flow-only answer for these statuses. Their refusals stay `403` for now.

**Two changes after the self-check and the review:**

1. **Assignment check first.** The first version refused `quoted` and `matched` before the assignment check. A provider not on the job therefore got the new 409 instead of "You are not assigned to this booking." The refusal now comes after that check, matching the customer branch, and both bug tests pin the order.
2. **The whole K07 set.** The second version refused only the four statuses that used to slip through. The other flow-only statuses kept the old 403: six for customers and eight for providers. The review pointed out that the plan asked for the K07 answer and for a 17-status check, which did not exist. Both are now built.

Refused statuses still change nothing. For the flow-only statuses that were already refused, only the status code and message change (from 403 to 409), and no app sends them. Another customer, or a provider not on the job, still gets a 403; it is now the "your own bookings" or "not assigned" message.

### Tests

**New bug tests.** Each runs the real router on the guarded PostgreSQL fixture and asserts that the whole participant snapshot is unchanged.

- `bug-sec-092-customer-dispute-bypass.test.ts`:
  - the customer gets the 409 FLOW_ONLY code and message on `disputed`;
  - another customer gets `403 You can only manage your own bookings.`
- `bug-ops-556-customer-payment-pending-strand.test.ts`:
  - the customer gets 409 FLOW_ONLY on `payment_pending`;
  - the booking stays `requested`.
- `bug-sec-093-provider-flow-only-targets.test.ts`:
  - the assigned provider gets 409 FLOW_ONLY on `quoted` and `matched`;
  - a provider not on the job gets `403 You are not assigned to this booking.`

All four requests are valid next steps in the state machine from the states the tests use, and the role check runs before the state check. So the refusal comes from the new code, and each test also asserts its code.

**New acceptance check** (no Bug title). `booking-participant-status-targets-postgres.test.ts` sends all 17 statuses for both a customer and a provider on their own `paid_out` booking, which has no next step. It classifies each answer by its exact status code, error code and message:

- **allowed:** the state machine's own 409, with no code;
- **flow-only:** the 409 FLOW_ONLY;
- **other role:** the 403.

The status list is checked against `VALID_TRANSITIONS`, so a new status fails the test until someone classifies it. The snapshot is unchanged.

**Mutation checks.** Each one was reverted, and the file was confirmed byte-identical afterwards.

| Mutation | Tests that failed |
|---|---|
| Remove `paid` from the flow-only list | acceptance check |
| Remove `cancelled_by_admin` from the flow-only list | acceptance check |
| Let the provider role filter refuse flow-only statuses with 403 | acceptance check, SEC-093 |
| Allow providers to request `confirmed` | acceptance check |
| Remove the customer flow-only refusal | acceptance check, SEC-092, OPS-556 |
| Remove the provider flow-only refusal | acceptance check, SEC-093 |
| Move the provider refusal before the assignment check | SEC-093 |
| Move the customer refusal before the ownership check | SEC-092 |
| Allow customers to request `provider_arrived` | acceptance check |

Against the S1-3 code, the three bug tests failed with 200 where 409 was expected. A first round of six mutations on the earlier version was also caught.

### This supersedes an S1-3 statement

The S1-3 section above ("Other changes") says the non-admin `cancelled_by_admin` refusal reads "Only the admin cancel action can cancel a booking as admin." After S1-4, only team members and other roles get that message. Customers and providers get the flow-only 409. The S1-3 text is left unchanged, as history.

### Verification

- **Focused tests:** 14 suites, 56/56 passed, with zero skips. They are:
  - the acceptance check, SEC-088 to SEC-093, OPS-555, OPS-556;
  - `refund-transaction-postgres` and BUG-PHASE117-01;
  - `services/booking-completion`, `bug-ux-302-completion-clock` and `booking-provider-cancellation-accounting-med-n68`.
  - Re-run on the final wording: 14/14 suites, 56/56 passed.
- **API `tsc` and eslint** on the changed files: clean.
- **Gates:**
  - gate smoke 7/7;
  - Gate C passes, including money-in-transaction. The unique regression ids went from 1,645 to 1,648. The acceptance check has no Bug title, so it adds none;
  - Gate A passes.
- **Full API run, first version:** 1,034/1,040 suites. The failures were the two Docker-only nginx suites and four load-timeout suites. In the serial re-run, three of the four passed. `token-issuer-transaction-postgres` timed out on two tests while the reviewer was also using the test database. It then passed 5/5 on two further solo runs. It does not touch booking code.
- **Full API run, K07 version:** 1,034/1,041 suites. The failures were the two Docker-only suites and the five load-timeout suites (admin enable, token issuer, email link HTTP, email link, email sign-in). The serial re-run passed 5/5 suites and 79/79 tests.

### Exact-commit CI (commit `c8f54e0a`)

CI `38018420218` and Gates `38018420161` both succeeded, including all six Gates jobs.

- API job `114113813081`: 1,041/1,041 suites; 3,669 passed, 2 todo, 0 skipped. These passed against the CI PostGIS service:
  - `booking-participant-status-targets-postgres`
  - `bug-sec-092-customer-dispute-bypass`
  - `bug-ops-556-customer-payment-pending-strand`
  - `bug-sec-093-provider-flow-only-targets`
- The admin, mobile and Docker jobs succeeded.

### Independent review

Two passes, read-only. No blockers and no code defects in either.

**First pass, applied:**

- The plan asked for the K07 answer and a check of all 17 statuses for each participant role. Both are now built, as above.
- The OPS-556 comment wrongly said the wallet route pays quote-matched bookings. It now says it pays requested and matched bookings.
- The OPS-556 comment now says its fixture booking is already paid, and only its status is reset.

**First pass, confirmed:**

- No app, Maestro flow, script or seed sends the removed statuses.
- Each dedicated flow sets its own status.
- No existing test asserted the old behavior.
- No booking is left without a way forward.

**Second pass, applied:**

- The message no longer suggests the person has a step to take. Some flow-only statuses are set only by support or the system.
- The supersession of the S1-3 statement is recorded above.

**Second pass, confirmed:**

- Moving the admin-cancel check does not change team-member, other-role or admin behavior.
- Nothing new is disclosed to a stranger.
- No acceptance-check row can pass for the wrong reason.
- The code matches K07 `TRANSITION_ACTORS` exactly for customers and providers.

### Scope and limits

- **Not deployed.** Live still accepts these four requests.
- **Before release, count on live with a read-only query** the bookings that may have been created through the old shortcut:
  - `disputed` with no dispute record;
  - `payment_pending` with no payment intent;
  - `quoted` with no quote.
  The super admin `resolved` step held for D35 Q1b remains the way out for the first kind.
- **K07 error codes not sent yet:** `BOOKING_NOT_OWNER`, `BOOKING_NOT_ASSIGNED_TO_ACTOR` and `BOOKING_INVALID_TRANSITION`. They belong to the later K07 guard replacement. When they land, the acceptance check's "allowed" and "other role" rows, which require no error code, must be updated.
- **K07 also makes the ten statuses flow-only for every role.** Team members and other roles still get 403 for them (team members are unchanged by the Slice 1 plan), and so does a plain admin (SEC-090, F3).
- **An old manual audit script expects the old behavior.** `.ai-coder/phase-15-real-audit/test-phase21-money-flow.mjs:151` expects a customer PATCH from `matched` to `payment_pending` to succeed. CI does not run it. It is left unchanged, as history.
- **Ken has not reviewed the message wording.** No app shows it.

## S1-5: one-transaction PATCH cancellation (FIN-009, FIN-010)

### Defect, reproduced before the fix

Through `PATCH /api/v1/bookings/:id/status`, a cancellation ran in two separate transactions:

1. `transitionBookingStatus` committed the status, `cancelled_at`, `cancellation_reason` and the provider counters.
2. The route then ran the cancellation money in a second transaction through `escrowService.handleCancellation`. It did so only when an **unlocked pre-read** had seen `escrow_status = 'held'`.

Captured against `c8f54e0a`:

| Case | Result before S1-5 |
|---|---|
| **FIN-009.** Customer cancels a paid wallet booking with no immutable terms row (paid before migration 162, not yet through the E50 Legacy Review) | `207` "cancellation recorded, refund within 48 hours". The booking was `cancelled_by_customer`, escrow stayed `held`, and nothing was queued. |
| **FIN-009, second case.** Customer cancels a booking whose provider does not match its terms | The same `207`, with the same stranded money |
| **FIN-010.** Customer cancels an unfunded booking while a wallet payment holds its lock; the payment commits first | `200`. The booking was cancelled with escrow `held` and the wallet still debited: the money step trusted the `pending` it had read before the lock. |

Also before S1-5:

- **Announcements before commit.** The admin socket event and the slot-waitlist kick were sent inside the transaction, before the commit.
- **Notification errors.** The route's notification was not wrapped, so a notification error answered 500 for a status change that had committed.

### Fix

**New `services/booking-cancel.service.ts`.** Its shape follows the repair contract K07 `cancelBooking`, without the K01 ledger, K02 outbox and K08 idempotency parts, which do not exist yet. It runs on the caller's transaction, after the booking lock, the actor guard and the state machine:

1. When the **locked** row's `escrow_status` is `held`, it runs `escrowService.handleCancellationInTransaction`. Its refusals throw and roll everything back: missing terms, terms mismatch, already processed, or insufficient escrow.
2. It writes `status`, `updated_at`, `cancelled_at` and, when given, `cancellation_reason`. It returns the updated row, which already carries the new `escrow_status` because the money step ran first.
3. For `cancelled_by_provider`, it updates the MED-N68 provider counters, moved here unchanged.

**Money inputs (C-20).** `participantCancellationMoneyInputs` derives the hours from the locked `scheduled_at` and the app clock, as the route did. "Provider arrived" comes from the locked status, using the route's old set. The admin cancel (S1-8) will pass its own audited inputs.

**`transitionBookingStatus`.**

- Cancel targets go to the core.
- After the commit, in this order:
  1. the gateway step;
  2. the log line;
  3. the admin socket event;
  4. the slot-waitlist kick.

  So a rolled-back change is never announced or refunded at the gateway, and nothing after the commit can skip the gateway step (C-19).
- A gateway-step failure is logged and never turns the committed cancellation into an error.
- The return type is unchanged.

**`escrow.service.ts`.** The post-commit part of `handleCancellation` is extracted unchanged as `processCancellationGatewayRefund`. `handleCancellation` stays as a thin wrapper with unchanged behavior: three unit-test files cover it, but it has no production caller now.

**`booking.routes.ts`.**

- The cancel-money block and the 207 response are deleted; `grep 207` on the route returns nothing.
- The pre-read SQL text stays, because the confirm path and the CRIT-N10 mock need it (C-17).
- The notification is wrapped, so a committed change answers 200 (C-19).

**Deliberately left out of the core: the `actor`.** The plan's signature named one. For customers and providers the target status already says who cancelled. An actor or responsible party will be added with the E81 / D-03 decision or in S1-8.

### Tests

**Bug tests**, red against `c8f54e0a`, then green:

- `bug-fin-009-cancel-money-failure-207.test.ts`:
  - a third booking funded with the fixture's real money helpers and no terms row gets `409` with the missing-terms message, and the participant snapshot is unchanged;
  - the second assertion, the provider/terms mismatch, gets `409` with the mismatch message, also unchanged.
  - Red: 207.
- `bug-fin-010-cancel-after-concurrent-payment.test.ts`:
  - a blocker connection holds the booking lock;
  - the cancel waits, observed through `pg_blocking_pids`;
  - the blocker funds the booking with the real helpers and terms, then commits;
  - expected: 200, `refunded`, the wallet restored to 150,000, the booking's escrow ledger summing to 0, and the payment record refunded.
  - Red: escrow stayed `held`.
  - The concurrent payment uses the real money helpers on a blocker connection, not the HTTP payment route.

**Supporting tests** (no Bug title) in `booking-cancellation-transaction-postgres.test.ts`, on booking B (price 800,000, fee 200,000, scheduled 10 hours ahead, so the snapshotted 75% bracket applies):

1. A customer cancel commits a 600,000 refund plus the 200,000 fee to the wallet, 200,000 compensation to the provider, escrow `partially_refunded` with 0 left, and the payment record `partially_refunded` 800,000. It saves the reason and time and notifies the provider.
2. A provider cancel commits the same money, the counters (1 and 1, stamped), and notifies the customer.
3. A failed payment refund call after the commit still answers 200 and queues one `process_payment_refund` retry of 800,000.
4. A failure of the whole post-commit refund step still answers 200 and is logged for manual reconciliation.
5. A notification failure after the commit still answers 200 with the money done. Before S1-5 the unwrapped notification error went to the error handler, which answers 500 (read from the code). The matching mutation, re-throwing from the new catch, fails this test.
6. **Added after the review.** When a later step in the same transaction fails (a check constraint on the provider counter, after the refund and compensation were written), the response is 500 and the whole snapshot is unchanged.
7. **Added after the review.** An unpaid `requested` booking cancels with no reason: 200, `cancelled_at` set, reason NULL, and no money, payment, retry or notification change.

**What proves the one-transaction behavior.** Tests 1, 2 and 3 pin the final money state and would also pass against the old two-transaction code; test 1 differs only in the response's `escrowStatus`. The proof that money and status commit or roll back together is FIN-009, FIN-010 and test 6.

**Strengthened.** `booking-provider-cancellation-accounting-med-n68.test.ts` now asserts that a committed cancellation is announced once (socket event and waitlist kick), and that a rolled-back one is never announced. Against the old code, the new assertion failed: the event was emitted inside the failed transaction.

**Must-stay-green, all passing:**

- the `refund-transaction-postgres` owner-cancel test (100% including the fee, payment record refunded, no notice);
- the SEC-076, SEC-077 and SEC-078 snapshots;
- BUG-PHASE117-01 (the waitlist source text is unchanged);
- BUG-PHASE151-01;
- CRIT-N10;
- `escrow-async-integration` `handleCancellation`;
- `booking-cancel-admin-tx`;
- `booking-dispute-admin`.

**Mutation checks.** 15 distinct mutations in 17 runs, each reverted, with the files confirmed byte-identical afterwards. Every one failed at least one test:

- skip the money step;
- write the status before the money step;
- swallow money refusals;
- skip the post-commit gateway step;
- drop the counters;
- re-throw from the notification catch;
- re-throw from the gateway catch;
- pass a zero fee to the gateway step;
- force "provider arrived";
- force 48 hours;
- never save the reason;
- never stamp `cancelled_at`;
- swallow a counter failure;
- move money for unfunded bookings;
- run the old `booking.service.ts` against the strengthened MED-N68.

The reason and `cancelled_at` breaks were each run twice, before and after the new tests, which makes 17 runs. The table of which tests failed is in the private session record (`claude-slice1/S1-5-MUTATIONS.md`).

**One process note.** A mutation run was interrupted when the session restarted. One mutated file (the reason never saved) was found and restored, and checked byte for byte, before anything else. The local test database had crashed at the same moment. It was restarted with its original settings and recovered cleanly; every result after that was re-run.

### Verification

- **Focused tests:** the S1-5 set (FIN-009, FIN-010, the supporting file, `refund-transaction-postgres`, MED-N68) passes 5 suites, 38/38, with zero skips. Before the review fixes, a wider set of 21 suites (159 tests) also passed. The full runs below include all of them.
- **API `tsc` and eslint** on the changed files: clean.
- **Gates:**
  - gate smoke 7/7;
  - Gate C passes, including money-in-transaction. The unique regression ids went from 1,648 to 1,650;
  - Gate A passes;
  - `grep -n 207` on the route returns nothing.
- **Full API run, before the review fixes:** 1,038/1,044 suites. The failures were the two Docker-only nginx suites and four load-timeout suites. The serial re-run passed 4/4 suites and 74/74 tests.
- **Full API run, final:** 1,036/1,044 suites. The failures were the two Docker-only suites, the five load-timeout suites and the paired web release suite. The serial re-run passed 6/6 suites and 80/80 tests.

### Exact-commit CI (commit `9b75d593`)

CI `38029471364` and Gates `38029471381` both succeeded, including all six Gates jobs.

- API job `114147178510`: 1,044/1,044 suites; 3,678 passed, 2 todo, 0 skipped. These passed against the CI PostGIS service:
  - `bug-fin-009-cancel-money-failure-207`
  - `bug-fin-010-cancel-after-concurrent-payment` (the real blocker-connection race)
  - `booking-cancellation-transaction-postgres`
  - `booking-provider-cancellation-accounting-med-n68`
  - `refund-transaction-postgres`
  - `booking-confirmation-tx-crit-n10`
  - `bug-phase117-01-slot-waitlist-manila-date`
- The admin, mobile and Docker jobs succeeded.

### Independent review

**Five read-only reviewers**, each with one lens: money, concurrency, callers and clients, test quality, and plan/contract alignment. A skeptic then tried to refute each serious finding. The result: **no code defects**, and 3 findings that the skeptics confirmed but downgraded to notes, plus 10 notes.

**Applied:**

- The gateway step now runs first after the commit, as the design and C-19 require. Before, it ran after the announcements; that was safe in practice, because `scheduled_at` is NOT NULL and the waitlist kick is asynchronous, but now it is guaranteed.
- Supporting tests 6 and 7.
- D35 Q7 is widened. The refusal of legacy or mismatched bookings reaches the **provider's** job screen as well as the customer's booking screen. Both server messages are internal text. Q7 now asks for customer and provider wording, and asks how support handles a provider who cannot attend such a job.

**Recorded, not changed (see Scope and limits):**

- tests 1 to 3 also pass against the old code;
- the C-02 lock note;
- the crash window;
- the 0% fee gap;
- notifications and events for all statuses;
- the omitted actor.

### Scope and limits

- **Not deployed.** Live still cancels in two steps and can answer 207.
- **Release precondition (C-22, D35 Q7).** Customer and provider cancels of unreviewed legacy bookings, and of mismatched ones, are now refused with internal server text. Approved wording for both roles is needed before release. The admin cancel already refused these bookings.
- **Release precondition (C-04, E50).** The Legacy Review of already-paid bookings is already a release gate. After S1-5, the remaining exposure is bookings paid on live between the inventory and the cutover.
- **Pre-existing, not introduced here: the fee leaves escrow but is never sent back through the gateway.** This happens when a cancellation's price refund is 0%. The service fee is still taken out of escrow as a refund (and credited to a wallet payer), but the gateway step runs only when the price refund is above 0. So a card or PayMongo payer would not get the fee back, and the payment record would not show it. The same pattern is in `booking-admin.service.ts` (admin cancel). There is no exposure today, because the customer fee is 0 and external payments are off (E14). Follow-up: gate the gateway call on the amount actually refunded.
- **A crash or lost acknowledgement between COMMIT and the gateway step leaves no retry row.** If both the gateway refund and its retry queueing fail, the only trace is a log line. Both are as before S1-5. The admin refund path already writes its payment-only row inside its transaction. The K01/K02 outbox closes this for cancellations.
- **C-02.** The existing lock inversion with a provider suspension (booking, then providers, against users, providers, bookings) now waits on the providers row while the cancel holds the platform escrow wallet lock. Other money operations can therefore stall up to the deadlock timeout (about 1 second) before PostgreSQL aborts one side. Atomicity holds: the loser rolls back fully. The lock order is kept as planned; the lock-graph item covers this path.
- **The notification wrap and the post-commit admin event apply to every PATCH status, not only cancellations.** This partly addresses SS-13 for the PATCH path. It stays open for the admin cancel (S1-8) and for durability (K02).
- **`handleCancellation` has no production caller.** It is kept as a wrapper for its tests and as the shared shape S1-8 can reuse.
- **Partially refunded and released escrow are not refused yet.** Cancellations of these are refused in S1-6.

## S1-6: cancellations of bookings whose escrow already moved (FIN-011)

### Defect, reproduced before the fix

The cancellation core from S1-5 moved money only when the locked escrow was `held`. For any other escrow state it cancelled and moved nothing. Two of the five escrow states the database allows mean money has already moved.

Captured against `9b75d593`, with both states produced through the real super-admin routes:

| State | How it happens | Result before S1-6 |
|---|---|---|
| `partially_refunded` | A support partial refund: `POST /api/v1/admin/bookings/:id/escrow/refund`, 25,000 of booking A's 100,000 | The customer's cancel answered `200`. The booking became cancelled with 75,000 still in its escrow ledger, and no step left that would ever move it. |
| `released` | A manual release: `POST /:id/escrow/release` on a `paid` booking. The status stays `paid` (PL-01). | The cancel answered `200`. The booking became cancelled with no refund, after the money had been paid out. |

### Fix

In `cancelBookingInTransaction`, before the money step, two refusals:

- **`partially_refunded`:** `409 BOOKING_CANCEL_PARTIALLY_REFUNDED`, "This booking already had a partial refund. Please contact support to finish cancelling it."
- **`released`:** `409 BOOKING_CANCEL_ESCROW_RELEASED`, "Payment for this booking was already released. Please contact support."

Both refusals change nothing.

**All five escrow states (C-21):**

- `pending` (never funded) and `refunded` (nothing left) still cancel without moving money;
- `held` runs the refund;
- the two moved states are refused.

**Wording.** It is the interim proposal in D35 Q4 and Q11, and Ken has not approved it. Error codes are included, so the apps can map approved wording later.

**Scope.** The plan's FIN-011 named only the partial refund. Challenge item C-21 asked for `released` to be refused the same way, so FIN-011 covers both: a cancellation that treats already-moved money as if it were still held.

### Tests

**`bug-fin-011-partially-refunded-cancel-strand.test.ts`.** Booking A goes to `partially_refunded` through the real refund route, and booking B goes to `released` through the real release route. The release needs the production `provider_suspended_during_booking_at` column and the `manual_escrow_release` audit verb, which the test adds to the shared fixture. The test checks:

- the customer's cancel of A gets 409 with code and message;
- the customer's cancel of B gets 409 with code and message;
- provider B's cancel of B gets the same 409, because providers reach these refusals too;
- the whole snapshot is unchanged.

Then support refunds the remaining 75,000 of A, so its escrow is `refunded` with 0 left. The customer's cancel then answers 200, with no wallet, ledger, payment or retry change, and the wallet is back at 250,000.

**Red against `9b75d593`:** the first refusal answered 200 (line 74).

**Mutations.** Each was reverted, and the file was confirmed byte-identical afterwards.

| Mutation | Failed |
|---|---|
| Drop the partial-refund refusal | FIN-011 (customer cancel of A) |
| Drop the released refusal | FIN-011 (customer cancel of B) |
| Also refuse `refunded` | FIN-011 (the final cancel of A) |
| Also refuse `pending` | the S1-5 unpaid no-reason cancel test |
| Swap the two codes | FIN-011 |
| Refuse `released` for customers only | FIN-011 (provider cancel of B, line 88) |

**Must-stay-green, all passing:**

- FIN-009 and FIN-010;
- the S1-5 supporting tests;
- `refund-transaction-postgres`;
- MED-N68.

### Verification

- **Focused tests:** 6 suites, 39/39.
- **API `tsc` and eslint** on the changed files: clean.
- **Gates:**
  - gate smoke 7/7;
  - Gate C passes, including money-in-transaction. The unique regression ids went from 1,650 to 1,651;
  - Gate A passes.
- **Full API run:** 1,037/1,045 suites. The failures were the two Docker-only suites and six load-timeout suites. The serial re-run passed 6/6 suites and 80/80 tests.

### Exact-commit CI (commit `a590b020`)

CI `38033638427` and Gates `38033638412` both succeeded, including all six Gates jobs.

- API job `114159487204`: 1,045/1,045 suites; 3,679 passed, 2 todo, 0 skipped. `bug-fin-011-partially-refunded-cancel-strand`, with the real refund and release routes, passed against the CI PostGIS service.
- The admin, mobile and Docker jobs succeeded.

### Independent review

**Three read-only reviewers**, each with one lens: money and state coverage, callers and wording, and tests and plan alignment. A skeptic then tried to refute each serious finding. The result: **no code defects**.

**Applied:**

- **The provider path is now pinned in FIN-011**, with a mutation to match.
- **D35 Q4 is rewritten.**
  - It splits support partial refunds (the open question) from dispute partial refunds, whose remainder the dispute design already sends to the provider (C-05).
  - It says who reaches the refusal now (customer and provider) and from S1-8 (admin).
  - It adds provider wording.
- **D35 Q11 is corrected.** It had said a released booking "can be disputed". It cannot: the refusal fires only at `paid` or `provider_en_route`, and disputes open only after completion, while no admin refund is possible on an empty escrow. Q11 now asks for customer and provider wording, plus two decisions:
  - whether an admin cancel of a released booking stays allowed (moving no money) or is refused, needed before S1-8;
  - the pre-existing money question that releasing before the job leaves no refund path.
- **The S1-8 plan row now carries:**
  - the T13 change (admin cancel of `resolved` or `paid` bookings whose escrow is `partially_refunded` or `released`);
  - that the released-booking choice must be passed into the core explicitly, with its own test, rather than inherited;
  - an admin-specific refusal text.

**Refuted:** that the T13 / S1-8 carry-forward was never written. It is tracked in the slice order, and is now written there in full.

### Scope and limits

- **Not deployed.**
- **The admin cancel is not on the core until S1-8.** Until then, an admin cancel of a partially refunded booking still cancels and leaves the rest in escrow. "Please contact support" therefore depends on support refunding or releasing the rest first. Ship S1-6 only together with S1-8, or brief support.
- **Release precondition.** Approved customer and provider wording (D35 Q4 and Q11).
- **Raised, not changed.** A manual release before the job is done leaves no refund path for that booking (D35 Q11 decision 2). This is older than Slice 1.

## S1-7: a cancellation closes the booking's open offers (OPS-557)

### Defect, reproduced before the fix

Nothing closed a booking's provider offers when it was cancelled. `cancelOpenOffers` existed, but no code called it.

Captured against `a590b020`, with the real offers table (migration 125): a customer cancels booking A, which has a pending offer to provider A. The cancel answers `200`, and the offer row stays `pending`. It stayed that way until it expired; the expiry sweep then marked it expired and tried to restart the offer cycle for a cancelled booking, which the cycle refused.

`acceptOffer` re-checks the locked booking and refuses `cancelled_*`, so no provider could actually take the job, and no money moved.

### Fix

**`booking-offer.service.ts`.** New `cancelOpenOffersInTransaction(client, bookingId)` closes the booking's `pending` offers: `cancelled`, with `responded_at`. `cancelOpenOffers` now delegates to it.

**`booking-cancel.service.ts`.** The cancellation core calls it as its last step, on the booking's transaction, and returns `offersCancelled`. The lock order is booking, then offers, the same as `acceptOffer`.

### Tests

**`bug-ops-557-cancel-leaves-offers-open.test.ts`:**

- A refused cancellation (the FIN-009 no-terms booking, asserted by its exact message) leaves its pending offer pending, with the whole snapshot unchanged.
- A customer cancel of booking A closes A's pending offer.
- A's already-declined offer and booking B's pending offer are untouched.
- **Red against `a590b020`:** the offer stayed `pending` (line 56).

**Shared fixture.** `withParticipantRefundDatabase` now runs migration 125, and `participantSnapshot` includes `booking_offers`. Every snapshot-based refusal test therefore also proves no offer changed.

**Pinned test changed (C-18).** In `booking-provider-cancellation-accounting-med-n68.test.ts`, the mocked client sequence gains the offers UPDATE as the fifth step. The test now asserts the step runs on the transaction client with the booking id, and that the rollback case never reaches it.

**Mutations.** Each was reverted, and the files were confirmed byte-identical afterwards.

| Mutation | Failed |
|---|---|
| Never call the offers step | OPS-557, MED-N68 |
| Close every offer on the booking, not only pending ones | OPS-557, MED-N68 |
| Close the offers on a pool connection instead of the transaction | MED-N68 |
| Close every pending offer on every booking | OPS-557 |

### Verification

- **Focused tests.** 16 suites, 55/55 passed: OPS-557, MED-N68, every S1-1 to S1-6 suite and `refund-transaction-postgres`. After the review fixes, OPS-557 and MED-N68 were re-run and passed.
- **API `tsc` and eslint** on the changed files: clean.
- **Gates:**
  - gate smoke 7/7;
  - Gate C passes, including money-in-transaction. The unique regression ids went from 1,651 to 1,652;
  - Gate A passes.
- **First full API run: invalid, not counted.** After the computer restarted, OneDrive syncing this repository and two antivirus scanners slowed every new database connection to about 1 second. In that run, 95 suites failed at fixture setup with "connection timeout", before reaching any test code.
- **Full API run, 4 workers:** 1,032/1,046 suites. The failures were the two Docker-only suites, eleven sign-in and admin-auth SQL suites that timed out, and the backup suite (OPS-475).
  - In the serial re-run, 9 of those 12 passed.
  - Three still failed locally:
    - `email-sign-in-postgres` and `email-link-postgres`, at fixture connection timeouts;
    - OPS-475, when Windows refused to delete its temporary folder ("EPERM").
  - With a 60-second per-test limit the same three still failed, for the same environmental reasons.
  - None of the three imports any file S1-7 changed, directly or through a fixture. GitHub CI on Linux is the authority for them; see the exact-commit CI receipt.

### Exact-commit CI (commit `572ae3c5`)

CI `38040394447` and Gates `38040394446` both succeeded, including all six Gates jobs.

- API job `114179309695`: 1,046/1,046 suites; 3,680 passed, 2 todo, 0 skipped.
- `bug-ops-557-cancel-leaves-offers-open` and the changed `booking-provider-cancellation-accounting-med-n68` passed.
- The three suites that could not run locally also passed on CI's Linux runner: `email-sign-in-postgres`, `email-link-postgres` and `bug-ops-475-complete-backup-required`. This confirms the local failures were environmental.
- The admin, mobile and Docker jobs succeeded.

### Independent review

**Two read-only reviewers**, each with one lens: behaviour and concurrency, and tests and plan alignment. A skeptic then tried to refute the serious finding. The result: **no code defects**.

**Applied:**

- The OPS-557 refused case now asserts the FIN-009 message, so it cannot pass for another 409.
- The code comment no longer suggests that the provider's app stops showing the offer.

**Recorded (open, not built in S1-7):**

1. **The offer-cycle race (K06 step 2).** `kickOfferCycle` checks the booking status from an unlocked read and inserts the offer later, with no re-check. It is called from the decline route, the expiry sweep's re-kick and `dispatchPaidBookingIfNeeded`. An offer cycle that overlaps a cancellation can still add one pending offer to the cancelled booking, and push "New job available" to that provider. `acceptOffer` refuses it, and the sweep expires it within 45 seconds; nothing is assigned and no money moves. OPS-557 is therefore closed for **the cancellation's own offers**, not for a racing offer cycle. The plan scopes `kickOfferCycle` to the K06 work.
2. **The provider's app is not told the offer closed.** No `offer:cancelled` event exists. The offer sheet runs its 45-second countdown, and Accept answers the same 409 as before. Closing it in the app is K02/K06 work.
3. **Other cancellation paths do not close offers yet:**
   - the admin cancel, which S1-8 moves onto this core;
   - the 72-hour unmatched-expiry worker;
   - any other direct `cancelled_*` writer outside the core.

   K07 says the single cancellation entry should be the only writer of a cancelled status.
4. **Repeat offers after a direct assignment.** `kickOfferCycle` has no `provider_id` check. This stays out of scope, as the plan says.

### Scope and limits

- **Not deployed.**
- **The four open items above.**

## S1-8: the admin dedicated cancel runs on the cancellation core (FIN-012, OPS-558)

### Defect, reproduced before the fix

`cancelBookingAsAdmin` (`POST /api/v1/admin/bookings/:id/cancel`, super admin only) decided everything from an **unlocked pre-read**, made before its transaction:

- whether the booking could be cancelled from its status;
- whether its escrow was `held`.

Captured against `572ae3c5`. In both cases a blocker connection holds the booking lock while the admin cancel waits on it.

| Case | Result before S1-8 |
|---|---|
| **FIN-012.** An unfunded `requested` wallet booking. The blocker funds it with the real money helpers and terms, then commits. | `200`, `cancelled_by_admin`. Escrow stayed `held`, the customer's wallet stayed debited, and the audit row recorded a 0 refund. |
| **OPS-558.** An assigned, held booking at `in_progress`. The blocker marks it `completed_by_provider` and commits; this is direct SQL standing in for the completion route. | `200`. A cancellation refund ran, and `cancelled_by_admin` was written over `completed_by_provider`, which is not a valid edge. |

**Also before S1-8:**

- the admin cancel left the booking's open offers pending;
- it never emitted the admin socket event;
- it never told waitlisted customers that a slot had opened. The PATCH arm pinned by BUG-PHASE117-01 has been unreachable since S1-3.

### Fix

**`cancelBookingAsAdmin`.** One transaction, in this order:

1. lock the booking (`SELECT * ... FOR UPDATE`);
2. re-check `canTransition` on the locked status, with the same message as before;
3. run the shared `cancelBookingInTransaction` core: money from the locked `escrow_status`, the status fields, and the booking's open offers;
4. write the `admin_actions` row.

**Unchanged:**

- the request body and its validation: reason, `hoursUntilScheduled`, `providerArrived`, `customerNoShow` (UX-479 still rejects bad inputs before any read);
- the E75 timing behaviour, since the admin's money inputs pass straight through (C-20);
- the `CancelResult` shape.

**After the commit**, in this order:

1. the shared gateway step (`processCancellationGatewayRefund`), with the admin's existing payment-record and retry labels;
2. the admin socket event;
3. the shared slot-waitlist kick. It is now `kickSlotWaitlistAfterCancellation` in `booking.service.ts`, with the BUG-PHASE117-01 text unchanged.

Nothing after the commit can turn the committed cancellation into an error (C-19).

**Escrow states for the admin cancel:**

| State | Result |
|---|---|
| `held` | refund |
| `pending`, `refunded` | cancel without money |
| `partially_refunded` | refused (T13 change, C-05). New admin text: "Escrow shows a partial refund. For a resolved dispute, use Release instead of cancelling. Otherwise use Refund for the rest, then cancel." (worded after the review; see below) |
| `released` | still cancels without moving money, exactly as before. This is held for D35 Q11 decision 1, through an explicit `allowReleasedEscrow` input to the core. It is not inherited from the participant refusal. |

**Not built: customer and provider notices of an admin cancel.** They still send nothing. That wording waits for D35 Q6.

### Tests

**Bug tests**, both using the real admin route on the guarded fixture with a real blocker connection:

- **`bug-fin-012-admin-cancel-after-concurrent-payment.test.ts`:** 200, `refunded`, the wallet restored to 150,000, 0 left in the booking's escrow, and an audit row recording an 80,000 refund. Red against `572ae3c5`: escrow stayed `held`.
- **`bug-ops-558-admin-cancel-overwrites-advanced-status.test.ts`:** 409 with the unchanged "Cannot cancel booking in status" message. The booking stays `completed_by_provider` with escrow `held`, and everything except the booking row is unchanged. Red against `572ae3c5`: it answered 200.

**Supporting tests** (no Bug title), in `booking-admin-cancel-core-postgres.test.ts`:

1. Admin cancel of a partially refunded booking: 409 with the admin text, and the snapshot unchanged.
2. Admin cancel of a released booking: 200, with no wallet, ledger, payment or retry change (held behaviour).
3. The audit insert fails after the refund and status were written: 500, and the whole snapshot is unchanged, including the booking's pending offer.
4. A successful admin cancel:
   - the full unassigned refund;
   - the offer closed;
   - the audit row;
   - the admin socket event `{ id, oldStatus: 'paid', newStatus: 'cancelled_by_admin' }`;
   - one slot-waitlist kick.

**Pinned tests updated to the lock-first order**, with no assertion weakened:

- **`services/booking-cancel-admin-tx.test.ts` (Bug 69).** It now asserts:
  - the lock is the first statement in the transaction;
  - there is no top-level booking read;
  - a refused cancel writes nothing;
  - the gateway step runs after the commit, with the admin labels, and never for a rolled-back cancel.

  One rollback check had matched only a literal `'cancelled_by_admin'` in the UPDATE text. The status is now a parameter, so the check matches any `UPDATE bookings SET`; the old pattern could no longer fail.
- **`booking-dispute-admin.test.ts`:** its three admin-cancel cases now read the locked row inside the transaction instead of a pre-read and a fee read.
- **`bug-ux-713-admin-cancellation-state-guard.test.ts`:** the paid-out refusal is now decided on the locked row. Only the lock statement runs; there is no update, money or audit.

**Mutations:** 12 mutations. Each was reverted, and the files were confirmed byte-identical afterwards.

| Mutation | Failed |
|---|---|
| The whole pre-S1-8 `booking-admin.service.ts` | 15 tests, including FIN-012, OPS-558 and supporting tests 1 and 4 |
| Drop the locked `canTransition` re-check | OPS-558, UX-713, two 409 cases |
| Read the booking without `FOR UPDATE` | 13 tests, including FIN-012 and OPS-558 |
| Refuse released escrow for the admin (`allowReleasedEscrow: false`) | supporting test 2 |
| Use the participant wording for the admin | supporting test 1 |
| Skip the post-commit gateway step | supporting test 4 (the payment record stays unrefunded), Bug 69 labels case |
| Drop the admin socket event | supporting test 4 |
| Drop the waitlist kick | supporting test 4 |
| Write the audit row on a pool connection instead of the transaction | 7 Bug 69 and dispute-admin cases |
| Re-throw from the post-commit catch | the new C-19 case |
| Kick the waitlist inside the transaction | supporting tests 3 and 4 |
| Restore the misleading first admin wording | supporting test 1 |

### Verification

- **Focused tests:**
  - the S1-8 real-database set (FIN-012, OPS-558, the 4 supporting tests, SEC-091): 9/9 passed;
  - every S1-1 to S1-7 suite plus CRIT-N10, booking-completion and UX-302: 17 suites, 60/60;
  - the mock-based admin-cancel, waitlist, MED-N68 and escrow suites: 99/99;
  - after the review fixes, the affected 7 suites: 72/72.
- **API `tsc` and eslint** on the changed files: clean. The now-unused gateway-retry import was removed from `booking-admin.service.ts`.
- **Gates:**
  - gate smoke 7/7;
  - Gate C passes, including money-in-transaction. The unique regression ids went from 1,652 to 1,654;
  - Gate A passes.
- **Full API run (4 workers), before and after the review fixes:** 1,047/1,049 suites both times. Only the two Docker-only nginx suites failed; nothing timed out.
- **An earlier attempt was invalid, not counted.** It ran while the 124-finding audit workflow was also running, and its real-database tests failed at fixture connection timeouts before reaching any test code.

### Exact-commit CI (commit `75c754ba`)

CI `38051001713` and Gates `38051001706` both succeeded, including all six Gates jobs.

- API job `114209940378`: 1,049/1,049 suites; 3,687 passed, 2 todo, 0 skipped.
- FIN-012, OPS-558 and `booking-admin-cancel-core-postgres` passed.
- The two Docker-only nginx suites that cannot run locally also passed on CI's Linux runner.
- The admin, mobile and Docker jobs succeeded.

### Independent review

**Three read-only reviewers**, each with one lens: money and concurrency, callers and contracts, and tests. A skeptic then tried to refute each serious finding. The result: **no money defects**; 4 findings confirmed, two of them downgraded to notes, plus 6 notes.

**Applied:**

- **The admin refusal text could lead to a wrong cancel.** It read "Use Release for a resolved dispute, or Refund for the rest, before cancelling", which an admin could read as "Release, then cancel". Release leaves a resolved dispute `resolved`, and a later admin cancel of it would then succeed, marking a finished, paid job as cancelled. The text now says: "For a resolved dispute, use Release instead of cancelling. Otherwise use Refund for the rest, then cancel." D35 Q4 quotes it and asks Ken to approve it.
- **D35 Q11 decision 1 now records the interim.** S1-8 keeps today's behaviour for a released booking until Ken answers. The choice is passed into the core explicitly and has its own test.
- **New checks:**
  - a gateway-step and socket failure after the commit still returns the `CancelResult` and is logged (C-19);
  - a rolled-back admin cancel emits nothing and does not kick the waitlist;
  - the waitlist kick gets the booking's category, city and Manila date;
  - the admin's `customerNoShow` reaches the after-commit gateway step;
  - the S1-5 retry row's description is pinned.

**Recorded, not changed:**

- **Pre-existing: a 0% refund bracket or a customer no-show sends no gateway refund for the fee.** The local ledger does refund it. The gateway call depends on the price refund only. This is the same as the S1-5 note, now also on the admin path. There is no exposure while the customer fee is 0 and external payments are off.
- **Pre-existing wallet lock order.** A cancellation locks the escrow wallet before the customer wallet; the wallet payment and the admin refund lock the customer wallet first. This goes into the lock-graph item with C-02.
- **Two writers of a cancelled status remain outside the core:**
  - the 72-hour unmatched expiry job (`jobs/workers.ts:181`);
  - the customer no-show report (`routes/booking.routes.ts:1435`).

  K07 wants one cancellation entry, so these are open.
- **K07 gaps:**
  - no customer or provider notice of an admin cancel (D35 Q6);
  - no `responsibleParty`;
  - the audit row is written by the caller, not the core.

### Scope and limits

- **Not deployed.**
- **T13 (the admin web cancel button) changes for partially refunded bookings.** They are now refused with a pointer to the release and refund actions. This includes a resolved dispute with a partial refund, whose remainder goes to the provider through the release (C-05).
- **Held, unchanged:** the admin cancel of a released booking (D35 Q11 decision 1).
- **Not built:** customer and provider notices of an admin cancel (D35 Q6).
- **The admin-supplied hours still decide the refund bracket**, and the server does not check them against the booking time. This is E75 behaviour, recorded in the answers file, and is unchanged here.

## MC-03: dispute refunds can never take the escrow money twice (FIN-013 to FIN-016, OPS-561)

The basis is repair contract K01:

- **rule 3:** the retry worker retries only the external step and never re-runs the ledger;
- **"Where the existing code goes":** a dispute resolution refunds inside its own transaction;
- **acceptance A2 and A9:** no double debit, and an unknown outcome is never blindly replayed.

The full ledger (`booking_funds`, `money_operations`) is not built here. MC-03 uses the existing in-transaction refund helper, the same approach S1-5 took for cancellation.

**What changes on the live site once deployed, and what does not.** The E24 hold (`dispute-party-settlement-hold.service.ts`) still answers 503 in production for a provider's direct accept, a provider's partial offer and a customer accepting a partial offer. MC-03's fixes to those three paths therefore have no production effect until Ken lifts E24 through a reviewed change. The parts that take effect on deploy are the admin decisions (both routes), the automatic no-show refund and the retry worker.

### Defect, reproduced before the fix

Before MC-03, every dispute refund except the automatic no-show one ran **after** the decision was committed, through `refundFromEscrow`. Any error from that call queued a `refund_from_escrow` retry, and the retry worker re-ran the **whole** refund, local escrow debit included.

Captured against `75c754ba` on the guarded fixture (booking B: a paid wallet booking of 1,000,000 centavos, completed by provider B, with a succeeded payment record):

| Case | Result before MC-03 |
|---|---|
| **FIN-013.** A dispute refund of 300,000 whose escrow debit already committed, plus a pending `refund_from_escrow` row (a lost commit acknowledgement, or a row queued before the payment-only retry existed). The worker runs. | The worker took the booking's escrow a second time: the escrow wallet fell from 800,000 to 500,000, and the customer's wallet went from 1,300,000 to 1,600,000. |
| **FIN-014.** Two near-simultaneous customer accepts of one 300,000 partial offer, on a real blocker connection. | Both answered OK. `acceptPartialOffer` had no transaction or lock at all, so both read the offer as open and both refunded. |
| **FIN-015.** An admin 80% decision (800,000) on a booking with only 750,000 left after an earlier support refund. | It answered success: the dispute was recorded `resolved` and the booking partially refunded, no money moved, and a whole-refund retry was queued that could never succeed. |
| **FIN-016.** A `no_show` dispute filed on a job marked complete ten minutes after its start, which resolves automatically. | The escrow refund committed, but the payment record still read `succeeded` with nothing refunded: no payment-record step ran. |
| **OPS-561.** A provider's response sent twice at once: first a full acceptance, then (separately) a partial offer. | Both copies answered OK each time. The accept and partial-offer updates had no "still open, not yet answered" guard (the contest path had one); the second offer overwrote the first. |

### Fix

1. **`escrow.service.ts`.**
   - The post-commit payment-record step of `refundFromEscrow` is extracted as `processEscrowRefundPaymentStep(bookingId, amount, reason, paymentMethod, disputeId?)`. A wallet payment with no payment record is tolerated, as before. Any other failure queues a payment-only `process_payment_refund` retry, as before. That row now carries the dispute id, so admin Financials still links it to its dispute.
   - `refundFromEscrow` keeps its behaviour by calling it. It has no production caller left and is marked deprecated.
2. **Admin decisions (`resolveDisputeInTransaction`, used by `resolveDispute` and `adminResolveDispute`).**
   - The booking is locked after the dispute.
   - `refundFromEscrowInTransaction` runs inside the decision's transaction, together with its audit row. A refund that cannot be made rolls the whole decision back, and the admin sees the error.
   - After commit, only the payment-record step runs. The partial and full releases and their retries stay after commit, unchanged; they now always follow a committed refund.
3. **Provider responses (`addProviderResponse`).**
   - The accept and partial-offer updates gain `AND status = 'open' AND provider_response IS NULL ... RETURNING id`. Zero rows answers 409 "This dispute already has a provider response or is no longer open."
   - For an accept, the booking is then locked and the full refund runs inside the transaction. The payment-record step runs after commit.
4. **Customer accepts a partial offer (`acceptPartialOffer`).** One transaction:
   - lock the dispute, re-check the filer, that it is open and the offer amount;
   - lock the booking;
   - the dispute update gains `AND status = 'open'`;
   - the booking update and the refund run in the same transaction.

   After commit: the payment-record step, then the partial release (with its existing retry).
5. **Automatic no-show (`fileDispute`).** The refund already ran inside the filing transaction (MED-N19). After commit, the payment-record step now runs too, last, after the admin event and the participant pushes, as on the other dispute paths.
6. **The retry worker.**
   - A `refund_from_escrow` row is never run. It goes straight to `failed_permanent`. Its `last_error` becomes "Replay of a local escrow refund is disabled (MC-03): reconcile this booking's escrow and payment record manually." followed by " Previous error: " and the row's earlier error, kept as evidence.
   - The admin Financials payment-operations list shows `failed_permanent` rows first, as "Manual investigation required".
   - `enqueueRetry` no longer accepts this action type, so no code can queue one.
7. **E24 hold.** Its explanation now says MC-03 addresses the two reasons it gave. The hold itself is unchanged.

**Lock order.** Every dispute money path locks the dispute first, then the booking, then (inside the refund helper) the wallets. Paths outside the dispute service never lock dispute rows. The first draft of the provider accept locked the booking before the dispute. A test that races a provider accept against an admin decision showed a real PostgreSQL deadlock (code 40P01) with that order, so the accept now writes the guarded dispute update first.

### Tests

**Bug tests**, on the guarded fixture with real escrow, wallet and payment records. Each was red against `75c754ba`.

- **`bug-fin-013-dispute-refund-retry-replays-debit.test.ts`:**
  - the worker leaves wallets, ledger and payment records unchanged;
  - 700,000 stays in the booking's escrow;
  - the row is `failed_permanent` with the MC-03 text plus " Previous error: lost acknowledgement".
- **`bug-fin-014-double-partial-offer-accept.test.ts`:**
  - one accept answers OK and the other 409;
  - one 300,000 refund, and the customer's wallet is 1,300,000;
  - the provider's 700,000 is released once and nothing is left.
- **`bug-fin-015-dispute-resolved-while-refund-failed.test.ts`:**
  - 409 "Refund exceeds this booking's remaining escrow (750000 centavos).";
  - the snapshot unchanged, the dispute still `open` and the booking `disputed`.
- **`bug-fin-016-auto-no-show-refund-payment-record.test.ts`:** the payment record is `refunded` for 1,000,000, with one escrow refund and no retry rows.
- **`bug-ops-561-provider-double-response.test.ts`:**
  - a double-tapped accept: one OK and one 409 with the guard's own message, one refund, one inbox row;
  - a double-tapped partial offer: one OK and one 409, the first offer stands, one inbox row, no money moved.

**Supporting tests** (no Bug title), in `dispute-refund-commits-with-resolution-postgres.test.ts`:

1. A provider accept: one 1,000,000 refund, the customer's wallet 2,000,000, the payment record `refunded`, no retry rows.
2. A provider accept whose refund cannot be made (the booking holds 750,000): 409, and nothing changes. Red against `75c754ba`.
3. A customer accepting a 300,000 partial offer:
   - one refund;
   - the payment record `partially_refunded` for 300,000;
   - the provider's 700,000 released;
   - no retry rows.
4. A partial-offer accept whose refund cannot be made: 409, and nothing changes. Red against `75c754ba`.
5. to 7. Three races on a held booking row, each ending in one refund and a 409 with no deadlock. Each catches a booking-first lock order on one path:
   - a provider accept, then an admin decision;
   - an admin decision, then a provider accept;
   - a customer partial-offer accept, then an admin decision.
8. An admin 60% decision:
   - one 600,000 refund;
   - the payment record `partially_refunded`;
   - the provider's 400,000 released, nothing left;
   - one audit row.
9. The dispute route's resolver (`resolveDispute`): one refund, the payment record marked once.
10. A payment-record failure after a committed provider accept:
    - the dispute stays resolved;
    - the escrow is debited once;
    - only a `process_payment_refund` retry is queued, carrying the dispute id.

**Supporting unit test** `dispute-auto-refund-payment-step.test.ts`:

- after an automatic no-show refund, the payment-record step runs once, with the dispute id, last: after the commit, the admin event and both pushes;
- a filing whose refund fails runs no payment-record step.

The new helper `__tests__/helpers/dispute-postgres.ts` adds the exact migration-014 dispute tables to the participant fixture, plus the shared lock-wait helper.

**Pinned tests updated to the in-transaction order**, with no assertion weakened:

- **`dispute-refund-enqueue-35b.test.ts` (§35b):** rewritten. A refund that cannot be made now rolls the accept back and queues nothing. A successful accept runs, in order:
  - the guarded dispute update;
  - the booking lock;
  - the refund on the transaction client;
  - after commit, only the payment-record step.
- **`gateway-retry-queue-med-n28.test.ts` (MED-N28):**
  - the success case uses a release row;
  - a new case pins that a `refund_from_escrow` row is never replayed and keeps its previous error;
  - another new case: when another worker already finished that row's claim, it is not counted or logged as set aside;
  - the max-attempts case now uses a release row, so it exercises the max-attempts branch again;
  - the enqueue case uses the payment-only action;
  - the admin-decision case expects the payment-record step (with the dispute id) after commit, and only release retries.
- **`services/dispute-resolve-tx.test.ts` (Bug 83):**
  - the partial-refund case expects the payment-record step and the release after commit, and no second escrow refund;
  - the rollback cases also check that no payment-record step runs.
- **`booking-dispute-admin.test.ts`:** its fake escrow service now has the payment-record step, and the admin-decision happy path asserts its exact call. Before this, a "not a function" error was being swallowed there.
- **`bug-ops-469`:** its fake escrow service gains the payment-record step, so the test no longer runs through a swallowed error; its assertions are unchanged.
- **`bug-ops-468`, `bug-ops-471`, `dispute-auto-resolve-trx-med-n19`, `bug-ops-314`, `dispute-partial-offer-cap`:** their fake refund helper now returns a result like the real one, and they gain a plain payment-record mock where the code reaches it. Their own assertions are unchanged, except the cap test's guarded-update check.

**Mutations:** 19 mutations. Each was reverted, and the four source files were confirmed byte-identical afterwards.

| Mutation | Failed |
|---|---|
| The whole pre-MC-03 dispute, admin-dispute, escrow and retry services | 14 tests: FIN-013 to FIN-016, OPS-561, supporting tests 2, 4, 6, 7 and 10, the supporting unit test, and three MED-N28 cases |
| Lock the booking before the dispute in the provider accept | supporting test 5 (deadlock, code 40P01) |
| The same in the admin decision | supporting test 6 |
| The same in the partial-offer accept | supporting test 7 |
| Drop the provider-accept guard | OPS-561 |
| Drop both partial-offer-accept guards (the dispute lock and `AND status = 'open'`) | FIN-014, supporting test 7 |
| Ignore a zero-row partial-offer update | OPS-561 |
| The dispute payment-record step does nothing | 7 tests, including FIN-016 and the supporting unit test |
| Skip the payment-record step after an automatic no-show | FIN-016, the supporting unit test |
| Run it before the pushes again | the supporting unit test |
| Skip the admin payment-record step | supporting tests 6 and 8, the MED-N28 admin-decision case |
| Skip the partial-offer accept's payment-record step | supporting test 3 |
| Move the partial-offer accept's refund back after commit (the pre-MC-03 shape) | supporting test 4 |
| Restore the worker's whole-refund replay | FIN-013, the MED-N28 no-replay case |
| Drop the kept previous error | FIN-013, the MED-N28 no-replay case |
| Drop the dispute id from the payment-only retry | supporting test 10 |
| `>=` to `>` in the worker's max-attempts check | the MED-N28 max-attempts case |
| Run the admin decision's refund outside its transaction | FIN-015, supporting tests 6, 8 and 9 |
| Count and log a whole-refund row as set aside when its guarded update changed nothing | the MED-N28 finished-claim case |

### Verification

- **Focused tests.** The final run covered every API suite that touches the dispute, admin-dispute, escrow or retry services, or the E24 hold: 87 suites, 372/372 passed.
  - Before that, one new supporting test failed for a fixture reason. The shared escrow pool held too little, so the pool check refused before the per-booking cap.
  - The test now adds another booking's escrow to the pool.
- **API `tsc` and eslint** on the changed files: clean. A type check of the changed test files shows only errors that already exist at `75c754ba` (in `booking-dispute-admin`, `bug-ops-314` and the shared fixture). The updated admin mock removed one of them.
- **Gates:**
  - gate smoke 7/7;
  - Gate C passes, including money-in-transaction. The unique regression ids went from 1,654 to 1,659;
  - Gate A passes.
- **Full API runs (4 workers):** 1,051/1,053 suites after the first build, 1,053/1,055 after the first review's fixes, and 1,054/1,056 (3,704 tests passed, 2 todo) after the second review's. Only the two Docker-only nginx suites failed each time; nothing timed out.

### Exact-commit CI (commit `736420a8`)

CI `38056665352` and Gates `38056665346` both succeeded, including all six Gates jobs.

- API job `114226459059`: 1,056/1,056 suites; 3,706 passed, 2 todo, 0 skipped.
- FIN-013 to FIN-016, OPS-561, the supporting real-database file and the supporting unit test passed.
- The two Docker-only nginx suites and the sign-in suites passed on CI's Linux runner.
- The admin, mobile and Docker jobs succeeded.

### Independent review

**Three read-only reviewers**, each with one lens: money and concurrency, callers and contracts, and tests. A skeptic then tried to refute each serious finding. The result: **no money defects**. Three findings were kept, each downgraded from medium to low, plus several low findings and notes. **A second review of the fixes** (code and tests, two read-only reviewers) found no code defects, only wording and test-placement issues, all applied below.

**Applied:**

- **A set-aside whole-refund job no longer loses its earlier error.** For rows queued by the code at `75c754ba`, that error usually shows the refund itself failed, so the customer may still be owed money. The worker now keeps it after the MC-03 text.
- **Payment-only retries from dispute refunds carry the dispute id again**, so admin Financials links them to the dispute.
- **The automatic no-show refund's payment-record step now runs after the admin event and the pushes**, as on the other dispute paths.
- **`enqueueRetry` can no longer queue a whole-refund row**, and the unused `refundFromEscrow` is marked deprecated.
- **Tests:**
  - the MED-N28 max-attempts case had silently stopped reaching the max-attempts branch; it now uses a release row and asserts the exact update;
  - the partial-offer accept now has its own payment-record and refusal tests;
  - two mock admin tests were passing through a swallowed "not a function" error, and now assert the payment-record call;
  - the partial-offer guard now has a behavioural test (OPS-561);
  - the race tests now cover a booking-first lock order on all three paths, not only the provider accept;
  - the two fixes that had no Bug test now have one (FIN-016, OPS-561);
  - two supporting test titles no longer claim more than they check;
  - (second review) the no-show ordering checks moved out of the OPS-471, OPS-469 and MED-N19 bug tests into their own supporting unit test, so each bug test checks only its own bug;
  - (second review) a case for the worker's finished-claim path.
- **Stale comments fixed:**
  - the retry worker's doc block;
  - the partial-offer cap;
  - `resolveDisputeInTransaction`;
  - `adminResolveDispute`;
  - the `refundFromEscrow` deprecation note (cancellations use their own step);
  - the E24 hold's explanation. The hold itself is unchanged. E24 has a progress note saying exactly which of its items MC-03 meets, path by path;
  - LAUNCH-LIMITATIONS 111 updates the section 35 note that said the whole-refund action remains for failures before commit.

**Recorded, not changed:**

- **Pre-existing: `fileDispute`'s "one active dispute per booking" check is an unlocked read.** There is no database backstop, so a double-submitted filing can create two open disputes on one booking. Each is still capped by the booking's own escrow. Fixing it means locking the booking at the start of filing, or adding a partial unique index (a migration). It goes with the `fileDispute` remainder of R-MON-03.
- **The refund now holds the shared escrow wallet lock until the decision commits**, through the notification inserts, the provider suspension and the audit row. This trades a little throughput for one atomic decision. No lock cycle was found.
- **The provider accept still takes its amount and ownership from the read made before its transaction.** Nothing changes those fields on a disputed booking, and the refund is capped by the booking's own escrow.
- **The filing request still waits for the automatic refund's payment-record step.** While E14 holds external payments every booking is wallet-paid, and that step is local.
- **Pre-existing: when a customer accepts a partial offer, nobody is notified and no audit row is written.** This is recorded in E24 as open before the hold can be lifted.
- **The type-level ban on queueing a whole-refund row has no test of its own.** The worker's no-replay shortcut, which FIN-013 and MED-N28 test, is the money protection.
- **An admin decision whose refund cannot be made now answers 409 with the amount in centavos** (FIN-015). The admin page shows the raw message. Plain-language wording would be a small admin-app change.

### Scope and limits

- **Not deployed.**
- **On deploy, only some of this takes effect.** The admin decisions, the automatic no-show refund and the retry worker change. The provider accept, the provider partial offer and the customer accept-offer stay behind the E24 hold until Ken lifts it.
- **Release precondition: a read-only count on live.** Count the pending and in-progress `refund_from_escrow` rows. For each, export the id, booking, dispute, amount, attempts and `last_error`, next to that booking's escrow-ledger refund rows. After this change those rows are set aside, not run, and each needs a person to decide whether the customer is still owed.
- **Behaviour change for admins:** a dispute decision whose refund cannot be made now fails with the error instead of recording "resolved" with no money moved.
- **Out of scope, recorded:**
  - releases are still post-commit (K01 later);
  - `fileDispute` still sets `escrow_status = 'held'` unconditionally, and its duplicate check is unlocked (R-MON-03 remainder);
  - `releasePartialEscrow` trusts the caller's amount (R-MON-03 remainder);
  - the card path has no once-only key (R-MON-08);
  - stuck `in_progress` retry rows (R-MON-10).

## S1-9: an accepted custom quote can be paid from the wallet (OPS-559)

### Defect, reproduced before the fix

A customer who accepts a provider's custom quote cannot pay for it.

- `acceptQuote` assigns the quoting provider, records the quote's pricing terms and sets the booking to `payment_pending`, with no payment record.
- The app then opens the pay screen (BUG-PHASE86-01). That screen requires `payment_pending`. Its "Wallet Balance" option calls `POST /api/v1/payments/intent`.
- The wallet branch of that route accepted only statuses that can still move to `payment_pending` (`requested`, `matched`). For `payment_pending` itself it answered 409 'Cannot pay for a booking in "payment_pending" status.'
- External payments are held by E14, so the wallet was the only way to pay, and it refused. The quote flow could not finish.

Captured against `736420a8` on the guarded participant fixture through the real payment route: 409 with that message, and nothing moved.

**In the app as well:** after accepting a quote, the pay screen could show the cached booking, still `quoted`, and say "This booking is not awaiting payment" for up to five minutes. After paying, neither the booking nor the wallet was refreshed.

### Fix

**`routes/payment.routes.ts`, wallet branch only.** Under the booking lock the route already took, a `payment_pending` booking is now payable, with three refusals (409, nothing moves):

- **Any earlier payment record**, a failed one included (D35 Q10 interim): "This booking already has a payment attempt. Please contact support to complete it."
  - A failed card or GCash attempt can still complete at the payment company.
  - If the wallet then paid too, the customer would be charged twice. The late success would be silently absorbed, because the payment.paid handler looks at the newest record.
- **Its scheduled time has passed** (D35 Q12 interim): "The scheduled time for this booking has passed. Please contact support before paying."
  - A quote booking keeps the placeholder time set when the job was posted, while quotes stay open 48 hours by default.
  - Paid after that time, the no-show alert would fire on its next check, promising a full refund. A cancellation would then use the under-30-minutes bracket: 70% back, 30% to the provider.
- **The assigned provider is not approved** (D35 Q12 interim): "The provider for this booking is not available right now. Please contact support before paying."
  - The provider's status is read once, at payment time. The other two checks run under the booking lock.

**Unchanged:**

- Everything after these checks:
  1. the wallet debit;
  2. the succeeded wallet payment record;
  3. `paid` with escrow `held`;
  4. the authorization terms (final, because the quoting provider is already assigned);
  5. the escrow hold;
  6. the post-commit dispatch, which does nothing for an assigned booking.
- The external branch (held by E14).
- Instant-pay from `requested`, and payment from `matched`.

**The app (`apps/mobile`).**

- **Accepting a quote** resets the cached booking and refreshes the booking lists. The pay screen loads the booking fresh, and the booking screen still open underneath refetches it.
- **After paying,** the pay screen shows its loading state while it leaves. It refreshes:
  - the booking (both caches);
  - the lists;
  - the wallet balance and the wallet history.

### Tests

**Bug test `bug-ops-559-accepted-quote-unpayable.test.ts`.** It runs on the guarded fixture through the real payment route, on a quote-accepted booking:

- provider A assigned, and the quote's pricing terms recorded;
- scheduled two days out;
- 100,000 due, with customer A holding 150,000.

It expects:

- 201;
- one succeeded wallet payment record;
- the booking `paid`, escrow `held`, paid by wallet, provider unchanged;
- the wallet at 50,000;
- one debit and one escrow hold;
- authorization terms appended after the quote terms, both final.

It was red against `736420a8`, with the 409 above.

**Supporting tests** (no Bug title), 18 in `quote-payment-postgres.test.ts`:

1. **Earlier payment records** (7 tests). One record in each status: `pending`, `awaiting_payment`, `processing`, `succeeded`, `failed`, `refunded`, `partially_refunded`. Each gets 409 with the payment-attempt message, and nothing changes.
2. **A record written during the lock wait.** It is seen: 409, and nothing moves.
3. **Two near-simultaneous wallet payments.** One 201, and one 409 'Cannot pay for a booking in "paid" status.' The customer is charged once.
4. **A passed scheduled time** (2 tests: 2 hours past and 1 minute past). 409, and nothing changes.
5. **A quoting provider that is not approved** (4 tests: `pending`, `rejected`, `suspended`, `deactivated`). 409, and nothing changes.
6. **No provider and no payment record.** Only older data reaches this state. It is paid as before, with no provider check: 201.
7. **A quote accepted before quote terms were recorded** (before `34549ec5`). 201, with final authorization terms resolved at payment.
8. **Another customer.** 403, and nothing changes.

**The new helper `__tests__/helpers/quote-payment-postgres.ts`:**

- gives the fixture's `payment_intents` its production shape: every status from migration 012, the `topup_id` and `client_key` columns, and the booking-or-top-up rule from migration 122 (C-13);
- mounts the real payment route;
- writes the quote-accepted state directly, mirroring `acceptQuote` as of `736420a8`, because the fixture has no quote tables.

**App supporting test `apps/mobile/__tests__/ops-559-quote-to-payment-refresh.real.test.tsx`.** It uses the app's 5-minute cache lifetime.

- **Accepting a quote:** a booking screen left open underneath moves from `quoted` to `payment_pending`, and the lists are refreshed.
- **A wallet payment:**
  - the booking and balance are fetched again;
  - the lists, the second booking cache and the wallet history are refreshed;
  - the leaving screen never says the now-paid booking is "not awaiting payment".

**Mutations.** Each was reverted, and the files were confirmed byte-identical afterwards.

**On the route (9):**

| Mutation | Failed |
|---|---|
| The pre-S1-9 payment route | 18 of 22, including OPS-559 |
| Drop the earlier-payment check | the 7 status tests and the lock-wait test |
| Let a failed payment through | the `failed` test |
| Drop the scheduled-time check | both schedule tests |
| Allow 10 minutes of grace | the 1-minute test |
| Drop the provider check | the 4 provider tests |
| Refuse only `suspended` providers | the `pending`, `rejected` and `deactivated` tests |
| Read the earlier payments before taking the booking lock | the lock-wait test, and OPS-212 |
| Drop the existing status check for other statuses | the double-tap test (a second charge) |

**In the app (6):**

| Mutation | Failed |
|---|---|
| The quotes screen at `736420a8` | the accept test |
| Remove the cached booking instead of resetting it | the accept test |
| The pay screen at `736420a8` | the payment test |
| Drop the leaving state | the payment test |
| Drop the wallet-history refresh | the payment test |
| Drop the bookings-list refresh | the payment test |

### Verification

- **Focused tests.**
  - The payment and quote suites: 19 suites, 78 tests, before the review fixes.
  - The 22 S1-9 and payment-route tests after them.
  - The app's quotes and pay tests.
- **API `tsc` and eslint** on the changed files: clean. **App `tsc`:** clean.
- **Full app suite:** 615/615 suites before the second review's fixes. After them: 615/615 again (909 passed, 84 todo).
- **Gates:**
  - gate smoke 7/7;
  - Gate C passes. The unique regression ids went from 1,659 to 1,660;
  - Gate A passes.
- **Full API runs (4 workers):** 1,056/1,058 suites after the build, after the first review's fixes and after the second review's (finally 3,723 tests passed, 2 todo). Only the two Docker-only nginx suites failed; nothing timed out.

### Exact-commit CI (commit `25cebf6e`)

CI `38061258768` and Gates `38061258825` both succeeded, including all six Gates jobs.

- API job `114239817910`: 1,058/1,058 suites; 3,725 passed, 2 todo, 0 skipped. OPS-559 and `quote-payment-postgres` passed.
- Mobile job `114239818320`: 615/615 suites (909 passed, 84 todo), including the OPS-559 app test.
- The admin and Docker jobs succeeded.

### Independent review

**First review.** Three read-only reviewers, each with one lens: money and concurrency, callers and the app, and tests. A skeptic then tried to refute each serious finding. **No money defect in the code as reviewed, but one serious rule error:**

- **The first draft let a failed payment attempt through.** That contradicted the recorded D35 Q10 interim, and a supporting test pinned the wrong rule. A late success of that attempt would have charged the customer twice. **Fixed:** any earlier record now blocks, and each status has its own test.
- **Paying after the placeholder schedule, or with a suspended quoting provider, moved money wrongly** (the no-show alert, the late bracket, a provider who cannot work). **Interim refusals built**, recorded as D35 Q12.
- **Applied:**
  - the app's stale pay screen;
  - the tests for every payment status and for the lock;
  - a quote accepted without quote terms.

**Second review of the fixes:** two read-only reviewers. **No money defect.** Applied:

- the booking screen underneath was frozen by the first app fix: reset instead of remove;
- the leaving flash;
- the wallet-history refresh;
- wider provider and schedule tests;
- D35 Q3, Q10 and Q12 now match the code. Q12 now says what support can actually do.

**Recorded, not changed:**

- **The provider is not told when a booking becomes paid,** on any path. After a quote is paid, the confirmation screen also says onService is still "finding the best provider". Both go with the notifications work (K02).
- **"Contact support" has little behind it.** No tool changes a booking's time, so a late-accepted quote can only be cancelled and posted again. Accepting the quote has already declined the other quotes (D35 Q12, option 5).
- **The no-show alert's "full refund" wording** is wrong for any late booking (D35 Q12).
- **A failed external attempt that later succeeds** is absorbed silently by the payment.paid handler. The wallet now refuses such bookings, but the E14 replacement must not mark a booking paid twice without an alert.
- **`matched` bookings keep the earlier rules** (no schedule or provider check).

### Scope and limits

- **Not deployed.**
- **Release precondition: read-only counts on live** of `payment_pending` bookings with:
  - any payment record;
  - a scheduled time that has passed;
  - no quote terms.
- **Wording waiting on Ken:** the three refusal messages (D35 Q10 and Q12).

## S1-10: a retained performer cannot write another provider's job evidence (SEC-094)

### Defect, reproduced before the fix

A booking records the team member who performs it (`performer_staff_id`). The job-evidence writers accepted that team member whenever their staff row was approved. They never checked that the team member belongs to the booking's current provider.

The record stays on the booking when the booking moves to another provider, or loses its provider. S1-2 (SEC-078) closed this for status changes. These five writers still trusted the retained performer:

| Writer | Route |
|---|---|
| Tick a checklist item | `PATCH /api/v1/jobs/:id/checklist/items/:itemId` (`checklist.service` toggle) |
| Open the checklist, which creates it on first open | `GET /api/v1/jobs/:id/checklist` (`checklist.service loadBookingForActor`) |
| Upload a job photo | `POST /api/v1/uploads/booking-photo` (`booking-photo.service resolveBookingRole`) |
| Upload a customer-acceptance signature | `POST /api/v1/uploads/booking-signature` (same check) |
| The legacy provider photo writer | `POST /api/v1/bookings/:id/photos` (`verifyProviderPhotoWriteAccess`) |

Captured against `25cebf6e` on the guarded staff fixture: an approved team member of provider B, still recorded as the performer on a booking with no provider, then on a booking of provider A. Each time:

- the item was ticked, with the note saved;
- both photos were stored and recorded as provider evidence;
- the signature was stored;
- the missing checklist was created.

### Fix

In each writer's staff join, the recorded performer now counts only while their staff row belongs to the booking's current provider: `LEFT JOIN provider_staff ps ON ps.id = b.performer_staff_id AND ps.provider_id = b.provider_id`. A booking with no provider never matches.

Unchanged:

- the provider owner;
- the customer;
- admins;
- the approval requirement.

The four readers that join the same way are S1-11 (SEC-095):

- the booking detail;
- the booking access check;
- the photo list;
- the support-case booking link.

### Tests

**Bug test `bug-sec-094-retained-performer-evidence-writes.test.ts`.** It runs on the guarded staff fixture, with migrations 078 and 079 run exactly and storage spied. Both cases, no provider and provider A:

- all five writers answer 403;
- nothing reaches storage;
- the checklist, photo, signature and legacy-photo records are unchanged.

It was red against `25cebf6e`.

**Supporting tests** (no Bug title), in `staff-evidence-writers-postgres.test.ts`:

1. **The team member of the booking's own provider keeps every writer.** The tick, both photos, the signature and the checklist creation all succeed and are recorded under that team member, with the provider role (needed for T11).
2. **A booking the owner performs** (no team member recorded, the normal case):
   - the provider owner keeps all five writers;
   - the customer keeps the photo and signature uploads.
3. **A booking now of provider A that still records provider B's team member:** its current owner still ticks the checklist, and its customer still uploads a photo.
4. **A non-approved team member of the right provider** is still refused on all five writers, and nothing changes.

The new helper `__tests__/helpers/staff-evidence-postgres.ts` adds:

- the exact migration 078 and 079 tables;
- one checklist item per booking;
- the legacy photo columns (migration 037's shape);
- the real routes, mounted as in `server.ts`.

**Mutations:** 9 mutations. Each was reverted, and the three files were confirmed byte-identical afterwards.

| Mutation | Failed |
|---|---|
| The three files at `25cebf6e` | SEC-094 |
| Drop the check from the legacy photo writer | SEC-094 (a legacy photo was recorded) |
| Drop it from the photo service | SEC-094 (a photo and the signature were recorded) |
| Drop it from the checklist open | SEC-094 (the checklist was created) |
| Drop it from the checklist tick | SEC-094 (the item was ticked) |
| Make the photo service's staff join an inner join | supporting tests 2 and 3: the owner and customer were locked out |
| The same in the legacy photo writer | SEC-094 and supporting test 2 |
| The same in the checklist open | SEC-094 and supporting test 2 |
| The same in the checklist tick | SEC-094 and supporting tests 2 and 3 |

### Verification

- **Focused tests.**
  - Every API suite that touches the checklist, photo, upload or staff code: 62 suites, 411 tests, before the review additions.
  - The 5 S1-10 tests after them.
- **API `tsc` and eslint** on the changed files: clean.
- **Gates:**
  - gate smoke 7/7;
  - Gate C passes. The unique regression ids went from 1,660 to 1,661;
  - Gate A passes.
- **Full API runs (4 workers):** 1,058/1,060 suites before and after the review additions (finally 3,728 tests passed, 2 todo). Each time, only the two Docker-only nginx suites (`bug-ux-201`, `bug-ux-860`) failed.

### Exact-commit CI (commit `efc3e85d`)

CI `38063705309` and Gates `38063705317` both succeeded, including all six Gates jobs.

- API job `114246961288`: 1,060/1,060 suites; 3,730 passed, 2 todo, 0 skipped. SEC-094 and `staff-evidence-writers-postgres` passed.
- The admin, mobile and Docker jobs succeeded.

### Independent review

**Two read-only reviewers**, each with one lens: authorization across the whole API, and the tests. A skeptic then tried to refute each serious finding.

**The result: no problem in the change.**

- Every use of `performer_staff_id` for authority was checked. Each one is in one of these groups:
  - fixed here;
  - fixed by SEC-078;
  - one of the four S1-11 sites;
  - the team member's own job list, which already had the check.
- No other writer reachable by a team member trusts the retained performer. Change orders, quotes, no-show reports, disputes, chat and sockets check the provider owner directly.
- No legitimate user is locked out. The condition sits inside a LEFT JOIN, and staff assignment only sets a performer of the booking's own provider.

**Applied:**

- **Tests that would catch a lock-out.** A future edit that made the join strict would have locked owners and customers out, and no test would have failed. Supporting tests 2 and 3 now catch it (the inner-join mutations).
- **The team member's tick is asserted.**
- **The non-approved test also opens the checklist.**
- **The fixture's legacy photo columns** now match migration 037.

**Recorded, not changed:**

- **Pre-existing:** the older photo upload accepts any web address, and those entries satisfy the two-after-photo completion gate. The evidence writers also have no booking-stage gate, so evidence can change after confirmation or during a dispute. Both are LAUNCH-LIMITATIONS 114 (open).
- **`createTicket` is a writer** (it links a new support case to the booking). It is fixed in S1-11 with the approved-status check, and its red test will also assert that no case row is created.
- **A customer review still copies a retained performer** onto the review, and the per-member team stats count it. This is attribution data, not authority. It goes with S1-12's reassignment reset.
- **When D35 Q3 (suspended providers) is answered,** the answer applies to these evidence writers as well as status changes. A suspension today revokes only the owner's sessions, not the team members'.

### Scope and limits

- **Not deployed.**
- **The four readers** with the same old join are S1-11 (SEC-095).

## S1-11: a retained performer cannot read another provider's job (SEC-095, SEC-096)

### Defect, reproduced before the fix

The same retained-performer record as S1-10. Four access checks still admitted an approved team member recorded on a booking that has no provider, or another provider:

| Check | What it guards |
|---|---|
| `bookingService.getBookingById` | `GET /api/v1/bookings/:id` (the job detail, with the customer's name and address), `GET /:id/match`, and the review and tip lookups |
| `verifyBookingAccess` in `booking.routes.ts` | the proof summary, the quotes list and the change-order list |
| The photo-list check in `upload.routes.ts` | `GET /api/v1/uploads/booking-photo/:bookingId` |
| `createTicket` in `support-ticket.service.ts` | linking a new support case to the booking (a writer) |

Captured against `efc3e85d`, with provider B's approved team member recorded on booking B (no provider, then provider A):

- the job detail answered 200, with customer B's name and address;
- the photo list and the change-order list answered 200;
- the proof summary passed its access check (it then failed only on the fixture's missing tables);
- a support case was created and linked to booking B.

**SEC-096.** The support-case link also never checked that the team member was still approved, unlike every other job read. A suspended team member could still open a case linked to their job.

### Fix

**SEC-095.** Each of the four staff joins now requires `ps.provider_id = b.provider_id`, as in S1-10.

**SEC-096.** On a team member's own request, the support-case link also requires `ps.status = 'approved'`.

- A super admin opening a case on the member's behalf (`POST /api/v1/support-tickets/admin`, for example after a suspension) may still link it.
- This is only the member's own provider's job. The provider check above still applies to the admin.

Unchanged:

- the provider owner;
- the customer;
- admins' own reads;
- the team member's own job list (SEC-079 already had the check).

### Tests

**Bug tests**, on the guarded staff fixture. The fixture is extended with:

- one provider photo per booking;
- bare stand-in support-case columns for migrations 164 and 170;
- a stand-in change-order table;
- the admin audit verb an on-behalf case writes.

**`bug-sec-095-retained-performer-booking-reads.test.ts`.** In both cases (no provider, and provider A):

- the job detail answers 404;
- the photo list, the change-order list and the proof summary answer 403;
- the support case answers 404 "Booking not found for this account.", and no case is created.

It was red against `efc3e85d`.

**`bug-sec-096-unapproved-member-support-link.test.ts`.** A suspended team member of the right provider gets 404 on their own job's case link, and no case is created. It was red against `efc3e85d` (201).

**Supporting tests** (no Bug title), in `staff-booking-reads-postgres.test.ts`:

1. **The team member of the booking's own provider** still:
   - reads the job detail (with the address);
   - reads the photo list, and gets exactly that booking's photo;
   - reads the change-order list;
   - links a case to the job.
2. **A booking the owner performs** (no team member recorded): the owner and the customer still read it, and the customer links a case.
3. **A booking now of provider A that still records provider B's team member:** its current owner and customer still read it, and the owner links a case.
4. **A non-approved team member of the right provider** still cannot read the job.
5. **An admin can still open a case on behalf of a suspended team member,** linked to their own provider's job. The admin action is recorded.
6. **An admin cannot link a team member's case to a booking of no or another provider** that still records them.

**Mutations:** 11 mutations. Each was reverted, and the four files were confirmed byte-identical afterwards.

| Mutation | Failed |
|---|---|
| The four files at `efc3e85d` | SEC-095, SEC-096, supporting test 6 |
| Drop the check from the job detail | SEC-095 |
| Drop it from `verifyBookingAccess` | SEC-095 |
| Drop it from the photo list | SEC-095 |
| Drop it from the support-case link | SEC-095, supporting test 6 |
| Drop the approval check for the member's own request | SEC-096 |
| Remove the admin exception | supporting test 5 |
| Make the job detail's staff join an inner join | supporting tests 2 and 3 |
| The same in `verifyBookingAccess` | SEC-095, supporting tests 2 and 3 |
| The same in the photo list | supporting tests 2 and 3 |
| The same in the support-case link | supporting tests 2 and 3 |

### Verification

- **Focused tests.** Every API suite that touches booking detail, booking routes, uploads, support cases or team members: 119 suites, 470 tests, after the review changes.
- **API `tsc` and eslint** on the changed files: clean.
- **Gates:**
  - gate smoke 7/7;
  - Gate C passes. The unique regression ids went from 1,661 to 1,663;
  - Gate A passes.
- **Full API runs (4 workers):** 1,060/1,062 suites before the review changes, and 1,061/1,063 after them (finally 3,736 tests passed, 2 todo). Each time, only the two Docker-only nginx suites (`bug-ux-201`, `bug-ux-860`) failed.

### Independent review

**First review.** Two read-only reviewers, each with one lens: authorization across the API and apps, and the tests. A skeptic then tried to refute each serious finding.

**The result: no serious problem.**

- Every join that grants access through `performer_staff_id` now has the provider check. Chat, sockets, disputes, quotes, no-show reports, change-order writes, notifications and listings check the provider owner or the conversation's participants.
- No legitimate caller is locked out. This includes customers through the review and tip lookups, admins, and every endpoint the staff mobile screens call.

**Applied:**

- **The new approval check also blocked an admin** opening a case on behalf of a suspended team member, which worked before. The admin path is kept (SEC-096), with a test each way.
- **The approval check is now its own bug test** (SEC-096), under the one-bug-one-test rule.
- **Two assertions that could never fail were removed.** They checked that an error response did not contain the address.
- **Real photos now back the "still reads" test,** and the helper comment no longer overstates the fixture.

**A second review of these changes** found no defect. It confirmed:

- only the admin route can set the admin flag;
- the provider check still applies to the admin;
- the query parameter types are correct.

It also added one check: the on-behalf case records which admin linked it (supporting test 5).

**Recorded, not changed:**

- **`verifyBookingAccess` still answers 404 for a missing booking and 403 for another's booking.** This is older behaviour. The ids are UUIDs, and the stale performer already knows the id. It is a separate cleanup to answer 404 in both cases.
- **The legitimate team member's proof-summary read** is covered only through the shared `verifyBookingAccess` (via the change-order list) and by mock tests. The proof summary reads about fifteen tables this fixture does not have.
- **Review attribution and the per-member team stats still count a retained performer.** This is counts only, with no access. It goes with S1-12's reassignment reset.

### Scope and limits

- **Not deployed.**
- **SEC-096 changes behaviour.** A suspended team member can no longer link a new support case to their job themselves. An admin can do it for them.
