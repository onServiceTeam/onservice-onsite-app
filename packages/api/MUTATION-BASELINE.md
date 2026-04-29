# MUTATION BASELINE — packages/api

Per Phase 14 Dispatch 0 step 0.7. This file records the mutation testing baseline established during Dispatch 0 and tracks how it evolves across subsequent dispatches.

## Phase 13 reported baseline

From Phase 13 Dispatch G subtask 1 (`mutation sweep on sacred files`):
- **Mutants run:** 1022 of 2237 (46% complete; full sweep timed out)
- **Mutation kill rate:** 99.3%
- **Surviving mutants:** 7

The 7 surviving mutants are documented in `.ai-coder/checkpoints/logs/PHASE-13/dispatch-G/mutation-summary.md`. Phase 14 Dispatches 05/06 close these.

## Dispatch 0 baseline (this run)

**Status:** PENDING — initial baseline run requires `pnpm install` of stryker packages and ~1-3 hours of compute. The configuration is ready (`stryker.config.json`); the baseline run has not been executed yet because installing stryker packages is a side-effecting action that adds entries to `package.json` + `pnpm-lock.yaml` and the AI coder cannot complete that without Ken's environment / network access.

**To complete:**

```bash
cd packages/api
pnpm add -D @stryker-mutator/core @stryker-mutator/jest-runner @stryker-mutator/typescript-checker
pnpm exec stryker run
```

The first run takes 1-3 hours depending on host CPU. Save the resulting score back to this file under "Initial baseline."

## Initial baseline

| Date | Score | Surviving mutants | Notes |
|---|---|---|---|
| TBD (Dispatch 0 step 0.7.3) | TBD | TBD | Initial run pending stryker installation. |

## Per-dispatch tracking

After each dispatch lands, add a row tracking the score on changed files:

| Dispatch | Score | Surviving | Notes |
|---|---|---|---|
| D0 | N/A | N/A | Infrastructure only |
| D01 | TBD | TBD | Filed under `secure-storage.test.ts`, `bootstrap-admin.test.ts`, etc. |
| ... | ... | ... | ... |

## Threshold policy

Per `stryker.config.json`:
- `high`: 99 — passing
- `low`: 95 — warning
- `break`: 99 — fail-build below this

Dispatch 12 promotes Gate E from REPORT to BLOCKING. Until then, surviving mutants are tracked here and addressed by the dispatch that owns the mutated code.
