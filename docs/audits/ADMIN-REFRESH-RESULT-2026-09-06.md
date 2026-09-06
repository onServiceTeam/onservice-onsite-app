# Preserve real business errors after admin session refresh

Date: 2026-09-06, Asia/Singapore. Baseline
`4840b276da8a1604712883310c371d89f78479fb`. Candidate only, not deployed.

## Reproduction and correction

UX-1370 renders the actual Provider 360 NotesTab with its real query client,
auth store and API wrapper. Only native HTTP is intercepted and the empty
notes list is preloaded. A save receives an expired-access 401, refresh succeeds,
then the retried save receives a business rejection. The old catch swallowed
that rejection and surfaced the first expired-access error. The real rendered
alert failed the regression in **2.85 seconds**, on the first HTTP 409 variant.
The 403/500 variants are post-fix checks, not invented additional failing runs.

The API wrapper now retries outside the refresh-failure catch. A rejected save
keeps its own message and status; a transport failure remains a transport failure.
A second 401 retains the sign-in redirect, while a rotation precondition keeps
its password-change destination. E79's request-owner and abort checks remain in
place. The change does not modify server permissions, note authorship, money,
session policy, CSRF, schema, dependencies, recovery holds or production records.

The regression verifies the real error, body/category/pin preservation, enabled
Save Note and exact first-write/refresh/retry sequence with rotated CSRF. Three
supporting real-render tests cover post-refresh rotation, failed refresh on an
existing login page, and a retried network failure. The jsdom form test uses a
login pathname to avoid unsupported full-document navigation; the compiled
browser checks below independently test actual navigation and draft retention.

## Local verification

TypeScript and changed-file lint pass. Focused selection passes **6 files /
13 tests, 3.20 seconds**, started at local `11:29:04`. This includes the new
four tests, E79 request/session cases, the login-intent case and the existing
rotation regression. The unchanged ID gate passes **1,565 titled regressions**;
diff checks pass. The complete four-worker admin suite is running and must pass
before publication; its actual result will be appended separately.

## Compiled browser evidence and corrected fixture

Evidence: `.ai-coder/checkpoints/logs/admin-refresh-result-2026-09-06/`.
The harness runs the actual compiled Provider 360 form, error display, login
bootstrap and password-change destination with synthetic HTTP/cookies.

The first baseline run (`before`) fails after the old wrapper navigates to
login. The still-valid synthetic session returns the app to the dashboard,
whose reads were missing from the initial fixture. The retained screenshot
therefore contains a fixture-induced dashboard error. This is not a verified
dashboard defect and is not the complete baseline evidence.

The corrected harness includes known dashboard reads. Its unauthorized cases
also keep rejecting the synthetic session during fresh login bootstrap rather
than incorrectly returning a valid actor. Full document requests are counted
separately from React/history navigation events. A fresh complete-fixture
baseline (`before-complete-fixture`) still fails the first 320px conflict case,
**0 completed cases**, with no unexpected HTTP or page exceptions. The trace
shows the actual document navigation to `/login`, return to `/`, and loss of
the intended provider-note workspace. Both failed runs are retained.

The corrected candidate passes **42/42 scenarios**: HTTP 409, 403 and 500,
transport failure, password rotation, a second 401 and failed refresh, each
at **320, 390, 768, 1024, 1366 and 1920px**. Non-authentication failures keep
the exact draft/category/pin and actual error, make no successful save, then
permit a deliberate operator retry that stores exactly one note and clears
the form/error. Authentication rejection reaches a stable login document;
its own single bootstrap refresh is counted separately from the failed original
write. Rotation reaches the actual password form without submitting a password.

There are **108 new final captures**, zero page exceptions, unexpected HTTP or
recorded document overflow. The unchanged E79 harness also passes **18/18** on
this build, with **54 captures** and the same zero-error/overflow results.
All note/auth writes and identifiers are synthetic. Realtime is deliberately
blocked. No live account, notification, payment or status mutation was attempted.
This is not live authentication, backend note-service or full Stitch acceptance.

All **93 runtime source files** match the isolated build after newline
normalization. The fresh output transformed **2,847 modules in 6.33 seconds**.
Earlier output/evidence directories were preserved. Both final reports have:

- Entry SHA-256: `9f5d7ccc3cf7c0c998ec891506159636ebd3904600f2247a8ea39abab541493a`.
- Index SHA-256: `c636e51fa47c6b53565ff162c443e9eed2527eeb6a2051e35da7f0bf38cd5f63`.
- Report times: `2026-09-06T03:33:06.503Z` (new) and `03:34:07.044Z` (E79 repeat).

Direct review of the 320px conflict screenshot confirms the actual error and
unfinished note are visible together. The truncated provider name and offscreen
active Notes tab remain. Broader accessibility and all-screen design parity
are not established by these behavioral checks.

## Remaining work

Fresh CI and safe release integration are separate requirements. Local candidate,
master and production remain different revisions. The change does not serialize
concurrent refresh, reconcile delayed cookie-writing responses, isolate cross-tab
sessions, guard old logout completion or finish realtime lifecycle. Those E79
boundaries remain open. Refresh-endpoint transport/5xx classification is also
unchanged by this narrower post-refresh business-result correction.

The actual server auth routes, cookie helper, auth middleware and CSRF middleware
were read in full during this continuation. The refresh/token-pair/logout region
of auth.service.ts was read, not that entire service. Existing refresh-row
locking and account-wide CSRF revocation must be considered in the next design;
do not remove either based only on client fixture behavior. Server-processed
mutations cannot be undone by ignoring a browser response.

Provider/customer/admin feature and Stitch review, remaining linkage gaps,
migration-172 rehearsal, paired publishing, fresh authenticated live testing,
native baselines and external legal/operational sign-offs remain unfinished.

## Complete local verification and newly reproduced follow-up

The complete four-worker admin run passed **585 files / 682 tests**, with
**1 skipped file / 3 TODOs**, in **299.75 seconds**, started at local `11:35:34`.
No build/browser work overlapped this run. It resolves the complete-local-suite
requirement above. No assertion, timeout, lint rule or gate was weakened.
Fresh CI and deployment are still separate requirements.

Direct review of the desktop rotation screenshot also exposed an existing
UI-state inconsistency: the runtime 428 redirect reaches Change Password without
updating `mustRotatePassword`. The required banner is absent and the voluntary
Cancel and return action remains. After the full run, new local UX-1371 reproduced
the missing banner using real App, BrowserRouter, auth store, Header, API and
ChangePasswordPage; only dashboard content and HTTP are synthetic. It failed in
**3.42 seconds**. Later assertions about route gating are not claimed as executed
red evidence because the test stops at the absent banner.

UX-1371 is a separate, intentionally failing, uncommitted follow-up and must not
be included in this verified UX-1370 publication. No runtime correction for it
has been made. The 682-test result predates that new investigation; do not call
the expanded working tree fully green. This is not proof of a server permission
bypass: existing API rotation enforcement remains unchanged. Continue with owned
mandatory-state propagation, current/already-open/obsolete rotation responses,
password-change completion, and the other E79 session boundaries. Do not remove
the required rotation or security controls to make the UI appear successful.
