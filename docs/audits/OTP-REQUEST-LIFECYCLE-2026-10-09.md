# OTP request ownership and screen departure, October 9

## Reproduced failures

Against exact-source-verified `b14928d8`, two real rendered regressions expose
separate failures in the shared `useCaptchaOtp` hook:

- **OPS-544:** while the first request remained pending, a duplicate call for
  that phone and a call for another phone both reached `requestOtp`. Expected
  one dispatch, observed three. The hook had only one replaceable challenge
  resolver, not ownership of the complete request lifecycle.
- **OPS-545:** the actual login screen was unmounted while its request was
  pending. Completing that request still called the actual screen's router
  boundary with `/auth/otp-verify`. Expected zero navigation, observed one.

The reviewed original run failed both tests in 3.018s before runtime changes.
An earlier 5.094s run reproduced OPS-544 but OPS-545 stopped on a fixture error:
its test ID selected the phone container, not the input. Selecting the actual
labelled textbox corrected the fixture without changing the product/assertion.
Both reports remain retained; the initial fixture error is not product evidence.

React, DOM rendering, the hook, browser modal and login handler execute. SMS/
Cloudflare and the auth store's request boundary are synthetic. No real message,
database, credential, native device or production compromise is claimed.

## Correction and caller consequences

Only `useCaptchaOtp.tsx` changes in runtime. A synchronous per-hook operation
owns the initial HTTP wait, optional security check and proof-bearing HTTP wait.
Overlapping calls reject explicitly before dispatch. They do not coalesce into
multiple successful callers or replace the current phone/challenge resolver.

The rendered challenge carries its operation identity. Proof and Cancel only
settle that operation while current. A proof is consumed once in memory. The
hook rechecks ownership after awaiting the proof, so unmount in the same turn
cannot dispatch it. Ordinary server failures propagate unchanged, including
cooldown errors; only the existing 428 response opens the proof step.

Unmount rejects outstanding caller work and any waiting challenge, clears the
active operation and observes late HTTP rejection without reopening the modal.
Late HTTP success cannot resolve that cancelled caller or trigger its success
navigation. Explicit cancellation/failure releases ownership for a fresh manual
attempt. React StrictMode setup/cleanup is included in the rendered tests.

This is not a network abort or server rollback. A previously dispatched request
can still send a message and update the auth store's existing `otpRequestId`.
The store, HTTP transport and server remain unchanged. No account credentials
are issued by this hook. Ownership is per hook instance, not a replacement for
server abuse controls or coordination across tabs/devices. Existing caller
catch/error presentation remains, including possible cancellation feedback
after leaving a registration/resend screen. That is not claimed as polished UX.

Login, registration and resend were read together with the complete auth store,
transport, both widgets and controls. The existing return type remains
`Promise<void>`; callers already handle rejection. No role, admin factor, OTP
policy, schema, dependency, widget, gate or workflow change was made. No
automatic retry, new request timeout, token cache or new sign-in method exists.

## Verification

Each bug has its own file and behavioral `it('Bug ...')`. OPS-544 exercises
same/different-phone overlap during initial wait, challenge and proof wait,
the original phone/proof pairing, failure without automatic replay, explicit
cancellation and successful later retry, plus unchanged non-428 errors.
OPS-545 exercises the actual login handler and each awaiting stage on unmount,
late 428/proof/success, invocation of the removed hook, and proof-callback plus
unmount before its asynchronous dispatch continuation.

Initial focused selection: five suites/five tests, 2.236s. Final reviewed
selection: seven suites/seven tests, 2.546s, zero skips/TODOs. Existing widget
ownership, settlement, resend, responsive auth and public legal-link tests
remain. Full mobile: **601 suites / 885 tests passed**, 84 TODOs, zero skips or
failures, 150.118s. TODOs are not completed behavior. Types and scoped lint
passed. Unchanged local Gate A: ten fragments; Gate C: seven articles; all
seven smoke scripts passed. No assertions, thresholds or gate modes weakened.

No new local API/admin full run, real SQL, compiled-browser or device acceptance
is claimed for this slice. Fresh exact-candidate CI must run both new tests,
all client/API/admin regressions, types/builds, compiled web, both Nginx checks
and actual API image build/boot before another runtime function changes.
Preceding green CI is not verification of this changed hook.

## Remaining program and delivery

Next acceptance includes native widget error/reopen/late-message lifecycle,
configured-method discovery, role-aware linking/sign-in UI and real configured
Cloudflare/inbox acceptance. Native component state is not repaired by this
hook correction. Phone/email/social and full authentication are not closed.

Live remains the separately preserved old API containment. No server, account,
configuration, payment, shared service or native worktree changed. Current
source requires a selected image, complete restored migration chain through
179, matched API/admin/web/native authentication, backup/rollback and guarded
release before activation. No usable APK or updater is claimed. All 124 findings,
15 journeys, 14 categories and customer/provider/admin, business/support/payment/
job, Stitch/blue design and signed Android/update work remain in the full plan.

## Completed exact-source hook verification

Published `0ae977f3d47b6673f1168249cb19ece464a58a5b` passed CI `37939133316`
and Gates `37939133296`. Actual GitHub commit objects confirm CI checkout
`62223faf66249464592c0b09c8945c324fec1e90` and the topic share source tree
`645b85af0d95d855ed6cfd41a3b201a71e43aa3f`.

Actual mobile: 601 suites/885 tests passed, 84 TODOs, zero skips/failures,
51.696s; OPS-544/545 explicitly executed, types and compiled web passed. API:
1031 suites/3647 tests passed, two TODOs, zero skips/failures, 136.788s;
named refund, email/linking, issuer SQL and both Nginx checks passed. Admin:
598 passed files/one skipped file, 706 tests/three TODOs, 219.16s, types and
production build passed. Actual API Docker build and served `/health` passed.
The blank database's missing-table logs mean boot liveness, not readiness or
full-chain restoration.

Four complete job logs are retained with final cleanup. Web audit artifact
`11620995901` is not deployment eligible and was not downloaded or exercised
as a browser journey. Optional exact API/admin release packaging was skipped.
Conditional Gate B and D/E report-workload limits remain unchanged. No gate or
assertion was weakened. This completes bounded source verification, not live
Cloudflare/SMS/inbox, Android or release acceptance. The receipt accompanies
the related native component correction, not a public docs-only commit.
