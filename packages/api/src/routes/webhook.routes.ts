import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
// Phase L typecheck fix — `import * as Sentry from '@sentry/node'` is
// the canonical shape and works at runtime (captureMessage is
// re-exported from @sentry/core via the index barrel). The TypeScript
// barrel sometimes loses the re-export under namespace import; we
// cast the namespace once to expose the full surface. Behaviour is
// unchanged from the pre-fix shape — only the type lookup differs.
import * as SentryRaw from '@sentry/node';
const Sentry = SentryRaw as typeof SentryRaw & typeof import('@sentry/core');
import * as paymentService from '../services/payment.service';
import * as escrowService from '../services/escrow.service';
import * as walletService from '../services/wallet.service';
import * as notificationService from '../services/notification.service';
import * as securityService from '../services/security.service';
import * as bookingOfferService from '../services/booking-offer.service';
import { db } from '../models/db';
import { logger } from '../utils/logger';
import crypto from 'node:crypto';

const router = Router();

const WEBHOOK_REPLAY_WINDOW_MS = 5 * 60 * 1000;

// MED-N164 fix — defense-in-depth rate limit on the PayMongo webhook
// endpoint. The signature check is the primary defense (rejects
// non-PayMongo callers), but a flood of well-formed-but-unmatched
// webhooks (e.g., spoofed by an attacker who somehow obtained the
// secret) would consume DB queries on the booking lookup. PayMongo's
// actual delivery rate is bounded; 100/min per source IP is plenty of
// headroom while still walling off any flood.
const webhookRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message: 'Webhook rate limit exceeded.',
      statusCode: 429,
    },
  },
});

// MED-N169 fix — distinct sentinel value so the route can return a
// 503 ("server misconfigured") instead of a 401 ("invalid signature")
// when PAYMONGO_WEBHOOK_SECRET is missing. Pre-fix the missing-secret
// case looked identical to a real signature mismatch in the response,
// making it look to PayMongo's webhook dashboard like the integration
// was rejecting events deliberately. The boot-time check in
// server.ts (CRIT-M04 fix) catches this in production, but staging /
// local dev without the env still need clear feedback.
class WebhookSecretMissingError extends Error {}

function verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret) {
    logger.error('PAYMONGO_WEBHOOK_SECRET not set — rejecting webhook for security');
    throw new WebhookSecretMissingError('PAYMONGO_WEBHOOK_SECRET not configured');
  }

  const parts = signatureHeader.split(',');
  const timestampPart = parts.find((p) => p.startsWith('t='));
  const signaturePart = parts.find((p) => p.startsWith('te='));

  if (!timestampPart || !signaturePart) return false;

  const timestamp = timestampPart.slice(2);
  const receivedSig = signaturePart.slice(3);

  const tsMs = Number(timestamp) * 1000;
  if (Number.isNaN(tsMs) || Math.abs(Date.now() - tsMs) > WEBHOOK_REPLAY_WINDOW_MS) {
    logger.warn('Webhook timestamp outside replay window', { timestamp });
    return false;
  }

  const payload = `${timestamp}.${rawBody}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  try {
    const receivedBuf = Buffer.from(receivedSig);
    const expectedBuf = Buffer.from(expectedSig);
    if (receivedBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(receivedBuf, expectedBuf);
  } catch {
    return false;
  }
}

interface BookingRow {
  id: string;
  customer_id: string;
  provider_id: string | null;
  status: string;
  total_amount: string;
}

router.post(
  '/paymongo',
  webhookRateLimit, // MED-N164
  async (req: Request, res: Response, next: NextFunction) => {
    // Declared outside the try so the catch can release the idempotency claim.
    let claimedEventId: string | null = null;
    try {
      const signature = req.headers['paymongo-signature'];
      if (typeof signature !== 'string' || !signature) {
        logger.warn('Missing PayMongo webhook signature header');
        res.status(401).json({ success: false, error: { message: 'Missing signature' } });
        return;
      }

      const rawBody = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body);
      try {
        if (!verifyWebhookSignature(rawBody, signature)) {
          logger.warn('Invalid PayMongo webhook signature');
          res.status(401).json({ success: false, error: { message: 'Invalid signature' } });
          return;
        }
      } catch (err) {
        if (err instanceof WebhookSecretMissingError) {
          // MED-N169 fix — distinguish "we couldn't verify because
          // we're misconfigured" from "we verified and it failed".
          res.status(503).json({
            success: false,
            error: { message: 'Webhook verification temporarily unavailable.' },
          });
          return;
        }
        throw err;
      }

      const event = req.body?.data?.attributes;
      if (!event) {
        res.status(400).json({ success: false, error: { message: 'Invalid webhook payload' } });
        return;
      }

      const eventType: string = event.type;
      const paymentData = event.data?.attributes;
      const paymongoPaymentId: string =
        typeof event.data?.id === 'string' ? event.data.id : '';
      const bookingId: string | undefined = paymentData?.metadata?.booking_id;

      // A paid event without PayMongo's immutable payment id cannot be safely
      // deduplicated in the wallet ledger or traced for a later refund. Reject
      // it before claiming the event or changing any local money state.
      if (eventType === 'payment.paid' && !paymongoPaymentId.startsWith('pay_')) {
        logger.warn('PayMongo payment.paid webhook missing a valid payment id');
        res.status(400).json({
          success: false,
          error: { message: 'Invalid payment.paid payload' },
        });
        return;
      }

      logger.info('PayMongo webhook received', { eventType, paymongoPaymentId, bookingId });

      // MED-N157 fix — prefer an explicit metadata field over string-prefix
      // detection. If PayMongo metadata carries `intent_kind: 'top_up'` we
      // trust that. Otherwise fall back to the legacy `topup_` prefix
      // sniff (back-compat for any pre-fix top-up flows still in flight).
      // Going forward all top-up intent creation should set intent_kind.
      const intentKind: string | undefined = paymentData?.metadata?.intent_kind;
      const isTopUp =
        intentKind === 'top_up' ||
        (intentKind === undefined && (bookingId?.startsWith('topup_') ?? false));

      // §33 idempotency gate — claim this PayMongo event before doing any work.
      // The event id (envelope `data.id`) is stable across PayMongo's retries.
      const eventId: string | undefined = req.body?.data?.id;
      if (eventId) {
        const claim = await db.query<{ event_id: string }>(
          `INSERT INTO webhook_events (event_id, event_type, status)
           VALUES ($1, $2, 'processing')
           ON CONFLICT (event_id) DO UPDATE
             SET event_type = EXCLUDED.event_type,
                 status = 'processing',
                 received_at = NOW(),
                 completed_at = NULL
           WHERE webhook_events.status = 'processing'
             AND webhook_events.received_at < NOW() - INTERVAL '15 minutes'
           RETURNING event_id`,
          [eventId, eventType],
        );
        if (claim.rows.length === 0) {
          // Already claimed: 'done' = a true duplicate; a recent 'processing'
          // row = a concurrent delivery still running. Claims left by a dead
          // process are reclaimed atomically by the INSERT above after 15
          // minutes. Do not reprocess a recent in-flight delivery.
          const existing = await db.query<{ status: string }>(
            `SELECT status FROM webhook_events WHERE event_id = $1`,
            [eventId],
          );
          logger.info('Duplicate PayMongo webhook event — skipping (idempotent)', {
            eventId, eventType, existingStatus: existing.rows[0]?.status,
          });
          res.json({ success: true, data: { received: true, idempotent: true } });
          return;
        }
        claimedEventId = eventId;
      }

      switch (eventType) {
        case 'payment.paid': {
          if (!bookingId) break;

          // BUG-PHASE27-01 fix — topup intents store the topup_<userId>_<ts>
          // string in payment_intents.topup_id (migration 122), NOT in
          // booking_id (which is uuid). Route the lookup based on isTopUp.
          const intent = isTopUp
            ? await paymentService.getTopupPaymentIntent(bookingId)
            : await paymentService.getBookingPaymentIntent(bookingId);
          if (!intent) {
            logger.warn('Webhook: no payment intent found', { bookingId, isTopUp });
            break;
          }

          const webhookAmount = paymentData?.amount;
          if (webhookAmount != null && Number(webhookAmount) !== Number(intent.amount)) {
            // MED-N155 fix: payment.amount mismatch is a potential
            // tampering signal. Pre-fix: only logger.error + break.
            // Post-fix: also (a) Sentry capture for ops alerting and
            // (b) security_events row for the admin Compliance dash.
            const mismatchInfo = {
              bookingId,
              intentId: intent.id,
              webhookAmount: Number(webhookAmount),
              intentAmount: Number(intent.amount),
              deltaCentavos: Number(webhookAmount) - Number(intent.amount),
              paymongoPaymentId,
            };
            logger.error('Webhook amount mismatch — POSSIBLE TAMPERING', mismatchInfo);
            // Best-effort Sentry capture; never let alerting failures
            // mask the underlying mismatch.
            try {
              Sentry.captureMessage('Webhook payment.amount mismatch', {
                level: 'error',
                extra: mismatchInfo,
              });
            } catch (sentryErr) {
              logger.warn('Sentry capture failed for amount mismatch', {
                error: sentryErr instanceof Error ? sentryErr.message : String(sentryErr),
              });
            }
            // Best-effort DB audit; same — alerting must not throw.
            try {
              await securityService.logSecurityEvent({
                eventType: 'payment_amount_mismatch',
                metadata: mismatchInfo,
              });
            } catch (auditErr) {
              logger.warn('security_events insert failed for amount mismatch', {
                error: auditErr instanceof Error ? auditErr.message : String(auditErr),
              });
            }
            break;
          }

          if (isTopUp) {
            const topUpParts = bookingId.split('_');
            const userId = topUpParts.slice(1, -1).join('_');
            const topUpAmount = Number(intent.amount);

            if (!userId || topUpAmount <= 0) {
              logger.error('Webhook: invalid top-up metadata', { bookingId, userId, topUpAmount });
              break;
            }

            try {
              await db.transaction(async (client) => {
                // Serialize different PayMongo event ids for the same intent.
                const lockedIntent = await client.query<{ status: string }>(
                  `SELECT status FROM payment_intents WHERE id = $1 FOR UPDATE`,
                  [intent.id],
                );
                if (!lockedIntent.rows[0]) throw new Error('Top-up payment intent disappeared during processing.');
                if (lockedIntent.rows[0].status === 'succeeded') {
                  logger.info('Webhook: top-up intent already processed after lock', { intentId: intent.id });
                  return;
                }
                const wallet = await walletService.getUserWalletInTransaction(client, userId, 'customer');
                const alreadyCredited = await client.query(
                  `SELECT 1 FROM wallet_transactions
                    WHERE wallet_id = $1 AND reference_id = $2
                    LIMIT 1`,
                  [wallet.id, paymongoPaymentId],
                );
                if (alreadyCredited.rows.length === 0) {
                  await walletService.creditWalletInTransaction(
                    client,
                    wallet.id,
                    topUpAmount,
                    'payment',
                    `Wallet top-up via ${intent.payment_method}`,
                    undefined,
                    paymongoPaymentId,
                  );
                }
                await paymentService.updatePaymentStatusInTransaction(
                  client, intent.id, 'succeeded', paymongoPaymentId,
                );
              });
              logger.info('Wallet top-up credited', { userId, topUpAmount, paymongoPaymentId });
            } catch (topUpErr) {
              logger.error('Wallet top-up credit failed', {
                userId,
                topUpAmount,
                error: topUpErr instanceof Error ? topUpErr.message : 'Unknown',
              });
              throw topUpErr;
            }
            break;
          }

          // MED-N156 fix — pre-fix the UPDATE bookings + holdInEscrow
          // were two non-atomic operations. If holdInEscrow failed
          // after the booking UPDATE committed, the booking was
          // 'paid'+'held' but the escrow wallet's pending_balance
          // wasn't actually credited — money invariant broken.
          //
          // Post-fix: both writes run inside a single db.transaction
          // via holdInEscrowInTransaction. Either both commit or
          // neither does. Webhook returns 5xx on failure which causes
          // PayMongo to retry. Customer notification fires AFTER
          // commit in try/catch (best-effort, never blocks).
          let bookingForNotify: BookingRow | null = null;
          try {
            await db.transaction(async (client) => {
              // Lock the local intent first so distinct valid event ids for the
              // same PayMongo payment cannot race this booking/escrow update.
              const lockedIntent = await client.query<{ status: string }>(
                `SELECT status FROM payment_intents WHERE id = $1 FOR UPDATE`,
                [intent.id],
              );
              if (!lockedIntent.rows[0]) throw new Error('Booking payment intent disappeared during processing.');
              if (lockedIntent.rows[0].status === 'succeeded') {
                logger.info('Webhook: booking intent already processed after lock', { intentId: intent.id });
                return;
              }
              const updateResult = await client.query<{ id: string }>(
                `UPDATE bookings SET status = 'paid', escrow_status = 'held', updated_at = NOW()
                 WHERE id = $1 AND status = 'payment_pending' RETURNING id`,
                [bookingId],
              );
              if ((updateResult.rowCount ?? 0) === 0) {
                // Already paid (idempotent webhook re-delivery) or in
                // an unexpected status. Bail out of the trx without
                // doing anything.
                logger.info('Webhook: booking already paid or not in payment_pending', { bookingId });
                await paymentService.updatePaymentStatusInTransaction(
                  client, intent.id, 'succeeded', paymongoPaymentId,
                );
                return;
              }
              const booking = await client.query<BookingRow>(
                `SELECT id, customer_id, provider_id, status, total_amount FROM bookings WHERE id = $1`,
                [bookingId],
              );
              if (booking.rows[0]) {
                await escrowService.holdInEscrowInTransaction(
                  client,
                  bookingId,
                  Number(booking.rows[0].total_amount),
                );
                bookingForNotify = booking.rows[0];
              }
              await paymentService.updatePaymentStatusInTransaction(
                client, intent.id, 'succeeded', paymongoPaymentId,
              );
            });
          } catch (escrowErr) {
            // Both the UPDATE and the escrow hold rolled back. Surface
            // the error so PayMongo retries; admin gets the log.
            logger.error('Webhook payment.paid trx failed (booking + escrow rolled back)', {
              bookingId,
              error: escrowErr instanceof Error ? escrowErr.message : 'Unknown',
            });
            throw escrowErr;
          }

          if (bookingForNotify) {
            try {
              await notificationService.notifyBookingStatusChange(
                (bookingForNotify as BookingRow).customer_id, bookingId, 'paid',
              );
            } catch (notifyErr) {
              logger.error('Webhook payment.paid notification failed', {
                bookingId,
                error: notifyErr instanceof Error ? notifyErr.message : 'Unknown',
              });
            }
            // Instant-pay: the booking just became paid — ensure a provider is
            // being matched (no-op if one is already assigned/pending). Only
            // runs on a real paid transition, not idempotent re-deliveries
            // (bookingForNotify is null when the UPDATE matched no rows).
            await bookingOfferService.dispatchPaidBookingIfNeeded(bookingId);
          }
          break;
        }

        case 'payment.failed': {
          if (!bookingId) break;
          // BUG-PHASE27-01 — same routing as payment.paid above.
          const intent = isTopUp
            ? await paymentService.getTopupPaymentIntent(bookingId)
            : await paymentService.getBookingPaymentIntent(bookingId);
          if (intent) {
            if (intent.status === 'failed' || intent.status === 'succeeded') {
              logger.info('Webhook: payment.failed skipped — intent already terminal', {
                bookingId, intentId: intent.id, currentStatus: intent.status,
              });
              break;
            }
            await paymentService.updatePaymentStatus(intent.id, 'failed');
            if (!isTopUp) {
              await db.query(
                `UPDATE bookings SET status = 'payment_pending', updated_at = NOW() WHERE id = $1 AND status = 'payment_pending'`,
                [bookingId],
              );
            }
          }
          break;
        }

        default:
          logger.info('Unhandled webhook event type', { eventType });
      }

      if (claimedEventId) {
        await db.query(
          `UPDATE webhook_events SET status = 'done', completed_at = NOW() WHERE event_id = $1`,
          [claimedEventId],
        );
      }
      res.json({ success: true, data: { received: true } });
    } catch (error) {
      // Processing failed — release the claim so PayMongo's retry reprocesses
      // (this is what fixes the "lost credit" case: a failed creditWallet no
      // longer leaves the event marked handled with nothing done).
      if (claimedEventId) {
        try {
          await db.query(
            `DELETE FROM webhook_events WHERE event_id = $1 AND status = 'processing'`,
            [claimedEventId],
          );
        } catch (delErr) {
          logger.error('Failed to release webhook idempotency claim', {
            eventId: claimedEventId,
            error: delErr instanceof Error ? delErr.message : String(delErr),
          });
        }
      }
      next(error);
    }
  },
);

export default router;
