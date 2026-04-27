# Gate 2 — Paper Trace — Phase 00 (Bootstrap)

**Phase:** PHASE-00 — Bootstrap
**Feature traced:** Pre-existing harness fix (the only code change in this phase)
**Date:** 2026-04-27
**Reviewer:** AI coder

---

## Scope statement

Phase 00 (Bootstrap) by design adds **no business logic, no API endpoints, no money handling, no UI**. Per `.ai-coder/phases/PHASE-00-bootstrap.md` Step 0, the deliverables are:

- Verify pre-installed checkpoint scripts, templates, and design tokens.
- Create the phase log directory.
- Run preflight checks.
- Establish the baseline commit and file-hash manifest for the phase.

Therefore, there is no "feature" in the conventional Gate 2 sense to trace through call sites. Per `CONTINUOUS-SANITY-CHECK.md` and `DEFINITION-OF-DONE.md`, this gate is satisfied by tracing the **only meaningful code change** in this phase: the pre-existing harness fix discovered at preflight.

---

## What was traced

### Change 1: Root typecheck delegated to workspaces

**Before:**
```json
"typecheck": "tsc --noEmit"
```
Running this from repo root invoked `tsc` with the **root** `tsconfig.json` (no `references`, no `jsx`, no `paths`). TypeScript walked `apps/admin/src/**/*.tsx` with that bare config and emitted 1,350 TS17004 errors ("Cannot use JSX unless --jsx provided"), plus 205 path-resolution errors against `@/*` imports. Total: 1,555 errors. The errors were NOT real — each workspace tsconfig is individually correct.

**After:**
```json
"typecheck": "npm run typecheck --workspaces --if-present"
```
This invokes each workspace's own `typecheck` script. Each workspace runs `tsc --noEmit` from its own directory, picking up its own tsconfig:
- `apps/admin/tsconfig.json` → extends root, sets `jsx: "react-jsx"`, `paths: {"@/*": ["./src/*"]}`. Correct.
- `apps/mobile/tsconfig.json` → extends `expo/tsconfig.base` (handles JSX), `paths: {"@/*": ["./src/*"]}`. Correct.
- `packages/api/tsconfig.json` → extends root, excludes `__tests__`. Correct.

**Trace of execution:**
1. User runs `npm run typecheck` at repo root.
2. npm finds the root `package.json` `typecheck` script: `"npm run typecheck --workspaces --if-present"`.
3. npm enumerates workspaces: `apps/admin`, `apps/mobile`, `packages/api`.
4. For each workspace with a `typecheck` script, npm cds into that directory and runs `tsc --noEmit`.
5. Each tsc invocation reads the workspace's own `tsconfig.json` (which is correct).
6. Each workspace exits 0; npm aggregates and exits 0.
7. Verified: `typecheck-fixed.log` shows `EXIT=0`.

**Side effects:** None. Build, runtime, dev server, tests, deploy: all untouched. Only the typecheck command shape changed.

---

### Change 2: ESLint Jest globals override + k6 globals override + varsIgnorePattern

**Before:** `eslint.config.js` had no Jest globals override → 726 `no-undef` errors firing on `describe`/`it`/`expect`/etc. in test files. Had no k6 override → 10 `no-undef` errors on `__ENV` in `load-tests/*.js`. The `no-unused-vars` rule had `argsIgnorePattern: '^_'` only, so destructured locals named `_X` were not ignored.

**After:** Two new override blocks added (test files → Jest globals; `load-tests/**/*.js` → k6 globals), and the `no-unused-vars` rule extended with `varsIgnorePattern: '^_'`.

**Trace of execution:**
1. User runs `npm run lint` at repo root.
2. ESLint loads `eslint.config.js` (flat config).
3. For each `.ts`/`.tsx` file:
   - The base TS rules apply.
   - If the path matches `**/*.test.ts|tsx`, `**/*.spec.ts|tsx`, or `**/__tests__/**`, the Jest globals override applies → `describe`/`it`/`expect`/etc. are recognized as readonly globals; `no-undef` does not fire.
   - The `no-unused-vars` rule with `varsIgnorePattern: '^_'` ignores any local variable whose name starts with `_`.
4. For each `.js` file under `load-tests/`:
   - The k6 override applies → `__ENV`/`__VU`/`__ITER` recognized as readonly globals.
5. For files matching `**/.expo/**`, `**/node_modules/**`, etc.: ESLint skips them entirely (recursive ignore globs).
6. Verified: `lint-fixed.log` shows `EXIT=0`, zero errors, zero warnings.

**Side effects:** None on production code. The lint relaxations are scoped to test files and load-test scripts only; production source code lint rules are unchanged.

---

### Change 3: address-validators.test.ts destructuring rename + load-tests dead-var removal

**address-validators.test.ts (4 destructure renames):**
- L37 `fullAddress` → `_fullAddress`
- L43 `barangay` → `_barangay`
- L49 `city` → `_city`
- L55 `province` → `_province`

**Trace of execution per case:** All 4 tests follow the identical pattern:
```ts
const { _X, ...rest } = validAddress;          // destructure removes field X from rest
const result = createAddressSchema.safeParse(rest);
expect(result.success).toBe(false);            // validator must reject input missing X
```
The named binding (`_X`) is intentionally discarded. The destructure side-effect is the load-bearing operation: it produces `rest` without field X. The `_` prefix marks the binding as intentionally unused, satisfying the new `varsIgnorePattern: '^_'` rule. **No semantic change to the test.** Verified: 21/21 test suites pass, 320/320 tests pass — `address-validators.test.ts` included.

**load-tests/scenarios/auth.js:** removed unused `authHeaders` import. Trace: import was never used in the scenario body; removing it changes nothing about the load test execution.

**load-tests/scenarios/payment-webhook.js:** deleted dead `paymentGetDuration` Trend metric and its `payment_get_duration` threshold. Trace: the metric was declared but `.add()` was never called anywhere in the file; the threshold therefore had no data to threshold against. The scenario tests wallet GETs and webhook POSTs but never `/payments/:id` GET. Removing the dead metric does not change any assertion or HTTP call.

---

## Trace verification

| Claim | Verified by |
|---|---|
| Root typecheck delegates to workspaces | `gates/gate-1-typecheck.log` shows 3 sub-runs, all exit 0 |
| All test files lint clean with Jest globals | `gates/gate-1-lint.log` exit 0, 0 errors, 0 warnings |
| All 320 tests still pass after destructure rename | `gates/gate-2-alltests.log` shows 21 suites / 320 tests passed |
| No production code changed | Diff scope: 4 package.json + eslint.config.js + 1 test file + 2 load-test files |

## Conclusion

Phase 00 introduced no new business logic, no API endpoints, and no money flows. The only meaningful code change is the harness fix, which has been traced end-to-end above. Each downstream consumer (npm typecheck, npm lint, npm api:test, CI) has been verified to behave correctly post-fix. No paper-trace items remain for production code paths because none were modified.
