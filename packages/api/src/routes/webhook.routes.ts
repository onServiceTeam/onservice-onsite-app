import { Router, Request, Response, NextFunction } from 'express';
import * as paymentService from '../services/payment.service';
import * as escrowService from '../services/escrow.service';
import * as walletService from '../services/wallet.service';
import * as notificationService from '../services/notification.service';
import { db } from '../models/db';
import { logger } from '../utils/logger';
import crypto from 'node:crypto';

const router = Router();

const WEBHOOK_REPLAY_WINDOW_MS = 5 * 60 * 1000;

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

      const isTopUp = bookingId?.startsWith('topup_') ?? false;

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
            logger.error('Webhook amount mismatch', {
              bookingId, webhookAmount, intentAmount: intent.amount,
            });
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

          const updateResult = await db.query(
            `UPDATE bookings SET status = 'paid', escrow_status = 'held', updated_at = NOW()
             WHERE id = $1 AND status = 'payment_pending' RETURNING id`,
            [bookingId],
          );
          if ((updateResult.rowCount ?? 0) === 0) {
            logger.info('Webhook: booking already paid or not in payment_pending', { bookingId });
            break;
          }

          const booking = await db.query<BookingRow>(
            `SELECT id, customer_id, provider_id, status, total_amount FROM bookings WHERE id = $1`,
            [bookingId],
          );
          if (booking.rows[0]) {
            await escrowService.holdInEscrow(bookingId, Number(booking.rows[0].total_amount));
            await notificationService.notifyBookingStatusChange(
              booking.rows[0].customer_id, bookingId, 'paid',
            );
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
