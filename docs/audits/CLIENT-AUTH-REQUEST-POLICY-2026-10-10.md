# Client authentication request policy, October 10

## New capability, not a historical bug closure

The verified-email HTTP contracts require callers not to replay a one-time proof
after an uncertain or unsuccessful response. The existing client intentionally
refreshes its session and retries a complete 401 once. This change supplies an
explicit opt-out before those email callers are implemented; it does not claim
that an option supported by an earlier release regressed.

Contract-before-code tests against `d22499a1` failed three tests and passed the
ordinary-session compatibility test in 1.586s. The real client sent the original
proof, refreshed and resent it; followed a 307 to another owned HTTP peer; and
delivered a late response after a new login for the same account. The original
red report remains retained. These were synthetic local peers and credentials,
not a live email/account bypass or a deployed caller vulnerability reproduction.

## Request contract

Only `request` changes at runtime. `ApiRequestInit.auth` selects:

- `session`, the unchanged default: existing bearer/refresh/one-replay behavior.
- `session-no-replay`: current stored bearer, without refresh or replay.
- `anonymous`: no stored or caller-supplied bearer, without refresh or replay.

Both opt-ins strip caller-supplied Authorization, Cookie and Cookie2 headers,
override the internal bearer selection, and request `credentials: 'omit'`,
`cache: 'no-store'` and `redirect: 'error'`. The private `auth` option is removed
before fetch. Invalid runtime modes fail before dispatch. Neither opt-in clears
tokens, removes the stored user or calls the session-expired handler on a 401.
The existing response envelope, error status, signal and body deadline remain.

The initiating account and refresh-token snapshot must still match before a
response or failure reaches the caller. This also rejects a late result after
a new login/rotation for the same account. It is deliberately conservative:
another legitimate rotation can invalidate an in-flight proof response. The
caller must resolve that uncertainty, not resend automatically or apply stale
credentials. This is not cross-tab locking or server-side rollback.

## Actual verification and limits

Seven new tests use the real wrapper, native Node fetch and owned HTTP peers.
They check complete 401 handling, bearer selection, explicit credential removal,
202 receipt preservation, 400/401/403/428/429/503 errors, all five redirect statuses,
account/new-login ownership, cancellation before/after dispatch, broken 401
bodies, invalid modes and unchanged ordinary-session refresh/replay. The peers
observe request counts and credentials; separate redirect peers receive nothing.
A call-through fetch spy checks the supplied policy flags, not a mock response.

Initial focused three suites/six tests passed in 2.183s. The expanded five
suites/twelve tests passed in 36.018s but overlapped a final test-only strengthening
of the exact response assertion. That is an intermediate receipt, not the final
source receipt. Final reviewed five suites/twelve tests passed in 35.670s,
without skips/TODOs. Full mobile passed 612 suites/903 tests, 84 existing TODOs,
zero skips/failures, in 201.595s. Runtime and tests were unchanged during that
full run. Final types/scoped lint and unchanged Gate A (ten fragments), Gate C
(seven articles) and seven gate smoke scripts pass. No gate, mode or assertion
was weakened. No new local API/admin full run, SQL or device proof is claimed;
exact-candidate full CI remains required after publication.

This is Node transport acceptance, not proof of Android/iOS network-stack or
browser-cookie behavior. React Native's installed XHR-backed fetch does not
enforce every standard RequestInit option; the flags alone are not native
redirect/cache isolation. Native/browser enforcement still requires platform
acceptance before a proof caller is advertised as safe on those platforms.
No claim is made that cancelling HTTP cancels already-accepted server effects.

No screen currently uses the new modes. Role-aware email linking/sign-in callers,
configured method discovery, real CAPTCHA/inbox delivery, lost-response recovery,
and native/browser acceptance remain unfinished. Email features stay off.
Phone policy, server authority, administrator password/TOTP, API/schema,
dependencies, gates and separate Android worktree are unchanged. This is not
working email/social sign-in, a usable APK, deployment or launch readiness.

The selected-image restored migration chain through 179, matched authenticated
clients, upload references and rollback remain required before release. All 124
historical findings remain 117 unreconciled, seven partial and zero closed.
