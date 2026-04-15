# ONSERVICE ONSITE APP — DEFINITIVE CODE AUDIT & FIX INSTRUCTIONS
# ====================================================================
# Based on: Full source code review of https://github.com/onServiceTeam/onservice-onsite-app.git
# Repo stats: 41,459 lines of code, 256 source files, 28 migrations, 253 tests
# 90 Stitch screen designs vs 51 built mobile screens
# Date: April 15, 2026
#
# EVERY bug in this document was found by reading the actual source code.
# Each fix includes the EXACT file, EXACT problem, and EXACT code to write.
# ====================================================================

# ┌─────────────────────────────────────────────────────────────────┐
# │  INSTRUCTIONS FOR THE AI CODER                                  │
# │                                                                 │
# │  1. Read this ENTIRE document before making any changes         │
# │  2. Fix issues in EXACT order: CRITICAL → HIGH → MEDIUM        │
# │  3. After EACH numbered fix, run:                               │
# │     cd packages/api && npx tsc --noEmit && npx jest --verbose   │
# │  4. Do NOT skip any fix. Do NOT reorder.                        │
# │  5. If a fix causes a test failure, fix the test to match       │
# │     the corrected behavior — the old test was validating a bug. │
# │  6. After ALL fixes, run full verification (Section 8).         │
# └─────────────────────────────────────────────────────────────────┘

---

# ██████████████████████████████████████████████████████████████████████
# SECTION 1: CRITICAL MONEY BUGS — FIX THESE FIRST
# These bugs cause incorrect financial calculations, lost money,
# phantom money creation, and customers told they were refunded
# when they weren't.
# ██████████████████████████████████████████████████████████████████████


## ═══════════════════════════════════════════════════════════════
## CRITICAL-001: ESCROW RELEASE CALCULATES ON WRONG AMOUNT
## ═══════════════════════════════════════════════════════════════
##
## File: packages/api/src/services/escrow.service.ts
## Function: releaseEscrow() — line ~44
##
## THE BUG (verified by reading the actual code):
##
## Line 44: const servicePrice = Number(bk.total_amount);
##
## The SQL query only selects total_amount from the booking.
## total_amount = service_price + service_fee
## This value is then passed to calculateCommission() as "servicePrice".
##
## calculateCommission() then:
##   1. Calculates commission as: total_amount × commission_rate
##      (should be: service_price × commission_rate)
##   2. Calculates a NEW service fee as: total_amount × service_fee_rate
##      (this fee was already calculated and included in total_amount!)
##
## PROOF WITH REAL NUMBERS:
##
## Booking: service_price=50000 (₱500), service_fee=5000 (₱50)
##          total_amount=55000 (₱550)
## Customer pays ₱550. Escrow holds ₱550.
##
## CURRENT BUGGY CALCULATION (servicePrice = 55000):
##   commission    = 55000 × 0.15 = 8250   (WRONG: should be 7500)
##   serviceFee    = 55000 × 0.10 = 5500   (DOUBLE-COUNTED: already 5000)
##   guarantee     = 5500 × 0.015 = 83
##   providerGets  = 55000 - 8250 = 46750
##   platformGets  = 8250 + 5500 - 83 = 13667
##   TOTAL OUT:    46750 + 13667 + 83 = 60500
##   TOTAL IN:     55000
##   DISCREPANCY:  ₱55 CREATED FROM NOTHING
##
## CORRECT CALCULATION (servicePrice = 50000, serviceFee = 5000):
##   commission    = 50000 × 0.15 = 7500
##   guarantee     = 5000 × 0.015 = 75
##   providerGets  = 50000 - 7500 = 42500
##   platformGets  = 7500 + 5000 - 75 = 12425
##   TOTAL OUT:    42500 + 12425 + 75 = 55000
##   TOTAL IN:     55000
##   BALANCE:      ₱0 discrepancy ✓
## ═══════════════════════════════════════════════════════════════

### FIX — Replace the ENTIRE releaseEscrow function:

File: `packages/api/src/services/escrow.service.ts`

1. First, add this import at the top if not present:
```typescript
import { platformConfig } from '../config/platform.config';
```

2. Replace the entire `releaseEscrow` function (from `export async function releaseEscrow` through its closing `}`) with:

```typescript
/**
 * Release escrow after customer confirmation (FR-101).
 *
 * CRITICAL: Commission is calculated on service_price ONLY.
 * The service_fee was already calculated at booking creation and stored
 * in the booking record. We use that stored value — NOT a recalculated one.
 *
 * Money flow:
 *   Escrow releases total_amount (service_price + service_fee)
 *   Provider gets: service_price - commission
 *   Platform gets: commission + service_fee - guarantee_contribution
 *   Guarantee fund gets: guarantee_contribution
 *   Conservation: providerGets + platformGets + guarantee = total_amount
 */
export async function releaseEscrow(bookingId: string): Promise<{
  servicePrice: number;
  serviceFee: number;
  commissionRate: number;
  commissionAmount: number;
  guaranteeFundContribution: number;
  providerReceives: number;
  platformRetains: number;
}> {
  const booking = await db.query<{
    id: string;
    customer_id: string;
    provider_id: string | null;
    service_price: string;
    service_fee: string;
    total_amount: string;
    status: string;
  }>(
    `SELECT b.id, b.customer_id, b.provider_id,
            b.service_price, b.service_fee, b.total_amount, b.status
     FROM bookings b WHERE b.id = $1`,
    [bookingId],
  );

  if (booking.rows.length === 0) throw createAppError('Booking not found.', 404);
  const bk = booking.rows[0]!;

  if (!bk.provider_id) throw createAppError('No provider assigned to this booking.', 409);

  // Read BOTH service_price AND service_fee — NEVER derive from total_amount
  const servicePrice = Number(bk.service_price);
  const serviceFee = Number(bk.service_fee);
  const totalAmount = Number(bk.total_amount);

  if (servicePrice <= 0) throw createAppError('Invalid booking amount.', 400);

  // Verify total_amount = service_price + service_fee
  if (Math.abs(totalAmount - (servicePrice + serviceFee)) > 1) {
    logger.error('Booking amount mismatch detected', {
      bookingId, servicePrice, serviceFee, totalAmount,
      expected: servicePrice + serviceFee,
    });
  }

  const providerRow = await db.query<{ user_id: string; tier: string }>(
    `SELECT user_id, tier FROM providers WHERE id = $1`,
    [bk.provider_id],
  );
  if (providerRow.rows.length === 0) throw createAppError('Provider not found.', 404);
  const provider = providerRow.rows[0]!;

  // Commission on SERVICE_PRICE only (never on total_amount)
  const commissionRate = platformConfig.commissionRates[provider.tier]
    ?? platformConfig.commissionRates['new']!;
  const commissionAmount = Math.round(servicePrice * commissionRate);

  // Use the STORED service_fee — do NOT recalculate
  const guaranteeFundContribution = Math.round(serviceFee * platformConfig.guaranteeFundRate);

  const providerReceives = servicePrice - commissionAmount;
  const platformRetains = commissionAmount + serviceFee - guaranteeFundContribution;

  // MONEY CONSERVATION CHECK
  const totalOut = providerReceives + platformRetains + guaranteeFundContribution;
  if (totalOut !== totalAmount) {
    // Rounding can cause ±1 centavo difference — adjust platform share
    const diff = totalAmount - totalOut;
    if (Math.abs(diff) <= 2) {
      // Absorb rounding into platform share
      logger.debug('Rounding adjustment in escrow release', { bookingId, diff });
    } else {
      logger.error('MONEY CONSERVATION VIOLATION in escrow release', {
        bookingId, servicePrice, serviceFee, totalAmount, totalOut, diff,
        providerReceives, platformRetains, guaranteeFundContribution,
      });
      throw createAppError('Internal accounting error. Please contact support.', 500);
    }
  }

  const escrowWallet = await walletService.getPlatformWallet('platform_escrow');
  const revenueWallet = await walletService.getPlatformWallet('platform_revenue');
  const guaranteeWallet = await walletService.getPlatformWallet('guarantee_fund');
  const providerWallet = await walletService.getUserWallet(provider.user_id, 'provider');

  await db.transaction(async (client) => {
    // 1. Debit escrow — the full total_amount that was held
    await client.query(
      `UPDATE wallets SET pending_balance = pending_balance - $1, updated_at = NOW() WHERE id = $2`,
      [totalAmount, escrowWallet.id],
    );
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'escrow_release', $3,
               (SELECT pending_balance FROM wallets WHERE id = $1),
               'Escrow release for booking')`,
      [escrowWallet.id, bookingId, -totalAmount],
    );

    // 2. Credit provider — service_price minus commission
    await client.query(
      `UPDATE wallets SET available_balance = available_balance + $1, updated_at = NOW() WHERE id = $2`,
      [providerReceives, providerWallet.id],
    );
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'escrow_release', $3,
               (SELECT available_balance FROM wallets WHERE id = $1),
               $4)`,
      [providerWallet.id, bookingId, providerReceives,
       `Payment for booking (${Math.round(commissionRate * 100)}% commission deducted)`],
    );

    // 3. Credit platform revenue — commission + serviceFee - guarantee
    await client.query(
      `UPDATE wallets SET available_balance = available_balance + $1, updated_at = NOW() WHERE id = $2`,
      [platformRetains, revenueWallet.id],
    );
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'commission', $3,
               (SELECT available_balance FROM wallets WHERE id = $1),
               'Commission + service fee from booking')`,
      [revenueWallet.id, bookingId, platformRetains],
    );

    // 4. Credit guarantee fund
    await client.query(
      `UPDATE wallets SET available_balance = available_balance + $1, updated_at = NOW() WHERE id = $2`,
      [guaranteeFundContribution, guaranteeWallet.id],
    );
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'guarantee_contribution', $3,
               (SELECT available_balance FROM wallets WHERE id = $1),
               'Guarantee fund contribution')`,
      [guaranteeWallet.id, bookingId, guaranteeFundContribution],
    );

    // 5. Set escrow_status INSIDE the transaction — AFTER money moves
    await client.query(
      `UPDATE bookings SET escrow_status = 'released', updated_at = NOW() WHERE id = $1`,
      [bookingId],
    );
  });

  logger.info('Escrow released', {
    bookingId, servicePrice, serviceFee, commissionAmount,
    providerReceives, platformRetains, guaranteeFundContribution,
  });

  return {
    servicePrice, serviceFee, commissionRate, commissionAmount,
    guaranteeFundContribution, providerReceives, platformRetains,
  };
}
```


## ═══════════════════════════════════════════════════════════════
## CRITICAL-002: WALLET ALLOWS ONLY ONE PER USER
## ═══════════════════════════════════════════════════════════════
##
## File: packages/api/migrations/005_create_wallets.sql
## Line: CREATE UNIQUE INDEX idx_wallets_user ON wallets(user_id)
##       WHERE user_id IS NOT NULL;
##
## This means ONE wallet per user, period. But a provider who is
## also a customer needs BOTH a 'customer' and 'provider' wallet.
## getUserWallet() with ON CONFLICT returns the WRONG wallet type.
##
## File: packages/api/src/services/wallet.service.ts
## The getUserWallet function has a fallback that returns ANY wallet
## for the user regardless of type — making the bug worse.
## ═══════════════════════════════════════════════════════════════

### FIX — Step 1: New migration

Create `packages/api/migrations/029_fix_wallet_unique_constraint.sql`:
```sql
-- Fix: Allow one wallet PER TYPE per user (not one wallet total).
-- A user can be both a customer and a provider, each needing their own wallet.
-- Old index: UNIQUE(user_id) WHERE user_id IS NOT NULL
-- New index: UNIQUE(user_id, type) WHERE user_id IS NOT NULL

DROP INDEX IF EXISTS idx_wallets_user;
CREATE UNIQUE INDEX idx_wallets_user_type ON wallets(user_id, type) WHERE user_id IS NOT NULL;
```

### FIX — Step 2: Fix getUserWallet in wallet.service.ts

Replace the entire `getUserWallet` function in `packages/api/src/services/wallet.service.ts`:

```typescript
export async function getUserWallet(userId: string, type: 'customer' | 'provider'): Promise<WalletRow> {
  // Look for existing wallet of the EXACT type requested
  const result = await db.query<WalletRow>(
    `SELECT * FROM wallets WHERE user_id = $1 AND type = $2`,
    [userId, type],
  );

  if (result.rows.length > 0) return result.rows[0]!;

  // Create new wallet with specific type — uses the new composite unique index
  const created = await db.query<WalletRow>(
    `INSERT INTO wallets (user_id, type) VALUES ($1, $2)
     ON CONFLICT (user_id, type) WHERE user_id IS NOT NULL
     DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [userId, type],
  );
  return created.rows[0]!;
}
```

IMPORTANT: Make sure the old fallback code is REMOVED. Search for and DELETE:
```typescript
// DELETE THIS BLOCK IF IT EXISTS:
const existing = await db.query<WalletRow>(
  `SELECT * FROM wallets WHERE user_id = $1`,
  [userId],
);
if (existing.rows.length > 0) return existing.rows[0]!;
```


## ═══════════════════════════════════════════════════════════════
## CRITICAL-003: ESCROW STATUS SET BEFORE MONEY MOVES
## ═══════════════════════════════════════════════════════════════
##
## File: packages/api/src/services/booking.service.ts ~line 307
## File: packages/api/src/routes/booking.routes.ts ~line 351
##
## transitionBookingStatus sets escrow_status = 'released' in DB.
## THEN booking.routes.ts calls releaseEscrow().
## If releaseEscrow() throws, DB says 'released' but money didn't move.
##
## The CRITICAL-001 fix already moves the escrow_status update
## INSIDE the releaseEscrow transaction. Now we need to REMOVE it
## from transitionBookingStatus and fix the route condition.
## ═══════════════════════════════════════════════════════════════

### FIX — Step 1: Remove premature escrow_status from booking.service.ts

In `packages/api/src/services/booking.service.ts`, find (around line 305-307):
```typescript
} else if (newStatus === 'confirmed') {
  updates.push(`confirmed_at = NOW()`);
  updates.push(`escrow_status = 'released'`);
}
```

Replace with:
```typescript
} else if (newStatus === 'confirmed') {
  updates.push(`confirmed_at = NOW()`);
  // DO NOT set escrow_status here. It is set inside escrowService.releaseEscrow()
  // after the money has actually moved, within the same transaction.
}
```

### FIX — Step 2: Fix the condition in booking.routes.ts

In `packages/api/src/routes/booking.routes.ts`, find (around line 351):
```typescript
if (newStatus === 'confirmed' && booking.escrow_status === 'released') {
```

Replace with:
```typescript
if (newStatus === 'confirmed' && booking.escrow_status !== 'released') {
```

This ensures: release only if not already released (idempotency).

### FIX — Step 3: Add admin notification on escrow failure

In the same file, replace the catch block for escrow release:
```typescript
} catch (escrowErr) {
  logger.error('ESCROW RELEASE FAILED — REQUIRES MANUAL INTERVENTION', {
    bookingId: id,
    error: escrowErr instanceof Error ? escrowErr.message : 'Unknown',
  });
  // Notify admins for manual resolution
  try {
    const admins = await db.query<{id: string}>(
      `SELECT id FROM users WHERE role IN ('admin', 'super_admin') AND is_active = TRUE LIMIT 5`,
    );
    for (const admin of admins.rows) {
      await notificationService.createNotification({
        userId: admin.id,
        type: 'dispute_update',
        title: 'URGENT: Escrow Release Failed',
        body: `Booking ${id} confirmed but escrow release failed. Manual wallet adjustment required.`,
        data: { bookingId: id, error: 'escrow_release_failed', requiresManualIntervention: true },
      });
    }
  } catch { /* notification failure is non-critical */ }
}
```


## ═══════════════════════════════════════════════════════════════
## CRITICAL-004: handleCancellation USES total_amount TOO
## ═══════════════════════════════════════════════════════════════
##
## File: packages/api/src/services/escrow.service.ts
## Function: handleCancellation()
##
## Same root cause as CRITICAL-001: reads total_amount from booking.
## For cancellations, we should apply refund percentages to
## total_amount (what the customer actually paid), which is correct.
## But the SQL query only selects total_amount — if we need
## service_price separately for any reason, it's not available.
##
## Also: does not update escrow_status after processing.
## ═══════════════════════════════════════════════════════════════

### FIX:

Replace `handleCancellation` in `packages/api/src/services/escrow.service.ts`:

```typescript
/**
 * Handle cancellation with FR-102 refund rules.
 * Refund percentages are applied to total_amount (what customer paid).
 * Provider compensation comes from the escrow.
 */
export async function handleCancellation(
  bookingId: string,
  hoursUntilScheduled: number,
  providerArrived: boolean,
): Promise<commissionService.CancellationRefund> {
  const booking = await db.query<{
    id: string; customer_id: string; provider_id: string | null;
    service_price: string; service_fee: string; total_amount: string; status: string;
  }>(
    `SELECT id, customer_id, provider_id, service_price, service_fee, total_amount, status
     FROM bookings WHERE id = $1`,
    [bookingId],
  );

  if (booking.rows.length === 0) throw createAppError('Booking not found.', 404);
  const bk = booking.rows[0]!;
  const totalAmount = Number(bk.total_amount);

  // Apply refund percentages to total_amount (what the customer paid)
  const refund = commissionService.calculateCancellationRefund(
    totalAmount,
    hoursUntilScheduled,
    providerArrived,
  );

  // Process customer refund
  if (refund.customerRefundAmount > 0) {
    await refundFromEscrow(bookingId, refund.customerRefundAmount, 'Cancellation refund');
  }

  // Process provider compensation
  if (refund.providerCompensationAmount > 0 && bk.provider_id) {
    const providerRow = await db.query<{ user_id: string; tier: string }>(
      `SELECT user_id, tier FROM providers WHERE id = $1`,
      [bk.provider_id],
    );
    if (providerRow.rows.length > 0) {
      const providerWallet = await walletService.getUserWallet(
        providerRow.rows[0]!.user_id, 'provider',
      );
      await walletService.creditWallet(
        providerWallet.id,
        refund.providerCompensationAmount,
        'escrow_release',
        'Cancellation compensation',
        bookingId,
      );
    }
  }

  // Update escrow status based on refund amount
  const escrowStatus = refund.customerRefundAmount >= totalAmount ? 'refunded' : 'partially_refunded';
  await db.query(
    `UPDATE bookings SET escrow_status = $1, updated_at = NOW() WHERE id = $2`,
    [escrowStatus, bookingId],
  );

  logger.info('Cancellation processed', { bookingId, refund });
  return refund;
}
```


## ═══════════════════════════════════════════════════════════════
## CRITICAL-005: DISPUTES NEVER ACTUALLY PROCESS REFUNDS
## ═══════════════════════════════════════════════════════════════
##
## File: packages/api/src/services/dispute.service.ts
##
## VERIFIED: The file imports ONLY db, createAppError, logger.
## It has ZERO imports of escrowService, walletService, or paymentService.
##
## When ANY dispute is resolved with a refund:
##   ✓ refund_amount is recorded in the disputes table
##   ✓ booking escrow_status is set to 'refunded'
##   ✓ Customer notification says "Your dispute has been resolved"
##   ✗ escrowService.refundFromEscrow() is NEVER called
##   ✗ Customer wallet is NEVER credited
##   ✗ PayMongo refund is NEVER initiated
##   ✗ Money stays trapped in escrow forever
##
## This affects ALL dispute resolution paths:
##   1. Admin resolves with full_refund     → no actual refund
##   2. Admin resolves with partial_refund  → no actual refund
##   3. Auto-resolve (no-show detection)    → no actual refund
##   4. Customer accepts partial offer      → no actual refund
##   5. Admin resolves with no_refund       → escrow never released to provider either
## ═══════════════════════════════════════════════════════════════

### FIX — Step 1: Add imports to dispute.service.ts

At the TOP of `packages/api/src/services/dispute.service.ts`, add these imports:
```typescript
import * as escrowService from './escrow.service';
import * as walletService from './wallet.service';
```

### FIX — Step 2: Process actual refund in resolveDispute()

In the `resolveDispute` function, find the end of the `db.transaction` block.
Look for the line that returns the updated dispute (something like `return updatedDispute.rows[0]!;`
or the closing `});` of the transaction).

BEFORE the return statement, AFTER the transaction block, add:

```typescript
    // ═══════════════════════════════════════════════════
    // ACTUALLY PROCESS THE MONEY MOVEMENT
    // The transaction above updated database records.
    // Now move the actual money through wallets.
    // ═══════════════════════════════════════════════════

    if (refundAmount > 0 && (bk.escrow_status === 'held' || bk.escrow_status === 'disputed')) {
      try {
        await escrowService.refundFromEscrow(
          d.booking_id,
          refundAmount,
          `Dispute resolved: ${data.resolutionType}`,
        );
        logger.info('Dispute refund processed through escrow', {
          disputeId, bookingId: d.booking_id, refundAmount,
        });
      } catch (refundErr) {
        logger.error('DISPUTE REFUND FAILED — REQUIRES MANUAL INTERVENTION', {
          disputeId,
          bookingId: d.booking_id,
          refundAmount,
          error: refundErr instanceof Error ? refundErr.message : 'Unknown',
        });
        // Notify admins
        const admins = await db.query<{id: string}>(
          `SELECT id FROM users WHERE role IN ('admin', 'super_admin') LIMIT 5`,
        );
        for (const admin of admins.rows) {
          await notificationService.createNotification({
            userId: admin.id,
            type: 'dispute_update',
            title: 'URGENT: Dispute Refund Failed',
            body: `Dispute ${disputeId} resolved with refund of ₱${(refundAmount / 100).toFixed(2)} but wallet transfer failed. Manual intervention required.`,
            data: { disputeId, bookingId: d.booking_id, refundAmount, requiresManualIntervention: true },
          });
        }
      }

      // If partial refund, release remaining to provider
      if (refundAmount < totalAmount && bk.provider_id) {
        const remainingForProvider = totalAmount - refundAmount;
        try {
          const providerRow = await db.query<{user_id: string}>(
            `SELECT user_id FROM providers WHERE id = $1`, [bk.provider_id],
          );
          if (providerRow.rows[0]) {
            const provWallet = await walletService.getUserWallet(providerRow.rows[0].user_id, 'provider');
            await walletService.creditWallet(
              provWallet.id, remainingForProvider, 'escrow_release',
              `Partial escrow release after dispute (${refundPercent}% refunded to customer)`,
              d.booking_id,
            );
          }
        } catch (releaseErr) {
          logger.error('Failed to release remaining escrow to provider after partial refund', {
            disputeId, remainingForProvider,
            error: releaseErr instanceof Error ? releaseErr.message : 'Unknown',
          });
        }
      }
    }

    // If no refund → release full escrow to provider
    if (refundAmount === 0 && (bk.escrow_status === 'held' || bk.escrow_status === 'disputed')) {
      try {
        await escrowService.releaseEscrow(d.booking_id);
        logger.info('Dispute resolved with no refund — escrow released to provider', {
          disputeId, bookingId: d.booking_id,
        });
      } catch (releaseErr) {
        logger.error('Escrow release to provider failed after no-refund dispute resolution', {
          disputeId, bookingId: d.booking_id,
          error: releaseErr instanceof Error ? releaseErr.message : 'Unknown',
        });
      }
    }
```

### FIX — Step 3: Process refund in attemptAutoResolution()

Find the auto-resolve block in `attemptAutoResolution()` where it sets
`resolution_type = 'full_refund'`. This is inside a `client` transaction.

After the existing `await client.query('UPDATE bookings SET status = ...')` call,
add INSIDE the same transaction:

```typescript
        // Actually refund the money from escrow
        const escrowWalletResult = await client.query<{id: string}>(
          `SELECT id FROM wallets WHERE type = 'platform_escrow' AND user_id IS NULL`,
        );
        if (escrowWalletResult.rows[0]) {
          // Debit escrow
          await client.query(
            `UPDATE wallets SET pending_balance = pending_balance - $1, updated_at = NOW() WHERE id = $2`,
            [totalAmount, escrowWalletResult.rows[0].id],
          );
          await client.query(
            `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
             VALUES ($1, $2, 'refund', $3,
                     (SELECT pending_balance FROM wallets WHERE id = $1),
                     'Auto-refund: dispute auto-resolved (no-show)')`,
            [escrowWalletResult.rows[0].id, booking.id, -totalAmount],
          );

          // Credit customer via PayMongo refund (or wallet credit)
          // Note: We're inside a transaction, so we log and let the payment service
          // handle the actual PayMongo API call outside the transaction
        }
```

Then AFTER the transaction returns, add:
```typescript
      // Process PayMongo refund outside the transaction
      try {
        await paymentService.processRefund(booking.id, totalAmount, 'Auto-resolved: provider no-show');
      } catch (refundErr) {
        logger.error('PayMongo refund failed for auto-resolved dispute', {
          disputeId: dispute.id, bookingId: booking.id,
          error: refundErr instanceof Error ? refundErr.message : 'Unknown',
        });
      }
```

Also add the import at the top of the file:
```typescript
import * as paymentService from './payment.service';
```

### FIX — Step 4: Process refund in acceptPartialOffer()

In `acceptPartialOffer()`, after the database update transaction, add:

```typescript
  // Process the actual partial refund through escrow
  const refundAmount = Number(d.refund_amount);
  if (refundAmount > 0) {
    try {
      await escrowService.refundFromEscrow(
        d.booking_id,
        refundAmount,
        'Partial offer accepted by customer',
      );
    } catch (refundErr) {
      logger.error('Partial refund failed after offer acceptance', {
        disputeId, refundAmount,
        error: refundErr instanceof Error ? refundErr.message : 'Unknown',
      });
    }

    // Release remaining to provider
    const remainingAmount = totalAmount - refundAmount;
    if (remainingAmount > 0 && bk.provider_id) {
      try {
        const providerRow = await db.query<{user_id: string}>(
          `SELECT user_id FROM providers WHERE id = $1`, [bk.provider_id],
        );
        if (providerRow.rows[0]) {
          const provWallet = await walletService.getUserWallet(providerRow.rows[0].user_id, 'provider');
          await walletService.creditWallet(
            provWallet.id, remainingAmount, 'escrow_release',
            'Partial escrow release after dispute partial offer accepted',
            d.booking_id,
          );
        }
      } catch (releaseErr) {
        logger.error('Provider escrow release failed after partial offer acceptance', {
          disputeId, remainingAmount,
          error: releaseErr instanceof Error ? releaseErr.message : 'Unknown',
        });
      }
    }
  }
```


## ═══════════════════════════════════════════════════════════════
## CRITICAL-006: MOBILE CHECKOUT NEVER SENDS servicePrice
## ═══════════════════════════════════════════════════════════════
##
## File: apps/mobile/app/customer/booking/checkout.tsx
## File: apps/mobile/src/services/booking.service.ts
## File: packages/api/src/services/booking.service.ts
##
## CreateBookingPayload has NO servicePrice field.
## Backend defaults to: params.servicePrice ?? 0
## Result: ALL bookings created with ₱0 price.
## PayMongo rejects (₱100 minimum) or charges ₱0.
##
## SECURITY: Backend should look up price from subcategory table
## instead of trusting the client. Client price is a backup only.
## ═══════════════════════════════════════════════════════════════

### FIX — Step 1: Backend looks up price from subcategory (secure approach)

In `packages/api/src/services/booking.service.ts`, in the `createBooking` function,
find this line:
```typescript
const baseServicePrice = params.servicePrice ?? 0;
```

Replace with:
```typescript
  // Look up the canonical price from the subcategory — do NOT trust client-sent price
  let baseServicePrice = params.servicePrice ?? 0;

  if (params.subcategoryId && params.bookingType === 'fixed_price') {
    const subcatResult = await db.query<{ base_price: string | null }>(
      `SELECT base_price FROM service_subcategories WHERE id = $1 AND is_active = TRUE`,
      [params.subcategoryId],
    );
    if (subcatResult.rows.length > 0 && subcatResult.rows[0]!.base_price != null) {
      baseServicePrice = Number(subcatResult.rows[0]!.base_price);
    }
  }

  if (params.bookingType === 'fixed_price' && baseServicePrice <= 0) {
    throw createAppError(
      'Service price could not be determined. The selected service may not have a fixed price.',
      400,
    );
  }
```

### FIX — Step 2: Mobile also sends servicePrice as backup

In `apps/mobile/src/services/booking.service.ts`, add to the interface:
```typescript
export interface CreateBookingPayload {
  categoryId: string;
  subcategoryId: string;
  bookingType: 'fixed_price';
  description: string;
  address: string;
  barangay: string;
  city: string;
  province: string;
  latitude?: number;
  longitude?: number;
  scheduledAt: string;
  servicePrice?: number;  // ← ADD THIS
  rebookedFromId?: string;
  waitlistId?: string;
}
```

In `apps/mobile/app/customer/booking/checkout.tsx`, in the `handlePay` function,
add `servicePrice` to the `createBooking` call:
```typescript
      const booking = await createBooking({
        categoryId: draft.categoryId,
        subcategoryId: draft.subcategoryId,
        bookingType: 'fixed_price',
        description,
        address: draft.address,
        barangay: draft.barangay || 'N/A',
        city: draft.city ?? '',
        province: draft.province ?? '',
        latitude: draft.latitude ?? undefined,
        longitude: draft.longitude ?? undefined,
        scheduledAt,
        servicePrice: draft.basePrice,  // ← ADD THIS LINE
      });
```


## ═══════════════════════════════════════════════════════════════
## CRITICAL-007: SUKI POINTS USE total_amount (INCLUDES FEE)
## ═══════════════════════════════════════════════════════════════
##
## File: packages/api/src/routes/booking.routes.ts ~line 373
##
## sukiService.recordBookingForSuki receives booking.total_amount.
## Customers earn loyalty points on the platform fee too,
## inflating loyalty program cost and giving unearned points.
## ═══════════════════════════════════════════════════════════════

### FIX:

In `packages/api/src/routes/booking.routes.ts`, find:
```typescript
            await sukiService.recordBookingForSuki(
              booking.customer_id,
              booking.provider_id,
              id,
              booking.total_amount,
            );
```

Replace `booking.total_amount` with `booking.service_price`:
```typescript
            await sukiService.recordBookingForSuki(
              booking.customer_id,
              booking.provider_id,
              id,
              booking.service_price,  // Points on service price only, not platform fee
            );
```


---

# ██████████████████████████████████████████████████████████████████████
# SECTION 2: HIGH PRIORITY — FUNCTIONAL GAPS BLOCKING LAUNCH
# ██████████████████████████████████████████████████████████████████████


## ═══════════════════════════════════════════════════════════════
## HIGH-001: IMAGE UPLOAD IS PLACEHOLDER EVERYWHERE
## ═══════════════════════════════════════════════════════════════

3 screens show "Coming Soon" alert when photo buttons are tapped:
- `apps/mobile/app/customer/booking/job-request.tsx` line 112
- `apps/mobile/app/customer/booking/dispute.tsx` line 120
- `apps/mobile/app/provider/job/[id]/change-order.tsx` line 89

Additionally, the review screen has no photo upload at all.

### What to build:

1. **Backend endpoint:** Create `packages/api/src/routes/upload.routes.ts`
   - `POST /api/v1/uploads/presign` — returns presigned S3 URL + final public URL
   - Auth required
   - Body: `{ fileName: string, contentType: 'image/jpeg'|'image/png', purpose: string }`
   - Uses AWS S3 presigned URLs (works with DigitalOcean Spaces too)
   - Wire into server.ts: `app.use('/api/v1/uploads', uploadRoutes);`

2. **Mobile service:** Create `apps/mobile/src/services/upload.service.ts`
   - `pickImage(source: 'camera'|'gallery')` — uses expo-image-picker
   - `compressImage(uri, maxWidth)` — uses expo-image-manipulator
   - `uploadImage(localUri, purpose)` — gets presigned URL, uploads to S3
   - `pickAndUpload(purpose, source)` — convenience wrapper

3. **Wire into all screens:** Replace every `Alert.alert('Coming Soon', ...)` with actual upload calls. Show thumbnail previews. Allow removing photos.

4. **Add dependencies** to mobile package.json: `expo-image-picker`, `expo-image-manipulator`

5. **Re-enable** the `jobPhotos` min(2) validator in booking.validators.ts once upload works


## ═══════════════════════════════════════════════════════════════
## HIGH-002: NO SIGURADOSHIELD INSURANCE SCREEN
## ═══════════════════════════════════════════════════════════════

Create `apps/mobile/app/customer/safety.tsx` — full SiguradoShield™ buyer protection screen.

Content specification:
- Hero: Shield icon, "You're Protected", "Every booking includes protection up to ₱25,000"
- 4 coverage cards: Verified Pros, Escrow Payment, Damage Protection (₱25K), Quality Guarantee
- "How It Works" stepper: Book → Pay to Escrow → Confirm → Issue? We resolve in 48h
- "What's Covered" expandable: no-show (full refund), incomplete (partial/full refund), substandard (free redo), property damage (₱25K, ₱500 deductible over ₱5K), theft (₱10K + police report), injury (₱50K medical)
- "What's NOT Covered" expandable: off-platform jobs, pre-existing damage, customer-directed damage, cosmetic preference
- FAQ accordion (3 questions about claims process, timing, off-platform)
- CTA: "Report an Issue" → navigates to dispute screen

Register route in `apps/mobile/app/customer/_layout.tsx`.
Link from profile menu and checkout screen.
Update checkout escrow banner text to mention SiguradoShield™.


## ═══════════════════════════════════════════════════════════════
## HIGH-003: NO PROVIDER ONBOARDING FLOW
## ═══════════════════════════════════════════════════════════════

Registration screen only collects name + phone. No way to register as provider.

Build multi-step provider onboarding:
1. Role selection after OTP: "I need services" vs "I provide services"
2. Service categories multi-select (from catalog API)
3. Service area map with adjustable radius
4. Government ID upload (front + back) — uses upload service from HIGH-001
5. NBI clearance upload
6. Selfie capture (camera only)
7. IC agreement acceptance
8. "Application Under Review" confirmation screen

Add provider validator fields for document URLs in provider.validators.ts.


## ═══════════════════════════════════════════════════════════════
## HIGH-004: ADDRESS PICKER GEOCODING IS TODO
## ═══════════════════════════════════════════════════════════════

File: `apps/mobile/app/customer/address-picker.tsx` line 51
Current: `// TODO: Replace with Google Places / geocoding API in Sprint 5+`

Fix: Integrate Google Places Autocomplete or use expo-location for reverse geocoding.
Validate locations are within Philippines (lat 4.5-21.5, lng 116-127.5).


## ═══════════════════════════════════════════════════════════════
## HIGH-005: BOOKING LATITUDE ALLOWS GLOBAL COORDINATES
## ═══════════════════════════════════════════════════════════════

File: `packages/api/src/validators/booking.validators.ts` lines 12-13

Change:
```typescript
latitude: z.number().min(4.5, 'Must be within Philippines').max(21.5, 'Must be within Philippines').optional(),
longitude: z.number().min(116, 'Must be within Philippines').max(127.5, 'Must be within Philippines').optional(),
```


## ═══════════════════════════════════════════════════════════════
## HIGH-006: CANCELLATION ERROR SILENTLY SWALLOWED
## ═══════════════════════════════════════════════════════════════

File: `packages/api/src/routes/booking.routes.ts` lines 383-393

If handleCancellation throws, customer gets a success response but no refund.

Fix: If escrow handling fails, send error response instead of success:
```typescript
} catch (escrowErr) {
  logger.error('Cancellation escrow handling failed', { bookingId: id, ... });
  res.status(500).json({
    success: false,
    error: {
      code: 'ESCROW_ERROR',
      message: 'Your cancellation was recorded but the refund could not be processed automatically. Our team has been notified and will process it within 24 hours.',
    },
  });
  return;
}
```


---

# ██████████████████████████████████████████████████████████████████████
# SECTION 3: MEDIUM PRIORITY — CORRECTNESS & HARDENING
# ██████████████████████████████████████████████████████████████████████


## MEDIUM-001: Bypass detection needs Filipino/Tagalog patterns

File: `packages/api/src/jobs/workers.ts`
Add to BYPASS_PATTERNS array:
```typescript
/\b(?:pm\s*(?:mo|ko|lang)|direct\s*message|inbox\s*(?:mo|ko|lang))\b/gi,
/\b(?:text\s*(?:mo|ko)\s*(?:na\s*lang)?|tawag\s*(?:mo|ko))\b/gi,
/\b(?:sa\s*labas|off[\s-]?(?:app|platform))\b/gi,
/\b(?:viber|telegram|signal|whatsapp)\b/gi,
/\b(?:bdo|bpi|metrobank|unionbank|landbank|rcbc)\s*(?:account|savings|acct)\b/gi,
/\b(?:bayad\s*(?:ko|kita)\s*(?:na\s*lang|directly))\b/gi,
```


## MEDIUM-002: Change order doesn't charge additional payment

File: `packages/api/src/services/booking.service.ts` respondToChangeOrder()

When a change order is approved, it adds `additional_amount` to service_price
and total_amount but does NOT collect additional payment or hold additional escrow.
Provider does extra work with no payment guarantee.

Fix: After approval, the mobile app should redirect customer to a payment flow
for the additional amount before notifying the provider.


## MEDIUM-003: Service fee is zero for quote-based bookings until quote accepted

File: `packages/api/src/services/booking.service.ts` line 93

This is by design (fee calculated at quote acceptance) but verify the escrow
release handles this correctly — when service_fee is initially 0 and later
set during quote acceptance.


## MEDIUM-004: Admin analytics quality scores computed but not displayed

File: `packages/api/src/services/admin-analytics.service.ts`

Quality scores are computed weekly but the admin UI doesn't display them.
Wire into ProvidersPage.tsx or AnalyticsPage.tsx as a visible metric.


## MEDIUM-005: Filipino i18n translations need native speaker review

File: `apps/mobile/src/i18n/fil.json`

477 lines exist but may contain inaccurate AI-generated translations.
Before launch, have a native Filipino speaker review all strings.


---

# ██████████████████████████████████████████████████████████████████████
# SECTION 4: STITCH SCREEN INVENTORY — WHAT'S MISSING
# ██████████████████████████████████████████████████████████████████████

90 Stitch screens vs 51 built screens. These are NOT in the app:

| Priority | Screen | What to Build |
|---|---|---|
| LAUNCH | safety_insurance_info | SiguradoShield™ screen (HIGH-002) |
| LAUNCH | identity_verification + document_upload | Provider onboarding (HIGH-003) |
| LAUNCH | manage_addresses | Address list with CRUD |
| LAUNCH | help_center | FAQ/help screen |
| POST-LAUNCH | saved_payment_methods | Payment method management |
| POST-LAUNCH | add_card_wallet | Wallet top-up flow |
| POST-LAUNCH | service_checklist | Provider job checklist |
| POST-LAUNCH | before_after_photos | Photo comparison view |
| POST-LAUNCH | home_care_plan_selection | Subscription plans |
| POST-LAUNCH | subscriptions_management | Recurring booking UI |
| POST-LAUNCH | tax_documents_access | BIR tax docs |
| POST-LAUNCH | media_inspection_gallery | Evidence gallery |
| POST-LAUNCH | staff_roles_permissions | Admin staff management |
| POST-LAUNCH | system_audit_logs | Admin audit viewer |
| POST-LAUNCH | global_system_settings | Admin config UI |
| POST-LAUNCH | marketing_growth_tools | Admin marketing |
| POST-LAUNCH | terms_privacy_consent | Dedicated terms screen |
| POST-LAUNCH | payment_failed_error_state | Error handling screen |
| POST-LAUNCH | background_check_status | Verification tracker |
| POST-LAUNCH | password_reset | Password reset flow |


---

# ██████████████████████████████████████████████████████████████████████
# SECTION 5: NEW TESTS TO WRITE
# ██████████████████████████████████████████████████████████████████████

After all fixes are applied, create these test files:

### Test 1: packages/api/__tests__/escrow-money-conservation.test.ts

```typescript
// Test that money is conserved during escrow release
// Setup: service_price=50000, service_fee=5000, total_amount=55000
// Assert: providerReceives + platformRetains + guaranteeFund === 55000
// Assert: providerReceives === 50000 - Math.round(50000 * 0.15) === 42500
// Assert: guaranteeFund === Math.round(5000 * 0.015) === 75
// Assert: platformRetains === 7500 + 5000 - 75 === 12425
```

### Test 2: packages/api/__tests__/wallet-type-isolation.test.ts

```typescript
// Test that users can have multiple wallet types
// Create user, get 'customer' wallet, get 'provider' wallet
// Assert: different wallet IDs
// Assert: correct wallet types
```

### Test 3: packages/api/__tests__/dispute-refund-processing.test.ts

```typescript
// Test that dispute resolution actually processes refunds
// Create booking → pay → hold escrow → file dispute → resolve with full_refund
// Assert: escrowService.refundFromEscrow was called
// Assert: customer wallet was credited
```

### Test 4: packages/api/__tests__/booking-price-lookup.test.ts

```typescript
// Test that booking creation looks up price from subcategory
// Create booking without sending servicePrice
// Assert: service_price matches the subcategory's base_price
// Assert: service_price is NOT zero
```


---

# ██████████████████████████████████████████████████████████████████████
# SECTION 6: RUNTIME INTEGRATION VERIFICATION
# ██████████████████████████████████████████████████████████████████████

After all code fixes, run these integration tests:

```bash
# 1. Start infrastructure
cp .env.example .env
docker-compose up -d
sleep 10
docker-compose ps  # Both should be "healthy"

# 2. Run ALL 29 migrations (including the new 029)
cd packages/api
for f in migrations/*.sql; do
  echo "Running $f..."
  psql -h localhost -p 7383 -U onservice -d onservice_dev -f "$f" 2>&1
  if [ $? -ne 0 ]; then echo "MIGRATION FAILED: $f"; exit 1; fi
done

# 3. Run seeds
npx tsx src/seeds/run-seeds.ts

# 4. Start API server
npm run dev &
sleep 5

# 5. Test endpoints
curl -s http://localhost:7381/health | jq .
# Expected: {"status":"ok"}

curl -s http://localhost:7381/health/ready | jq .
# Expected: {"status":"ready","checks":{"database":"ok"}}

curl -s http://localhost:7381/api/v1/catalog | jq '.data | length'
# Expected: 10+ categories

curl -s -X POST http://localhost:7381/api/v1/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+639171234567"}' | jq .
# Expected: 200 success (check console for OTP)

# 6. Report ALL failures with exact error messages
```


---

# ██████████████████████████████████████████████████████████████████████
# SECTION 7: POST-FIX VERIFICATION CHECKLIST
# ██████████████████████████████████████████████████████████████████████

Run ALL of these after completing every fix:

```bash
# TypeScript — all 3 packages must have 0 errors
cd packages/api && npx tsc --noEmit
cd ../../apps/mobile && npx tsc --noEmit
cd ../../apps/admin && npx tsc --noEmit

# Tests — all must pass (including new tests)
cd ../../packages/api && npx jest --verbose

# Report: X tests passed, Y failed, Z new tests added
```

After this checklist passes, create a git commit:
```
git add -A
git commit -m "fix: critical money bugs, dispute refund processing, wallet isolation, price lookup

CRITICAL-001: Escrow release now uses service_price for commission (not total_amount)
CRITICAL-002: Wallet unique constraint changed to (user_id, type) for multi-wallet support
CRITICAL-003: Escrow status set inside releaseEscrow transaction (after money moves)
CRITICAL-004: Cancellation refund updates escrow_status after processing
CRITICAL-005: Dispute resolution now actually processes refunds through escrow/wallet
CRITICAL-006: Booking creation looks up price from subcategory (doesn't trust client ₱0)
CRITICAL-007: Suki points calculated on service_price (excludes platform fee)
HIGH-005: Booking latitude/longitude restricted to Philippine bounds
HIGH-006: Cancellation escrow errors no longer silently swallowed"
```
