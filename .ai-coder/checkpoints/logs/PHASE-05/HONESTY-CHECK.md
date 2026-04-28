# Phase 05 — HONESTY CHECK

Things this phase **does NOT** ship, gaps from the original spec, and
shortcuts the AI coder took. Read this before declaring Phase 05 "done".

## Documents not stored in the schema (returned as `null`)

The Phase 05 spec calls for displaying:
- Government ID image
- Selfie image
- Bank/GCash/Maya account details with verification status

**Reality:** the current DB schema (migrations 001–051) has **no columns**
for these on either `providers` or `users`. The service intentionally
returns:
```ts
documents: { governmentIdUrl: null, selfieUrl: null, ... }
```
The Profile tab shows "missing" badges and "not stored — see HONESTY-CHECK"
notes for these fields.

**Why we did not add columns now:** they require KYC infrastructure
(secure storage, OCR, masking) that belongs in a dedicated phase, not in a
read-mostly admin-360 phase.

## Login history reuses login_attempts with a phone JOIN

There is no `provider_login_history` table. `getProviderActivity` joins
`login_attempts` to `users.phone`. This works today because OTP login
inserts the phone string, but it is **fragile** if phone normalisation
ever changes. See pre-mortem #4 and future-bug #1.

## No `webhook_events` table

The original spec hints at exposing webhook delivery history. We do not
expose this — there is no `webhook_events` table in the current schema.
Webhook failures are surfaced indirectly via `audit_log` rows whose
`action` column contains "webhook" (already used by the Phase 04
operational alerts).

## Spec endpoints we deferred

| Spec endpoint | Status | Why |
| --- | --- | --- |
| `GET …/financials/2307` | **deferred** | BIR Form 2307 PDF generation belongs to Phase 08 (Financial + BIR). |
| `POST …/payout/manual` | **deferred** | Touches sacred payout service; will be done as part of a focused payouts pass. |
| `POST …/message` | **deferred** | Notification routing requires its own audit trail design. |
| `POST …/request-documents` | **deferred** | Requires the missing KYC document infra above. |

What **is shipped** in Phase 05: the Profile/Jobs/Financials/Reviews/Disputes
/Activity/Notes read endpoints + Notes CRUD + Wallet manual adjust + Profile
edit. That covers the 7 tabs the spec demands as the primary deliverable.

## Frontend gold-plating skipped

- ProvidersPage CSV export and map view toggle: **not added** (out-of-scope
  for the core "make rows clickable" requirement).
- Tier progression progress bars: **not added** (the data is shown as raw
  numbers; visual progression bars are decorative).
- @mention notifications inside notes: **not implemented**.

## Migration 053 widens a CHECK constraint

To allow `wallet_transactions.type='adjustment'`, migration 053 drops and
re-adds the check constraint with one additional value. This is **additive
only** — every previously-legal type is preserved. Mutation 053 should be
the only migration to touch this constraint until a holistic refactor.

## Mutation testing scope

`adjustProviderWallet` writes to `wallet_transactions`. Per TD-005, sacred-
file writes warrant mutation tests. The Stryker config in
`.ai-coder/stryker/` historically targets the sacred services; this phase
extends coverage indirectly via 11 boundary tests on `adjustProviderWallet`
itself, including the money-conservation invariant. A dedicated
Stryker run on `provider-admin.service.ts` is **deferred to the verify-
master mutation gate** (already wired) rather than re-run by hand here.

## Tests written

`packages/api/__tests__/provider-admin.test.ts` — 45 unit tests, all PASS,
contributing to the 558/558 jest total. No tests were deferred.
