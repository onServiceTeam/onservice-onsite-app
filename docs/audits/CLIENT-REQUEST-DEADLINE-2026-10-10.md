# Client request deadline, October 10

## Reproduced failures

Two defects were reproduced against verified predecessor `195d02ce` using the
real client API wrapper and native Node HTTP connections to owned loopback peers:

- **OPS-552:** the existing 15-second timer was removed after response headers.
  Unfinished JSON, successful blob and rejected blob bodies remained pending
  beyond an 18-second observer, with their peer connections still open. The
  actual rendered login screen, OTP hook and auth store also remained busy with
  no error. No OTP navigation or session was falsely reported as successful.
- **OPS-553:** supplying a caller signal replaced the timed signal. Both stalled
  headers and stalled bodies remained pending beyond the observer with open
  peer connections, even though the caller had not cancelled.

The reviewed original two suites/two tests failed in 40.938s. An earlier run
failed the first suite during fixture initialization while genuinely reproducing
OPS-553. Its 22.201s report is retained separately. Fixing that fixture's lazy
configuration getter did not change product code or expected behavior.

## Correction

Only `rawFetch` changes at runtime. Its existing 15-second timer now remains
active through text/blob body consumption. Caller cancellation is forwarded to
the same controller, including an already-aborted signal and its reason, without
disabling the timer or aborting the caller's own controller. The listener and
timer are removed on settlement. No dependency or new timeout policy is added.

An interrupted error-blob body must preserve its abort failure instead of being
converted into a completed HTTP 401. That prevents this interruption from
triggering the existing refresh/replay branch. Complete HTTP error handling,
normal refresh, bearer headers, account ownership, JSON/envelope parsing,
query parameters and multipart handling remain unchanged. There is no new
automatic retry, credential cache, OTP resend or server-side cancellation.

This follows the [Fetch abort contract](https://fetch.spec.whatwg.org/#abort-fetch):
fetch can resolve at headers while an unread response body remains abortable.
Tests execute a real implementation; the specification alone is not acceptance.

## Behavioral verification

The new tests retain real timers, TCP HTTP serialization, response streams and
abort behavior. They exercise stalled headers, JSON and blob bodies, interrupted
401 error bodies, and headers deliberately delayed six seconds without resetting
the original deadline. The server observes one request and a closed response.

The actual login component/hook/auth store test checks restored button state,
visible failure, no navigation or OTP-request marker, no token mutation and no
duplicate send. A later explicit click completes and navigates once. RN/native
primitives, routing, secure storage, fingerprint and unrelated store side effects
are fixtures; the auth/store HTTP request and rendered state are not mocked.
No real SMS, account, provider or payment service participates.

Caller cancellation is checked before dispatch and during headers/body reading.
Successful/error settlement removes the caller listener. Complete JSON, 204,
blob, structured error, encoded parameters and multipart/header contracts are
exercised through actual HTTP. Existing account-switch, same-account new-login,
logout, refresh-fingerprint, empty-refresh and concurrent-refresh regressions
remain unchanged and pass in the focused selection.

Initial focused seven suites/seven tests passed in 35.284s. Expanded reviewed
seven suites/eight tests passed in 35.486s without skips/TODOs. Final full mobile
passes 611 suites/896 tests, 84 existing TODOs, zero skips/failures, in 209.447s.
Runtime and test files did not change during that full run. Final types and
scoped lint pass. Initial lint reported a helper return-type warning; the helper
now declares its return type without a rule waiver.

Unchanged Gate A (ten fragments), Gate C (seven articles) and seven gate smoke
scripts pass. An initial Gate C invocation failed because Windows resolved
`python3` to its Store alias. The retained existing private shim selects the
installed Python 3.12 for the final run; no gate, mode, assertion, dependency or
system setting changed. Original, intermediate and final reports remain private
and retained. No new local API/admin full run, SQL, compiled web or device test
is claimed. Exact-candidate full CI remains required after publication.

## Scope that remains open

A timeout means the client did not obtain a complete response, not that a server
write was rolled back. Tests verify no automatic resend on interruption; they do
not prove actual booking/payment/notification exactly-once effects. Complete 401
refresh/replay behavior is deliberately unchanged and still needs explicit
non-replayable email-operation caller treatment before connecting the email UI.

This is a per-fetch network/body deadline, not a whole user-operation budget.
Refresh plus replay can take multiple intervals. Device fingerprint preparation,
synchronous parsing, blocked event loops, suspended apps and platforms that fail
to honor cancellation are not independently bounded by this timer. Response size
limits, generic redirect policy, configured email delivery and full browser/
native lifecycle acceptance are not supplied by this correction.

No API/admin runtime, schema, gate, dependency, server/account/configuration or
separate Android worktree changes. No live feature, usable APK, OTA update or
deployment is claimed. Require exact-source full CI, then the selected-image
restored migration chain through 179, matched authenticated clients, uploads and
rollback before a synchronized release. The broader 124-finding program remains
117 unreconciled, seven partial and zero closed; this is not launch readiness.
