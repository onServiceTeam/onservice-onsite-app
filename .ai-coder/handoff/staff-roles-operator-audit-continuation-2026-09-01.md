# Staff & Roles operator audit continuation

**Date:** 2026-09-01  
**Branch:** `codex/system-settings-control-fix`  
**Production:** untouched

## Completed scope

The Staff & Roles page was read end to end with its routes, validators, service,
existing tests, DPO role handover, and E39 privileged-account escalation.

The implemented checkpoint:

- keeps directory mutation dialogs open after a server failure;
- preserves the selected person, requested action, and audit reason;
- closes and clears each dialog only on confirmed success;
- adds real retries for staff, role, permission, DPO, and candidate sources;
- disables role editing until its source inventories are available;
- bounds browser fields to the same limits as the API;
- labels summary counts as company-wide;
- requires the add-profile reason inside the service before database work; and
- adds 820px and 1024px tablet visual coverage to the existing desktop matrix.

## Security boundary retained

`admin_roles.permissions` remains directory metadata. Actual access is still
`users.role` plus route RBAC. Do not wire these labels into authorization as a
page-local follow-up.

The DPO handover is different: it changes a real account role and already revokes
old access, refresh, CSRF, and socket sessions. E39 remains the controlling hold
for all other privileged-account provisioning, deactivation, emergency recovery,
last-super-admin protection, and approval governance.

## Verification at this handoff

- Admin and API TypeScript checks passed.
- New Admin behavior: 5 files and 5 tests passed.
- Staff/role/DPO regression: 13 files and 15 tests passed.
- API focused reason and existing staff audit tests: 2 suites and 6 tests passed.
- Staff & Roles Playwright update run: 20 passed.
- New tablet and changed desktop screenshots were manually inspected.
- Strict Playwright comparison without updates: 20 passed.
- Full Admin suite: 258 files passed, 1 skipped; 347 tests passed and 3 todos.
- Full locally runnable API suite: 694 suites passed, 1 skipped; 3,079 tests
  passed and 1 skipped. The unavailable Docker certificate test is not claimed.
- Full Mobile suite: 506 suites and 885 tests passed; 84 device-baseline todos.
- All workspace TypeScript checks, Admin/API production builds, full ESLint,
  Gate A, Gate C, all six gate self-tests, the phantom scan, and the justified
  N+1 heuristic passed.

## Next queue

1. Run broad Admin/API suites, builds, lint, and repository gates for this
   checkpoint.
2. Audit Tester Feedback and the database-backed third-party feedback corpus,
   tracing each issue across customer, provider, support, and admin ownership.
3. Continue the remaining admin navigation inventory and linkage ledger.
4. Do not merge or deploy while E50 and E32 remain open.
