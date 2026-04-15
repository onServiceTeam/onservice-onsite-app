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
    `SELECT b.id, b.customer_id, b.provider_id, b.total_amount, b.status, b.scheduled_at
     FROM bookings b WHERE b.id = $1`,
    [bookingId],
  );

  if (booking.rows.length === 0) throw createAppError('Booking not found.', 404);
  const bk = booking.rows[0]!;

  if (!bk.provider_id) throw createAppError('No provider assigned to this booking.', 409);

  const servicePrice = Number(bk.total_amount);
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

  await db.transaction(async (client) => {
    await client.query(
      `UPDATE wallets SET pending_balance = pending_balance - $1, updated_at = NOW() WHERE id = $2`,
      [servicePrice, escrowWallet.id],
    );

    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'escrow_release', $3,
               (SELECT pending_balance FROM wallets WHERE id = $1),
               'Escrow release for booking')`,
      [escrowWallet.id, bookingId, -servicePrice],
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
    `SELECT id, customer_id, provider_id, total_amount, status FROM bookings WHERE id = $1`,
    [bookingId],
  );

  if (booking.rows.length === 0) throw createAppError('Booking not found.', 404);
  const bk = booking.rows[0]!;
  const servicePrice = Number(bk.total_amount);

  const refund = commissionService.calculateCancellationRefund(
    servicePrice,
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
      const providerWallet = await walletService.getUserWallet(providerRow.rows[0]!.user_id, 'provider');
      await walletService.creditWallet(
        providerWallet.id,
        refund.providerCompensationAmount,
        'escrow_release',
        'Cancellation compensation',
        bookingId,
      );
    }
  }

  logger.info('Cancellation processed', { bookingId, refund });
  return refund;
}
