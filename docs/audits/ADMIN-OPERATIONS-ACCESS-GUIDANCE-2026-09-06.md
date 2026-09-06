# Admin operations training: access guidance correction

Date: 2026-09-06, Asia/Singapore. Documentation-only continuation after
candidate `806892aad5a2dd5407cd6836b3d7b6ff92602912`. Not a live rollout.

The complete operations training manual was read, not just its search matches.
Its access guidance contradicted D34 and the actual candidate App route and
navigation guards. The correction is limited to those verified access facts.

| Previous instruction | Corrected guidance |
| --- | --- |
| Every operator lands on Dashboard; ordinary admins can view every page | DPO opens Privacy; plain admin cannot enter privacy pages or Staff & Roles |
| DPO is an additional operations tier while E34 is unresolved | DPO is privacy-only; marketplace search, support, money and general operations remain excluded |
| DPO handover does not revoke old credentials | Its role/generation, refresh/CSRF revocation and audit are transactional in candidate code; local socket disconnect follows commit; fresh sign-in is required |
| Training staff have a read-only account until checklist completion | No such enforced account role exists; use supervised observation or isolated synthetic training without sharing credentials |
| Manual sections reproduce sidebar order and a fixed page count | Actual navigation is grouped by work and filtered by role; the manual is not complete coverage of every routed page |

The broad super-admin summary also no longer implies that Cancellation Policy
editing or other held operations can be enabled by account rank. Existing
money/privacy/legal holds remain; no rate, refund, account or role was changed.
The release warning distinguishes candidate instructions from the still-older
live app. Existing training duration/approval policy is not converted into an
implemented permission mechanism.

## Evidence and limits

Read in full: `apps/admin/src/App.tsx`, `config/admin-navigation.ts`, the auth
store and request guard, API canonical auth and CSRF middleware, API server
bootstrap, D34 and `LAUNCH-LIMITATIONS.md`. The complete DPO promotion, removal
and listing functions in `staff.service.ts` were inspected. Existing tests
were inspected and executed, not replaced with documentation-text assertions.

- Admin: UX-519/551/561/565, **4 files / 4 tests passed**, **6.83 seconds**,
  started local **14:15:07**. These render real routing/navigation/search
  components with synthetic auth state and HTTP; they are not a live browser
  or all-role/all-field acceptance matrix.
- API: UX-558/559/560/572/573, **5 suites / 5 tests passed**, **1.937 seconds**.
  These execute the relevant handlers/services with mocked database boundaries.
  In particular, UX-559 checks SQL calls and service output; it is **not** a
  real PostgreSQL concurrency/rollback proof or live socket exercise.

No runtime implementation, migration, role grant, live account operation,
financial write, legal policy, dependency, gate or security hold changed in
this documentation slice. The broader E39 privileged-account lifecycle and
E79 session architecture are still unfinished.

The complete `smoke.test.ts` and Security Posture document were also inspected.
SEC-008's all-endpoints VERIFIED claim relied on file/source-string counts;
the documented role rule even omitted the dedicated DPO privacy permission.
That claim is withdrawn and its command now executes the selected UX-560/572/573
boundaries above. These tests inject authentication or database state; they do
not prove all credentials or all route/ownership combinations. The existing
smoke tests were not repaired or deleted in this documentation change. Their
health/config source checks and self-constructed money arithmetic also must
not count as runtime acceptance; behavioral replacement or explicit TODO
classification remains an identified follow-up. No green CI total is a claim
that every older assertion meets the current audit bar.

## Manual reconciliation still required

The rest of the manual is not certified current. Specific follow-up areas
include its three-document server-approval statement versus the newer
four-document candidate, reactivation/admission evidence, decision notices
and fresh sign-in, current Business Accounts controls versus old billing
warnings, Marketing tabs and attribution boundaries, case-specific refund
controls, DPO-compatible case exits, and the missing standalone Privacy and
Security Operations guidance. Each needs its corresponding current code,
screen, tests and deployment evidence. Do not delete an operational hold
because one earlier implementation paragraph is stale.
