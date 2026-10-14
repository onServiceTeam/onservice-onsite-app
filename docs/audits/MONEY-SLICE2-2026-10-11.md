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

Update (S2-3, 2026-10-11): this interim state is closed in the candidate; see S2-3.

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

Update (S2-3, 2026-10-11): an admin's partial or full refund decision on such a dispute is now refused before anything is recorded (`DISPUTE_DECISION_AFTER_EARLIER_REFUND`, D36 Q1). The provider's accept is still refused by the refund cap. A no-refund decision still pays the provider what the booking holds.

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

### Exact-commit CI (commit `28850c62`)

CI `38104214808` and Gates `38104214802` both succeeded, including all six Gates jobs.

- API job `114366160188`: 1,074/1,074 suites; 3,772 passed, 2 todo, 0 skipped. FIN-020, FIN-021, OPS-562, `dispute-filing-locks-postgres` and the three updated mocked suites passed.
- The admin, mobile and Docker jobs succeeded.

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

## S2-3: dispute decisions refuse what they cannot honestly carry out (FIN-022 to FIN-026)

### Defect, reproduced before the fix

An admin's dispute decision (`resolveDisputeInTransaction`, used by the admin console route and by the older dispute route) worked out its refund from the booking's total. It never looked at what the booking still held, or whether an hourly booking had been settled. Captured against `28850c62`:

- **FIN-022: a partial decision after an earlier refund refunds too much.** Support refunded ₱2,500 of booking B's ₱10,000. A "60%" decision then refunded a further ₱6,000, 60% of the original total, so the customer got ₱8,500 back in all. The booking was left holding ₱1,500, and the provider's ₱4,000 share was refused and queued for a retry that can never succeed. The decision answered success.
- **FIN-023: a "no refund" decision on a wrongly labelled booking.** The booking was labelled "held" but held ₱7,500 of its ₱10,000, the state older code left behind (LAUNCH-LIMITATIONS 121). The decision was recorded as resolved, and a release retry was queued that can never succeed.
- **FIN-024: a "no refund" decision on money already paid out.** After a super admin's manual release, the decision tried to release the money again. That was refused and left a release retry that can never succeed. Such a retry ends in Financials as "manual investigation".
- **FIN-025: a refund decision on a wrongly labelled booking.** On the same "held" booking holding ₱7,500, a "50%" decision refunded ₱5,000, which the booking's own refund cap allowed, and was recorded as resolved. The provider's ₱5,000 share could then not be paid from the ₱2,500 left, so it was queued for a retry that can never succeed.
- **FIN-026: a "no refund" decision on an hourly booking.** An hourly booking is settled to the hours worked only when the customer confirms, and a dispute always comes before that. With two hours estimated and one worked, a "no refund" decision paid the provider ₱6,800 for both hours, and the customer's unused hour was never refunded. Partial decisions also worked from the estimate. This was in the code before Slice 2; the first S2-3 review found it.

### Fix

`packages/api/src/services/dispute.service.ts`, `resolveDisputeInTransaction`. After the dispute and booking locks, and before anything is written, it reads what the booking still holds (`bookingEscrowHeldForLockedBookingInTransaction`, under the booking lock, as in S2-2), and whether the booking is hourly and settled. Then, in this order:

1. **A refund decision with nothing to pay it from** (any refund above zero while the booking holds nothing) is refused (`DISPUTE_NOTHING_HELD`). There is no clawback (D36 Q12).
2. **Any decision on a booking whose escrow label does not match its money** is refused (`DISPUTE_ESCROW_MISMATCH`). "Held" must hold the whole total, "partly refunded" less than the total, and every other label nothing. Older code could leave them apart (LAUNCH-LIMITATIONS 121).
3. **A refund decision after an earlier refund** is refused (`DISPUTE_DECISION_AFTER_EARLIER_REFUND`). What a percentage or a "full refund" means then is Ken's decision (D36 Q1).
4. **On an hourly booking not yet settled, a decision that would pay the provider from money still held** is refused (`DISPUTE_HOURLY_UNSETTLED`). Every disputed hourly booking is unsettled, because settlement happens only when the customer confirms. A full refund returns exactly what the customer paid, and a decision on a booking that holds nothing moves nothing, so both go ahead. If the booking was also partly refunded, the text says no decision can be made until both questions are answered. What the rest should mean is Ken's decision (D36 Q10).

"Settles by the hour" (marked hourly, with estimated hours and a price above zero) is now one test, `hourlySettlementApplies` in `packages/api/src/services/booking/pricing.service.ts`. The decision and the hourly settlement in `escrow.service.ts` both use it; the settlement's behaviour is unchanged.

Each refusal answers 409 with a plain message (wording D36 Q2). The nothing-held and mismatch messages name the escrow label; the mismatch and earlier-refund messages also give the amounts. Nothing is recorded and nothing moves: no dispute update, no provider suspension, no notification, no audit row, no retry. The first two (a money anomaly support must see) are logged at error, as S2-1's payout refusals are; the last two (policy holds) at warn.

**The release after a decision that refunds nothing** ("no refund", or a 0% partial or split) now happens only while the booking still holds money. Money already released or refunded stays where it is, and no retry is queued. The decision core returns this as `releaseAfterDecision`, and both callers (`adminResolveDispute` in `dispute-admin.service.ts`, and the older `resolveDispute`) use it instead of their own rule.

**Why the release still follows "the refund is zero".** The plan said to choose the release by decision type, never by "the refund is zero". That rule came from an earlier draft in which a refund would have been worked out from what is held, so a "full refund" on released money would have looked like a zero refund. In the build, the refund is still worked out from the booking's total, and every refund decision on released money is refused above. A zero refund comes only from "no refund", a 0% split, a 0% partial on the older dispute route (the admin route refuses a 0% partial, and the console asks for 1 to 100), or a fractional percentage that rounds to zero centavos. Each of these releases what the booking still holds, as before; the plan's type-only rule would have left the money stuck in the last two cases. The release is also limited to those three decision types. A full-refund decision can only refund zero on a booking whose total is zero, and the mismatch check already requires such a booking to hold nothing, so nothing is released there either way.

**Unchanged:**

- **Decisions on a fully held, non-hourly booking with no earlier refund:** full, partial, split, refund with suspension, and no refund. A partial decision still releases exactly the remainder (`escrow-payout-limits-postgres`, from S2-1), and a 0% split still releases the whole booking (releases test 5).
- **The provider's "accept" and the customer's acceptance of a partial offer.** They do not use the decision core and keep their own math. Both stay held for launch under E24 (they answer 503 outside tests). The cases where they would now differ from an admin decision are added to E24's conditions for lifting the hold (dated note in E24).
- **The automatic no-show refund** (S2-2). Its internal note still says "Decide this dispute manually"; after S2-3 such a dispute can only be decided "no refund" or left open (LAUNCH-LIMITATIONS 122 update, D36 Q1 and Q2).
- **The notification texts and the audit row** of every decision that goes through.

**What admins now see.** A refused decision shows its message under the decision form in the admin console, and the dispute stays open. The customer and the provider are not told. The admin should send a case update to both (Send message) saying the decision is on hold, and must not use a support refund to get round the refusal (LAUNCH-LIMITATIONS 121). The refund preview on that screen is still right for every decision that is allowed. It moves to a server-side amount once D36 Q1 is answered.

**FIN-015 now tests what it names again.** After S2-3, a refund above zero only runs on a booking labelled "held" that holds its whole total, so the booking's refund cap can no longer be the thing that fails. FIN-015 therefore injects a fault: the shared escrow account is set by direct SQL to hold less than the booking's ledger, as if its balance had drifted, so the refund itself fails inside the decision, and the test checks that nothing is recorded. Its earlier setup, an 80% decision after a support refund on a booking still labelled "held", is now refused by the mismatch check and is kept as a supporting test.

### Tests

**Bug tests**, each red against `28850c62` for the stated reason, with the final test text (the "old code" mutation run below):

- `bug-fin-022-partial-decision-after-earlier-refund.test.ts`: before the fix, the decision answered 200, the dispute was resolved, the booking held ₱1,500 instead of ₱7,500, and the provider's share was queued. Now it is refused with the earlier-refund message, the dispute stays open, nothing moved or was queued, and the refusal is logged at warn with its amounts.
- `bug-fin-023-no-refund-decision-on-short-held-booking.test.ts`: before the fix, the decision answered 200, the dispute was resolved, and a retry was queued. Now it is refused with the mismatch message, nothing moved, and the refusal is logged at error.
- `bug-fin-024-no-refund-decision-on-released-money.test.ts`: before the fix, a release retry was left pending. Now the decision is recorded, and no retry exists.
- `bug-fin-025-refund-decision-on-short-held-booking.test.ts`: before the fix, the decision answered 200, ₱5,000 was refunded and the provider's share was queued for a retry that cannot succeed. Now it is refused with the mismatch message, and nothing moved.
- `bug-fin-026-no-refund-decision-on-unsettled-hourly-booking.test.ts`: before the fix, the decision answered 200 and the provider was paid ₱6,800 for the estimated hours. Now it is refused with the hourly message, and nothing moved.

Every refusal test except the race test (refusals test 11, which checks the response, the held amount, the dispute and booking rows, the retry queue and the notifications) compares a whole decision snapshot before and after: the participant snapshot (wallets, ledger, bookings, payment records, support cases, audit rows, retries, providers, terms, notifications, waitlist, offers) plus the dispute and dispute evidence rows.

**Supporting tests: refusals** (`dispute-decisions-postgres.test.ts`):

1. A full-refund decision after an earlier refund is refused the same way, and is logged at warn.
2. A refund decision larger than a wrongly labelled booking holds (80% against ₱7,500) is refused for the mismatch (FIN-015's earlier setup).
3. A refund-with-suspension decision on money already paid out is refused, and the provider is not suspended.
4. A refund decision on a booking already refunded in full is refused as having nothing to pay from.
5. to 9. **States older code could leave behind:** a refund decision on a booking labelled "held" that holds nothing (refused as nothing held); a "no refund" decision on the same booking (refused, ₱0.00 held); a "no refund" decision on a booking labelled "held" that holds ₱11,000, as a duplicated hold would leave; a "no refund" decision on a booking labelled "released" that still holds its money; a "no refund" decision on a booking labelled "partly refunded" that still holds its whole total. Each of the last four is refused for the mismatch.
10. The older dispute route refuses a partial decision after an earlier refund the same way.
11. **A decision waits for an escrow movement in flight on the booking.** A blocker adds a ₱1,000 hold without committing; its ledger row's foreign key is the only lock on the booking. The decision waits, then sees ₱11,000 and is refused instead of releasing; the dispute stays open, and nothing is queued or sent.
12. and 13. **The order of the checks:** a refund decision on a booking labelled "partly refunded" that holds nothing is refused as nothing held, and one on a booking labelled "partly refunded" that still holds its whole total for the mismatch; both are logged at error, not as the earlier-refund hold.
14. A "no refund" decision on an hourly booking not yet settled that was also partly refunded is held back with its own text.
15. A partial decision on an hourly booking not yet settled is held back.

**Supporting tests: releases** (`dispute-decision-releases-postgres.test.ts`):

1. A "no refund" decision on a booking labelled "partly refunded" that holds nothing is recorded, and no release is queued.
2. The older dispute route records a "no refund" decision on money already paid out without queueing a release.
3. The older dispute route releases a fully held booking after a "no refund" decision (₱6,800 to the provider).
4. The older dispute route releases a fully held booking after a 0% partial decision: the evidence for the release rule above.
5. A 0% split decision on a fully held booking releases the whole booking to the provider side, as before.
6. A full-refund decision on an hourly booking not yet settled still goes through: the customer gets ₱10,000 back and the provider nothing.
7. and 8. A "no refund" decision on an hourly booking not yet settled is recorded and pays nothing when its money was already refunded in full, or already released by a super admin.
9. to 11. **The hourly rule is the settlement's own:** a "no refund" decision releases the whole booking on an hourly booking already settled (billed hours set by direct SQL, because a settled booking is normally past the point a dispute can be filed), on a booking marked hourly with no estimated hours, and on a booking with estimated hours that is not marked hourly.
12. **R-MON-03 acceptance, over HTTP.** After a ₱2,500 support refund, the partial and full decisions are refused, and nothing moves. A "no refund" decision then releases exactly what the booking holds: ₱5,100 to the provider, 75% of its ₱6,800 share. The payment record stays "partly refunded, ₱2,500". Nothing is left queued, and the bystander booking's ₱50,000 is untouched.

**Updated suites (no assertion removed):**

- `bug-fin-015`: reworked as explained above.
- `services/dispute-resolve-tx`: its mocked decision core now returns `releaseAfterDecision` (false for refunds, true for "no refund"), and the full and partial refund cases also check that no whole-booking release runs.
- `gateway-retry-queue-med-n28`: its three mocked decisions return `releaseAfterDecision` (false, false, true). The release assertions are unchanged.
- `bug-ops-314`: its escrow mock now also answers the held-amount read, with the booking's full total.
- `escrow-payout-limits-postgres`: the production hourly columns it added itself now come from the dispute fixture (`helpers/dispute-postgres.ts`), because the decision reads them.

**Mutations:** 29 mutations on the final code, after both review rounds. The runner restores both files after each one and confirms they are byte-identical, and a run with no mutation passed 66 of 66 first. Only real assertion failures count as a catch. This machine produced many connection timeouts after the day's power cuts; they are listed but not counted, and the one mode whose catch was hidden by a timeout (the older route's old release rule) was rerun and caught.

- **28 of 29 are caught.** Supporting tests are numbered as in the lists above.
- **One is equivalent:** limiting the release to the three decision types changes nothing. A full-refund decision can refund zero only on a booking whose total is zero, and the mismatch check already requires such a booking to hold nothing.
- **Some catches are by error code, message or log level only, with no difference in money** (marked). For those, the booking's own refund cap or another refusal still stops the money.
- The two earlier rounds (17 modes on the first build, 24 on the second) are kept in the private logs.

| Mutation | Caught by |
|---|---|
| The two dispute files at `28850c62` (red evidence) | FIN-022, FIN-023, FIN-024, FIN-025, FIN-026, refusals 1, refusals 2, refusals 3 and 17 more |
| All four refusals removed | FIN-022, FIN-023, FIN-025, FIN-026, refusals 1, refusals 2, refusals 3, refusals 4 and 12 more |
| No "nothing held" refusal | refusals 3, refusals 4, refusals 5, refusals 12 (code, message or log level only; same money) |
| "Nothing held" only below zero | refusals 3, refusals 4, refusals 5, refusals 12 (plus 6 environment timeouts, not counted) (code, message or log level only; same money) |
| No label and money check | FIN-023, FIN-025, refusals 2, refusals 6, refusals 7, refusals 8, refusals 9, refusals 11 and 1 more |
| "Held" may hold less than its total | FIN-023, FIN-025, refusals 2, refusals 6 |
| "Held" may hold more than its total | refusals 7, refusals 11 |
| "Partly refunded" may hold its whole total | refusals 9, refusals 13 |
| Other labels may still hold money | refusals 8 |
| No earlier-refund hold | FIN-022, refusals 1, refusals 10, releases 12 (R-MON-03) |
| Earlier-refund hold checked before the mismatch | refusals 13 (code, message or log level only; same money) |
| Earlier-refund hold checked first | refusals 12, refusals 13 (code, message or log level only; same money) |
| No hourly hold | FIN-026, refusals 14, refusals 15 |
| Hourly hold ignores what is held | releases 7, releases 8 |
| Hourly hold only for decisions that refund nothing | refusals 15 |
| Hourly hold ignores whether the hours were settled | releases 9 |
| Hourly test uses only the hourly flag | releases 10 |
| Hourly test uses only the estimate | releases 11 |
| One hourly text for both cases | refusals 14 (code, message or log level only; same money) |
| Release not limited to the three decision types | none: equivalent (see above) |
| Release whatever the booking holds | FIN-024, releases 1, releases 2, releases 7, releases 8 |
| Money anomalies logged at warn | FIN-023, FIN-025, refusals 2, refusals 3 (plus 4 environment timeouts, not counted) (code, message or log level only; same money) |
| Weaker booking lock (`FOR NO KEY UPDATE`) | refusals 11 (plus 1 environment timeouts, not counted) |
| No booking lock | refusals 11 (plus 18 environment timeouts, not counted) |
| A failed refund is ignored | FIN-015 (plus 35 environment timeouts, not counted) |
| Admin route keeps its old release rule | FIN-024, releases 8 (plus 29 environment timeouts, not counted) |
| Admin route never releases | dispute-resolve-tx, MED-N28, releases 5, releases 9, releases 10, releases 11 (plus 14 environment timeouts, not counted) |
| Older route keeps its old release rule | releases 2 |
| Older route never releases | releases 3 (plus 7 environment timeouts, not counted) |

### Verification

- **Focused tests, final code:** the 12 decision test files, 66/66, serially on PostgreSQL 17, zero skips. They are:
  - the five bug tests and FIN-015;
  - both supporting files;
  - `escrow-payout-limits-postgres`;
  - the mocked `dispute-resolve-tx`, `gateway-retry-queue-med-n28` and `bug-ops-314`.

  Earlier, on the second build, all 18 dispute-related suites passed 130/130.
- **API `tsc` and eslint:** clean on every changed file.
- **Gates:** unique regression ids 1,675 (was 1,670); Gate C passes; Gate A passes; gate smoke 7/7.
- **Full API run (3 workers), final code:** 1,049/1,081 suites; 3,744 tests passed, 2 todo, 60 failed.
  - **Every failure inspected was the environment:** connection and lock timeouts against the local database (5-second limits) while this machine was overloaded after three power cuts, process-start timeouts, and the two Docker-only nginx suites.
  - None of the failing suites touches dispute decisions, escrow or hourly pricing.
  - Exact-commit CI below is the clean full run.
- **Two incidents during this step, both mine, both recovered:**
  1. **A script edited the wrong file.** A drafting script for the next step briefly edited `packages/api/src/services/booking.service.ts`, for about 90 seconds during a mutation run, because its path was still hard-coded. It was restored byte-exact; no test in that run uses change-order payment. The script now refuses to run without an explicit target.
  2. **A stopped mutation runner kept running.** It erased part of the second-round change in `dispute.service.ts` and left a mutated file until a power cut ended it. It was found because the change was missing. The file was restored from the runner's own backup, which is identical to the reviewed snapshot; the change was re-applied, checked line by line and type-checked. All results from that runner after the stop were discarded. The final runner restores its files on any exit and stops at a STOP file, and the final mutation run above was made with it.

### Exact-commit CI

CI `38142455973` and Gates `38142456150` both succeeded on `b75985b2`.

- API job `114478920798`: 1,081/1,081 suites; 3,804 passed, 2 todo, 0 failed. FIN-022 to FIN-026 and both supporting files passed. This is the clean full run the local timeouts above could not give.
- The admin, mobile and Docker jobs succeeded.

### Independent reviews

Two read-only reviews, each with three lenses (code and money safety, tests, records and behaviour) and two skeptics on every serious finding.

- **Review 1 (first build): no blocker; four majors confirmed and applied.**
  - The hourly "no refund" paid the estimate: FIN-026 and the hourly refusal.
  - The refund side of the mismatch check was untested on money: FIN-025.
  - FIN-015 no longer reached its fix: reworked.
  - The older route's release was untested: releases tests 3 and 4.

  Its 19 minors were applied, except the optional below-zero ledger tests: no code path produces a negative ledger.
- **Review 2 (second build): the code lens found the guard sound for every reachable state, and checked every escrow writer for regressions (none).** Two majors were confirmed and applied:
  - The hourly refusal ignored what the booking holds. It now applies only when the decision pays the provider from money still held (releases tests 7 and 8).
  - A private escalation's suggested stopgap was wrong. It is corrected privately.

  Minors applied:
  - the hourly test shared with the settlement;
  - check-order tests;
  - the race test without an explicit lock;
  - log assertions, and the dispute rows in the snapshot;
  - record wording;
  - LAUNCH-LIMITATIONS 124 widened and 125 added;
  - the handbook list, and the no-show note.

### Scope and limits

- **Not deployed.** Live exposure is described in E82 (private).
- **R-MON-03 closes only when D36 Q1 is answered.** Until then, refund decisions after an earlier refund are refused.
- **Hourly disputes** wait for D36 Q10: until then, on an hourly booking not yet settled, only a full refund, or a decision on a booking that holds nothing, can be made. An hourly booking that was also partly refunded cannot be decided at all.
- **Bookings already wrongly labelled** by older code still need the reviewed data repair in LAUNCH-LIMITATIONS 121 (Ken's decision). Until then, every dispute decision on them is refused: a refund decision on one that holds nothing as having nothing held, every other decision with the mismatch message. Such disputes stay open.
- **The participant paths** (provider accept, accepted partial offer) are unchanged and stay held under E24.
- **The wording** of all the refusals, and of the S2-2 internal note, waits for Ken's approval (D36 Q2).
- **Before release,** the company handbook (`docs/operations/09-trust-safety-and-disputes.md`, sections 2.5, 2.6, 4, 5 and 6, including a "decision on hold" case-update template) and the admin training manual (`docs/operations/11-admin-system-training-manual.md`, sections 2.11 and 2.12) must be updated for S2-1 to S2-3.
- **Recorded, not changed:**
  - a support refund between a partial or "no refund" decision and its post-commit payout leaves that payout refused and queued (LAUNCH-LIMITATIONS 124); the fix belongs with S2-9b;
  - a super admin's manual release and an admin force-complete pay hourly bookings for the estimate (LAUNCH-LIMITATIONS 125);
  - a ledger sum below zero is not produced by any code path; the refusals treat it as nothing held or a mismatch, and no test builds one.

## Live deploy (2026-10-11)

At Ken's request (about 18:40), PR81 was deployed to the live tester server (46.62.207.225) the same evening. This is a deploy to the tester box, not a production launch.

- **What is live:**
  - **About 20:30:** the API, the customer and provider web app and the admin web app at `28850c62`, with database migrations 157 to 179.
  - **About 22:13:** the API at `b75985b2` (S2-3; no migration, no web change).
- **How it was done:**
  - backups first;
  - a rehearsal of the migrations on a copy of the live database (deleted afterwards);
  - the reviewed release helpers for migrations and activation;
  - new web files added beside the old ones, with each entry page swapped last.
  - Each step was verified from outside: served files equal the builds, new endpoints answer, protected routes still need sign-in.
- **What changed for live users:** see LAUNCH-LIMITATIONS 126.

## S2-4: change-order money, real-database evidence (R-MON-04; no application change)

**Status.** The previous Claude account built these tests on 2026-10-12 and parked them uncommitted. They were finished on 2026-10-14 on top of `11337a7b`, which already contains S2-0 to S2-3. No production code changed. Not deployed.

**Review finding, fixed the same day.** The first version of this record had six tests and said they proved the whole payment step is all-or-nothing. An independent review showed that was not true for the customer's wallet debit. If the debit and its ledger row were moved into a separate transaction that runs after the main one commits, all six tests still passed. In real use that change would mark the change order paid, raise the booking total and hold the extra money in escrow, and then a failed debit would leave the customer uncharged: a platform loss. The production code is correct (the debit is inside the transaction). The gap was in the evidence, on the step that matters most. A seventh test (test 4 below) now makes the debit fail inside the database, and it catches that change. The mutation table below includes it as `debitaftercommit`.

**Why the titles are not "Bug" titles.** Paying an approved change order from the wallet is already one database transaction (`finalizeChangeOrderPayment`, `packages/api/src/services/booking.service.ts:3051-3226`). In the code, the wallet debit, the paid status, the new booking totals, the `change_order_authorized` terms version and the escrow hold commit together or not at all. Until now only a mocked test (`b-crit15-change-order-payment-proof.test.ts`) covered this. The seven new tests check it against real PostgreSQL. Nothing is fixed, so the titles read "R-MON-04 - ...". The mutations below show which changes the tests catch.

**What changed (tests only):**

- **`packages/api/__tests__/helpers/change-order-postgres.ts` (new).** A guarded fixture on top of the S2-0 money fixture.
  - The `change_orders` table is written by hand from migrations 018, 036, 059 and 139. Migration 018 cannot run as a file here, because it also creates and alters the quote tables. `change_order_line_items` is migration 141 itself.
  - Booking B (price ₱8,000, fee ₱2,000 at 25%, total ₱10,000, wallet-paid and fully held) is put back in progress.
  - Provider B raises the change order, and customer B approves and pays it, through the real booking router with real sign-in tokens.
  - Customer B's wallet holds ₱10,000 after paying for booking B: enough for two change orders.
  - It is not stacked on the staff-evidence fixture, whose bare `change_orders` table would collide.
- **`packages/api/__tests__/change-order-payment-postgres.test.ts` (new).** The seven tests below.
- **`packages/api/__tests__/helpers/dispute-postgres.ts`.** `waitForWaiters` now waits up to 20 seconds of clock time instead of 300 polls. On a loaded machine an HTTP request can take several seconds to reach the lock. On 2026-10-12, 1 in 5 runs of the expiry race gave up too early. Waiting longer never weakens an assertion; a real failure only shows later.

**The seven tests.** All use booking B. A ₱2,000 change order makes the price ₱10,000 and the fee ₱2,500, so the customer pays ₱2,500 more and the total becomes ₱12,500.

1. **Paying moves the money, the price and the terms together.** After one payment over HTTP:
   - the change order is `paid`;
   - the customer wallet goes from ₱10,000 to ₱7,500, with one `payment` row that names the change order;
   - the escrow wallet gets a second `escrow_hold` row of ₱2,500, so booking B holds ₱12,500;
   - the booking's price, fee and total are ₱10,000, ₱2,500 and ₱12,500, still labelled `held`;
   - the newest terms version is `change_order_authorized` for this change order, with the same three amounts;
   - the bystander booking is untouched.
2. **A failure while holding the money leaves everything as it was.** The escrow hold is made to fail once. The route answers 500. A full snapshot is identical to before. It covers, among others, wallets, ledger, bookings, payment records, terms, notifications, support cases, admin actions, retry rows and change orders.
3. **A failure while recording the terms leaves everything as it was.** The same, with the terms step failing.
4. **A failure while taking the money from the wallet leaves everything as it was.** Added after the review. The wallet debit is two plain SQL statements on the open transaction: the balance update and its ledger row. A jest spy cannot reach them, so a trigger in the test schema makes one of them fail inside the database. The trigger counts each refusal in a sequence, which keeps its count when the transaction rolls back. Each statement is made to fail in turn. Both times the route answers 500, the trigger fired exactly once, and the full snapshot is identical to before. Both statements are tried because a statement moved out of the transaction only shows when it, or one after it, fails.
5. **Two payments at the same moment take the money once.** A blocker holds booking B's row while two payments start and queue. When it lets go, one payment gets 200 and the other 404. The wallet is debited once, booking B holds ₱12,500, and there is one change-order terms version.
6. **A change order that expires while it is being paid ends one way only.** The approval is 25 hours old, past the 24-hour default. A blocker holds the change order's row while the payment and the expiry worker queue in a fixed order, then lets go. Both orders are run:
   - payment first: 200, nothing expired, `paid`, and the money moved once;
   - expiry first: the payment gets 404, one change order expired, `expired`, and nothing changed except the status and the two expiry notices.
7. **Confirming after a paid change order pays out the amended total.** Booking B is marked complete directly (the provider's completion step has its own evidence checks, which are not under test here), and customer B confirms over HTTP. Booking B holds nothing and is labelled `released`. The provider, platform revenue and guarantee fund wallets hold ₱12,500 between them, and the provider got ₱8,500, 85% of the amended ₱10,000 price. The bystander booking is untouched.

**Mutations.** Run on 2026-10-14 against the current `booking.service.ts` (sha1 `7ccda03a1fbb7fe428a078f4dfd4b1eb18eec424`, identical to `HEAD`), one at a time. The change-order part of that file is byte-identical to the copy the 2026-10-12 run used. After each mutation the file was restored from a backup and checked with `cmp` and its sha1. The 2026-10-12 runner script was not kept, so the first eight mutations were rewritten from their recorded names and the plan. Against the first six tests, each of the eight failed the same number of tests as recorded on 2026-10-12. After the review, all mutations were run again against the seven tests; the table shows that run (test numbers as listed above). The last five rows were added after the review.

| Mutation | What it breaks | Failed (of 7) |
|---|---|---|
| holdaftercommit | The escrow hold runs in its own transaction after the main one commits | test 2 |
| termsaftercommit | The terms version is written in its own transaction after the main one commits | test 3 |
| nocolock | No row lock when the payment step reads the change order | tests 5 (both payments 200) and 6 (an expired change order paid) |
| nostatusfilter | The payment step no longer requires the change order to be `approved` | tests 5 and 6 |
| holdless | Escrow holds one centavo less than the customer paid | tests 1, 5, 6 and 7 (the confirm is refused with 409) |
| nodebit | The customer wallet balance is never reduced | tests 1, 4 (the balance update never runs, so the payment answers 200), 5 and 6 |
| nototals | The booking's price, fee and total are not updated | tests 1, 5 and 7 |
| expirenostatus | The expiry worker expires change orders whatever their status | test 6 (a paid change order turned to `expired`) |
| debitaftercommit | The whole wallet debit (balance update and ledger row) runs in its own transaction after the main one commits | test 4 only. The other six all passed, which is the review finding: before test 4 existed, this change survived. |
| balanceaftercommit | Only the balance update runs after the main commit | test 4 |
| ledgeraftercommit | Only the ledger row runs after the main commit | test 4 (when the ledger row fails, the wallet had already lost ₱2,500 with no ledger row) |
| paidaftercommit | The change order is marked `paid` after the main commit | tests 5 (both payments 200) and 6 (the expiry worker expired a change order that was then marked paid) |
| totalsaftercommit | The booking's new price, fee and total are written after the main commit | tests 1 (the terms version keeps the old amounts, because it reads them from the booking) and 7 |

All 13 were caught. One more, `nobookinglock` (no `FOR UPDATE` on the second read of the booking), passed 7/7. It changes nothing, so no test can catch it: the first query of the payment step (`SELECT co.* FROM change_orders co JOIN bookings b ... FOR UPDATE`, with no `OF` list) already locks the booking row as well as the change order. A throwaway check on the local test database confirmed this: while that query's transaction was open, `SELECT ... FROM bookings ... FOR UPDATE NOWAIT` on the same booking was refused with 55P03 (lock not available).

**Verification (2026-10-14, local PostgreSQL 17.9):**

- **The seven tests:** 7/7, zero skipped; four more runs, 7/7 each. (Before the review: the six tests, 6/6, then five more runs at 6/6.)
- **Every suite that uses `waitForWaiters`** (9 suites, including this one): 69/69, zero skipped, re-run after test 4 was added (68/68 before it).
- **The other 15 suites that import `dispute-postgres.ts`**, directly or through the money fixture: 31/31, zero skipped. This was run before the review. The review change touched only the change-order test file, which no other suite imports, so it was not re-run.
- **API `tsc`:** clean. It does not cover `__tests__`; ts-jest type-checks the test files (in strict mode) when it runs them.
- **eslint** on the three changed code files: 0 errors, 0 warnings. The test file was linted again after test 4 was added.
- **Gate C:** every article passes. The unique-regression-ids check passed when run directly with Python 3.12, because `python3` on this machine is the Windows Store stub and the wrapper could not start it. The new tests have no "Bug" titles, so they do not change the count. Gate C was not re-run after test 4 was added; it also has no "Bug" title.
- **Not run:** the full API suite (other agents were using the machine), Gate A, and exact-commit CI.
- **Independent review:** one finding (the wallet debit, above), fixed with test 4. The fix itself has not had a second review.

**What R-MON-04 still lacks.** These tests prove the wallet payment step is all-or-nothing: a failure in the debit, the terms version or the escrow hold undoes everything, and moving any one of the step's six writes into its own transaction after the main one commits is caught (table above). They do not finish R-MON-04, which stays "partly fixed":

1. **The customer is told something false.** After a change-order payment the route answers "Additional payment completed. The provider has been notified." (`packages/api/src/routes/booking.routes.ts:454`), but no notice is sent, and nothing in `src` sends one. S2-11 sends a real notice. The provider's notice and the customer's text wait on D36 Q5.
2. **Change-order money has no funding record of its own.** The second `escrow_hold` row carries no change-order reference, and there is no per-booking money record (K01). The extra money cannot be traced or refunded on its own. S2-7 adds interim traceability; K01 itself is D36 Q11.
3. **Card-paid and partly refunded bookings still accept a change order.** The payment step checks only the booking status (`booking.service.ts:3089-3097`), not how the booking was paid or whether its money is still fully held. S2-6 builds a refusal. Whether a card-paid booking may take a wallet-paid change order is D36 Q3, and the refusal wording is D36 Q4. These tests do not cover those bookings, because the right behaviour is not decided yet.
4. **Change-order limits** (50% of the current price for each change order, and how many may wait for payment at once) wait on D36 Q9.
5. **The reusable card-payment proof** in the same function (`booking.service.ts:3106-3143`) is still there. Removing it is S2-5, which needs no decision.
