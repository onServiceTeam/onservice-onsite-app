import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import * as walletService from './wallet.service';
import * as commissionService from './commission.service';
import * as paymentService from './payment.service';

interface BookingAmountRow {
  id: string;
  customer_id: string;
  provider_id: string | null;
  service_price: string;
  service_fee: string;
  total_amount: string;
  status: string;
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
  const booking = await db.query<BookingAmountRow>(
    `SELECT b.id, b.customer_id, b.provider_id, b.service_price, b.service_fee, b.total_amount, b.status, b.scheduled_at
     FROM bookings b WHERE b.id = $1`,
    [bookingId],
  );

  if (booking.rows.length === 0) throw createAppError('Booking not found.', 404);
  const bk = booking.rows[0]!;

  const releasableStatuses = new Set(['confirmed', 'paid', 'resolved']);
  if (!releasableStatuses.has(bk.status)) {
    throw createAppError(`Cannot release escrow — booking status is "${bk.status}".`, 409);
  }

  if (!bk.provider_id) throw createAppError('No provider assigned to this booking.', 409);

  const servicePrice = Number(bk.service_price);
  if (servicePrice <= 0) throw createAppError('Invalid booking amount.', 400);

  const providerRow = await db.query<ProviderRow>(
    `SELECT user_id, tier FROM providers WHERE id = $1`,
    [bk.provider_id],
  );
  if (providerRow.rows.length === 0) throw createAppError('Provider not found.', 404);
  const provider = providerRow.rows[0]!;

  const breakdown = commissionService.calculateCommission(servicePrice, provider.tier);

  const escrowWallet = await walletService.getPlatformWallet('platform_escrow');
  const revenueWallet = await walletService.getPlatformWallet('platform_revenue');
  const guaranteeWallet = await walletService.getPlatformWallet('guarantee_fund');
  const providerWallet = await walletService.getUserWallet(provider.user_id, 'provider');

  const totalEscrowHeld = Number(bk.total_amount);

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
      [totalEscrowHeld, escrowWallet.id],
    );

    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'escrow_release', $3,
               (SELECT pending_balance FROM wallets WHERE id = $1),
               'Escrow release for booking')`,
      [escrowWallet.id, bookingId, -totalEscrowHeld],
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
       `Payment for booking (${Math.round(breakdown.commissionRate * 100)}% commission deducted)`],
    );

    await client.query(
      `UPDATE wallets SET available_balance = available_balance + $1, updated_at = NOW() WHERE id = $2`,
      [breakdown.commissionAmount + breakdown.serviceFeeAmount - breakdown.guaranteeFundContribution, revenueWallet.id],
    );
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'commission', $3,
               (SELECT available_balance FROM wallets WHERE id = $1),
               'Commission + service fee from booking')`,
      [revenueWallet.id, bookingId,
       breakdown.commissionAmount + breakdown.serviceFeeAmount - breakdown.guaranteeFundContribution],
    );

    await client.query(
      `UPDATE wallets SET available_balance = available_balance + $1, updated_at = NOW() WHERE id = $2`,
      [breakdown.guaranteeFundContribution, guaranteeWallet.id],
    );
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'guarantee_contribution', $3,
               (SELECT available_balance FROM wallets WHERE id = $1),
               'Guarantee fund contribution')`,
      [guaranteeWallet.id, bookingId, breakdown.guaranteeFundContribution],
    );
  });

  logger.info('Escrow released', { bookingId, breakdown });
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

  const breakdown = commissionService.calculateCommission(proportionalServicePrice, provider.tier);

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

    const platformAmount = remainingAmount - breakdown.providerReceives - breakdown.guaranteeFundContribution;
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
  const escrowWallet = await walletService.getPlatformWallet('platform_escrow');

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
): Promise<commissionService.CancellationRefund> {
  const booking = await db.query<BookingAmountRow>(
    `SELECT id, customer_id, provider_id, service_price, service_fee, total_amount, status, scheduled_at FROM bookings WHERE id = $1`,
    [bookingId],
  );

  if (booking.rows.length === 0) throw createAppError('Booking not found.', 404);
  const bk = booking.rows[0]!;
  const cancellationBase = Number(bk.total_amount);

  const refund = commissionService.calculateCancellationRefund(
    cancellationBase,
    hoursUntilScheduled,
    providerArrived,
  );

  if (refund.customerRefundAmount > 0) {
    await refundFromEscrow(bookingId, refund.customerRefundAmount, 'Cancellation refund');
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

  logger.info('Cancellation processed', { bookingId, refund });
  return refund;
}
