import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { createAppError } from '../middleware/error.middleware';
import {
  createBookingSchema,
  updateBookingStatusSchema,
  submitQuoteSchema,
  createJobRequestSchema,
  createChangeOrderSchema,
} from '../validators/booking.validators';
import { db } from '../models/db';
import * as bookingService from '../services/booking.service';
import * as matchingService from '../services/matching.service';
import * as notificationService from '../services/notification.service';
import * as escrowService from '../services/escrow.service';
import * as referralService from '../services/referral.service';
import * as sukiService from '../services/suki.service';
import { BookingStatus, canTransition } from '../types/booking.types';
import { logger } from '../utils/logger';
import * as pricingService from '../services/pricing.service';
import * as rebookingService from '../services/rebooking.service';
import * as slotWaitlistService from '../services/slot-waitlist.service';

function getParamId(req: AuthenticatedRequest): string {
  const id = req.params.id;
  if (typeof id !== 'string' || !id) {
    throw createAppError('Booking ID is required.', 400);
  }
  return id;
}

interface BookingOwnerRow { customer_id: string; provider_id: string | null }

async function verifyBookingAccess(bookingId: string, userId: string, role: string): Promise<void> {
  if (role === 'admin' || role === 'super_admin') return;
  const result = await db.query<BookingOwnerRow>(
    `SELECT customer_id, provider_id FROM bookings WHERE id = $1`,
    [bookingId],
  );
  const booking = result.rows[0];
  if (!booking) throw createAppError('Booking not found.', 404);

  const providerResult = await db.query<{ id: string }>(
    `SELECT id FROM providers WHERE user_id = $1`,
    [userId],
  );
  const providerId = providerResult.rows[0]?.id;

  if (booking.customer_id !== userId && booking.provider_id !== providerId) {
    throw createAppError('You do not have access to this booking.', 403);
  }
}

const router = Router();

interface BookingRow {
  id: string;
  customer_id: string;
  provider_id: string | null;
  category_id: string;
  subcategory_id: string | null;
  booking_type: string;
  status: string;
  escrow_status: string;
  service_price: number;
  service_fee: number;
  total_amount: number;
  description: string;
  address: string;
  barangay: string;
  city: string;
  province: string;
  latitude: string | null;
  longitude: string | null;
  scheduled_at: Date;
  completed_at: Date | null;
  confirmed_at: Date | null;
  cancelled_at: Date | null;
  cancellation_reason: string | null;
  payment_method: string | null;
  payment_intent_id: string | null;
  surge_multiplier: string;
  surge_amount: number;
  pricing_rule_id: string | null;
  rebooked_from_id: string | null;
  suki_discount: number;
  created_at: Date;
  updated_at: Date;
}

function formatBookingResponse(b: BookingRow) {
  const row = b as BookingRow & {
    category_name?: string;
    subcategory_name?: string;
    provider_name?: string;
  };
  return {
    id: row.id,
    customerId: row.customer_id,
    providerId: row.provider_id,
    categoryId: row.category_id,
    subcategoryId: row.subcategory_id,
    bookingType: row.booking_type,
    status: row.status,
    escrowStatus: row.escrow_status,
    servicePrice: row.service_price,
    serviceFee: row.service_fee,
    totalAmount: row.total_amount,
    description: row.description,
    address: row.address,
    barangay: row.barangay,
    city: row.city,
    province: row.province,
    latitude: row.latitude ? Number(row.latitude) : null,
    longitude: row.longitude ? Number(row.longitude) : null,
    scheduledAt: row.scheduled_at,
    completedAt: row.completed_at,
    confirmedAt: row.confirmed_at,
    cancelledAt: row.cancelled_at,
    cancellationReason: row.cancellation_reason,
    paymentMethod: row.payment_method,
    paymentIntentId: row.payment_intent_id,
    surgeMultiplier: Number(row.surge_multiplier ?? 1),
    surgeAmount: row.surge_amount ?? 0,
    pricingRuleId: row.pricing_rule_id ?? null,
    rebookedFromId: row.rebooked_from_id ?? null,
    sukiDiscount: row.suki_discount ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    categoryName: row.category_name ?? null,
    serviceName: row.subcategory_name ?? null,
    providerName: row.provider_name ?? null,
  };
}

router.post(
  '/',
  authMiddleware,
  validationMiddleware(createBookingSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const booking = await bookingService.createBooking({
        customerId: req.user!.userId,
        ...req.body,
      });
      res.status(201).json({ success: true, data: formatBookingResponse(booking as BookingRow) });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const page = Number(req.query.page) || 1;
      const pageSize = Math.min(Number(req.query.pageSize) || 20, 100);
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;

      const result = await bookingService.listBookings(
        req.user!.userId,
        req.user!.role,
        { page, pageSize, status },
      );

      res.json({
        success: true,
        data: result.bookings.map((b) => formatBookingResponse(b as BookingRow)),
        meta: {
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          totalPages: Math.ceil(result.total / result.pageSize),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/job-request',
  authMiddleware,
  validationMiddleware(createJobRequestSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const booking = await bookingService.createJobRequest(req.user!.userId, req.body);
      res.status(201).json({ success: true, data: formatBookingResponse(booking as BookingRow) });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/change-orders/:changeOrderId/respond',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const changeOrderId = req.params.changeOrderId;
      if (typeof changeOrderId !== 'string') throw createAppError('Change order ID is required.', 400);
      const approved = req.body.approved === true;
      const result = await bookingService.respondToChangeOrder(changeOrderId, req.user!.userId, approved);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

// --- Pricing Preview (must be before /:id to avoid wildcard capture) ---

router.post(
  '/pricing-preview',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { basePrice, scheduledAt, categoryId, city } = req.body as {
        basePrice: number; scheduledAt: string; categoryId: string; city?: string;
      };

      if (!basePrice || typeof basePrice !== 'number' || basePrice <= 0) {
        throw createAppError('basePrice must be a positive number.', 400);
      }
      if (!scheduledAt || typeof scheduledAt !== 'string') {
        throw createAppError('scheduledAt is required.', 400);
      }
      if (!categoryId || typeof categoryId !== 'string') {
        throw createAppError('categoryId is required.', 400);
      }

      const scheduledDate = new Date(scheduledAt);
      if (isNaN(scheduledDate.getTime())) {
        throw createAppError('Invalid scheduledAt date.', 400);
      }

      const pricing = await pricingService.calculatePricing(
        basePrice, scheduledDate, categoryId, city,
      );

      res.json({ success: true, data: pricing });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/upcoming-holidays',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const holidays = await pricingService.getUpcomingHolidays(90);
      res.json({ success: true, data: holidays });
    } catch (error) {
      next(error);
    }
  },
);

// --- Smart Rebooking (history route must be before /:id) ---

router.get(
  '/history/rebookable',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined;
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
      const history = await rebookingService.getCustomerBookingHistory(req.user!.userId, categoryId, limit);
      res.json({ success: true, data: history });
    } catch (error) {
      next(error);
    }
  },
);

// --- Slot Waitlist (must be before /:id) ---

router.post(
  '/slot-waitlist',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { categoryId, subcategoryId, preferredDate, preferredTimeStart, preferredTimeEnd, city, province } =
        req.body as Record<string, string>;

      if (!categoryId) throw createAppError('categoryId is required.', 400);
      if (!preferredDate) throw createAppError('preferredDate is required.', 400);
      if (!preferredTimeStart || !preferredTimeEnd) throw createAppError('preferredTimeStart and preferredTimeEnd are required.', 400);
      if (!city || !province) throw createAppError('city and province are required.', 400);

      const entry = await slotWaitlistService.joinSlotWaitlist({
        customerId: req.user!.userId,
        categoryId,
        subcategoryId,
        preferredDate,
        preferredTimeStart,
        preferredTimeEnd,
        city,
        province,
      });

      res.status(201).json({ success: true, data: slotWaitlistService.formatWaitlistEntry(entry) });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/slot-waitlist',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const entries = await slotWaitlistService.getCustomerSlotWaitlist(req.user!.userId, status);
      res.json({ success: true, data: entries.map(slotWaitlistService.formatWaitlistEntry) });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/slot-waitlist/:waitlistId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const waitlistId = req.params['waitlistId'] as string;
      if (!waitlistId) throw createAppError('waitlistId is required.', 400);
      await slotWaitlistService.cancelSlotWaitlist(waitlistId, req.user!.userId);
      res.json({ success: true, message: 'Waitlist entry cancelled.' });
    } catch (error) {
      next(error);
    }
  },
);

// --- Booking by ID (wildcard /:id routes below) ---

router.get(
  '/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = getParamId(req);
      const booking = await bookingService.getBookingById(id, req.user!.userId);
      res.json({ success: true, data: formatBookingResponse(booking as BookingRow) });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/:id/status',
  authMiddleware,
  validationMiddleware(updateBookingStatusSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = getParamId(req);
      const newStatus = req.body.status as BookingStatus;
      const booking = await bookingService.transitionBookingStatus(
        id,
        req.user!.userId,
        req.user!.role,
        newStatus,
        req.body.cancellationReason,
      );

      if (newStatus === 'confirmed' && booking.escrow_status === 'held') {
        let escrowReleased = false;
        try {
          await escrowService.releaseEscrow(id);
          escrowReleased = true;
          await db.query(
            `UPDATE bookings SET status = 'payout_ready', updated_at = NOW() WHERE id = $1`,
            [id],
          );
        } catch (escrowErr) {
          if (!escrowReleased) {
            logger.error('Escrow release failed during confirmation — rolling back to completed_by_provider', {
              bookingId: id,
              error: escrowErr instanceof Error ? escrowErr.message : 'Unknown',
            });
            await db.query(
              `UPDATE bookings SET status = 'completed_by_provider', confirmed_at = NULL, updated_at = NOW() WHERE id = $1`,
              [id],
            );
            throw escrowErr;
          }
          logger.error('Post-escrow status update failed — escrow released but booking stuck at confirmed', {
            bookingId: id,
            error: escrowErr instanceof Error ? escrowErr.message : 'Unknown',
          });
        }

        try {
          await referralService.creditReferrerAfterBooking(id, booking.customer_id);
        } catch (refErr) {
          logger.error('Referral credit failed', { bookingId: id, error: refErr instanceof Error ? refErr.message : 'Unknown' });
        }

        if (booking.provider_id) {
          try {
            await sukiService.recordBookingForSuki(
              booking.customer_id,
              booking.provider_id,
              id,
              booking.total_amount,
            );
          } catch (sukiErr) {
            logger.error('Suki recording failed', { bookingId: id, error: sukiErr instanceof Error ? sukiErr.message : 'Unknown' });
          }
        }
      }

      if (
        (newStatus === 'cancelled_by_customer' || newStatus === 'cancelled_by_provider' || newStatus === 'cancelled_by_admin') &&
        booking.escrow_status === 'held'
      ) {
        try {
          const scheduledAt = booking.scheduled_at ? new Date(booking.scheduled_at).getTime() : Date.now();
          const hoursUntil = (scheduledAt - Date.now()) / (1000 * 60 * 60);
          await escrowService.handleCancellation(id, hoursUntil, false);
        } catch (escrowErr) {
          logger.error('Cancellation escrow handling failed', {
            bookingId: id,
            error: escrowErr instanceof Error ? escrowErr.message : 'Unknown',
          });
        }
      }

      const notifyTarget = booking.customer_id === req.user!.userId
        ? booking.provider_id
        : booking.customer_id;

      if (notifyTarget) {
        const providerUserRow = booking.provider_id
          ? await db.query<{ user_id: string }>(
              `SELECT user_id FROM providers WHERE id = $1`, [booking.provider_id],
            )
          : null;
        const providerUserId = providerUserRow?.rows[0]?.user_id;
        const recipientUserId = booking.customer_id === req.user!.userId
          ? providerUserId
          : booking.customer_id;

        if (recipientUserId) {
          await notificationService.notifyBookingStatusChange(recipientUserId, id, newStatus);
        }
      }

      res.json({ success: true, data: formatBookingResponse(booking as BookingRow) });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:id/match',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = getParamId(req);
      const booking = await bookingService.getBookingById(id, req.user!.userId);

      if (booking.status !== 'requested' && booking.status !== 'quoted') {
        throw createAppError('Matching is only available for requested or quoted bookings.', 409);
      }

      if (!booking.latitude || !booking.longitude) {
        throw createAppError('Booking must have location coordinates for matching.', 400);
      }

      const providers = await matchingService.findMatchingProvidersSimple(
        booking.category_id,
        Number(booking.latitude),
        Number(booking.longitude),
      );

      res.json({
        success: true,
        data: {
          bookingId: id,
          providers,
          config: matchingService.getMatchConfig(),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:id/assign',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = getParamId(req);
      const role = req.user!.role;
      const userId = req.user!.userId;
      const { providerId } = req.body;

      if (!providerId || typeof providerId !== 'string') {
        throw createAppError('Provider ID is required.', 400);
      }

      const booking = await bookingService.getBookingByIdAdmin(id);

      const isAdmin = role === 'admin' || role === 'super_admin';
      const isBookingOwner = booking.customer_id === userId;
      if (!isAdmin && !isBookingOwner) {
        throw createAppError('Only the booking owner or an admin can assign providers.', 403);
      }

      const currentStatus = booking.status as BookingStatus;
      if (!canTransition(currentStatus, 'matched')) {
        throw createAppError(
          `Cannot assign provider — booking status "${currentStatus}" does not allow matching.`,
          409,
        );
      }

      interface ProviderLookup { id: string; user_id: string; business_name: string }
      const providerResult = await db.query<ProviderLookup>(
        `SELECT id, user_id, business_name FROM providers WHERE id = $1 AND status = 'approved'`,
        [providerId],
      );

      if (providerResult.rows.length === 0) {
        throw createAppError('Provider not found or not approved.', 404);
      }

      const provider = providerResult.rows[0]!;

      const { discountAmount } = await sukiService.calculateSukiDiscountForBooking(
        booking.customer_id, providerId, booking.service_price,
      );
      let notificationAmount = booking.total_amount;
      if (discountAmount > 0) {
        const newPrice = booking.service_price - discountAmount;
        const newFee = bookingService.calculateServiceFee(newPrice);
        const newTotal = newPrice + newFee;
        notificationAmount = newTotal;
        await db.query(
          `UPDATE bookings SET
             provider_id = $1, status = 'matched',
             service_price = $3, service_fee = $4, total_amount = $5, suki_discount = $6,
             updated_at = NOW()
           WHERE id = $2`,
          [providerId, id, newPrice, newFee, newTotal, discountAmount],
        );
      } else {
        await db.query(
          `UPDATE bookings SET provider_id = $1, status = 'matched', updated_at = NOW() WHERE id = $2`,
          [providerId, id],
        );
      }

      await notificationService.notifyProviderNewJob(
        provider.user_id,
        id,
        booking.description.slice(0, 50),
        notificationAmount,
        booking.city,
      );

      await notificationService.notifyCustomerProviderAssigned(
        booking.customer_id,
        id,
        provider.business_name,
      );

      const updated = await bookingService.getBookingByIdAdmin(id);
      res.json({ success: true, data: formatBookingResponse(updated as BookingRow) });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:id/quotes',
  authMiddleware,
  validationMiddleware(submitQuoteSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = getParamId(req);
      if (req.body.lineItems) {
        const result = await bookingService.submitStructuredQuote(id, req.user!.userId, req.body);
        res.status(201).json({ success: true, data: result });
      } else {
        const quote = await bookingService.submitQuote(
          id, req.user!.userId,
          req.body.quotedPrice, req.body.description, req.body.estimatedDurationMinutes,
        );
        res.status(201).json({ success: true, data: quote });
      }
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:id/quotes',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = getParamId(req);
      await verifyBookingAccess(id, req.user!.userId, req.user!.role);
      const quotes = await bookingService.getBookingQuotes(id);
      res.json({ success: true, data: quotes });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:id/quotes/:quoteId/accept',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = getParamId(req);
      const quoteId = req.params.quoteId;
      if (typeof quoteId !== 'string') throw createAppError('Quote ID is required.', 400);
      const result = await bookingService.acceptQuote(id, quoteId, req.user!.userId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:id/quotes/:quoteId/decline',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = getParamId(req);
      const quoteId = req.params.quoteId;
      if (typeof quoteId !== 'string') throw createAppError('Quote ID is required.', 400);
      const result = await bookingService.declineQuote(id, quoteId, req.user!.userId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:id/change-orders',
  authMiddleware,
  validationMiddleware(createChangeOrderSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = getParamId(req);
      const result = await bookingService.createChangeOrder(id, req.user!.userId, req.body);
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:id/change-orders',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = getParamId(req);
      await verifyBookingAccess(id, req.user!.userId, req.user!.role);
      const orders = await bookingService.getChangeOrders(id);
      res.json({ success: true, data: orders });
    } catch (error) {
      next(error);
    }
  },
);

// --- Smart Rebooking (parameterized route is fine after /:id) ---

router.get(
  '/:id/rebooking-suggestions',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = getParamId(req);
      const suggestions = await rebookingService.getRebookingSuggestions(req.user!.userId, id);
      res.json({ success: true, data: suggestions });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
