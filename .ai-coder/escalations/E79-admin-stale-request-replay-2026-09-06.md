# E79 - Old admin request can replay under a new operator

Date: 2026-09-06. Status: bounded same-tab candidate correction locally verified
by focused tests, compiled browser scenarios and a final complete admin run
(583 passing files / 678 tests, 1 skipped file / 3 TODOs, 332.45 seconds).
Published containment `4840b276` passed all CI jobs (`34008807832`) and Gates
(`34008807831`), including UX-1369 and 678 admin tests. Broader cookie-writing
and cross-tab boundaries remain open. This is not deployed and was not part of
the previously published candidate
`aa6535623d84dcb09dfa83b36b3f02759c2c67f1` or that candidate's CI.

## Actual evidence

UX-1369 renders controls using the real API wrapper and real auth store. Native
fetch is synthetic. It starts an operator's provider-note write, signs out,
signs in another operator, then releases the old request's HTTP 401. The wrapper
refreshes using the new operator's cookie and resends the old note body. The
actual captured request headers show two note writes:

- First: old synthetic operator, `synthetic-old-session` CSRF value.
- Retry: new synthetic operator, `synthetic-refreshed-new-session` CSRF value.

The test fails on that extra cross-operator request in **1.33 seconds**. Its
controls are a test harness, not a claim that the entire production note UI
was browser-tested. The API wrapper/auth-store behavior is real. There are no
production calls, real credentials or customer records. No financial endpoint
was invoked; the shared wrapper's broader write surface is a follow-up risk,
not fabricated evidence of a live financial incident.

## Recommended engineering direction under current approval

Use a session-owned request boundary that survives async work, invalidate old
requests when an operator transition occurs, and check ownership before refresh,
replay, redirect or returning a private response. Preserve legitimate same-owner
refresh and its CSRF rotation. Tests must prove that this is not merely disabling
all refresh or converting ordinary successful writes into silent failures.

Keep this lifecycle separate from E78's startup-read ticket. A shared primitive
can avoid API/store import cycles and can be used by later auth/socket work.
Use existing dependencies. Do not silently add a third-party auth service,
change permissions, alter financial policy or remove existing security guards.

The API already mints a new CSRF token on refresh. Therefore treating every
CSRF change as a different user without distinguishing a valid refresh is not
a sufficient complete design. Conversely, a client counter alone cannot prevent
an already-sent cookie-writing response from changing browser cookies.

Explicitly investigate cookie-writing login/logout/refresh ordering, old logout
completion, same-ID reauthentication, role changes and cross-tab sessions.
Do not claim a same-tab retry guard solves those distinct races. Never replay
an obsolete mutation merely to make a test pass or make the UI appear successful.

The finding was surfaced to Ken. His current approval authorizes the recommended
engineering containment after design/tests; it is not a new named E79 approval,
an external compliance sign-off or permission to experiment on production money.

## Verification and handoff

1. Read the complete current API wrapper/auth store and relevant existing auth
   tests. Read complete server handlers/helpers before changing server behavior.
2. Make UX-1369 green with real request/identity assertions. Add coverage for
   same-owner refresh, delayed responses/errors, stale redirects, abort signals,
   new-owner continuity and cookies changing during an outstanding refresh.
3. Recheck actual compiled logout/login with delayed requests and synthetic
   cookies, plus normal password/2FA/rotation entry paths in proportion to changes.
4. Run types, lint, full affected suites, unchanged gates and independent CI.
   Do not publish the currently failing test alone or call the local tree green.
5. Keep candidate/master/production identity and paired deployment boundaries
   explicit. No production release has occurred in this continuation.

Previous published startup candidate: `aa653562`. Gates `34006066263` passed; CI
`34006066256` subsequently passed all four jobs. Its verified local result was
580 passing admin files / 670 tests, 1 skipped file / 3 TODOs, after an honestly
recorded failed resource-contended run and clean full repeat. Actual admin CI
logs independently confirm those totals and UX-1366/1367/1368. The preceding cache candidate
`4fd13138` passed all four CI jobs and Gates, documented in its audit record.

The original numbered steps above describe the reproduction-time plan, not an
assertion that the new regression still fails. Current implementation, failed
typing/lint checks, corrected checks, browser replay evidence and remaining
limitations are recorded in
`docs/audits/ADMIN-REQUEST-SESSION-OWNERSHIP-2026-09-06.md`.
