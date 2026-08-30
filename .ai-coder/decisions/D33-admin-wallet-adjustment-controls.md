# D33 - Admin wallet-adjustment controls

Date: 2026-08-30
Status: OPEN - money-control design required
Raised from: Customer 360 payments audit and historical CRIT-133

## Decision

What limits and approval workflow should govern manual customer and provider wallet adjustments?

## Current behavior and evidence

- The server restricts customer and provider adjustments to super-admin, locks the wallet, prevents a negative resulting balance, and writes the wallet ledger plus admin action in one transaction.
- The admin form has no confirmation preview and no maximum amount.
- A misplaced zero can therefore create a very large balance even though the resulting ledger is internally consistent.
- Prior audit CRIT-133 proposed a configurable maximum, confirmation preview, and two-person approval for large adjustments. The Phase 05 evidence manifest explicitly left dual control deferred.
- Operations documentation requires approval for significant money decisions, but the application has no co-signing record or pending-adjustment state.

## Options

### Option A - Bounded adjustment with dual control (recommended)

- Add a server-authoritative configurable maximum with a conservative default.
- Always show the current balance, signed adjustment, resulting balance, customer/provider identity, and reason in an in-app confirmation.
- Raise the reason minimum to the shared consequential-action standard.
- Execute small adjustments immediately after confirmation.
- Put adjustments above an approved threshold into a pending state requiring a different active super-admin to approve.
- Record request, approval/rejection, execution, and ledger IDs without logging private financial data.

Benefits: reduces typo risk and gives large manual money movement separation of duties.

Tradeoff: requires a new pending-adjustment model, threshold ownership, migration, and operational staffing rule.

### Option B - Maximum and confirmation only

Benefits: faster to implement and blocks the largest mistakes.

Tradeoff: one person can still execute every allowed adjustment, contrary to the previously recommended large-adjustment control.

### Option C - Keep the current direct form

Benefits: no workflow change.

Tradeoff: preserves a known real-money typo and misuse risk.

## Recommendation

Choose Option A. Do not invent the peso thresholds in code. The business owner must approve the immediate-execution maximum, dual-control threshold, and who can be the second approver before the money path changes.

## Safe behavior while open

- Keep existing server transaction and non-negative-balance guards.
- Treat the current form as a restricted super-admin emergency tool.
- Do not add an arbitrary cap, override, or co-sign bypass.
- Continue non-money Customer 360 and admin work.
