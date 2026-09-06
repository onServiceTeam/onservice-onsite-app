# Admin request ownership across operator changes

Date: 2026-09-06, Asia/Singapore. Baseline
`aa6535623d84dcb09dfa83b36b3f02759c2c67f1`. Candidate work, not deployed.

## Defect and bounded correction

UX-1369 renders controls using the real API wrapper and auth store, with native
fetch intercepted. An old provider-note request returns HTTP 401 after logout
and a new login. The old wrapper refreshes with the new session and resends the
old body using the new CSRF cookie. Its regression failed before correction in
**1.33 seconds**. The original fixture used `isPinned`; reading the actual note
form corrected it to the canonical `pinned` field before final focused checks.
The replay defect does not depend on that field, and the compiled browser
reproduction below independently uses the real form's exact payload.

E79 records the finding and current recommended-engineering approval. A small
shared primitive owns an opaque, in-memory request lifetime, without importing
the auth store into the API wrapper. Each request captures that lifetime once.
Checks before sending, after body parsing and before error/refresh handling
reject obsolete results. A retry retains the original lifetime. Aborted work
does not start a new refresh. The error tells the operator to check the current
record before trying again; it does not claim the server rolled back a write.

Starting explicit login, completing login (including the same ID), starting and
completing logout, and observing a different hydrated identity/role retire old
requests. E78's startup ticket remains separate. A startup check made obsolete
by a pending or failed login only ends its loading state; it cannot overwrite
identity or cancel the newer login. Ordinary same-owner refresh continues to
rotate CSRF and retry the intended request once.

No server auth, permissions, financial policy, recovery hold, database, schema,
dependency, gate, production account or deployment has changed. The full current
API wrapper, auth store, server auth routes, cookie helpers and CSRF middleware
were read. This does not claim a full review of every auth-service dependency.

## Local tests and actual failed checks

The supporting real-render tests cover delayed private JSON/blob parsing,
obsolete 401/500/rotation responses, transition during refresh success/failure,
cancelled requests, same-ID reauthentication, observed role change and normal
refresh. The actual App/LoginPage/Router/Header test exercises an old bootstrap
finishing during a pending login, including success and invalid-password paths.
Only HTTP and dashboard landing content are reduced in that App test.

An initial focused selection passed 7 files / 12 tests in 5.47 seconds. Then
TypeScript correctly rejected a partial fake download Response (TS2352).
Replacing it with a real streamed Response preserved the delayed-body behavior;
the three new files passed 8 tests in 2.45 seconds. TypeScript passed, but lint
then rejected eight unresolved browser type/global references. References were
corrected with existing TypeScript types and `globalThis`, not lint-rule or
environment relaxation. The note fixture field was also corrected as above.

Final TypeScript, changed-file lint and the three new files all pass:
**3 files / 8 tests, 2.77 seconds**, started at local `10:55:35`.
The unchanged ID gate passes **1,564 titled regressions**. Diff checks pass.
An earlier full run passed **583 files / 678 tests**, 1 skipped file / 3 TODOs,
**322.33 seconds**, started at `10:42:14`. That run preceded the final reference
and fixture corrections. A complete final four-worker run is required before
publication and will be appended below. Marketing-dialog description warnings
remain; no timeout, assertion, test configuration or gate was weakened.

## Compiled browser evidence

Evidence root: `.ai-coder/checkpoints/logs/admin-request-session-2026-09-06/`.

The new harness runs the actual compiled Provider 360 Notes tab, category and
pin controls, Save Note, Header logout and LoginPage. Its synthetic server
attributes each note using the browser request's actual HttpOnly fixture cookie,
not an unrelated mutable current-actor variable. Cookie issuance uses the test
browser context and synthetic HTTP; it is not real JWT, database or live auth
acceptance. The trace excludes the fake login password and includes only fake
note data, fake identifiers and fake CSRF values.

- `before`: the preceding compiled startup candidate fails its first 320px
  operator-switch scenario, **0 completed cases**. Two actual note POSTs are
  captured. The old note is stored in the fixture with the new operator as
  author. The failed trace and screenshot are retained. This is not fabricated
  evidence of a production write or a full failing baseline matrix.
- `verified`: **18/18 cases**, at **320, 390, 768, 1024, 1366 and 1920px**,
  with three scenarios per width: old 401 after operator switch, ordinary
  same-owner refresh, and old password-rotation response after a switch.
  Each switch rejects the old retry/redirect and then successfully submits a
  fresh new note with the correct current author. Normal refresh stores the
  original intended note once under the original author with rotated CSRF.
  Exact field/body/request counts and current identity are asserted.
- **54 new captures**, zero page exceptions, unexpected HTTP or recorded
  document overflow. All writes are synthetic note/login/logout/refresh calls.
  Realtime is explicitly blocked. No live message, money or status action.
- The unchanged E78 startup harness passes **18/18** on the final build
  (`startup-recheck`, **54 captures**). The unchanged E77 customer/provider
  cache harness passes **24/24** (`cache-recheck`, **72 captures**). Both have
  zero page exceptions, unexpected HTTP or recorded document overflow.
  These repeats retain the earlier harnesses' documented synthetic boundaries.

Direct visual review covers the corrected 320px new-author note and 1366px
same-owner refreshed note. The narrow screenshot still truncates the provider
business name and leaves the active Notes tab outside the visible tab strip.
Those readability/navigation limitations are not fixed by this request change.
No complete Stitch, keyboard, screen-reader or cross-browser parity is claimed.

All **93 runtime source files** match the isolated build after newline
normalization. The final fresh output transformed **2,847 modules in 14.74s**;
no previous output/evidence was overwritten. An initial equivalent runtime
build took 17.39s before the final type-reference correction; it is not the
source-alignment evidence used here. All three final browser reports have:

- Entry SHA-256: `c87f1f6f8fb000e6edb39ff60ed3a4d8ffd49586c00509bc3626d63b58e047d3`.
- Index SHA-256: `31130913afa65a3ca3b4bac492a3239e4e7b1aebc18f10e38970e35fc4d5b48d`.
- Report times: `2026-09-06T03:06:06.021Z` (new), `03:06:41.761Z` (startup),
  `03:06:59.377Z` (cache).

## Explicit next boundaries

This is same-tab request containment, not complete session isolation:

1. An already-sent refresh can still deliver old Set-Cookie headers after a
   new login. A supporting test deliberately retains that cookie change while
   proving no old business replay. A later fresh request under mismatched UI
   and cookie identity is **not** certified. Login/logout/refresh/2FA/password
   cookie ordering and cross-tab ownership need separate design and tests.
2. Old logout completion can still clear a newer login; Header's post-logout
   navigation also needs ownership. The refresh catch currently includes the
   retried business request, so a post-refresh business failure can incorrectly
   be treated as expired authentication. Concurrent refresh is not single-flight.
3. Caller-side toasts/downloads after an API promise has already resolved,
   same-ID cache replacement without signed-out state, late rotation responses
   after password changes, and realtime connections remain separate checks.

Do not remove existing revocation, CSRF, 2FA, rotation or recovery guards to
make these races disappear. No client counter can undo a server-processed
mutation. Fresh GitHub CI, release integration, migration-172 rehearsal, paired
publishing and authenticated live acceptance remain necessary. Candidate,
master and production are not aligned. Full customer/provider/admin scope,
Stitch parity, native baselines and external launch sign-offs remain unfinished.

## Final complete local rerun

The final four-worker admin suite passed **583 files / 678 tests**, with
**1 skipped file / 3 TODOs**, in **332.45 seconds**, started at local `11:08:33`.
No build or browser matrix overlapped this run. It includes the final type
references and canonical note fixture. This resolves the complete-local-rerun
requirement above; fresh candidate CI and deployment remain separate.

## Independent candidate CI and next correction

Published candidate `4840b276da8a1604712883310c371d89f78479fb` passed all four
jobs in CI `34008807832` and Gates `34008807831`. Admin job `101420829036`
explicitly passed the six request-session tests at `2026-09-06T03:23:38Z`,
UX-1369 at `03:23:55Z` and the login-intent test at `03:24:05Z`. Final totals
at `03:33:57Z`: **583 passing files / 678 tests**, 1 skipped file / 3 TODOs.
Fresh CI for this containment checkpoint is resolved, not production release.

The separate post-refresh business-error defect in the next-boundaries list
is now reproduced by UX-1370. Its bounded correction is tracked separately in
`docs/audits/ADMIN-REFRESH-RESULT-2026-09-06.md`. It does not resolve the cookie,
cross-tab, old-logout or realtime limitations above.
