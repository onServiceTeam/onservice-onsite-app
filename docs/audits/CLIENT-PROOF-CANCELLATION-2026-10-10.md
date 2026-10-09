# Proof-request cancellation, October 10

## Actual failure

OPS-554 was found while testing the upcoming method-discovery client against
verified predecessor `508229ba`. Six actual native Node HTTP requests, covering
anonymous/session-no-replay and unfinished JSON/blob/401-blob bodies, remained
pending after the existing fifteen-second deadline. At the eighteen-second
observer all six peers were still open, with one send each. The original
one-test failure in 18.733s is retained. The new discovery hook was moved to
private pending work, not wired or published, before repairing the shared path.

An independent local Node 24.13.0/Undici 7.18.2 probe reproduced lost body
cancellation with `redirect: 'error'` after forced garbage collection. The signal
was aborted but the response remained pending/open. Without forced collection
it cancelled; retaining the Response alone did not fix it. This is local
transport evidence, not a diagnosis of every Node release, browser or handset.
Redirect protection must not be removed to make this test pass.

## Correction and retained contracts

Only `rawFetch` changes at runtime. Its existing deadline and caller signal now
settle the caller independently of whether fetch honours cancellation. Where
the transport exposes a readable stream, an owned reader is explicitly
cancelled and released. UTF-8 is decoded across chunk boundaries; binary bytes
and response content type are preserved. A response arriving after cancellation
is discarded and its exposed stream cancelled. Late operation failures remain
observed instead of becoming unhandled rejections.

Non-streaming transports retain their existing text/blob readers and are raced
against cancellation. A fixture proves caller settlement even when such a
transport ignores its signal, not physical network cancellation on Android.
Timers and signal listeners are removed after settlement. No new dependency,
response-size policy, automatic retry, timeout value, session policy, server,
schema, environment, workflow or gate change is introduced. Account ownership,
no-replay modes, redirect refusal and ordinary authenticated refresh behaviour
remain unchanged. A timeout never proves that a server operation rolled back.

## Verification

The original six stalled cases now abort and close their real HTTP peers.
Three additional contract tests cover uncooperative non-streaming transports,
late streamed responses/rejections, split UTF-8, binary bytes/type and structured
errors. Existing OPS-552/553, actual rendered login recovery, auth-mode,
credential-preservation, redirect and ordinary refresh tests remain intact.

The first corrected selection had ten passes and one existing rendered-test
failure because jsdom lacked TextDecoder. The HTTP fixture now installs the
actual Node TextDecoder and Blob alongside its existing native fetch globals;
no assertion was changed. Initial lint also rejected unqualified DOM globals;
explicit globalThis access fixes this without a waiver. Intermediate failed
reports are retained. Final reviewed five suites/fourteen tests pass in 50.61s,
without skips or TODOs. Full local mobile passes 614 suites/907 tests, 84 existing
TODOs, no skips or failures, in 200.93s. Runtime and tests were unchanged during
the full run. Final types and scoped lint pass.

Unchanged Gate A ten fragments, Gate C seven articles and all seven gate smoke
scripts pass. Two earlier local gate attempts encountered the Windows Store
Python alias and then an exported-function/exec mismatch. Selecting the already
retained private Python executable shim fixed the environment without editing
any gate, mode or assertion. No new local API/admin full-run, SQL, compiled
browser or device acceptance is claimed. Exact-candidate CI is still required
after reviewed publication before another runtime function changes.

## Remaining delivery work

This is not deployed and is not a usable APK, email/social sign-in, actual inbox
delivery or browser/native acceptance. The private discovery hook remains
unverified and must not be restored as accepted work. Native XHR fetch-flag
limitations, full current-image restoration through migration 179, paired
authenticated clients, upload references and rollback still require acceptance.
The broad 124-finding inventory remains 117 unreconciled, seven partial and zero
closed. Android delivery remains a standing requirement: a stable signed APK,
visible update check, retained last verified download and tested data-preserving
in-place upgrades for subsequent verified releases. That updater is not yet built.
