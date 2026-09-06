# Admin mandatory-password state and replacement lifecycle

Date: 2026-09-06, Asia/Singapore. Baseline
`a67b211c8e9c12e4df42ea302781c032663730d6`. Candidate correction, not deployed.

## Reproduced defects

UX-1371 renders real App, BrowserRouter, Header, auth store, API wrapper and
ChangePasswordPage. Only dashboard content and native HTTP are synthetic.
A current request receives `password_rotation_required`. The old wrapper
changes the URL but not `mustRotatePassword`, leaving the required banner
absent and the voluntary Cancel action present. The regression failed in
**3.42 seconds** before runtime correction. It stops at the missing banner;
later route-guard assertions are not claimed as executed red evidence.

UX-1372 starts a delayed record read, opens the actual password screen through
Header, completes the real form, and chooses Continue to operations. Releasing
the earlier request's rotation response sends the operator back incorrectly.
After correcting a test selector, this failed on the actual unexpected
`/change-password` path in **3.19 seconds**, started at local `12:04:25`, against
unchanged runtime. The first test attempt failed earlier because an exact label
selector included a required-field star; that fixture failure is not evidence
of the delayed-response defect. One sandboxed runner attempt could not access
the installed npx entry; the normal authorized local runner then executed it.

This is not evidence of a production incident or server permission bypass.
Existing API rotation enforcement was never disabled or changed.

## Bounded correction

The existing shared request-lifetime module now reports a current server
requirement to the real auth store without creating an API/store import cycle.
The store marks the requirement and retires older startup-read tickets. It does
not retire an in-flight password change just because a requirement arrives.
The password form and route guard therefore agree, including when the form is
already open. No extra navigation resets fields on that already-open page.
The store subscription has hot-reload cleanup.

A successful password change clears the requirement only for its captured
request lifetime. It retires old requests and startup reads because the server
has replaced this browser's session. Old responses cannot reapply old rotation
state. A genuinely new current requirement still takes effect, including
replacing an old success panel with the empty password form. Failed changes
leave the requirement, fields and current request lifetime intact.

This is the narrow same-tab engineering continuation of E79 under Ken's current
delegated approval. No new dependency, server cookie policy, security recovery
hold, permission, financial setting, database schema or historical record changed.
It is not complete cross-tab/cookie-response arbitration and cannot undo an
already-processed server mutation.

## Real-render verification

Seven supporting tests exercise the actual password page, API and store:

- Current requirement on an already-open form retains all three fields and
  enabled submission without extra history navigation.
- An earlier `/auth/me` result cannot clear a newer required state.
- Completed replacement invalidates earlier hydration; a fresh requirement
  still opens the form instead of leaving the completed panel.
- A requirement arriving during submission does not invalidate the successful
  password response itself.
- Failed submission retains the guard and request lifetime.
- Same-actor login, different-actor login and abort prevent obsolete requirement
  delivery.
- Generic preconditions do not become password requirements; an obsolete
  completion cannot clear a newly signed-in operator's requirement.

TypeScript and changed-file lint pass. The focused selection passes **6 files /
27 tests, 4.96 seconds**, started at local `12:10:03`, including existing password
validation, refresh-result and request-session tests. The unchanged ID gate
passes **1,567 titled regressions**; diff checks pass. The complete local admin
suite and fresh candidate CI are separate requirements and must pass before
their respective claims. Results will be appended below, not predicted.

## Compiled browser evidence

Evidence root:
`.ai-coder/checkpoints/logs/admin-password-rotation-lifecycle-2026-09-06/`.
The harness runs the compiled App, Provider 360 Notes, actual Header navigation,
password form and dashboard, with all HTTP and cookies synthetic. It records
fake note bodies and CSRF identifiers but not password bodies or cookie headers.
Realtime and unexpected external requests are blocked.

The preceding compiled candidate fails the first **320px runtime-required**
scenario because the required banner is missing: **0 completed cases**. That
trace and screenshot are retained in `before`. It does not establish a complete
failing baseline matrix or a separate browser red run of every scenario.

The corrected build passes **24/24 scenarios** at **320, 390, 768, 1024, 1366 and
1920px**. At every width it checks runtime-required route gating, arrival during
an unfinished password draft, an obsolete response after successful completion,
and a rejected password followed by explicit successful retry. Exact write
sequences and payloads, original CSRF, no extra full-document navigation, required
copy, absence of Cancel and completed return to operations are asserted.

There are **72 new final captures**, zero page exceptions, unexpected HTTP or
document overflow at captured stages. The test passwords are visibly masked
in form captures. This is not real authentication, server password/CSRF renewal,
PostgreSQL acceptance, all-browser accessibility or complete Stitch review.
The previous refresh and operator-ownership matrices are being repeated on the
same build; actual results will be recorded separately.

All **93 runtime source files** match the isolated build after newline
normalization. A default-ignore discovery initially counted 87; the subsequent
hidden/no-ignore inventory verified all 93. Fresh output transformed **2,847
modules in 10.38 seconds**. Old output and evidence remain preserved.

## Remaining work and release boundary

The prior candidate `a67b211c` passed all four jobs in CI `34009903130` and Gates
`34009903135`. Admin job `101423783315` explicitly passed UX-1370 at
`2026-09-06T03:51:34Z`, its three supporting tests at `03:51:40Z`, and **585 files /
682 tests**, with one skipped file / three TODOs, at `04:01:15Z`. That result is
independent verification of the preceding fix, not this newer working tree.

E79's delayed Set-Cookie, concurrent refresh, cross-tab identity, old logout
completion and realtime lifecycle issues remain open. Caller-side operations
after a promise already resolves also need their own ownership checks. The
guarded password completion is one concrete callsite, not proof about all callers.
Refresh-endpoint transport/5xx classification remains unchanged.

Full customer/provider/admin feature and Stitch review, assignment eligibility,
provider revision/resubmission/privacy work, migration-172 rehearsal, paired
publishing, authenticated live client accounts, native baselines and external
legal/operational sign-offs remain unfinished. Candidate, master and live are
not aligned; no SSH, deployment, live password, payment or record change occurred
in this continuation. Do not infer launch readiness from this bounded checkpoint.

## Completed browser repeats and direct inspection

The unchanged preceding harnesses also pass on this exact build:
`refresh-recheck` **42/42 scenarios / 108 captures** and
`request-session-recheck` **18/18 / 54 captures**. Both report zero page
exceptions, unexpected HTTP or document overflow. Together with the new matrix
there are **84 passing scenarios / 234 final captures**. Their synthetic auth,
note and realtime limitations remain the same as the original harnesses.

All three final reports identify the same compiled output:

- Entry SHA-256: `4988fef5a39afd0391df82ca2d389fa628b776a0b0942fc122886adc2191125e`.
- Index SHA-256: `bc3b7e2d73e97d2f3bbb72f5566866aeb2e87c5d59b3aedffffef4d66ff09967`.
- Report times: `2026-09-06T04:17:19.961Z` (new), `04:18:45.897Z` (refresh
  repeat), `04:19:44.990Z` (request ownership repeat).

Direct screenshot review confirms the mandatory banner, absence of Cancel and
readable stacked form at 320px. At 1366px the rejected-password alert, mandatory
banner, retained masked fields and retry action are visible together. The 320px
Header search prompt is clipped; that separate layout problem remains open.
No blanket all-screen design or accessibility acceptance is implied.

## Complete local suite

The complete four-worker admin run passed **588 files / 691 tests**, with
**1 skipped file / 3 TODOs**, in **353.87 seconds**, started at local `12:22:39`.
No build or browser matrix overlapped the run. Existing marketing-dialog
description warnings remain. No timeout, assertion, lint rule, test configuration
or gate was weakened. This resolves the complete-local-suite requirement above;
fresh candidate GitHub CI and safe deployment are still separate requirements.
