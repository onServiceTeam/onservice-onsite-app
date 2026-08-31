# E49 — Concurrent System Settings edits can corrupt control-plane audit evidence

**Date:** 2026-08-31
**Status:** OPEN — no production setting or rate changed
**Hard-stop reason:** affected settings control commissions, fees, AML, refunds,
dispatch, identity checks, and other money/compliance behavior

## Bad news first

`SettingsService.updateSetting()` reads the current setting before it opens the
database transaction that performs the update and writes the audit event. Two
super-admins can therefore read the same old value, submit different changes,
and both succeed. The later request silently overwrites the earlier request,
while its audit row can record an `old_value` that was no longer current.

`bulkUpdateSettings()` has the same stale-read boundary. It also does not reject
duplicate keys in one request, so one bulk operation can update the same control
more than once while preserving misleading before-state evidence.

This is not a cosmetic admin defect. It can make the control plane and its audit
trail disagree for settings that affect money movement and compliance.

## Evidence

- `packages/api/src/services/settings.service.ts` reads the single-setting row
  before `withTransaction()` and reuses that pre-transaction value in the audit
  insert.
- The bulk path selects settings before its transaction, then updates and audits
  from the stale snapshot.
- Neither path locks the current rows with `FOR UPDATE` before deriving the
  before-state.
- The API has no compare-and-set version or `updated_at` precondition that would
  reject an operator editing an older screen state.

## Safe containment recommendation

Implement the repair without changing any configured value:

1. Begin the transaction before reading a mutable setting and lock the row with
   `SELECT ... FOR UPDATE`.
2. Validate and derive `old_value` from the locked row, then update and insert
   the audit event in that same transaction.
3. Lock bulk rows in a deterministic order and reject duplicate requested keys.
4. Add an optimistic `updatedAt` precondition to admin writes so a stale browser
   receives a conflict response instead of silently replacing a newer edit.
5. Require a meaningful server-validated reason for every setting mutation.
6. Add executed concurrency and stale-version tests that assert the persisted
   setting and its audit history, not source text.

This repair is the recommended option because it restores transaction and audit
integrity while leaving every commission, fee, threshold, and operational value
unchanged.

## Decision required before implementation

The repository's hard-stop policy requires explicit approval before changing a
money/compliance control path. Approval here means permission to implement only
the containment above. It does not authorize changing production values,
commission policy, AML policy, refund policy, dispatch policy, or historical
audit rows.

Until approved, System Settings mutation code and production settings remain
unchanged.
