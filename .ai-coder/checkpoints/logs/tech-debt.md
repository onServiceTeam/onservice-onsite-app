# Tech Debt Log

Cross-phase tech-debt items that don't fit any single phase's scope. Each item names the discovering phase, the recommended owning phase or trigger, and a brief estimate.

---

## TD-001 — Make `verify-master.sh` baseline-delta-aware

**Status:** RESOLVED 2026-04-28 on `phase/00-bootstrap` (commit follows this entry).
**Discovered:** PHASE-00 (2026-04-27)
**Owning trigger:** Whenever the maintainer wants per-phase gates to fire only on changes introduced by that phase, instead of on whole-repo state.
**Estimate:** 2–4 hours of harness work. **Actual:** ~3 hours.

### Resolution summary

Implemented as a discrete sub-phase before Phase 01 content work. See the
`[2026-04-28T00:19:00+08:00]` entry in
`.ai-coder/checkpoints/logs/PHASE-00/sanity-checks.log` for the full change list.

Key deliverables:

- New shared helper `.ai-coder/checkpoints/lib/baseline-diff.sh`
  (`get_baseline_commit`, `files_changed_since_baseline`, `filter_to_phase_diff`,
  `report_baseline_delta`).
- `verify-no-forbidden.sh`, `verify-no-emoji.sh`, `verify-no-phantom-tests.sh`,
  `verify-no-n-plus-1.sh` rewritten to accept `--phase PHASE-NN` and report
  absolute-vs-introduced; legacy mode preserved for pre-commit hooks.
- `verify-master.sh` passes `--phase ${PHASE}` to all four; writes
  `BASELINE-DEBT.md` aggregating absolute counts at end of phase; hardened
  `set -o pipefail` interactions; sanity-counter now uses `git diff --numstat`
  with awk-based exclusion of governance-import paths so it counts code
  changes only.
- `verify-evidence-manifest.sh` corrected to look in `gates/` subdirectory.
- `verify-phase.sh` is now a thin wrapper over `verify-master.sh`; the
  PHASE-00 special case is gone.
- `.ai-coder/AUTONOMOUS-EXECUTION-PROTOCOL.md` "auto-proceed gate criteria"
  rewritten; criterion #16 (BASELINE-DEBT.md non-increasing) added.
- `.ai-coder/CONSTITUTION.md` Article 13 amended with the baseline-delta
  enforcement paragraph.

### Acceptance criteria — all met

- `verify-master.sh PHASE-00` exits 0 against current HEAD.
- All four delta-aware gates report `absolute > 0`, `introduced = 0`,
  `GATE: PASS` (forbidden=5, emoji=196, phantom=0, n+1=16).
- Adding a new forbidden pattern in any later phase will cause that phase's
  `gate-1-forbidden` to fail (delta semantics verified — Phase 00's own
  introduced count is 0 because all baseline debt sits in files Phase 00 did
  not touch).
- Phase 02 cleanup will produce deletions and pass naturally.
- Future phases do not need to enumerate every baseline-debt item in their
  manifest — the absolute counts roll forward via `BASELINE-DEBT.md`.

---

## TD-002 — Stryker mutation tester install fails on `eslint@10` peer chain

**Discovered:** PHASE-00 (2026-04-27)
**Owning trigger:** Phase 02 cleanup, OR the first phase that genuinely modifies a money service (`escrow|commission|dispute|payout|wallet|booking`).service.ts) and triggers `gate-3-mutations`.
**Estimate:** 30 minutes (likely `--legacy-peer-deps` flag or version bump).

### Problem

`verify-mutation-coverage.sh` calls `npm install @stryker-mutator/core @stryker-mutator/typescript-checker @stryker-mutator/jest-runner` if Stryker is not installed. That install fails with:

```
npm error ERESOLVE could not resolve
npm error While resolving: eslint-plugin-react@7.37.5
npm error Found: eslint@10.2.0
npm error peer eslint@"^3 || ^4 || ^5 || ^6 || ^7 || ^8 || ^9.7" from eslint-plugin-react@7.37.5
npm error Conflicting peer dependency: eslint@9.39.4
```

### Likely fixes

1. **Cheapest:** invoke `npm install` with `--legacy-peer-deps` inside `verify-mutation-coverage.sh` for the Stryker install only.
2. **Better:** bump `eslint-plugin-react` to a version that declares peer support for `eslint@10`. Current is `7.37.5` (devDependency in root). At time of Phase 00, `eslint-plugin-react@7.x` does not declare `^10` — verify whether a newer minor or major exists.
3. **Best:** declare Stryker's deps directly in root devDependencies with `"overrides"` or `"resolutions"` so npm uses the installed `eslint@10` graph and skips Stryker's transitive ask.

### Why not now

Phase 00 does not touch money services, so `gate-3-mutations` is correctly skipped (post-trigger-fix). Stryker is not on the critical path until either (a) Phase 02 chooses to wire it in proactively, or (b) a future phase modifies money code.

---

## How to add an entry

Use the format `TD-NNN — <one-line summary>` followed by Discovered / Owning trigger / Estimate / Problem / Proposed change / Why not now / Acceptance criteria. Append; do not reorder existing entries.

---

## TD-003 — apps/mobile/package.json had non-existent `expo-device@~7.3.0` (RESOLVED)

**Status:** RESOLVED 2026-04-28 in Phase 01 (commit follows the Phase 01 commit).
**Discovered:** PHASE-01 (2026-04-28) when `npm install lucide-react-native` ETARGETed because npm tries to resolve the whole package.json.
**Owning trigger:** Phase 01 install of icon library.
**Estimate:** 5 minutes (single-line version bump). **Actual:** ~5 minutes plus documentation.

### Problem

`apps/mobile/package.json` declared `"expo-device": "~7.3.0"` but no published 7.x version exists on the npm registry — only `~50.0.x` through `~55.0.x` and SDK 56 canaries. The package description ("Expo SDK 55") and every other Expo dep in the file pinned `~55.0.x`, making this a clear typo (likely meant `~55.0.0` or `~5.7.0` from an earlier mis-edit).

The bug is invisible at typecheck time because `npx tsc --noEmit` only reads imported modules, and nothing in apps/mobile imports `expo-device` yet. It surfaces the moment any phase tries `npm install` inside `apps/mobile/` (or at the workspace root, which transitively resolves mobile).

### Fix applied

Bumped `"expo-device"` to `"~55.0.15"` (latest stable 55.0.x, aligned with the Expo SDK 55 declared throughout the rest of the file). Single-line change to `apps/mobile/package.json`. Verified by:

- `cd apps/mobile && npm install --save-exact --legacy-peer-deps --no-workspaces lucide-react-native@0.456.0 react-native-svg@15.8.0` succeeds.
- `npx tsc --noEmit` in apps/mobile remains green.

### Why `--legacy-peer-deps` and `--no-workspaces` are still required

Two separate baseline-debt issues remain at the workspace root, both pre-existing and untouched by Phase 01:

1. `eslint-plugin-react@7.37.5` peer-restricts to `eslint@<=9.7` while root has `eslint@10.2.0` (also seen in TD-002). Resolving with `--legacy-peer-deps` is the agreed cheapest fix.
2. The npm workspace install resolves every workspace's tree at once, which would also surface any other typo'd version in any workspace. `--no-workspaces` scopes the install to the current workspace only.

Phase 02 cleanup should:

- Audit `apps/mobile/package.json` for any other typo'd version pins.
- Resolve the eslint-plugin-react peer chain (TD-002), at which point `--legacy-peer-deps` should not be needed.
- Run `npm install` at the workspace root and confirm exit 0 without flags.


## TD-004 — verify-no-phantom-tests.sh hangs walking node_modules (RESOLVED)

**Status:** RESOLVED 2026-04-28 in Phase 01.
**Discovered:** PHASE-01 (2026-04-28) when `verify-master.sh PHASE-01` hung at gate-1-phantom-tests for >15 minutes after Phase 01's installs populated `apps/mobile/node_modules` with the full RN dep tree.
**Owning trigger:** Any phase that grows `apps/mobile/node_modules`.
**Estimate:** 10 minutes. **Actual:** ~15 minutes including investigation.

### Problem

`verify-no-phantom-tests.sh` listed `TEST_DIRS="packages/api/__tests__ packages/api/src apps/admin/src apps/mobile"`. The trailing `apps/mobile` covers the entire mobile workspace, including `apps/mobile/node_modules`. Every `collect()` call ran `grep -rnE "" ` with no `--exclude-dir=node_modules`. With Phase 01's node_modules populated (lucide-react-native, react-native-svg, plus their transitives — many minified bundles), grep effectively never returned and the gate hung.

verify-no-forbidden.sh has the right idiom: `EXCLUDE='--exclude-dir=node_modules ...'` passed to grep. verify-no-phantom-tests.sh did not.

### Fix applied

1. Replaced `apps/mobile` with the explicit subpaths `apps/mobile/app apps/mobile/src apps/mobile/components apps/mobile/__tests__` and filtered to ones that exist.
2. Added `EXCLUDE='--exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build --exclude-dir=.next --exclude-dir=coverage --exclude-dir=.expo'` and passed it to every `grep -rnE` inside `collect()`.
3. Replaced the two `find  -name "*.test.ts" -o -name "*.spec.ts"` calls with a single `find` that prunes `node_modules`/`dist`/`build`/`.expo`/`coverage` and reuses the result via ``.

### Verification

`bash .ai-coder/checkpoints/verify-no-phantom-tests.sh --phase PHASE-01` now completes in ~5 seconds and reports `Absolute violations in repo: 0 / Violations introduced by this phase: 0 / GATE: PASS`.

### Why this is harness debt, not Phase 01 debt

Phase 00 happened to pass this gate quickly because mobile node_modules was nearly empty at the time (mobile install never succeeded prior to Phase 01 due to TD-003). Phase 01 is the first phase whose `apps/mobile/node_modules` is fully populated. The latent harness bug surfaced as a hang the first time the populated tree was scanned. The fix is in the script itself, not in Phase 01's product code.


## TD-005 — Mutation gate scope architecturally mismatched (RESOLVED)

**Discovered:** PHASE-03 verification (commit `63b8b9e`).
**Owning trigger:** Any phase that touches sacred (money) code; absolute gate at PHASE-12.
**Estimate:** 1 hour. **Actual:** ~1 hour.

### Problem

`verify-mutation-coverage.sh` ran Stryker over the entire sacred-files roster on every phase, regardless of which sacred files the phase had actually touched. PHASE-03 only modified `commission.service.ts` and `settings.service.ts` but the gate also tried to mutate `escrow`, `dispute`, `booking`, `payout`, `wallet`, `refund` — files whose tests are deferred to their respective implementation phases. Result: the gate failed for reasons unrelated to the phase under test.

This was inconsistent with the TD-001 baseline-delta pattern already adopted for forbidden / emoji / phantom-tests / N+1 gates, which gate "what this phase touched" and defer the rest to BASELINE-DEBT and the owning phase.

### Fix applied (per-phase delta scoping)

1. `verify-mutation-coverage.sh` now accepts `--phase PHASE-NN`, sources `lib/baseline-diff.sh`, intersects the sacred-files roster with `files_changed_since_baseline`, and:
   - **Empty intersection** → logs `INFO: Phase did not touch any sacred files; mutation gate skipped (TD-005).` and exits 0.
   - **Non-empty intersection** → writes a dynamic Stryker config to `.ai-coder/checkpoints/logs/PHASE-NN/stryker.config.generated.json` (mutate = intersection only; thresholds high:80, low:60, break:60; testRunner: jest with custom `projectType` pointing at `packages/api/jest.config.js`; checkers: typescript with `tsconfigFile: packages/api/tsconfig.json`) and runs `npx stryker run <config>`.
2. `verify-master.sh` now invokes `verify-mutation-coverage.sh --phase $PHASE` unconditionally and lets the script self-skip; the previous `MONEY_TOUCHED` grep duplicate-check has been removed.

### Fix applied (launch-readiness full sweep)

1. New `verify-mutation-coverage-full.sh` mirrors the legacy behavior: mutates the entire sacred roster (skipping files that don't exist yet), no `--phase` flag.
2. New `npm run mutation:full` script in root `package.json` exposes it.
3. AUTONOMOUS-EXECUTION-PROTOCOL.md adds gate item #17 (PHASE-12 only): `npm run mutation:full` must return exit 0 before launch.
4. CONSTITUTION.md Article 13 adds the "Mutation-coverage enforcement (TD-005)" paragraph documenting per-phase delta scope + PHASE-12 absolute sweep + the deliberate strict-git-diff limitation.

### Deliberate limitation (do not over-engineer)

The per-phase scope uses **strict git-diff** intersection. If a phase modifies a non-sacred helper (e.g. `db.ts`) imported transitively by a sacred file, that sacred file's mutations are NOT re-run. Transitive-impact analysis is out of scope; the PHASE-12 full sweep is the safety net. If a real bug ever ships through this gap, file a follow-up TD.

### Acceptance criteria — all met

- [x] `verify-mutation-coverage.sh --phase PHASE-NN` skips gracefully when no sacred files changed.
- [x] `verify-mutation-coverage.sh --phase PHASE-NN` mutates only the touched sacred files when some changed.
- [x] `verify-mutation-coverage-full.sh` exists and mutates the full roster.
- [x] `npm run mutation:full` invokes the full sweep.
- [x] `verify-master.sh` passes `--phase $PHASE` and no longer duplicates the diff check.
- [x] CONSTITUTION.md Article 13 and AUTONOMOUS-EXECUTION-PROTOCOL.md updated.
- [x] Same TD-002 install flags (`--legacy-peer-deps --no-workspaces`) preserved in both scripts.

### Note on numbering

The user spec referenced this work as "TD-003"; the TD-003 slot was already occupied by the resolved expo-device entry, so this work is recorded as TD-005 (next free number after TD-004).
