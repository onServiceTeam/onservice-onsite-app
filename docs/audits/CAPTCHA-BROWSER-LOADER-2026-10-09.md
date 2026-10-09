# Browser security-check script recovery, October 9

## Scope and original failures

This bounded client correction changes only the web Turnstile script loader.
It is not deployed and does not enable email/social sign-in or change the
native widget, server verification, account authority, OTP policy or admin
password/TOTP. The existing phone login, registration and resend callers use
this web component. Real configured Cloudflare and inbox acceptance remain open.

On preceding candidate `68b608c3`, the actual rendered web component reproduced
OPS-540: a script load event without the SDK global rejected a promise that
remained cached. Closing and reopening returned the same failed attempt instead
of inserting a fresh script. The original real-render regression failed its
new-script identity assertion: one failed test, 7.731s. Explicit network failure
already cleared the promise, but left failed script elements behind.

During review of this same loader, OPS-541 reproduced an indefinite loading
state when neither script event arrived. Before adding the deadline, the
second real-render test advanced the actual loader clock by 15 seconds and
failed because no visible error appeared: one failed test, 1.218s. This second
original was run after the OPS-540 correction, not against an unchanged whole
baseline. Both original failed reports are retained privately.

## Correction and caller consequences

- Both explicit failure paths remove the failed element, detach its callbacks
  and clear the shared promise so a subsequent explicit reopening can retry.
- A 15-second script-load deadline ends an otherwise indefinite spinner with
  the existing visible connection error. It is an engineering wait bound, not
  a Cloudflare SLA or a deadline for a person solving a loaded challenge.
- Success/failure clears the timer. Settled handlers cannot clear a newer
  attempt's promise. A late event on an old removed script cannot render a
  widget or interfere with the new attempt through these handlers.
- Existing in-flight sharing and loaded-SDK reuse remain. There is no automatic
  script retry, phone/email request replay or automatic proof submission.
- Existing cancel control, callback routing and widget cleanup remain. No
  dependency, schema, config flag, native worktree, workflow or gate changes.

Removing a script is **not** proof that a browser aborts its network transfer
or cannot later execute provider JavaScript. This correction bounds the
application's loader wait and detaches its callbacks. Broader widget callback,
hook cancellation and actual browser lifecycle acceptance are separate work.

## Verification and review

Each bug has its own test file and `it('Bug ...')` with an actual React DOM
render. Real component state, script elements/events, controls and cleanup run.
React Native primitives and Cloudflare's SDK are test boundaries; no real
provider challenge or user credential is claimed.

OPS-540 covers visible missing-SDK failure, actual Cancel, close/reopen, removal
and replacement, a network error and second explicit recovery, successful SDK
render into the real host, proof callback and widget cleanup. OPS-541 covers
14,999ms versus 15,000ms, error/no token, zero remaining loader timers, explicit
recovery, ignored old events, successful render and no deadline imposed after
the widget loads. Neither test uses source-text matching as behavior proof.

The initial four-suite OPS-540 selection passed four tests in 4.226s; its full
mobile run passed 596 suites / 880 tests with 84 TODOs in 129.379s. Those runs
preceded the deadline extension and are not final-source evidence.

The first deadline-corrected selection failed one of five tests in 2.672s:
Jest also counted React `act`'s faked microtask as a timer. Reading the installed
timer and React implementations identified that fixture mismatch. The fixture
now leaves `queueMicrotask` real while faking timers; the original zero-timer
assertions remain. The failed report is retained, not replaced with a green
receipt. An initial lint failure for unnecessary `HTMLScriptElement` generics
was corrected by removing them, not by changing lint rules.

Final focused selection: **five suites / five tests passed**, 1.737s, including
three unchanged rendered resend, responsive-layout and legal-link regressions.
Final full mobile: **597 suites / 881 tests passed**, 84 TODOs, no failures or
skips, 114.599s. Types and scoped lint pass. Gate A's ten fragments, Gate C's
seven articles and all seven gate smoke scripts pass unchanged. Original
failures and intermediate/final receipts are retained separately.

The current slice does not claim a new local API/admin full run or compiled
browser journey. Before changing another function, require exact-candidate
GitHub API/admin/mobile regression, types/builds, compiled web, both Nginx
checks and actual API image build/boot. Preceding green CI is not verification
of these client changes. Optional packaging and report-mode gates do not prove
readiness or permission to activate a release.

## Remaining program and live status

The preceding server CAPTCHA transport correction completed exact-source CI;
its receipt is appended to that audit with this related implementation. Neither
that result nor this jsdom evidence proves configured widget, email inbox,
native device, full role journey or production acceptance.

Email linking/sign-in remain opt-in and disabled. No fake/unconfigured social
buttons, legacy contact-email linking, account merge or privileged shortcut is
introduced. Live still uses the separately preserved old API containment, not
the accumulated topic candidate. The current source requires complete selected
image/migrations through 179 restoration, paired API/admin/web authentication,
backup/rollback and guarded release acceptance before live synchronization.

All 124 historical findings retain their separate reconciliation status. This
does not close full sign-in, money, admin feasibility, Stitch/native or launch
acceptance. The broader customer/provider/admin, support/payment/job linkage,
signed APK and verified update-delivery program remains active.

## Completed exact-source verification of this loader

Published `cb0511752dcb80f71a72dcf5db9ac3cb3125f346` completed CI `37932784705`
and Gates `37932784702` successfully. Actual CI checkout
`5c03e87783ceb941238c818a1fbe48116c02f032` and the topic commit share source tree
`7fbadf03f6e87add5bab147c6179f16102af1ff5`; both commit objects were checked.

Actual mobile logs pass 597 suites / 881 tests, 84 TODOs, zero skips/failures,
47.102s, including both OPS-540/541 regressions, types and compiled web. API
logs pass 1031 suites / 3647 tests, two TODOs, zero skips/failures, 117.112s,
including the named email/linking SQL, refund, issuer, server CAPTCHA and both
Nginx checks. Admin passes 598 files / 706 tests, one skipped file and three
TODOs, 272.92s, types and production build. Actual API image build and served
`/health` pass. Missing tables in the blank boot database still mean liveness,
not readiness or full-chain selected-image acceptance.

All four full job logs were retained with their final cleanup. Web audit
artifact `11617012884` is not deployment eligible and was not downloaded or
exercised as a browser journey. Optional exact API/admin packaging was skipped.
Gate B's conditional dispatch and D/E report-workload limits remain unchanged.
No assertions or gates were weakened. This completes this loader's source
verification, not deployment, configured Cloudflare/inbox/native acceptance or
launch readiness. The receipt is included with the related widget-ownership
runtime correction, not a separate documentation-only CI loop.
