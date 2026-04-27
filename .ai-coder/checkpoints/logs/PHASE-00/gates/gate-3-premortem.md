# Gate 3 — Pre-Mortem — Phase 00 (Bootstrap)

**Phase:** PHASE-00 — Bootstrap
**Date:** 2026-04-27
**Reviewer:** AI coder

---

## Methodology

Brainstorm 5 plausible incident scenarios in which the Phase 00 changes contribute to a future production or development outage. For each, document the trigger, blast radius, mitigation already in place, and remaining risk.

---

## Incident 1 — Workspace added without typecheck script, regression slips through

**Trigger:** Future phase scaffolds a new workspace (e.g., `packages/shared`) without adding a `typecheck` script. Root `npm run typecheck` skips it silently due to `--if-present`. A type error in the new workspace ships to production via CI.

**Blast radius:** New workspace's runtime errors surface only in production, not in CI. Possible runtime crashes for affected feature.

**Mitigation already in place:**
- This pre-mortem is itself the documentation. Future phase plans MUST add a `typecheck` script when scaffolding workspaces.
- Workspace's own `package.json` and `tsconfig.json` files would be reviewed in the phase commit.

**Remaining risk:** Medium. `--if-present` is silent; an inattentive reviewer could miss it. Consider adding a CI check that asserts every workspace has a `typecheck` script before CI declares success — but this is out of Phase 00 scope.

---

## Incident 2 — Jest globals override matches a non-test file, hides real `no-undef` bugs

**Trigger:** A future production source file accidentally lives under a path matching `**/__tests__/**` (e.g., a real module mistakenly placed in `src/__tests__/utilities.ts`). The Jest globals override applies; if the file references `expect` or `describe` by mistake, ESLint does not flag it.

**Blast radius:** Low — production code calling `describe()` would crash at runtime (Jest is not loaded in production). A test pretending to be a module is a code-smell that would be caught in code review.

**Mitigation already in place:**
- Override is scoped narrowly to `*.test.ts(x)`, `*.spec.ts(x)`, or `__tests__/**`.
- `tsc` would still error on `Cannot find name 'describe'` because Jest types are only loaded in test contexts (and `tsc` runs even on the override-matched files via the workspace's typecheck).

**Remaining risk:** Low. The TypeScript compiler is the second line of defense and would catch misuse.

---

## Incident 3 — k6 override matches a non-k6 `.js` file, hides `no-undef` for `__ENV`

**Trigger:** A non-k6 `.js` file is added under `load-tests/`. ESLint thinks `__ENV` is a global there. The file is bundled into a build that doesn't actually have k6's `__ENV` injected at runtime.

**Blast radius:** None for production (load-tests/ never ships to production). Worst case: load test fails at runtime with "ReferenceError: __ENV is not defined" if k6 isn't running it.

**Mitigation already in place:**
- `load-tests/` is documented as the k6 directory. The override is scoped to `load-tests/**/*.js` only.
- `load-tests/` is excluded from production builds.

**Remaining risk:** Negligible.

---

## Incident 4 — `varsIgnorePattern: '^_'` lets developer hide a real unused variable

**Trigger:** Developer renames a real-but-unused variable to `_x` to silence the lint warning, instead of removing dead code. Dead code accumulates.

**Blast radius:** Code rot, increased review burden. No runtime impact.

**Mitigation already in place:**
- Convention is well-established (already used in `booking-validators.test.ts` for the omit-a-field idiom).
- Code review would catch a misuse where `_x` is assigned a value that should have been used.
- The Constitution Article (no dead code) is a separate guard.

**Remaining risk:** Low. Standard ESLint convention; no project-specific risk.

---

## Incident 5 — Recursive `**/.expo/**` ignore hides a real lint issue inside a workspace's `.expo/`-named source folder

**Trigger:** A future workspace creates a directory legitimately named `.expo` containing source code (very unlikely — `.expo` is conventionally Expo's generated cache). ESLint ignores it; bugs go unflagged.

**Blast radius:** Negligible. `.expo/` is universally Expo's generated directory, never a place for source code.

**Mitigation already in place:**
- Convention: `.expo/` is reserved for Expo CLI output and is gitignored across the JS ecosystem.
- The previous narrower ignore (`'.expo/'`) had the same intent but failed to match nested workspace paths — strictly worse.

**Remaining risk:** Negligible.

---

## Summary table

| # | Likelihood | Severity | Detection lag | Notes |
|---|---|---|---|---|
| 1 | Medium | Medium | Until production | Add CI guard in a future phase |
| 2 | Low | Low | TypeScript catches | Defense in depth |
| 3 | Negligible | None | Test runtime | Scoped narrowly |
| 4 | Low | None | Code review | Standard convention |
| 5 | Negligible | None | Convention | Strictly better than before |

The highest-priority follow-up: add a CI guard that asserts every workspace has a `typecheck` script (covers Incident 1). Documented here for tracking; not in Phase 00 scope.
