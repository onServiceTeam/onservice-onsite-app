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
