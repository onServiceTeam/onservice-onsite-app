# E34: DPO admin-route segregation is incomplete

**Date:** 2026-08-30
**Severity:** High compliance and least-privilege risk
**Status:** RESOLVED IN CODE — production migration/deployment evidence pending E32
**Found during:** Admin Dashboard W9 suspicion-first audit

## Bad news first

D15 and `docs/runbooks/dpo-role.md` establish `dpo` as an independent role.
The runbook says that a DPO gains DPO-scoped consent, breach, data-subject
request, and reporting access but does not automatically gain booking,
financial, catalog, or other general-admin access.

The current admin client and API do not implement that boundary coherently:

1. `ADMIN_NAV_GROUPS` shows a DPO nearly every operational, people, support,
   money, growth, and governance destination because most items have no role
   restriction.
2. The route tree has no DPO-specific guard. A DPO can mount general-admin
   pages by navigation or direct URL.
3. The admin login flow lands every admin-tier role at `/`, but Dashboard APIs
   accept only `admin` and `super_admin`. A valid DPO therefore lands on a
   broken command center.
4. Consent search correctly uses `requireDpoRole`, but DSR list/alerts and the
   dedicated complete/request-info/reject/escalate routes use `requireAdmin`
   or `requireSuperAdmin`, both of which exclude `dpo`.
5. The Compliance page mixes DPO privacy work with general-admin/BIR sources,
   so changing one middleware in isolation would still leave a partially
   failing and over-broad workspace.

## Why this is a hard stop

- The UI advertises access that the API refuses and exposes operational
  destinations the independent DPO role is not supposed to inherit.
- The DPO cannot reliably work the DSR queue that the operating model assigns
  to that role.
- Broadening general-admin middleware to include `dpo` would defeat D15's
  segregation decision and expose unrelated customer, provider, and money
  data.
- Narrowing or widening privacy routes changes compliance authorization and
  requires a complete route/action matrix, not page-local guesswork.
- E32 currently blocks a production read-only check of the active DPO account
  and actual route behavior.

## Safe work that may continue

Dashboard work for the existing `admin` and `super_admin` roles may continue.
No W9 change may broaden DPO access, represent the DPO command center as
working, or treat hiding a navigation item as server authorization.

## Recommended correction

Keep D15 as the authority and implement the correction as a dedicated
authorization wave:

1. Produce an explicit route-and-action matrix for `dpo`, `admin`, and
   `super_admin`, including DSR reads, DSR decisions, consent, breach log,
   privacy exports, audit evidence, and mixed Compliance-page tax sources.
2. Give `dpo` a privacy-specific landing page and navigation containing only
   approved DPO work plus account/password/logout controls.
3. Add a client route guard for usability, while retaining server middleware
   as the real security boundary.
4. Split mixed DPO and tax requests where necessary so the DPO workspace does
   not fail because an unrelated BIR source correctly denies access.
5. Apply `requireDpoRole` only to the DPO-approved privacy actions. Keep
   general-admin, money, booking, and tax routes excluded.
6. Add executed role-matrix tests for every approved and rejected route plus
   rendered login/landing/navigation/direct-URL tests.
7. After E32 is cleared, inspect the live role/account state read-only, then
   release under the compliance-sensitive branch/PR discipline with exact
   pre/post evidence.

## What is not authorized by this record

- Do not add `dpo` to `requireAdmin` or general `rbacMiddleware` calls.
- Do not grant the DPO booking, customer, provider, financial, payout,
  settings, catalog, marketing, dispatch, or general audit access by default.
- Do not claim DPO operations are complete because consent search alone works.
- Do not change production roles or accounts without a verified server
  session, backup, and explicit impact check.

## Code resolution recorded 2026-08-31

D34 selected the dedicated internal DPO identity and privacy-only route model.
The implementation now provides `/privacy`, `/data-protection-log`, and
`/consent-versions` as the DPO client surface, rejects general-admin direct
URLs, and enforces the corresponding API matrix independently. Login,
navigation, command search, and breadcrumbs use the same role boundary. The
old mixed privacy/NPC tab is no longer mounted in Compliance.

Behavioral evidence includes `bug-ux-560-dpo-api-route-matrix.test.ts`,
`bug-ux-561-admin-role-route-guard.real.test.tsx`,
`bug-ux-564-privacy-home.real.test.tsx`,
`bug-ux-565-dpo-navigation.real.test.tsx`, and
`bug-ux-567-dpo-dsr-actions.real.test.tsx`. The full admin and API suites,
repository gates, builds, and desktop visual baselines were run locally. E40
remains open for counsel-approved breach classification and deadline wording.

No production role, session, schema, or file was changed. E32 still blocks the
live migration, deployment, and read-only post-deploy matrix check.
