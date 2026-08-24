# E19 — Customer acceptance signature is attributed to the provider

**Date:** 2026-08-24

**Status:** OPEN — legal/trust architecture decision required
**Hard-stop reason:** A signature presented as customer acceptance is captured
inside the provider's authenticated session and persisted with the provider as
the signer.

## Bad news first

The provider completion screen asks the customer to draw a signature on the
provider's device, then uploads it while authenticated as the provider. The API
stores `signed_by` as that provider user and `signed_role='provider'` even though
`signature_type='customer_acceptance'`. The record therefore does not establish
that the booking customer signed or approved anything. A provider can also draw
the mark themselves.

No signature, booking, user, or production data was changed during discovery.

## Evidence

- `apps/mobile/app/provider/job/[id]/complete.tsx` owns the signature canvas and
  calls `uploadSignature(... signatureType: 'customer_acceptance')` from the
  provider workflow.
- `apps/mobile/src/services/booking-photo.service.ts` sends no signer identity;
  it sends only the bitmap, booking id, signature type, and optional typed name.
- `packages/api/src/routes/upload.routes.ts` always supplies
  `signedByUserId: req.user.userId` and derives `signedRole` from the
  authenticated session.
- `packages/api/src/services/booking-photo.service.ts` verifies that the
  authenticated actor has the booking relationship, then inserts those values
  into `booking_signatures.signed_by` and `signed_role`.
- Migration `079_d07_booking_photos_signatures.sql` describes
  `customer_acceptance` as the customer accepting completed work, but the schema
  has no separate `captured_by`, witness, or customer-identity field.
- E01's resolved decision describes this bitmap as legal proof of customer
  acceptance. The current attribution does not support that claim.

## Impact

1. Admin/support can misread a provider-attributed row as customer approval.
2. The artifact is weak or misleading evidence in a dispute.
3. A provider can create the acceptance artifact without a customer-controlled
   account action.
4. The product can release funds based on a separate confirmation flow while
   documentation overstates what this signature proves.

## Options

### Option A — Customer-controlled acceptance (recommended)

Move completed-work acceptance into the customer's authenticated confirmation
flow. If a drawn signature is legally required, capture and upload it from the
customer session/device so `signed_by` and `signed_role` are truthful. Keep the
provider completion step limited to checklist, photos, and completion notes.

### Option B — Model witnessed in-person capture explicitly

Keep the canvas on the provider device but add separate signer and capturer
identity: booking customer as the asserted signer, authenticated provider/staff
as `captured_by`, plus typed customer name, affirmative consent text/version,
timestamp, device context, and an admin-visible warning that identity was not
authenticated by a customer session. Legal review must decide whether that is
acceptable evidence.

### Option C — Stop calling the bitmap legal acceptance

Treat the customer's authenticated Confirm action as the acceptance record and
remove the provider-device signature requirement and legal-proof claims. This is
the simplest product flow but requires legal approval for the final wording and
retention record.

## Recommendation

Use Option A. It preserves strong attribution and matches the existing
customer-side confirmation step. Add a server guard that rejects
`customer_acceptance` unless the authenticated booking customer is the signer,
then test provider/staff rejection, customer ownership, duplicate behavior, and
the full provider-complete to customer-confirm sequence.

## What I need from Ken

Choose Option A, B, or C with legal input. Until then, do not describe the
provider-captured bitmap as verified customer acceptance and do not make a
silent schema or release-policy change. Independent layout and non-legal job
execution fixes can continue.
