import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import * as Sentry from '@sentry/node';
import * as paymentService from '../services/payment.service';
import * as escrowService from '../services/escrow.service';
import * as walletService from '../services/wallet.service';
import * as notificationService from '../services/notification.service';
import * as securityService from '../services/security.service';
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

function verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret) {
    logger.error('PAYMONGO_WEBHOOK_SECRET not set — rejecting webhook for security');
    return false;
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
    try {
      const signature = req.headers['paymongo-signature'];
      if (typeof signature !== 'string' || !signature) {
        logger.warn('Missing PayMongo webhook signature header');
        res.status(401).json({ success: false, error: { message: 'Missing signature' } });
        return;
      }

      const rawBody = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body);
      if (!verifyWebhookSignature(rawBody, signature)) {
        logger.warn('Invalid PayMongo webhook signature');
        res.status(401).json({ success: false, error: { message: 'Invalid signature' } });
        return;
      }

      const event = req.body?.data?.attributes;
      if (!event) {
        res.status(400).json({ success: false, error: { message: 'Invalid webhook payload' } });
        return;
      }

      const eventType: string = event.type;
      const paymentData = event.data?.attributes;
      const paymongoPaymentId: string = event.data?.id;
      const bookingId: string | undefined = paymentData?.metadata?.booking_id;

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

      switch (eventType) {
        case 'payment.paid': {
          if (!bookingId) break;

          const intent = await paymentService.getBookingPaymentIntent(bookingId);
          if (!intent) {
            logger.warn('Webhook: no payment intent found', { bookingId });
            break;
          }

          if (intent.status === 'succeeded') {
            logger.info('Webhook: payment already processed (idempotent skip)', { bookingId, intentId: intent.id });
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

          await paymentService.updatePaymentStatus(intent.id, 'succeeded', paymongoPaymentId);

          if (isTopUp) {
            const topUpParts = bookingId.split('_');
            const userId = topUpParts.slice(1, -1).join('_');
            const topUpAmount = Number(intent.amount);

            if (!userId || topUpAmount <= 0) {
              logger.error('Webhook: invalid top-up metadata', { bookingId, userId, topUpAmount });
              break;
            }

            try {
              const wallet = await walletService.getUserWallet(userId, 'customer');
              await walletService.creditWallet(
                wallet.id,
                topUpAmount,
                'payment',
                `Wallet top-up via ${intent.payment_method}`,
                undefined,
                paymongoPaymentId,
              );
              logger.info('Wallet top-up credited', { userId, topUpAmount, paymongoPaymentId });
            } catch (topUpErr) {
              logger.error('Wallet top-up credit failed', {
                userId,
                topUpAmount,
                error: topUpErr instanceof Error ? topUpErr.message : 'Unknown',
              });
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
          }
          break;
        }

        case 'payment.failed': {
          if (!bookingId) break;
          const intent = await paymentService.getBookingPaymentIntent(bookingId);
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

      res.json({ success: true, data: { received: true } });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
