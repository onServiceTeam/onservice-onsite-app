# Admin startup authentication response ownership

Date: 2026-09-06, Asia/Singapore. Baseline
`4fd131383cb62a05b360782bce1ecdf7e7e8d413`. Candidate work, not deployed.

## Confirmed defects and correction

| Regression | Before correction | Intended behavior |
| --- | --- | --- |
| UX-1366 | An old startup response replaces a newly signed-in operator and its rotation requirement. | A completed login supersedes outstanding startup checks, including failed checks. |
| UX-1367 | A startup response restores the old operator after logout completed. | Sign-out invalidates pending startup responses. |
| UX-1368 | Overlapping startup responses settle in arrival order, restoring an older role/rotation state. | Only the latest startup read can settle. |

The auth store now gives each startup read an ownership ticket. Login and both
initiation/completion of logout retire outstanding tickets. Successful login
also settles loading immediately, so ignoring an obsolete bootstrap cannot
strand the new operator behind a spinner. Current role validation, rotation
gating, no-cookie bootstrap and legacy local-token removal are retained.

E78 records the recommended bounded correction and Ken's current engineering
approval. The actual auth store, App, API wrapper, Header, LoginPage and
ChangePasswordPage were read in full. Server cookie helpers were read in full;
the server refresh/logout route region was read, not the entire auth route file.
Server cookies, session revocation, permissions, finances, migrations, dependencies
and production records are not changed by this client startup-read correction.

## Real-render tests and honest failed verification

UX-1366 renders actual App routes, LoginPage, Header and auth store, with synthetic
HTTP and reduced dashboard landing content. UX-1367/1368 render controls wired to
the real store, not mocked authentication logic. The login/logout regressions
both failed before runtime correction in **9.40 seconds**. The overlapping-read
regression separately failed on the rendered old role in **1.11 seconds**.
The first failing branch stops each pre-fix test; successful execution of all
late-failure variants is a post-fix claim, not invented additional red evidence.

After correction, focused selection passed **6 files / 9 tests**, **3.63 seconds**.
Four supporting real-render tests verify a current DPO role/rotation, a current
failure/non-admin response, immediate completed-login loading, and a startup read
begun during a failed logout. The last explicitly checks that local sign-out is
not evidence of server revocation: its synthetic cookie remains present.
TypeScript and changed-file lint pass. The unchanged ID gate passes with
**1,563 titled regressions**; diff checks pass.

The first full run overlapped the isolated build and **failed**: 4 failed files,
576 passing files, 1 skipped; 4 failed tests, 666 passing tests, 3 TODOs,
**186.20 seconds**. OPS-269, UX-1297 and UX-1312 hit their existing five-second
test limit. UX-1365 timed out on the initial lazy customer-page contact render.
All four passed in an isolated rerun, **4 files / 4 tests**, **4.30 seconds**,
without changing assertions, timeout values, test config or runtime source.
Resource contention is a plausible explanation, not proven from timing alone.

A complete rerun with four workers and no concurrent build/browser work is
required before publication. Its final result will be appended separately.
Existing marketing-dialog description warnings remain unresolved.

## Compiled browser verification

Evidence: `.ai-coder/checkpoints/logs/admin-startup-auth-2026-09-06/`.

- The prior cache-corrected build fails the first 320px scenario. Its failure
  screenshot visibly shows the old supervisor and obsolete rotation gate
  after the new login. This is **0 completed scenarios**, not a full red matrix.
- The corrected build passes **18/18 scenarios**: old success, old failure and
  preservation of newly required rotation at **320, 390, 768, 1024, 1366 and
  1920px**. The real compiled login, header, customer route and password-change
  guard execute against synthetic HTTP/cookies.
- **54 captures**, zero unexpected HTTP, zero page exceptions, zero document
  overflow. The only **18 writes** are synthetic login requests. No password,
  money, status or session-revocation action is submitted. Each case checks one
  startup read, the current operator email/permissions and ready admin chrome
  before releasing the obsolete startup response.
- The failed startup uses HTTP 403 without a rotation code. This intentionally
  isolates failed auth-store settlement; **401 refresh/replay is not certified**.
  Realtime is explicitly blocked. These are not live production login tests.
- Direct visual review covers the old narrow identity failure, corrected phone
  customer and corrected tablet required-password screen. This is not complete
  accessibility, full Stitch parity or password-change endpoint acceptance.

The isolated build transformed **2,846 modules in 1m 11s**. All **92 runtime
source files** match after newline normalization; auth.store.ts additionally
matches its exact file hash. No prior build/evidence directory was overwritten.
Report: `2026-09-06T02:03:39.794Z`.
Entry SHA-256: `9ae157ad914d398adff93f197a9e1557389011e46c460df5886de6df8f210371`.
Index SHA-256: `9aca7cd62779bf80545c3851015f5ee1390384940db98f4f7543959e0a87aeda`.

## Next boundaries

Fresh CI, release integration and production deployment remain separate checks.
The current work does not arbitrate competing cookie-writing login/logout/refresh
responses, suppress stale request retries or redirects, isolate cross-tab cookies,
or close realtime lifecycle. The bootstrap ticket is not a general authentication
epoch. Old logout completion, pre-auth setup/verification and late document/toast
responses need separate end-to-end investigation. A server-processed mutation
cannot be undone by ignoring a client response.

Full product/Stitch completion, provider-title readability, financial/action
semantics, matching eligibility, migration-172 rehearsal, paired publishing,
native baselines, authenticated live testing and external launch sign-offs remain
open. No financial hold or privileged recovery guard has been removed.

## Complete local rerun

The four-worker full rerun completed successfully: **580 passing files,
1 skipped file; 670 tests, 3 TODOs**, **302.23 seconds**, started at local
`10:05:08` on 2026-09-06. All existing assertions, timeout values and gate
configuration were unchanged. No build or browser audit overlapped this rerun.
This resolves the complete-local-rerun requirement above. The failed first
run remains recorded; fresh candidate CI and deployment are still separate.

## Independent candidate CI

Published candidate `aa6535623d84dcb09dfa83b36b3f02759c2c67f1` passed all four
jobs in CI `34006066256` and Gates `34006066263`. Admin job `101413351076`
explicitly passed the four startup-settlement tests at `2026-09-06T02:18:57Z`,
UX-1366 at `02:19:35Z`, UX-1368 at `02:21:23Z` and UX-1367 at `02:22:13Z`.
Its final totals at `02:28:54Z` are **580 passing files, 1 skipped file;
670 tests, 3 TODOs**. This resolves fresh CI for this startup checkpoint.
It does not imply deployment or complete authentication acceptance.

E79 subsequently reproduces an old HTTP 401 replaying a provider-note write
under a newer operator. The bounded follow-up and remaining cookie races are
tracked in `docs/audits/ADMIN-REQUEST-SESSION-OWNERSHIP-2026-09-06.md`.
