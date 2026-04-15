import { Router, Request, Response, NextFunction } from 'express';
import * as paymentService from '../services/payment.service';
import * as escrowService from '../services/escrow.service';
import * as notificationService from '../services/notification.service';
import { db } from '../models/db';
import { logger } from '../utils/logger';
import crypto from 'node:crypto';

const router = Router();

function verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn('PAYMONGO_WEBHOOK_SECRET not set — skipping signature verification');
    return true;
  }

  const parts = signatureHeader.split(',');
  const timestampPart = parts.find((p) => p.startsWith('t='));
  const signaturePart = parts.find((p) => p.startsWith('te='));

  if (!timestampPart || !signaturePart) return false;

  const timestamp = timestampPart.slice(2);
  const receivedSig = signaturePart.slice(3);

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
      if (typeof signature === 'string') {
        const rawBody = JSON.stringify(req.body);
        if (!verifyWebhookSignature(rawBody, signature)) {
          logger.warn('Invalid PayMongo webhook signature');
          res.status(401).json({ success: false, error: { message: 'Invalid signature' } });
          return;
        }
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

      switch (eventType) {
        case 'payment.paid': {
          if (!bookingId) break;

          const intent = await paymentService.getBookingPaymentIntent(bookingId);
          if (!intent) {
            logger.warn('Webhook: no payment intent found', { bookingId });
            break;
          }

          await paymentService.updatePaymentStatus(intent.id, 'succeeded', paymongoPaymentId);

          await db.query(
            `UPDATE bookings SET status = 'paid', escrow_status = 'held', updated_at = NOW() WHERE id = $1 AND status = 'payment_pending'`,
            [bookingId],
          );

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
            await paymentService.updatePaymentStatus(intent.id, 'failed');
            await db.query(
              `UPDATE bookings SET status = 'payment_pending', updated_at = NOW() WHERE id = $1`,
              [bookingId],
            );
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
