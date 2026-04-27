# Gate 2 — Boundary Matrix — Phase 00 (Bootstrap)

**Phase:** PHASE-00 — Bootstrap
**Date:** 2026-04-27
**Reviewer:** AI coder

---

## Scope statement

Phase 00 (Bootstrap) introduces **no new functions**, **no new API endpoints**, **no new validators**, and **no money/state-machine logic**. Therefore there are no parameter spaces to enumerate boundaries over.

The only "function-like" surface this phase modified is the **npm script harness** (typecheck, lint). Boundaries for these scripts are documented below for completeness.

---

## Boundary 1 — `npm run typecheck` (root)

| Input / scenario | Expected behavior | Observed |
|---|---|---|
| Run from repo root with all 3 workspaces present | Exit 0, all 3 workspaces typecheck successfully | PASS — `typecheck-fixed.log` |
| Run with one workspace having a TypeScript error | Exit 1, error reported with workspace name prefix | Not exercised this phase (no errors injected) |
| Run when a workspace lacks a `typecheck` script | Skip that workspace (`--if-present`), continue with others | Implicit — flag in script |
| Run when no workspaces have `typecheck` script | Exit 0 (nothing to do) | Not exercised |

**Risk note:** If a future workspace is added without a `typecheck` script, it will be silently skipped. This is acceptable per `--if-present` semantics, but the AI coder should add the script when scaffolding any new workspace.

---

## Boundary 2 — `npm run lint` (root)

| Input / scenario | Expected behavior | Observed |
|---|---|---|
| Lint a `.test.ts` file using `describe`/`it`/`expect` | No `no-undef` errors (Jest globals override) | PASS — verified across 21 test files |
| Lint a `__tests__/` file using `_X` destructure | No `no-unused-vars` errors (`varsIgnorePattern: '^_'`) | PASS — `address-validators.test.ts` and `booking-validators.test.ts` both clean |
| Lint a `load-tests/*.js` file using `__ENV` | No `no-undef` errors (k6 globals override) | PASS — `auth.js`, `payment-webhook.js`, `config.js`, `booking-flow.js`, `catalog-search.js`, `full-suite.js` all clean |
| Lint a production `.ts` file with unused destructure binding | `no-unused-vars` error (rule still active in production) | Not exercised this phase (no production changes) |
| Lint a generated `.expo/` `.d.ts` file | Skipped by ignores (`**/.expo/**` recursive glob) | PASS — `apps/mobile/.expo/types/router.d.ts` no longer warns |

---

## Boundary 3 — Modified test cases in `address-validators.test.ts`

The 4 tests modified (`should require fullAddress`, `should require barangay`, `should require city`, `should require province`) test boundaries of `createAddressSchema`. Their boundary matrix is unchanged from the original test (only the destructure-binding name changed):

| Test | Input boundary | Schema boundary tested | Result |
|---|---|---|---|
| `should require fullAddress` | Object with `fullAddress` field omitted | `fullAddress` is a required field in zod schema | Schema returns `success: false` |
| `should require barangay` | Object with `barangay` field omitted | `barangay` is required | Schema returns `success: false` |
| `should require city` | Object with `city` field omitted | `city` is required | Schema returns `success: false` |
| `should require province` | Object with `province` field omitted | `province` is required | Schema returns `success: false` |

All 4 tests pass post-rename — confirmed in `gates/gate-2-alltests.log`.

---

## Conclusion

No new function signatures were introduced in Phase 00, so there are no business-logic boundaries to enumerate. The npm-script and lint-rule boundaries above cover the harness changes. The 4 modified test cases preserve their original boundary semantics; the rename was a syntactic change to satisfy `varsIgnorePattern: '^_'`.
