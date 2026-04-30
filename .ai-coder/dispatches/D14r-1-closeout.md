# Remediation #1 — CI workflow trigger fix

Branch: `phase/14r-1-ci-trigger-fix`
Tag (after merge): `v0.14.1-remediation-1`
Audit reference: Finding #1 in `.ai-coder/PHASE-14-REMEDIATION-MASTER-INSTRUCTION.md` lines 61-93.

<!-- gate-b: no-bugs-this-dispatch -->

## Problem

`.github/workflows/ci.yml` triggered only on `branches: [main, develop]`. The repo's default branch is `master`. Phase 14 PRs were all against master. The CI workflow's four jobs (api-check, admin-check, mobile-check, docker-build) never ran for any Phase 14 PR. Only the 5 custom Phase 14 gates ran. When closeouts said "all 5 gates green," they meant only the 5 custom gates — the heavy-lift jobs (jest API suite, admin TypeScript, mobile TypeScript, Docker build) were silent.

## Fix

`.github/workflows/ci.yml` lines 4-7:

```diff
 on:
   push:
-    branches: [main, develop]
+    branches: [master, main, develop]
   pull_request:
-    branches: [main, develop]
+    branches: [master, main, develop]
```

`master` is added as the first branch (it's the canonical default for this repo); `main` and `develop` are kept so future branch-rename or develop-flow scenarios continue to work.

## Verification

The PR for this remediation IS the verification: this PR targets `master`, and after this change merges, the CI workflow runs on every subsequent PR against master. The "All gates passed" check on this PR's status page confirms CI fired.

After merge:
- Open a comment-only test PR (e.g., README typo fix) against master.
- Confirm the CI workflow runs and all four jobs (api-check, admin-check, mobile-check, docker-build) execute.
- Tag this fix as `v0.14.1-remediation-1`.

## Files modified

- `.github/workflows/ci.yml` (one-line trigger fix)
- `.ai-coder/remediations/R01-ci-trigger-fix.md` (this file)

## Gates

- [x] Gate A — all 10 fragments PASSED locally
- [x] Gate B — meta-only PR (no-bugs marker)
- [x] Gate C — all 6 BLOCKING articles PASSED locally

## Auto-proceed decision

Finding #1 closed. Continue with Finding #2 (mobile deps).
