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
        const customerWallet = await walletService.getUserWallet(userId, 'customer');
        await walletService.debitWallet(
          customerWallet.id,
          Number(booking.total_amount),
          'payment',
          `Payment for booking`,
          bookingId,
        );

        await paymentService.updatePaymentStatus(intent.id, 'succeeded');

        await db.query(
          `UPDATE bookings SET status = 'paid', escrow_status = 'held', updated_at = NOW() WHERE id = $1`,
          [bookingId],
        );

        await escrowService.holdInEscrow(bookingId, Number(booking.total_amount));

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

      const intent = await paymentService.getBookingPaymentIntent(bookingId);
      if (!intent) throw createAppError('No payment found for this booking.', 404);

      res.json({ success: true, data: paymentService.formatPaymentIntent(intent) });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
