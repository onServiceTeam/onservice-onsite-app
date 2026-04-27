# Phase 00 BLOCKER #2 — verify-master.sh gates fail on pre-existing baseline state

**Discovered:** 2026-04-27 (after preflight harness fix passed)
**Phase:** PHASE-00 — Bootstrap
**Severity:** Hard stop per AUTONOMOUS-EXECUTION-PROTOCOL #2 (architectural decision required)

## Status of preflight three (per user's last instruction)

- `npm run typecheck` — exit 0 (`gates/gate-1-typecheck.log`)
- `npm run lint` — exit 0, 0 errors, 0 warnings (`gates/gate-1-lint.log`)
- `npm run api:test` — 21 suites, 320 tests passed (`gates/gate-2-alltests.log`)

**Preflight residual = 0.** The user's "no re-escalation unless typecheck/lint/test residual > 0" condition is satisfied.

## What verify-master.sh additionally fails on

Three gates outside the preflight scope, all on **pre-existing baseline state** (commit `322330a`), unchanged by Phase 00:

### Gate 1 — verify-no-forbidden.sh (5 hits, all baseline)

```
apps/mobile/src/services/upload.service.ts:42  — `as RNFormDataFile as unknown as Blob` (double cast)
packages/api/src/middleware/cache.middleware.ts:29  — empty `.catch(() => {})`
apps/mobile/src/components/ui/SuccessAnimation.tsx:31  — empty `.catch(() => {})`
apps/mobile/src/components/ui/Toast.tsx:63  — empty `.catch(() => {})`
apps/admin/src/pages/PricingRulesPage.tsx:594  — `window.confirm(...)` for delete confirmation
```

### Gate 1 — verify-no-emoji.sh (10 hits in 7 mobile files, all baseline)

Emoji used as iconography in mobile screens. The script's own comment says "After Phase 02, this should always pass" — i.e. it is **explicitly designed to be cleaned up in Phase 02**, not Phase 00.

### Gate 3 — gate-3-mutations (harness trigger bug)

```bash
if grep -qE "(escrow|commission|...)\.service\.ts" "${LOG_DIR}/preflight/baseline-files.sha256"; then
```

Trigger checks whether money services exist **in the baseline file manifest**, not whether **this phase touched them**. The baseline manifest contains every source file in the repo, so the trigger fires every phase regardless of diff. Phase 00 didn't touch any money service. After firing, gate tries to install Stryker and fails with `ERESOLVE` (stryker peer-deps incompatible with `eslint@10`).

## Why this is architecturally not "small + obvious + self-contained"

`verify-master.sh` measures **absolute state**, not **delta from baseline**. It is the right enforcement for any phase that *changes* the relevant surface, but Phase 00 (bootstrap) is explicitly "**only adds files, no business logic**" per the phase plan. The phase plan itself prescribes `verify-phase.sh PHASE-00` (a smaller script) as the Step 7 gate, not `verify-master.sh`. The AUTONOMOUS-EXECUTION-PROTOCOL elevates Phase 00 to use `verify-master.sh`, creating a contradiction.

Fixing the gates to be baseline-aware (only fail on NEW violations) is a substantial harness redesign affecting at least 3 scripts, not a small fix. Cleaning the baseline violations is explicitly Phase 02 work.

## Options

**Option A** — Run `verify-phase.sh PHASE-00` per the phase plan (Step 7), accept that verify-master.sh's broader gates are deferred to phases that actually touch their surface. Cleanest. No code changes. Phase 00 marked PASS via the gate the phase plan prescribes.

**Option B** — Fix the mutation-gate trigger (small + obvious: switch from baseline-manifest check to `git diff $BASELINE HEAD` check). Skip emoji and forbidden gates for Phase 00 by env var (e.g. `SKIP_BASELINE_GATES=1`). Document in the manifest as N/A with link to Phase 02 cleanup.

**Option C** — Do the Phase 02 cleanup inside Phase 00: replace 5 forbidden patterns with proper alternatives, replace 10 emoji icons with lucide icons, install Stryker with `--legacy-peer-deps`. Out of stated Phase 00 scope; would expand the diff substantially. Risk: introducing UI regressions in Phase 00.

**Option D** — Make verify-master.sh baseline-aware (each gate compares against baseline; passes if no NEW violations introduced). Substantial harness work. Right architectural answer but not for Phase 00 to deliver.

## Recommendation

**Option A**, then track Option D as a deferred harness improvement to land before the first phase that genuinely needs Phase 02-style enforcement. Phase 00 was explicitly designed as low-risk file-additions; verify-phase.sh covers what matters. This matches the phase plan exactly.

If you prefer **Option B**, I can implement it in this round (mutation trigger fix + env-var skip + manifest entries documenting deferral).
