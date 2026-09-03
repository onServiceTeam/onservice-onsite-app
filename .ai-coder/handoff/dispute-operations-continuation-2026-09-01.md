# Dispute operations continuation — 2026-09-01

## Scope completed in this checkpoint

This checkpoint traced the dispute workflow across:

- admin dispute queue and Dispute 360
- public/admin dispute routes
- dispute and escrow-facing services
- customer/provider dispute case screen
- participant notification navigation and delivery
- booking/support linkage
- operator manuals and policy templates

The review treated the dispute decision, money settlement, participant
communication, support ownership, and provider enforcement as separate states.
That distinction exposed several controls that looked complete in the UI but did
not perform their stated business outcome.

## Fixed defects

### OPS-309 — Dispute "message" did not reach either participant

`sendDisputeMessage` previously wrote only an `admin_actions` row. It now writes
the selected customer/provider notification rows and the audit record in one
transaction, then wakes the devices using the stored notification IDs without
creating duplicate inbox rows. The operator UI now calls this a one-way case
update and directs answerable/private conversations to the linked Support case.

### OPS-310 and OPS-311 — Assignment and escalation created duplicate audits

The canonical dispute service already wrote `dispute_assigned` and
`dispute_escalated` in the same transaction as the state mutation. The admin
wrapper then wrote a second out-of-transaction row. The canonical service now
returns its audit ID and the wrapper reuses it. Each action has one state change
and one audit record.

### OPS-312 and OPS-313 — Split decisions accepted bad input and previewed the wrong amount

The admin service now rejects missing, non-finite, negative, or over-100 split
percentages before settlement. Dispute 360 calculates its approved-refund
preview from the percentage the operator actually entered instead of always
showing 50%.

### OPS-314 and OPS-315 — Decision wording claimed a refund was already issued

Dispute decisions commit before post-commit refund/release processing can
finish. Participant notifications now say the refund was approved and direct
the user to the case and booking payment history for processing status. The
customer/provider dispute screen labels the amount "Approved refund" and makes
the decision-versus-completion boundary explicit. Dispute 360 and the queue use
the same approved-refund language.

### OPS-316 — Incomplete remedies were exposed as completed outcomes

`free_redo` did not create a replacement work order. `refund_with_warning` did
not write a provider warning. Both now fail closed with HTTP 409 in the shared
resolution service and are absent from Dispute 360. The remaining enabled
choices correspond to implemented state/money behavior.

### OPS-317 and OPS-319 — Reopen made a settled dispute resolvable again

The old reopen path cleared the terminal markers while preserving the prior
booking/wallet settlement. It could then feed the same dispute back through the
resolution service, rewrite case/booking state, and queue an impossible second
movement. The API now fails closed before a transaction. Dispute 360 replaces
Reopen with a linked customer/booking Support-case action for new evidence and
supplemental review.

The permanent settlement/appeal decision is recorded in:

- `.ai-coder/escalations/E51-dispute-resolution-reopen-and-remedy-semantics-2026-09-01.md`

Recommended permanent model: immutable original settlement plus a linked appeal
and separately approved, idempotent compensating action when a later financial
correction is genuinely required.

### OPS-318 — Unsafe remedies still appeared in the operator form

The two held choices are removed from the rendered resolution controls. A clear
E51 containment notice explains why and points staff to Support and Provider
360.

### OPS-320 — The dispute queue duplicated the money form

The queue had a second quick resolve/escalate modal backed by a different API
route. It allowed a money decision without the complete evidence, history,
support context, or accurate amount preview. The queue is now intake and
prioritization only. Every row opens Dispute 360 for assignment, communication,
escalation, and any enabled resolution.

## Test integrity improvement

The old Phase 143 reopen regression test inspected source text. It was removed.
The new dispute tests execute rendered controls or service behavior. New tests
are one-bug behavior checks for OPS-309 through OPS-320.

## Documentation aligned

Updated:

- `docs/operations/09-trust-safety-and-disputes.md`
- `docs/operations/11-admin-system-training-manual.md`
- `docs/operations/13-policies-codes-and-templates.md`

The manuals now distinguish a recorded decision from completed settlement,
describe dispute updates as one-way notifications, require Support for replies,
send queue decisions to Dispute 360, and carry the E51 containment.

Historical Phase 07 honesty records remain unchanged. They correctly document
what that earlier phase did not ship at that point in time.

## Verification

Complete executable suites after all changes:

- API: 693 suites passed, 1 skipped; 3,078 tests passed, 1 skipped
- Admin: 253 files passed, 1 skipped; 342 tests passed, 3 todo
- Mobile: 506 suites passed; 885 tests passed, 84 todo

Also passed:

- API, admin, and mobile TypeScript checks
- repository ESLint with `--no-cache --quiet`
- API production build
- admin production build
- `git diff --check` (Windows line-ending notices only)

The Docker-only nginx certificate-revocation check remains excluded because the
Docker daemon is unavailable on this machine.

## Production and merge status

Production was not changed.

Do not merge this money-path topic branch or deploy it until both conditions are
cleared:

1. E50 production financial inventory and legacy financial-terms review
2. E32 production SSH authorization

Current production host/path facts remain in the local-only access note outside
Git. No credential or key path is recorded in this repository.

## Next safe continuation

Continue the screen-by-screen customer/provider/admin audit outside held money
semantics. Prioritize:

1. customer and provider dispute/support inbox continuity on wide tablet and
   desktop browser widths
2. Dispute 360 settlement-status evidence from the existing Financials retry
   records, read-only until E51 is approved
3. remaining source-content tests on active operator controls
4. Stitch design-contract differences across customer, provider, then admin
   screens
