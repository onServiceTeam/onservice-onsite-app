import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import * as walletService from './wallet.service';
import * as commissionService from './commission.service';
import * as paymentService from './payment.service';
import * as orService from './or.service';
import { computeHourlySettlement } from './booking/pricing.service';
import * as financialTermsService from './booking-financial-terms.service';

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

// MED-N156 fix — trx-aware variant. Takes the same trx client as the
// caller so the booking UPDATE that flips status to 'paid' and the
// escrow ledger writes commit atomically. If either side fails, both
// roll back and the webhook returns 5xx — PayMongo retries the
// webhook. Same shape as MED-N88 / CRIT-N10 cancellation /
// confirmation patterns.
// Generic PgClient type matching db.transaction's callback parameter
// (a thin wrapper around pg's PoolClient.query). Constrains TRow to
// QueryResultRow so .query<TRow>() flows match pg's signature.
import type { QueryResult, QueryResultRow } from 'pg';
type PgClient = {
  query: <R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ) => Promise<QueryResult<R>>;
};
export async function holdInEscrowInTransaction(
  client: PgClient,
  bookingId: string,
  amount: number,
): Promise<void> {
  // SELECT runs on the trx client so we see the (uncommitted) wallet
  // row consistent with this transaction.
  const escrowWalletRow = await client.query<{ id: string }>(
    `SELECT id FROM wallets WHERE type = 'platform_escrow' LIMIT 1`,
  );
  if (escrowWalletRow.rows.length === 0) {
    throw createAppError('Platform escrow wallet not configured.', 500);
  }
  await walletService.holdEscrowInTransaction(
    client,
    escrowWalletRow.rows[0]!.id,
    amount,
    bookingId,
  );
  logger.info('Escrow hold created (in-trx)', { bookingId, amount });
}

interface ReleaseAllocation {
  servicePrice: number;
  serviceFee: number;
  totalAmount: number;
  commissionRate: number;
  commissionAmount: number;
  serviceFeeRate: number;
  guaranteeFundContribution: number;
  providerReceives: number;
  platformRetains: number;
}

async function resolveReleaseWallets(
  client: PgClient,
  providerId: string,
): Promise<{
  escrowWalletId: string;
  revenueWalletId: string;
  guaranteeWalletId: string;
  providerWalletId: string;
}> {
  const provider = await client.query<{ user_id: string }>(
    `SELECT user_id FROM providers WHERE id = $1`,
    [providerId],
  );
  const providerUserId = provider.rows[0]?.user_id;
  if (!providerUserId) throw createAppError('Provider not found.', 404);

  const platform = await client.query<{ id: string; type: string }>(
    `SELECT id, type
       FROM wallets
      WHERE user_id IS NULL
        AND type = ANY($1::text[])`,
    [['platform_escrow', 'platform_revenue', 'guarantee_fund']],
  );
  const byType = new Map(platform.rows.map((wallet) => [wallet.type, wallet.id]));
  const escrowWalletId = byType.get('platform_escrow');
  const revenueWalletId = byType.get('platform_revenue');
  const guaranteeWalletId = byType.get('guarantee_fund');
  if (!escrowWalletId || !revenueWalletId || !guaranteeWalletId) {
    throw createAppError('Required platform wallets are not configured.', 500);
  }

  const providerWallet = await walletService.getUserWalletInTransaction(
    client,
    providerUserId,
    'provider',
  );
  return {
    escrowWalletId,
    revenueWalletId,
    guaranteeWalletId,
    providerWalletId: providerWallet.id,
  };
}

async function resolvePlatformWalletsInTransaction(
  client: PgClient,
  types: Array<'platform_escrow' | 'platform_revenue' | 'guarantee_fund'>,
): Promise<Map<string, string>> {
  const result = await client.query<{ id: string; type: string }>(
    `SELECT id, type
       FROM wallets
      WHERE user_id IS NULL
        AND type = ANY($1::text[])`,
    [types],
  );
  const byType = new Map(result.rows.map((wallet) => [wallet.type, wallet.id]));
  for (const type of types) {
    if (!byType.has(type)) {
      throw createAppError(`Platform wallet "${type}" is not configured.`, 500);
    }
  }
  return byType;
}

async function writeReleaseMovements(
  client: PgClient,
  input: {
    bookingId: string;
    expectedEscrowStatus: 'held' | 'partially_refunded';
    allocation: ReleaseAllocation;
    providerDescription: string;
    platformDescription: string;
    guaranteeDescription: string;
  },
  wallets: Awaited<ReturnType<typeof resolveReleaseWallets>>,
): Promise<void> {
  const { allocation } = input;
  const totalOut = allocation.providerReceives
    + allocation.platformRetains
    + allocation.guaranteeFundContribution;
  if (totalOut !== allocation.totalAmount) {
    throw createAppError('Snapshotted release allocation does not conserve money.', 500);
  }

  const escrowGuard = await client.query(
    `UPDATE bookings SET escrow_status = 'released', updated_at = NOW()
     WHERE id = $1 AND escrow_status = $2 RETURNING id`,
    [input.bookingId, input.expectedEscrowStatus],
  );
  if ((escrowGuard.rowCount ?? 0) === 0) {
    throw createAppError(
      `Escrow is not in the expected ${input.expectedEscrowStatus} state for this booking.`,
      409,
    );
  }

  await walletService.lockWalletsForUpdate(client, [
    wallets.escrowWalletId,
    wallets.providerWalletId,
    wallets.revenueWalletId,
    wallets.guaranteeWalletId,
  ]);
  const escrowBalance = await client.query<{ pending_balance: string }>(
    `SELECT pending_balance::text AS pending_balance FROM wallets WHERE id = $1`,
    [wallets.escrowWalletId],
  );
  if (Number(escrowBalance.rows[0]?.pending_balance ?? 0) < allocation.totalAmount) {
    throw createAppError('Insufficient held escrow for this booking release.', 409);
  }

  await client.query(
    `UPDATE wallets SET pending_balance = pending_balance - $1, updated_at = NOW() WHERE id = $2`,
    [allocation.totalAmount, wallets.escrowWalletId],
  );
  await client.query(
    `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
     VALUES ($1, $2, 'escrow_release', $3,
             (SELECT pending_balance FROM wallets WHERE id = $1),
             'Escrow release for booking')`,
    [wallets.escrowWalletId, input.bookingId, -allocation.totalAmount],
  );

  if (allocation.providerReceives > 0) {
    await client.query(
      `UPDATE wallets SET available_balance = available_balance + $1, updated_at = NOW() WHERE id = $2`,
      [allocation.providerReceives, wallets.providerWalletId],
    );
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'escrow_release', $3,
               (SELECT available_balance FROM wallets WHERE id = $1), $4)`,
      [wallets.providerWalletId, input.bookingId, allocation.providerReceives, input.providerDescription],
    );
  }

  if (allocation.platformRetains > 0) {
    await client.query(
      `UPDATE wallets SET available_balance = available_balance + $1, updated_at = NOW() WHERE id = $2`,
      [allocation.platformRetains, wallets.revenueWalletId],
    );
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'commission', $3,
               (SELECT available_balance FROM wallets WHERE id = $1), $4)`,
      [wallets.revenueWalletId, input.bookingId, allocation.platformRetains, input.platformDescription],
    );
  }

  if (allocation.guaranteeFundContribution > 0) {
    await client.query(
      `UPDATE wallets SET available_balance = available_balance + $1, updated_at = NOW() WHERE id = $2`,
      [allocation.guaranteeFundContribution, wallets.guaranteeWalletId],
    );
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'guarantee_contribution', $3,
               (SELECT available_balance FROM wallets WHERE id = $1), $4)`,
      [wallets.guaranteeWalletId, input.bookingId, allocation.guaranteeFundContribution, input.guaranteeDescription],
    );
  }
}

function breakdownFromAllocation(allocation: ReleaseAllocation): commissionService.CommissionBreakdown {
  return {
    servicePrice: allocation.servicePrice,
    commissionRate: allocation.commissionRate,
    commissionAmount: allocation.commissionAmount,
    serviceFeeRate: allocation.serviceFeeRate,
    serviceFeeAmount: allocation.serviceFee,
    guaranteeFundContribution: allocation.guaranteeFundContribution,
    providerReceives: allocation.providerReceives,
    platformRetains: allocation.platformRetains,
  };
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
  const breakdown = await db.transaction((client) => releaseEscrowInTransaction(client, bookingId));

  logger.info('Escrow released', { bookingId, breakdown });

  // Phase 08: best-effort OR issuance. Failure must NOT roll back the escrow
  // release (money math is already committed). Errors are logged for follow-up.
  try {
    await orService.issueOR({
      bookingId,
      commissionAmount: breakdown.commissionAmount,
      serviceFeeAmount: breakdown.serviceFeeAmount,
      providerReceived: breakdown.providerReceives,
      platformRetained: breakdown.platformRetains,
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
  const breakdown = await db.transaction(async (client) => {
    const booking = await client.query<BookingAmountRow & { provider_suspended_during_booking_at: Date | null }>(
      `SELECT id, customer_id, provider_id, service_price, service_fee,
              total_amount, status, escrow_status, scheduled_at,
              provider_suspended_during_booking_at
         FROM bookings
        WHERE id = $1
        FOR UPDATE`,
      [bookingId],
    );
    const bk = booking.rows[0];
    if (!bk) throw createAppError('Booking not found.', 404);
    if (!bk.provider_id) throw createAppError('No provider assigned to this booking.', 409);
    if (bk.provider_suspended_during_booking_at != null) {
      throw createAppError(
        'Cannot release escrow because the provider was suspended during this booking. Admin must resolve the dispute before disbursement.',
        409,
      );
    }

    const terms = await financialTermsService.getLatestFinalTermsInTransaction(client, bookingId);
    if (terms.providerId !== bk.provider_id) {
      throw createAppError('Booking provider does not match its snapshotted financial terms.', 409);
    }
    if (
      terms.servicePriceCentavos !== Number(bk.service_price)
      || terms.serviceFeeAmountCentavos !== Number(bk.service_fee)
      || terms.totalAmountCentavos !== Number(bk.total_amount)
    ) {
      throw createAppError('Booking amounts do not match its latest financial terms.', 409);
    }

    const prorated = financialTermsService.prorateFinalTerms(terms, remainingAmount);
    const allocation: ReleaseAllocation = {
      servicePrice: prorated.servicePriceCentavos,
      serviceFee: prorated.serviceFeeAmountCentavos,
      totalAmount: prorated.totalAmountCentavos,
      commissionRate: (terms.commissionRateBasisPoints ?? 0) / 10000,
      commissionAmount: prorated.commissionAmountCentavos,
      serviceFeeRate: terms.serviceFeeRateBasisPoints / 10000,
      guaranteeFundContribution: prorated.guaranteeFundAmountCentavos,
      providerReceives: prorated.providerReceivesCentavos,
      platformRetains: prorated.platformRetainsCentavos,
    };
    const wallets = await resolveReleaseWallets(client, bk.provider_id);
    const refundPercent = Math.round((1 - remainingAmount / terms.totalAmountCentavos) * 100);
    await writeReleaseMovements(
      client,
      {
        bookingId,
        expectedEscrowStatus: 'partially_refunded',
        allocation,
        providerDescription: `Partial payment after ${refundPercent}% refund using financial terms v${terms.version}`,
        platformDescription: `Partial commission and fee using financial terms v${terms.version}`,
        guaranteeDescription: `Partial guarantee allocation using financial terms v${terms.version}`,
      },
      wallets,
    );
    return breakdownFromAllocation(allocation);
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
  if (!Number.isSafeInteger(refundAmount) || refundAmount <= 0) {
    throw createAppError('Refund amount must be a positive integer (centavos).', 400);
  }
  const movement = await db.transaction((client) => (
    refundFromEscrowInTransaction(client, bookingId, refundAmount, reason)
  ));

  // The local escrow and (for wallet-funded bookings) customer-wallet
  // movements are already committed. A failed payment-intent/PayMongo update
  // must therefore retry only that external/accounting step. Retrying this
  // whole function would debit the booking's escrow a second time.
  try {
    await paymentService.processRefund(bookingId, refundAmount, reason);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (movement.paymentMethod === 'wallet' && /no payment found/i.test(errMsg)) {
      logger.info('Wallet refund completed without a payment-intent row', {
        bookingId,
        refundAmount,
      });
    } else {
      logger.error('Payment refund failed after local escrow refund; enqueueing payment-only retry', {
        bookingId,
        refundAmount,
        error: errMsg,
      });
      const gatewayRetryService = await import('./gateway-retry.service');
      await gatewayRetryService.enqueueRetry({
        actionType: 'process_payment_refund',
        bookingId,
        amountCentavos: refundAmount,
        description: reason,
        initialError: errMsg,
      });
    }
  }
  logger.info('Escrow refund processed', { bookingId, refundAmount, reason });
}

/**
 * Handle cancellation with commission-aware refund (FR-102).
 */
/**
 * MED-N27 fix — legacy handleCancellation now wraps the trx-aware
 * variant in a single db.transaction so escrow refund + provider
 * compensation + no-show fee retention + bookings.escrow_status
 * UPDATE all happen atomically. Pre-fix this opened up to 3
 * separate transactions (provider-comp trx, no-show-fee trx, status
 * UPDATE outside a trx) — a crash between trx 1 and trx 2 left
 * customer refunded but provider unpaid, with bookings.escrow_status
 * still 'held'. The trx-aware helper has been the canonical path
 * since Phase 14 D06 (used by booking-admin); this back-compat
 * wrapper now matches it.
 */
export async function handleCancellation(
  bookingId: string,
  hoursUntilScheduled: number,
  providerArrived: boolean,
  customerNoShow = false,
): Promise<commissionService.CancellationRefund> {
  const outcome = await db.transaction(async (client) => {
    const refund = await handleCancellationInTransaction(
      client,
      bookingId,
      hoursUntilScheduled,
      providerArrived,
      customerNoShow,
    );
    const feeRow = await client.query<{ service_fee: string | number }>(
      `SELECT service_fee FROM bookings WHERE id = $1`,
      [bookingId],
    );
    return {
      refund,
      serviceFee: feeRow.rows[0] ? Number(feeRow.rows[0].service_fee) : 0,
    };
  });
  const { refund, serviceFee } = outcome;
  await processCancellationGatewayRefund(bookingId, refund, serviceFee, customerNoShow);
  return refund;
}

/**
 * The post-commit gateway step of a cancellation. Call it only after the
 * transaction that ran handleCancellationInTransaction has committed.
 * S1-5: extracted unchanged from handleCancellation so that the status-route
 * cancellation (booking-cancel.service via transitionBookingStatus) runs the
 * same step after its single transaction commits.
 */
export async function processCancellationGatewayRefund(
  bookingId: string,
  refund: commissionService.CancellationRefund,
  serviceFee: number,
  customerNoShow: boolean,
  // S1-8 — the admin cancel keeps its own payment-record and retry labels.
  labels: { refundReason: string; retryDescription: string } = {
    refundReason: 'Customer-initiated cancellation',
    retryDescription: 'Customer cancellation refund',
  },
): Promise<void> {
  // BUG-PHASE26-01 fix: trigger the PayMongo refund post-commit so the
  // money debited from escrow actually returns to the customer's bank.
  // Pre-fix (MED-N27 regression): refundFromEscrowInTransaction debited
  // the platform_escrow wallet but no caller invoked paymentService
  // .processRefund, so escrow shrank but PayMongo never refunded —
  // every customer cancellation since MED-N27 lost money. Now: post-
  // commit gateway call mirrors the dispute-resolve pattern. Because the
  // local escrow movement has committed, a failure enqueues only the payment
  // processing step and must never debit escrow again.
  if (!customerNoShow && refund.customerRefundAmount > 0) {
    const totalCustomerRefund = refund.customerRefundAmount + serviceFee;
    // gate-c-allowed: post-commit-gateway-refund
    try {
      const paymentService = await import('./payment.service');
      await paymentService.processRefund(
        bookingId,
        totalCustomerRefund,
        labels.refundReason,
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // Sandbox / test fixtures that never went through PayMongo have
      // no payment_intent — escrow already debited, nothing to refund
      // externally. Log + carry on (do NOT enqueue retry).
      if (/no payment found/i.test(errMsg)) {
        logger.info('Cancellation refund skipped — no PayMongo intent for booking', {
          bookingId,
          totalCustomerRefund,
        });
      } else {
        logger.error('PayMongo cancellation refund failed (post-commit); enqueueing retry', {
          bookingId,
          totalCustomerRefund,
          error: errMsg,
        });
        const gatewayRetryService = await import('./gateway-retry.service');
        await gatewayRetryService.enqueueRetry({
          actionType: 'process_payment_refund',
          bookingId,
          amountCentavos: totalCustomerRefund,
          description: labels.retryDescription,
          initialError: errMsg,
        });
      }
    }
  }
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

// Note: PgClient already declared at top of file; do not redeclare.
// (Earlier MED-N9X refactor introduced this duplicate; harmless at
// runtime but TS2300.) Just reuse the upper definition.

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
    `SELECT b.id, b.customer_id, b.provider_id, b.service_price, b.service_fee, b.total_amount, b.status, b.escrow_status, b.scheduled_at,
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
  if (bk.escrow_status !== 'held' && bk.escrow_status !== 'partially_refunded') {
    throw createAppError(`Cannot release escrow in state "${bk.escrow_status ?? 'none'}".`, 409);
  }

  const terms = await financialTermsService.getLatestTermsInTransaction(client, bookingId);
  if (terms.providerId !== bk.provider_id) {
    throw createAppError('Booking provider does not match its snapshotted financial terms.', 409);
  }
  if (
    terms.servicePriceCentavos !== Number(bk.service_price)
    || terms.serviceFeeAmountCentavos !== Number(bk.service_fee)
    || terms.totalAmountCentavos !== Number(bk.total_amount)
  ) {
    throw createAppError(
      'Booking amounts do not match the latest immutable financial terms. Release is blocked for operations review.',
      409,
    );
  }
  if (
    terms.commissionRateBasisPoints === null
    || terms.commissionAmountCentavos === null
    || terms.providerReceivesCentavos === null
    || terms.platformRetainsCentavos === null
  ) {
    throw createAppError('Final financial terms are incomplete. Release is blocked.', 409);
  }

  const wallets = await resolveReleaseWallets(client, bk.provider_id);
  const bookingEscrow = await client.query<{ remaining: string }>(
    `SELECT COALESCE(SUM(amount), 0)::text AS remaining
       FROM wallet_transactions
      WHERE wallet_id = $1
        AND booking_id = $2`,
    [wallets.escrowWalletId, bookingId],
  );
  const remainingEscrow = Number(bookingEscrow.rows[0]?.remaining ?? 0);
  if (!Number.isSafeInteger(remainingEscrow) || remainingEscrow <= 0) {
    throw createAppError('This booking has no positive escrow balance to release.', 409);
  }

  let allocation: ReleaseAllocation;
  let expectedEscrowStatus: 'held' | 'partially_refunded';
  let providerDescription: string;
  let platformDescription: string;
  let guaranteeDescription: string;
  if (bk.escrow_status === 'held') {
    if (remainingEscrow !== terms.totalAmountCentavos) {
      throw createAppError(
        'Held escrow does not match this booking\'s immutable financial terms. Release is blocked for operations review.',
        409,
      );
    }
    allocation = {
      servicePrice: terms.servicePriceCentavos,
      serviceFee: terms.serviceFeeAmountCentavos,
      totalAmount: terms.totalAmountCentavos,
      commissionRate: terms.commissionRateBasisPoints / 10000,
      commissionAmount: terms.commissionAmountCentavos,
      serviceFeeRate: terms.serviceFeeRateBasisPoints / 10000,
      guaranteeFundContribution: terms.guaranteeFundAmountCentavos,
      providerReceives: terms.providerReceivesCentavos,
      platformRetains: terms.platformRetainsCentavos,
    };
    expectedEscrowStatus = 'held';
    providerDescription = `Payment using financial terms v${terms.version} (${terms.commissionRateBasisPoints / 100}% commission)`;
    platformDescription = `Commission and service fee using financial terms v${terms.version}`;
    guaranteeDescription = `Guarantee allocation using financial terms v${terms.version}`;
  } else {
    if (remainingEscrow >= terms.totalAmountCentavos) {
      throw createAppError(
        'Partial-refund status does not match this booking\'s escrow ledger. Release is blocked for operations review.',
        409,
      );
    }
    const prorated = financialTermsService.prorateFinalTerms(terms, remainingEscrow);
    allocation = {
      servicePrice: prorated.servicePriceCentavos,
      serviceFee: prorated.serviceFeeAmountCentavos,
      totalAmount: prorated.totalAmountCentavos,
      commissionRate: terms.commissionRateBasisPoints / 10000,
      commissionAmount: prorated.commissionAmountCentavos,
      serviceFeeRate: terms.serviceFeeRateBasisPoints / 10000,
      guaranteeFundContribution: prorated.guaranteeFundAmountCentavos,
      providerReceives: prorated.providerReceivesCentavos,
      platformRetains: prorated.platformRetainsCentavos,
    };
    const refundPercent = Math.round((1 - remainingEscrow / terms.totalAmountCentavos) * 100);
    expectedEscrowStatus = 'partially_refunded';
    providerDescription = `Remaining payment after ${refundPercent}% operator refund using financial terms v${terms.version}`;
    platformDescription = `Prorated commission and fee after operator refund using financial terms v${terms.version}`;
    guaranteeDescription = `Prorated guarantee allocation after operator refund using financial terms v${terms.version}`;
  }
  await writeReleaseMovements(
    client,
    {
      bookingId,
      expectedEscrowStatus,
      allocation,
      providerDescription,
      platformDescription,
      guaranteeDescription,
    },
    wallets,
  );

  return breakdownFromAllocation(allocation);
}

/**
 * D27 Phase 4b — settle an hourly booking on confirmation, then release.
 *
 * Bills min(actual, estimated) hours where actual is derived ONLY from the
 * server-clocked work_started_at/work_completed_at (never a client value),
 * rewrites the booking's service_price/service_fee/total_amount DOWN
 * proportionally, refunds the unused remainder from escrow to the customer
 * wallet, then runs the existing releaseEscrowInTransaction so the provider +
 * platform are paid on the ACTUAL hours. The cap (min with estimated) means the
 * customer is never charged above what they authorized; the money-conservation
 * guard inside releaseEscrowInTransaction still validates the final split.
 */
export async function settleHourlyAndReleaseInTransaction(
  client: PgClient,
  bookingId: string,
): Promise<commissionService.CommissionBreakdown> {
  const row = await client.query<{
    is_hourly: boolean;
    estimated_hours: string | null;
    work_started_at: Date | null;
    work_completed_at: Date | null;
    service_price: string;
    service_fee: string;
    total_amount: string;
    customer_id: string;
    min_billable_minutes: number | string | null;
    billing_increment_minutes: number | string | null;
  }>(
    `SELECT b.is_hourly, b.estimated_hours, b.work_started_at, b.work_completed_at,
            b.service_price, b.service_fee, b.total_amount, b.customer_id,
            ss.min_billable_minutes, ss.billing_increment_minutes
       FROM bookings b
       LEFT JOIN service_subcategories ss ON ss.id = b.subcategory_id
      WHERE b.id = $1 FOR UPDATE OF b`,
    [bookingId],
  );
  if (row.rows.length === 0) throw createAppError('Booking not found.', 404);
  const bk = row.rows[0]!;

  // Non-hourly (or un-priceable) bookings just take the standard release path.
  const estimatedHours = Number(bk.estimated_hours);
  const servicePrice = Number(bk.service_price);
  if (!bk.is_hourly || !(estimatedHours > 0) || !(servicePrice > 0)) {
    return releaseEscrowInTransaction(client, bookingId);
  }

  const { billedHours, newServicePrice, newServiceFee, newTotal, refundRemainder } =
    computeHourlySettlement({
      workStartedAt: bk.work_started_at,
      workCompletedAt: bk.work_completed_at,
      estimatedHours,
      servicePrice,
      serviceFee: Number(bk.service_fee),
      totalAmount: Number(bk.total_amount),
      minBillableMinutes: Number(bk.min_billable_minutes ?? 60) || 60,
      billingIncrementMinutes: Number(bk.billing_increment_minutes ?? 30) || 30,
    });

  // Rewrite the booking DOWN before release so the release + its conservation
  // guard see the reduced figures and pay out on ACTUAL hours.
  await client.query(
    `UPDATE bookings SET service_price = $2, service_fee = $3, total_amount = $4, billed_hours = $5, updated_at = NOW()
      WHERE id = $1`,
    [bookingId, newServicePrice, newServiceFee, newTotal, billedHours],
  );

  // E50: hourly settlement is a legitimate contract amendment, not a rewrite
  // of the authorization snapshot. Append a final version that preserves the
  // original commission/fee policy and records the server-clocked settlement.
  await financialTermsService.appendAmendedTermsInTransaction(
    client,
    {
      bookingId,
      event: 'hourly_settled',
      sourceEventId: 'server-clock-v1',
      metadata: {
        estimatedHours,
        billedHours,
        refundRemainderCentavos: refundRemainder,
      },
    },
  );

  if (refundRemainder > 0) {
    const platformWallets = await resolvePlatformWalletsInTransaction(client, ['platform_escrow']);
    const escrowWalletId = platformWallets.get('platform_escrow')!;
    const customerWallet = await walletService.getUserWalletInTransaction(client, bk.customer_id, 'customer');
    await walletService.lockWalletsForUpdate(client, [escrowWalletId, customerWallet.id]);
    const locked = await client.query<{ pending_balance: string }>(
      `SELECT pending_balance FROM wallets WHERE id = $1`, [escrowWalletId],
    );
    if (Number(locked.rows[0]?.pending_balance ?? 0) < refundRemainder) {
      throw createAppError('Insufficient escrow balance for hourly refund.', 409);
    }
    await client.query(
      `UPDATE wallets SET pending_balance = pending_balance - $1, updated_at = NOW() WHERE id = $2`,
      [refundRemainder, escrowWalletId],
    );
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'refund', $3, (SELECT pending_balance FROM wallets WHERE id = $1), $4)`,
      [escrowWalletId, bookingId, -refundRemainder, `Hourly unused-time release (${billedHours}h of ${estimatedHours}h)`],
    );
    await client.query(
      `UPDATE wallets SET available_balance = available_balance + $1, updated_at = NOW() WHERE id = $2`,
      [refundRemainder, customerWallet.id],
    );
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'refund', $3, (SELECT available_balance FROM wallets WHERE id = $1), 'Refund for unused time on hourly booking')`,
      [customerWallet.id, bookingId, refundRemainder],
    );
    logger.info('Hourly under-run refunded to customer', { bookingId, refundRemainder, billedHours, estimatedHours });
  }

  // Release the (reduced) escrow to the provider on actual hours.
  return releaseEscrowInTransaction(client, bookingId);
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
): Promise<{
  remainingEscrowCentavos: number;
  paymentMethod: string | null;
  customerWalletCredited: boolean;
}> {
  if (!Number.isSafeInteger(refundAmount) || refundAmount <= 0) {
    throw createAppError('Refund amount must be a positive integer (centavos).', 400);
  }

  const bookingResult = await client.query<{
    customer_id: string;
    payment_method: string | null;
  }>(
    `SELECT customer_id, payment_method
       FROM bookings
      WHERE id = $1
      FOR UPDATE`,
    [bookingId],
  );
  const booking = bookingResult.rows[0];
  if (!booking) throw createAppError('Booking not found.', 404);

  const wallets = await resolvePlatformWalletsInTransaction(client, ['platform_escrow']);
  const escrowWalletId = wallets.get('platform_escrow')!;
  const customerWallet = booking.payment_method === 'wallet'
    ? await walletService.getUserWalletInTransaction(client, booking.customer_id, 'customer')
    : null;
  await walletService.lockWalletsForUpdate(client, [escrowWalletId, customerWallet?.id]);

  const locked = await client.query<{ pending_balance: string }>(
    `SELECT pending_balance FROM wallets WHERE id = $1`,
    [escrowWalletId],
  );
  if (locked.rows.length === 0) {
    throw createAppError('Platform escrow wallet not found.', 500);
  }
  if (Number(locked.rows[0]!.pending_balance) < refundAmount) {
    throw createAppError('Insufficient escrow balance for refund.', 409);
  }

  // The platform escrow wallet is shared by every booking. Its total balance
  // is not evidence that this booking still owns the requested amount. Sum the
  // booking's own immutable ledger under the wallet lock before moving money.
  const bookingEscrow = await client.query<{ remaining: string }>(
    `SELECT COALESCE(SUM(amount), 0)::text AS remaining
       FROM wallet_transactions
      WHERE wallet_id = $1
        AND booking_id = $2`,
    [escrowWalletId, bookingId],
  );
  const remainingBefore = Number(bookingEscrow.rows[0]?.remaining ?? 0);
  if (!Number.isSafeInteger(remainingBefore) || remainingBefore < refundAmount) {
    throw createAppError(
      `Refund exceeds this booking's remaining escrow (${Math.max(0, remainingBefore)} centavos).`,
      409,
    );
  }

  await client.query(
    `UPDATE wallets SET pending_balance = pending_balance - $1, updated_at = NOW() WHERE id = $2`,
    [refundAmount, escrowWalletId],
  );

  await client.query(
    `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
     VALUES ($1, $2, 'refund', $3,
             (SELECT pending_balance FROM wallets WHERE id = $1),
             $4)`,
    [escrowWalletId, bookingId, -refundAmount, `Refund: ${reason}`],
  );

  if (customerWallet) {
    await client.query(
      `UPDATE wallets SET available_balance = available_balance + $1, updated_at = NOW() WHERE id = $2`,
      [refundAmount, customerWallet.id],
    );
    await client.query(
      `INSERT INTO wallet_transactions
         (wallet_id, booking_id, type, amount, balance_after, description, reference_id)
       VALUES ($1, $2, 'refund', $3,
               (SELECT available_balance FROM wallets WHERE id = $1),
               $4, $5)`,
      [customerWallet.id, bookingId, refundAmount, `Wallet refund: ${reason}`, bookingId],
    );
  }

  return {
    remainingEscrowCentavos: remainingBefore - refundAmount,
    paymentMethod: booking.payment_method,
    customerWalletCredited: customerWallet !== null,
  };
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

  const terms = await financialTermsService.getLatestTermsInTransaction(client, bookingId);
  if (
    terms.providerId !== bk.provider_id
    || terms.servicePriceCentavos !== cancellationBase
    || terms.serviceFeeAmountCentavos !== serviceFee
    || terms.totalAmountCentavos !== Number(bk.total_amount)
  ) {
    throw createAppError(
      'Booking does not match its immutable financial terms. Cancellation money movement is blocked for operations review.',
      409,
    );
  }

  const refund = financialTermsService.calculateCancellationFromTerms(
    cancellationBase,
    terms,
    hoursUntilScheduled,
    providerArrived,
    customerNoShow,
    bk.provider_id !== null,
  );

  const feeRefund = customerNoShow ? 0 : serviceFee;
  const totalCustomerRefund = refund.customerRefundAmount + feeRefund;

  // A5 — pre-resolve every wallet this cancellation may touch and lock them
  // (in id order) before any balance write, so it serializes cleanly with
  // concurrent releases/refunds on the shared escrow + revenue wallets. The
  // booking row is already locked (FOR UPDATE above), so the global lock order
  // is bookings -> wallets across every money path (deadlock-free).
  const needsProviderComp = refund.providerCompensationAmount > 0 && !!bk.provider_id;
  const needsNoShowFee = customerNoShow && serviceFee > 0;

  const platformWalletTypes: Array<'platform_escrow' | 'platform_revenue'> = needsNoShowFee
    ? ['platform_escrow', 'platform_revenue']
    : ['platform_escrow'];
  const platformWallets = await resolvePlatformWalletsInTransaction(client, platformWalletTypes);
  const escrowWalletId = platformWallets.get('platform_escrow')!;
  let providerWallet: { id: string } | null = null;
  if (needsProviderComp) {
    const providerRow = await client.query<ProviderRow>(
      `SELECT user_id, tier FROM providers WHERE id = $1`,
      [bk.provider_id],
    );
    const providerUserId = providerRow.rows[0]?.user_id;
    if (!providerUserId) throw createAppError('Provider not found.', 404);
    providerWallet = await walletService.getUserWalletInTransaction(client, providerUserId, 'provider');
  }
  const revenueWalletId = needsNoShowFee ? platformWallets.get('platform_revenue')! : null;

  await walletService.lockWalletsForUpdate(client, [
    escrowWalletId, providerWallet?.id, revenueWalletId,
  ]);

  if (totalCustomerRefund > 0) {
    await refundFromEscrowInTransaction(
      client,
      bookingId,
      totalCustomerRefund,
      'Cancellation refund (service price + service fee)',
    );
  }

  if (providerWallet) {
    await client.query(
      `UPDATE wallets SET pending_balance = pending_balance - $1, updated_at = NOW() WHERE id = $2`,
      [refund.providerCompensationAmount, escrowWalletId],
    );
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'escrow_release', $3,
               (SELECT pending_balance FROM wallets WHERE id = $1),
               'Escrow release for provider cancellation compensation')`,
      [escrowWalletId, bookingId, -refund.providerCompensationAmount],
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

  if (revenueWalletId) {
    await client.query(
      `UPDATE wallets SET pending_balance = pending_balance - $1, updated_at = NOW() WHERE id = $2`,
      [serviceFee, escrowWalletId],
    );
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'escrow_release', $3,
               (SELECT pending_balance FROM wallets WHERE id = $1),
               'Service fee retained — customer no-show')`,
      [escrowWalletId, bookingId, -serviceFee],
    );
    await client.query(
      `UPDATE wallets SET available_balance = available_balance + $1, updated_at = NOW() WHERE id = $2`,
      [serviceFee, revenueWalletId],
    );
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'commission', $3,
               (SELECT available_balance FROM wallets WHERE id = $1),
               'Service fee from customer no-show')`,
      [revenueWalletId, bookingId, serviceFee],
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
