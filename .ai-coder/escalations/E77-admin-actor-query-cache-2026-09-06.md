# E77 - Admin query-cache ownership across operators

Date: 2026-09-06. Status: reproduced and corrected in locally verified candidate
code; recommended engineering containment authorized by Ken's current approval
of mandatory escalations. Fresh candidate CI remains required. This is not a
production/privacy sign-off.

## Reproduction

UX-1365 renders the real App routes, auth store, Header logout, LoginPage and
Customer 360. Only post-login dashboard content and HTTP are synthetic. It
loads an unmasked customer profile as a super-admin, uses the actual logout
control, fills/submits the actual login form as an ordinary admin, then opens
the same customer through the actual router. The new operator ID is verified.
The unchanged application still displays the prior super-admin's unmasked
phone. The test fails on that rendered value in 4.14 seconds. No production
identity, real credential or customer data participated.

main.tsx creates a single long-lived QueryClient. Normal logout/login does
not reload the application. Cached profile query keys contain the customer
or provider record ID, not the operator. Record-level draft keys from E76 do
not solve this separate cache-authorization boundary.

## Recommended option A: an isolated query client per active operator boundary

Put the route subtree under a keyed query provider owned by authenticated
operator ID and role, with a separate signed-out boundary. A different owner
gets a fresh client and remounted route state. Same-owner navigation retains
normal caching. Clear the retired client on unmount, but do not reuse it for
the next operator: late old callbacks must not write into the new cache.
Retain current query defaults. Keep App's hydration effect outside the keyed
subtree so cache isolation does not repeatedly bootstrap authentication.

This uses existing React/React Query dependencies and existing session-bound
data intent. A shared-client clear in an ordinary after-render effect is not
preferred because it permits stale rendering and old callbacks still hold
the same client. Globally disabling caching would degrade normal operations
without establishing a reliable ownership boundary.

## Scope and required follow-up

- Verify the real logout/login regression green, late old data isolation,
  stable same-owner caching and a role change on the same operator ID.
- Verify types, lint, affected auth/routing regressions, full admin tests,
  compiled-browser behavior and fresh CI before publication/acceptance claims.
- No new permissions, financial rule, server identity, live session, secret,
  ledger, status decision, gate, branch protection or production service is
  changed by this UI-cache containment.
- This does not cancel a server-processed request, solve cookie changes from
  another browser tab, govern every late transport replay, or provide an
  external compliance sign-off. The API wrapper, auth-store async completion
  and socket lifecycle need separate tests and corrections as warranted.

The finding was surfaced to Ken before implementation. His current engineering
approval is the authority; do not invent a separate named E77 approval or call
all session isolation complete from this bounded correction.

## Local verification checkpoint

UX-1365 now passes the actual logout/login route regression. Four additional
behavior tests verify same-owner continuity, same-ID role changes, late query
responses and late callbacks using their retired query client. Complete admin
execution passes 576 files / 663 tests, with 1 skipped file / 3 TODOs. Types,
changed-file lint and the unchanged regression-ID gate pass. Compiled browser
checks pass 24 scenarios across customer/provider pages and six widths, with
72 captures, no unexpected HTTP, no page exceptions and no document overflow.
The old compiled app fails its first scenario. No production request occurred.
Evidence and limits: `docs/audits/ADMIN-ACTOR-QUERY-CACHE-2026-09-06.md`.
