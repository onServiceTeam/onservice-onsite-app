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
  pricingPreviewSchema,
} from '../validators/booking.validators';
import { db } from '../models/db';
import * as bookingService from '../services/booking.service';
import * as jobLeadsService from '../services/job-leads.service';
import * as matchingService from '../services/matching.service';
import * as notificationService from '../services/notification.service';
import * as escrowService from '../services/escrow.service';
import * as orService from '../services/or.service';
import * as referralService from '../services/referral.service';
import * as sukiService from '../services/suki.service';
import { BookingStatus, canTransition } from '../types/booking.types';
import { logger } from '../utils/logger';
import * as pricingService from '../services/pricing.service';
import * as settingsService from '../services/settings.service';
import * as rebookingService from '../services/rebooking.service';
import * as slotWaitlistService from '../services/slot-waitlist.service';
import { platformConfig } from '../config/platform.config';

function getParamId(req: AuthenticatedRequest): string {
  const id = req.params.id;
  if (typeof id !== 'string' || !id) {
    throw createAppError('Booking ID is required.', 400);
  }
  return id;
}

interface BookingOwnerRow { customer_id: string; provider_id: string | null }

interface PreTransitionRow {
  status: string;
  escrow_status: string;
  latitude: string | null;
  longitude: string | null;
  is_hourly?: boolean;
}

function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number): number => deg * (Math.PI / 180);
  const earthRadiusMeters = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
  job_photos: string[];
  provider_before_photos: string[];
  provider_after_photos: string[];
  // Phase 200 — B2B contract linkage (null for normal consumer bookings).
  business_account_id: string | null;
  contract_id: string | null;
  created_at: Date;
  updated_at: Date;
}

function formatBookingResponse(b: BookingRow): Record<string, unknown> {
  // BUG-PHASE77-01 — also surface customer_name when the underlying
  // query joined users on customer_id. Provider-side navigate-to-job
  // needs this to display the destination contact's name.
  const row = b as BookingRow & {
    category_name?: string;
    subcategory_name?: string;
    provider_name?: string;
    customer_name?: string;
    performer_staff_id?: string | null;
    // D27 Phase 1 — quote-request fields the serializer previously dropped, so a
    // provider could not see the customer's budget/urgency/video when quoting.
    urgency?: string | null;
    budget_min?: number | null;
    budget_max?: number | null;
    job_video_url?: string | null;
    intake_answers?: Record<string, unknown> | null;
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
    jobPhotos: row.job_photos ?? [],
    jobVideoUrl: row.job_video_url ?? null,
    urgency: row.urgency ?? null,
    budgetMin: row.budget_min ?? null,
    budgetMax: row.budget_max ?? null,
    intakeAnswers: row.intake_answers ?? null,
    providerBeforePhotos: row.provider_before_photos ?? [],
    providerAfterPhotos: row.provider_after_photos ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    categoryName: row.category_name ?? null,
    serviceName: row.subcategory_name ?? null,
    providerName: row.provider_name ?? null,
    customerName: row.customer_name ?? null,
    // D23 — which team member (if any) is assigned to perform this job.
    performerStaffId: row.performer_staff_id ?? null,
    // D27 Phase 4b — hourly fields so the customer receipt + provider job screen
    // can show "billed X of Y hrs" and the refunded remainder.
    isHourly: (row as { is_hourly?: boolean }).is_hourly ?? false,
    estimatedHours: (row as { estimated_hours?: number | string | null }).estimated_hours ?? null,
    hourlyRate: (row as { hourly_rate?: number | null }).hourly_rate ?? null,
    billedHours: (row as { billed_hours?: number | string | null }).billed_hours ?? null,
    workStartedAt: (row as { work_started_at?: Date | null }).work_started_at ?? null,
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

      // Phase 200 — auto-dispatch. When the admin setting auto_dispatch_enabled
      // is on, immediately offer a fixed-price booking to the best-ranked
      // eligible (vetted, in-area) provider so it doesn't sit waiting for
      // someone to notice and quote. Best-effort: never fail booking creation
      // if dispatch can't start (no coordinates, no eligible provider, etc.).
      // Quote-based job-requests intentionally use the quote flow, not this.
      const created = booking as BookingRow;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const offerSvc = require('../services/booking-offer.service');
      if (offerSvc.shouldAutoDispatch(created)) {
        try {
          if (await settingsService.getSettingBoolean('auto_dispatch_enabled')) {
            await offerSvc.kickOfferCycle(created.id);
          }
        } catch (err) {
          logger.warn('auto-dispatch on booking create failed (non-fatal)', {
            bookingId: created.id, error: (err as Error).message,
          });
        }
      }

      res.status(201).json({ success: true, data: formatBookingResponse(created) });
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
      // D27 Phase 1 — fan the new request out to category + service-area matched
      // providers so it actually reaches someone who can quote. Best-effort and
      // non-blocking: the request is already saved; a notify failure must not
      // fail the customer's request.
      void jobLeadsService
        .notifyProvidersOfJobRequest({
          id: booking.id,
          category_id: booking.category_id,
          latitude: booking.latitude,
          longitude: booking.longitude,
          city: booking.city,
        })
        .catch((err) => logger.warn('job-request lead fan-out failed', { bookingId: booking.id, err: String(err) }));
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

router.post(
  '/change-orders/:changeOrderId/pay',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const changeOrderId = req.params.changeOrderId;
      if (typeof changeOrderId !== 'string') throw createAppError('Change order ID is required.', 400);
      const paymentMethod = req.body.paymentMethod as string;
      if (!paymentMethod) throw createAppError('Payment method is required.', 400);
      if (paymentMethod !== 'wallet') {
        throw createAppError('Change order additional payments must be paid via wallet balance. Please top up your wallet first.', 400);
      }

      const userId = req.user!.userId;
      // Phase B CRIT-15 fix — service now requires a paymentProof. The
      // wallet path debits the wallet INSIDE the same trx as the
      // change_order/booking updates, so a wallet-debit failure rolls
      // back the booking total update too. Pre-fix the route called
      // walletService.debitWallet AFTER finalizeChangeOrderPayment had
      // already committed the booking total — a debit failure left
      // the customer with a more-expensive booking and no payment.
      const result = await bookingService.finalizeChangeOrderPayment(
        changeOrderId,
        userId,
        { kind: 'wallet' },
      );
      await escrowService.holdInEscrow(result.bookingId, result.additionalTotal);

      res.json({
        success: true,
        data: {
          changeOrderId,
          bookingId: result.bookingId,
          additionalAmountPaid: result.additionalTotal,
          paymentMethod: 'wallet',
          message: 'Additional payment completed. The provider has been notified.',
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// --- Pricing Preview (must be before /:id to avoid wildcard capture) ---

router.post(
  '/pricing-preview',
  authMiddleware,
  // MED-N91 fix — Zod schema replaces manual presence-checks for
  // consistency with the rest of the booking routes.
  validationMiddleware(pricingPreviewSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { basePrice, scheduledAt, categoryId, city } = req.body as {
        basePrice: number; scheduledAt: string; categoryId: string; city?: string;
      };

      const pricing = await pricingService.calculatePricing(
        basePrice, new Date(scheduledAt), categoryId, city,
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

      const preTransitionRow = await db.query<PreTransitionRow>(
        `SELECT status, escrow_status, latitude, longitude, is_hourly FROM bookings WHERE id = $1`,
        [id],
      );
      const oldStatus = preTransitionRow.rows[0]?.status;
      const oldEscrowStatus = preTransitionRow.rows[0]?.escrow_status;
      const isHourlyBooking = preTransitionRow.rows[0]?.is_hourly === true;

      if (newStatus === 'provider_arrived') {
        const bookingCoordinates = preTransitionRow.rows[0];
        const providerLatitude = req.body.latitude as number | undefined;
        const providerLongitude = req.body.longitude as number | undefined;

        if (providerLatitude === undefined || providerLongitude === undefined) {
          throw createAppError('Current provider location is required to mark arrival.', 400);
        }

        if (!bookingCoordinates?.latitude || !bookingCoordinates.longitude) {
          throw createAppError('Booking does not have service coordinates. Arrival cannot be verified.', 409);
        }

        const distanceMeters = haversineDistanceMeters(
          providerLatitude,
          providerLongitude,
          Number(bookingCoordinates.latitude),
          Number(bookingCoordinates.longitude),
        );

        if (distanceMeters > platformConfig.providerArrivalRadiusMeters) {
          throw createAppError(
            `You must be within ${platformConfig.providerArrivalRadiusMeters} meters of the job location to mark arrival. Current distance: ${Math.round(distanceMeters)} meters.`,
            409,
          );
        }
      }

      if (newStatus === 'completed_by_provider') {
        // Enforce minimum time-on-site: provider must have been in_progress for at least N minutes
        const inProgressRow = await db.query<{ updated_at: Date }>(
          `SELECT updated_at FROM bookings WHERE id = $1 AND status = 'in_progress'`,
          [id],
        );
        if (inProgressRow.rows[0]) {
          const elapsedMs = Date.now() - new Date(inProgressRow.rows[0].updated_at).getTime();
          const minimumMs = platformConfig.minimumTimeOnSiteMinutes * 60 * 1000;
          if (elapsedMs < minimumMs) {
            const remainingMin = Math.ceil((minimumMs - elapsedMs) / 60000);
            throw createAppError(
              `You must be on-site for at least ${platformConfig.minimumTimeOnSiteMinutes} minutes before marking the job complete. Please wait ${remainingMin} more minute(s).`,
              409,
            );
          }
        }
      }

      const booking = await bookingService.transitionBookingStatus(
        id,
        req.user!.userId,
        req.user!.role,
        newStatus,
        req.body.cancellationReason,
        // BUG-PHASE151-01 fix — pass completionNotes so provider-side
        // completion notes from the mobile complete screen actually
        // land on bookings.completion_notes.
        req.body.completionNotes,
      );

      if (newStatus === 'confirmed' && oldEscrowStatus === 'held') {
        // CRIT-N10 fix: escrow release + status flip to 'payout_ready'
        // are now atomic via releaseEscrowInTransaction. Pre-fix flow had
        // three failure modes:
        //   (a) escrow committed money + status update failed → money
        //       moved but booking stuck at 'confirmed' (provider sees
        //       'paid' in dashboard, customer sees 'confirmed').
        //   (b) escrow failed BEFORE money moved + the manual rollback
        //       UPDATE itself failed → booking stuck at 'confirmed'
        //       with no escrow movement.
        //   (c) under (a), customer could re-trigger confirmation → the
        //       releaseEscrow's WHERE escrow_status = 'held' guard
        //       blocks the second attempt, but state is still wrong.
        // Post-fix: one transaction wraps releaseEscrowInTransaction +
        // status update. Either both happen or neither does.
        let breakdown: Awaited<ReturnType<typeof escrowService.releaseEscrowInTransaction>> | null = null;
        try {
          breakdown = await db.transaction(async (client) => {
            // D27 Phase 4b — hourly bookings settle to ACTUAL hours (capped at
            // the authorization) and refund the unused remainder before paying
            // the provider; fixed bookings release the full held amount.
            const b = isHourlyBooking
              ? await escrowService.settleHourlyAndReleaseInTransaction(client, id)
              : await escrowService.releaseEscrowInTransaction(client, id);
            await client.query(
              `UPDATE bookings SET status = 'payout_ready', updated_at = NOW() WHERE id = $1`,
              [id],
            );
            return b;
          });
        } catch (escrowErr) {
          // Trx rolled back automatically. Booking status remains
          // 'confirmed' (legitimate state — customer confirmed but
          // payout not yet ready). Admin can retry via the manual
          // release endpoint at /admin/bookings/:id/escrow/release.
          logger.error('Escrow release transaction failed; booking stays at confirmed for admin retry', {
            bookingId: id,
            error: escrowErr instanceof Error ? escrowErr.message : 'Unknown',
          });
          throw escrowErr;
        }

        // Best-effort post-commit OR issuance. Mirrors the legacy
        // releaseEscrow internal pattern (escrow.service.ts:184-197).
        // Failure here must NOT roll back the escrow release (already
        // committed). The trx-aware variant explicitly delegates this
        // to the caller per its file comment.
        if (breakdown) {
          try {
            await orService.issueOR({
              bookingId: id,
              commissionAmount: breakdown.commissionAmount,
              serviceFeeAmount: breakdown.serviceFeeAmount,
              providerReceived: breakdown.providerReceives,
              platformRetained: breakdown.platformRetains,
            });
          } catch (orErr) {
            logger.error('OR issuance failed after escrow release (audit-only side effect)', {
              bookingId: id,
              error: orErr instanceof Error ? orErr.message : String(orErr),
            });
          }
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
              booking.service_price,
            );
          } catch (sukiErr) {
            logger.error('Suki recording failed', { bookingId: id, error: sukiErr instanceof Error ? sukiErr.message : 'Unknown' });
          }
        }
      }

      if (
        (newStatus === 'cancelled_by_customer' || newStatus === 'cancelled_by_provider' || newStatus === 'cancelled_by_admin') &&
        oldEscrowStatus === 'held'
      ) {
        try {
          const scheduledAt = booking.scheduled_at ? new Date(booking.scheduled_at).getTime() : Date.now();
          const hoursUntil = (scheduledAt - Date.now()) / (1000 * 60 * 60);
          const arrivedStatuses = new Set(['provider_arrived', 'in_progress', 'completed_by_provider']);
          const wasProviderArrived = arrivedStatuses.has(oldStatus ?? '');
          await escrowService.handleCancellation(id, hoursUntil, wasProviderArrived);
        } catch (escrowErr) {
          logger.error('Cancellation escrow handling failed', {
            bookingId: id,
            error: escrowErr instanceof Error ? escrowErr.message : 'Unknown',
          });
          res.status(207).json({
            success: true,
            data: formatBookingResponse(booking as BookingRow),
            warning: {
              code: 'ESCROW_PROCESSING_DELAYED',
              message: 'Your cancellation was recorded but the refund could not be processed automatically. Our team has been notified and will process it within 48 hours.',
            },
          });
          return;
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

      // MED-N103 fix — pass scheduledAt so the simple matcher applies
      // the same provider_availability filter as findMatchingProviders.
      // Without this, customers were being shown providers whose
      // working hours did NOT cover the booking time.
      if (!booking.scheduled_at) {
        throw createAppError('Booking must have a scheduled time for matching.', 400);
      }
      const providers = await matchingService.findMatchingProvidersSimple(
        booking.category_id,
        Number(booking.latitude),
        Number(booking.longitude),
        new Date(booking.scheduled_at),
      );

      // MED-N90 fix — internal matching algorithm config (distance
      // weights, rating weights, surge eligibility, etc.) is no longer
      // returned to the customer client. Pre-fix, exposing
      // getMatchConfig() to anyone with a bookingId allowed reverse-
      // engineering of the matcher to game it (e.g., infer that
      // distance is weighted 40% and game scheduledAt to land in a
      // less competitive window). Admin observability of these
      // weights now lives on the admin-only /admin/matching/config
      // endpoint.
      res.json({
        success: true,
        data: {
          bookingId: id,
          providers,
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

      // MED-N86 fix: customer self-assigning a SPECIFIC provider
      // bypasses the matching algorithm and skips conflict-of-interest
      // checks (matching service area, surge pricing fairness). It's
      // also a vector for collusion (customer pays in cash off-app for
      // a discount, completes booking via app to launder the
      // relationship). Per audit option (b), keep self-assign allowed
      // (some customers legitimately want a specific provider) but
      // surface every instance to the security_events feed so the
      // bypass-detection cron + admin Compliance dashboard can
      // identify patterns. Best-effort log; never block the booking.
      if (!isAdmin && isBookingOwner) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { logSecurityEvent } = require('../services/security.service');
          await logSecurityEvent({
            userId,
            eventType: 'suspicious_activity',
            metadata: {
              kind: 'customer_self_assigned_provider',
              bookingId: id,
              providerId,
            },
          });
        } catch (logErr) {
          void logErr;
          // Logging failure must NOT block the booking flow.
          (req as unknown as { log?: (m: string) => void }).log?.(
            'logSecurityEvent failed for customer_self_assigned_provider',
          );
        }
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

      // --- Booking Conflict Detection (BACK-013) ---
      const conflict = await matchingService.hasBookingConflict(
        providerId,
        new Date(booking.scheduled_at),
        undefined,
        id, // exclude this booking itself
      );
      if (conflict) {
        throw createAppError(
          'This provider already has a booking at the same time. Please choose a different provider or time.',
          409,
        );
      }

      // MED-N87 fix — wrap the suki-discount calc and the booking
      // UPDATE in a single transaction. Pre-fix: two separate db.query
      // calls (or one) with notifications inline. If notifyProvider
      // failed mid-way, the booking was already mutated and the
      // customer got a "your provider is on the way" notification while
      // the provider had no idea they had a new job.
      //
      // Post-fix: the UPDATE is atomic with the suki record write
      // (calculateSukiDiscountForBooking is read-only so it's safe
      // outside the trx). Notifications fire AFTER COMMIT — they're
      // best-effort and never roll back the booking. Each notify is
      // wrapped in its own try/catch so one failure can't strand the
      // other.
      const { discountAmount } = await sukiService.calculateSukiDiscountForBooking(
        booking.customer_id, providerId, booking.service_price,
      );
      let notificationAmount = booking.total_amount;
      await db.transaction(async (client) => {
        if (discountAmount > 0) {
          const newPrice = booking.service_price - discountAmount;
          const newFee = await bookingService.calculateServiceFee(newPrice);
          const newTotal = newPrice + newFee;
          notificationAmount = newTotal;
          await client.query(
            `UPDATE bookings SET
               provider_id = $1, status = 'matched',
               service_price = $3, service_fee = $4, total_amount = $5, suki_discount = $6,
               updated_at = NOW()
             WHERE id = $2`,
            [providerId, id, newPrice, newFee, newTotal, discountAmount],
          );
        } else {
          await client.query(
            `UPDATE bookings SET provider_id = $1, status = 'matched', updated_at = NOW() WHERE id = $2`,
            [providerId, id],
          );
        }
      });

      // Post-commit notifications — never block the booking flow.
      try {
        await notificationService.notifyProviderNewJob(
          provider.user_id,
          id,
          booking.description.slice(0, 50),
          notificationAmount,
          booking.city,
        );
      } catch (notifyErr) {
        logger.error('notifyProviderNewJob failed', { bookingId: id, providerUserId: provider.user_id, error: notifyErr instanceof Error ? notifyErr.message : 'Unknown' });
      }

      try {
        await notificationService.notifyCustomerProviderAssigned(
          booking.customer_id,
          id,
          provider.business_name,
        );
      } catch (notifyErr) {
        logger.error('notifyCustomerProviderAssigned failed', { bookingId: id, customerId: booking.customer_id, error: notifyErr instanceof Error ? notifyErr.message : 'Unknown' });
      }

      const updated = await bookingService.getBookingByIdAdmin(id);
      res.json({ success: true, data: formatBookingResponse(updated as BookingRow) });
    } catch (error) {
      next(error);
    }
  },
);

// ─── Phase 36b — 45s round-robin offer cycle ───────────────────────
//
// Three new endpoints on top of the existing /:id/match + /:id/assign
// flow. Customer triggers POST /:id/dispatch to start the cycle;
// providers POST /offers/:id/accept or /offers/:id/decline.
//
// Cron job (jobs/booking-offers-sweep.ts) fires every 5s and expires
// stale offers, then re-kicks the cycle.

router.post(
  '/:id/dispatch',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = getParamId(req);
      const role = req.user!.role;
      const userId = req.user!.userId;
      const booking = await bookingService.getBookingByIdAdmin(id);
      const isAdmin = role === 'admin' || role === 'super_admin';
      const isOwner = booking.customer_id === userId;
      if (!isAdmin && !isOwner) {
        throw createAppError('Only the booking owner or an admin can dispatch.', 403);
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const offerSvc = require('../services/booking-offer.service');
      const offer = await offerSvc.kickOfferCycle(id);
      if (!offer) {
        res.status(409).json({
          success: false,
          error: { message: 'No providers available for this booking.', statusCode: 409 },
        });
        return;
      }
      res.status(201).json({ success: true, data: offerSvc.formatOffer(offer) });
    } catch (error) { next(error); }
  },
);

router.post(
  '/offers/:offerId/accept',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const offerId = req.params.offerId as string | undefined;
      if (!offerId) throw createAppError('offerId required.', 400);
      if (req.user!.role !== 'provider') {
        throw createAppError('Only providers can accept offers.', 403);
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const offerSvc = require('../services/booking-offer.service');
      const result = await offerSvc.acceptOffer(offerId, req.user!.userId);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  },
);

router.post(
  '/offers/:offerId/decline',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const offerId = req.params.offerId as string | undefined;
      if (!offerId) throw createAppError('offerId required.', 400);
      if (req.user!.role !== 'provider') {
        throw createAppError('Only providers can decline offers.', 403);
      }
      // BUG-PHASE179-01 fix — pre-fix the reason was passed straight
      // through to the service which then did reason.slice(0, 500),
      // silently truncating a 10000-char abuse string instead of
      // rejecting it. Same server-cap shape as Phase 152-168. Cap
      // matches the actual decline_reason column write
      // (reason.slice(0, 500) in declineOffer service) so we reject
      // before the silent-truncation happens.
      const DECLINE_REASON_MAX = 500;
      const reasonRaw = typeof req.body?.reason === 'string' ? req.body.reason : '';
      if (reasonRaw.length > DECLINE_REASON_MAX) {
        throw createAppError(
          `Decline reason cannot exceed ${DECLINE_REASON_MAX} characters.`,
          400,
        );
      }
      const reason = reasonRaw;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const offerSvc = require('../services/booking-offer.service');
      const result = await offerSvc.declineOffer(offerId, req.user!.userId, reason);
      // After decline, immediately try the next candidate.
      try {
        const next = await offerSvc.kickOfferCycle(result.booking_id);
        res.json({
          success: true,
          data: { declined: true, nextOffer: next ? offerSvc.formatOffer(next) : null },
        });
      } catch {
        // No more candidates — surface declined OK + null next.
        res.json({ success: true, data: { declined: true, nextOffer: null } });
      }
    } catch (error) { next(error); }
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

// --- Provider Job Photos ---

router.post(
  '/:id/photos',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = getParamId(req);
      await verifyBookingAccess(id, req.user!.userId, req.user!.role);
      const { phase, urls, mimeTypes } = req.body as {
        phase: 'before' | 'after';
        urls: string[];
        // MED-N89 fix: optional per-photo MIME type. Mobile clients
        // know the picked photo's mimeType from ImagePicker and the
        // /api/v1/uploads response includes it; pass it through here
        // so booking_photos.mime_type stops being a hardcoded lie.
        mimeTypes?: string[];
      };

      if (!phase || !['before', 'after'].includes(phase)) {
        throw createAppError('Phase must be "before" or "after".', 400);
      }
      if (!Array.isArray(urls) || urls.length === 0) {
        throw createAppError('At least one photo URL is required.', 400);
      }
      if (urls.length > 20) {
        throw createAppError('Maximum 20 photos per phase.', 400);
      }
      if (mimeTypes !== undefined) {
        if (!Array.isArray(mimeTypes) || mimeTypes.length !== urls.length) {
          throw createAppError(
            'mimeTypes (when provided) must be an array with the same length as urls.',
            400,
          );
        }
        const allowed = new Set([
          'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
        ]);
        for (const m of mimeTypes) {
          if (typeof m !== 'string' || !allowed.has(m)) {
            throw createAppError(
              `Invalid mimeType "${m}". Allowed: image/jpeg, image/png, image/webp, image/heic, image/heif.`,
              400,
            );
          }
        }
      }

      // Phase 14 Dispatch 07 — Bug 36 + 461 + 1224 root-cause guard.
      // Pre-D07 the server stored whatever the client sent. Mobile passed
      // ImagePicker `file://` URIs straight through; admin/customer
      // viewers then fetched broken images. Now: every URL must be
      // HTTP/HTTPS (i.e., a real S3 / local-uploads URL returned by the
      // earlier /api/v1/uploads multipart step). file:// URIs are
      // rejected with 400.
      for (const url of urls) {
        if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
          throw createAppError(
            'Invalid photo URL. Photos must be uploaded via /api/v1/uploads first; raw file:// URIs are not accepted.',
            400,
          );
        }
      }

      // Phase 14 Dispatch 07 — Bug 36/461/1224 + 1220.
      // ALSO insert each photo into booking_photos so the new GET
      // /uploads/booking-photo/:bookingId endpoint + countAfterPhotos
      // (used by Bug 1220 completion gating) can reach them. The legacy
      // text[] columns are preserved for back-compat with existing UI
      // until D11/D12 mobile polish migrates the readers.
      const column = phase === 'before' ? 'provider_before_photos' : 'provider_after_photos';
      const photoType = phase; // 'before' | 'after' — both valid in booking_photos.photo_type CHECK
      // MED-N89 fix: derive each photo's MIME type from
      // (a) explicit mimeTypes[i] when the client provided one
      //     (mobile knows from ImagePicker / /api/v1/uploads);
      // (b) URL extension as fallback (.png/.webp/.heic/.heif/.jpg);
      // (c) image/jpeg as final default.
      function mimeFromUrl(u: string): string {
        const lower = u.toLowerCase().split(/[?#]/)[0]!;
        if (lower.endsWith('.png')) return 'image/png';
        if (lower.endsWith('.webp')) return 'image/webp';
        if (lower.endsWith('.heic')) return 'image/heic';
        if (lower.endsWith('.heif')) return 'image/heif';
        if (lower.endsWith('.jpeg') || lower.endsWith('.jpg')) return 'image/jpeg';
        return 'image/jpeg';
      }

      await db.transaction(async (client) => {
        await client.query(
          `UPDATE bookings SET ${column} = array_cat(${column}, $1::text[]), updated_at = NOW() WHERE id = $2`,
          [urls, id],
        );
        for (let i = 0; i < urls.length; i++) {
          const url = urls[i]!;
          const resolvedMime = mimeTypes?.[i] ?? mimeFromUrl(url);
          await client.query(
            `INSERT INTO booking_photos
               (booking_id, uploaded_by, uploaded_by_role, photo_type,
                storage_key, storage_url, mime_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              id,
              req.user!.userId,
              req.user!.role === 'provider' ? 'provider' : (req.user!.role === 'admin' || req.user!.role === 'super_admin' ? 'admin' : 'customer'),
              photoType,
              url, // legacy callers don't have a separate storage_key; URL doubles as both
              url,
              resolvedMime,
            ],
          );
        }
      });

      const updated = await bookingService.getBookingByIdAdmin(id);
      res.json({ success: true, data: formatBookingResponse(updated as BookingRow) });
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

// --- Customer No-Show Report (FR-102 — provider reports customer didn't answer door) ---
interface CustomerNoShowBookingRow {
  id: string;
  customer_id: string;
  provider_id: string | null;
  status: string;
  escrow_status: string;
  scheduled_at: string;
}

router.post(
  '/:id/report-no-show',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = getParamId(req);
      const userId = req.user!.userId;

      // Only providers can report a no-show
      const providerRow = await db.query<{ id: string }>(
        `SELECT id FROM providers WHERE user_id = $1`,
        [userId],
      );
      if (providerRow.rows.length === 0) {
        throw createAppError('Only providers can report a customer no-show.', 403);
      }
      const providerEntityId = providerRow.rows[0]!.id;

      const bkRow = await db.query<CustomerNoShowBookingRow>(
        `SELECT id, customer_id, provider_id, status, escrow_status, scheduled_at FROM bookings WHERE id = $1`,
        [id],
      );
      if (bkRow.rows.length === 0) throw createAppError('Booking not found.', 404);
      const bk = bkRow.rows[0]!;

      // Must be this provider's booking
      if (bk.provider_id !== providerEntityId) {
        throw createAppError('You are not assigned to this booking.', 403);
      }

      // Booking must be in provider_arrived status (provider is at the location)
      if (bk.status !== 'provider_arrived') {
        throw createAppError(
          'No-show can only be reported when the booking status is "provider_arrived".',
          409,
        );
      }

      // Must have waited the configured minimum no-show time
      const noShowMinutes = await settingsService.getProviderNoShowMinutes();
      const scheduledMs = new Date(bk.scheduled_at).getTime();
      const minutesSinceScheduled = (Date.now() - scheduledMs) / (1000 * 60);
      if (minutesSinceScheduled < noShowMinutes) {
        const minutesLeft = Math.ceil(noShowMinutes - minutesSinceScheduled);
        throw createAppError(
          `Please wait ${minutesLeft} more minute${minutesLeft !== 1 ? 's' : ''} before reporting a no-show. You must be on-site for at least ${noShowMinutes} minutes.`,
          409,
        );
      }

      // MED-N88 fix — pre-fix sequence was three independent statements:
      //   1. UPDATE bookings SET status='cancelled_by_customer'
      //   2. escrowService.handleCancellation (does its own internal trx)
      //   3. notificationService.createNotification
      // If (2) crashed after (1) committed, the booking was marked
      // cancelled but escrow stayed funded — money stuck. Same shape as
      // CRIT-N10 (already-fixed confirmation flow).
      //
      // Post-fix: the booking UPDATE and escrow processing both run on
      // the SAME transactional client via handleCancellationInTransaction.
      // If the escrow side fails, the booking UPDATE rolls back too —
      // customer sees a 5xx and can retry. Notification is post-commit.
      const hoursUntil = -1; // already past scheduled time
      await db.transaction(async (client) => {
        await client.query(
          `UPDATE bookings SET status = 'cancelled_by_customer', cancellation_reason = $1, cancelled_at = NOW(), updated_at = NOW() WHERE id = $2`,
          [`Customer no-show — provider was on-site for ${noShowMinutes}+ minutes`, id],
        );
        await escrowService.handleCancellationInTransaction(
          client,
          id,
          hoursUntil,
          true /* providerArrived */,
          true /* customerNoShow */,
        );
      });

      // Post-commit notification — best-effort only.
      try {
        await notificationService.createPushNotification({
          userId: bk.customer_id,
          type: 'customer_cancelled',
          title: 'Booking Cancelled — No-Show',
          body: 'Your booking was cancelled because the provider was on-site but could not reach you. The service fee has been retained as per our cancellation policy.',
          data: { bookingId: id },
        });
      } catch (notifyErr) {
        logger.error('Customer no-show notification failed', { bookingId: id, customerId: bk.customer_id, error: notifyErr instanceof Error ? notifyErr.message : 'Unknown' });
      }

      logger.info('Customer no-show reported', { bookingId: id, providerId: providerEntityId });

      const updated = await bookingService.getBookingByIdAdmin(id);
      res.json({ success: true, data: formatBookingResponse(updated as BookingRow), message: 'No-show recorded. Compensation has been processed.' });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
