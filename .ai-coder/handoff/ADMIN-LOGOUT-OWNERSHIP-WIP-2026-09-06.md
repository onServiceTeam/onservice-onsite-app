# Admin logout investigation and continuation

Working history, 2026-09-06. The initial reproduction below is retained as history;
the later correction update supersedes its original unimplemented status.

## Published checkpoint

`9382ac7e912ce073d1bb8296e2ed857311c1b580` is committed and pushed to
`codex/financials-operator-truth`, PR 81. It contains only UX-1371/1372 password
lifecycle runtime, three test files, public audit/limitations updates and synthetic
browser evidence (250 files total). Protected local decision records and AGENTS.md
were excluded. No master merge, release label, server or database change occurred.

Before publication, complete local Admin passed 588 files / 691 tests, one skipped
file / three TODOs, 353.87 seconds, start local 12:22:39. Types, changed-file lint
and the unchanged ID gate (1,567 regressions) passed. All 84 compiled-browser
scenarios passed, with 234 final captures. See the published
`docs/audits/ADMIN-PASSWORD-ROTATION-LIFECYCLE-2026-09-06.md` for full boundaries.

Fresh runs for that exact checkpoint are CI `34011734961` and Gates `34011734968`.
Read their actual final status/logs before claiming independent verification.
Prior `a67b211c` passed all CI jobs and Gates, documented in the published audit.
Master was separately verified at `738641095d3ae1dcbba14c5803b96cf63ae93ee8`.
Production was not inspected in this continuation and has not been updated here.

## New actual reproduction, intentionally outside that publication

Uncommitted file:
`apps/admin/src/__tests__/bug-ux-1373-admin-obsolete-logout-completion.real.test.tsx`.
It renders actual App, BrowserRouter, Header, LoginPage, auth store and API wrapper.
Only dashboard content and native HTTP are synthetic. The actual Header allows
two pending logout clicks. The newer logout completes, then the actual LoginPage
signs in another operator. The first logout finishes afterward and removes that
new operator from the store.

Against unchanged `9382ac7e` runtime, the test fails on the new user's ID becoming
undefined in **2.35 seconds**, started local **12:34:58**. The later URL/Header
assertions do not execute after that first failure, so they are not separate red
evidence. An unsupported test-only role-query `exact` option was removed before
this run. No production account was used. Old Set-Cookie delivery is deliberately
excluded from this fixture and remains an independent unresolved boundary.

At that original reproduction the expanded local tree was **not all-green**. Do not publish this
failing test alone or attribute it to the checkpoint's 691 passing tests.
There was no runtime correction for UX-1373 at that point.

## Recommended bounded next work under current engineering approval

The complete current Header, App, AdminLayout, AdminSessionQueries, API wrapper,
auth store, existing login-intent test and Security Posture have been read.
E79 already identifies old logout completion and Header navigation as open.

1. Preserve the current logout request's ownership after starting logout. Before
   its final state cleanup, refuse to clear state if a newer login, role change
   or logout now owns the request lifetime. Do not weaken legitimate logout,
   server revocation or current-owner cleanup on a failed logout response.
2. Prevent the old Header callback's unconditional `/login` navigation too.
   Consider using the existing AdminLayout authentication guard as the single
   navigation authority, or return an explicit owned-completion result from
   the store. Check existing real Header/logout tests before choosing. Do not
   rely only on disabling the button or comparing user IDs.
3. Make UX-1373 green; test both completion orders, same-user reauthentication,
   current logout success/failure and startup reads while logout is pending.
   Recheck the current password lifecycle and original E79 refresh/caches.
4. Retain actual compiled-browser before/after evidence using synthetic cookies
   and real controls. Run types/lint/unchanged gates/full affected suites and
   fresh CI before claiming their results. Keep failed attempts honest.
5. Do not claim this resolves delayed cookie writes, concurrent refresh,
   cross-tab sessions, realtime, external legal signoffs or paired release.

The active continuous development goal and existing heartbeat remain unchanged.
This is meaningful progress, not a blocked or completed goal. Continue safely
with the wider audit/build/release plan after this bounded issue.

## Later correction update

The recommended request-ownership guard and existing AdminLayout-owned redirect
are now implemented locally. UX-1373 and five supporting real App tests pass;
the focused selection passes 6 files / 16 tests. Types, changed-file lint and the
unchanged ID gate (1,568) pass. The old compiled build fails at the unexpected
Login URL, and the corrected build passes 18 new browser scenarios plus 42
request/password repeats, with 180 final captures. No live cookies or records
were used. Full local suite and fresh correction CI still require actual results.
The preceding 9382ac7e checkpoint is now verified: all four CI jobs and Gates
passed, with actual admin log evidence for 588 files / 691 tests.

Use `docs/audits/ADMIN-LOGOUT-OWNERSHIP-2026-09-06.md` for the current evidence,
precise build identity and subsequent verification additions. This note does
not authorize deployment or claim delayed-cookie/cross-tab/realtime resolution.

Final local correction suite passed **590 files / 697 tests**, with 1 skipped
file / 3 TODOs, in 346.56 seconds (start local 13:04:42). Fresh correction CI is
still required. The read-only server-handler review also identifies broader
session/cookie and password-write concurrency work to investigate separately;
no API runtime changes are included in this logout checkpoint.
