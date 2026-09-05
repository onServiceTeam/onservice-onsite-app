# Provider approval evidence review, UX-1311

## Scope and sources

Provider queue approval dialog and Provider 360 approval panel. Design
Contract V2 supersedes V1; use the existing semantic theme tokens, shared
buttons, skeleton and checklist. E36 preserves four required documents.
Stitch direction does not authorize an identity-policy exception.

## Would a customer trust this operation with their home and payment?

This change improves three concrete controls: operators see exactly which
required evidence is absent; unavailable data cannot enable approval; and
the UI labels evidence as on file rather than pretending it has been verified.
The rationale/checklist still accompany the server's audited decision.
This is not a claim of overall customer trust or launch readiness. The
application revision, renewal and legacy evidence work remains unfinished.

## Is the UI shippable or still a prototype?

Not yet visually accepted. The bounded review has loading/error/retry states,
plain document labels, an application link and a scrollable short-viewport
container. Real rendered interactions pass for both surfaces. However, this
slice has no new authenticated browser screenshots at the contract's six
widths, no focus-trap acceptance for the existing queue modal, and no full
Stitch parity claim. Those remain acceptance work, not implicit passes.

## Audit limits

- The presence response is current when fetched, not a signed immutable
  application revision. A backend decision still rechecks under a row lock.
- Document contents, authenticity and expiry are human review here.
- A recheck resets all attestations; operators cannot submit a previous
  completed checklist against a fresh response.
- No stored provider, customer, money or policy data was altered by UI tests.
- Initial local TypeScript errors in three test accesses were corrected;
  the focused rendered tests, TypeScript and changed-file lint passed on rerun.
- Full CI, browser acceptance and production activation remain separate gates.
