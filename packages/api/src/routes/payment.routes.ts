import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { createPaymentIntentSchema } from '../validators/payment.validators';
import * as paymentService from '../services/payment.service';
import * as walletService from '../services/wallet.service';
import * as escrowService from '../services/escrow.service';
import * as bookingService from '../services/booking.service';
import * as bookingOfferService from '../services/booking-offer.service';
import { createAppError } from '../middleware/error.middleware';
import { canTransition, BookingStatus } from '../types/booking.types';
import { db } from '../models/db';
import { assertExternalPaymentAuthorizationEnabled } from '../services/external-payment-hold.service';
import * as financialTermsService from '../services/booking-financial-terms.service';

const router = Router();

router.post(
  '/intent',
  authMiddleware,
  validationMiddleware(createPaymentIntentSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { bookingId, paymentMethod } = req.body;
      const userId = req.user!.userId;

      if (paymentMethod === 'wallet') {
        // OPS-212: lock and re-read the booking inside the same transaction as
        // every money write. The previous route created the payment intent and
        // set payment_pending before opening the transaction. A failed debit
        // therefore left an orphan intent and a stuck booking, while two taps
        // could race. The booking row lock now serializes retries and all local
        // wallet/escrow state commits or rolls back together.
        const intent = await db.transaction(async (client) => {
          const bookingResult = await client.query<{
            customer_id: string;
            status: string;
            total_amount: string;
            provider_id: string | null;
            schedule_passed: boolean;
          }>(
            `SELECT customer_id, status, total_amount, provider_id,
                    scheduled_at <= NOW() AS schedule_passed
               FROM bookings
              WHERE id = $1
              FOR UPDATE`,
            [bookingId],
          );
          const booking = bookingResult.rows[0];
          if (!booking) throw createAppError('Booking not found.', 404);
          if (booking.customer_id !== userId) {
            throw createAppError('Only the booking customer can create a payment intent.', 403);
          }
          // OPS-559: accepting a custom quote (acceptQuote) leaves the booking
          // at payment_pending with the quoting provider assigned and no
          // payment record, so the wallet also pays a payment_pending
          // booking. D35 Q10 interim: only while the booking has no payment
          // record at all, failed attempts included (a failed card or GCash
          // attempt could still complete later). D35 Q12 interim: not once its
          // scheduled time has passed, and not while the quoting provider is
          // not approved. The payment-record and scheduled-time checks run
          // under the booking lock above; the provider's status is read once,
          // at payment time (a suspension a moment later is the D35 Q3 case).
          // 'matched' and 'requested' bookings keep the earlier rules.
          const awaitingPayment = booking.status === 'payment_pending';
          if (!awaitingPayment && !canTransition(booking.status as BookingStatus, 'payment_pending')) {
            throw createAppError(`Cannot pay for a booking in "${booking.status}" status.`, 409);
          }
          if (awaitingPayment) {
            const anyPayment = await client.query(
              `SELECT 1 FROM payment_intents WHERE booking_id = $1 LIMIT 1`,
              [bookingId],
            );
            if ((anyPayment.rowCount ?? 0) > 0) {
              throw createAppError(
                'This booking already has a payment attempt. Please contact support to complete it.',
                409,
              );
            }
            if (booking.schedule_passed) {
              throw createAppError(
                'The scheduled time for this booking has passed. Please contact support before paying.',
                409,
              );
            }
            if (booking.provider_id) {
              const provider = await client.query<{ status: string }>(
                `SELECT status FROM providers WHERE id = $1`,
                [booking.provider_id],
              );
              if (provider.rows[0]?.status !== 'approved') {
                throw createAppError(
                  'The provider for this booking is not available right now. Please contact support before paying.',
                  409,
                );
              }
            }
          }

          const amount = Number(booking.total_amount);
          const customerWallet = await walletService.getUserWalletInTransaction(client, userId, 'customer');
          const walletIntent = await paymentService.createWalletPaymentIntentInTransaction(client, bookingId, amount);

          await walletService.debitWalletInTransaction(
            client,
            customerWallet.id,
            amount,
            'payment',
            `Payment for booking`,
            bookingId,
          );
          await client.query(
            `UPDATE payment_intents SET status = 'succeeded', updated_at = NOW() WHERE id = $1`,
            [walletIntent.id],
          );
          await client.query(
            `UPDATE bookings
                SET status = 'paid', escrow_status = 'held', payment_method = 'wallet',
                    payment_intent_id = $1, updated_at = NOW()
              WHERE id = $2`,
            [walletIntent.id, bookingId],
          );
          // E50: fix the exact customer price, fee policy, cancellation
          // policy, and provider commission agreement in the same transaction
          // as authorization. If no provider is assigned yet this records a
          // provisional version; provider acceptance appends the final terms.
          await financialTermsService.appendAuthorizationTermsInTransaction(
            client,
            {
              bookingId,
              event: 'wallet_payment_authorized',
              sourceEventId: walletIntent.id,
              createdBy: userId,
              metadata: { paymentMethod: 'wallet' },
            },
          );
          await escrowService.holdInEscrowInTransaction(
            client,
            bookingId,
            amount,
          );
          return { ...walletIntent, status: 'succeeded' };
        });

        // Instant-pay: now that the booking is paid, make sure it is being
        // offered to a provider (no-op if one is already assigned/pending).
        await bookingOfferService.dispatchPaidBookingIfNeeded(bookingId);

        res.status(201).json({
          success: true,
          data: {
            ...paymentService.formatPaymentIntent(intent),
            message: 'Payment completed via wallet balance.',
          },
        });
        return;
      }

      // E14: the old non-wallet path invents a PayMongo hosted URL. Fail
      // before reading the booking or creating a gateway/local intent unless a
      // separately approved replacement flow is deliberately enabled.
      assertExternalPaymentAuthorizationEnabled();

      const booking = await bookingService.getBookingByIdAdmin(bookingId);
      if (!booking) throw createAppError('Booking not found.', 404);
      if (booking.customer_id !== userId) {
        throw createAppError('Only the booking customer can create a payment intent.', 403);
      }
      if (!canTransition(booking.status as BookingStatus, 'payment_pending')) {
        throw createAppError(`Cannot pay for a booking in "${booking.status}" status.`, 409);
      }

      const intent = await paymentService.createPaymentIntent(
        bookingId,
        Number(booking.total_amount),
        paymentMethod,
        `Payment for booking ${bookingId}`,
      );

      await db.query(
        `UPDATE bookings SET status = 'payment_pending', payment_method = $1, payment_intent_id = $2, updated_at = NOW() WHERE id = $3`,
        [paymentMethod, intent.paymongo_intent_id, bookingId],
      );

      res.status(201).json({
        success: true,
        data: {
          ...paymentService.formatPaymentIntent(intent),
          message: 'Payment intent created. Complete payment via the client.',
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:bookingId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const bookingId = req.params['bookingId'];
      if (typeof bookingId !== 'string' || !bookingId) throw createAppError('Booking ID is required.', 400);

      const role = req.user!.role;
      if (role !== 'admin' && role !== 'super_admin') {
        const bookingOwner = await db.query<{ customer_id: string }>(
          `SELECT customer_id FROM bookings WHERE id = $1`, [bookingId],
        );
        if (!bookingOwner.rows[0]) throw createAppError('Booking not found.', 404);
        if (bookingOwner.rows[0].customer_id !== req.user!.userId) {
          throw createAppError('You do not have access to this payment.', 403);
        }
      }

      const intent = await paymentService.getBookingPaymentIntent(bookingId);
      if (!intent) throw createAppError('No payment found for this booking.', 404);

      res.json({ success: true, data: paymentService.formatPaymentIntent(intent) });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
