import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { createPaymentIntentSchema } from '../validators/payment.validators';
import * as paymentService from '../services/payment.service';
import * as walletService from '../services/wallet.service';
import * as escrowService from '../services/escrow.service';
import * as bookingService from '../services/booking.service';
import { createAppError } from '../middleware/error.middleware';
import { canTransition, BookingStatus } from '../types/booking.types';
import { db } from '../models/db';

const router = Router();

router.post(
  '/intent',
  authMiddleware,
  validationMiddleware(createPaymentIntentSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { bookingId, paymentMethod } = req.body;
      const userId = req.user!.userId;

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

      if (paymentMethod === 'wallet') {
        // MED-N158 fix — pre-fix this path ran 4 separate operations
        // (debit wallet, update payment status, UPDATE booking, hold
        // escrow) as independent db.query calls. ANY failure mid-way
        // left money in a broken state — wallet debited but no
        // payment record, or payment marked succeeded but escrow not
        // funded. Post-fix: all 4 writes share ONE db.transaction
        // client. Either the customer's payment is fully accepted
        // (debit + payment + booking + escrow ALL succeed) or NONE
        // happens and the customer can retry.
        const customerWallet = await walletService.getUserWallet(userId, 'customer');
        await db.transaction(async (client) => {
          // 1. Debit customer wallet (fails fast if insufficient).
          await walletService.debitWalletInTransaction(
            client,
            customerWallet.id,
            Number(booking.total_amount),
            'payment',
            `Payment for booking`,
            bookingId,
          );
          // 2. Mark payment intent succeeded.
          await client.query(
            `UPDATE payment_intents SET status = 'succeeded', updated_at = NOW() WHERE id = $1`,
            [intent.id],
          );
          // 3. Flip booking to paid + held.
          await client.query(
            `UPDATE bookings SET status = 'paid', escrow_status = 'held', updated_at = NOW() WHERE id = $1`,
            [bookingId],
          );
          // 4. Hold the funds in the platform escrow wallet.
          await escrowService.holdInEscrowInTransaction(
            client,
            bookingId,
            Number(booking.total_amount),
          );
        });

        res.status(201).json({
          success: true,
          data: {
            ...paymentService.formatPaymentIntent({ ...intent, status: 'succeeded' }),
            message: 'Payment completed via wallet balance.',
          },
        });
        return;
      }

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
