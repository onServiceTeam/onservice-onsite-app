# Provider application to operator review: category evidence

Date: 2026-09-06, Asia/Singapore. Baseline:
`d6a0a143a999016117c54c5855c228b0542d8dcb`, existing
`codex/financials-operator-truth` candidate. Not a deployment or E35/E74 closure.

## Defect and bounded correction

The applicant selects service categories. Submission writes category-only
`provider_services` rows. Provider 360 read only rows joined to a specific
subcategory, then displayed "No active services on file." The reviewer could
not see the applicant's category selections even though submission retained them.

OPS-493 adds a separate `declaredCategories` projection to the existing
admin-only profile. It scopes by provider, requires an active association and
no subcategory, deduplicates categories, sorts by name/ID, and includes the
current catalog active flag. The priced `services` and legacy `categories`
fields are unchanged. No price, role, admission rule, migration or historical
record is modified. An inactive catalog entry stays visible as review context,
not as a currently purchasable service.

UX-1338 renders those declarations in the real Profile tab. It distinguishes
an empty declaration list from the field being unavailable on an older API,
does not invent a price or use the deprecated priced-category fallback, and
warns about disabled catalog entries. Copy explicitly says these are current
records, not approval, bookability or a historical application snapshot.
Existing theme tokens and responsive wrapping are retained. This is not a
new Stitch screen or a claim of complete visual acceptance.

## Verification

The new actual ProfileTab render test failed before the fix: the declared
category region was absent (one failed test, 7.37 seconds total). After the
fix, UX-1338 plus the existing catalog-price and portfolio render regressions
passed three files / three tests in 2.75 seconds. Both API and admin TypeScript
checks passed. Changed-file ESLint passed with zero warnings. The unchanged
unique-regression-ID gate passed with 1,527 titled regressions; diff checks
passed. The wider provider-admin selection passed 68 files / 74 tests in
102.29 seconds with two workers. The full local API run finished in 250.947
seconds: 937 suites / 3,301 tests passed, two suites/tests failed and 20
PostgreSQL suites/tests were skipped. Skips are not counted as passes.

The local API run encountered two Docker-dependent Nginx failures because
the Docker engine is not running. They are not passing tests and were not
disabled. The new PostgreSQL integration is explicitly skipped locally when
no safe test database exists. Fresh CI must execute it before its assertions
can be reported as verified. No full local API pass is claimed.

OPS-493 mounts the actual applicant, admin profile and application-decision
routers with real JWT/current-account authentication and real PostgreSQL
transactions. Its fixture reuses the localhost `*_test` unique-schema harness
and actual draft migration 172. It is written to check:

- Private draft does not enter the review queue; submit consumes the draft
  and creates the one canonical pending provider and review link.
- Profile retains the selected category, market, experience, reference answers
  and private document proxy paths. Applicants cannot read admin profiles.
- Duplicate declarations do not duplicate output; another provider's category,
  an inactive association, and priced service rows do not become declarations.
  Catalog deactivation remains visible and catalog prices remain canonical.
- Customer access and a prematurely provider-labeled token cannot open the
  provider workspace. Invalid/unauthorized decisions do not approve.
- Valid approval updates the same identity, removes it from the queue, writes
  one admin decision and one inbox notification, and invalidates the old
  customer-role token. Repeated approval cannot duplicate those records.

Fresh provider JWT generation in the fixture models re-authentication; it
does not execute the refresh-token transport or OTP flow. Database fixtures
do not prove production object existence, actual reviewer document inspection,
external notification delivery or full migration-chain compatibility.

The preceding browser-fix commit independently passed all CI and gates:
CI `33987938987`, Gates `33987938986`. That evidence is recorded in the browser
audit and is not reused as a pass for this newer correction.

## Next audit boundaries

Continue actual reviewer-to-applicant authentication refresh, immutable review
revisions, request-changes/resubmission, reviewer assignment, expiry scheduling
and privacy export/deletion inventory. Examine applicant support-case linkage:
Provider 360 currently labels its support link as provider even while a pending
applicant still owns a customer account. That needs downstream tracing, not an
assumed fix. Approval messaging also needs to distinguish access approval from
having configured priced services and being ready to receive work.

Paired API/browser deployment still requires full migration-172 rehearsal and
authenticated acceptance. No server write, master merge, gate/protection change,
real account creation or monetary action occurred here. Topic, master and
production remain unaligned. Engineering authorization does not substitute for
attorney, DPO, accountant or payment-provider signoff.
