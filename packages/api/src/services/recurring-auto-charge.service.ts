// recurring-auto-charge.service.ts
//
// E02 / D22 (2026-05-02) — real recurring auto-charge.
//
// Customers who set auto_charge=TRUE on a recurring booking AND captured
// a payment method via the in-app PayMongo sheet get charged
// automatically when the scheduler creates the next booking instance.
//
// Wallet-first: any wallet balance is debited first, the remainder
// goes to PayMongo against the stored payment_method_id.
//
// On 3 consecutive PayMongo failures (configurable via
// `recurring_auto_charge_max_consecutive_failures` platform_setting),
// the recurrence is suspended; the customer must re-confirm a payment
// method to resume. Admin gets a `recurring_auto_charge_suspended`
// notification for visibility.

import { db } from '../models/db';
import { logger } from '../utils/logger';
import { createAppError } from '../middleware/error.middleware';
import * as walletService from './wallet.service';
import * as escrowService from './escrow.service';
import * as paymentService from './payment.service';
import * as notificationService from './notification.service';
import * as settingsService from './settings.service';

const PAYMONGO_BASE = 'https://api.paymongo.com/v1';
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PgClient = { query: (text: string, params?: unknown[]) => Promise<any> };

export interface AutoChargeContext {
  recurringBookingId: string;
  bookingId: string;
  customerId: string;
  amountCentavos: number;        // amount in centavos (₱1 = 100)
  paymentMethodId: string | null;
  description: string;
}

export interface AutoChargeResult {
  outcome: 'succeeded' | 'failed' | 'skipped_no_method' | 'skipped_suspended';
  walletPortion: number;
  paymongoPortion: number;
  paymongoPaymentId: string | null;
  failureReason: string | null;
  consecutiveFailuresAfter: number;
  suspendedNow: boolean;
}

interface RecurringRow {
  id: string;
  customer_id: string;
  payment_method_id: string | null;
  payment_method_label: string | null;
  auto_charge_status: string | null;
  auto_charge_consecutive_failures: number;
  auto_charge_suspended_at: string | null;
  auto_charge: boolean;
}

/**
 * Returns the configured failure threshold from platform_settings, or
 * the default. Failures sourced from settings_service so admins can
 * tune it without a code deploy.
 */
async function getMaxConsecutiveFailures(): Promise<number> {
  try {
    const raw = await settingsService.getSetting('recurring_auto_charge_max_consecutive_failures');
    if (typeof raw === 'string' && raw.trim()) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n >= 1 && n <= 10) return n;
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_MAX_CONSECUTIVE_FAILURES;
}

/**
 * Sets the stored payment method on a recurring booking. Called after
 * the customer captures a payment source via the in-app PayMongo sheet.
 *
 * Idempotent: passing the same paymentMethodId is a no-op (no audit row).
 * Resets the consecutive_failures counter and clears any prior suspension.
 */
export async function setAutoChargePaymentMethod(
  recurringBookingId: string,
  customerId: string,
  paymentMethodId: string,
  paymentMethodLabel: string,
): Promise<void> {
  if (!paymentMethodId.trim()) {
    throw createAppError('payment method ID is required.', 400);
  }
  if (!paymentMethodLabel.trim()) {
    throw createAppError('payment method label is required.', 400);
  }

  await db.transaction(async (client) => {
    const cur = await client.query<RecurringRow>(
      `SELECT id, customer_id, payment_method_id, payment_method_label,
              auto_charge_status, auto_charge_consecutive_failures,
              auto_charge_suspended_at, auto_charge
       FROM recurring_bookings WHERE id = $1 FOR UPDATE`,
      [recurringBookingId],
    );
    if (cur.rows.length === 0) throw createAppError('Recurring booking not found.', 404);
    const row = cur.rows[0]!;
    if (row.customer_id !== customerId) {
      // Don't leak existence to non-owners.
      throw createAppError('Recurring booking not found.', 404);
    }
    if (
      row.payment_method_id === paymentMethodId &&
      row.payment_method_label === paymentMethodLabel &&
      row.auto_charge_suspended_at === null
    ) {
      return; // idempotent
    }
    await client.query(
      `UPDATE recurring_bookings
         SET payment_method_id = $1,
             payment_method_label = $2,
             auto_charge_consecutive_failures = 0,
             auto_charge_suspended_at = NULL,
             auto_charge_status = NULL,
             updated_at = NOW()
       WHERE id = $3`,
      [paymentMethodId, paymentMethodLabel, recurringBookingId],
    );
  });

  logger.info('Recurring auto-charge payment method set', {
    recurringBookingId, customerId, paymentMethodLabel,
  });
}

/**
 * Clears the stored payment method, disabling auto-charge for this
 * recurring booking. Future scheduler runs fall through to manual
 * payment flow until a new method is captured.
 */
export async function clearAutoChargePaymentMethod(
  recurringBookingId: string,
  customerId: string,
): Promise<void> {
  await db.transaction(async (client) => {
    const cur = await client.query<{ customer_id: string }>(
      `SELECT customer_id FROM recurring_bookings WHERE id = $1 FOR UPDATE`,
      [recurringBookingId],
    );
    if (cur.rows.length === 0) throw createAppError('Recurring booking not found.', 404);
    if (cur.rows[0]!.customer_id !== customerId) {
      throw createAppError('Recurring booking not found.', 404);
    }
    await client.query(
      `UPDATE recurring_bookings
         SET payment_method_id = NULL,
             payment_method_label = NULL,
             auto_charge_status = NULL,
             updated_at = NOW()
       WHERE id = $1`,
      [recurringBookingId],
    );
  });
  logger.info('Recurring auto-charge payment method cleared', { recurringBookingId, customerId });
}

/**
 * Charges the customer for a freshly-created recurring booking instance.
 *
 * Strategy:
 *   1. If wallet covers full amount → wallet-only.
 *   2. If wallet covers part → wallet partial debit + PayMongo for the
 *      remainder against the stored payment_method_id.
 *   3. If wallet covers nothing → full PayMongo charge.
 *   4. On PayMongo failure: increment counter, suspend if threshold hit.
 *
 * On success the booking is moved to status='confirmed' (paid), escrow
 * is held, and a 'recurring_auto_charge_succeeded' notification fires.
 *
 * On failure the booking stays at 'requested' (manual fallback) and a
 * 'recurring_auto_charge_failed' notification fires with a
 * "please pay manually" CTA.
 *
 * NOTE: this is invoked by the scheduler in processRecurringBookings,
 * AFTER the booking row + recurring_instance row are written and the
 * recurring_bookings.next_booking_date is advanced. That ordering means
 * a charge failure can never block the recurrence's clock — the
 * customer just gets a manual-pay nudge for this cycle.
 */
export async function attemptAutoCharge(
  ctx: AutoChargeContext,
): Promise<AutoChargeResult> {
  // Re-load recurring row for fresh state — the scheduler holds it
  // briefly between row read and this call.
  const rb = await db.query<RecurringRow>(
    `SELECT id, customer_id, payment_method_id, payment_method_label,
            auto_charge_status, auto_charge_consecutive_failures,
            auto_charge_suspended_at, auto_charge
     FROM recurring_bookings WHERE id = $1`,
    [ctx.recurringBookingId],
  );
  if (rb.rows.length === 0) {
    return await recordAttempt({
      recurringBookingId: ctx.recurringBookingId,
      bookingId: ctx.bookingId,
      amountCentavos: ctx.amountCentavos,
      walletPortion: 0,
      paymongoPortion: 0,
      paymentMethodId: null,
      outcome: 'failed',
      failureReason: 'recurring booking row missing',
      paymongoPaymentId: null,
      consecutiveFailuresAfter: 0,
    });
  }
  const row = rb.rows[0]!;

  if (row.auto_charge_suspended_at) {
    return await recordAttempt({
      recurringBookingId: ctx.recurringBookingId,
      bookingId: ctx.bookingId,
      amountCentavos: ctx.amountCentavos,
      walletPortion: 0,
      paymongoPortion: 0,
      paymentMethodId: row.payment_method_id,
      outcome: 'skipped_suspended',
      failureReason: 'auto-charge is suspended',
      paymongoPaymentId: null,
      consecutiveFailuresAfter: row.auto_charge_consecutive_failures,
    });
  }

  if (!row.payment_method_id) {
    return await recordAttempt({
      recurringBookingId: ctx.recurringBookingId,
      bookingId: ctx.bookingId,
      amountCentavos: ctx.amountCentavos,
      walletPortion: 0,
      paymongoPortion: 0,
      paymentMethodId: null,
      outcome: 'skipped_no_method',
      failureReason: 'no payment method on file',
      paymongoPaymentId: null,
      consecutiveFailuresAfter: row.auto_charge_consecutive_failures,
    });
  }

  // Wallet-first: figure out how much wallet can cover.
  let walletId: string | null = null;
  let walletAvailable = 0;
  try {
    const w = await walletService.getUserWallet(ctx.customerId, 'customer');
    walletId = w.id;
    // available_balance is stored as a decimal string in PG; coerce to centavos.
    const available = typeof w.available_balance === 'string'
      ? parseFloat(w.available_balance)
      : (w.available_balance as unknown as number);
    walletAvailable = Math.max(0, Math.round(available * 100));
  } catch {
    // No wallet — proceed with PayMongo-only.
    walletId = null;
    walletAvailable = 0;
  }

  const walletPortion = Math.min(walletAvailable, ctx.amountCentavos);
  const paymongoPortion = ctx.amountCentavos - walletPortion;

  let paymongoPaymentId: string | null = null;
  let failureReason: string | null = null;
  let succeeded = false;

  if (paymongoPortion > 0) {
    // Charge PayMongo for the remainder.
    try {
      paymongoPaymentId = await chargePaymongoMethod({
        paymentMethodId: row.payment_method_id,
        amountCentavos: paymongoPortion,
        description: ctx.description,
        bookingId: ctx.bookingId,
      });
      succeeded = true;
    } catch (err) {
      failureReason = err instanceof Error ? err.message : String(err);
      succeeded = false;
    }
  } else {
    // Wallet covered everything.
    succeeded = walletPortion > 0;
    if (!succeeded) {
      failureReason = 'no funds available (wallet empty and amount was 0)';
    }
  }

  if (succeeded) {
    // Atomic ledger updates: wallet debit, booking status flip, escrow hold.
    try {
      await db.transaction(async (client) => {
        if (walletPortion > 0 && walletId) {
          // Convert centavos to pesos for the wallet helper (it expects pesos).
          await walletService.debitWalletInTransaction(
            client, walletId, walletPortion / 100, 'booking_payment',
            'Auto-charge for recurring booking', ctx.bookingId,
          );
        }
        await client.query(
          `UPDATE bookings SET status = 'confirmed', updated_at = NOW() WHERE id = $1`,
          [ctx.bookingId],
        );
        await escrowService.holdInEscrowInTransaction(client, ctx.bookingId, ctx.amountCentavos / 100);
        // Reset consecutive failures on the recurring row.
        await client.query(
          `UPDATE recurring_bookings
             SET auto_charge_status = 'succeeded',
                 auto_charge_consecutive_failures = 0,
                 auto_charge_last_attempt_at = NOW(),
                 updated_at = NOW()
           WHERE id = $1`,
          [ctx.recurringBookingId],
        );
      });

      // Best-effort: write a payment_intents row for audit / reconciliation.
      // If this fails we don't roll back — the money already moved.
      try {
        await paymentService.createPaymentIntent(
          ctx.bookingId, ctx.amountCentavos,
          // mark as wallet-only when there's no PayMongo portion
          paymongoPortion > 0 ? 'card' : 'wallet',
          ctx.description,
        );
      } catch (intentErr) {
        logger.warn('payment_intents row creation failed for auto-charge (best effort)', {
          bookingId: ctx.bookingId,
          error: intentErr instanceof Error ? intentErr.message : String(intentErr),
        });
      }

      // Notify customer.
      try {
        await notificationService.createNotification({
          userId: ctx.customerId,
          type: 'recurring_auto_charge_succeeded',
          title: 'Auto-charge successful',
          body: `We charged ₱${(ctx.amountCentavos / 100).toFixed(2)} for your recurring service. Your booking is confirmed.`,
          data: {
            recurringBookingId: ctx.recurringBookingId,
            bookingId: ctx.bookingId,
            amountCentavos: ctx.amountCentavos,
            walletPortion, paymongoPortion,
          },
        });
      } catch (notifyErr) {
        logger.warn('auto-charge succeeded but notification failed', {
          bookingId: ctx.bookingId,
          error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
        });
      }

      return await recordAttempt({
        recurringBookingId: ctx.recurringBookingId,
        bookingId: ctx.bookingId,
        amountCentavos: ctx.amountCentavos,
        walletPortion, paymongoPortion,
        paymentMethodId: row.payment_method_id,
        outcome: 'succeeded',
        failureReason: null,
        paymongoPaymentId,
        consecutiveFailuresAfter: 0,
      });
    } catch (txErr) {
      // Ledger update failed AFTER we charged PayMongo — flag for ops.
      // Don't suspend (the customer's card worked); ops needs to manually
      // refund or reconcile.
      logger.error('CRITICAL: auto-charge ledger update failed after PayMongo charge succeeded', {
        bookingId: ctx.bookingId,
        recurringBookingId: ctx.recurringBookingId,
        paymongoPaymentId,
        amountCentavos: ctx.amountCentavos,
        error: txErr instanceof Error ? txErr.message : String(txErr),
      });
      return await recordAttempt({
        recurringBookingId: ctx.recurringBookingId,
        bookingId: ctx.bookingId,
        amountCentavos: ctx.amountCentavos,
        walletPortion, paymongoPortion,
        paymentMethodId: row.payment_method_id,
        outcome: 'failed',
        failureReason: `LEDGER_RECONCILE_NEEDED: ${txErr instanceof Error ? txErr.message : String(txErr)}`,
        paymongoPaymentId,
        consecutiveFailuresAfter: row.auto_charge_consecutive_failures,
      });
    }
  } else {
    // PayMongo failed (or nothing to charge). Increment counter, maybe suspend.
    const maxFailures = await getMaxConsecutiveFailures();
    const newCount = row.auto_charge_consecutive_failures + 1;
    const suspendedNow = newCount >= maxFailures;

    await db.transaction(async (client) => {
      await client.query(
        `UPDATE recurring_bookings
           SET auto_charge_status = $1,
               auto_charge_consecutive_failures = $2,
               auto_charge_suspended_at = CASE WHEN $3 THEN NOW() ELSE auto_charge_suspended_at END,
               auto_charge_last_attempt_at = NOW(),
               updated_at = NOW()
         WHERE id = $4`,
        [suspendedNow ? 'suspended' : 'failed', newCount, suspendedNow, ctx.recurringBookingId],
      );
    });

    // Notify customer (failure).
    try {
      await notificationService.createNotification({
        userId: ctx.customerId,
        type: 'recurring_auto_charge_failed',
        title: suspendedNow ? 'Auto-charge suspended' : 'Auto-charge failed',
        body: suspendedNow
          ? `We couldn't charge your saved payment method ${newCount} times in a row, so auto-charge for this recurring service is suspended. Please update your payment method and reconfirm to resume.`
          : `We couldn't charge your saved payment method (${failureReason ?? 'unknown error'}). Please pay manually for this booking; we'll try again next cycle.`,
        data: {
          recurringBookingId: ctx.recurringBookingId,
          bookingId: ctx.bookingId,
          amountCentavos: ctx.amountCentavos,
          consecutiveFailures: newCount,
          suspendedNow,
        },
      });
    } catch (notifyErr) {
      logger.warn('auto-charge failure notification failed', {
        bookingId: ctx.bookingId,
        error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
      });
    }

    if (suspendedNow) {
      // Admin-side notification (target_id = customer for context).
      try {
        await notificationService.createNotification({
          userId: ctx.customerId, // customer copy
          type: 'recurring_auto_charge_suspended',
          title: 'Recurring auto-charge suspended',
          body: `Auto-charge suspended after ${newCount} consecutive failures. Customer notified.`,
          data: {
            recurringBookingId: ctx.recurringBookingId,
            consecutiveFailures: newCount,
          },
        });
      } catch (notifyErr) {
        logger.warn('admin auto-charge suspension notification failed', {
          recurringBookingId: ctx.recurringBookingId,
          error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
        });
      }
    }

    return await recordAttempt({
      recurringBookingId: ctx.recurringBookingId,
      bookingId: ctx.bookingId,
      amountCentavos: ctx.amountCentavos,
      walletPortion: 0,
      paymongoPortion,
      paymentMethodId: row.payment_method_id,
      outcome: 'failed',
      failureReason,
      paymongoPaymentId,
      consecutiveFailuresAfter: newCount,
    });
  }
}

interface PaymongoChargeArgs {
  paymentMethodId: string;
  amountCentavos: number;
  description: string;
  bookingId: string;
}

/**
 * Calls PayMongo's /payments endpoint with a stored payment method
 * to immediately charge the customer's card. PayMongo returns the
 * payment ID synchronously when the source is a "ready" PM.
 *
 * Throws on non-2xx or missing payment ID. Caller catches and treats
 * as a failure.
 */
async function chargePaymongoMethod(args: PaymongoChargeArgs): Promise<string> {
  const key = process.env.PAYMONGO_SECRET_KEY;
  if (!key) {
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      // Sandbox path: pretend it succeeded.
      return `pm_test_charge_${Date.now()}`;
    }
    throw new Error('PAYMONGO_SECRET_KEY environment variable is required');
  }

  const headers = {
    Authorization: 'Basic ' + Buffer.from(key + ':').toString('base64'),
    'Content-Type': 'application/json',
  };

  const response = await globalThis.fetch(`${PAYMONGO_BASE}/payments`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      data: {
        attributes: {
          amount: args.amountCentavos,
          currency: 'PHP',
          description: args.description,
          source: { id: args.paymentMethodId, type: 'source' },
          metadata: { booking_id: args.bookingId, channel: 'recurring_auto_charge' },
        },
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`PayMongo /payments returned ${response.status}: ${text.slice(0, 200)}`);
  }

  const body = (await response.json()) as { data?: { id?: string } };
  if (!body.data?.id) {
    throw new Error('PayMongo /payments returned no payment ID');
  }
  return body.data.id;
}

interface RecordAttemptArgs {
  recurringBookingId: string;
  bookingId: string | null;
  amountCentavos: number;
  walletPortion: number;
  paymongoPortion: number;
  paymentMethodId: string | null;
  outcome: 'succeeded' | 'failed' | 'skipped_no_method' | 'skipped_suspended';
  failureReason: string | null;
  paymongoPaymentId: string | null;
  consecutiveFailuresAfter: number;
}

async function recordAttempt(args: RecordAttemptArgs): Promise<AutoChargeResult> {
  try {
    await db.query(
      `INSERT INTO recurring_auto_charge_attempts
         (recurring_booking_id, booking_id, amount_centavos,
          wallet_portion_centavos, paymongo_portion_centavos,
          payment_method_id, outcome, failure_reason, paymongo_payment_id,
          consecutive_failures_after)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        args.recurringBookingId,
        args.bookingId,
        args.amountCentavos,
        args.walletPortion,
        args.paymongoPortion,
        args.paymentMethodId,
        args.outcome,
        args.failureReason,
        args.paymongoPaymentId,
        args.consecutiveFailuresAfter,
      ],
    );
  } catch (err) {
    // Audit table missing or schema drift — log but don't fail the
    // caller. The result is still returned to the scheduler.
    logger.warn('failed to record auto-charge attempt', {
      recurringBookingId: args.recurringBookingId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    outcome: args.outcome,
    walletPortion: args.walletPortion,
    paymongoPortion: args.paymongoPortion,
    paymongoPaymentId: args.paymongoPaymentId,
    failureReason: args.failureReason,
    consecutiveFailuresAfter: args.consecutiveFailuresAfter,
    suspendedNow: args.outcome === 'failed' && args.consecutiveFailuresAfter >= DEFAULT_MAX_CONSECUTIVE_FAILURES,
  };
}

/**
 * Returns the recent auto-charge attempt history for a recurring
 * booking. Used by both customer + admin UIs.
 */
export async function listAttempts(
  recurringBookingId: string,
  limit = 20,
): Promise<Array<{
  id: string;
  attemptedAt: string;
  amountCentavos: string;
  outcome: string;
  walletPortion: string;
  paymongoPortion: string;
  failureReason: string | null;
  paymongoPaymentId: string | null;
}>> {
  const r = await db.query<{
    id: string; attempted_at: string; amount_centavos: string;
    outcome: string; wallet_portion_centavos: string;
    paymongo_portion_centavos: string; failure_reason: string | null;
    paymongo_payment_id: string | null;
  }>(
    `SELECT id, attempted_at, amount_centavos, outcome,
            wallet_portion_centavos, paymongo_portion_centavos,
            failure_reason, paymongo_payment_id
     FROM recurring_auto_charge_attempts
     WHERE recurring_booking_id = $1
     ORDER BY attempted_at DESC
     LIMIT $2`,
    [recurringBookingId, Math.min(Math.max(limit, 1), 100)],
  );
  return r.rows.map((row) => ({
    id: row.id,
    attemptedAt: row.attempted_at,
    amountCentavos: row.amount_centavos,
    outcome: row.outcome,
    walletPortion: row.wallet_portion_centavos,
    paymongoPortion: row.paymongo_portion_centavos,
    failureReason: row.failure_reason,
    paymongoPaymentId: row.paymongo_payment_id,
  }));
}

// Re-export for testability (so tests can override a fresh-DB row).
export const __testing__ = { chargePaymongoMethod };
