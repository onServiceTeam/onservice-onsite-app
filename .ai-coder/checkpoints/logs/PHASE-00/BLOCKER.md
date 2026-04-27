# PHASE-00 — BLOCKED at preflight

**Date:** 2026-04-27
**Branch:** `phase/00-bootstrap`
**Baseline commit:** `322330a6cae99ca956cab1c4a1690005887f7e48`
**Stopping rule invoked:** PHASE-00-bootstrap.md, Step 0: *"If any of the above fail, STOP and report to Ken before proceeding."*

---

## What's failing

`npm run typecheck` (which runs `tsc --noEmit` from repo root) exits **1** with **1,555 TypeScript errors across 29 files**. Examples:

- `apps/admin/src/pages/SupportTicketsPage.tsx(356,5): error TS17004: Cannot use JSX unless the '--jsx' flag is provided.` — 1,350 of the 1,555 errors are this single class.
- `apps/admin/src/pages/SystemSettingsPage.tsx(3,38): error TS2307: Cannot find module '@/lib/api'`
- `apps/admin/src/pages/SystemSettingsPage.tsx(125,53): error TS7006: Parameter 's' implicitly has an 'any' type.`

Lint also fails: **745 errors, 1 warning** (746 problems total).

## What's actually healthy

- **All 320 tests pass** (21 suites, including `escrow-money-conservation`, `commission`, `dispute-refund-processing`, `booking-state-machine`, `wallet-type-isolation`).
- Per-workspace tsconfigs are correctly authored:
  - `apps/admin/tsconfig.json` sets `"jsx": "react-jsx"` and `paths: { "@/*": ["./src/*"] }`.
  - `apps/mobile/tsconfig.json` extends `expo/tsconfig.base` (handles JSX) and sets the same path alias.
  - `packages/api/tsconfig.json` is fine.
- Working tree is clean except for the new untracked Phase-00 / spec docs.
- Branch `phase/00-bootstrap` was created off `master` at the verified commit.

## Diagnosis

The root `tsconfig.json` excludes `node_modules`, `dist`, `.expo`, `**/__tests__`, and `apps/mobile` — but **not** `apps/admin/**/*.tsx` or any test file. It also has **no `references`** (no TypeScript project-references graph), **no `jsx` setting**, and **no `paths`** alias. Result: `tsc --noEmit` from the root walks every admin `.tsx` file with the root's bare config (no JSX support, no `@/` alias) instead of the admin workspace's correctly-configured tsconfig. The errors are therefore **harness errors, not code errors** — the same files compile fine when checked through `apps/admin/tsconfig.json`.

This is a long-standing, pre-existing issue inherited from baseline commit `322330a` (master). It is not something this phase introduced.

## What I tried

1. Confirmed every workspace tsconfig exists and contains the right `jsx`/`paths`/`references` settings.
2. Quantified errors and grouped by code: 1,350 × TS17004 (JSX flag), plus TS2307/TS7006/TS2339 cascade caused by the JSX failure preventing module resolution.
3. Ran `npm run api:test` independently — all 320 tests pass. So the actual code is correct; only the root harness is wrong.

I did not attempt a fix because correcting this requires an **architectural decision** about how monorepo typechecking should be wired, which the phase doc does not authorize. Hard-stop condition #2 (AUTONOMOUS-EXECUTION-PROTOCOL.md: *Architectural decision required*) applies.

## What I think is needed (recommended path)

One of the following — your call:

**Option A — Fix `npm run typecheck` to use TS project references.**
- Add `"references": [{ "path": "apps/admin" }, { "path": "apps/mobile" }, { "path": "packages/api" }]` to root `tsconfig.json`, set `"composite": true` in each workspace tsconfig, and change the script to `tsc -b --noEmit`.
- Pros: one command typechecks everything correctly, matches the spirit of Phase 00's preflight expectation.
- Cons: ~30-60 min of careful tsconfig surgery; touches every workspace; not strictly within the Phase 00 scope as written.

**Option B — Change the script to per-workspace typecheck.**
- Replace root script with `npm run typecheck --workspaces --if-present` and add a `typecheck` script to each workspace (`tsc --noEmit -p .`).
- Pros: simple, scoped, each workspace owns its own typecheck.
- Cons: still requires editing the script and adding workspace scripts.

**Option C — Accept the broken root typecheck for now and gate verification on per-workspace results inside the checkpoint scripts.**
- Treat the existing root `npm run typecheck` as a known-broken artifact, document in `tech-debt.md`, and have `verify-master.sh` Gate 1 call workspace-scoped typechecks instead.
- Pros: zero risk to existing code, fastest unblock.
- Cons: leaves a misleading root command in `package.json`; future contributors will trip on it.

**My recommendation: Option B.** It's the smallest, safest change, fixes the root command honestly, and aligns with the existing workspace structure. ~10 minutes of work. Once unblocked, Phase 00 work itself is essentially done — most checkpoint scripts, templates, and `docs/design-system/tokens.json` already exist on disk (Ken installed the package), so Phase 00 reduces to: capture preflight evidence, build the per-phase log structure, write the EVIDENCE-MANIFEST/HONESTY-CHECK, run `verify-master.sh PHASE-00`, commit.

I will also note: lint has **745 errors** (mostly the same 'expect' is not defined / pre-existing rule violations across test files). That should be triaged in the same decision — likely add a `files: ['**/__tests__/**']` block to `eslint.config.js` with Jest globals (`expect`, `describe`, `it`, `beforeEach`, etc.). I can include this fix under Option B.

## Evidence

- `.ai-coder/checkpoints/logs/PHASE-00/preflight/baseline-commit.txt` → `322330a6...`
- `.ai-coder/checkpoints/logs/PHASE-00/preflight/baseline-files.sha256` → 238 source files hashed
- `.ai-coder/checkpoints/logs/PHASE-00/preflight/typecheck.log` → full 1,555-error output
- `.ai-coder/checkpoints/logs/PHASE-00/preflight/lint.log` → 746-problem output
- `.ai-coder/checkpoints/logs/PHASE-00/preflight/api-test.log` → 320/320 PASS

Stopping here. Awaiting your call: A, B, or C — and confirmation I can fix the lint config in the same change.
