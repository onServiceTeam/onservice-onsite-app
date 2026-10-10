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

**Independent review.** One read-only reviewer. No blocker. Applied:

- **The admin cancel refuses booking B's earlier statuses**, so S2-1's refusal tests would have passed for the wrong reason. The short-held "resolved" builder was added, and every Slice 2 refusal test asserts its own error message, not only the status code.
- **The released-state builder was described as the only real path. It is not**, and one of its steps has no production counterpart. The wording was corrected, and the missing "clear the marker" action is now LAUNCH-LIMITATIONS 118 and D36 Q13.
- **Two planned S2-3 refusal tests already pass on today's code**, because the refund step refuses anything above the booking's own held amount. S2-3 must assert its new interim message, or title them as supporting tests.
- **Stricter builder self-checks** (the refusal message and the end state).
- **A real bystander booking**, sized for later change-order tests.
- **The re-exported helpers**, a no-show timing helper, stronger assertions in test 5, and neutral wording.
