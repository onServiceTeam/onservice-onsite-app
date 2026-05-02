import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import * as walletService from './wallet.service';
import * as commissionService from './commission.service';
import * as paymentService from './payment.service';
import * as settingsService from './settings.service';
import * as orService from './or.service';

interface BookingAmountRow {
  id: string;
  customer_id: string;
  provider_id: string | null;
  service_price: string;
  service_fee: string;
  total_amount: string;
  status: string;
  escrow_status?: string | null;
  scheduled_at: Date | null;
}

interface ProviderRow {
  user_id: string;
  tier: string;
}

/**
 * Hold payment in escrow after successful payment.
 * Debits the platform escrow wallet's pending_balance ledger.
 */
export async function holdInEscrow(bookingId: string, amount: number): Promise<void> {
  const escrowWallet = await walletService.getPlatformWallet('platform_escrow');
  await walletService.holdEscrow(escrowWallet.id, amount, bookingId);

  logger.info('Escrow hold created', { bookingId, amount });
}

/**
 * Release escrow after customer confirmation (FR-101).
 * 1. Deducts commission from service price
 * 2. Credits provider wallet with net amount
 * 3. Credits platform revenue with commission + service fee
 * 4. Allocates guarantee fund contribution
 * 5. Reduces platform escrow pending balance
 */
export async function releaseEscrow(bookingId: string): Promise<commissionService.CommissionBreakdown> {
  const booking = await db.query<BookingAmountRow & { provider_suspended_during_booking_at: Date | null }>(
    `SELECT b.id, b.customer_id, b.provider_id, b.service_price, b.service_fee, b.total_amount, b.status, b.scheduled_at,
            b.provider_suspended_during_booking_at
     FROM bookings b WHERE b.id = $1`,
    [bookingId],
  );

  if (booking.rows.length === 0) throw createAppError('Booking not found.', 404);
  const bk = booking.rows[0]!;

  const releasableStatuses = new Set(['confirmed', 'paid', 'resolved']);
  if (!releasableStatuses.has(bk.status)) {
    throw createAppError(`Cannot release escrow — booking status is "${bk.status}".`, 409);
  }

  // MED-N73 fix: refuse to disburse to a provider who was suspended
  // while this booking was in flight. Admin must explicitly resolve
  // (manual refund or revoke suspension to clear the flag) before
  // escrow can release.
  if (bk.provider_suspended_during_booking_at != null) {
    throw createAppError(
      'Cannot release escrow — provider was suspended during this booking. Admin must resolve before disbursement.',
      409,
    );
  }

  if (!bk.provider_id) throw createAppError('No provider assigned to this booking.', 409);

  const servicePrice = Number(bk.service_price);
  const serviceFee = Number(bk.service_fee);
  const totalAmount = Number(bk.total_amount);
  if (servicePrice <= 0) throw createAppError('Invalid booking amount.', 400);

  if (Math.abs(totalAmount - (servicePrice + serviceFee)) > 1) {
    logger.error('Booking amount mismatch detected', {
      bookingId, servicePrice, serviceFee, totalAmount,
      expected: servicePrice + serviceFee,
    });
  }

  const providerRow = await db.query<ProviderRow>(
    `SELECT user_id, tier FROM providers WHERE id = $1`,
    [bk.provider_id],
  );
  if (providerRow.rows.length === 0) throw createAppError('Provider not found.', 404);
  const provider = providerRow.rows[0]!;

  const commissionRate = await settingsService.getCommissionRate(provider.tier);
  const commissionAmount = Math.round(servicePrice * commissionRate);
  const guaranteeFundRate = await settingsService.getSettingPercent('guarantee_fund_rate');
  const guaranteeFundContribution = Math.round(serviceFee * guaranteeFundRate);

  const providerReceives = servicePrice - commissionAmount;
  const platformRetains = commissionAmount + serviceFee - guaranteeFundContribution;

  const totalOut = providerReceives + platformRetains + guaranteeFundContribution;
  if (totalOut !== totalAmount) {
    const diff = totalAmount - totalOut;
    if (Math.abs(diff) <= 2) {
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
    const escrowGuard = await client.query(
      `UPDATE bookings SET escrow_status = 'released', updated_at = NOW()
       WHERE id = $1 AND escrow_status = 'held' RETURNING id`,
      [bookingId],
    );
    if ((escrowGuard.rowCount ?? 0) === 0) {
      throw createAppError('Escrow already released or not held for this booking.', 409);
    }

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
  });

  const breakdown: commissionService.CommissionBreakdown = {
    servicePrice,
    commissionRate,
    commissionAmount,
    serviceFeeRate: await settingsService.getSettingPercent('service_fee_rate'),
    serviceFeeAmount: serviceFee,
    guaranteeFundContribution,
    providerReceives,
    platformRetains,
  };

  logger.info('Escrow released', { bookingId, breakdown });

  // Phase 08: best-effort OR issuance. Failure must NOT roll back the escrow
  // release (money math is already committed). Errors are logged for follow-up.
  try {
    await orService.issueOR({
      bookingId,
      commissionAmount,
      serviceFeeAmount: serviceFee,
      providerReceived: providerReceives,
      platformRetained: platformRetains,
    });
  } catch (orErr) {
    logger.error('OR issuance failed after escrow release (audit-only side effect)', {
      bookingId,
      error: orErr instanceof Error ? orErr.message : String(orErr),
    });
  }

  return breakdown;
}

/**
 * Release remaining escrow to provider after a partial refund.
 * Used when a dispute resolves with partial_refund/split_decision so the
 * non-refunded portion still reaches the provider and platform.
 */
export async function releasePartialEscrow(
  bookingId: string,
  remainingAmount: number,
): Promise<commissionService.CommissionBreakdown> {
  const booking = await db.query<BookingAmountRow>(
    `SELECT b.id, b.customer_id, b.provider_id, b.service_price, b.service_fee, b.total_amount, b.status, b.scheduled_at
     FROM bookings b WHERE b.id = $1`,
    [bookingId],
  );

  if (booking.rows.length === 0) throw createAppError('Booking not found.', 404);
  const bk = booking.rows[0]!;

  if (!bk.provider_id) throw createAppError('No provider assigned to this booking.', 409);
  if (remainingAmount <= 0) throw createAppError('No remaining amount to release.', 400);

  const totalAmount = Number(bk.total_amount);
  if (totalAmount <= 0) throw createAppError('Booking total amount is zero — cannot calculate partial release.', 409);
  const retentionFactor = remainingAmount / totalAmount;
  const proportionalServicePrice = Math.round(Number(bk.service_price) * retentionFactor);

  const providerRow = await db.query<ProviderRow>(
    `SELECT user_id, tier FROM providers WHERE id = $1`,
    [bk.provider_id],
  );
  if (providerRow.rows.length === 0) throw createAppError('Provider not found.', 404);
  const provider = providerRow.rows[0]!;

  const breakdown = await commissionService.calculateCommission(proportionalServicePrice, provider.tier);

  // MED-N25 + MED-N26 fix: pre-flight money math validation BEFORE
  // we touch any wallet. Two distinct guards:
  //
  //   (a) MED-N25 — platformAmount (= remainingAmount - providerReceives
  //       - guaranteeContribution) cannot be negative. If proportional
  //       commission yields providerReceives + guarantee > remainingAmount
  //       (possible in edge cases where serviceFee dominates total),
  //       the platform revenue wallet would receive a NEGATIVE credit
  //       recorded as 'commission' — money creation. Refuse.
  //
  //   (b) MED-N26 — sum of disbursements MUST equal remainingAmount
  //       (mirrors the CRIT-N04 conservation check on the full release
  //       path). Without this, a future code change to commission
  //       math could silently break partial-release conservation.
  const platformAmount = remainingAmount - breakdown.providerReceives - breakdown.guaranteeFundContribution;
  if (platformAmount < 0) {
    logger.error('PARTIAL ESCROW NEGATIVE PLATFORM AMOUNT', {
      bookingId, remainingAmount,
      providerReceives: breakdown.providerReceives,
      guaranteeContribution: breakdown.guaranteeFundContribution,
      platformAmount,
    });
    throw createAppError('Internal accounting error in partial release. Please contact support.', 500);
  }
  const totalOut = breakdown.providerReceives + platformAmount + breakdown.guaranteeFundContribution;
  if (totalOut !== remainingAmount) {
    const diff = remainingAmount - totalOut;
    if (Math.abs(diff) <= 2) {
      logger.debug('Rounding adjustment in partial escrow release', { bookingId, diff });
    } else {
      logger.error('MONEY CONSERVATION VIOLATION in partial escrow release', {
        bookingId, remainingAmount, totalOut, diff,
        providerReceives: breakdown.providerReceives,
        platformAmount,
        guaranteeContribution: breakdown.guaranteeFundContribution,
      });
      throw createAppError('Internal accounting error in partial release. Please contact support.', 500);
    }
  }

  const escrowWallet = await walletService.getPlatformWallet('platform_escrow');
  const revenueWallet = await walletService.getPlatformWallet('platform_revenue');
  const guaranteeWallet = await walletService.getPlatformWallet('guarantee_fund');
  const providerWallet = await walletService.getUserWallet(provider.user_id, 'provider');

  await db.transaction(async (client) => {
    const escrowGuard = await client.query(
      `UPDATE bookings SET escrow_status = 'released', updated_at = NOW()
       WHERE id = $1 AND escrow_status = 'partially_refunded' RETURNING id`,
      [bookingId],
    );
    if ((escrowGuard.rowCount ?? 0) === 0) {
      throw createAppError('Escrow not in partially-refunded state for this booking.', 409);
    }

    await client.query(
      `UPDATE wallets SET pending_balance = pending_balance - $1, updated_at = NOW() WHERE id = $2`,
      [remainingAmount, escrowWallet.id],
    );
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'escrow_release', $3,
               (SELECT pending_balance FROM wallets WHERE id = $1),
               'Partial escrow release — remaining after dispute refund')`,
      [escrowWallet.id, bookingId, -remainingAmount],
    );

    await client.query(
      `UPDATE wallets SET available_balance = available_balance + $1, updated_at = NOW() WHERE id = $2`,
      [breakdown.providerReceives, providerWallet.id],
    );
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'escrow_release', $3,
               (SELECT available_balance FROM wallets WHERE id = $1),
               $4)`,
      [providerWallet.id, bookingId, breakdown.providerReceives,
       `Partial payment for booking (after ${Math.round((1 - retentionFactor) * 100)}% refund, ${Math.round(breakdown.commissionRate * 100)}% commission deducted)`],
    );

    // platformAmount + conservation already validated above (MED-N25/N26).
    await client.query(
      `UPDATE wallets SET available_balance = available_balance + $1, updated_at = NOW() WHERE id = $2`,
      [platformAmount, revenueWallet.id],
    );
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'commission', $3,
               (SELECT available_balance FROM wallets WHERE id = $1),
               'Partial commission + fee from dispute resolution')`,
      [revenueWallet.id, bookingId, platformAmount],
    );

    await client.query(
      `UPDATE wallets SET available_balance = available_balance + $1, updated_at = NOW() WHERE id = $2`,
      [breakdown.guaranteeFundContribution, guaranteeWallet.id],
    );
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'guarantee_contribution', $3,
               (SELECT available_balance FROM wallets WHERE id = $1),
               'Guarantee fund contribution from partial dispute release')`,
      [guaranteeWallet.id, bookingId, breakdown.guaranteeFundContribution],
    );
  });

  logger.info('Partial escrow released', { bookingId, remainingAmount, breakdown });
  return breakdown;
}

/**
 * Process refund from escrow (before escrow release).
 * If escrow hasn't been released, refund is from pending balance.
 */
export async function refundFromEscrow(
  bookingId: string,
  refundAmount: number,
  reason: string,
): Promise<void> {
  if (refundAmount <= 0) throw createAppError('Refund amount must be positive.', 400);

  const escrowWallet = await walletService.getPlatformWallet('platform_escrow');
  if (Number(escrowWallet.pending_balance) < refundAmount) {
    throw createAppError('Insufficient escrow balance for refund.', 409);
  }

  await db.transaction(async (client) => {
    await client.query(
      `UPDATE wallets SET pending_balance = pending_balance - $1, updated_at = NOW() WHERE id = $2`,
      [refundAmount, escrowWallet.id],
    );

    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'refund', $3,
               (SELECT pending_balance FROM wallets WHERE id = $1),
               $4)`,
      [escrowWallet.id, bookingId, -refundAmount, `Refund: ${reason}`],
    );
  });

  await paymentService.processRefund(bookingId, refundAmount, reason);
  logger.info('Escrow refund processed', { bookingId, refundAmount, reason });
}

/**
 * Handle cancellation with commission-aware refund (FR-102).
 */
export async function handleCancellation(
  bookingId: string,
  hoursUntilScheduled: number,
  providerArrived: boolean,
  customerNoShow = false,
): Promise<commissionService.CancellationRefund> {
  const booking = await db.query<BookingAmountRow>(
    `SELECT id, customer_id, provider_id, service_price, service_fee, total_amount, status, escrow_status, scheduled_at FROM bookings WHERE id = $1`,
    [bookingId],
  );

  if (booking.rows.length === 0) throw createAppError('Booking not found.', 404);
  const bk = booking.rows[0]!;

  const alreadyProcessed = new Set(['refunded', 'partially_refunded', 'released']);
  if (bk.escrow_status && alreadyProcessed.has(bk.escrow_status)) {
    throw createAppError(`Cancellation already processed for this booking (escrow_status: ${bk.escrow_status}).`, 409);
  }

  const cancellationBase = Number(bk.service_price);
  const serviceFee = Number(bk.service_fee);

  const refund = await commissionService.calculateCancellationRefund(
    cancellationBase,
    hoursUntilScheduled,
    providerArrived,
    customerNoShow,
  );

  const feeRefund = customerNoShow ? 0 : serviceFee;
  const totalCustomerRefund = refund.customerRefundAmount + feeRefund;
  if (totalCustomerRefund > 0) {
    await refundFromEscrow(bookingId, totalCustomerRefund, 'Cancellation refund (service price + service fee)');
  }

  if (refund.providerCompensationAmount > 0 && bk.provider_id) {
    const providerRow = await db.query<ProviderRow>(
      `SELECT user_id, tier FROM providers WHERE id = $1`,
      [bk.provider_id],
    );
    if (providerRow.rows.length > 0) {
      const escrowWallet = await walletService.getPlatformWallet('platform_escrow');
      const providerWallet = await walletService.getUserWallet(providerRow.rows[0]!.user_id, 'provider');

      await db.transaction(async (client) => {
        await client.query(
          `UPDATE wallets SET pending_balance = pending_balance - $1, updated_at = NOW() WHERE id = $2`,
          [refund.providerCompensationAmount, escrowWallet.id],
        );
        await client.query(
          `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
           VALUES ($1, $2, 'escrow_release', $3,
                   (SELECT pending_balance FROM wallets WHERE id = $1),
                   'Escrow release for provider cancellation compensation')`,
          [escrowWallet.id, bookingId, -refund.providerCompensationAmount],
        );

        await client.query(
          `UPDATE wallets SET available_balance = available_balance + $1, updated_at = NOW() WHERE id = $2`,
          [refund.providerCompensationAmount, providerWallet.id],
        );
        await client.query(
          `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
           VALUES ($1, $2, 'escrow_release', $3,
                   (SELECT available_balance FROM wallets WHERE id = $1),
                   'Cancellation compensation')`,
          [providerWallet.id, bookingId, refund.providerCompensationAmount],
        );
      });
    }
  }

  if (customerNoShow && serviceFee > 0) {
    const revenueWallet = await walletService.getPlatformWallet('platform_revenue');
    const escrowWallet = await walletService.getPlatformWallet('platform_escrow');
    await db.transaction(async (client) => {
      await client.query(
        `UPDATE wallets SET pending_balance = pending_balance - $1, updated_at = NOW() WHERE id = $2`,
        [serviceFee, escrowWallet.id],
      );
      await client.query(
        `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
         VALUES ($1, $2, 'escrow_release', $3,
                 (SELECT pending_balance FROM wallets WHERE id = $1),
                 'Service fee retained — customer no-show')`,
        [escrowWallet.id, bookingId, -serviceFee],
      );
      await client.query(
        `UPDATE wallets SET available_balance = available_balance + $1, updated_at = NOW() WHERE id = $2`,
        [serviceFee, revenueWallet.id],
      );
      await client.query(
        `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
         VALUES ($1, $2, 'commission', $3,
                 (SELECT available_balance FROM wallets WHERE id = $1),
                 'Service fee from customer no-show')`,
        [revenueWallet.id, bookingId, serviceFee],
      );
    });
  }

  let escrowStatus: string;
  if (refund.customerRefundPercent >= 1.0) {
    escrowStatus = 'refunded';
  } else if (refund.customerRefundPercent <= 0) {
    escrowStatus = 'released';
  } else {
    escrowStatus = 'partially_refunded';
  }
  await db.query(
    `UPDATE bookings SET escrow_status = $1, updated_at = NOW() WHERE id = $2`,
    [escrowStatus, bookingId],
  );

  logger.info('Cancellation processed', { bookingId, escrowStatus, refund });
  return refund;
}

// ─────────────────────────────────────────────────────────────────
// Phase 14 Dispatch 06 — trx-aware helpers
//
// The *InTransaction helpers below accept an existing pg client and
// perform reads + writes through it so callers can compose atomic flows
// (e.g., booking-admin.service.ts:cancelBookingAsAdmin) that span escrow
// money mutations + admin_actions audit + booking status update inside ONE
// transaction. The legacy public functions above retain their pre-D06
// shape for callers that already consume them through their own pre-flight
// reads + post-commit gateway calls; they are NOT replaced here.
// ─────────────────────────────────────────────────────────────────

type PgClient = { query: typeof db.query };

/**
 * Release escrow inside an existing transaction. Caller owns the outer
 * `db.transaction(...)`. Performs reads + all wallet writes through the
 * passed-in client so the entire escrow release composes atomically with
 * any caller-side audit / status updates. The OR issuance side-effect is
 * the caller's responsibility — call after the outer transaction commits.
 */
export async function releaseEscrowInTransaction(
  client: PgClient,
  bookingId: string,
): Promise<commissionService.CommissionBreakdown> {
  const booking = await client.query<BookingAmountRow & { provider_suspended_during_booking_at: Date | null }>(
    `SELECT b.id, b.customer_id, b.provider_id, b.service_price, b.service_fee, b.total_amount, b.status, b.scheduled_at,
            b.provider_suspended_during_booking_at
     FROM bookings b WHERE b.id = $1 FOR UPDATE`,
    [bookingId],
  );

  if (booking.rows.length === 0) throw createAppError('Booking not found.', 404);
  const bk = booking.rows[0]!;

  const releasableStatuses = new Set(['confirmed', 'paid', 'resolved']);
  if (!releasableStatuses.has(bk.status)) {
    throw createAppError(`Cannot release escrow — booking status is "${bk.status}".`, 409);
  }

  // MED-N73 fix: same guard as releaseEscrow above. Suspended-mid-
  // booking providers cannot be paid out via the transactional path
  // either (used by booking confirmation in booking.routes.ts).
  if (bk.provider_suspended_during_booking_at != null) {
    throw createAppError(
      'Cannot release escrow — provider was suspended during this booking. Admin must resolve before disbursement.',
      409,
    );
  }

  if (!bk.provider_id) throw createAppError('No provider assigned to this booking.', 409);

  const servicePrice = Number(bk.service_price);
  const serviceFee = Number(bk.service_fee);
  const totalAmount = Number(bk.total_amount);
  if (servicePrice <= 0) throw createAppError('Invalid booking amount.', 400);

  const providerRow = await client.query<ProviderRow>(
    `SELECT user_id, tier FROM providers WHERE id = $1`,
    [bk.provider_id],
  );
  if (providerRow.rows.length === 0) throw createAppError('Provider not found.', 404);
  const provider = providerRow.rows[0]!;

  const commissionRate = await settingsService.getCommissionRate(provider.tier);
  const commissionAmount = Math.round(servicePrice * commissionRate);
  const guaranteeFundRate = await settingsService.getSettingPercent('guarantee_fund_rate');
  const guaranteeFundContribution = Math.round(serviceFee * guaranteeFundRate);

  const providerReceives = servicePrice - commissionAmount;
  const platformRetains = commissionAmount + serviceFee - guaranteeFundContribution;

  // CRIT-N04 fix: money-conservation guard. The legacy releaseEscrow has
  // this check (lines 90-102); the trx-aware variant was missing it,
  // meaning settings drift (e.g., commission rate change) could silently
  // mint or burn money inside the transaction. Mirror the legacy check
  // exactly: tolerate up to 2 centavos of rounding error, throw on more.
  const totalOut = providerReceives + platformRetains + guaranteeFundContribution;
  if (totalOut !== totalAmount) {
    const diff = totalAmount - totalOut;
    if (Math.abs(diff) <= 2) {
      logger.debug('Rounding adjustment in escrow release (trx)', { bookingId, diff });
    } else {
      logger.error('MONEY CONSERVATION VIOLATION in releaseEscrowInTransaction', {
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

  const escrowGuard = await client.query(
    `UPDATE bookings SET escrow_status = 'released', updated_at = NOW()
     WHERE id = $1 AND escrow_status = 'held' RETURNING id`,
    [bookingId],
  );
  if ((escrowGuard.rowCount ?? 0) === 0) {
    throw createAppError('Escrow already released or not held for this booking.', 409);
  }

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

  return {
    servicePrice,
    commissionRate,
    commissionAmount,
    serviceFeeRate: await settingsService.getSettingPercent('service_fee_rate'),
    serviceFeeAmount: serviceFee,
    guaranteeFundContribution,
    providerReceives,
    platformRetains,
  };
}

/**
 * Process refund from escrow inside an existing transaction. Performs the
 * pending-balance debit + wallet_transactions audit row atomically with
 * caller-side admin_actions / status updates. Gateway refund (post-commit)
 * is the caller's responsibility — call paymentService.processRefund after
 * the outer transaction commits.
 */
export async function refundFromEscrowInTransaction(
  client: PgClient,
  bookingId: string,
  refundAmount: number,
  reason: string,
): Promise<void> {
  if (refundAmount <= 0) throw createAppError('Refund amount must be positive.', 400);

  const escrowWallet = await walletService.getPlatformWallet('platform_escrow');
  if (Number(escrowWallet.pending_balance) < refundAmount) {
    throw createAppError('Insufficient escrow balance for refund.', 409);
  }

  await client.query(
    `UPDATE wallets SET pending_balance = pending_balance - $1, updated_at = NOW() WHERE id = $2`,
    [refundAmount, escrowWallet.id],
  );

  await client.query(
    `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
     VALUES ($1, $2, 'refund', $3,
             (SELECT pending_balance FROM wallets WHERE id = $1),
             $4)`,
    [escrowWallet.id, bookingId, -refundAmount, `Refund: ${reason}`],
  );
}

/**
 * Handle cancellation with commission-aware refund (FR-102) inside an
 * existing transaction. All escrow movements (customer refund, provider
 * compensation, platform fee retention on no-show) and the booking's
 * escrow_status update happen atomically with the caller's audit + status
 * writes. Pre-D06, handleCancellation ran three separate transactions —
 * this helper combines them so audit failure in the caller's transaction
 * also rolls back the money work.
 */
export async function handleCancellationInTransaction(
  client: PgClient,
  bookingId: string,
  hoursUntilScheduled: number,
  providerArrived: boolean,
  customerNoShow = false,
): Promise<commissionService.CancellationRefund> {
  const booking = await client.query<BookingAmountRow>(
    `SELECT id, customer_id, provider_id, service_price, service_fee, total_amount, status, escrow_status, scheduled_at FROM bookings WHERE id = $1 FOR UPDATE`,
    [bookingId],
  );

  if (booking.rows.length === 0) throw createAppError('Booking not found.', 404);
  const bk = booking.rows[0]!;

  const alreadyProcessed = new Set(['refunded', 'partially_refunded', 'released']);
  if (bk.escrow_status && alreadyProcessed.has(bk.escrow_status)) {
    throw createAppError(`Cancellation already processed for this booking (escrow_status: ${bk.escrow_status}).`, 409);
  }

  const cancellationBase = Number(bk.service_price);
  const serviceFee = Number(bk.service_fee);

  const refund = await commissionService.calculateCancellationRefund(
    cancellationBase,
    hoursUntilScheduled,
    providerArrived,
    customerNoShow,
  );

  const feeRefund = customerNoShow ? 0 : serviceFee;
  const totalCustomerRefund = refund.customerRefundAmount + feeRefund;
  if (totalCustomerRefund > 0) {
    await refundFromEscrowInTransaction(
      client,
      bookingId,
      totalCustomerRefund,
      'Cancellation refund (service price + service fee)',
    );
  }

  if (refund.providerCompensationAmount > 0 && bk.provider_id) {
    const providerRow = await client.query<ProviderRow>(
      `SELECT user_id, tier FROM providers WHERE id = $1`,
      [bk.provider_id],
    );
    if (providerRow.rows.length > 0) {
      const escrowWallet = await walletService.getPlatformWallet('platform_escrow');
      const providerWallet = await walletService.getUserWallet(providerRow.rows[0]!.user_id, 'provider');

      await client.query(
        `UPDATE wallets SET pending_balance = pending_balance - $1, updated_at = NOW() WHERE id = $2`,
        [refund.providerCompensationAmount, escrowWallet.id],
      );
      await client.query(
        `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
         VALUES ($1, $2, 'escrow_release', $3,
                 (SELECT pending_balance FROM wallets WHERE id = $1),
                 'Escrow release for provider cancellation compensation')`,
        [escrowWallet.id, bookingId, -refund.providerCompensationAmount],
      );

      await client.query(
        `UPDATE wallets SET available_balance = available_balance + $1, updated_at = NOW() WHERE id = $2`,
        [refund.providerCompensationAmount, providerWallet.id],
      );
      await client.query(
        `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
         VALUES ($1, $2, 'escrow_release', $3,
                 (SELECT available_balance FROM wallets WHERE id = $1),
                 'Cancellation compensation')`,
        [providerWallet.id, bookingId, refund.providerCompensationAmount],
      );
    }
  }

  if (customerNoShow && serviceFee > 0) {
    const revenueWallet = await walletService.getPlatformWallet('platform_revenue');
    const escrowWallet = await walletService.getPlatformWallet('platform_escrow');
    await client.query(
      `UPDATE wallets SET pending_balance = pending_balance - $1, updated_at = NOW() WHERE id = $2`,
      [serviceFee, escrowWallet.id],
    );
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'escrow_release', $3,
               (SELECT pending_balance FROM wallets WHERE id = $1),
               'Service fee retained — customer no-show')`,
      [escrowWallet.id, bookingId, -serviceFee],
    );
    await client.query(
      `UPDATE wallets SET available_balance = available_balance + $1, updated_at = NOW() WHERE id = $2`,
      [serviceFee, revenueWallet.id],
    );
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'commission', $3,
               (SELECT available_balance FROM wallets WHERE id = $1),
               'Service fee from customer no-show')`,
      [revenueWallet.id, bookingId, serviceFee],
    );
  }

  let escrowStatus: string;
  if (refund.customerRefundPercent >= 1.0) {
    escrowStatus = 'refunded';
  } else if (refund.customerRefundPercent <= 0) {
    escrowStatus = 'released';
  } else {
    escrowStatus = 'partially_refunded';
  }
  await client.query(
    `UPDATE bookings SET escrow_status = $1, updated_at = NOW() WHERE id = $2`,
    [escrowStatus, bookingId],
  );

  return refund;
}
