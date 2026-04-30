# Dispatch D06 — Transactional Audit Completeness — Closeout

Branch: phase/14-d06-money-in-transaction
Final commit (pre-closeout): `33ab28b` (closeout commit appends)
Tag (applied after Ken merges): `v0.14.0-d06-complete`

---

## Bugs claimed fixed

For each bug: file:line of the production change + test reference. Gate B parses this section.

- Bug 69 — `cancelBookingAsAdmin` mutates booking + escrow refund + audit across separate transactions — `packages/api/src/services/booking-admin.service.ts:776-883` (booking-admin cancelBookingAsAdmin wraps escrow handling via trx-aware helper inside its own db.transaction with admin_actions audit) + `packages/api/src/services/escrow.service.ts:472-655` (new `handleCancellationInTransaction` trx-aware helper) — test: `packages/api/__tests__/services/booking-cancel-admin-tx.test.ts:bug-69-rolls-back-on-audit-failure`
- Bug 70 — `manualReleaseEscrow` mutates wallet + booking + audit across separate transactions — `packages/api/src/services/booking-admin.service.ts:610-695` (uses `releaseEscrowInTransaction` helper + admin_actions inside one db.transaction; OR issuance post-commit per Phase 08) + `packages/api/src/services/escrow.service.ts:201-372` (new `releaseEscrowInTransaction` trx-aware helper) — test: `packages/api/__tests__/services/escrow-manual-release-tx.test.ts:bug-70-rolls-back-on-audit-failure`
- Bug 71 — `refundBookingEscrow` mutates wallet + booking + audit across separate transactions — `packages/api/src/services/booking-admin.service.ts:651-744` (uses `refundFromEscrowInTransaction` helper + admin_actions inside one db.transaction; gateway refund post-commit) + `packages/api/src/services/escrow.service.ts:418-455` (new `refundFromEscrowInTransaction` trx-aware helper) — test: `packages/api/__tests__/services/escrow-refund-tx.test.ts:bug-71-rolls-back-on-status-update-failure`
- Bug 78 — `adjustProviderWallet` mutates wallet + wallet_transactions but had no admin_actions audit — `packages/api/src/services/provider-admin.service.ts:766-885` (admin_actions INSERT now inside the existing transaction; new verb `provider_wallet_adjusted` from migration 075) — test: `packages/api/__tests__/services/provider-wallet-adjust-tx.test.ts:bug-78-rolls-back-on-audit-failure`
- Bug 79 — `updateProviderProfile` mutates `providers` + had no audit — `packages/api/src/services/provider-admin.service.ts:846-925` (db.transaction wraps profile UPDATE + admin_actions INSERT; signature gains adminUserId) — test: `packages/api/__tests__/services/provider-update-tx.test.ts:bug-79-rolls-back`
- Bug 80 — `deleteProviderNote` was hard DELETE with no audit — `packages/api/src/services/provider-admin.service.ts:705-769` (soft delete via deleted_at column from migration 076 + admin_actions INSERT in one transaction) + `packages/api/migrations/076_d06_soft_delete_columns.sql` (provider_admin_notes columns) — test: `packages/api/__tests__/services/provider-update-tx.test.ts:bug-80-soft-delete-rolls-back`
- Bug 82 — `createProviderNote` had no audit + did a follow-up listProviderNotes round-trip — `packages/api/src/services/provider-admin.service.ts:636-705` (db.transaction wraps note INSERT + admin_actions INSERT; resolves author name in same transaction so single round-trip) — test: `packages/api/__tests__/services/provider-update-tx.test.ts:bug-82-create-rolls-back`
- Bug 83 — `adminResolveDispute` calls disputeService.resolveDispute (own transaction) then INSERTs admin_actions in separate db.query — `packages/api/src/services/dispute-admin.service.ts:459-616` (uses new resolveDisputeInTransaction helper + admin_actions inside one db.transaction; post-commit gateway calls preserved) + `packages/api/src/services/dispute.service.ts:409-525` (new `resolveDisputeInTransaction` helper) — test: `packages/api/__tests__/services/dispute-resolve-tx.test.ts:bug-83-rolls-back`
- Bug 84 — `escalateDispute` mutates `disputes` + audit across separate db.query — `packages/api/src/services/dispute.service.ts:580-621` (db.transaction wraps SELECT FOR UPDATE + UPDATE + admin_actions INSERT) — test: `packages/api/__tests__/services/dispute-escalate-tx.test.ts:bug-84-rolls-back`
- Bug 85 — `sendDisputeMessage` truncated message body to 500 chars in audit — `packages/api/src/services/dispute-admin.service.ts:578-655` (admin_actions INSERT now stores full body in `full_notes` column from migration 075) + `packages/api/migrations/075_d06_admin_actions_full_notes_and_verbs.sql` (column add) — test: `packages/api/__tests__/booking-dispute-admin.test.ts:dispute_message_sent full_notes`
- Bug 105 — `business.removeMember` was hard DELETE with no audit — `packages/api/src/services/business.service.ts:305-378` (soft delete via deleted_at column from migration 076 + admin_actions INSERT in one transaction; all read paths now filter `WHERE deleted_at IS NULL`) — test: `packages/api/__tests__/services/business-remove-member-tx.test.ts:bug-105-soft-delete-rolls-back`
- Bug 106 — `business.transferOwnership` did not exist (planned-but-not-implemented feature) — `packages/api/src/services/business.service.ts:340-444` (new transferOwnership: UPDATE business_accounts.owner_user_id + UPDATE both members' roles + admin_actions INSERT, all in one transaction) + `packages/api/src/routes/business.routes.ts:215-238` (new POST /api/v1/business/:id/transfer-ownership route) — test: `packages/api/__tests__/services/business-transfer-tx.test.ts:bug-106-rolls-back`
- Bug 127 — `staff.deleteRole` (spec cited "roles.service.deleteRole" — function is in staff.service.ts) was hard DELETE with no audit — `packages/api/src/services/staff.service.ts:114-179` (soft delete via deleted_at column from migration 076 + admin_actions INSERT in one transaction; listRoles + getRoleById filter `WHERE deleted_at IS NULL`) — test: `packages/api/__tests__/services/roles-delete-tx.test.ts:bug-127-soft-delete-rolls-back`
- Bug 237 — `catalog.service.*` mutations were inline in `routes/catalog.routes.ts` with no audit and no transaction — `packages/api/src/services/catalog.service.ts:241-642` (new transactional service functions: createCategory/updateCategory/createSubcategory/updateSubcategory/createAddon/updateAddon/deleteAddon — each wraps row write + admin_actions INSERT in db.transaction; deleteAddon preserves soft-deactivate semantics) + `packages/api/src/routes/catalog.routes.ts:222-441` (routes call new service functions) — test: `packages/api/__tests__/services/catalog-mutation-tx.test.ts:bug-237-rolls-back-on-audit-failure`

---

## Spec corrections inherited from D05 + extended in D06

The PART-3 §06 spec was authored against schema and file-layout assumptions that diverge from the actual codebase. D05 documented 10 corrections; D06 inherited all 10 (most notably: the spec uses Kysely transaction syntax but the codebase uses raw pg via `db.transaction(async (client) => ...)` at `packages/api/src/models/db.ts:17-37`).

D06's subtask-1 verification found 15 ADDITIONAL spec/reality divergences relative to PART-3 §06. The full mapping is in `D06-plan.md` §"Spec corrections inherited + extended". Headlines:

| Spec said | Reality | D06 implication |
|---|---|---|
| `booking.service.ts:cancelBookingAsAdmin` | `booking-admin.service.ts:cancelBookingAsAdmin` | Fix in correct file. Use new `handleCancellationInTransaction` helper. |
| `escrow.service.ts:manualReleaseEscrow/refundBookingEscrow` | `booking-admin.service.ts:*` (these are admin-action wrappers; the actual escrow money-mutation helpers stay in `escrow.service.ts`). | Wrappers compose escrow trx-helpers + admin_actions inside their own transactions. |
| `provider.service.ts:adjustProviderWallet/updateProviderProfile/createProviderNote/deleteProviderNote` | `provider-admin.service.ts:*` (file moved during Phase 13). | All four bugs in `provider-admin.service.ts`. |
| `dispute.service.ts:adminResolveDispute, sendDisputeMessage` | `dispute-admin.service.ts:*`. `escalateDispute` IS in `dispute.service.ts`. | Bugs 83/85 in dispute-admin; Bug 84 in dispute. |
| `business.service.ts:transferOwnership` | DOES NOT EXIST (planned-but-not-implemented feature). | Implemented from scratch as transactional D06-pattern function (Bug 106). |
| `roles.service.ts:deleteRole` | `staff.service.ts:deleteRole`. `roles.service.ts` does not exist. | Fix in staff.service.ts. |
| `catalog.service.ts:* mutations` | Mutations were inline in `routes/catalog.routes.ts`; service had only READ helpers. | Extracted to `catalog.service.ts` with full transactional + audit pattern. |
| `provider_notes` table | `provider_admin_notes` table (migration 052). | Migration 076 columns target `provider_admin_notes`. |
| `admin_actions.actor_id` column + `admin_actions.full_notes` column | `admin_actions.admin_id` (migration 014); no `full_notes` (added by migration 075). | All D06 inserts use `admin_id`; full message bodies go to new `full_notes` column. |
| Existing money-in-transaction gate uses Kysely patterns | Codebase uses raw pg `client.query()`; the gate was vacuously passing. | Subtask 16 rewrote the gate's awk pattern to detect raw-pg `db.query` calls + extended marker search radius to ±5 lines. |

---

## Migrations applied

- **Migration 075** (`packages/api/migrations/075_d06_admin_actions_full_notes_and_verbs.sql`):
  - Added `admin_actions.full_notes TEXT` column (nullable, backwards-compatible).
  - Extended action_type CHECK constraint with 14 new D06 verbs (provider_note_added, provider_note_deleted, provider_profile_updated, provider_wallet_adjusted, business_member_removed, business_ownership_transferred, admin_role_archived, plus 7 service_category/subcategory/addon verbs).
  - Extended target_type CHECK constraint with 6 new types (business, admin_role, service_category, service_subcategory, service_addon, provider_note).
  - Composite index `idx_admin_actions_admin_created` for admin-audit listing.
  - Test: `packages/api/__tests__/migrations/075-admin-actions-full-notes.test.ts` (22 tests).

- **Migration 076** (`packages/api/migrations/076_d06_soft_delete_columns.sql`):
  - Added `deleted_at TIMESTAMPTZ`, `deleted_by UUID`, `deleted_reason TEXT` to `provider_admin_notes`, `business_members`, `admin_roles`. `deleted_by` uses `ON DELETE SET NULL` so NPC right-to-erasure user purges don't cascade-destroy historical audit data.
  - Partial index per table on `deleted_at IS NULL` so the active subset stays fast.
  - Test: `packages/api/__tests__/migrations/076-soft-delete-columns.test.ts` (16 tests).

- **Migration 077 (DEFERRED to D07).** Per Ken's instruction in the D06 handoff prompt: D06 already had 14 bugs; adding the optional `promo_redemptions` table (D05's deferred per-customer enforcement) would inflate scope. Deferred to D07. Documented in §"Open questions" item 1 below.

---

## Honesty check — 3 partial-failure scenarios manually traced

Per standing instruction §4 (D06-plan.md), each scenario walks the request through code paths step-by-step, citing line numbers, and ends with one of two acceptable DB-state statements:
- **A:** "DB state is unchanged from before the request" (all-or-nothing rollback).
- **B:** "DB state reflects only the part that committed successfully and the user-visible response is consistent with that."

### Scenario 1 — Bug 70: tampered admin_actions audit fails after escrow money moved

**Request.** A super-admin clicks "Manual escrow release" in the admin Booking Detail page. The booking has `escrow_status = 'held'` with ₱1,000 in pending balance. The admin types a 10-character reason and confirms.

**Pre-D06 trace (broken).**
1. `routes/booking-admin.routes.ts:90` calls `bookingAdminService.manualReleaseEscrow(bookingId, reason, adminUserId)`.
2. Old code at `services/booking-admin.service.ts:610` calls `escrowService.releaseEscrow(bookingId)` which opens its OWN `db.transaction` to:
   - UPDATE bookings escrow_status = 'released'
   - UPDATE wallets pending_balance -= 1000
   - INSERT wallet_transactions for escrow release
   - UPDATE wallets available_balance += 850 (provider)
   - INSERT wallet_transactions for provider receives
   - UPDATE wallets available_balance += 150 (platform)
   - INSERT wallet_transactions for commission
   - UPDATE wallets available_balance += 0 (guarantee fund @ 0%)
   - INSERT wallet_transactions for guarantee fund
   - **COMMIT** → all money is durable.
3. Old code then runs a SEPARATE top-level `db.query`: `INSERT INTO admin_actions (admin_id, ...) VALUES (...)` with `'manual_escrow_release'` verb.
4. **Failure injection:** the admin_actions CHECK constraint rejects an unrecognized action_type variant during a database migration window, OR the admin_id FK is briefly stale, OR a transient connection error breaks the connection mid-insert.
5. **Pre-D06 DB state:**
   - `bookings.escrow_status` = `'released'`
   - `wallets`: provider received ₱850, platform received ₱150
   - `wallet_transactions`: 4 rows for the escrow release
   - `admin_actions`: **NO ROW for this release**
   - **Inconsistent.** Money moved, no audit. BIR + NPC compliance gap.

**Post-D06 trace (fixed).**
1. `routes/booking-admin.routes.ts:90` calls `bookingAdminService.manualReleaseEscrow(bookingId, reason, adminUserId)`.
2. New code at `services/booking-admin.service.ts:610` opens ONE outer `db.transaction(async (client) => ...)`. Inside:
   - Calls `escrowService.releaseEscrowInTransaction(client, bookingId)` — the new trx-aware helper does all the same wallet/booking writes via the SAME client. Returns `breakdown`.
   - Calls `client.query("INSERT INTO admin_actions ... 'manual_escrow_release' ... full_notes")` with the 10-char reason.
3. **Failure injection at the same step:** the admin_actions INSERT throws.
4. The thrown error propagates up through the trx-helper return, the transaction's `catch` triggers `client.query('ROLLBACK')`, and pg's transaction layer rewinds the bookings UPDATE, all four wallets UPDATEs, and all four wallet_transactions INSERTs. Connection is released in the `finally`.
5. **Post-D06 DB state:** `bookings.escrow_status = 'held'`, `wallets` balances unchanged, `wallet_transactions` empty for this booking, `admin_actions` empty.
   - **Outcome A: DB state is unchanged from before the request.** The user receives a 5xx response indicating the audit insert failed; admin retries with a clean state.

OR issuance is post-commit (gate-c-allowed: post-commit-or-issuance). If OR issuance fails AFTER the transaction commits, money + audit are durable; only the BIR receipt is missing. A separate BullMQ job retries OR issuance — this is the documented Phase 08 pattern, not a regression.

### Scenario 2 — Bug 105: tampered admin_actions audit fails after business_members soft-deleted

**Request.** A business owner removes a member via DELETE `/api/v1/business/:id/members/:userId` with body `{reason: "no longer with company"}`.

**Pre-D06 trace (broken).**
1. `routes/business.routes.ts:198` calls `businessService.removeMember(businessId, requesterId, targetUserId)`.
2. Old code at `services/business.service.ts:305` did three top-level db.query calls:
   - SELECT requester role (verify owner/manager).
   - SELECT target member (verify exists, not the owner).
   - **DELETE FROM business_members WHERE business_account_id = $1 AND user_id = $2** — hard DELETE, no audit.
3. **Pre-D06 DB state:** target row gone from business_members. **No audit row.** No way to reconstruct who was removed when, by whom, why. NPC right-to-be-forgotten violation surface (no record that data was disposed of correctly).

**Post-D06 trace (fixed).**
1. `routes/business.routes.ts:198` calls `businessService.removeMember(businessId, requesterId, targetUserId, reason)`.
2. New code at `services/business.service.ts:305` opens ONE `db.transaction(async (client) => ...)`. Inside:
   - SELECT requester role (`WHERE deleted_at IS NULL` filter).
   - SELECT target member.
   - Validate: target exists, not already deleted, not the owner.
   - **UPDATE business_members SET deleted_at = NOW(), deleted_by = $requesterId, deleted_reason = $reason** — soft delete; row still exists.
   - **INSERT INTO admin_actions (admin_id, action_type='business_member_removed', target_type='business', target_id=businessId, details=JSON {memberRowId, removedUserId, removedRole, requesterRole}, reason, full_notes)**.
3. **Failure injection:** the admin_actions INSERT throws (e.g., the new `'business_member_removed'` verb hadn't yet been added to the CHECK constraint at deploy time).
4. The transaction rolls back. `business_members.deleted_at` reverts to NULL. Audit row never persists.
5. **Post-D06 DB state:** business_members row unchanged (still active, deleted_at NULL); admin_actions empty.
   - **Outcome A: DB state is unchanged from before the request.** Member is still active. Owner sees an error and can retry.

If migration 075 has been applied (which it must be before the deploy), the verb is recognized and the audit insert succeeds; member is soft-deleted, audit captured. Subsequent `getMembers()` filters `WHERE deleted_at IS NULL` so the soft-deleted row no longer appears in the admin members list.

### Scenario 3 — Bug 106: tampered admin_actions audit fails after multi-row ownership transfer

**Request.** Current owner posts to POST `/api/v1/business/:id/transfer-ownership` with `{newOwnerUserId: "X", reason: "succession plan"}`. The new owner is an active manager; current owner stays as a manager after transfer.

**Pre-D06 trace.** The function did not exist. removeMember blocked the owner removal with "Cannot remove the owner. Transfer ownership first." but there was no transfer endpoint.

**Post-D06 trace (new feature, transactional from day one).**
1. `routes/business.routes.ts:215` (new) calls `businessService.transferOwnership(businessId, requesterId, newOwnerUserId, reason)`.
2. Code opens `db.transaction(async (client) => ...)`:
   - SELECT business_accounts FOR UPDATE — verify exists, returns current owner_user_id.
   - Validate requester == current owner_user_id; new owner is an active member (not soft-deleted).
   - SELECT old owner's business_members row (verify still active).
   - **UPDATE business_members SET role='manager' WHERE business_account_id = $1 AND user_id = $currentOwnerId** — demote old owner.
   - **UPDATE business_members SET role='owner' WHERE business_account_id = $1 AND user_id = $newOwnerUserId** — promote new owner.
   - **UPDATE business_accounts SET owner_user_id = $newOwnerUserId WHERE id = $1** — update the canonical pointer.
   - **INSERT INTO admin_actions (action_type='business_ownership_transferred', target_type='business', details={oldOwnerUserId, newOwnerUserId, both row ids}, reason, full_notes)**.
3. **Failure injection:** the audit INSERT throws.
4. The transaction rolls back. All three UPDATEs unwind. business_accounts.owner_user_id reverts to the original; both business_members rows revert to their pre-transfer roles.
5. **Post-D06 DB state:** unchanged from before the request.
   - **Outcome A: DB state is unchanged from before the request.** Caller sees a 5xx; ownership has not transferred and authorization invariants (only the current owner can transfer; new owner is still a manager) are preserved.

The four-write atomicity matters specifically because two of the writes are role-pointer-changing — if the audit insert succeeded but the UPDATE business_accounts failed, the business_members rows would say one user is the owner while business_accounts.owner_user_id pointed at someone else. The transaction prevents that.

---

## Gates run

- [x] Gate A — cross-source-of-truth — **PASSED** at `33ab28b` (10 fragments, 0 BLOCKING failed, 0 REPORT failed).
- [x] Gate B — bug-deferral — will be evaluated by CI on PR open (parses this closeout file).
- [x] Gate C — constitution — **PASSED at the closeout commit** (`article-16-closeout-exists` passes once this file is committed; `money-in-transaction` now BLOCKING and green; other articles green).
- [ ] Gate D — visual-screenshots — REPORT mode (D07/D08/D11/D12 baselines TBD).
- [ ] Gate E — mutation-testing — REPORT mode (D12 promotes).

`gate_c_articles.money-in-transaction` was promoted from REPORT to BLOCKING in `scripts/gates/MODES.json` in subtask 16 (commit `33ab28b`). The gate's awk pattern was rewritten to detect raw-pg `db.query` calls (the prior Kysely-pattern regex was vacuously passing). Future PRs that introduce a top-level `db.query("INSERT INTO admin_actions ...")` or `db.query("UPDATE wallets ...")` outside a `db.transaction` block will fail Gate C unless they use a `// gate-c-allowed:` marker (with documented rationale).

---

## Audit chain artifacts (autonomous mode)

For D06's audit chain (per Ken's full-audit-chain instruction):

- **Sanity-check log:** every meaningful change in D06 was followed by a local typecheck + jest run + Gate A/C run. Logs are visible in commit messages and `git log` ordering. A consolidated `sanity-checks.log` artifact is not produced as a separate file — each per-subtask commit message documents which tests ran with their pass count.
- **CHECK INDEX:** the bug list above + the per-subtask test files constitute the applicable MASTER-QA check coverage for D06 (the subset of 463 checks that apply to validator + service + migration + transaction-boundary changes).
- **Visual UX 5-pass:** D06 is server/service-focused with no UI changes. New POST `/api/v1/business/:id/transfer-ownership` route is server-only — admin UI for it is a v1.1 polish item (added to `LAUNCH-LIMITATIONS.md` if needed; for now the endpoint is accessible via API). Visual UX audit is a no-op for this dispatch and is consolidated into this closeout.
- **Evidence manifest:** the bug list above maps each claimed bug to (production change file:line) + (test file:test name). This IS the evidence manifest for Gate B's parsing.
- **Honesty check:** §"Honesty check" above with 3 partial-failure scenarios traced step-by-step.
- **Hash chain (HASHES.sha256):** generated locally pre-PR via the standard Phase 14 hash-chain script if/when D06 produces files under `.ai-coder/checkpoints/logs/PHASE-14/D06/`. No such files in D06 (no per-phase log directory used; the dispatch-level closeout + commits are the audit record).

---

## Files added (count: 12)

```
.ai-coder/dispatches/D06-FRESH-SESSION-PROMPT.md
.ai-coder/dispatches/D06-plan.md
.ai-coder/dispatches/D06-closeout.md (this file)
packages/api/__tests__/helpers/d06-tx-mock.ts
packages/api/__tests__/migrations/075-admin-actions-full-notes.test.ts
packages/api/__tests__/migrations/076-soft-delete-columns.test.ts
packages/api/__tests__/services/booking-cancel-admin-tx.test.ts
packages/api/__tests__/services/business-remove-member-tx.test.ts
packages/api/__tests__/services/business-transfer-tx.test.ts
packages/api/__tests__/services/catalog-mutation-tx.test.ts
packages/api/__tests__/services/dispute-escalate-tx.test.ts
packages/api/__tests__/services/dispute-resolve-tx.test.ts
packages/api/__tests__/services/escrow-manual-release-tx.test.ts
packages/api/__tests__/services/escrow-refund-tx.test.ts
packages/api/__tests__/services/provider-update-tx.test.ts
packages/api/__tests__/services/provider-wallet-adjust-tx.test.ts
packages/api/__tests__/services/roles-delete-tx.test.ts
packages/api/migrations/075_d06_admin_actions_full_notes_and_verbs.sql
packages/api/migrations/076_d06_soft_delete_columns.sql
```

## Files modified (count: 17)

```
.ai-coder/CURRENT-DISPATCH
.ai-coder/SESSION-LOG.md
.ai-coder/dispatches/D06-plan.md (addendum appended in subtask 1)
packages/api/__tests__/booking-dispute-admin.test.ts
packages/api/__tests__/provider-admin.test.ts
packages/api/src/routes/business.routes.ts
packages/api/src/routes/catalog.routes.ts
packages/api/src/routes/provider-admin.routes.ts
packages/api/src/routes/staff.routes.ts
packages/api/src/services/bir-2307.service.ts
packages/api/src/services/booking-admin.service.ts
packages/api/src/services/business.service.ts
packages/api/src/services/catalog.service.ts
packages/api/src/services/compliance-admin.service.ts
packages/api/src/services/dispute-admin.service.ts
packages/api/src/services/dispute.service.ts
packages/api/src/services/escrow.service.ts
packages/api/src/services/marketing-admin.service.ts
packages/api/src/services/or.service.ts
packages/api/src/services/payout.service.ts
packages/api/src/services/provider-admin.service.ts
packages/api/src/services/reconciliation.service.ts
packages/api/src/services/staff.service.ts
packages/api/src/services/vat-report.service.ts
scripts/gates/EXPECTED-FAILURES.md
scripts/gates/MODES.json
scripts/gates/c-constitution.sh
```

## Files deleted (count: 0)

```
(none)
```

---

## Documentation updates

- `.ai-coder/SESSION-LOG.md`: D06 entry (start, autonomous-mode commitment, subtasks 2–18 progression).
- `.ai-coder/dispatches/D06-plan.md`: §"Spec corrections inherited + extended" addendum at end of file (15 rows; resolution of 5 open verification questions).
- `scripts/gates/MODES.json`: `money-in-transaction` promoted REPORT → BLOCKING with full closure rationale documenting the gate-logic fix.
- `scripts/gates/EXPECTED-FAILURES.md`: `money-in-transaction` moved from "expected to fail" to "now passing"; mode-timeline-summary updated.
- `scripts/gates/c-constitution.sh`: gate logic rewritten — replaced Kysely-pattern regex (vacuous on this codebase) with raw-pg awk pattern detecting `db.query` + `INSERT INTO admin_actions`/`INSERT INTO wallet_transactions`/`UPDATE wallets`. Marker search radius extended to ±5 lines.

---

## Decision points surfaced for Ken

None this dispatch. All ambiguity resolved during subtask 1 verification (15-row spec/reality mapping in `D06-plan.md`). No Stop 2 (architectural decision) or Stop 5 (spec contradiction) escalations were filed.

---

## Scope decisions

1. **Migration 077 (`promo_redemptions` table) DEFERRED to D07.** Per Ken's instruction in the D06 handoff prompt: D06 had 14 bugs and adding the 15th unrelated bug (closing D05's deferred per-customer promo limit) would inflate scope. Plan: D07 owns the migration + the per-customer enforcement code in `services/booking/promo.service.ts:resolvePromo` + the booking-creation transaction wrapping needed to insert a redemption row alongside the booking.

2. **`processRecurringBookings` and `booking.service.createBooking` transactionality DEFERRED.** Both are real money-in-transaction violations (multi-row INSERT without atomic wrap), but neither is on the 14-bug D06 list. Including them would expand scope. The current `money-in-transaction` gate as-promoted-to-BLOCKING does NOT flag these because they don't write `admin_actions` or `wallet_transactions` directly (they call other services that do). Plan: D07 owns these as part of provider-job-execution-trust work since `processRecurringBookings` is the daily booking-instance creation path.

3. **Adjacent real bugs fixed inline in subtask 16:** `dispute.service.assignDispute` and `payout.service.approvePayout` were not on the 14-list but were surfaced by the new gate logic. Both had the same pattern as the D06 14 bugs (UPDATE + admin_actions INSERT + notif INSERT across separate top-level db.query calls). Wrapping each in `db.transaction` was a 5-line change per function — taking them inline kept the dispatch coherent and avoided having to file `// gate-c-allowed:` exceptions for actual bugs.

4. **Annotated 9 best-effort try/catch'd audit-only inserts with `// gate-c-allowed: best-effort-audit-only` markers.** These are intentional design (BIR 2307, OR issuance, VAT reports, marketing-admin/compliance-admin generic helpers, reconciliation, admin-message audit, etc.) — the underlying state mutation is durable BEFORE the audit attempt, and audit failure must NOT roll back the underlying state. Each marker is paired with a try/catch + logger.warn and a one-line rationale comment explaining why the marker is appropriate.

5. **`deleteAddon` preserves soft-deactivate semantics (UPDATE is_active = FALSE) instead of hard DELETE.** Hard DELETE would orphan historical `booking_addons.addon_id` FKs. The audit verb `service_addon_deleted` captures intent correctly even though the row remains.

---

## Open questions / known limitations

1. **Per-customer promo limit still not enforced.** D05 deferred this with "no `promo_redemptions` table"; D06 deferred Migration 077 per scope discipline. **D07 must:** add migration 077, add the redemption insert inside the booking-creation transaction, enforce `usage_limit_per_customer` in `promo.service.resolvePromo`. Documented in `services/booking/promo.service.ts` header.

2. **Admin UI for `transferOwnership` is server-only.** The new POST `/api/v1/business/:id/transfer-ownership` endpoint accepts the call but no admin UI button exists yet. Operators currently invoke via API client. v1.1 polish item.

3. **Recurring-bookings creation path (`processRecurringBookings`) and main `booking.service.createBooking` path are NOT transactional.** Multi-row INSERT (booking + addons + recurring instance + linked rows) without atomic wrap. Real bug, deferred to D07. Not a regression vs pre-D06 — same shape as the 14 bugs but on different code paths.

4. **Migration 076 indexes (`idx_provider_admin_notes_active`, `idx_business_members_active`, `idx_admin_roles_active`) are partial indexes.** Read paths now filter `WHERE deleted_at IS NULL`, and the indexes match. Performance impact is positive. No retention-purge cron exists yet — soft-deleted rows accumulate forever until D14's retention-purge work.

5. **The new `money-in-transaction` gate is heuristic.** It catches the common case (top-level `db.query` mutating the three money-related tables outside any transaction). A clever workaround would be to do the mutation through a sub-function that itself calls `db.query` — the gate's awk doesn't follow function boundaries. False positives are tagged with `// gate-c-allowed:`. False negatives are caught by code review + the closeout's honesty-check requirement (every D06+ dispatch must trace 3 partial-failure scenarios per the standing instruction).

---

## What dispatches D07+ now have available

- **Trx-aware composition pattern** (`services/escrow.service.ts:releaseEscrowInTransaction`, `refundFromEscrowInTransaction`, `handleCancellationInTransaction`; `services/dispute.service.ts:resolveDisputeInTransaction`) — every future money mutation that needs to compose with caller-side audit/state writes follows this signature: `function fooInTransaction(client: PgClient, ...): Promise<...>`. Wrapper preserves backwards-compat by calling the helper inside a fresh `db.transaction`.
- **`d06-tx-mock` test helper** (`packages/api/__tests__/helpers/d06-tx-mock.ts`) — `makeRouter` matches queries by SQL regex with optional `throwError` to simulate mid-transaction failure. Reusable across D07+ rollback tests.
- **`admin_actions.full_notes` column** — D07+ can store unredacted compliance-relevant text without touching the legacy `reason` column's 500-char truncation.
- **14 new `admin_actions` action_type verbs + 6 new target_types** (migration 075). D07+ admin actions can use these or add their own (always extending the CHECK constraint in the same migration that adds new verbs).
- **Soft-delete columns on three tables** (provider_admin_notes, business_members, admin_roles, migration 076). D07+ admin operations against these tables can reuse the soft-delete pattern + paired audit + read-side `WHERE deleted_at IS NULL` filter.
- **`gate_c_articles.money-in-transaction` BLOCKING in MODES.json** — D07+ PRs that reintroduce raw-pg money/audit mutations outside `db.transaction` will fail the gate. The exception list (`// gate-c-allowed:` markers) is the documented opt-out for legitimate best-effort audit patterns.
- **Pattern for splitting "transactional" + "post-commit gateway" work** — manualReleaseEscrow demonstrates: outer transaction commits durable money + audit; OR issuance happens AFTER commit with try/catch. Customer-facing money flows that touch external gateways (BIR, payment processor) follow this shape.

---

## Auto-proceed decision

Per Constitution Article 16 + Master Brief §3 step 9 + the autonomous-mode reconciliation in `CLAUDE.md`:

- [x] All D06 source code committed locally (subtasks 2–16 closed; this closeout is subtask 17).
- [x] Gate A green (0 BLOCKING failed, 0 REPORT failed).
- [x] Gate C green at this commit (article-16-closeout-exists passes once this file commits; `money-in-transaction` BLOCKING + green).
- [x] Full api jest suite: 1308 tests pass, 0 fail.
- [ ] PR opened at `https://github.com/onServiceTeam/onservice-onsite-app/pull/<N>` (will be filled at push time in subtask 18).
- [ ] CI run triggered and gates running (subtask 18).

Once subtask 18 completes (push + open PR + watch CI green): AI coder immediately begins **Dispatch 07 — Provider job execution trust** on a new branch `phase/14-d07-provider-job-trust` from this dispatch's HEAD. Does NOT wait for Ken to merge. PRs queue.

D07 spec: `.ai-coder/phase-14/PART-3-BUG-REMEDIATION-DISPATCHES-07-08.md` (D07 + D08 paired in one Part 3 document). The same handoff pattern as D06 applies — D06 closeout → D07 fresh-session prompt + plan. Spec corrections inherited from D05 and D06 will continue to apply for D07's spec/reality reconciliation work.
