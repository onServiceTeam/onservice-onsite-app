# Money safety, Slice 2 (2026-10-11)

Claude Code finishes Stage 1 of the repair program on PR81 (`codex/financials-operator-truth`):

- (b) change-order money (R-MON-04);
- (c) the remaining refund gaps (R-MON-02, R-MON-03, R-MON-08, R-MON-10).

Each sub-slice is finished and re-checked before the next one starts, exactly as in Slice 1 (`docs/audits/BOOKING-AUTHORITY-SLICE1-2026-10-10.md`):

1. a failing test first;
2. the fix;
3. focused and full regressions;
4. gates;
5. an independent review;
6. exact-commit CI.

Owner questions that this slice does not answer are in `.ai-coder/decisions/D36-money-slice2-questions.md`. Where a rule is undecided, the slice builds a refusal (nothing moves) and asks.

**Nothing in this slice is deployed.** The test environment and the local load-timeout pattern are the same as in Slice 1.

## Order

| Step | What it does |
|---|---|
| S2-0 | A shared money and dispute test fixture (no application change) |
| S2-1 | Every payout from the shared escrow wallet stays within what that booking holds |
| S2-2 | Filing a dispute locks the booking and keeps its true escrow state |
| S2-3 | Dispute decisions refuse what they cannot honestly carry out (interim, D36 Q1) |
| S2-4 | Change-order money: real-database fixture and atomicity evidence |
| S2-5 | Change orders accept only a wallet payment made in the same step |
| S2-6 | Change-order money lands only on a fully held, wallet-paid booking (interim, D36 Q3) |
| S2-7 | Change-order money is traceable, and its refunds are recorded honestly |
| S2-8 | Abandoned payment retries are picked up again safely (R-MON-10) |
| S2-9a, S2-9b | Every refund writes its payment step in the same commit as the decision |
| S2-10 | A card refund is sent to the payment company at most once (R-MON-08, safe part) |
| S2-11 | The provider is really notified when extra work is paid (wording D36 Q5) |

S2-9a, S2-9b and S2-10 form one release unit and are not released before D36 Q6 is answered.

## S2-0: money and dispute fixture

**What changed.** No application change. A new guarded fixture, `__tests__/helpers/money-dispute-postgres.ts`, sits on top of the dispute fixture. It adds:

- **A bystander booking** from a third customer, holding ₱50,000, far more than any booking under test. Each payout limit is then tested against a shared escrow wallet that always has enough money in it. It is a real paid wallet booking: funded through the same wallet helpers, with a payment record and authorization terms.
- **One audit verb list** covering every admin route the slice drives: refund, dispute decision, cancel and manual release. The S1-8 admin cancel and manual release helpers are re-exported. The older helpers that change the verb list must not be stacked on this fixture; the file says so.
- **The production column `providers.total_jobs`**, which the customer confirm updates.
- **HTTP helpers** for the support refund, dispute filing and admin dispute decision routes.
- **Builders for the starting states**, each checking its own result:
  - **Confirmed and released, still inside the dispute window, with no earlier refund.** The customer confirm and the super admin's manual release run through the real routes. The confirm-time release is refused because the provider is marked as suspended during the job. That marker is set and cleared with direct SQL, because no production code clears it today (LAUNCH-LIMITATIONS 118).
  - **Resolved, labelled "held", holding ₱7,500 of ₱10,000.** A real support refund, then one documented UPDATE that sets the status and label older code could leave behind. Live data may already be in this state, so the guards are tested against it directly.
  - **No-show timing** for automatic dispute resolution, as FIN-016 uses.

**Supporting tests**, `money-dispute-fixture-postgres.test.ts` (no Bug titles; nothing is fixed here):

1. The bystander booking holds the most, has its authorization terms, and the shared escrow wallet holds all three bookings.
2. A support refund through the real route leaves booking B `partially_refunded`, holding ₱7,500.
3. The confirmed-and-released builder leaves booking B `confirmed` and `released`, holding nothing. The provider has been paid ₱6,800, the price minus the 15% commission.
4. The short-held builder leaves booking B `resolved`, labelled `held`, holding ₱7,500.
5. Dispute filing and an admin `no_refund` decision work end to end over HTTP on a fully held booking: resolved, released, the provider paid, and no retry row.
6. With the no-show timing, a no-show dispute filed over HTTP resolves automatically.

**Mutations.** Each was reverted, and the file was confirmed byte-identical afterwards.

| Mutation | Failed |
|---|---|
| The builder does not mark the provider as suspended (the confirm then releases normally) | test 3, with the builder's own check |
| The short-held builder leaves the label unchanged | test 4, with the builder's own check |

**Verification:**

- **Focused:** 6/6 on PostgreSQL 17.9, zero skips.
- **API `tsc` and eslint** on the changed files: clean.
- **Gates:** gate smoke 7/7; Gate C passes (1,664 titled regressions, unchanged); Gate A passes.
- **Full API run (4 workers), after the review changes:** 1,064/1,066 suites; 3,748 tests passed, 2 todo. Only the two Docker-only nginx suites (`bug-ux-201`, `bug-ux-860`) failed. Every existing guarded suite stayed green.

**Exact-commit CI (commit `f5faa5a4`).** CI `38074808580` and Gates `38074808576` both succeeded, including all six Gates jobs.

- API job `114279458448`: 1,066/1,066 suites; 3,750 passed, 2 todo, 0 skipped. `money-dispute-fixture-postgres` passed.
- The admin, mobile and Docker jobs succeeded.

**Independent review.** One read-only reviewer. No blocker. Applied:

- **The admin cancel refuses booking B's earlier statuses**, so S2-1's refusal tests would have passed for the wrong reason. The short-held "resolved" builder was added, and every Slice 2 refusal test asserts its own error message, not only the status code.
- **The released-state builder was described as the only real path. It is not**, and one of its steps has no production counterpart. The wording was corrected, and the missing "clear the marker" action is now LAUNCH-LIMITATIONS 118 and D36 Q13.
- **Two planned S2-3 refusal tests already pass on today's code**, because the refund step refuses anything above the booking's own held amount. S2-3 must assert its new interim message, or title them as supporting tests.
- **Stricter builder self-checks** (the refusal message and the end state).
- **A real bystander booking**, sized for later change-order tests.
- **The re-exported helpers**, a no-show timing helper, stronger assertions in test 5, and neutral wording.

## S2-1: every escrow payout stays within what the booking holds (FIN-017, FIN-018, FIN-019)

### Defect, reproduced before the fix

All bookings' held money sits in one shared escrow wallet. Each booking's share is the sum of its own escrow ledger rows. Refunds already checked that share. These payouts did not, and checked only the shared wallet's total:

- **The partial release after a dispute decision** (`releasePartialEscrow`). Its amount comes from the caller (the decision, or a queued retry), which may predate a later refund.
- **The cancellation's provider compensation and the customer no-show fee** (`handleCancellationInTransaction`). This step trusts the escrow label "held" to mean the booking holds its full total. It is reached through the admin cancel, the participant cancel, and the provider's customer no-show report.
- **The hourly unused-time refund** (`settleHourlyAndReleaseInTransaction`). This one could not lose money: the release in the same step already refused such a booking.

Captured against `f5faa5a4` on the guarded money fixture:

- **FIN-017.** After a 60% decision whose partial release failed and was queued (400,000), support refunded 100,000 more. The retry worker then paid out the queued 400,000 from a booking holding 300,000: 272,000 to the provider, 120,000 to revenue, 8,000 to the guarantee fund.
- **FIN-018.** On a booking labelled "held" but holding 750,000 of its 1,000,000, admin cancels (customer no-show, and 0 hours in the fixture's 0% bracket) both answered 200. Each paid out 1,000,000 and left the booking's share at −250,000.
- **FIN-019.** The provider's no-show report on such a booking (arrived, past the wait) answered 200 and also left the booking's share at −250,000.

### Fix

`packages/api/src/services/escrow.service.ts`:

- **New helpers.**
  - `bookingEscrowHeldInTransaction` sums the booking's own ledger on the escrow wallet. Callers read it after locking that wallet.
  - `escrowPayoutRefusal` logs the refusal at error level, then returns a 409 with a code. A rolled-back transaction keeps no other trace.
- **Releases** (`writeReleaseMovements`, used by every full and partial release). Pay out only when the booking holds exactly the release amount; otherwise refuse with `ESCROW_RELEASE_AMOUNT_MISMATCH`. Paying more would spend other bookings' money. Paying less would mark the escrow released and strand the rest.
- **Cancellation money** (`handleCancellationInTransaction`). Its refund, fee and compensation always add up to the booking's whole total. Move money only while the label is "held" and the booking holds exactly that total; otherwise refuse with `CANCELLATION_ESCROW_MISMATCH`.
- **Hourly settlement.** Refuse an unused-time refund larger than what the booking holds (`HOURLY_REFUND_EXCEEDS_BOOKING_ESCROW`).

Wording (interim, D36 Q2):

- **Admin texts** show the amounts in pesos, say that nothing moved, and give a next step.
- **Customers and providers** are asked to contact support. The refusal code is mapped to that wording in three places: the cancellation core (`booking-cancel.service.ts`, every target except the admin's), the provider's no-show report and the customer's confirm (`booking.routes.ts`).

The comments on the wallet lock order (`escrow.service.ts`, `wallet.service.ts`) now name the two exceptions (LAUNCH-LIMITATIONS 120).

**Why the held amount cannot change during a payout.** Every escrow movement writes a ledger row that references the booking. That foreign key takes a key-share lock on the booking row, so a movement and a payout on the same booking wait for each other. The partial release and the cancellation read nothing before the new check, so the new check is the only one on those paths.

**Unchanged:**

- every payout whose amount matches what the booking holds;
- the cancellation brackets and policy;
- the refund cap;
- the dispute decision math (S2-3).

### Interim state until S2-3

A partial dispute decision made after an earlier support refund still refunds that percentage of the original total, so the customer can get back more than either answer to D36 Q1 would give. The provider's partial release that follows is refused (before, it was paid from other bookings' money) and ends as "manual investigation" in Financials. In the same situation a full-refund decision is refused outright, and a no-refund decision's release is refused.

### Tests

**Bug tests**, each red against `f5faa5a4` for the stated reason (log in the private records):

- `bug-fin-017-partial-release-capped-by-booking-escrow.test.ts`:
  - the queued 400,000 and 200,000 releases are refused with their exact texts, nothing moves, and both refusals are logged;
  - a queued release of exactly the 300,000 held succeeds and leaves the booking released.
- `bug-fin-018-cancellation-payouts-capped-by-booking-escrow.test.ts`:
  - both admin cancels always run and report their status, text, money and refusal log;
  - before the fix, both answered 200 with the booking at −250,000.
- `bug-fin-019-provider-no-show-capped-by-booking-escrow.test.ts`:
  - the provider's report reports the same way;
  - before the fix, it answered 200 with the booking at −250,000.

**Supporting tests**, `escrow-payout-limits-postgres.test.ts`:

1. A partial decision with no earlier refund releases exactly the remainder.
2. An admin no-show cancel of a fully held booking pays exactly what it holds.
3. A booking holding **more** than its total is refused, so nothing is stranded.
4. A fully held booking whose label is not "held" is refused (the no-show route).
5. A customer cancel and a provider cancel both get the plain wording.
6. A wrong-amount partial release has its own code.
7. A full release that waits on another escrow movement for the booking refuses the changed amount. Its older check answers first, so this also passes on `f5faa5a4`; it pins the booking-row serialisation S2-1 relies on.
8. A partial release that waits on another escrow movement refuses the changed amount. Here the S2-1 check is the only one; before the fix this paid out the stale amount and stranded the new 50,000.
9. An hourly unused-time refund larger than the booking holds is refused, and the refusal is logged.
10. A customer confirming a fully held hourly booking settles the hours, refunds the unused 500,000 and releases the rest to the provider.
11. A customer confirming an hourly booking that holds too little gets the plain wording, and no money moves.

**Updated mocked suites (no assertion removed):**

- `escrow-async-integration` and `escrow-partial-release-conservation-med-n25-n26` report the booking's held amount for the scenario: 55,000 after a 50% refund.
- `bug-ops-249` reports 110,000 when the hourly refund is checked, then 55,000 after it.
- The new helper uses the same `remaining` column as the two existing ledger queries.

**Mutations:** 18 runs on the final code. Each was reverted, and the three source files were confirmed byte-identical afterwards. Only tests in the five S2-1 files are named.

| Mutation | Failed |
|---|---|
| The three source files at `f5faa5a4` (red evidence) | FIN-017, FIN-018 (both cases), FIN-019, supporting 3, 4, 5, 6, 8, 9, 11; also OPS-249, whose mock now follows the new query order |
| No release check | FIN-017, supporting 6, 8 |
| Release check refuses only a shortfall | FIN-017, supporting 8 |
| Release check sums the whole shared wallet | FIN-017, supporting 1, 6, 8, 10, OPS-249 |
| No cancellation check | FIN-018, FIN-019, supporting 3, 4, 5 |
| Cancellation check only on a customer no-show | FIN-018, supporting 5 |
| Cancellation check on the label only | FIN-018, FIN-019, supporting 3, 5 |
| Cancellation check without the label | supporting 4 |
| Cancellation check refuses only a shortfall | supporting 3 |
| Cancellation check sums the whole shared wallet | FIN-018, FIN-019, supporting 2, 3 |
| No hourly check | supporting 9, 11 |
| Hourly check requires an exact match | supporting 10, OPS-249 |
| Hourly check refuses an equal refund too | none (equivalent; see below) |
| No refusal log | FIN-017, FIN-018, FIN-019, supporting 9 |
| Customers and providers get the admin text | supporting 5 |
| Only customers get the plain text | supporting 5 |
| The no-show report gets the admin text | FIN-019, supporting 4 |
| The customer confirm gets the admin text | supporting 11 |

**The surviving mutant is equivalent.** It differs only when the unused-time refund equals everything the booking holds. That leaves nothing for the release in the same step, which refuses and rolls back. The mutant refuses one check earlier, so nothing moves either way; only the message differs.

### Verification

- **Focused tests.** 15/15 on PostgreSQL 17.9, run serially, zero skips:
  - the 3 bug tests;
  - the 11 supporting tests;
  - `bug-ops-249`.
  The 7 money suites that use a mocked database also pass (98 tests): escrow release conservation, partial-release conservation, OPS-295, OPS-241, OPS-249, BIR financials and async integration.
- **API `tsc` and eslint** on every changed file: clean.
- **Gates:** gate smoke 7/7; Gate A passes; Gate C passes. The unique regression ids went from 1,664 to 1,667.
- **Full API runs (4 workers).** This machine was slow after the 2026-10-11 power loss: OneDrive was re-syncing, and the antivirus scans each new database connection and process. A fresh connection took about 0.4 to 0.9 seconds, against about 20 ms normally. So each run hit connection and jest timeouts in unrelated suites, and every failing suite was rerun serially. Both results are recorded:
  - **First run (before the review fixes).** It found the 7 mocked suites the change broke, all now fixed; the rest were timeouts.
  - **Final run (final code).**
    - 1,060/1,070 suites passed.
    - 2 failures were the Docker-only nginx suites (`bug-ux-201`, `bug-ux-860`).
    - The other 8 were connection or jest timeouts: sign-in, session, admin-enable, token-issuer, provider-draft and staff-read suites.
    - Rerun serially, all 8 passed (57/57).
  - **Earlier runs, serial reruns.** Every money suite passed: dispute refunds, cancellation transactions, quote payment and guard pool starvation.

### Exact-commit CI (commit `f3e53f56`)

CI `38092853947` and Gates `38092853850` both succeeded, including all six Gates jobs.

- API job `114332676243`: 1,070/1,070 suites; 3,764 passed, 2 todo, 0 skipped. FIN-017, FIN-018, FIN-019, `escrow-payout-limits-postgres` and the three updated mocked suites passed. So did the sign-in, session and backup suites that timed out on this machine.
- The admin, mobile and Docker jobs succeeded.

### Independent reviews

**Review 1.** Four read-only lenses: money across every caller, locking, tests, and operational impact. Each serious finding was checked by two skeptics.

- **No defect found** in the payout checks:
  - no legitimate payout is newly refused: hourly settlement, change orders, card-paid bookings and prorated releases were each derived;
  - no cross-booking path is left open;
  - every escrow writer is serialised.
- **One major, confirmed:** no test covered a booking holding more than its total. Added (supporting 3).
- **Applied from the minors:**
  - FIN-018 runs and reports both cases;
  - FIN-017 pins every text and adds a matching release that succeeds;
  - the provider's no-show report became its own bug test, FIN-019;
  - a test for the label clause;
  - the hourly refund leg is now checked directly;
  - plain wording for customers and providers, pesos in admin texts, and the error-level refusal log;
  - the lock-order comments were corrected.
- **Filed:** LAUNCH-LIMITATIONS 120 (the deadlock risk) and 121 (wrongly labelled bookings).

**Review 2**, of the reworked change. Three lenses: code, tests, and records. Each serious finding was checked by two skeptics.

- **Code: no defect.** The peso formatting was checked, the log holds no personal data, the hourly check refuses no flow that commits today, and the wording mappings rethrow everything else.
- **Four majors, confirmed and applied:**
  - **The hourly check had no positive test.** An exact-match version would have stopped every hourly payout unnoticed. Added the positive confirm test (supporting 10), and corrected OPS-249's mock to the amounts a real booking holds.
  - **LAUNCH-LIMITATIONS 121 was wrong** that a partly held booking cannot be refunded. It now separates the two cases, and warns that such a refund is a D36 Q1 decision.
  - **LAUNCH-LIMITATIONS 120 and a code comment named the wrong deadlock partner** for the hourly settlement, and the wrong fix. Both are corrected.
  - **The private live escalation understated live exposure** and offered support rules that cannot contain it. It was rewritten: on live, a support refund is not capped and keeps the "held" label, so only a refusal-only hotfix contains this.
- **Applied from the minors:**
  - the plain wording on the customer's confirm (supporting 11);
  - refusal-log assertions, with a mutation that removes the log;
  - a provider cancel case;
  - a race test on the partial release, where the S2-1 check is the only one (supporting 8);
  - FIN-019 reports its money outcome;
  - durable mutation logs and a runner that stops on a failed restore;
  - more exact record wording.

### Scope and limits

- **Not deployed.**
- **Live is exposed through older code.** E82 (private) describes the exposure and why only a refusal-only hotfix contains it. It also records the read-only checks and the data repair of wrongly labelled bookings (LAUNCH-LIMITATIONS 121), all waiting for Ken.
- **The recurring auto-charge** holds 1/100 of the amount. It stays contained (LAUNCH-LIMITATIONS 44, E20); after S2-1 such a booking is refused rather than paid out.
- **Not built:** the lock-order deadlock risk (LAUNCH-LIMITATIONS 120).

## S2-2: dispute filing locks the booking and keeps the true escrow label (FIN-020, FIN-021, OPS-562)

### Defect, reproduced before the fix

`fileDispute`:

- read the booking and counted its open disputes **before** its transaction, without a lock;
- then set `status = 'disputed'` **and** `escrow_status = 'held'`, whatever the money had done.

Captured against `f3e53f56`:

- **FIN-020: the label is reset.** Two bookings were both relabelled "held" by the filing:
  - one partly refunded through a real support refund, holding ₱7,500 of ₱10,000;
  - one confirmed and paid out through a real manual release, holding nothing.
- **FIN-021: the automatic refund cannot run.** A no-show dispute qualified by timing on a partly refunded booking. It tried the automatic full refund of ₱10,000, which the refund cap refused, so the filing answered 409 and no dispute was recorded: the customer could not file at all.
- **OPS-562: two filings at once.** Two simultaneous filings both passed the unlocked checks and created two disputes.

### Fix

`packages/api/src/services/dispute.service.ts`:

- **`fileDispute` locks first.** It opens its transaction first and locks the booking row. It then runs the customer, status, window and open-dispute checks on that locked row.
  - A booking that is already disputed is told that an active dispute exists; before, it was told the job was not complete.
  - The open-dispute count is a plain read. The booking lock already serialises filings, and locking dispute rows here would invert the dispute-then-booking order the dispute decisions use.
  - In normal flows the status check refuses first. The count matters only for inconsistent older data, and supporting test 2 exercises that.
- **The filing changes only the status.** The escrow label is left as it is.
- **The automatic no-show refund** runs only while the label is "held" **and** the booking still holds its whole total.
  - Otherwise the dispute stays open for an admin. The dispute's internal note says why, for example "Automatic no-show refund not run: this booking holds ₱7,500.00 of its ₱10,000.00 total (escrow label: partially_refunded). Decide this dispute manually."
  - The held amount comes from the new `escrowService.bookingEscrowHeldForLockedBookingInTransaction`, read under the booking lock. Every escrow movement's ledger row references the booking, so none can land meanwhile (supporting test 4).
- **The no-show timing setting is read before the booking lock**, so the locked transaction never waits for a second database connection (the OPS-555 rule).

`packages/api/src/services/booking.service.ts`:

- **Removed:** the general status change's relabel to "held" for `paid` and `disputed`. No role can request either target on that route. Customers and providers are refused them as flow-only (SEC-092, OPS-556, SEC-093). Admins and super admins are refused them because neither status is in their allowed list (SEC-090, SEC-091). Team members and other roles are refused all such changes. So the branch was dead. It is removed so that a later change to those rules cannot bring the relabel back; no test can reach unreachable code.

**Changed as a consequence:** a **"no refund"** decision on a dispute filed after a support refund now pays the provider what the booking still holds. The amount is shared the same way as a manual release after a support refund (supporting test 5). Before, the filing had relabelled the booking "held", so that payout was refused and left stuck. LAUNCH-LIMITATIONS 119 has a dated update, and D36 Q1 asks Ken to confirm.

**Unchanged:**

- who may file, and when;
- the window;
- the notifications;
- the automatic no-show rule on a fully held booking (FIN-016 still passes);
- refund decisions after an earlier refund (S2-3, D36 Q1).

**What admins now see.** A no-show dispute that would once have failed now opens normally, with the internal note. Until S2-3:

- a provider's "accept";
- or an admin's "full refund" on such a dispute;

is refused by the refund cap ("Refund exceeds this booking's remaining escrow"). A partial or no-refund decision works.

**Correction to E18, E59 and LAUNCH-LIMITATIONS 42** (dated notes added to each, nothing deleted):

- **No dispute after the automatic release.** The automatic 24-hour confirmation, and a customer's own confirmation, move the booking to "payout ready", and a dispute cannot be filed after that. So the automatic path never sends released money into a dispute.
- **Two narrower ways remain.** Released money could still reach a dispute after a super admin's manual release (the booking keeps its status), or through the unlocked read above, which S2-2 closes.
- **Still true, and still Ken's E18 decision:** the apps promise 48 hours, but after the automatic confirmation the customer cannot file and is told the job is not complete yet.

### Tests

**Bug tests**, each red against `f3e53f56` for the stated reason, with the final test text:

- `bug-fin-020-dispute-filing-keeps-escrow-label.test.ts`: both states always run and report. Before the fix, both labels became "held".
- `bug-fin-021-no-show-dispute-after-refund-filed-for-review.test.ts`: before the fix, the filing answered 409 and no dispute existed. After it, the dispute is open, nothing moved, and the internal note is set.
- `bug-ops-562-concurrent-dispute-filing.test.ts`: a blocker holds the booking row and both filings wait; then it lets go. Before the fix, both were recorded (received `['filed', 'filed']`). Now the second is told an active dispute already exists.

**Supporting tests**, `dispute-filing-locks-postgres.test.ts`:

1. Filing on a fully held booking keeps its label "held".
2. **A filing racing a decision on the same booking finishes without a deadlock, in either order.** The booking is first put back to "completed" while its dispute is open, an inconsistent state older data could hold, so the filing really reaches the open-dispute read. The decision always goes through, and the filing is refused with the matching message.
3. **The automatic no-show refund needs both the label and the full amount.** Two cases are filed for review: a booking labelled "held" that holds less than its total, and a fully held booking whose label is not "held".
4. **A no-show filing waits for an escrow movement in flight on the booking**, then sees the changed amount and is filed for review. No stale full refund runs.
5. **A "no refund" decision after a support refund** releases exactly what the booking holds to the provider.

**Updated mocked suites (no assertion removed):** `bug-ops-471`, `dispute-auto-refund-payment-step` and `dispute-auto-resolve-trx-med-n19`.

- They now answer the booking read and the open-dispute count inside the transaction, and fail on any read outside it.
- OPS-471 also checks that the locked read comes first.
- MED-N19 also checks that the filing never writes the escrow label.

**Mutations:** 12 runs on the final code. Each was reverted, and both source files were confirmed byte-identical afterwards. Supporting tests are numbered as above. "Mocked" means the three mocked suites, which match SQL text, not behaviour.

| Mutation | Failed |
|---|---|
| The two files at \`f3e53f56\` (red evidence) | FIN-020, FIN-021, OPS-562, supporting 2, 3, 4, 5, mocked |
| The filing sets the label to "held" again | FIN-020, FIN-021, supporting 3, 5, MED-N19 |
| No lock on the booking | OPS-562, supporting 2, 4, mocked |
| A weaker lock (\`FOR NO KEY UPDATE\`) | supporting 4, mocked |
| Lock the open disputes | supporting 2 (a deadlock), mocked |
| Count the open disputes before the lock | supporting 2 |
| Automatic refund without the new condition | FIN-021, supporting 3, 4 |
| The automatic refund checks only the label | supporting 3, 4 |
| The automatic refund checks only the amount | supporting 3 |
| No internal note when the automatic refund is skipped | FIN-021 |
| A second filing told "not complete" again | OPS-562 |
| Restore the dead status-route relabel | none: unreachable, as explained above |

### Verification

- **Focused tests.** 13/13 on PostgreSQL 17.9, run serially, zero skips:
  - the 3 bug tests and the 5 supporting tests;
  - FIN-016 and the three updated mocked suites.
- **Related dispute money suites:** `dispute-refund-commits-with-resolution-postgres`, FIN-013 to FIN-016 and `money-dispute-fixture-postgres` pass.
- **API `tsc` and eslint** on every changed file: clean.
- **Gates:** gate smoke 7/7; Gate A passes; Gate C passes. The unique regression ids went from 1,667 to 1,670.
- **Full API run (4 workers), final code:** 1,072/1,074 suites; 3,770 tests passed, 2 todo. Only the two Docker-only nginx suites (`bug-ux-201`, `bug-ux-860`) failed. The machine had recovered from the morning's slowness, and no suite timed out.

### Independent review

Three read-only lenses: code and concurrency, tests, and records and behaviour. Each serious finding was checked by two skeptics.

- **Code: no defect.**
  - The lock order has no cycle with any dispute or booking path.
  - The plain open-dispute read is enough: the only place that creates a dispute runs under the booking lock.
  - The removed relabel is unreachable for every role.
  - Error codes, messages and responses are unchanged.
  - The held-amount read is correct, and no path depended on the old relabel.
  - The old unlocked read could also let a filing overwrite a booking the automatic confirmation had just moved on. That race is now closed.
- **Four majors, confirmed and applied:**
  - **The race test could not see the lock order it named:** the status check refused first. It now uses an inconsistent older state, so the filing reaches the open-dispute read. Locking the disputes now deadlocks and fails the test.
  - **The first red log was captured before OPS-562's expected message was corrected.** It was re-captured with the final tests, and the earlier one is kept as superseded.
  - **A "no refund" decision after a support refund now pays the provider.** It is recorded as a change, pinned by supporting test 5, added to LAUNCH-LIMITATIONS 119 and put to Ken in D36 Q1.
  - **The E18 correction said "only", left out a remaining path, and lived only in a private note.** Corrected, with dated public notes on E18, E59 and LAUNCH-LIMITATIONS 42.
- **Applied from the minors:**
  - the no-show setting is read before the lock;
  - an internal note when the automatic refund is skipped;
  - a clearer message for a second filing;
  - the in-flight movement test (supporting 4);
  - two more mutations (count before the lock, weaker lock);
  - the comment placement in `escrow.service.ts`;
  - the tip deadlock recorded under LAUNCH-LIMITATIONS 120;
  - the mocked suites named in the record.

### Scope and limits

- **Not deployed.**
- **Bookings already wrongly labelled** by older code still need the data repair in LAUNCH-LIMITATIONS 121 (Ken's decision).
- **Refund decisions after an earlier refund** are S2-3 (D36 Q1).
- **Recorded, not changed:** a tip locks the customer's wallet before the booking, so a tip and a no-show filing on the same wallet-paid booking at the same moment can deadlock. One request then fails, and no money moves (LAUNCH-LIMITATIONS 120 update).
