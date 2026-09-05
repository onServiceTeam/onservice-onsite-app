# Provider application status and account-access checkpoint

Date: 2026-09-06, Asia/Singapore. Baseline:
`6a138e4692f20460dfc73db31bdb3a0ba4634f61`, branch
`codex/financials-operator-truth`. This is a tested candidate, not deployment,
E35/E74 closure, full Stitch acceptance or a launch-readiness claim.

## Source and business meaning

Both applicant review URLs now render one shared status screen. The owner-only
`GET /api/v1/providers/application-status` reads the canonical `providers`
record. It does not expose reviewer assignment, review-start time, a separate
background-check process, a completion estimate or a suspension reason.
The operator review service delegates approval/rejection to the same canonical
Provider 360 decisions. Existing API admission, audit and inbox transactions
were traced, not changed in this stage.

The old secondary screen mapped unknown statuses to pending and suspended to
rejected. The old primary screen treated most non-approved/non-rejected values
as under review. Its unscoped query cache and delayed activation also lacked
applicant-generation and retained-screen navigation guards.

The corrected client accepts only pending, approved, rejected, suspended and
deactivated, or an explicit null application. Malformed/unknown replies become
a visible retrieval failure, not a fabricated decision. A refresh failure may
retain a last confirmed status but clearly marks it as not freshly verified.
Only a rejected application displays `rejectionReason`; that field is not used
as the reason for suspension or deactivation.

Copy now describes the applicant's next action in plain language, without
invented review stages, deadlines, push/email delivery promises or a working
resubmission form. Support and notification history open the actual shared
routes. The customer-workspace exit remains available even after an approved
application encounters an access-confirmation failure.

## Account and screen boundary

Queries are scoped to owner and applicant generation, poll every 15 seconds
while eligible/active, and do not retain an unused cache. Provider access is
attempted once automatically for each current screen scope. A failure requires
an explicit retry; ordinary rerenders do not create a refresh loop.

After token refresh and again after `/auth/me`, activation checks the current
owner, customer role, authenticated state, applicant generation, route epoch
and mounted/active screen. The identity reply must be HTTP 200, a successful
envelope, a well-formed provider identity and the exact initiating owner UUID.
The latest application observation must still be approved without a query
error. Only then does the real auth store accept the provider identity and
navigate to the provider dashboard. The status label alone grants no role.

This guards a different-account login, a fresh same-account login and a native
stack retaining an old screen after navigation. It does not undo an operation
already processed by the server or replace independent server authorization.

## Executed evidence

The preceding six-step integration commit passed CI `33981649089` and Gates
`33981649071`. All four CI jobs succeeded. Mobile job `101347822496` explicitly
passed UX-1321 through UX-1327 and finished with 567 suites / 851 passing tests,
84 TODOs at `2026-09-05T17:42:15Z`. That is independent baseline evidence, not
automatic CI verification of these subsequent status changes.

| Regression | Executed behavior |
| --- | --- |
| UX-1328 | Real status service rejects unknown/malformed envelopes; accepts the five canonical values and explicit null |
| UX-1329 | Both actual route screens distinguish decisions/restrictions, show the real support destination and preserve visibly stale status on refresh failure |
| UX-1330 | Real auth store: a late old-account refresh and a late identity reply after fresh same-owner OTP login cannot promote or navigate |
| UX-1331 | Wrong-owner provider identity is rejected; rerender does not loop; explicit retry accepts only the current matching provider identity; customer exit is present |
| UX-1332 | A retained review screen cannot complete activation after the enclosing gate records a different active route |

UX-1328 failed deliberately before the service correction because an unknown
status resolved successfully. The four initial new status/access regressions
then passed in 2.445 seconds. The full suite including UX-1332 passed 572 files /
856 tests, with the same 84 TODOs, in 85.630 seconds. No TODO is counted as a pass.
Mobile TypeScript passed at that checkpoint.

Five existing status fixtures were adapted to the actual QueryClient, valid
customer identity and success-envelope requirements. The shared Expo Router
test mock gained a rendered Redirect stand-in, matching an API already used
by the application; it is not a runtime router change or an authorization test.
The phase-95 polling regression now advances the timer by 15 seconds and
asserts the second request and absence of provider navigation. After the final
plain-language copy/customer-exit correction, that test plus UX-1329/1331
passed 3 files / 3 tests in 2.930 seconds.

The next full rerun caught one obsolete UX-115 assertion requiring the customer
exit to be absent on the static approved fixture (571 files passed, 1 failed;
855 tests passed, 1 failed, 84 TODOs; 81.801 seconds). The new recovery contract
intentionally retains that exit until a real auth-role transition. The assertion
was corrected to require its presence; provider identity and navigation checks
remain unchanged. This failure is recorded, not hidden or counted as a pass.

Final full verification after that correction passed all 572 suites / 856
tests, with 84 TODOs, in 127.427 seconds, followed by a successful TypeScript
check. Changed-file lint passed with zero ESLint warnings; the unchanged
regression-ID gate passed with 1,520 titled regressions and the diff check
passed. Fresh independent CI is required for this checkpoint after publication.

These are real DOM behavior/service tests with controlled HTTP replies and
documented native stubs. They do not prove a production account login, private
document retrieval, two-device behavior, native permissions or pixel parity.

## Browser and release limits

Both layouts use the existing approved theme and a scrollable bounded workspace
with tablet/desktop columns. No replacement design source was invented. The
local `expo export --platform web` attempt failed before generating a bundle
with `UNKNOWN: unknown error, read` from the Node module loader. Its output does
not identify the failing file, so the root cause is not yet proven. Older
browser screenshots are not acceptance evidence for these changed screens.

A filename-only diagnostic retry stopped while reading the nested Expo CLI
dependency `zod/v3/locales/en.cjs` (Zod 3.25.76, 5,971 bytes) and failed with the
same filesystem error. The dependency sits in the OneDrive-backed install.
This identifies the read boundary, not a defect in Zod or the application.
Do not replace it with a different version or alter production dependencies to
mask the local fault. A clean lockfile-based build outside OneDrive is the next
non-destructive alternative.

The clean temporary install avoided that read failure and reached Metro. A
mobile-workspace-only install then failed to resolve the app's direct
`@sentry/core` import. The repository CI installs all workspaces with
`--legacy-peer-deps`; matching that existing installation mode is in progress.
Neither dependency versions nor the tracked lockfile were changed. A narrow
workspace build and the application's Sentry package boundary need separate
review; no browser pass is claimed from either failed export.

The two existing Maestro flows were read. They only deep-link and capture an
image, with an optional loading wait. They do not assert a review decision or
prove the seeded login has the required customer/applicant role. F#3 remains
open and those flows need authenticated fixture/state assertions before their
images can count as useful baseline evidence.

Next: recover a reproducible current browser build, inspect both review routes
and all six application steps at contract viewports, and exercise refresh,
save/reload/conflict/discard and actual navigation. Then continue durable
review revisions/request-changes/resubmission, bounded expiry/privacy work and
the full migration-172 chain/paired API-browser release acceptance.

No production write, migration, account creation, money adjustment, secret
publication, master merge, release-candidate label, gate change, branch
protection change or live rollout occurred here. Topic, master and production
are not aligned, and the wider provider/customer/admin audit remains active.

## Independent CI and compiled-browser follow-up

Published `b48051dc027187badec5381171eff6831878455b` passed CI
`33984531847` and Gates `33984531837`. All four CI jobs succeeded. Mobile job
`101355518558` explicitly passed UX-1328 through UX-1332, finished 572 suites /
856 tests with 84 TODOs at `2026-09-05T18:38:06Z`, and built the 4,364-module
browser artifact in 89.920 seconds. This closes that checkpoint's fresh-CI
requirement, not production deployment or later follow-up changes.

The full lockfile installation outside OneDrive also built the four-runtime-
file overlay locally in 68.733 seconds. Its source component matched the
published candidate byte-for-byte. The narrow-workspace resolution failure
above is therefore a separate portability/dependency-boundary finding, not
evidence that the supported full-workspace build is broken. No package version,
lockfile, system Node installation or existing repo dependency was modified.

The first browser sweep passed 84 route/state/viewport combinations. Direct
inspection of its real screenshots then found two additional defects that those
checks did not catch:

- UX-1333: horizontal column flex values were also applied to vertically
  stacked phone cards. At 320 pixels, the decision card reserved 117.09375
  unnecessary pixels below its content, pushing support down the screen.
- UX-1334: the support panel described a pending review/completion date after
  approval, rejection or restriction. Its guidance contradicted the recorded
  decision shown alongside it.

Both new DOM regressions failed before the fix on their intended assertions
(2 failed files/tests, 1.886 seconds in the concise repeated reproduction).
A strengthened compiled-browser check independently failed the unchanged
candidate on exactly 117.09375 extra pixels, with no page error, console error
or unmatched request. Phone cards now size to their contents; only wide cards
share horizontal space. Guidance follows the actual application status.

The two corrected regressions passed in 2.742 seconds. The final full mobile
suite passed 574 files / 858 tests, with the same 84 TODOs, in 105.575 seconds.
TypeScript and changed-file ESLint passed; the unchanged unique-ID gate passed
with 1,522 titled regressions. The local corrected browser export passed with
4,364 modules in 57.571 seconds. Fresh CI is still required for this follow-up.

### Browser evidence retained

The executable harness, before-fix failure report, before screenshot, final
84-check report and twelve representative final screenshots are under
`.ai-coder/checkpoints/logs/provider-review-browser-2026-09-06/`.

- [Final numeric/network results](../../.ai-coder/checkpoints/logs/provider-review-browser-2026-09-06/evidence/results.json)
- [Pre-fix browser failure](../../.ai-coder/checkpoints/logs/provider-review-browser-2026-09-06/evidence/before-results.json)
- [Phone before correction](../../.ai-coder/checkpoints/logs/provider-review-browser-2026-09-06/evidence/before-320-pending.png)
- [Phone after correction](../../.ai-coder/checkpoints/logs/provider-review-browser-2026-09-06/evidence/320-review-pending-pending-top.png)
- [Tablet status](../../.ai-coder/checkpoints/logs/provider-review-browser-2026-09-06/evidence/768-review-pending-pending-top.png)
- [Desktop approval/access-recovery state](../../.ai-coder/checkpoints/logs/provider-review-browser-2026-09-06/evidence/1366-review-pending-approved-top.png)

Both URLs were exercised at widths 320, 390, 768, 1024, 1366 and 1920, each
with pending, rejected, suspended, deactivated, missing, unavailable and
approved-but-access-unconfirmed states. All 84 strengthened checks passed.
Phone extra allocation is now zero. Controls remained horizontally contained,
at least 44 pixels high and reachable by scrolling; expandable guidance was
exercised. There were no unhandled browser errors or unexpected network
requests. The intentional 503 case's console entries remain in the report,
not silently suppressed. Phone top/expanded guidance, tablet pending and
desktop recovery screenshots were directly inspected.

These checks use the compiled application and synthetic identity/HTTP fixtures.
They block unexpected external traffic and close their own local server and
browser. They are not real server login, successful provider activation,
keyboard/screen-reader, complete native, or all-six-step workflow acceptance.
They do not establish visual identity with the unavailable latest Stitch ZIP.
The newly located `onservice-stitch-handoff` folder was read and excluded: it
describes a separate U.S. computer-support landing page, not this Philippine
marketplace. Its assets and instructions were not adopted.

Corrected local bundle SHA-256:
`3025D66138D7B8D1C3FE4A12FD6CA277BB343043D2B4333670909F60B26FCFF4`.
Runtime component SHA-256, matching the working tree and isolated build:
`CFA1FE5A6808F88731EE1AB0A29D3E54510CA9AD0C0F176C38053DBC00B4783F`.
The report identifies the base commit plus the two-fix overlay rather than
mislabeling uncommitted build input as an exact commit. Its loopback API origin
is test-only. Do not deploy this local audit bundle.

The next acceptance remains the six-step application, refresh/save/reload/
conflict/discard and cross-role reviewer lifecycle, followed by paired release.
The full app audit and the existing legal, payment, privacy and production
limits remain open. No live server state changed during this follow-up.
