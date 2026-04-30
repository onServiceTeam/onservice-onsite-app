# Dispatch 06 — Transactional Audit Completeness — Plan (HANDOFF DOC)

Branch: `phase/14-d06-money-in-transaction`
Started from: master @ `143ce37` (post-D05 merge, tag `v0.14.0-d05-complete`)
Source spec: `.ai-coder/phase-14/PART-3-BUG-REMEDIATION-DISPATCHES-05-06.md` §"Dispatch 06" (lines 1231 to end)
Related: `.ai-coder/CURRENT-DISPATCH` has the numbered subtask list. THIS doc has the lifted technical detail.

---

## Spec corrections inherited from D05 (READ THIS BEFORE PART-3 §06)

The PART-3 source spec was authored against a schema that does not match the actual database. D05 documented 10 corrections in [.ai-coder/dispatches/D05-closeout.md §"Spec corrections applied"](D05-closeout.md). **D06 inherits all 10 — the spec was not rewritten between D05 and D06.** The same divergences apply when reading PART-3 §06.

The corrections that are MOST RELEVANT to D06's transaction wrapping work:

| # | Spec says | Codebase reality | D06 implication |
|---|---|---|---|
| 1 | Table `subcategories` | `service_subcategories` | D06 doesn't touch subcategories directly, but Bug 237 (catalog.service mutations) writes to `service_subcategories` and `service_addons` — use real table names. |
| 2 | `_cents`-suffixed columns | drop the suffix (`base_price`/`min_price`/`max_price`) | Same as above. |
| 5 | Kysely `db.transaction().execute((trx) => ...)` with `trx.updateTable()`, `trx.insertInto()`, etc. | Raw pg via `db.transaction(async (client) => { client.query(...) })` — helper exists at `packages/api/src/models/db.ts:17-37` | **CRITICAL:** every D06 transaction-wrapping example in PART-3 §06 will use Kysely syntax. Translate to the existing `db.transaction(async (client) => { ... })` helper. Do NOT introduce Kysely. The `client` parameter has the same `query<T>()` signature as `db.query<T>()`; just swap `db.query` for `client.query` inside the callback. |
| 6 | Migration 074 + 075 (D06 spec numbering) | 074 already taken by D05 (`074_d05_service_area_bounds_and_settings.sql`). D06 uses **075** (admin_actions full_notes) and **076** (soft-delete columns); plus optional **077** if D06 chooses to address the per-customer promo limit gap that D05 deferred. |
| 8 | Promo column names with `_cents` suffix | `_centavos` suffix; `active` not `is_active`; `usage_limit_total`/`usage_limit_per_customer` not `max_redemptions`/`per_user_limit` | Relevant if D06 adds the `promo_redemptions` table (subtask 4 candidate). The new table joins `promo_codes(usage_limit_per_customer)` for enforcement. |

**Read the D05 closeout's full §"Spec corrections applied" before authoring any D06 code.** It will save the same 30-minute investigation that produced the corrections in D05.

---

## Standing instructions (read before any code)

**This is money-handling code's INTEGRITY layer.** D05 made every money path's PRICE come from the server (no client trust). D06 makes every money path's MUTATION atomic (no partial failure). Together: a request either fully succeeds and the DB reflects the user-visible response, OR it fully fails and the DB is unchanged. There is no third state.

1. **Use the existing `db.transaction(async (client) => ...)` helper.** Do not introduce a new ORM. Do not write raw `BEGIN/COMMIT/ROLLBACK` SQL — the helper already does that with proper rollback-on-throw, COMMIT-on-success, client release in `finally`. See `packages/api/src/models/db.ts:17-37`.

2. **The trx-passing pattern.** Top-level service functions wrap; helper functions accept the `client` parameter. Per the spec (line 1762): "the helper takes `trx` parameter generalizes across all 14 bugs in this dispatch. Use it everywhere."

3. **Tests verify ROLLBACK behavior, not just commit.** For each bug, write at least one test that mocks one query inside the transaction to throw, then asserts the database state is unchanged after the function rejects. This is the core test assertion — happy-path commit tests are necessary but not sufficient. Spec example at lines 1520–1562.

4. **Honesty check at end of dispatch must include 3 partial-failure scenarios manually traced.** Each must end with one of these two statements:
   - "DB state is unchanged from before the request" (all-or-nothing rollback) OR
   - "DB state reflects only the part that committed successfully and the user-visible response is consistent with that."
   No third option. If a scenario can leave the DB in an inconsistent state, the fix is incomplete.

5. **Money-mutation locations to wrap inside `db.transaction`:**
   - `bookings` (INSERT/UPDATE on `service_price`, `total_amount`, `escrow_status`, `status` transitions involving money)
   - `wallets` (UPDATE on `available_balance`, `pending_balance`)
   - `wallet_transactions` (INSERT — the audit row that explains a wallet change)
   - `admin_actions` (INSERT — the audit row for admin-initiated money changes)
   - `notifications` (INSERT alongside money mutations — for user-visible state matching DB state)
   - `change_orders` + `bookings.service_price` updates
   - `tips` + `wallets` + `wallet_transactions`
   - `recurring_instances` + `bookings` (when processRecurringBookings creates an instance)
   - `promo_redemptions` (if subtask 4 lands — closes D05's deferred per-customer limit)

6. **No `client.query(...)` outside of the transaction callback when inside a transactional service function.** A common mistake: half the writes go through `client`, half through the global `db` — only the `client` writes are atomic; `db` writes leak. The `c-constitution-money-in-transaction` gate (introduced by D03, currently REPORT, owned by this dispatch) catches this pattern.

7. **The honesty check + 3 attack scenarios MUST be authored manually**, not generated from a template. Examples to consider:
   - Bug 70 territory: admin releases escrow, wallet update succeeds, but the `admin_actions` audit insert fails. Did the wallet roll back?
   - Bug 71 territory: admin refunds a booking, the customer wallet credit succeeds, but the booking status update fails. Did the wallet credit roll back?
   - Bug 105/106 territory: business owner removes a member, the `business_members` UPDATE succeeds, but the audit row fails. Did the membership row revert?

---

## Bug list (14 entries — Gate B parses this section)

Per PART-3 §06 lines 1818–1832 (the spec's own closeout claim):

- Bug 69 — `cancelBookingAsAdmin` mutates `bookings` + writes `admin_actions` outside transaction — `packages/api/src/services/booking.service.ts:cancelBookingAsAdmin` — test: `packages/api/__tests__/services/booking-cancel-admin-tx.test.ts:bug-69-rolls-back-on-audit-failure`
- Bug 70 — `manualReleaseEscrow` mutates wallet + booking + audit outside transaction — `packages/api/src/services/escrow.service.ts:manualReleaseEscrow` — test: `packages/api/__tests__/services/escrow-manual-release-tx.test.ts:bug-70-rolls-back-on-audit-failure`
- Bug 71 — `refundBookingEscrow` mutates wallet + booking + audit outside transaction — `packages/api/src/services/escrow.service.ts:refundBookingEscrow` — test: `packages/api/__tests__/services/escrow-refund-tx.test.ts:bug-71-rolls-back-on-status-update-failure`
- Bug 78 — `adjustProviderWallet` mutates `wallets` + `wallet_transactions` + `admin_actions` outside transaction — `packages/api/src/services/provider.service.ts:adjustProviderWallet` — test: `packages/api/__tests__/services/provider-wallet-adjust-tx.test.ts:bug-78-rolls-back-on-audit-failure`
- Bug 79 — `updateProviderProfile` mutates `providers` + `admin_actions` outside transaction — `packages/api/src/services/provider.service.ts:updateProviderProfile` — test: `packages/api/__tests__/services/provider-update-tx.test.ts:bug-79-rolls-back`
- Bug 80 — `deleteProviderNote` mutates `provider_notes` + `admin_actions` outside transaction; also depends on migration 076 soft-delete columns — `packages/api/src/services/provider.service.ts:deleteProviderNote` — test: `packages/api/__tests__/services/provider-notes-tx.test.ts:bug-80-soft-delete-rolls-back`
- Bug 82 — `createProviderNote` mutates `provider_notes` + `admin_actions` outside transaction — `packages/api/src/services/provider.service.ts:createProviderNote` — test: `packages/api/__tests__/services/provider-notes-tx.test.ts:bug-82-create-rolls-back`
- Bug 83 — `adminResolveDispute` mutates `disputes` + `bookings` + escrow + audit outside transaction — `packages/api/src/services/dispute.service.ts:adminResolveDispute` — test: `packages/api/__tests__/services/dispute-resolve-tx.test.ts:bug-83-rolls-back`
- Bug 84 — `escalateDispute` mutates `disputes` + audit outside transaction — `packages/api/src/services/dispute.service.ts:escalateDispute` — test: `packages/api/__tests__/services/dispute-escalate-tx.test.ts:bug-84-rolls-back`
- Bug 85 — `sendDisputeMessage` mutates `dispute_messages` + audit outside transaction; depends on migration 075 (`admin_actions.full_notes` column) — `packages/api/src/services/dispute.service.ts:sendDisputeMessage` — test: `packages/api/__tests__/services/dispute-message-tx.test.ts:bug-85-rolls-back`
- Bug 105 — `removeMember` mutates `business_members` + audit outside transaction; depends on migration 076 soft-delete — `packages/api/src/services/business.service.ts:removeMember` — test: `packages/api/__tests__/services/business-remove-member-tx.test.ts:bug-105-soft-delete-rolls-back`
- Bug 106 — `transferOwnership` mutates two `business_members` rows + `businesses.owner_id` + audit outside transaction — `packages/api/src/services/business.service.ts:transferOwnership` — test: `packages/api/__tests__/services/business-transfer-tx.test.ts:bug-106-rolls-back`
- Bug 127 — `deleteRole` mutates `admin_roles` + dependent role-assignments + audit outside transaction; depends on migration 076 soft-delete — `packages/api/src/services/roles.service.ts:deleteRole` — test: `packages/api/__tests__/services/roles-delete-tx.test.ts:bug-127-soft-delete-rolls-back`
- Bug 237 — `catalog.service.*` mutations (categories + subcategories + addons CRUD) write multiple rows + audit outside transaction — `packages/api/src/services/catalog.service.ts:* mutating functions` (likely `createSubcategory`, `updateSubcategory`, `deleteSubcategory`, `createCategory`, etc.) — test: `packages/api/__tests__/services/catalog-mutation-tx.test.ts:bug-237-rolls-back-on-audit-failure`

**Pre-implementation verification (subtask 1 work):** the file:line citations above are derived from the spec's bug list at lines 1818–1832. The fresh session must verify each named function actually exists in the cited service file at HEAD `143ce37`. If a function has been renamed or moved (e.g., `cancelBookingAsAdmin` may now live in a sub-service), update the citations accordingly and document in the closeout's §"Spec corrections applied" extension.

---

## Transaction-wrapping pattern (CANONICAL — use this everywhere)

The existing helper at `packages/api/src/models/db.ts:17-37`:

```ts
export const db = {
  query: <T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>> => {
    return pool.query<T>(text, params);
  },

  transaction: async <T>(
    callback: (client: {
      query: <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<QueryResult<R>>;
    }) => Promise<T>,
  ): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback({
        query: <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => client.query<R>(text, params),
      });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
};
```

The pattern in service code (translation of the Kysely-style spec to actual reality):

```ts
// BEFORE (current state — Bug 70 example):
export async function manualReleaseEscrow(bookingId: string, adminId: string) {
  const booking = await db.query<...>(`SELECT ... FROM bookings WHERE id = $1`, [bookingId]);
  // ...
  await db.query(`UPDATE wallets SET available_balance = available_balance + $1 WHERE id = $2`, [amount, walletId]);
  await db.query(`INSERT INTO wallet_transactions (...) VALUES (...)`, [...]);
  await db.query(`UPDATE bookings SET escrow_status = 'released' WHERE id = $1`, [bookingId]);
  await db.query(`INSERT INTO admin_actions (...) VALUES (...)`, [...]);  // <- if this fails, the above 3 leak
}

// AFTER (D06 fix):
export async function manualReleaseEscrow(bookingId: string, adminId: string) {
  // SELECTs may run outside the transaction — no mutation risk.
  const booking = await db.query<...>(`SELECT ... FROM bookings WHERE id = $1`, [bookingId]);
  // Validate, derive amount, etc.

  return db.transaction(async (client) => {
    // Re-read inside the transaction for FOR UPDATE locking on wallet:
    const lockedWallet = await client.query<...>(
      `SELECT id, available_balance FROM wallets WHERE id = $1 FOR UPDATE`,
      [walletId],
    );
    await client.query(
      `UPDATE wallets SET available_balance = available_balance + $1 WHERE id = $2`,
      [amount, walletId],
    );
    await client.query(
      `INSERT INTO wallet_transactions (...) VALUES (...)`,
      [...],
    );
    await client.query(
      `UPDATE bookings SET escrow_status = 'released' WHERE id = $1`,
      [bookingId],
    );
    await client.query(
      `INSERT INTO admin_actions (...) VALUES (...)`,
      [...],
    );
    return { released: true, walletBalance: ... };
  });
}
```

**Helper functions**: when a service function is a helper called inside a transaction, change its signature to accept the client:

```ts
// BEFORE:
export async function logAdminAction(adminId: string, type: string, details: object) {
  await db.query(`INSERT INTO admin_actions (...) VALUES (...)`, [...]);
}

// AFTER:
export async function logAdminAction(
  client: { query: typeof db.query },  // or import the type from models/db
  adminId: string,
  type: string,
  details: object,
) {
  await client.query(`INSERT INTO admin_actions (...) VALUES (...)`, [...]);
}
```

The caller passes its own `client` parameter into the helper. Helpers that are sometimes called inside a transaction and sometimes not should be split into two functions OR accept an optional `client?: {query}` defaulting to `db`.

---

## Migration list

- **Migration 075** — `075_admin_actions_full_notes.sql`: add `full_notes TEXT` column to `admin_actions` (Bug 85 needs to store the full dispute message body in the audit row, not just a truncated summary). Test: `packages/api/__tests__/migrations/075-admin-actions-full-notes.test.ts`.
- **Migration 076** — `076_soft_delete_columns.sql`: add `deleted_at TIMESTAMPTZ`, `deleted_by UUID`, `deleted_reason TEXT` to `provider_notes`, `business_members`, `admin_roles` (Bugs 80, 105, 127 use soft-delete instead of DELETE so the audit row + the deletion stay in the same transaction without orphaning the FK). Test: `packages/api/__tests__/migrations/076-soft-delete-columns.test.ts`.
- **(Optional) Migration 077** — `077_promo_redemptions.sql`: closes D05's deferred per-customer promo limit (D05 closeout §"Open questions" item 1). Schema: `promo_redemptions(id UUID PK, promo_code_id UUID FK, user_id UUID FK, booking_id UUID FK, amount_centavos INTEGER, redeemed_at TIMESTAMPTZ DEFAULT NOW())` + index on `(promo_code_id, user_id)`. Closes the D05-flagged gap. **Decision for fresh session: include or defer?** Including means promo.service.resolvePromo can finally enforce `usage_limit_per_customer` AND the booking-creation transaction (Bug 175/176 path, NOT a D06 bug) gets one extra writes inside it. Deferring means D07+ does this.

---

## Cross-cutting concerns with D05

D05 modified these files; D06 will modify SOME of them again. List the conflict-risk areas explicitly so the fresh session can plan the rebase / merge resolution:

- **`packages/api/src/services/booking.service.ts`** — D05 modified `createBooking` (Bug 175/176) and `createChangeOrder` (Bug 1219). D06 modifies `cancelBookingAsAdmin` (Bug 69). Different functions in the same file. Low conflict risk.
- **`packages/api/src/services/provider.service.ts`** — D05 modified `addProviderService` (Bug 1230). D06 modifies `adjustProviderWallet` (Bug 78), `updateProviderProfile` (Bug 79), `deleteProviderNote` (Bug 80), `createProviderNote` (Bug 82). Different functions. Low conflict risk.
- **`packages/api/src/services/recurring.service.ts`** — D05 modified `createRecurringBooking` (Bug 208). D06 may modify `processRecurringBookings` (the daily job that creates booking instances) IF the spec lists it (verify in subtask 1) — `processRecurringBookings` does multi-table writes (insert booking + insert recurring_instance + update recurring_booking) without a transaction. Not on the 14-bug list but a real money-in-transaction violation; flag in the closeout if not included.
- **`packages/api/src/services/tip.service.ts`** — D05 modified `sendTip` (Bug 417). D06 doesn't touch tips per the spec — `sendTip` already wraps writes in `db.transaction` at line 63. Verify in subtask 1.
- **`packages/api/src/services/booking/{pricing,promo,surge,from-quote}.service.ts`** — D05's new pure-resolver services. D06 does NOT modify these. They are READ-ONLY price resolvers that don't mutate. The CALLERS (e.g., `booking.service.createBooking`) are what D06 may need to wrap if they're on the bug list — but `createBooking` is NOT in the 14, so D06 leaves it alone. **Boundary clarification:** D06 modifies route handlers / service functions that perform money MUTATIONS, not the price-resolver services from D05.
- **`packages/api/src/services/marketing-admin.service.ts`** — D05 modified `createPromoCode`. D06 doesn't touch this per the spec.
- **`packages/api/src/services/catalog.service.ts`** — D05 didn't touch this directly (touched `routes/catalog.routes.ts`). D06 modifies `catalog.service.ts` mutations (Bug 237). No D05 conflict.

**Rebase risk: low.** Most D06 changes are in functions D05 didn't modify. The single overlap (provider.service.ts file) is at function level — D05 added bounds enforcement to `addProviderService`, D06 wraps `adjustProviderWallet` in a transaction. Same file, different exports.

**One additional flag:** D05's `booking.service.createBooking` does multi-row INSERT (booking + N booking_addons) WITHOUT a transaction. If addon insert fails after booking insert succeeds, partial state. **This is a real D06-class bug not on the 14-bug list.** The fresh session may include it as Bug-d06-extra-create-booking-tx (mark in closeout), or defer to a follow-up dispatch with a written justification.

---

## Subtask list (run sequentially; each is a coherent commit)

Mirrors D05's 18-subtask structure. Subtask 1 = read+verify; subtasks 2–4 = migrations + supporting infra; subtasks 5–15 = 14 bug fixes (some grouped by file); subtask 16 = gate promotion; subtask 17 = closeout; subtask 18 = full audit chain + push + PR.

1. **Read + verify state.** Read `D05-closeout.md` §"Spec corrections applied" first. Read `EXECUTION-DISCIPLINE.md`, `AUTONOMOUS-EXECUTION-PROTOCOL.md`, this plan doc. Verify branch is `phase/14-d06-money-in-transaction` from master HEAD `143ce37`. Run `bash scripts/gates/run-gate-a.sh` and `bash scripts/gates/c-constitution.sh` — expect both green except `article-16-closeout-exists` BLOCKING (mid-dispatch normal). Verify `gate_c_articles.money-in-transaction` is REPORT in `MODES.json`. **Verify each function on the 14-bug list actually exists at the cited file:line at master HEAD.** Document any spec/reality mismatches in a §"Spec corrections inherited + extended" addendum to this plan. Resolve the optional Migration 077 decision (include for D06, defer to D07, or skip).
2. **Migration 075 — admin_actions.full_notes column.** Path: `packages/api/migrations/075_admin_actions_full_notes.sql`. Test: `packages/api/__tests__/migrations/075-admin-actions-full-notes.test.ts`. Commit: `feat(d06): migration 075 — admin_actions.full_notes for Bug 85`.
3. **Migration 076 — soft-delete columns.** Path: `packages/api/migrations/076_soft_delete_columns.sql`. Test: `packages/api/__tests__/migrations/076-soft-delete-columns.test.ts`. Commit: `feat(d06): migration 076 — soft-delete columns for Bugs 80, 105, 127`.
4. **(Optional) Migration 077 — promo_redemptions table** (per subtask 1's decision). Commit: `feat(d06): migration 077 — promo_redemptions for D05 deferred per-customer enforcement`. Skip subtask if the decision was defer.
5. **Bug 69 — cancelBookingAsAdmin in db.transaction.** Files: `packages/api/src/services/booking.service.ts`. Test: per the bug list above. Commit: `fix(d06): wrap cancelBookingAsAdmin in db.transaction — Bug 69`.
6. **Bug 70 — manualReleaseEscrow in db.transaction.** Files: `packages/api/src/services/escrow.service.ts`. Test: per bug list. Commit: `fix(d06): wrap manualReleaseEscrow in db.transaction — Bug 70`.
7. **Bug 71 — refundBookingEscrow in db.transaction.** Files: `packages/api/src/services/escrow.service.ts`. Test: per bug list. Commit: `fix(d06): wrap refundBookingEscrow in db.transaction — Bug 71`.
8. **Bug 78 — adjustProviderWallet in db.transaction.** Files: `packages/api/src/services/provider.service.ts`. Test: per bug list. Commit: `fix(d06): wrap adjustProviderWallet in db.transaction — Bug 78`.
9. **Bugs 79 + 80 + 82 — provider notes lifecycle in db.transaction.** Files: `packages/api/src/services/provider.service.ts` (3 functions). Tests: per bug list. Commit: `fix(d06): wrap provider notes CRUD in db.transaction — Bug 79 + 80 + 82`.
10. **Bug 83 — adminResolveDispute in db.transaction.** Files: `packages/api/src/services/dispute.service.ts`. Test: per bug list. Commit: `fix(d06): wrap adminResolveDispute in db.transaction — Bug 83`.
11. **Bugs 84 + 85 — escalateDispute + sendDisputeMessage in db.transaction.** Files: `packages/api/src/services/dispute.service.ts` (2 functions). Bug 85 also depends on migration 075. Tests: per bug list. Commit: `fix(d06): wrap dispute escalate + message in db.transaction — Bug 84 + 85`.
12. **Bug 105 — removeMember in db.transaction (soft delete).** Files: `packages/api/src/services/business.service.ts`. Depends on migration 076. Test: per bug list. Commit: `fix(d06): wrap business.removeMember in db.transaction (soft delete) — Bug 105`.
13. **Bug 106 — transferOwnership in db.transaction.** Files: `packages/api/src/services/business.service.ts`. Test: per bug list. Commit: `fix(d06): wrap business.transferOwnership in db.transaction — Bug 106`.
14. **Bug 127 — deleteRole in db.transaction (soft delete).** Files: `packages/api/src/services/roles.service.ts`. Depends on migration 076. Test: per bug list. Commit: `fix(d06): wrap roles.deleteRole in db.transaction (soft delete) — Bug 127`.
15. **Bug 237 — catalog.service.* mutations in db.transaction.** Files: `packages/api/src/services/catalog.service.ts` (multiple mutating functions — verify exact set in subtask 1). Tests: per bug list. Commit: `fix(d06): wrap catalog.service mutations in db.transaction — Bug 237`.
16. **Promote `gate_c_articles.money-in-transaction` to BLOCKING.** Update `scripts/gates/MODES.json` (mode REPORT → BLOCKING, set `promoted_in: "D06"`, update rationale). Update `scripts/gates/EXPECTED-FAILURES.md` (move from "expected to fail" to "now passing", update timeline). **CRITICAL ORDERING:** subtask 16 MUST be last before closeout. Verify locally that `bash scripts/gates/c-constitution.sh` reports `money-in-transaction` passing (the gate checks each money-mutation site is inside `db.transaction(`) before flipping the mode. Commit: `chore(d06): promote money-in-transaction to BLOCKING`.
17. **Write D06 closeout** at `.ai-coder/dispatches/D06-closeout.md`. Bug list (14 entries with file:line + test) + §"Spec corrections inherited" (link to D05's mapping + any D06 extensions found in subtask 1) + §"Honesty check — 3 partial-failure scenarios manually traced" (one per category: admin-action audit failure, soft-delete + audit consistency, multi-row mutation atomicity) + §"Open questions / known limitations" + §"What dispatches D07+ now have available." Commit: `docs(d06): closeout`.
18. **Run full local audit chain** (gates A–E + full api jest suite). Push. Open PR titled `Dispatch 06 — Transactional audit completeness (14 money-in-transaction bugs + new BLOCKING gate)`. Watch CI. Once green, autoproceed to D07 per autonomous protocol (Constitution Article 16 + Master Brief §3 step 9). D07 spec is at `.ai-coder/phase-14/PART-3-BUG-REMEDIATION-DISPATCHES-07-08.md` (provider job execution trust, ~14 bugs).

---

## Definition of done (D06 closeout passes Gate B + audit chain)

1. All 14 bugs above have a closing commit with `Bug NNNN` in the message AND a test in `packages/api/__tests__/` that references the bug number.
2. Migrations 075 + 076 (and optionally 077) are applied; their migration tests pass.
3. Gate `gate_c_articles.money-in-transaction` is BLOCKING in `MODES.json` AND passing locally on this branch.
4. All 5 gates pass on the open PR: A, B, C, D, E + gates-summary.
5. Honesty check at end of closeout includes 3 partial-failure scenarios manually traced — each ends with one of the two acceptable DB-state statements per standing instruction §4.
6. The §"Spec corrections inherited" section in the closeout enumerates each D05 correction that affected D06 implementation, with a one-sentence note on how D06 honored it.
7. `LAUNCH-LIMITATIONS.md` does NOT need a new section (D06 is internal mutation correctness, not a customer-visible deferral).

---

## Notes for fresh session

- D05 + tag `v0.14.0-d05-complete` are on master at `143ce37`. Branch protection restored (enforce_admins=true, 1 review, conversation_resolution=true).
- The atomic relax-merge-restore pattern documented in D01-final-closeout.md and used in D02–D05 is available for D06's self-merge: payloads can be regenerated from `gh api repos/onServiceTeam/onservice-onsite-app/branches/master/protection` plus a Python transform (see this session's transcript for the working snippet).
- The Gate B SIGPIPE fix (D05 chore commit) is on master; D06's CI runs benefit from it automatically.
- Don't skim the spec corrections inherited section — D05 spent ~30 minutes deriving the 10 corrections. D06 inherits them all.
- The 5 hard stops still apply (verify-master non-zero ×3 attempts, architectural decision, money/compliance risk, production data risk, spec contradiction). The most likely halt point is subtask 1's verification step: if a function on the bug list has been renamed or moved, write a §"Spec corrections inherited + extended" addendum and proceed. If a 14-bug-list function literally doesn't exist anywhere in the codebase, that's Stop 5 — escalate.
- Open the D06 PR titled `Dispatch 06 — Transactional audit completeness (14 money-in-transaction bugs + new BLOCKING gate)`.
