# Audit 2026-05-01 — Phase N Batch 12 — provider-tools, catalog, business

**Status:** 3 service files fully read line-by-line, ~2,135 lines covered.

## Files fully read (3 files, 2,135 lines)

| File | Lines |
|---|---:|
| packages/api/src/services/provider-tools.service.ts | 743 |
| packages/api/src/services/catalog.service.ts | 711 |
| packages/api/src/services/business.service.ts | 681 |

## NEW CRITICAL findings (1)

### CRIT-N05 — saveBookingAddons stores client-supplied addon name + price

**Where found:** packages/api/src/services/catalog.service.ts:677-696

**Understood:**
```ts
export async function saveBookingAddons(
  bookingId: string,
  addons: { addonId: string; name: string; price: number }[],
): Promise<void> {
  ...
  values.push(bookingId, a.addonId, a.name, a.price);
}
```

The service writes the caller-provided `name` and `price` straight into `booking_addons`. Phase 14 D05 / Bug 176 explicitly mandated server-canonical pricing — the service should look up the addon row by `addonId` from `service_addons`, take `name` and `price` from THAT row, and reject if the addon is inactive or not associated with the booking's subcategory.

If the route layer (`booking.routes.ts` or `booking.service.ts`) doesn't do that lookup before calling here, a malicious client can send `[{ addonId: "real-uuid", name: "Free addon", price: 0 }]` and pay zero centavos for an addon that is actually priced at P500. The booking's `total_amount` would be computed off the client values too unless something upstream sums against the canonical lookup.

This is launch-blocking IF the route does not do the canonical lookup. Need to verify booking.service.ts (Phase B partial, not yet re-read) and booking.routes.ts (also not yet read).

**Fix:**
1. Either change `saveBookingAddons` signature to accept ONLY `addonId[]` and have the function do the SELECT against `service_addons`, OR
2. Add a comment that the route MUST validate canonical pricing first AND wrap that with a runtime assertion (e.g., compare submitted `price` against a refetch from `service_addons` and throw on mismatch).
Add a regression test that posts a booking with a manipulated addon price and asserts 400/403.

## NEW MEDIUM findings (12)

### MED-N30 — provider-tools getDemandInsights interpolates platformConfig.timezone into SQL

**Where:** packages/api/src/services/provider-tools.service.ts:338, 353

```ts
EXTRACT(HOUR FROM b.scheduled_at AT TIME ZONE '${platformConfig.timezone}')
```

The timezone is currently a hardcoded literal `'Asia/Manila'` (per platform.config.ts), but the pattern is dangerous: if Phase 17 makes timezone admin-tunable through `platform_settings`, this becomes a SQL injection vector. Should use `$N` parameter binding or pg's built-in timezone APIs.

**Fix:** Switch to parameter binding: `AT TIME ZONE $2` and add timezone as a query param.

### MED-N31 — provider-tools generateReceipt uses platformConfig.commissionRates not platform_settings

**Where:** provider-tools.service.ts:460

```ts
const commissionRate = platformConfig.commissionRates[prov.tier] ?? platformConfig.commissionRates['new']!;
```

Same shape as MED-N06/N07 from earlier batches (commission optimization in admin-analytics) — reads in-process config rather than the live `platform_settings` row that admin can edit. If commission was tuned via admin, receipt math is wrong.

**Fix:** Use `settingsService.getCommissionRate(prov.tier)` like escrow.service.ts does.

### MED-N32 — provider-tools generateReceipt missing 'founding' tier handling

**Where:** provider-tools.service.ts:460

`platformConfig.commissionRates` per Phase K finding does NOT include 'founding' (migration 073 introduced the tier; config not updated). A founding-tier provider gets `'new'` commission shown on their receipt — wrong rate.

**Fix:** Same fix as MED-N31 (settingsService source) covers this. As a defensive measure, also add the 'founding' tier to platformConfig.

### MED-N33 — provider-tools generateReceipt receipt number can collide

**Where:** provider-tools.service.ts:466

```ts
const receiptNumber = `RCP-${year}${month}-${bookingId.slice(0, 8).toUpperCase()}`;
```

Receipt numbers are derived from the first 8 hex chars of the booking UUID. UUID4 birthday collision at 8 hex chars (32 bits) is ~50% at ~77K bookings — very real for a launching marketplace. Two providers with similarly-prefixed booking UUIDs get the same receipt number.

**Fix:** Use the full booking UUID, or use a monotonic per-provider sequence stored in DB, or include the provider ID in the receipt number.

### MED-N34 — provider-tools getEarningsSummary computes pendingEscrow on service_price not net

**Where:** provider-tools.service.ts:163-169

```ts
COALESCE(SUM(b.service_price), 0)::text AS pending
```

Pending escrow is computed on gross `service_price`, not on net (after commission deduction). The provider sees a higher number than they will actually receive when escrow releases. Also, the dashboard's "earned" totals (line 144) are net (post-commission via wallet_transactions), so the units are mixed.

**Fix:** Either (a) compute pending as `service_price * (1 - commissionRate)` for each booking using the provider's tier, or (b) explicitly label this as "gross pending" in the response keys.

### MED-N35 — provider-tools getMonthlySummary status filter excludes 'completed_by_provider'

**Where:** provider-tools.service.ts:553

```ts
AND b.status IN ('confirmed', 'payout_ready', 'paid_out')
```

A booking that has been completed by provider but is still in the auto-confirm window will be filtered out. For BIR monthly reporting, this could under-count income depending on month boundaries. Compare against earningsSummary's filter (line 158) which uses `wt.type = 'escrow_release' AND wt.amount > 0` — different criteria entirely.

**Fix:** Use the same wallet_transactions criterion as `getEarningsSummary` for consistency, or document why the status filter is stricter for BIR.

### MED-N36 — catalog searchServices LIKE LOWER scan

**Where:** catalog.service.ts:567-583

```ts
WHERE LOWER(sc.name) LIKE $1 OR LOWER(c.name) LIKE $1 OR LOWER(sc.description) LIKE $1
```

Sequential scan of `service_subcategories` and `service_categories` per search. No pg_trgm index on lowercased columns. Acceptable for small catalogs; will degrade. Also the leading `%` in the search term defeats any btree index even if added.

**Fix:** Add `gin (LOWER(name) gin_trgm_ops)` indexes or move to Postgres FTS. Document expected catalog size threshold for migration.

### MED-N37 — catalog createCategory has no duplicate-slug check

**Where:** catalog.service.ts:71-97

If two admins simultaneously create categories with names that slug-collide, one INSERT fails on UNIQUE constraint with raw DB error. Better UX: pre-check or catch the unique violation and return a friendly 409.

**Fix:** Wrap the INSERT in a try/catch checking `err.code === '23505'` and rethrow as `createAppError('A category with this name already exists.', 409)`.

### MED-N38 — business createBusinessAccount NOT in a transaction

**Where:** packages/api/src/services/business.service.ts:97-132

Two separate queries: INSERT business_accounts (line 100), then INSERT business_members (line 119). If the second fails (e.g., user_id FK violation), the business_account row exists with NO owner member. Orphan. Phase 14 D06 transactional discipline regression.

**Fix:** Wrap both INSERTs in a single `db.transaction(async (client) => { ... })`.

### MED-N39 — business addMember can't re-add soft-deleted members

**Where:** business.service.ts:269-282

```ts
ON CONFLICT (business_account_id, user_id) DO NOTHING
```

The unique constraint still applies to soft-deleted rows (`deleted_at IS NOT NULL`). When a removed member tries to rejoin, INSERT silently does nothing and the function throws "User is already a member" (line 285). Confusing UX and incorrect state.

**Fix:** Either (a) DELETE soft-deleted rows before INSERT, or (b) UPDATE the existing row to set `deleted_at = NULL` and reset role/permissions. Pattern (b) preserves audit trail (deleted_by, deleted_reason) which is preferable.

### MED-N40 — business addMember does not validate target user exists

**Where:** business.service.ts:269-282

The INSERT relies on FK constraint to fail if `targetUserId` is bogus. Error surfaces as raw `23503` violation instead of a 404 "user not found".

**Fix:** Add `SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL` first, throw 404 on miss.

### MED-N41 — business updateContractStatus only allows active/cancelled

**Where:** business.service.ts:586-616

`status` typed as `'active' | 'cancelled'`. No path to mark expired, suspended, or renewed. Auto-renew logic in `business_contracts.auto_renew` (line 537) has no implementation that consumes it — just stored.

**Fix:** Either implement an auto-renew job in workers.ts (similar to `processRecurringBookings`), or document that auto_renew is a UI-only flag with no system effect.

## POSITIVE findings

1. **Phase 14 D06 transactional discipline confirmed in catalog mutations** — every CRUD function wraps the row write + admin_actions audit insert in `db.transaction(...)`. Bug 237 fix is real.
2. **business.transferOwnership** atomic transfer (lines 393-482) correctly handles owner demotion + new owner promotion + business_accounts.owner_user_id update + audit, all in one transaction with `FOR UPDATE` row lock. Bug 106 fix is real.
3. **business.removeMember** correctly soft-deletes (Bug 105 fix verified) preserving audit FK integrity.
4. **catalog.deleteAddon** uses soft-deactivate (`is_active = FALSE`) instead of hard DELETE, preserving `booking_addons` FK integrity for historical bookings (line 435-477).

## Confirmations of earlier audit findings

- **MED-K (no 'founding' tier in platformConfig.commissionRates)** confirmed at second site (provider-tools generateReceipt + getMonthlySummary).
- **Phase 14 Bug 237 (catalog audit)** confirmed in source.
- **Bug 1271 native fetch** verified — no axios.

## Cumulative running totals (after Phase N Batch 12)

| | Total | Batch 12 additions |
|---|---:|---:|
| **CRITICAL** | **179 + 1 = 180 real** (1 invalidated of 181) | **+1** |
| **MEDIUM** | **513 + 12 = 525** | **+12** |
| Lines fully read | ~115,864 / 146,236 | +2,135 |
| Coverage | **79.2%** | +1.4% |

## Files NOT YET READ — remaining (~88 files, ~25,400 lines)

Top priority for Batch 13:
- compliance.service.ts (678) + vat-report.service.ts (645) + service-area.service.ts (634) — compliance trio
- data-management.service.ts (557) + notification.service.ts (551) + security.service.ts (524) — admin/ops trio
- booking.service.ts (1197) — needs full re-read (Phase B partial)
- auth.routes.ts (977) + booking.routes.ts (1025) + provider.routes.ts (735) — large routes
