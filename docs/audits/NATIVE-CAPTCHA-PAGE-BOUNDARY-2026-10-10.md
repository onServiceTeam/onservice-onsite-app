# Native security-check page boundaries, October 10

## Reproduced behavior

Two behavioral regressions reproduce on verified predecessor `dd937cc9`:

- **SEC-086:** ten unrelated top-document destinations return an allow decision
  from the installed WebView JavaScript policy. None produces the application's
  recoverable error. These include foreign/deceptive hosts, HTTP, another app
  path, a top-level challenge-provider page, and intent/file/JavaScript schemes.
- **SEC-087:** twelve foreign, opaque, missing or unexpected bridge attributions
  each submit the synthetic proof to the actual OTP hook's store boundary. A
  trusted-looking URL inside the payload does not supply native attribution.

The original two suites/two tests failed in 31.115s. Original reports remain
private and unmodified. This demonstrates client forwarding, not successful
server CAPTCHA validation, SMS delivery, account access or an authentication
bypass. No real user, external page or credential was used.

## Correction and compatibility

Runtime changes are confined to `NativeChallenge` and a shared constant for its
existing static base URL. An explicit navigation policy allows that document's
root and `about:blank`. Identified child frames may additionally load the exact
HTTPS challenge-provider origin and `about:srcdoc`. Unexpected navigation,
observed top-page changes and new-window events terminate the attempt with the
existing recoverable error. Cancel remains explicit; no automatic retry occurs.

The broad library whitelist remains intentionally unchanged. The installed
WebView library otherwise opens non-whitelisted URLs through React Native
`Linking`, before the custom policy can deny them. Tests execute that installed
policy and verify zero external-link calls. This is not a claim that a real OS
navigation was attempted or blocked on a device.

Bridge processing now requires native event attribution matching the existing
base origin or its trailing-slash document form. The modern Android bridge
reports an origin; iOS reports the message frame URL; the Android fallback reports
the current top-level URL. Payload-supplied URLs are ignored. Opaque/missing or
unexpected attribution fails closed without sending a proof. Existing synthetic
fixtures now include the native URL field; their original assertions remain.

Allowed child-frame forms follow [Cloudflare's mobile integration requirements](https://developers.cloudflare.com/turnstile/get-started/mobile-implementation/).
The correction does not intercept SDK fetches, change cookies, user agents,
JavaScript/storage settings, server verification or factor/account policy.

## Evidence and remaining limits

The new navigation regression renders the real native component and executes
the installed WebView shared hook, whitelist and event implementation. It checks
denied top/frame destinations, allowed challenge/opaque child frames, observed
navigation after a native decision timeout, new windows, terminal/late events,
successful current proof and no external `Linking`. The origin regression uses
the real OTP hook to check no proof request from unexpected attributions,
explicit cancellation, new-phone ownership and exactly one fresh submission.
Physical WebViews, RN primitives and the store HTTP boundary remain synthetic.

Initial focused eight suites/eight tests passed in 2.291s without skips/TODOs.
Expanded final focused eight/eight passed in 3.394s. Full local mobile regression
passed 609 suites/893 tests, 84 existing TODOs, zero skips/failures, in 214.734s.
Only explanatory comments changed during that full run; TypeScript-emitted
JavaScript, with comments removed, retained SHA256
`172af20e9df1c0e0bdbb99cb1f7b1a574adb6f4ff8c6581567cb5b7525fbc076`.
Types and scoped lint passed. Unchanged Gate A (ten fragments), Gate C (seven
articles) and seven gate smoke scripts passed. No assertion/gate was weakened.
No new local API/admin full run, SQL, compiled browser or device test is claimed.
Exact-candidate CI remains required after publication before another function.

The installed Android navigation callback waits only 250ms and allows loading
if its JS decision times out. The observed-navigation handler invalidates the
attempt when reported; it cannot retroactively prevent a request or guarantee
event delivery/order. The legacy Android bridge cannot identify a subframe's
actual origin, and modern origin-only attribution cannot distinguish paths on
the same origin. This is not cryptographic page identity or complete native
navigation/network isolation. Real Android/iOS, configured Cloudflare, legitimate
provider-link behavior and SMS acceptance remain release requirements. No opaque
bridge fallback was added to make an unverified device configuration appear to
work. Popup attempts intentionally show the recoverable error instead of opening
another app inside the verification flow.

No hook/store/server, schema, dependency, gate, configuration, signing setup,
separate Android worktree or live service changed. There is no new usable APK,
email/social method or deployment. The current selected-image restoration through
migration 179, matched authenticated clients, upload references and rollback
remain required. The broad 124 findings, 15 journeys and 14 categories retain
their existing status; no launch-readiness claim follows from these tests.
