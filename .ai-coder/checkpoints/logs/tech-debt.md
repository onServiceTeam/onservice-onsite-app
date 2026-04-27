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
