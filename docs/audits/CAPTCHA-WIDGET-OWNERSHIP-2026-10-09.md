# Browser security-check callback ownership, October 9

## Scope and reproduced failures

This correction changes only the existing web Turnstile component's widget
callbacks. It is not deployed. The shared hook, phone policy, API, email flags,
native component, administrator password/TOTP and account authority are unchanged.
Phone login, registration and resend continue using their existing hook.

Against preceding candidate `cb051175`, actual React DOM renders reproduced:

- **OPS-542:** phone A received a security-check requirement, its widget was
  cancelled and removed, and phone B started a fresh widget. Calling the SDK
  callback retained from widget A made the real `useCaptchaOtp` hook dispatch
  another `requestOtp` call with **phone B and A's old proof**. The new test
  expected only the two initial no-proof calls and observed the unwanted third.
- **OPS-543:** two SDK proof callbacks from one visible widget both reached its
  parent. The new regression expected one result and observed two.

The original two-suite run failed both tests in 1.524s. Cloudflare, the auth
store's HTTP boundary and React Native primitives are synthetic test boundaries;
the real hook, modal, React effects, controls and DOM run. No real SMS, account,
production incident or server-side authorization bypass is claimed.

Review extended OPS-543 to a provider `render` call that retains its callbacks
and then throws. After the initial correction but before the catch-path repair,
the visible error still permitted a retained proof callback. That separate
original failure took 1.443s. Both original reports are retained privately.

## Correction and caller consequences

Every visible widget now owns one settlement state. Proof, error and expiry
callbacks check both that state and the effect's existing cancellation flag.
Only the first valid callback may settle that widget. Error/expiry and a render
exception are terminal for it; closing and explicitly reopening creates a new
attempt. A completed proof cannot later be replaced by an SDK error.

The current parent callback still updates without resetting the same visible
widget. A removed widget cannot use that current callback to submit a proof
for the next attempt. Existing widget-ID removal on effect cleanup remains.
A render exception that never returns an ID cannot be claimed as successful
SDK resource cleanup; its retained application callbacks are invalidated.

There is no automatic request retry, proof replay, new timeout for a person
solving a challenge, token cache, dependency, schema or gate change. The earlier
script-loader deadline/recovery remains unchanged. Script removal still does
not prove cancellation of browser networking or late provider JavaScript.

## Verification and review

Each bug has its own file and behavioral `it('Bug ...')`. OPS-542 renders the
actual hook and web component together. It covers A's cancellation, B's new
attempt, late A proof/error/expiry, B's accepted proof, promise outcomes,
widget removal and ignored post-unmount proof. OPS-543 covers duplicate proof,
fresh callback props within one visible attempt, late error after success,
error/expiry followed by proof, render exception and unmount.

Initial corrected selection: seven suites / seven tests passed, 3.192s. This
preceded the render-exception extension. Final reviewed selection: **seven
suites / seven tests passed**, 2.388s, including the unchanged OPS-540/541 and
resend, responsive-login and public-legal-link render regressions. Final full
mobile: **599 suites / 883 tests passed**, 84 TODOs, zero skips/failures,
129.257s. TODOs remain unfinished work, not acceptance.

Final types and scoped lint pass. Initial lint rejected the `Window` test type
annotation; it was replaced with `typeof window.turnstile`, without a lint
waiver or changed assertions. Initially guessed gate filenames did not exist
and exited 127. Correct paths were discovered and the actual unchanged Gate A
(ten fragments), Gate C (seven articles) and all seven gate smoke scripts passed.
Failed/intermediate reports remain separate from final receipts.

No new local API/admin full run or compiled-browser acceptance is claimed.
Before another function changes, exact-candidate CI must execute both new
regressions, the full client/API/admin matrices, types/builds, compiled web,
both Nginx checks and actual API image build/boot. The preceding completed
browser-loader CI receipt is appended to its audit in this same runtime update;
it is not a substitute for verification of this correction.

## Remaining acceptance and broad program

The generic hook's overlapping requests and unmount while awaiting HTTP, native
widget lifecycle, real configured Cloudflare browser challenge and actual
inbox/authenticated journey acceptance remain separate work. These tests do not
prove all possible callback reentrancy or complete authentication lifecycle
safety. No email/social button is enabled and no live account/config is changed.

Live remains the separately preserved old API containment, not the accumulated
topic branch. Current source requires a selected image, complete migration chain
through 179 on an isolated restoration, matched API/admin/web/native acceptance,
backup/rollback and guarded release before synchronization. No usable APK or
automatic native update delivery is claimed by these client tests.

The full 124-finding, customer/provider/admin feasibility, business/support/
payment/job linkage, Stitch/blue design and signed APK/update program remains
active. This bounded fix does not close the broad sign-in or launch requirements.

## Completed exact-source widget verification

Published `b14928d8934b2fc27b6c71b4c04aedc97dd25d84` passed CI `37935742392`
and Gates `37935742320`. Actual GitHub commit objects confirm CI checkout
`f17fd1cd218af276563cffbef1ce8f7756d07a12` and the topic share source tree
`ebac10366659662a8372a68609677bef29a6a688`.

Actual mobile logs: 599 suites/883 tests passed, 84 TODOs, zero skips/failures,
44.745s, both OPS-542/543 explicitly passed, types and compiled web passed.
API: 1031 suites/3647 tests passed, two TODOs, zero skips/failures, 132.502s;
named refund, email/linking, issuer SQL and both Nginx checks passed. Admin:
598 passed files/one skipped file, 706 tests/three TODOs, 209.96s, types/build
passed. Actual API Docker build and served `/health` passed. Blank database
missing-table logs mean liveness, not readiness/full-chain acceptance.

Four complete job logs are retained with final cleanup. Web audit artifact
`11617867471` is not deployment eligible or downloaded/browser-exercised.
Optional exact API/admin packaging was skipped. Conditional Gate B and D/E
report-workload limits remain unchanged. This verifies the bounded widget
source, not live Cloudflare, real SMS/inbox/native or release readiness. The
receipt accompanies the related hook lifecycle correction, not a docs-only
commit. Hook/native limitations above are historical to the widget slice;
see the separate OTP request lifecycle audit for subsequent scoped evidence.
