# E62: NBI expiry notification, suspension, and renewal disagree

**Date:** 2026-09-02

**Status:** OPEN: provider-compliance enforcement decision and remediation required
**Hard-stop reason:** The worker can auto-suspend some providers contrary to
the documented manual policy, skip other providers when their expiry arrives,
and offers no complete renewal workflow.

## Bad news first

The NBI worker uses one boolean, `nbi_expiry_notified`, for two distinct events:
the advance warning and the actual expiry. Once an approved provider receives
the early warning, the worker sets the boolean to true. The query requires it
to remain false, so that provider is not selected again when the NBI expires.
They receive no expiry notice and the worker does not suspend them.

A provider first selected after the expiry date follows a different path: the
same worker sends an expiry notice and changes `status` from `approved` to
`suspended`. That contradicts the recorded launch decision and support guides,
which require a manual chase followed by a reasoned manual suspension.

There is also no approved-provider NBI renewal route. The provider app captures
NBI data only during initial onboarding, while Provider 360 displays the date
read-only. Existing support copy incorrectly promises re-upload and update.

No provider status, availability, document, setting value, migration, or
production data was changed during this audit.

## Evidence

- `packages/api/src/jobs/workers.ts:checkNbiExpiry()` selects only
  `nbi_expiry_notified=FALSE`, sets it true after either notice, and
  auto-suspends only a selected row whose calculated days remaining are zero.
- There is no code that resets `nbi_expiry_notified` when a new expiry date is
  recorded.
- `packages/api/src/services/provider.service.ts` writes NBI URL/date only in
  the initial provider application flow.
- `apps/admin/src/pages/ProviderDetailPage.tsx` displays the expiry but exposes
  no verified renewal action.
- `docs/operations/00-DECISIONS-FOR-KEN.md` records manual chase then manual
  suspend as the intended launch policy.
- The provider vetting and support guides claimed both that expiry is notified
  again and that no automatic suspension occurs; neither statement is true for
  every provider.

## Immediate containment

Admin Settings now classifies `nbi_expiry_warning_days` as **Launch hold** and
removes edit/reset controls. Changing the window could change which providers
are marked notified and then skipped at expiry. Operations docs now state the
implementation gap and require a manual review queue instead of relying on the
worker or promising an unavailable upload.

The stored/default 30-day value, provider status rows, worker behavior, and
production data remain unchanged pending the compliance decision.

## Options

### Option A: Enforce the recorded manual policy (recommended for launch)

Separate warning from expiry evidence, send each notification once per NBI
document/date, remove automatic status mutation from the worker, and create an
Admin compliance queue with a reasoned manual suspend action. Build a secure
provider renewal submission and Admin verification flow that resets lifecycle
state only after approval.

### Option B: Approve deterministic automatic suspension

Define the exact effective date/time, active-job handling, appeals, notification
sequence, renewal verification, reactivation authority, and audit evidence.
Then implement separate lifecycle states and an idempotent suspension worker.

### Option C: Keep the current mixed behavior

This is not recommended. Two providers with the same expiry can receive
different enforcement solely because one received an earlier warning.

## Required decision

Approve Option A or B before changing worker status behavior or making the
warning control editable. Independent non-compliance audit work can continue
while E62 remains open.
