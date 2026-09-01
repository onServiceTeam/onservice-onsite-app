# Pricing publication continuation handoff

**Date:** 2026-09-02
**Branch:** `codex/system-settings-control-fix`
**Code checkpoint before this handoff:** `db98bbb`
**Production:** untouched

## Read first

- `.ai-coder/escalations/E28-admin-pricing-rule-preview-and-publication-2026-08-25.md`
- `.ai-coder/escalations/E54-pricing-rule-global-scope-and-immediate-activation-2026-09-01.md`
- `.ai-coder/escalations/E32-production-ssh-authorization-2026-08-30.md`
- `.ai-coder/handoff/E50-financial-terms-checkpoint-2026-09-01.md`
- `docs/runbooks/pricing-rule-publication.md`

## Decision and authority

Ken approved E28/E54 Option A in chat: draft, server-authoritative preview,
explicit publish, and retirement. Existing repository policy makes pricing
mutation a super-admin action. Ordinary admins are read-only. A two-person
approval workflow was not invented because the repository has no enforceable
dual-control architecture.

## What changed

### Database

Migration `165_pricing_rule_publication_workflow.sql`:

- labels existing rows `legacy_active` or `legacy_inactive` without changing
  `is_active`;
- makes new rows inactive drafts by default;
- adds publication/retirement actor, time, and reason evidence;
- adds short-lived preview receipts bound to draft timestamp, operator, and a
  fingerprint of the active rule set;
- protects category/area scope history from cascading deletion;
- enforces active/lifecycle consistency, allowed state transitions, and
  immutable financial terms after publication.

Migration 165 has not run locally or in production. Docker Desktop was started
but the engine did not become ready. E32 also blocks the mandatory production
inventory.

### API and resolver

- `pricing-publication.service.ts` owns draft creation/edit, canonical preview,
  preview-bound publication, and retirement.
- Preview loads the active fixed-price subcategory and service area from the
  database. The client cannot submit a base price.
- Preview and booking creation use the same exported rule evaluator from
  `pricing.service.ts`.
- Preview reports every matching rule, deterministic winner, customer total,
  surge, platform share, and provider share.
- Publish uses a global advisory transaction lock and rejects another
  operator's receipt, expiry, changed draft, or changed active-rule fingerprint.
- Update rejects stale `expectedUpdatedAt` rather than overwriting another tab.
- Direct legacy create/update/toggle/delete service entry points reject with
  409 and do not open a transaction.
- API create/edit/preview/publish/retire routes are super-admin-only and use
  strict body/query/UUID validation. Reads remain Admin-visible.

### Admin operator screen

- Explicit category and service-area scope with a visible global warning.
- Inactive draft creation/edit and a separate publication reason.
- Responsive cards below desktop and a bounded desktop table.
- Read-only ordinary-admin posture.
- Visible lifecycle, decision reason/time, multiplier, priority, and exact surge
  allocation.
- Up to 12 representative preview samples using live catalog/area data.
- Winner/overlap and centavo-derived customer/provider/platform totals.
- Retirement replaces enable/disable and hard delete.
- A valid platform share of `0` remains exactly `0`.

### Tests and IDs

- SEC-024: all mutation routes require super-admin.
- SEC-025: stale active-rule fingerprint cannot publish.
- SEC-026: direct legacy mutation entry points are disabled.
- SEC-027: stale draft edit cannot overwrite a newer draft.
- OPS-322: draft is inactive, scoped, audited, and preserves 0 share.
- OPS-323: published terms are immutable.
- OPS-324: canonical preview uses the booking resolver and reports overlap/split.
- OPS-325: publish and Admin action are atomic and preview-bound.
- OPS-326: retirement preserves rule and booking history.
- UX-915: scope/lifecycle visibility and unsafe-control removal.
- UX-916: rendered server preview and explicit publication flow.
- UX-914 (preceding W22 commit): failed recurring cancellation preserves input.

The former MED-N109 file-existence/source-regex checks were replaced with a
runtime `getClientConfig()` version assertion. Obsolete MED-N110/N111 tests of
immediate pricing mutations were replaced by the lifecycle tests above.

## Verification actually run

Passed:

- all workspace TypeScript checks;
- repository ESLint;
- API production build;
- Admin production build (2,842 modules);
- focused pricing/API: 13 suites, 39 assertions at the latest focused run;
- focused Admin pricing: 3 files, 5 assertions;
- full Admin: 278 files passed, 1 skipped; 367 assertions passed, 3 todos;
- full mobile: 523 suites and 902 assertions passed, 84 existing device todos;
- full API: 732 suites and 3,109 assertions passed, 1 skipped.

Not passed or not run:

- two full-API Nginx container tests failed because Docker engine was
  unavailable: UX-860 and UX-201;
- migration 165 was not executed against Postgres for the same reason;
- no authenticated browser capture of the rebuilt Pricing Rules screen;
- no production rule inventory;
- no master merge, GitHub push, server migration, or live deployment.

Do not convert any of those to a pass without new evidence.

## Exact next steps

1. Make Docker engine healthy.
2. Start an isolated Postgres/Redis stack and run every migration through 165 on
   a fresh database.
3. Exercise the migration lifecycle constraints and trigger, then run the full
   API suite including UX-860/UX-201.
4. Run the Admin app against that migrated database with a local super-admin
   fixture. Capture populated draft, preview, published, retired, legacy, empty,
   loading, error, and read-only Admin states at tablet and desktop widths.
5. Review those images against the latest Stitch contract and fix any concrete
   drift before pushing.
6. Push the topic branch only after the above local evidence is green.
7. Do not merge or deploy until E32 is cleared and the private production
   inventory in the runbook is reviewed.
8. After a reviewed migration, prove an old booking's totals/snapshot did not
   change and a new controlled booking uses the expected rule snapshot.

## Known follow-up audit questions

- Whether future policy needs real two-person approval for global/high-impact
  publication. This requires a separate identity/approval model, not a UI flag.
- Whether the operator should clone a published rule into a new draft as a
  convenience. Published terms themselves must remain immutable.
- How many representative samples policy should require for a global rule.
  The API supports 1–12 and requires the draft to win at least one; operations
  policy should be based on observed market/category count.
- Existing active rows cannot be adjudicated until the E32 production inventory
  is available.
