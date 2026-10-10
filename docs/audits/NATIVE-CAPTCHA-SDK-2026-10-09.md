# Native security-check script loading, October 9

## Actual failures

On verified predecessor `da044bbf`, two regressions execute the actual HTML
provided by the native component, relay its bridge messages into the rendered
component, and exercise script events/timers without external network access:

- **OPS-549:** a script resource error never produces the visible recoverable
  error. The native page-load error handler does not cover this script failure.
- **OPS-550:** a script that produces neither load nor error leaves a blank
  check after the page finishes. Advancing 15 seconds still produces no error.

Both original tests failed, two suites/two failures in 45.447s. The original
reports are preserved. The fixture uses actual parsed HTML and inline JavaScript
in Node VM, actual React component/DOM rendering, synthetic WebView/RN primitives
and synthetic resource events/fake timers. It is not a physical WebView, external
Cloudflare failure, handset observation or SMS acceptance test.

## Bounded correction

Only `buildHtml` in the native component changes in runtime. It installs the
existing implicit-widget callbacks before appending the same official SDK URL.
The SDK script has error/load handlers and a 15-second loading deadline, matching
the existing browser loader's bound. Loaded-but-missing/nonfunctional API also
fails closed. Success clears this deadline; it does not time-limit a person
solving the challenge. Error/timeout uses the existing recoverable native state.

Terminal handling clears the timer and detaches script handlers. Failure removes
the script element, but this is not proof of network cancellation or prevention
of late provider JavaScript execution. Late/duplicate proof/error callbacks
cannot produce another bridge result. Fresh explicit attempts get new page state.
No automatic retry, new code request, role/policy change, dependency, origin,
server verification, hook, storage or web-component change was introduced.

The implementation retains Cloudflare's implicit rendering and direct official
script location. [Cloudflare's rendering documentation](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/)
describes this container/script contract. The synthetic SDK boundary does not
certify a configured real widget. `onLoadEnd` still means page loading, not proof
of SDK readiness, a solved challenge or successful sign-in. Background timer
scheduling, navigation/origin restrictions and OS process-crash recovery still
need native acceptance.

## Verification and limits

Initial focused: five suites/five tests passed in 2.284s. Expanded focused: seven
suites/seven tests passed in 3.175s, zero skips/TODOs. These include unchanged
native lifecycle and hook regressions. New cases execute actual script failure,
missing API after load, the deadline boundary, no solving deadline after success,
fresh reopen, stale callbacks, malformed/duplicate proofs and exact bridge output.
Each bug has its own behavioral test file and titled test.

Initial types passed. Initial lint rejected unqualified DOM type/global names in
test code; qualified/inferred equivalents corrected them without a config waiver.
Final reviewed full mobile regression passed 606 suites/890 tests, 84 existing
TODOs, zero skips/failures, in 115.941s. An earlier full run also passed in
184.388s but overlapped the final test-only DOM qualification/selector edits;
it is retained as an intermediate receipt, not the final-source full receipt.
Final types and scoped lint pass. Unchanged Gate A (ten fragments), Gate C
(seven articles) and seven gate smoke scripts pass. No test assertion or gate
is weakened. No new local API/admin full run, SQL, compiled-browser or device
acceptance is claimed. New exact-candidate CI remains required after publication.

No live service/account/configuration, separate native worktree or signing setup
changed. This is neither an installable APK nor deployment. Current full-image
migrations through 179, matched authenticated client acceptance and rollback
remain required before release. The broad 124-finding program and its 15 journeys/
14 categories retain their existing status; no launch requirement is closed here.

## Completed exact-source verification

Candidate `6d316e95ce1ea1c44dd04cdbbc01d1aeabbb679b` subsequently completed
[CI 37947139813](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/37947139813)
and [Gates 37947139885](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/37947139885).
Actual mobile logs pass 606 suites/890 tests, 84 TODOs, zero skips/failures,
31.374s, including OPS-549/550, types and compiled customer/provider web.
API passes 1031 suites/3647 tests, two TODOs, zero skips/failures, 134.943s,
including the named refund, email, issuer SQL, server CAPTCHA and both Nginx
suites. Admin passes 598 files/706 tests, one skipped file/three TODOs, 172.93s,
types and production build. Actual Docker build and served `/health` pass;
missing `platform_settings` in its blank database means liveness, not readiness
or complete migration-chain acceptance.

Actual GitHub commit objects confirm CI checkout
`2502d736e2257be5d33137e34f1295a2ae7cdcba` and topic share tree
`99f0c22cd97c5d5eec28b7814e081645147087d6`. Four complete per-job logs are
retained. Web audit artifact `11624432073` (1,725,258 bytes) denies deployment
eligibility and was not downloaded or browser-exercised. Optional exact API/
admin packaging was skipped. Existing conditional Gate B and D/E report-workload
limits remain unchanged. This is bounded source verification, not configured
Cloudflare/SMS/device/deployment acceptance. This receipt accompanies the next
related runtime correction, not a documentation-only CI cycle.
