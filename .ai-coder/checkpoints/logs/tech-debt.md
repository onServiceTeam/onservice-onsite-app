# Tech Debt Log

Cross-phase tech-debt items that don't fit any single phase's scope. Each item names the discovering phase, the recommended owning phase or trigger, and a brief estimate.

---

## TD-001 — Make `verify-master.sh` baseline-delta-aware

**Discovered:** PHASE-00 (2026-04-27)
**Owning trigger:** Whenever the maintainer wants per-phase gates to fire only on changes introduced by that phase, instead of on whole-repo state.
**Estimate:** 2–4 hours of harness work.

### Problem

`verify-master.sh` measures **absolute repo state**: `verify-no-forbidden.sh` greps the entire `apps/`/`packages/` tree, `verify-no-emoji.sh` likewise, etc. Each phase that does not specifically clean baseline debt currently must enumerate the pre-existing hits in its `EVIDENCE-MANIFEST.md` "Deferred to later phases" section. This is correct (transparency over silent acceptance) but tedious and prone to inconsistency across phases.

### Proposed change

For each gate that grep's the codebase, compare the *current* hit set against a *baseline* hit set captured at the phase's preflight step. Fail only on **new** hits introduced this phase. Pass with an INFO line if the baseline hit set is unchanged.

Implementation sketch:

1. During each phase's preflight, run each grep-based gate against the baseline commit and store the hits at `logs/PHASE-NN/preflight/<gate>.baseline.txt`.
2. At gate-run time, run the gate against current HEAD and store hits at `logs/PHASE-NN/gates/<gate>.head.txt`.
3. Compute `diff baseline.txt head.txt`. If only deletions or no change → PASS. If any additions → FAIL with the new hits highlighted.
4. Phase 02 (the cleanup phase) explicitly produces deletions, which is a PASS.

### Why not now

Out of Phase 00 scope. Phase 00 (bootstrap) installs the verification machinery; redesigning the machinery's evaluation semantics is a separate change. The current per-phase deferral system (named items in manifest) is acceptable until at least Phase 02 ships.

### Acceptance criteria when implemented

- Adding a new forbidden pattern in any phase causes that phase's `gate-1-forbidden` to fail.
- Phase 02 (which deletes existing forbidden patterns) passes `gate-1-forbidden` on the first attempt.
- Phases that touch unrelated code do not need to enumerate baseline debt in their manifests.

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
