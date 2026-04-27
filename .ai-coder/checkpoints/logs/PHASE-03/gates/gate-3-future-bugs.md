# Most-likely 2-week future bug — Phase 03

## The bug

A second engineer ships a new helper in Phase 04 that calls
`commissionService.calculateCommission(servicePrice, tier)` **without
`await`**. Because the call site immediately spreads the (Promise) result
into a logger or DTO (e.g. `logger.info('booked', { ...result })`), TypeScript
infers the spread type as the Promise's intersection and never errors.

Downstream ledger entries record `NaN` (or `undefined`) for commission and
service-fee fields. The bug surfaces only when an admin notices the wallet
totals do not balance — typically days later.

## Why this is the most likely bug

- Phase 03 changed two **previously synchronous** money helpers into async
  functions. Every existing caller was hand-audited and updated, but the
  migration is invisible at the call-site (signature looks identical except
  for `Promise<...>`).
- Spreading a `Promise<CommissionBreakdown>` into another object is a known
  TypeScript blind spot — the result is `Promise & CommissionBreakdown`, which
  satisfies most consumers' interface checks at compile time.
- The mutation gate runs on `commission.service.ts` itself, not its callers,
  so a new caller is not protected.

## Detection plan

- Add a Phase 04 ESLint custom rule (or grep guard) that fails on
  `commissionService.calculate*(.*)` patterns missing a preceding `await`.
- Add a money-conservation integration test that constructs a real booking
  end-to-end and asserts every numeric column in the ledger is finite.

## Containment plan

If the bug ships:

1. Patch the missing `await`.
2. Run `verify-money-conservation.sh` to identify orphaned `NaN` rows.
3. For each affected booking, recompute commission/service-fee server-side and
   issue compensating ledger entries.
