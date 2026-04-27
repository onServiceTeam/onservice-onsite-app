# ESCALATION — Phase 03 — Money / Stop 1 (verify-master fail) + Stop 3 (money-flow test gap)

**Date:** 2026-04-28
**Phase:** PHASE-03 (runtime-config)
**Branch:** `phase/03-runtime-config`
**Triggering hard-stop:** Stop 1 — `verify-master.sh PHASE-03` exits 1 after the AI coder has exhausted reasonable in-scope fix attempts; compounded by Stop 3 because the un-tested code is escrow money flow.

---

## What Ken approved (verbatim, last message)

> B. Implement mutation-gate baseline-delta scoping. Proceed with the 3 uncommitted patches and amend the commit.
> Reasoning: B mirrors the TD-001 pattern already adopted for forbidden/emoji/phantom-tests/n-plus-1.
>
> "Phase 03's gate now exercises commission and settings only — tests pass at ≥60% mutation score for both."

The factual assumption — "commission and settings **only**" — is incorrect. PHASE-03 also touched `escrow.service.ts`. Without rerunning the gate it was reasonable to believe otherwise.

## What was done (TD-005 — 100% complete and working as designed)

| Item | Status |
|---|---|
| `verify-mutation-coverage.sh` rewritten with `--phase` flag, baseline-delta scoping via `lib/baseline-diff.sh` | ✅ |
| Empty-intersection fast-skip path (`INFO: ... mutation gate skipped (TD-005).`) | ✅ |
| Dynamic per-phase Stryker config emitted to `.ai-coder/checkpoints/logs/PHASE-NN/stryker.config.generated.json` | ✅ |
| `verify-mutation-coverage-full.sh` created (full sacred-roster sweep, no `--phase`) | ✅ |
| `npm run mutation:full` script added in root `package.json` | ✅ |
| `verify-master.sh` simplified to single `--phase $PHASE` invocation; duplicate `MONEY_TOUCHED` grep removed | ✅ |
| `CONSTITUTION.md` Article 13 — added "Mutation-coverage enforcement (TD-005)" paragraph | ✅ |
| `AUTONOMOUS-EXECUTION-PROTOCOL.md` — added gate criteria item #17 (PHASE-12 launch sweep), updated baseline-delta description | ✅ |
| `tech-debt.md` — TD-005 RESOLVED entry appended (renumbered from "TD-003" in spec because TD-003 slot was already taken by the resolved expo-device entry) | ✅ |
| `stryker.config.json` (legacy static fallback) — deleted; replaced by dynamic configs | ✅ |
| Stryker `jest.configFile` corrected to `packages/api/jest.config.cjs` (was `.js`, file does not exist) | ✅ |

The gate now correctly identifies the 3 sacred files PHASE-03 touched, runs Stryker on them only, and reports per-file mutation scores. **The TD-005 deliverable itself is complete and verified working.**

## What is blocking PHASE-03 verification

`verify-master.sh PHASE-03` final status: **FAIL** on `gate-3-mutations` only (all 12 other gates PASS).

Mutation results from the now-correctly-scoped gate:

```
File                   |  total | covered | # killed | # survived | # no cov | # errors |
commission.service.ts  |  78.26 |   83.72 |       36 |          7 |        3 |       14 |   ← PASS individually
escrow.service.ts      |   0.00 |    0.00 |        0 |          0 |      256 |       25 |   ← 0% — no jest tests cover this file
settings.service.ts    |  17.81 |   33.33 |       44 |         88 |      115 |       49 |   ← weak; exhaustive CRUD/cache paths untested
All files              |  14.57 |   45.71 |       80 |         95 |      374 |       88 |   ← under 60% break threshold
```

### Why escrow shows 0%

PHASE-03's `escrow.service.ts` diff (14 lines) replaces hardcoded constants with awaited `settingsService` calls — i.e. the same async-config refactor pattern applied to commission. Specifically:
- `releaseEscrow`: `platformConfig.commissionRates[provider.tier]` → `await settingsService.getCommissionRate(provider.tier)`; `platformConfig.guaranteeFundRate` → `await settingsService.getSettingPercent('guarantee_fund_rate')`; `platformConfig.serviceFeeRate` → `await settingsService.getSettingPercent('service_fee_rate')`.
- `releasePartialEscrow`: `commissionService.calculateCommission(...)` → `await commissionService.calculateCommission(...)`.
- `handleCancellation`: `commissionService.calculateCancellationRefund(...)` → `await commissionService.calculateCancellationRefund(...)`.

The existing `escrow-money-conservation.test.ts` (6 passing tests) only exercises **pure calculation** and does not import `releaseEscrow` / `releasePartialEscrow` / `handleCancellation`. Those functions are DB-dependent (`db.query`, transactions, wallet ledger writes) and have **no jest unit tests at all** — they were planned as integration tests for a later phase. Stryker therefore reports every mutant in those functions as `NoCoverage`, dragging the file to 0%.

### Why settings shows 17%

`settings.service.ts` (443-line new file) has the existing `commission.test.ts` exercising the percent/getter paths, but the bulk write / audit-log / cache-bust / `listSettings` / `bulkUpdateSettings` / `getSettingHistory` paths have no dedicated tests.

## Decision required from Ken

The 60% threshold cannot be satisfied without writing significant new test coverage. Three viable options:

### Option A — Write the missing tests in this phase (the constitutional answer)

- New test file `__tests__/escrow-async-integration.test.ts` mocking `db`, `walletService`, `paymentService`, `settingsService` and exercising `releaseEscrow` / `releasePartialEscrow` / `handleCancellation` happy paths + error branches.
- Expand `__tests__/settings.service.test.ts` (new) to cover `listSettings`, `bulkUpdateSettings`, audit-log emission, cache invalidation, validator branches, history readback.
- Estimated effort: substantial (DB-mock test suites for both services). Pushes PHASE-03 completion noticeably further.
- Pro: keeps the constitution honest. The mutation gate is doing its job — flagging that we shipped DB-touching code with no DB-touching tests.
- Con: PHASE-03 was scoped as "runtime-config", not "back-fill escrow integration tests". Test work is real engineering, not a shim.

### Option B — Defer escrow's mutation gating to PHASE-04+ via the existing baseline-debt mechanism

- Treat `escrow.service.ts` mutation as a known deferred item: file `escrow-async-integration.test.ts` writing as the dedicated work for an early future phase (PHASE-04 or PHASE-05). Document it in `BASELINE-DEBT.md` and `EVIDENCE-MANIFEST.md` "Deferred to later phases".
- Adjust `verify-mutation-coverage.sh` to honor a per-phase exclusion list at `.ai-coder/checkpoints/logs/PHASE-NN/mutation-deferred.txt` so the gate skips files explicitly enumerated as deferred (with a justification line).
- Settings would still need to clear 60% in this phase (achievable — write the missing settings tests, ~moderate effort).
- Pro: matches the TD-001 spirit (deferred items documented, not hidden); unblocks PHASE-03 with bounded test work.
- Con: introduces a per-phase escape hatch. Must enforce: every deferred entry has a future-phase owner, and PHASE-12 full-sweep still gates absolutely.

### Option C — Lower the per-phase break threshold (e.g., 40%) and keep 60% only at PHASE-12

- Single config tweak. PHASE-03 would PASS at 14.57% only if the threshold drops below that (no — 40% would still fail because of escrow's 0% drag).
- **Effectively requires Option B's deferral mechanism anyway** to handle the 0%-coverage file. So this is not a real standalone option.

### My recommendation

**Option B**, with the following constraints:

1. Write the missing **settings** tests in this phase (`bulkUpdateSettings`, `listSettings`, history, cache-bust, validators) — should reach 60% on settings without huge cost.
2. Defer **escrow** mutation coverage to PHASE-04 (or wherever the next escrow-touching work lands), recorded explicitly in `BASELINE-DEBT.md` with an owning phase and a deadline of "before PHASE-12".
3. Add a `mutation-deferred.txt` opt-in file (one line per deferred sacred file + justification + owning future phase). Gate refuses to run if the file is missing a justification or owning phase. PHASE-12 full sweep ignores the file (absolute gate).

This stays inside the TD-001/TD-005 pattern: gates fail only on **new** debt; pre-existing debt is documented and chased by the named owning phase. The PHASE-12 absolute sweep is the safety net.

## Why I did not just write the tests

`releaseEscrow` is a 100+ line DB-transactional function reading 5 tables, writing wallet ledger entries, and emitting audit events. A faithful mocked test suite is an entire afternoon of work — large enough that the user's stated cadence ("continue autonomously through Phase 12") would benefit from explicit confirmation that paying that cost inside PHASE-03 is preferred to deferring it. The settings-service tests are tractable (~30-60 minutes); escrow tests are not.

## State of the working tree (for whichever option is chosen)

- All TD-005 harness changes are uncommitted but written to disk and verified.
- Phase 03 commit `63b8b9e` is unchanged (not yet amended).
- `verify-master-attempt-5.log` and `mutation-attempt-2.log` saved under `.ai-coder/checkpoints/logs/PHASE-03/`.
- Stryker HTML report at `.ai-coder/checkpoints/logs/PHASE-03/stryker-report.html`.
- No force-push has happened.

## Awaiting

Ken's decision among A / B / C, or a fourth option.
