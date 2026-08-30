# Admin Command and Access Truth Audit

**Date:** 2026-08-25  
**Scope:** first suspicion-first overhaul wave for Dashboard, Analytics, Staff & Roles, DPO assignment, and the internal large-payout review terminology  
**Status:** implementation verified; E27 resolved with a separate TOTP-protected audit super-admin

## Outcome

This wave closes misleading operational claims and unsafe governance inputs without pretending that every admin page is complete.

- Dashboard source failures now become visible alerts instead of false all-clear output.
- Dashboard revenue, dispute-age, refresh cadence, and freshness labels now state what the sources actually measure.
- Retention analytics is labelled as a deterministic attention rule, not a prediction model. Ordinary admins receive masked contact data, booking face value is not called settled spend, and every row links to Customer 360.
- Commission analytics is read-only decision support. It fails closed to the current live rate when provider, quality, or completed-booking samples are too small.
- Incomplete cohort data no longer crashes the full analytics workspace.
- Staff assignment uses named active admin-tier candidates, never pasted user IDs.
- Staff-directory and role-profile changes require written reasons and write actor plus before/after context transactionally.
- Role-profile permission labels are identified as metadata. They do not claim to enforce page or API access.
- The D15 DPO management screen that the runbook promised but the app lacked is now present. It uses named active-admin candidates, requires reasoned assignment/handover, and serializes a single active DPO seat.
- Active operations documents now call the payout state an internal large-payout review hold. Legacy database fields, API paths, and status identifiers containing `aml` remain unchanged for compatibility. The hold remains in place and is not represented as a legal AMLA classification or filing.

## W9 command-center continuation

The later W9 pass re-opened Dashboard rather than inheriting completion from
the first card-level correction:

- action queues now use canonical whole-queue counts and exact destinations for
  paid assignment gaps, unassigned/urgent/all active support, provider
  approvals, active/escalated/stale disputes, and tester feedback;
- Today, 7d, 30d, 90d, and Manila-calendar YTD are validated and URL-bound;
- failed sources, loading, retry, genuine empty state, and populated state are
  distinct, so source failure cannot become zero or an all-clear;
- platform-fee revenue/acquisition are period metrics, while active bookings
  and platform wallet balances are labelled current snapshots;
- city demand follows normalized booking city/province, including unassigned
  work, while provider capacity follows approved live service-area membership;
- Disputes gained exact active/stale views and a rendered list-resolution
  funds-impact confirmation without changing E18/E24 settlement behavior.

The same pass found that the DPO workspace is not an end-to-end access model.
E34 supersedes any interpretation that the single-seat management screen made
DPO routing complete: privacy-only doctrine conflicts with navigation, client
guards, Dashboard API access, DSR permissions, consent permissions, and the
mixed Compliance page. No role middleware was broadened in W9.

## Production read-only evidence

The production check read aggregate counts only:

- one active `admin` account;
- one inactive `super_admin` account;
- zero active `admin_staff` profiles;
- five non-deleted role-profile definitions were observed in the earlier aggregate review.

No account identity or personal field was read during that initial check and no
row was changed until Ken explicitly authorized durable role-audit accounts.
E27 now records the backed-up, reasoned creation and two-factor verification of
a separate audit super-admin. The inactive published-credential account remains
inactive.

The follow-up found three additional account-control defects and fixed them:

- migration 131 replaced `users_role_check` and accidentally removed `dpo`;
  migration 156 restores the composed DPO plus provider-staff role set;
- the non-production developer OTP accepted one code for every phone; it now
  requires an explicit phone allowlist, skips SMS only for those synthetic
  accounts, and fails startup on missing/malformed configuration;
- `bootstrap-admin.ts` advertised non-login staff-profile names and omitted
  required first/last names for new rows; it now accepts only real admin-tier
  roles and creates complete named identities.

## Access model found in code

The authoritative access model today is `users.role` plus route-level RBAC. `admin_roles.permissions` and `admin_staff.role_id` are organizational metadata. They are useful for queue/profile labeling but do not grant or revoke access. The Admin UI and manuals now state this directly.

Fine-grained permission enforcement remains an architecture decision because implementing it would change access across every admin route and could strand operators. This wave does not infer that policy.

## Regression evidence added

Behavior tests cover:

- Dashboard source failure and metric-definition truth;
- ordinary-admin retention PII masking and Customer 360 linkage;
- commission sample-size fail-safe behavior and read-only UI language;
- incomplete cohort-source resilience;
- named staff and DPO candidate scoping;
- staff and role-profile transactional audit records;
- reasoned role-profile UI flows;
- prevention of a second active DPO;
- the new DPO management workspace.

## Verification for the staged branch

- All Admin tests: 92 files passed, one existing file skipped; 205 tests passed and three existing explicit todos remained.
- All locally runnable API tests: 441 suites and 3,084 tests passed.
- The only local API exclusion was the existing UX-201 generated-certificate Nginx test because Docker Desktop was not running. This branch does not change Nginx; independent GitHub Docker validation remains required.
- Admin, Mobile, and API TypeScript checks passed.
- Repository ESLint passed after generated `dist-web-release-*` output was added to the existing build-output ignore policy. Source lint rules were not weakened.
- Admin and API production builds passed.
- Gate A passed all 10 blocking fragments; all six gate self-tests passed; Gate C passed all six blocking articles.
- Gates D and E exited successfully in their documented REPORT modes and are not counted as visual-baseline or mutation evidence.
- Gate B is skipped by CI for this non-dispatch branch name. Independent GitHub CI and all required checks remain mandatory before merge.

## Remaining admin priorities

1. Add safe global entity search using an explicit searchable-field and ordinary-admin PII matrix.
2. Resolve E34 as one DPO route/API/action design rather than piecemeal middleware exceptions; keep NPC registration and external appointment records in the launch runbook.
3. Define fine-grained admin authorization before treating role-profile permission labels as executable policy.
4. Continue page-by-page command, money, destructive-action, metric-source, freshness, and case-linkage review.
