# Gate 3 — Future-Bugs Analysis — Phase 00 (Bootstrap)

**Phase:** PHASE-00 — Bootstrap
**Date:** 2026-04-27
**Reviewer:** AI coder

---

## Question

> "If this phase introduced a bug that won't surface for 2 weeks, what is it most likely to be?"

## Answer

The single most likely 2-week-out bug from Phase 00:

**Phase NN (some future phase) adds a fourth workspace — most likely `packages/shared` for shared types between API and web/mobile — without remembering to add a `typecheck` script to its `package.json`.** Root `npm run typecheck` runs `npm run typecheck --workspaces --if-present`, which silently skips that workspace. A type error in `packages/shared/src/some-shared-type.ts` ships through CI without being caught. The error surfaces 2 weeks later when a downstream consumer (the API or admin app) imports the broken type, the import resolves at runtime, and a property access throws `TypeError: Cannot read properties of undefined`.

### Why this specific bug

1. The harness fix in Phase 00 *intentionally* uses `--if-present` to be backward-compatible with the pre-existing 3 workspaces, which had no `typecheck` script of their own. This was the right call for Phase 00 — adding `typecheck` to all 3 was already in scope and was done. But `--if-present` is silent: the only signal to the developer is the absence of output for that workspace.
2. Phase plans further down the line (Phase 02 design system, Phase 03 type-sharing) will scaffold new workspaces. The phase plan in the `.ai-coder/phases/` directory does not currently include a checklist item "add `typecheck` script to every new workspace's package.json".
3. Type errors in `packages/shared` (or similar) are the easiest to overlook because the file might compile fine in isolation but interact badly with workspace-specific tsconfig settings (e.g. `strict`, `exactOptionalPropertyTypes`).

### Guard

**Recommended (out of Phase 00 scope, flagged for future phase):**
- Add a `verify-workspaces.sh` checkpoint that asserts every workspace's `package.json` contains a `typecheck` script. Fail the build if any workspace is missing it.
- Or: replace `--if-present` with explicit per-workspace invocations enumerated in the root script. Loses generality but gains explicitness.

**For Phase 00:** Document the risk in this file and in `gate-3-premortem.md` (Incident 1). Future phase reviewers (Ken) can use this as a pre-flight checklist item.

---

## Secondary candidates (less likely)

- A test file moved out of `__tests__/` and renamed without `.test.` or `.spec.` in its filename would lose Jest globals coverage. ESLint would re-flag it. Visible at next lint run, not a 2-week-delayed bug.
- A `_`-prefixed binding in production code goes uncaught for being truly dead. Visible in code review.

The workspace-without-typecheck scenario is the only candidate with a realistic 2-week detection lag.
