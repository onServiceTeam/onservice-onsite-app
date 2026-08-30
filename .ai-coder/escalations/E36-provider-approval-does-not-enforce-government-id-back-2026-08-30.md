# E36: Provider approval does not enforce the government ID back image

**Date:** 2026-08-30
**Severity:** High identity-review and operating-control risk
**Status:** Open hard stop for approval-gate changes
**Found during:** W11 documentation accuracy review

## Bad news first

The provider application and operating policy require four KYC evidence files:

1. government ID front;
2. government ID back;
3. NBI clearance; and
4. selfie.

The mobile documents screen blocks continuation until both ID sides and the NBI
file are selected, and the selfie is collected on the next screen. Provider 360
also displays all four records. However, `approveProvider` checks only
`nbi_clearance_url`, `government_id_front_url`, and `selfie_url`. A pending row
with no `government_id_back_url` can pass the server approval gate if an admin
checks the generic "Government ID reviewed and legible" item.

## Why this is a hard stop

- Tightening the live approval predicate could strand legitimate pending or
  historical applications created before the back-image field was populated.
- E32 currently blocks a read-only production count of pending/approved records
  with a missing back image and a review of their creation dates.
- Treating the back image as optional would contradict the current applicant
  flow, vetting manual, and front-and-back identity policy.
- This is an identity-control decision, not a cosmetic UI correction.

## Required correction after E32

1. Back up production and count pending and approved providers by presence of
   each of the four KYC fields without printing object keys or personal data.
2. Determine whether missing back images are legacy records, incomplete
   applications, or active data loss.
3. Keep all four files as the intended application contract unless the approved
   KYC policy explicitly changes.
4. Make `government_id_back_url` part of the transactional approval prerequisite
   for new/current applications, with a clearly handled legacy exception only
   if production evidence requires one.
5. Make the Admin checklist name both ID sides and show an explicit incomplete
   state before the operator can confirm it.
6. Add executed tests for missing front, missing back, missing NBI, missing
   selfie, complete evidence, concurrent approval, and legacy handling.

## Safe containment now

The active operating manuals now tell reviewers to confirm all four evidence
files and explicitly warn that the server currently enforces only three. No
approval predicate or provider status was changed in W11.
