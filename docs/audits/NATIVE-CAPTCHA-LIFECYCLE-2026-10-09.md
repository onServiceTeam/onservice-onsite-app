# Native security-check lifecycle, October 9

## Reproduced failures

Against exact-source-verified `0ae977f3`, actual React DOM renders of the native
Turnstile component reproduced these failures before runtime edits:

- **OPS-546:** an error message survived closing and reopening the component.
  The next visible attempt had no WebView and could never supply a new proof.
- **OPS-547:** two bridge token callbacks from one page both reached the
  parent. The regression expected one callback and observed two.
- **OPS-548:** a native page-load error did not reach an application failure
  state. The waiting check remained instead of a recoverable error.

The first two original tests failed in 1.326s. The separate original load-error
test failed in 1.537s. Each bug has its own file and behavioral `it('Bug ...')`.
Original reports remain retained. These are component regressions with synthetic
WebView callbacks and React Native primitives, not device/network observations.
No real Cloudflare, SMS, account, credential or production request was used.

## Correction and caller consequences

Only the native `TurnstileModal.tsx` changes in runtime. Its visible attempt is
now a child component which unmounts when hidden. Reopening creates fresh loading
and error state. Removed attempts retain their own inactive callback guard and
cannot affect a later page. Current parent callbacks remain fresh within the
same visible attempt.

An attempt tracks pending, proof, failed or cancelled state. A proof settles
once. Failure prevents later proof; Cancel can dismiss failure but runs once.
Native page and HTTP load errors enter the same visible error state. Late load
completion cannot overwrite a settled attempt. Malformed JSON and non-string/
empty proof payloads are ignored rather than delivered to the caller. Server
proof validation remains authoritative and unchanged.

The existing hook still owns the phone request and 428 challenge flow. A rendered
integration covers failed phone A, Cancel, a fresh phone B check, ignored late A
proof and one exact B/proof request. No automatic request, resend, token cache,
role change, privileged shortcut, policy change or dependency was introduced.
The separate web component, hook, auth store and API are unchanged.

Hiding now unmounts the native modal attempt, rather than retaining its hidden
state. A physical-device check is still needed for dismissal animation, hardware
Back and accessibility focus. Component cleanup is not proof of native network
cancellation or WebView-process destruction. It cannot undo a sent HTTP/SMS.

## Verification

Initial focused selection: five suites/five tests passed in 2.257s. Reviewed
selection: seven suites/seven tests passed in 2.608s, zero skips/TODOs, including
the unchanged hook and browser widget regressions. Coverage includes StrictMode,
error/reopen, stale and duplicate callbacks, failure/cancellation/unmount,
malformed bridge input, current parent callbacks, native network/HTTP errors and
the actual request hook paired with the native component. Native primitives,
WebView and the store's HTTP boundary remain synthetic.

Types and scoped lint passed. Unchanged Gate A (ten fragments), Gate C (seven
articles) and seven gate smoke scripts passed. Full mobile: **604 suites/888
tests passed**, 84 TODOs, zero skips/failures, 159.191s. TODOs remain unfinished
work. No new local API/admin full run, real SQL or compiled-browser/device
acceptance is claimed. Exact-candidate CI must execute all three regressions,
the full API/admin/mobile matrix, types/builds, compiled web, both Nginx checks
and API image build/boot before another function changes. No gate, assertion,
threshold or native signing/build configuration was weakened.

## Remaining acceptance and full program

This is not an installable APK or device acceptance. Native SDK loading,
navigation/origin behavior, provider configuration, physical bridge behavior,
OS process death and real challenge/SMS/inbox journeys remain to be checked.
`onLoadEnd` is page loading, not proof of SDK readiness or a solved challenge.
No SDK-load/solving deadline, WebView process-crash recovery or silent retry was
added. Existing broader caller error/toast presentation remains separate work.

No live server, account, configuration or separate native worktree changed.
Live remains the preserved old API containment, not this accumulated candidate.
Current source needs a selected image/full restored chain through 179, matched
API/admin/customer-provider/native authenticated acceptance, backup/rollback
and guarded release. Real payment tests remain disallowed on the live-key system.

All 124 findings, 15 journeys and 14 categories remain in the ordered program,
including complete admin feasibility, business/support/payment/job linkage,
role-appropriate sign-in, canonical blue/Stitch alignment and signed Android
delivery with verified updates. No whole finding or launch requirement is closed
by these component tests.
