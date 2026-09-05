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

## Rationale and dialog continuation, UX-1312 / UX-1313

The server's rationale limit is now visible and enforced in the shared
approval field, including its required marker, linked help/count, unique ID
and validation error. Operators cannot complete a review that the API will
reject solely for exceeding its 2,000-character rationale limit.

The queue now uses the existing focus-managed dialog instead of a styled
overlay. It preserves the selected provider during submission/failure, asks
before discarding an unsaved review, and restores focus to the trigger or the
directory search after the selected row disappears. Its pending explanation
does not pretend that closing the UI cancels a server decision. Submitted
fields are frozen until the request settles.

Trust signals: the evidence gate stays intact; the rationale and checklist
still travel with the audited decision; and failure does not lose the target
or review text. Those are specific improvements, not overall product trust
or production-readiness claims.

Shippability: still not visually accepted. Real component/keyboard event tests
now cover the previous focus-trap gap, but no new authenticated screenshots,
six-width geometry checks, physical keyboard browser acceptance or complete
Stitch comparison were executed for this continuation. Those are not marked
passed by the DOM focus tests or by a successful production build.

Final local evidence: 67 provider-admin files / 73 rendered tests passed;
Admin TypeScript, production build and changed-file lint passed. Full fresh
CI for UX-1312/1313 remains a separate publication check.
