# E78 - Delayed admin startup checks can restore obsolete identity

Date: 2026-09-06. Status: reproduced; recommended narrow engineering correction
authorized by Ken's current approval of mandatory escalations. No external
security/compliance sign-off, server cookie policy or production acceptance.

UX-1366 uses real App routes, LoginPage, Header and auth store. A pending
startup /auth/me response replaces a newly signed-in ordinary operator with
the previous supervisor and old password-rotation requirement. UX-1367 renders
the real store's session controls and reproduces an outstanding startup check
restoring the old operator after logout completed. Both regressions fail on
real state/output before runtime correction: 2 files / 2 failures, 9.40 seconds.
Only synthetic HTTP/identities participate. The finding was surfaced before
implementation. The current broad engineering approval authorizes this narrow
recommended correction, not a fabricated separately named E78 decision.

## Recommended option A

Give startup checks a monotonically advancing ownership ticket. Only the latest
check may settle. Explicit login and both initiation/completion of logout
invalidate outstanding startup checks. Login must also finish the loading state,
otherwise ignoring the old bootstrap would strand a successful login behind a
spinner. Preserve existing role validation, password-rotation gating, HttpOnly
cookie handling, no-cookie bootstrap behavior and legacy token removal.

This is preferable to timing-based delays or merely checking whether the user ID
matches: stale responses may change roles/rotation requirements for the same ID,
and stale failures can erase an otherwise valid new login.

## Limits and next verification

This ticket belongs to startup identity reads, not all transport or session
operations. An already submitted logout/login/refresh can still change browser
cookies when its server response arrives. Old logout completion, competing
pre-auth flows, transport retry, cross-tab identity and socket lifecycle need
their own end-to-end treatment. Do not claim they are solved by a client-side
bootstrap guard. No financial action, production request, session policy,
dependency, migration or gate change is included.

Required verification: old successful/failed startup after new login, old startup
after logout, overlapping startup checks, latest valid/invalid role settlement,
fresh-login loading, full admin tests/types/lint, compiled browser checks and CI.

## Verification in progress

UX-1368 additionally reproduces the old overlapping read restoring the earlier
role/rotation, failing in 1.11 seconds. All three numbered regressions and four
supporting tests now pass, alongside existing bootstrap/cache tests: 6 files /
9 tests. Types and lint pass. Eighteen compiled browser scenarios pass with
54 captures across six widths. The first full local suite failed four timing
checks while a build overlapped; the four focused repeats passed unchanged.
A clean full rerun and fresh CI remain required, not assumed. Full evidence:
`docs/audits/ADMIN-STARTUP-AUTH-OWNERSHIP-2026-09-06.md`.

Final local rerun: 580 passing files / 670 tests, 1 skipped file / 3 TODOs,
302.23 seconds with four workers and no concurrent build/browser work. Assertions,
timeouts and gates were unchanged. The clean local requirement is resolved;
fresh CI and live acceptance remain separate.
