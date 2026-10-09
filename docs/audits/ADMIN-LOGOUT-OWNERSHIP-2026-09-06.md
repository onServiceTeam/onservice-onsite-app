# Admin logout completion ownership

Date: 2026-09-06, Asia/Singapore. Baseline
`9382ac7e912ce073d1bb8296e2ed857311c1b580`. Candidate correction, not deployed.

## Reproduced defect and selected correction

UX-1373 renders actual App, BrowserRouter, Header, LoginPage, auth store and
API wrapper, with only dashboard content and HTTP synthetic. Two actual logout
clicks leave two requests pending. The newer logout completes, then LoginPage
signs in a different operator. Completing the older logout clears the new user.
Against unchanged runtime the test failed at that lost user ID in **2.35 seconds**,
started local **12:34:58**. Later URL/Header assertions did not execute after that
first failure. An unsupported test-only selector option was removed before red
execution. This is not evidence of a production incident.

The store now captures logout's request lifetime after retiring earlier work.
It clears local state only if that lifetime is still current when HTTP settles.
Current logout still performs best-effort local cleanup on success, server
failure or network failure. A newer login, role change, password replacement or
logout owns its own state; comparing only user IDs would not protect same-user
reauthentication. Startup evidence begun during logout is retired on completion.

Header no longer unconditionally navigates after awaiting logout. The existing
AdminLayout authentication guard owns that redirect from current auth state.
This avoids an unmounted old Header navigating a new operator. It does not rely
only on blocking a second click, change the logout API contract or introduce a
dependency. This is the bounded E79 continuation under Ken's current delegated
engineering approval, not a change to server revocation or recovery policy.

## Executed behavioral checks

Five supporting real App tests cover:

- Current logout success, HTTP 500 and network failure for admin, super admin
  and DPO, including removal of the required-password page and arrival at Login.
- Successful/failed obsolete logout after same-ID reauthentication with a new
  mandatory-password requirement.
- Both pending logout completions, including the earlier one finishing first.
- A startup read begun during logout, in both response orders, without restoring
  the signed-out operator or cancelling the current logout.
- A real password form completing while an earlier logout is pending, without
  that old local completion subsequently discarding the replacement state.

Focused checks passed **6 files / 16 tests, 9.98 seconds**, started local
**12:46:46**, including password lifecycle, UX-1371/1372 and Header account
workspace regressions. TypeScript and changed-file lint passed. The unchanged
regression-ID gate passed **1,568 titled regressions**. Full-suite and fresh CI
results are separate requirements; their actual outcomes will be appended.

## Compiled browser evidence

Root: `.ai-coder/checkpoints/logs/admin-logout-ownership-2026-09-06/`.
The harness operates the compiled App, dashboard, Header logout, LoginPage,
Header record search and Provider 360 Notes. All HTTP, credentials and cookies
are synthetic. Note authorship is derived from an actual HttpOnly fixture cookie.
Unexpected external requests and realtime are blocked; no password bodies or
cookie headers are retained in the trace.

The previous compiled build fails the first **320px different-login** scenario:
after the new login and earlier logout completion, the actual URL is `/login`
instead of `/`. There are **0 completed baseline cases**. The failed trace and
captures are preserved in `before`; this is not a full failing baseline matrix.

The correction passes **18/18 scenarios**: different-user reauthentication,
same-user reauthentication and current logout server failure at **320, 390, 768,
1024, 1366 and 1920px**. Each signs in through the real form, verifies the current
operator's email and exactly one Login navigation, then uses Header search to
open Provider 360 and save exactly one correctly attributed note. Exact write
order, note body/category/pin, rotated fixture CSRF, cleared form and absence
of additional full-document navigation are asserted. There are **54 final
captures**, with no page exceptions, unexpected HTTP or captured document overflow.

Unchanged preceding harnesses pass on the same build: `request-session-recheck`
**18/18 scenarios / 54 captures** and `password-rotation-recheck` **24/24 / 72**.
Together: **60 passing synthetic scenarios / 180 final captures**. All final
reports have zero page exceptions, unexpected HTTP and document overflow.
The wider 42-case refresh-result matrix was not repeated in this checkpoint.

Build provenance: all **93 runtime files** matched the isolated source copy
after newline normalization; **2,847 modules** built in **13.24 seconds** into
fresh `admin-audit-ux1373`, preserving earlier builds. Final report identities:

- Entry SHA-256: `1426de87dda59a9dac586619f3059aa1d63ba3f8c5f556bb0a3d00efca2333f2`.
- Index SHA-256: `503fe42ca5ae7588bb4f80ca7b93362b6dc2c23dc2d4d5ce9437f67b27e4452d`.
- Report times: `2026-09-06T04:58:40.319Z` (new), `05:01:34.473Z` (request
  repeat), `05:02:40.967Z` (password repeat).

Direct screenshot inspection confirms the current operator in the account menu
at 320px and the correctly attributed note, empty form and operations navigation
at 1366px. The 320px Header search prompt is still clipped; the tall dashboard
capture is not blanket phone-layout acceptance. No complete Stitch, accessibility,
native, real backend or all-browser acceptance is claimed.

## Prior independent CI and release limits

Baseline `9382ac7e` passed all four jobs in CI `34011734961` and Gates
`34011734968`. Admin job `101428639849` explicitly passed the seven password
lifecycle tests at `04:33:40Z`, UX-1372 at `04:34:01Z`, UX-1371 at `04:35:44Z`,
and **588 files / 691 tests**, with one skipped file / three TODOs, at `04:43:54Z`.
That is independent verification of the prior checkpoint, not this newer change.

This fixture deliberately excludes an old logout response clearing new cookies.
In-memory ownership cannot arbitrate delayed Set-Cookie, shared-cookie tabs,
concurrent refresh, server-processed effects or realtime connections. Same-ID
cache replacement without a signed-out boundary and post-promise caller work
also need further review. E79 remains open. No server cookie, access authority,
financial setting, historical row, migration or security hold was changed.

Customer/provider/admin full-feature and Stitch review, provider review revisions,
resubmission/privacy, remaining assignment checks, migration-172 rehearsal,
paired publishing, fresh authenticated client accounts, native baselines and
external sign-offs remain unfinished. Local candidate, master and live are not
aligned. No SSH, live account operation or deployment occurred in this checkpoint.

## Final complete local suite

The full four-worker admin run passed **590 files / 697 tests**, with **1 skipped
file / 3 TODOs**, in **346.56 seconds**, started local **13:04:42**. No build or
browser matrix overlapped it. Existing marketing-dialog description warnings
remain. No assertion, timeout, configuration, gate or lint rule was weakened.
This resolves the full-local-suite requirement above; fresh candidate GitHub CI
and safe paired deployment remain separate requirements.

## Independent candidate CI

Published candidate `860c834145ecb5b933e5521a96f7110d925b0015` passed all
four jobs in CI `34013764726` and Gates `34013764718`. Actual Admin job
`101433928259` logs record five supporting logout tests at `05:22:30.098Z`,
UX-1373 at `05:22:43.431Z` (534ms), and the complete 590 files / 697 tests,
one skipped file / three TODOs, at `05:28:36.782Z` (371.32 seconds total).
API `101433928137`, Mobile `101433928266` and Docker `101434314335` also
succeeded. This resolves the fresh-CI requirement for this checkpoint, not
the server-cookie, cross-tab, wider product or paired-deployment requirements.
