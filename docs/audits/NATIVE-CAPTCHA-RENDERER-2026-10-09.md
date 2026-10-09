# Native security-check renderer termination, October 9

## Reproduced failure and correction

OPS-551 reproduces on exact-source-verified predecessor `6d316e95`. The real
native component leaves its page/spinner or blank waiting area visible after
the WebView renderer-termination callbacks. All six observations fail to show
the recoverable error: Android `didCrash: true`, Android `didCrash: false`, and
iOS content termination, each before and after page-load completion. One suite/
one behavioral test failed in 1.221s; the original report is preserved.

Only `NativeChallenge` changes in runtime. Both renderer callbacks now use its
existing terminal failure handler, just like the existing network/HTTP error
callbacks. There is no reload, automatic retry, proof submission, new timer,
new error state, navigation change or logging of native event payloads.

The installed WebView shared implementation forwards renderer termination
separately from load errors. The upstream reference documents distinct
[Android renderer](https://github.com/react-native-webview/react-native-webview/blob/master/docs/Reference.md#onrenderprocessgone)
and [iOS content-process](https://github.com/react-native-webview/react-native-webview/blob/master/docs/Reference.md#oncontentprocessdidterminate)
callbacks. Neither a page's `onLoadEnd` nor the embedded JavaScript SDK timer
handles termination of the process that runs that page.

## Caller and regression evidence

The regression renders the actual native component and shared OTP hook under
React StrictMode with synthetic RN/WebView primitives and the auth-store HTTP
boundary. It verifies the visible error, removed WebView/spinner, no automatic
request, explicit Cancel settlement, fresh request for another phone, rejection
of late failed-page messages/termination events, exactly one current proof, and
no resurrection after proof or unmount. Android crash/reclamation and iOS
termination each execute the complete caller recovery sequence.

Focused six suites/six tests pass in 1.682s, without skips/TODOs, including
unchanged native lifecycle and embedded SDK regressions. Types and scoped lint
pass. Unchanged Gate A (ten fragments), Gate C (seven articles), and seven gate
smoke scripts pass. No assertion, gate mode or dependency was changed.

Final-source full local mobile regression passes 607 suites/891 tests, 84
existing TODOs, zero skips/failures, in 128.637s. The runtime and new test were
unchanged during this run. Final review reread the whole component, hook, new
regression and related evidence. No new local API/admin full run, SQL, compiled
browser or device acceptance is claimed. New exact-candidate CI remains required
after publication before another changed function is accepted. Older green runs
are not verification of this change.

## Explicit limits

The failing and passing evidence uses synthetic native callback events. It does
not kill an OS process, run a physical Android/iOS WebView, verify Cloudflare,
send an SMS, or prove device memory/animation/focus recovery. If no native event
is delivered, this correction supplies no independent watchdog. Whole-app
termination/restart and already-dispatched HTTP cancellation remain separate.

Navigation/origin/bridge restrictions still need bounded acceptance. No hook,
store, HTML, web component, server policy, role, factor, schema, configuration,
account, signing setup or separate native worktree changed. There is no usable
APK, new email/social method or live deployment from this change. The selected
image/full restored migration chain through 179, matched authenticated clients,
uploads/reference checks and rollback remain release prerequisites. The broad
124 findings, 15 journeys and 14 categories retain their existing status.
