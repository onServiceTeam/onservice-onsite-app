# Provider weekly schedule: concurrent replacement

Date: 2026-09-06, Asia/Singapore. Baseline
`eec230147398f6bbbe128e64016daddd20f1ad8f`. Candidate work, not deployed.

## Finding and correction

The weekly PUT accepts one to seven distinct weekdays and replaces the saved
week. `setSchedule` already used a transaction, but its DELETE could begin before
another replacement committed. Under PostgreSQL's ordinary statement snapshots,
concurrent disjoint partial-week requests can leave a combination of both
submissions. Migration 010's unique provider/day constraint does not prevent a
combination of different days. This finding follows the SQL interleaving; a local
PostgreSQL reproduction is not claimed because no safe local instance is running.

OPS-499 locks the existing provider row before deleting/replacing weekly rows,
inside the same transaction. The second save for that provider therefore starts
its replacement after the first finishes. Other providers use different row
locks. A missing provider returns an operational 404. This follows the existing
date-override replacement pattern and preserves the established whole-week PUT
semantics. No schema, dependency, role permission, eligibility rule, booking,
commission, price, payment or production data changed.

This is a bounded per-provider serialization fix, not a global lock, an
optimistic version-conflict workflow or a performance-at-scale certification.
The last serialized successful replacement still wins. The form's separate
local edit-revision guard does not warn about another device's newer version.

## Behavioral verification

`packages/api/__tests__/bug-ops-499-weekly-schedule-concurrent-replacement.test.ts`
uses the actual service, pg connections, transactions and database locks.
It does not mock persistence or infer correctness from source text.

The generated isolated schema now preserves migration 010's weekly primary key,
required columns, day-range check, unique provider/day and owner foreign-key
constraints. Override migration 043 is still executed as before. Other tables
remain focused fixtures; this is not the full application migration rehearsal.

The new regression:

1. Covers both an initially empty and an existing saved week.
2. Holds a schema-scoped advisory barrier at real inserts and observes both
   blocked writers through PostgreSQL before releasing it. It does not rely on
   an arbitrary sleep to assume that writes overlapped.
3. Confirms that another provider can save while those two writers are blocked.
4. Requires both requests to finish and the final saved week to equal exactly
   one submitted week, never a merge. Either serialized order is valid.
5. Retests rollback retention after a forced insert failure, the other provider's
   own saved hours, unchanged existing-booking rows and a missing-provider 404.

Local result: **21 tests passed across four suites**, with **three explicitly
skipped database tests** among seven selected suites, in **1.296 seconds**.
The skips are OPS-496, OPS-497 and new OPS-499. The initial OPS-499-only run was
also explicitly skipped (2.835 seconds); it is not a red or green database proof.
API TypeScript, changed-file ESLint and `git diff --check` passed. The unchanged
regression-ID gate passed with **1,549 titled regressions**.

Docker diagnostics report that the local engine pipe is absent. The test helper
only accepts localhost/127.0.0.1 `*_test` databases under `NODE_ENV=test` and fails
closed in CI if that safe configuration is absent. No production database was
used to obtain passing evidence. Fresh GitHub CI must execute OPS-499 and the
existing matching/override regressions before database verification is claimed.

## Remaining work

The weekly UI audit contains the saved/draft and compiled browser evidence.
Day-toggle/back-button accessibility and date-only labels in different browser
timezones remain separate follow-ups. Direct assignment, outstanding-offer
acceptance and operator scheduling diagnostics remain in the availability
linkage audit. Master/live alignment, migration-172 rehearsal and paired release
checks are not completed by this isolated scheduling change.

## Actual PostgreSQL verification

Candidate `7ebe5dd993021b9acffd2aee7ba551b6aecd3920`, API job `101395007170`
in CI `33999232619`, explicitly passed OPS-499 at `2026-09-05T23:41:04Z`.
OPS-496 and OPS-497 also explicitly passed with the strengthened weekly fixture.
All **965 API suites / 3,329 tests** passed at `23:41:53Z`. Gates `33999232613`
passed. This resolves the local database-skip uncertainty for the concurrency
test. The complete CI run still awaited the admin suite when these logs were
checked; no deployment or whole-app acceptance is implied.

Final run check: all four jobs in `33999232619` completed successfully. Together
with Gates `33999232613`, this verifies that candidate's full CI result. No
production deployment occurred.
