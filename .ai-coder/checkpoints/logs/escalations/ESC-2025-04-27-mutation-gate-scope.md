# ESC-2025-04-27 — Mutation Gate Coverage Scope (Phase 03)

**Phase:** 03 — Runtime Config
**Branch:** `phase/03-runtime-config` (commit `63b8b9e` + uncommitted fixes)
**Hard stop:** #2 (Architectural decision needed)

## Where I am
- Phase 03 implementation is complete and committed.
- All verify-master gates PASS **except** `gate-3-mutations`.
- Other gates: typecheck PASS, lint PASS, emoji=0, forbidden=5/0, n+1=16/0, money/migrations PASS, evidence audit PASS, all jest suites PASS (gate-2-alltests).
- Working directory has 3 small unrelated fix patches (uncommitted):
  - `packages/api/src/services/settings.service.ts` — N+1 fix (while-loop + SAFE marker) — committed pending
  - `stryker.config.json` — pointed at `packages/api/tsconfig.json` + custom jest config
  - `.ai-coder/checkpoints/verify-mutation-coverage.sh` — added `--legacy-peer-deps --no-workspaces` to stryker auto-install (TD-002 workaround)

## What's blocking
The mutation gate (`verify-mutation-coverage.sh`) runs Stryker against the **full sacred-files set**:
```
escrow.service.ts, commission.service.ts, dispute.service.ts,
booking.service.ts, payout.service.ts, wallet.service.ts,
settings.service.ts
```
…with a `break: 60` threshold. The gate triggers whenever **any** money service is touched in a phase (even unrelated changes).

Phase 03 only touched `commission.service.ts` and `escrow.service.ts` (made cancellation refund + escrow timer reads async). It also added a brand-new `settings.service.ts`.

The other sacred files (`dispute`, `booking`, `payout`, `wallet`) have no Phase-03 changes, but **do have pre-existing weak test coverage** that will likely fail mutation testing. We have validator tests but no full-flow service tests for dispute/payout/wallet.

Stryker also failed during dry-run because babel-jest (its default) couldn't parse TS syntax in our test files. Fix in flight: point Stryker at `packages/api/jest.config.js` (ts-jest). Whether that succeeds or not, the underlying coverage question remains.

## Architectural decision needed
Pick one:

**A. Lower the threshold for now (`break: 30`)**, log as TD-005, plan to raise per-phase as test rigor grows. Lets Phase 03 ship cleanly. Honest weakness: tests are weak.

**B. Scope mutation gate to "touched files only"** (commission + escrow + settings). Modify `verify-mutation-coverage.sh` to compute the mutate list from `git diff --name-only $BASELINE HEAD`. Fast, focused; misses cross-phase regressions. Architectural change to the harness.

**C. Write missing tests for dispute/booking/payout/wallet now.** Days of work (Phase 03 budget already consumed). Blocks autonomous progression.

**D. Accept a documented FAIL on gate-3-mutations**, treat as TD, proceed. Violates "FINAL STATUS: PASS" requirement. Constitution-incompatible.

**E. Other** — your call.

## My recommendation
Option **B**. Mutation testing should focus on the *delta* per phase, mirroring the baseline-delta-aware logic already used by emoji/forbidden/N+1 gates (TD-001 pattern). It's consistent, focused, and catches real regressions. Pre-existing weak coverage gets logged as tech debt and addressed in Phase 12 (test-rigor sweep).

If you agree with B, I'll:
1. Modify `verify-mutation-coverage.sh` to compute mutate-list from `git diff --name-only $BASELINE HEAD | grep -E "(escrow|commission|dispute|payout|wallet|booking|settings)\.service\.ts"` and pass via Stryker `--mutate` CLI flag.
2. Re-run verify-master.
3. Amend the Phase 03 commit with the harness change + ESC reference in the commit message.
4. Continue to Phase 04.

Awaiting decision.

— Copilot
