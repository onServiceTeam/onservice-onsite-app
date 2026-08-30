# E35: Provider onboarding has two conflicting state models and no safe resubmission path

**Date:** 2026-08-30
**Severity:** High identity, privacy, and provider-supply risk
**Status:** Open hard stop for durable draft and rejection-lifecycle changes
**Found during:** Provider onboarding and Admin Provider 360 linkage W11

## Bad news first

The application has two incompatible provider-onboarding models, but only one
participates in the current customer-to-provider conversion:

1. The active mobile flow keeps its draft only in the in-memory Zustand
   onboarding store, then submits once to `POST /api/v1/providers/apply`.
2. That endpoint creates the canonical `providers` row in `pending` state,
   links categories and a primary `provider_service_areas` market, and feeds
   the active Admin Providers queue and Provider 360 decision workflow.
3. Migration 084 and `provider-onboarding.service.ts` separately define a
   `provider_onboarding_progress` snapshot, review queue, `sent_back` state,
   and 72-hour estimate. No applicant-facing HTTP route calls `trackProgress`
   or `submitForReview`, and neither mobile nor Admin UI uses this queue.
4. The mounted super-admin-only latent routes can list and decide progress
   rows, but an `approved` progress decision changes only that table. It does
   not create or approve the canonical provider, grant the user provider role,
   or run the active Provider 360 approval checklist.
5. The progress enum and required-step list omit the current `vetting` step.
   Its generic `data_snapshot` has no field-level privacy contract and could
   duplicate identity-document references, government ID details, home
   address, and reference contacts outside the reviewed provider record.
6. A browser refresh or app restart can erase the active in-memory draft. W11
   now redirects a stale later-step URL to the earliest incomplete step, but
   this is fail-safe navigation, not durable resumability.
7. A rejected applicant also cannot follow the operating manuals' claimed
   reapplication path. `createProviderApplication` rejects every account that
   already has a provider row, while `sent_back` editing exists only in the
   disconnected progress model.

## Why this is a hard stop

- Reviving the generic snapshot without a field-level design can create a
  second store of high-risk KYC and third-party reference data.
- Switching Admin to the progress decision would bypass the current provider
  status, role grant, checklist, audit, notification, category, and market
  contracts.
- Deleting or migrating the progress table without a production row count and
  backup could destroy retained application evidence.
- Adding resubmission changes identity-review lifecycle and determines which
  rejected evidence remains visible, replaceable, and auditable.
- E32 currently prevents the required read-only production count and state
  inspection.

## Safe W11 containment already shipped

- Provider application routes are customer-only.
- Later onboarding URLs fail back to the earliest incomplete in-memory step.
- Service-area selection comes from Admin Service Areas and requires an exact
  operating pin inside the selected market.
- Submission canonicalizes city/province and creates the primary provider-area
  link in the same transaction as the provider and categories.
- A null application-status response is shown as no application, never as a
  fabricated pending review.

None of those changes claims that drafts survive a restart or that rejected
applications can currently be resubmitted.

## Recommended correction

Keep `providers` plus its linked categories, market, documents, and active
Provider 360 approval transaction as the canonical submitted application.
Then implement one dedicated lifecycle wave:

1. After E32 is cleared, back up production and read only the count/state/age
   of `provider_onboarding_progress` rows and any audit references.
2. Define a typed, expiring draft contract. Store only fields needed to resume
   and owned private object keys, never document bytes or unconstrained nested
   snapshots. Apply explicit access, retention, replacement, and deletion
   rules to applicant addresses, ID metadata, and reference contacts.
3. Convert a completed draft transactionally into the existing canonical
   provider application and remove or seal the draft after conversion.
4. Add a reasoned `changes_requested`/resubmission path on the same canonical
   provider identity. Permit only allowed fields/evidence to be replaced,
   preserve prior review evidence, reset the record to pending atomically, and
   notify both applicant and assigned reviewer.
5. Retire or migrate the old progress service/table and latent routes only
   after production evidence proves how existing rows must be preserved.
6. Add executed close/reopen, browser refresh, app restart, duplicate submit,
   reject, request-changes, resubmit, concurrent decision, role-grant, audit,
   notification, and privacy-boundary tests.

## What is not authorized by this record

- Do not route KYC, addresses, ID numbers, or reference contacts into the
  generic `data_snapshot` merely to make the UI resumable.
- Do not approve providers through `/admin/provider-applications` as if that
  were equivalent to Provider 360 approval.
- Do not delete migration 084 data or production rows without a verified
  server session, backup, and exact impact plan.
- Do not tell rejected applicants they can reapply until the same-record
  resubmission contract is implemented and tested.
