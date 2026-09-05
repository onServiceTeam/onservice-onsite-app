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

## Published-candidate verification and browser follow-up

Candidate `3ab3db17d9b29d098af20490399be812ee71b8ee` is published on the
existing topic branch. Gates `33989367956` passed. CI `33989367903`, completed
API job `101368715211`, explicitly passed OPS-493 at
`2026-09-05T20:13:33Z`. All 959 API suites / 3,323 tests passed, with no skips.
Both Docker-dependent Nginx regressions that could not run locally also passed
there. This closes the new handoff test's pending execution, not full release
acceptance. At this observation the mobile and Docker jobs also passed; the
admin job remained in progress. Later observation confirmed the entire run
completed successfully, all four CI jobs. Admin job `101368715048` explicitly
passed UX-1338 and finished 565 passing files / 649 passing tests, with one
skipped file and three TODOs, in 589.79 seconds. Those TODOs are not passes.

The compiled admin browser audit passed 24 combinations: submitted declarations,
declarations alongside a priced service, an empty list and an older response
without the field, each at 320, 390, 768, 1024, 1366 and 1920 pixels. It opens
the actual Provider 360 page with synthetic account/HTTP responses, blocks
unexpected requests and performs no production login or writes. All cases
have zero document/region overflow, no page errors and no unexpected requests.
The category region has no price; the configured fixture retains the separate
catalog price. These are bounded display checks, not all controls or the
actual document-review/approval experience.

The runnable `audit.mjs`, result JSON and 24 **region** screenshots are retained
under `.ai-coder/checkpoints/logs/provider-admin-handoff-2026-09-06/`.
Direct image inspection covered phone submitted categories, tablet configured
categories and desktop older-response messaging. These are not 24 fully audited
screens or evidence of matching every Stitch pixel.

The isolated build initially failed because its partial source export lacked
the existing root `tsconfig.json`. Copying that unchanged configuration resolved
it; no package or configuration content was changed. Vite built 2,845 modules
in 14.51 seconds. The copied runtime page matched the published source:
`F744BB98898AD2FD8550FEE7BC227C68A23A9E88ECC2CAC819633A1BBD4E6305`.
Compiled ProviderDetailPage SHA-256:
`4df4b8c5056ca11d4f2e86adb472acd6447be52192ab95ff74bb6f01fbd049a8`.
The JSON also records the index hash. This local-only audit build is not a
deployment artifact.

The suspected support-link role issue above was traced further and is **not
a confirmed broken case-creation path**. SupportTicketsPage does not use the
legacy `userRole` query parameter as authority: it loads account context,
displays that canonical role and posts the confirmed user ID. Related-provider
history includes tickets owned by `providers.user_id`, without requiring that
owner already have provider role. The stale link parameter is redundant;
do not change authorization based only on its misleading spelling. Actual
cross-role support-case behavior remains part of the larger acceptance work.

### Newly traced access-transition gap, still open

`auth.service.refreshAccessToken` rejects a refresh when its role differs from
the current account role. `authMiddleware` likewise rejects an old customer
access token after approval changes the owner to provider. However,
`ProviderApplicationStatusScreen` currently attempts automatic refresh followed
by `/auth/me` to enter the provider workspace. A normal pre-approval customer
credential cannot complete that assumed refresh transition. Earlier mocked
activation success is not proof of compatibility with this backend contract.

Keep the canonical-role security rejection. The next correction must provide
an explicit, understandable fresh-sign-in handoff and verify the actual client
transport behavior after admin approval, including a different-account login
and delayed responses. Do not relax role-revocation checks merely to make a
screen's mocked happy path pass. OPS-493 deliberately models fresh authentication
and does not close this newly traced client transition gap. This observation
does not modify login/session authority in the current candidate.
