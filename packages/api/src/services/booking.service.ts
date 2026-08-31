import { db } from '../models/db';
import { BookingStatus, canTransition, VALID_TRANSITIONS } from '../types/booking.types';
import { platformConfig } from '../config/platform.config';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import * as pricingService from './pricing.service';
import * as slotWaitlistService from './slot-waitlist.service';
import * as sukiService from './suki.service';
import * as socketService from './socket.service';
import { resolvePromo, recordPromoRedemption } from './booking/promo.service';
import { resolveHourlyCap, type HourlyConfig } from './booking/pricing.service';
import * as businessService from './business.service';
import * as serviceAreaService from './service-area.service';
import * as settingsService from './settings.service';
import { formatPHP } from '../utils/currency';
import * as financialTermsService from './booking-financial-terms.service';
import * as escrowService from './escrow.service';

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
  business_account_id: string | null;
  contract_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface CountRow {
  count: string;
}

// Phase 14 Dispatch 05 — Bug 175 + Bug 176 + Bug 261.
// `servicePrice` removed; server resolves from service_subcategories.
// `addons` shape is `{addonId, quantity}`; server resolves price from
// service_addons by id.
// `promoCode` is the customer-supplied code only; server resolves the
// canonical discount via services/booking/promo.service.ts.
interface CreateBookingParams {
  customerId: string;
  categoryId: string;
  subcategoryId?: string;
  bookingType: 'fixed_price' | 'quote_based';
  description: string;
  address: string;
  barangay: string;
  city: string;
  province: string;
  latitude: number;
  longitude: number;
  scheduledAt: string;
  rebookedFromId?: string;
  waitlistId?: string;
  promoCode?: string;
  addons?: Array<{ addonId: string; quantity: number }>;
  // Phase 200 — when set, the booking is placed for this B2B account. If the
  // customer is a member and an active contract matches the category, the
  // contract's agreed_rate prices the booking. Null/absent for every normal
  // consumer booking, so default behavior is unchanged.
  businessAccountId?: string;
  // D27 Phase 4b — required for hourly subcategories. The customer's estimate;
  // the server re-clamps to the subcategory's max and rounds to the increment.
  estimatedHours?: number;
}

/**
 * Phase B CRIT-13 fix — async, settings-backed calculateServiceFee.
 *
 * Pre-fix: this function read the in-memory platformConfig.* constants,
 * so when the admin updated service_fee_rate / service_fee_min /
 * service_fee_max via the Settings UI, NEW bookings created via
 * createBooking still used the in-code defaults until a redeploy. The
 * admin-tunable knob was effectively read-only at the entry point.
 *
 * Post-fix: read the live values from settings.service. Defensive
 * fallback to platformConfig defaults on any settings error so the
 * booking flow can't be blocked by a Redis blip.
 *
 * For the rare callers that need the synchronous shape (legacy
 * tests, math helpers), `calculateServiceFeeSync` is preserved with
 * the in-memory defaults.
 */
export function calculateServiceFeeSync(servicePrice: number): number {
  if (platformConfig.serviceFeeRate === 0) return 0; // no customer fee; min floor must not re-add one
  const fee = Math.round(servicePrice * platformConfig.serviceFeeRate);
  return Math.max(
    platformConfig.minimumServiceFee,
    Math.min(fee, platformConfig.maximumServiceFee),
  );
}

export async function calculateServiceFee(servicePrice: number): Promise<number> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const settingsService = require('./settings.service');
    if (typeof settingsService.getSettingPercent !== 'function') {
      return calculateServiceFeeSync(servicePrice);
    }
    const [rate, min, max] = await Promise.all([
      settingsService.getSettingPercent('service_fee_rate'),
      settingsService.getSettingNumber('service_fee_min').catch(() => platformConfig.minimumServiceFee),
      settingsService.getSettingNumber('service_fee_max').catch(() => platformConfig.maximumServiceFee),
    ]);
    if (!Number.isFinite(rate) || !Number.isFinite(min) || !Number.isFinite(max)) {
      return calculateServiceFeeSync(servicePrice);
    }
    const fee = Math.round(servicePrice * Number(rate));
    // A zero rate = no customer fee; the min floor must not re-add one.
    return Number(rate) === 0 ? 0 : Math.max(Number(min), Math.min(fee, Number(max)));
  } catch {
    return calculateServiceFeeSync(servicePrice);
  }
}

export async function createBooking(params: CreateBookingParams): Promise<BookingRow> {
  await assertBookableLocation(params.latitude, params.longitude);
  // Phase 14 Dispatch 05 — Bug 175.
  // Fixed-price bookings now REQUIRE subcategoryId AND a non-null
  // base_price in service_subcategories. There is no fallback to a
  // client-supplied servicePrice (the validator no longer accepts it).
  let baseServicePrice = 0;
  // D27 Phase 4b — hourly state stamped onto the booking (server-canonical).
  let isHourly = false;
  let estimatedHoursCapped: number | null = null;
  let hourlyRateSnapshot: number | null = null;

  if (params.bookingType === 'fixed_price') {
    if (!params.subcategoryId) {
      throw createAppError('Fixed-price bookings require subcategoryId.', 400);
    }
    const subcatResult = await db.query<{
      base_price: string | null; pricing_type: string;
      hourly_rate: string | null; min_billable_minutes: string | null;
      billing_increment_minutes: string | null; max_estimated_hours: string | null;
    }>(
      `SELECT base_price, pricing_type, hourly_rate, min_billable_minutes,
              billing_increment_minutes, max_estimated_hours
         FROM service_subcategories WHERE id = $1 AND is_active = TRUE`,
      [params.subcategoryId],
    );
    if (subcatResult.rows.length === 0) {
      throw createAppError('Subcategory not found or inactive.', 404);
    }
    const subcat = subcatResult.rows[0]!;
    if (subcat.pricing_type === 'quote') {
      throw createAppError('Quote-based subcategory cannot be booked as fixed_price.', 400);
    }
    // D27 Phase 4 — per-unit services advertise a rate (₱/sqm) but are not
    // auto-charged on a self-reported quantity. They go through the custom-quote
    // flow where the provider measures and confirms the real amount.
    if (subcat.pricing_type === 'per_unit') {
      throw createAppError('Per-unit subcategory must be booked through the custom-quote flow.', 400);
    }
    if (subcat.pricing_type === 'hourly') {
      // D27 Phase 4b — capped pre-authorization. baseServicePrice = rounded
      // estimatedHours x hourly_rate, computed by the SHARED resolveHourlyCap
      // so it can never diverge from the preview/settlement paths.
      const cfg: HourlyConfig = {
        hourlyRate: Number(subcat.hourly_rate),
        minBillableMinutes: Number(subcat.min_billable_minutes ?? 60),
        billingIncrementMinutes: Number(subcat.billing_increment_minutes ?? 30),
        maxEstimatedHours: Number(subcat.max_estimated_hours ?? 8),
      };
      const cap = resolveHourlyCap(Number(params.estimatedHours), cfg);
      baseServicePrice = cap.amountCents;
      isHourly = true;
      estimatedHoursCapped = cap.cappedHours;
      hourlyRateSnapshot = cfg.hourlyRate;
    } else {
      if (subcat.base_price == null) {
        throw createAppError('Service price could not be determined for this subcategory.', 400);
      }
      baseServicePrice = Number(subcat.base_price);
    }
  }

  // Phase 200 — B2B contract pricing. When the booking is explicitly placed
  // for a business account and an active contract matches, the negotiated
  // agreed_rate replaces the catalog base price. Contract-priced bookings do
  // NOT get surge or promo (the rate is a fixed negotiated price); add-ons and
  // the platform service fee still apply. Stamped onto the booking for audit.
  // Inert for normal bookings (businessAccountId is never set by them).
  let businessAccountId: string | null = null;
  let contractId: string | null = null;
  if (params.bookingType === 'fixed_price' && params.businessAccountId) {
    const contract = await businessService.resolveBookingContract(
      params.customerId,
      params.businessAccountId,
      params.categoryId,
      params.subcategoryId ?? null,
    );
    if (contract) {
      baseServicePrice = contract.agreedRate;
      businessAccountId = params.businessAccountId;
      contractId = contract.contractId;
    }
  }

  if (params.bookingType === 'fixed_price' && baseServicePrice <= 0) {
    throw createAppError(
      'Service price could not be determined. The selected service may not have a fixed price.',
      400,
    );
  }

  let surgeMultiplier = 1.0;
  let surgeAmount = 0;
  let pricingRuleId: string | null = null;

  // Contract-priced bookings skip surge (fixed negotiated rate).
  if (params.bookingType === 'fixed_price' && baseServicePrice > 0 && !contractId) {
    const pricing = await pricingService.calculatePricing(
      baseServicePrice,
      new Date(params.scheduledAt),
      params.categoryId,
      params.city,
    );
    surgeMultiplier = pricing.surgeMultiplier;
    surgeAmount = pricing.surgeAmount;
    pricingRuleId = pricing.appliedRule?.id ?? null;
  }

  // Phase 14 Dispatch 05 — Bug 176.
  // Resolve addon prices server-side from service_addons.price by
  // looking up each addonId. Validate addon belongs to the requested
  // subcategory and is active. Quantity validated by the Zod schema
  // (1..100); we re-validate defensively here.
  const resolvedAddons: Array<{ addonId: string; quantity: number; name: string; price: number }> = [];
  let addonsTotal = 0;
  if (params.addons && params.addons.length > 0) {
    for (const a of params.addons) {
      if (!Number.isInteger(a.quantity) || a.quantity < 1 || a.quantity > 100) {
        throw createAppError('Invalid addon quantity.', 400);
      }
    }
    const addonIds = params.addons.map((a) => a.addonId);
    interface AddonRow {
      id: string;
      subcategory_id: string;
      price: number | string;
      is_active: boolean;
      name: string;
    }
    const addonResult = await db.query<AddonRow>(
      `SELECT id, subcategory_id, price, is_active, name
         FROM service_addons WHERE id = ANY($1::uuid[])`,
      [addonIds],
    );
    const byId = new Map(addonResult.rows.map((r) => [r.id, r]));
    for (const requested of params.addons) {
      const found = byId.get(requested.addonId);
      if (!found) {
        throw createAppError(`Addon not found: ${requested.addonId}`, 404);
      }
      if (!found.is_active) {
        throw createAppError(`Addon is no longer available: ${found.name}`, 400);
      }
      if (params.subcategoryId && found.subcategory_id !== params.subcategoryId) {
        throw createAppError(`Addon does not belong to the requested subcategory.`, 400);
      }
      const canonicalPrice = Number(found.price);
      const lineTotal = canonicalPrice * requested.quantity;
      addonsTotal += lineTotal;
      resolvedAddons.push({
        addonId: requested.addonId,
        quantity: requested.quantity,
        name: found.name,
        price: canonicalPrice,
      });
    }
  }

  // Phase 14 Dispatch 05 — Bug 261.
  // Promo: customer sends only the code; server resolves the canonical
  // discount from `promo_codes` via services/booking/promo.service.ts.
  // Subtotal for promo eligibility is base + addons + surge.
  let promoDiscountCents = 0;
  // Contract-priced bookings skip promo codes (the agreed rate is final).
  if (params.promoCode && params.bookingType === 'fixed_price' && !contractId) {
    const subtotalForPromo = baseServicePrice + surgeAmount + addonsTotal;
    promoDiscountCents = await resolvePromo({
      code: params.promoCode,
      subtotalCents: subtotalForPromo,
      userId: params.customerId,
    });
  }

  const servicePrice = Math.max(0, baseServicePrice + surgeAmount + addonsTotal - promoDiscountCents);
  const serviceFee = params.bookingType === 'fixed_price' ? await calculateServiceFee(servicePrice) : 0;
  const totalAmount = servicePrice + serviceFee;

  const initialStatus = 'requested';

  // CRIT-N09 fix: bookings INSERT + booking_addons inserts now run inside
  // a single transaction. Pre-fix: bookings INSERT committed (with the
  // total_amount that already included addons), then per-addon INSERTs ran
  // separately. If any addon INSERT failed (DB blip, FK violation), the
  // booking existed with the addon-inclusive total but no booking_addons
  // rows — provider sees a different scope than the customer paid for.
  // Also converts the per-addon INSERT loop to a single multi-row INSERT
  // for performance (was 1 round-trip per addon).
  const newBooking = await db.transaction(async (client) => {
    const result = await client.query<BookingRow>(
      `INSERT INTO bookings (
        customer_id, category_id, subcategory_id, booking_type,
        description, address, barangay, city, province,
        latitude, longitude, scheduled_at,
        service_price, service_fee, total_amount,
        surge_multiplier, surge_amount, pricing_rule_id, rebooked_from_id,
        status, business_account_id, contract_id,
        is_hourly, estimated_hours, hourly_rate
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      RETURNING *`,
      [
        params.customerId,
        params.categoryId,
        params.subcategoryId ?? null,
        params.bookingType,
        params.description,
        params.address,
        params.barangay,
        params.city,
        params.province,
        params.latitude ?? null,
        params.longitude ?? null,
        params.scheduledAt,
        servicePrice,
        serviceFee,
        totalAmount,
        surgeMultiplier,
        surgeAmount,
        pricingRuleId,
        params.rebookedFromId ?? null,
        initialStatus,
        businessAccountId,
        contractId,
        isHourly,
        estimatedHoursCapped,
        hourlyRateSnapshot,
      ],
    );
    const booking = result.rows[0]!;

    // MED-N154 fix — record the promo redemption inside the same trx
    // so the per-customer limit check (in resolvePromo's next call)
    // sees this booking as a redemption. Defensive: if the promo
    // table lookup fails (older schema, race-removed promo) we log
    // and continue rather than blocking the booking creation.
    if (params.promoCode && promoDiscountCents > 0) {
      try {
        const promoLookup = await client.query<{ id: string }>(
          `SELECT id FROM promo_codes WHERE UPPER(code) = $1`,
          [params.promoCode.trim().toUpperCase()],
        );
        if (promoLookup.rows[0]) {
          await recordPromoRedemption(client, {
            promoCodeId: promoLookup.rows[0].id,
            bookingId: booking.id,
            customerId: params.customerId,
            discountCentavos: promoDiscountCents,
          });
        }
      } catch (err) {
        // Log but don't fail booking creation.
        logger.warn('promo_redemption record failed (non-fatal)', {
          bookingId: booking.id,
          promoCode: params.promoCode,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (resolvedAddons.length > 0) {
      // Single multi-row INSERT instead of N round-trips.
      const placeholders: string[] = [];
      const values: unknown[] = [];
      let idx = 1;
      for (const addon of resolvedAddons) {
        placeholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++})`);
        values.push(booking.id, addon.addonId, addon.name, addon.price);
      }
      await client.query(
        `INSERT INTO booking_addons (booking_id, addon_id, name, price)
         VALUES ${placeholders.join(', ')}`,
        values,
      );
    }

    return booking;
  });

  logger.info('Booking created', {
    bookingId: newBooking.id,
    customerId: params.customerId,
    status: initialStatus,
    surgeMultiplier,
    surgeAmount,
    addonsCount: resolvedAddons.length,
  });

  try {
    socketService.emitAdminEvent(socketService.ADMIN_EVENTS.BOOKING_CREATED, {
      id: newBooking.id,
      status: newBooking.status,
      customerId: newBooking.customer_id,
      providerId: newBooking.provider_id,
      totalCentavos: Number(newBooking.total_amount),
    });
  } catch (e) {
    logger.warn('Admin socket emit failed', {
      event: 'booking:created',
      error: e instanceof Error ? e.message : String(e),
    });
  }

  if (params.waitlistId) {
    try {
      await slotWaitlistService.markWaitlistAsBooked(params.waitlistId, newBooking.id);
    } catch (wlErr) {
      logger.error('Failed to mark waitlist entry as booked', {
        waitlistId: params.waitlistId,
        bookingId: newBooking.id,
        error: wlErr instanceof Error ? wlErr.message : 'Unknown',
      });
    }
  }

  return newBooking;
}

export async function getBookingById(bookingId: string, userId: string): Promise<BookingRow> {
  // BUG-PHASE77-01 fix — also join the customer's user row so the
  // formatter can return `customerName`. Provider-side
  // /provider/job/[id]/navigate.tsx needs the customer's name to
  // display as the destination contact; pre-fix it fell back to the
  // provider's own name (their own row in `users` was joined as
  // `provider_name` because the SELECT only joined providers/users
  // for the provider side). The customer id is on bookings.customer_id
  // — straight join to users with a different alias.
  const result = await db.query<BookingRow>(
    `SELECT b.*,
       c.name AS category_name,
       sc.name AS subcategory_name,
       CASE WHEN pu.id IS NOT NULL
         THEN CONCAT(pu.first_name, ' ', pu.last_name)
         ELSE NULL END AS provider_name,
       CONCAT(cu.first_name, ' ', cu.last_name) AS customer_name
     FROM bookings b
     LEFT JOIN providers p ON b.provider_id = p.id
     LEFT JOIN users pu ON p.user_id = pu.id
     JOIN users cu ON cu.id = b.customer_id
     LEFT JOIN service_categories c ON b.category_id = c.id
     LEFT JOIN service_subcategories sc ON b.subcategory_id = sc.id
     -- D23: the assigned approved team member (performer) can also read their job.
     LEFT JOIN provider_staff ps ON ps.id = b.performer_staff_id
     WHERE b.id = $1 AND (
       b.customer_id = $2
       OR p.user_id = $2
       OR (ps.user_id = $2 AND ps.status = 'approved')
     )`,
    [bookingId, userId],
  );

  if (result.rows.length === 0) {
    throw createAppError('Booking not found.', 404);
  }

  return result.rows[0]!;
}

export async function getBookingByIdAdmin(bookingId: string): Promise<BookingRow> {
  const result = await db.query<BookingRow>(
    `SELECT * FROM bookings WHERE id = $1`,
    [bookingId],
  );

  if (result.rows.length === 0) {
    throw createAppError('Booking not found.', 404);
  }

  return result.rows[0]!;
}

export async function listBookings(
  userId: string,
  role: string,
  filters: {
    page: number;
    pageSize: number;
    status?: string;
    sort?: 'newest' | 'oldest' | 'highest_pay';
    periodDays?: 7 | 30 | 90;
  },
): Promise<{ bookings: BookingRow[]; total: number; page: number; pageSize: number }> {
  const { page, pageSize, status, sort, periodDays } = filters;
  const offset = (page - 1) * pageSize;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (role === 'customer') {
    conditions.push(`b.customer_id = $${paramIdx++}`);
    params.push(userId);
  } else if (role === 'provider') {
    conditions.push(`p.user_id = $${paramIdx++}`);
    params.push(userId);
  } else {
    // This participant endpoint is deliberately not an admin or staff listing.
    // Both roles have separately scoped routes. Falling through with no owner
    // predicate would expose every booking to any authenticated unsupported role.
    throw createAppError('This booking list is available only to customers and providers.', 403);
  }

  const ACTIVE_STATUSES = [
    'requested', 'quoted', 'matched', 'payment_pending', 'paid',
    'provider_en_route', 'provider_arrived', 'in_progress', 'completed_by_provider', 'disputed',
  ];
  const COMPLETED_STATUSES = ['confirmed', 'resolved', 'payout_ready', 'paid_out'];
  const CANCELLED_STATUSES = ['cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin'];

  if (status === 'active') {
    const placeholders = ACTIVE_STATUSES.map((_, i) => `$${paramIdx + i}`).join(', ');
    conditions.push(`b.status IN (${placeholders})`);
    params.push(...ACTIVE_STATUSES);
    paramIdx += ACTIVE_STATUSES.length;
  } else if (status === 'completed') {
    const placeholders = COMPLETED_STATUSES.map((_, i) => `$${paramIdx + i}`).join(', ');
    conditions.push(`b.status IN (${placeholders})`);
    params.push(...COMPLETED_STATUSES);
    paramIdx += COMPLETED_STATUSES.length;
  } else if (status === 'cancelled') {
    const placeholders = CANCELLED_STATUSES.map((_, i) => `$${paramIdx + i}`).join(', ');
    conditions.push(`b.status IN (${placeholders})`);
    params.push(...CANCELLED_STATUSES);
    paramIdx += CANCELLED_STATUSES.length;
  } else if (status) {
    conditions.push(`b.status = $${paramIdx++}`);
    params.push(status);
  }

  if (periodDays) {
    conditions.push(`b.scheduled_at >= NOW() - ($${paramIdx++}::int * INTERVAL '1 day')`);
    params.push(periodDays);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderBy = sort === 'oldest'
    ? 'b.scheduled_at ASC, b.created_at ASC'
    : sort === 'highest_pay'
      ? 'b.service_price DESC, b.created_at DESC'
      : sort === 'newest'
        ? 'b.scheduled_at DESC, b.created_at DESC'
        : 'b.created_at DESC';

  const countResult = await db.query<CountRow>(
    `SELECT COUNT(*)::text as count FROM bookings b
     LEFT JOIN providers p ON b.provider_id = p.id
     ${whereClause}`,
    params,
  );

  const total = Number(countResult.rows[0]?.count ?? 0);

  const dataParams = [...params, pageSize, offset];
  // BUG-PHASE77-01 — also join the customer's user row so list
  // responses include `customer_name`. Provider-side dashboard +
  // jobs list need it for the customer-name column on each card.
  const result = await db.query<BookingRow>(
    `SELECT b.*,
       c.name AS category_name,
       sc.name AS subcategory_name,
       CASE WHEN pu.id IS NOT NULL
         THEN CONCAT(pu.first_name, ' ', pu.last_name)
         ELSE NULL END AS provider_name,
       CONCAT(cu.first_name, ' ', cu.last_name) AS customer_name
     FROM bookings b
     LEFT JOIN providers p ON b.provider_id = p.id
     LEFT JOIN users pu ON p.user_id = pu.id
     JOIN users cu ON cu.id = b.customer_id
     LEFT JOIN service_categories c ON b.category_id = c.id
     LEFT JOIN service_subcategories sc ON b.subcategory_id = sc.id
     ${whereClause}
     ORDER BY ${orderBy}
     LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
    dataParams,
  );

  return { bookings: result.rows, total, page, pageSize };
}

export async function transitionBookingStatus(
  bookingId: string,
  userId: string,
  role: string,
  newStatus: BookingStatus,
  cancellationReason?: string,
  // BUG-PHASE151-01 fix — provider completion notes. Persisted to
  // bookings.completion_notes (migration 126). Only meaningful when
  // newStatus='completed_by_provider'; ignored for other transitions
  // since the column has no semantics for non-completion states.
  completionNotes?: string,
): Promise<BookingRow> {
  return db.transaction(async (client) => {
    const lockResult = await client.query<BookingRow>(
      `SELECT * FROM bookings WHERE id = $1 FOR UPDATE`,
      [bookingId],
    );

    if (lockResult.rows.length === 0) {
      throw createAppError('Booking not found.', 404);
    }

    const booking = lockResult.rows[0]!;
    const currentStatus = booking.status as BookingStatus;

    if (!canTransition(currentStatus, newStatus)) {
      const allowed = VALID_TRANSITIONS[currentStatus] ?? [];
      throw createAppError(
        `Cannot transition from "${currentStatus}" to "${newStatus}". ` +
        `Allowed transitions: ${allowed.length > 0 ? allowed.join(', ') : 'none (terminal state)'}.`,
        409,
      );
    }

    await validateRoleForTransition(role, currentStatus, newStatus, booking, userId);

    // Phase 14 Dispatch 07 — Bug 463 + 1220.
    // Provider-driven completion requires (a) the checklist was opened
    // AND fully completed for required items, AND (b) at least 2 'after'
    // photos uploaded. Server-side enforcement; mobile can mirror the
    // gating but the server is authoritative.
    if (newStatus === 'completed_by_provider') {
      const { getChecklistCompletionStatus } = await import('./checklist.service');
      const { countAfterPhotos } = await import('./booking-photo.service');
      const checklistStatus = await getChecklistCompletionStatus(bookingId);
      if (!checklistStatus.checklistShown) {
        throw createAppError(
          'Open the checklist before marking the job complete. The customer needs the work documented.',
          400,
        );
      }
      if (!checklistStatus.isFullyComplete) {
        throw createAppError(
          `Complete all ${checklistStatus.totalRequired} required checklist items first ` +
          `(${checklistStatus.completedRequired}/${checklistStatus.totalRequired} done).`,
          400,
        );
      }
      const afterPhotoCount = await countAfterPhotos(bookingId);
      if (afterPhotoCount < 2) {
        throw createAppError(
          `Upload at least 2 "after" photos before marking complete (you have ${afterPhotoCount}).`,
          400,
        );
      }
    }

    const updates: string[] = [`status = $2`, `updated_at = NOW()`];
    const params: unknown[] = [bookingId, newStatus];
    let paramIdx = 3;

    if (newStatus === 'completed_by_provider') {
      updates.push(`completed_at = NOW()`);
      // D27 Phase 4b — stamp the server-clock work-complete time. Only hourly
      // settlement reads it; harmless on fixed bookings. The cap means the
      // customer is never charged for elapsed time beyond the authorization.
      updates.push(`work_completed_at = COALESCE(work_completed_at, NOW())`);
      // BUG-PHASE151-01 fix — persist completion_notes if supplied.
      if (completionNotes && completionNotes.trim().length > 0) {
        updates.push(`completion_notes = $${paramIdx}`);
        params.push(completionNotes.trim());
      }
    } else if (newStatus === 'in_progress') {
      // D27 Phase 4b — start the billable clock from the SERVER (never a client
      // value). COALESCE so a re-entered transition can't reset the start time.
      updates.push(`work_started_at = COALESCE(work_started_at, NOW())`);
    } else if (newStatus === 'confirmed') {
      updates.push(`confirmed_at = NOW()`);
    } else if (newStatus.startsWith('cancelled_')) {
      updates.push(`cancelled_at = NOW()`);
      if (cancellationReason) {
        updates.push(`cancellation_reason = $${paramIdx}`);
        params.push(cancellationReason);
      }
    } else if (newStatus === 'paid') {
      updates.push(`escrow_status = 'held'`);
    } else if (newStatus === 'disputed') {
      updates.push(`escrow_status = 'held'`);
    }

    const result = await client.query<BookingRow>(
      `UPDATE bookings SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params,
    );

    const updated = result.rows[0]!;

    // Phase 200 — keep the provider's completed-jobs counter live. Pre-fix
    // providers.total_jobs was never incremented anywhere, so the "X jobs
    // completed" stat shown to providers/admins (and any experience signal)
    // never grew past the seed value. We count a job as completed when the
    // CUSTOMER confirms it (status -> 'confirmed'); a provider-only
    // 'completed_by_provider' that later gets disputed should not count.
    if (newStatus === 'confirmed' && updated.provider_id) {
      await client.query(
        `UPDATE providers SET total_jobs = total_jobs + 1, updated_at = NOW() WHERE id = $1`,
        [updated.provider_id],
      );
    }

    logger.info('Booking status transitioned', {
      bookingId,
      from: currentStatus,
      to: newStatus,
      userId,
    });

    try {
      socketService.emitAdminEvent(socketService.ADMIN_EVENTS.BOOKING_STATUS_CHANGED, {
        id: bookingId,
        oldStatus: currentStatus,
        newStatus,
      });
    } catch (e) {
      logger.warn('Admin socket emit failed', {
        event: 'booking:status_changed',
        error: e instanceof Error ? e.message : String(e),
      });
    }

    if (newStatus === 'cancelled_by_provider' || newStatus === 'cancelled_by_admin') {
      // BUG-PHASE117-01 fix — pre-fix this used the UTC date of
      // scheduled_at via .toISOString().split('T')[0]. But
      // slot_waitlist.preferred_date is a Manila YYYY-MM-DD (the date
      // the customer asked for in their local context), so an early-
      // morning Manila booking cancellation (e.g. 06:00 Manila May 5
      // = 22:00 UTC May 4) sent waitlist notifications to customers
      // waitlisted for May 4 instead of May 5 — the wrong day.
      // Convert the cancelled booking's scheduled_at to the Manila
      // day so the lookup matches the waitlist's storage convention.
      // Same Manila-tz pattern as Phase 105/113/115/116.
      const dateStr = updated.scheduled_at.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
      slotWaitlistService.processSlotAvailability(
        updated.category_id,
        updated.city,
        dateStr,
      ).catch((err: unknown) => {
        logger.error('Slot waitlist notification failed after cancellation', {
          bookingId,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      });
    }

    // MED-N68 fix — pre-fix code ran this UPDATE OUTSIDE the parent
    // transaction (`db.query` not `client.query`) and added `+ 1` to
    // the COUNT subquery. After the parent trx committed the just-
    // cancelled booking was already visible in the subquery, so the
    // `+ 1` produced double-count.
    //
    // Post-fix: UPDATE runs INSIDE the parent trx via `client.query`
    // (atomic with the booking state change). The COUNT subquery sees
    // the freshly-UPDATE'd bookings row in this same transaction
    // (READ COMMITTED + same client) so no `+ 1` is needed and the
    // count is exactly right. Errors throw and roll back the booking
    // status flip too.
    if (newStatus === 'cancelled_by_provider' && updated.provider_id) {
      try {
        await client.query(
          `UPDATE providers
           SET total_cancellations = total_cancellations + 1,
               cancellations_last_30d = (
                 SELECT COUNT(*) FROM bookings
                 WHERE provider_id = $1
                   AND status = 'cancelled_by_provider'
                   AND cancelled_at > NOW() - INTERVAL '30 days'
               ),
               last_cancellation_at = NOW(),
               updated_at = NOW()
           WHERE id = $1`,
          [updated.provider_id],
        );
      } catch (err: unknown) {
        // Re-throw — we want the booking transition to ROLL BACK if
        // we cannot record the penalty (provider count must always
        // match the bookings table).
        logger.error('Provider cancellation tracking update failed', {
          bookingId,
          providerId: updated.provider_id,
          error: err instanceof Error ? err.message : 'Unknown',
        });
        throw err;
      }
    }

    return updated;
  });
}

async function validateRoleForTransition(
  role: string,
  _currentStatus: BookingStatus,
  newStatus: BookingStatus,
  booking: BookingRow,
  userId: string,
): Promise<void> {
  if (role === 'admin' || role === 'super_admin') return;

  if (newStatus === 'cancelled_by_admin') {
    throw createAppError('Only admins can cancel bookings as admin.', 403);
  }

  if (role === 'customer') {
    if (booking.customer_id !== userId) {
      throw createAppError('You can only manage your own bookings.', 403);
    }

    const customerAllowed: BookingStatus[] = [
      'cancelled_by_customer', 'confirmed', 'disputed', 'payment_pending',
    ];
    if (!customerAllowed.includes(newStatus)) {
      throw createAppError('Customers cannot perform this action.', 403);
    }
  }

  if (role === 'provider') {
    const providerAllowed: BookingStatus[] = [
      'quoted', 'matched', 'provider_en_route', 'provider_arrived',
      'in_progress', 'completed_by_provider', 'cancelled_by_provider',
    ];
    if (!providerAllowed.includes(newStatus)) {
      throw createAppError('Providers cannot perform this action.', 403);
    }

    if (booking.provider_id) {
      interface ProviderRow { user_id: string }
      const providerResult = await db.query<ProviderRow>(
        `SELECT user_id FROM providers WHERE id = $1`,
        [booking.provider_id],
      );
      if (providerResult.rows[0]?.user_id !== userId) {
        throw createAppError('You are not assigned to this booking.', 403);
      }
    }
  }

  // D23 + D15 — the assigned, approved team member drives the on-site steps of
  // their job AND now marks it complete. The completion path enforces the same
  // checklist + after-photo quality gates regardless of who triggers it (those
  // gates key on the booking, not the actor), and the team member can upload
  // those photos (see booking-photo.service resolveBookingRole). Quality still
  // rolls up to the provider account via the booking's performer_staff_id.
  if (role === 'provider_staff') {
    const staffAllowed: BookingStatus[] = [
      'provider_en_route', 'provider_arrived', 'in_progress', 'completed_by_provider',
    ];
    if (!staffAllowed.includes(newStatus)) {
      throw createAppError('Team members can update on-site status (en route, arrived, started) and mark the job complete. Other actions are provider-owner only.', 403);
    }
    const performerStaffId = (booking as { performer_staff_id?: string | null }).performer_staff_id;
    if (!performerStaffId) {
      throw createAppError('This job is not assigned to you.', 403);
    }
    const staffResult = await db.query<{ id: string }>(
      `SELECT id FROM provider_staff WHERE id = $1 AND user_id = $2 AND status = 'approved'`,
      [performerStaffId, userId],
    );
    if (staffResult.rows.length === 0) {
      throw createAppError('This job is not assigned to you.', 403);
    }
  }
}

interface QuoteRow {
  id: string;
  booking_id: string;
  provider_id: string;
  quoted_price: number;
  description: string;
  estimated_duration_minutes: number | null;
  is_accepted: boolean;
  expires_at: Date;
  created_at: Date;
}

interface QueryClient {
  query: <T extends import('pg').QueryResultRow = import('pg').QueryResultRow>(
    text: string,
    params?: unknown[],
  ) => Promise<import('pg').QueryResult<T>>;
}

async function submitQuoteInTransaction(
  client: QueryClient,
  bookingId: string,
  providerUserId: string,
  quotedPrice: number,
  description: string,
  quotePolicy: settingsService.QuotePolicy,
  estimatedDurationMinutes?: number,
): Promise<QuoteRow> {
  interface ProviderRow { id: string }

  const providerResult = await client.query<ProviderRow>(
    `SELECT id FROM providers WHERE user_id = $1 AND status = 'approved'`,
    [providerUserId],
  );

  if (providerResult.rows.length === 0) {
    throw createAppError('Provider profile not found or not approved.', 403);
  }

  const providerId = providerResult.rows[0]!.id;
  // Lock the booking while checking state + quote counts so simultaneous
  // providers cannot both pass the final-slot check.
  const bookingResult = await client.query<BookingRow>(
    `SELECT * FROM bookings WHERE id = $1 FOR UPDATE`,
    [bookingId],
  );
  const booking = bookingResult.rows[0];
  if (!booking) throw createAppError('Booking not found.', 404);
  if (booking.booking_type !== 'quote_based') {
    throw createAppError('This booking does not accept quotes.', 400);
  }
  if (booking.status !== 'requested' && booking.status !== 'quoted') {
    throw createAppError('This booking is no longer accepting quotes.', 409);
  }

  // Enforce the same active-category + service-radius boundary used by the
  // provider Leads list. Before this check, any approved provider who learned
  // a quote-booking UUID could bypass lead discovery and submit directly.
  const eligibility = await client.query<{ eligible: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM providers p
         JOIN provider_services ps ON ps.provider_id = p.id AND ps.is_active = TRUE
         LEFT JOIN service_subcategories ssc ON ssc.id = ps.subcategory_id
        WHERE p.id = $1
          AND (ps.category_id = $2 OR ssc.category_id = $2)
          AND (
            $3::numeric IS NULL OR $4::numeric IS NULL
            OR p.latitude IS NULL OR p.longitude IS NULL
            OR (6371 * acos(LEAST(1.0, GREATEST(-1.0,
              cos(radians($3::numeric)) * cos(radians(p.latitude::numeric))
                * cos(radians(p.longitude::numeric) - radians($4::numeric))
              + sin(radians($3::numeric)) * sin(radians(p.latitude::numeric))
            )))) <= COALESCE(p.service_radius_km, 1000000)
          )
     ) AS eligible`,
    [providerId, booking.category_id, booking.latitude, booking.longitude],
  );
  if (eligibility.rows[0]?.eligible !== true) {
    throw createAppError('This request is outside your active services or service radius.', 403);
  }

  interface QuoteCountRow { count: string }
  const existingQuote = await client.query<QuoteCountRow>(
    `SELECT COUNT(*)::text as count FROM booking_quotes
     WHERE booking_id = $1 AND provider_id = $2`,
    [bookingId, providerId],
  );
  if (Number(existingQuote.rows[0]?.count) > 0) {
    throw createAppError('You have already submitted a quote for this booking.', 409);
  }

  const totalQuotes = await client.query<QuoteCountRow>(
    `SELECT COUNT(*)::text as count FROM booking_quotes WHERE booking_id = $1`,
    [bookingId],
  );
  if (Number(totalQuotes.rows[0]?.count) >= quotePolicy.maxPerBooking) {
    throw createAppError(`This booking already has the maximum of ${quotePolicy.maxPerBooking} quotes.`, 409);
  }

  const expiresAt = new Date(Date.now() + quotePolicy.expiryHours * 60 * 60 * 1000);
  const result = await client.query<QuoteRow>(
    `INSERT INTO booking_quotes (booking_id, provider_id, quoted_price, description, estimated_duration_minutes, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [bookingId, providerId, quotedPrice, description, estimatedDurationMinutes ?? null, expiresAt],
  );

  if (booking.status === 'requested') {
    await client.query(
      `UPDATE bookings SET status = 'quoted', updated_at = NOW() WHERE id = $1`,
      [bookingId],
    );
  }

  return result.rows[0]!;
}

export async function submitQuote(
  bookingId: string,
  providerUserId: string,
  quotedPrice: number,
  description: string,
  estimatedDurationMinutes?: number,
): Promise<QuoteRow> {
  const quotePolicy = await settingsService.getQuotePolicy();
  const quote = await db.transaction((client) => submitQuoteInTransaction(
    client,
    bookingId,
    providerUserId,
    quotedPrice,
    description,
    quotePolicy,
    estimatedDurationMinutes,
  ));
  logger.info('Quote submitted', {
    bookingId,
    providerId: quote.provider_id,
    quotedPrice: quote.quoted_price,
  });
  return quote;
}

// ────────────────────────────────────────────────────────────────────
// Enhanced quote flow (Sprint 9)
// ────────────────────────────────────────────────────────────────────

interface LineItemInput {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  itemType?: string;
}

export async function submitStructuredQuote(
  bookingId: string,
  providerUserId: string,
  data: {
    quotedPrice: number;
    description: string;
    estimatedDurationMinutes?: number;
    estimatedDays?: number;
    notes?: string;
    portfolioPhotos?: string[];
    lineItems?: LineItemInput[];
  },
): Promise<Record<string, unknown>> {
  const lineItems = data.lineItems ?? [];
  const canonicalTotal = lineItems.reduce(
    (sum, item) => sum + Math.round(item.quantity * item.unitPrice),
    0,
  );
  if (!Number.isSafeInteger(canonicalTotal) || canonicalTotal < platformConfig.minimumQuoteAmount) {
    throw createAppError(`Itemized quote total must be at least ${formatPHP(platformConfig.minimumQuoteAmount)}.`, 400);
  }
  const laborAmount = lineItems
    .filter(i => i.itemType === 'labor' || !i.itemType)
    .reduce((s, i) => s + Math.round(i.quantity * i.unitPrice), 0);
  const materialsAmount = lineItems
    .filter(i => i.itemType === 'materials')
    .reduce((s, i) => s + Math.round(i.quantity * i.unitPrice), 0);
  const quotePolicy = await settingsService.getQuotePolicy();

  const quote = await db.transaction(async (client) => {
    const createdQuote = await submitQuoteInTransaction(
      client,
      bookingId,
      providerUserId,
      canonicalTotal,
      data.description,
      quotePolicy,
      data.estimatedDurationMinutes,
    );

    await client.query(
      `UPDATE booking_quotes
       SET labor_amount = $2, materials_amount = $3, estimated_days = $4,
           notes = $5, portfolio_photos = $6, updated_at = NOW()
       WHERE id = $1`,
      [
        createdQuote.id,
        laborAmount,
        materialsAmount,
        data.estimatedDays ?? null,
        data.notes ?? '',
        data.portfolioPhotos ?? [],
      ],
    );

    const values: unknown[] = [];
    const placeholders: string[] = [];
    let idx = 1;
    for (const item of lineItems) {
      const lineTotal = Math.round(item.quantity * item.unitPrice);
      placeholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
      values.push(createdQuote.id, item.description, item.quantity, item.unit, item.unitPrice, lineTotal, item.itemType ?? 'labor');
    }
    await client.query(
      `INSERT INTO quote_line_items (quote_id, description, quantity, unit, unit_price, line_total, item_type)
       VALUES ${placeholders.join(', ')}`,
      values,
    );
    return createdQuote;
  });

  logger.info('Structured quote submitted', { bookingId, quoteId: quote.id, quotedPrice: canonicalTotal });
  return {
    ...quote,
    quoted_price: canonicalTotal,
    laborAmount,
    materialsAmount,
    estimatedDays: data.estimatedDays ?? null,
    notes: data.notes ?? '',
    lineItems,
  };
}

interface QuoteDetailRow extends QuoteRow {
  status: string;
  labor_amount: number;
  materials_amount: number;
  estimated_days: number | null;
  notes: string;
  portfolio_photos: string[];
  updated_at: Date;
  provider_name?: string;
  provider_rating?: string;
  provider_total_jobs?: number;
}

interface LineItemRow {
  id: string;
  quote_id: string;
  description: string;
  quantity: string;
  unit: string;
  unit_price: number;
  line_total: number;
  item_type: string;
}

export async function getBookingQuotes(bookingId: string): Promise<Record<string, unknown>[]> {
  const quotes = await db.query<QuoteDetailRow>(
    `SELECT bq.*,
       CONCAT(u.first_name, ' ', u.last_name) as provider_name,
       p.rating::text as provider_rating,
       p.total_jobs as provider_total_jobs
     FROM booking_quotes bq
     JOIN providers p ON p.id = bq.provider_id
     JOIN users u ON u.id = p.user_id
     WHERE bq.booking_id = $1
     ORDER BY bq.created_at ASC`,
    [bookingId],
  );

  const quoteIds = quotes.rows.map(q => q.id);
  let lineItemsMap: Record<string, LineItemRow[]> = {};
  if (quoteIds.length > 0) {
    const lineItems = await db.query<LineItemRow>(
      `SELECT * FROM quote_line_items WHERE quote_id = ANY($1) ORDER BY created_at ASC`,
      [quoteIds],
    );
    lineItemsMap = lineItems.rows.reduce<Record<string, LineItemRow[]>>((acc, li) => {
      (acc[li.quote_id] ??= []).push(li);
      return acc;
    }, {});
  }

  return quotes.rows.map(q => ({
    id: q.id,
    bookingId: q.booking_id,
    providerId: q.provider_id,
    quotedPrice: q.quoted_price,
    description: q.description,
    estimatedDurationMinutes: q.estimated_duration_minutes,
    status: q.status ?? (q.is_accepted ? 'accepted' : 'submitted'),
    laborAmount: q.labor_amount ?? 0,
    materialsAmount: q.materials_amount ?? 0,
    estimatedDays: q.estimated_days,
    notes: q.notes ?? '',
    portfolioPhotos: q.portfolio_photos ?? [],
    expiresAt: q.expires_at,
    createdAt: q.created_at,
    providerName: q.provider_name ?? null,
    providerRating: q.provider_rating ? Number(q.provider_rating) : null,
    providerTotalJobs: q.provider_total_jobs ?? 0,
    lineItems: (lineItemsMap[q.id] ?? []).map(li => ({
      id: li.id,
      description: li.description,
      quantity: Number(li.quantity),
      unit: li.unit,
      unitPrice: li.unit_price,
      lineTotal: li.line_total,
      itemType: li.item_type,
    })),
  }));
}

export async function acceptQuote(bookingId: string, quoteId: string, customerId: string): Promise<Record<string, unknown>> {
  const booking = await getBookingByIdAdmin(bookingId);
  if (booking.customer_id !== customerId) {
    throw createAppError('Not authorized.', 403);
  }
  if (booking.status !== 'quoted' && booking.status !== 'requested') {
    throw createAppError('Booking is not in a state to accept quotes.', 409);
  }

  interface QuoteAcceptRow { id: string; provider_id: string; quoted_price: number }
  const quoteResult = await db.query<QuoteAcceptRow>(
    `SELECT id, provider_id, quoted_price FROM booking_quotes
     WHERE id = $1 AND booking_id = $2 AND expires_at > NOW()`,
    [quoteId, bookingId],
  );
  if (quoteResult.rows.length === 0) {
    throw createAppError('Quote not found or expired.', 404);
  }

  const quote = quoteResult.rows[0]!;
  const { discountAmount } = await sukiService.calculateSukiDiscountForBooking(
    customerId, quote.provider_id, quote.quoted_price,
  );
  const discountedPrice = quote.quoted_price - discountAmount;
  const serviceFee = await calculateServiceFee(discountedPrice);
  const totalAmount = discountedPrice + serviceFee;

  return db.transaction(async (client) => {
    await client.query(
      `UPDATE booking_quotes SET is_accepted = TRUE, status = 'accepted', updated_at = NOW()
       WHERE id = $1`,
      [quoteId],
    );

    await client.query(
      `UPDATE booking_quotes SET status = 'declined', updated_at = NOW()
       WHERE booking_id = $1 AND id != $2 AND status = 'submitted'`,
      [bookingId, quoteId],
    );

    await client.query(
      `UPDATE bookings SET
         provider_id = $2,
         service_price = $3,
         service_fee = $4,
         total_amount = $5,
         suki_discount = $6,
         status = 'payment_pending',
         updated_at = NOW()
       WHERE id = $1`,
      [bookingId, quote.provider_id, discountedPrice, serviceFee, totalAmount, discountAmount],
    );

    logger.info('Quote accepted', {
      bookingId, quoteId, providerId: quote.provider_id,
      originalPrice: quote.quoted_price, sukiDiscount: discountAmount, totalAmount,
    });
    return { quoteId, providerId: quote.provider_id, totalAmount };
  });
}

export async function declineQuote(bookingId: string, quoteId: string, customerId: string): Promise<Record<string, unknown>> {
  const booking = await getBookingByIdAdmin(bookingId);
  if (booking.customer_id !== customerId) {
    throw createAppError('Not authorized.', 403);
  }

  const result = await db.query(
    `UPDATE booking_quotes SET status = 'declined', updated_at = NOW()
     WHERE id = $1 AND booking_id = $2 AND status = 'submitted'
     RETURNING id`,
    [quoteId, bookingId],
  );
  if (result.rowCount === 0) {
    throw createAppError('Quote not found or already resolved.', 404);
  }

  logger.info('Quote declined', { bookingId, quoteId });
  return { quoteId };
}

// ────────────────────────────────────────────────────────────────────
// Job Requests (custom quote bookings)
// ────────────────────────────────────────────────────────────────────

export async function createJobRequest(
  customerId: string,
  data: {
    categoryId: string;
    subcategoryId?: string;
    description: string;
    address: string;
    barangay: string;
    city: string;
    province: string;
    latitude: number;
    longitude: number;
    urgency: string;
    budgetMin?: number;
    budgetMax?: number;
    jobPhotos?: string[];
    jobVideoUrl?: string;
    // D27 Phase 2 — structured per-subcategory intake answers keyed by field_key.
    intakeAnswers?: Record<string, unknown>;
  },
): Promise<BookingRow> {
  await assertBookableLocation(data.latitude, data.longitude);
  const scheduledAt = new Date();
  if (data.urgency === 'same_day') {
    scheduledAt.setHours(scheduledAt.getHours() + 4);
  } else if (data.urgency === 'within_3_days') {
    scheduledAt.setDate(scheduledAt.getDate() + 2);
  } else if (data.urgency === 'within_a_week') {
    scheduledAt.setDate(scheduledAt.getDate() + 5);
  } else {
    scheduledAt.setDate(scheduledAt.getDate() + 7);
  }

  const result = await db.query<BookingRow>(
    `INSERT INTO bookings
       (customer_id, category_id, subcategory_id, booking_type, description,
        address, barangay, city, province, latitude, longitude,
        scheduled_at, urgency, budget_min, budget_max, job_photos, job_video_url,
        intake_answers)
     VALUES ($1, $2, $3, 'quote_based', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb)
     RETURNING *`,
    [
      customerId, data.categoryId, data.subcategoryId ?? null, data.description,
      data.address, data.barangay, data.city, data.province,
      data.latitude ?? null, data.longitude ?? null,
      scheduledAt, data.urgency,
      data.budgetMin ?? null, data.budgetMax ?? null,
      data.jobPhotos ?? [], data.jobVideoUrl ?? null,
      data.intakeAnswers && Object.keys(data.intakeAnswers).length > 0
        ? JSON.stringify(data.intakeAnswers)
        : null,
    ],
  );

  logger.info('Job request created', { bookingId: result.rows[0]!.id, customerId });
  return result.rows[0]!;
}

async function assertBookableLocation(latitude?: number, longitude?: number): Promise<void> {
  // UX-052 — matching cannot dispatch a booking without coordinates. The old
  // API accepted coordinate-less and out-of-market bookings, allowing payment
  // before kickOfferCycle later failed or found nobody.
  if (latitude == null || longitude == null) {
    throw createAppError(
      'Select an exact service location before booking. We need a map pin or device location to dispatch a provider.',
      400,
    );
  }
  const coverage = await serviceAreaService.checkCoverage(latitude, longitude);
  if (!coverage.covered) {
    throw createAppError(
      'onService is not available at this location yet. Choose a location inside an active service area.',
      422,
    );
  }
}

// ────────────────────────────────────────────────────────────────────
// Change Orders
// ────────────────────────────────────────────────────────────────────

interface ChangeOrderRow {
  id: string;
  booking_id: string;
  provider_id: string;
  description: string;
  additional_amount: number;
  photos: string[];
  status: string;
  customer_responded_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// D27 Phase 3 — same ₱10,000 hard sanity cap as the validator, enforced here
// too because the resolved total from line items can't be bounded at the schema
// layer (the schema only sees the per-item prices, not their sum).
const CHANGE_ORDER_HARD_CAP_CENTAVOS = 1_000_000;

interface ChangeOrderLineItemInput {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  itemType?: 'labor' | 'materials' | 'equipment' | 'other';
}

export async function createChangeOrder(
  bookingId: string,
  providerUserId: string,
  data: {
    description: string;
    additionalAmount?: number;
    photos?: string[];
    lineItems?: ChangeOrderLineItemInput[];
  },
): Promise<Record<string, unknown>> {
  interface ProviderIdRow { id: string }
  const providerResult = await db.query<ProviderIdRow>(
    `SELECT id FROM providers WHERE user_id = $1 AND status = 'approved'`,
    [providerUserId],
  );
  if (providerResult.rows.length === 0) {
    throw createAppError('Provider not found or not approved.', 403);
  }
  const providerId = providerResult.rows[0]!.id;

  const booking = await getBookingByIdAdmin(bookingId);
  if (booking.provider_id !== providerId) {
    throw createAppError('You are not the assigned provider for this booking.', 403);
  }
  if (booking.status !== 'in_progress') {
    throw createAppError('Change orders can only be submitted during active jobs.', 409);
  }

  // D27 Phase 3 — when line items are present the canonical additional amount is
  // their summed total; the client-sent additionalAmount is ignored (server-
  // canonical, same as quotes). Otherwise fall back to the lump-sum amount.
  const lineItems = data.lineItems ?? [];
  const lineItemTotals = lineItems.map((i) => ({ ...i, lineTotal: Math.round(i.quantity * i.unitPrice) }));
  const resolvedAmount =
    lineItems.length > 0
      ? lineItemTotals.reduce((s, i) => s + i.lineTotal, 0)
      : (data.additionalAmount ?? 0);

  // Re-validate the resolved total against the same bounds the schema enforces
  // on a lump-sum amount (the schema can't see the summed line-item total).
  if (resolvedAmount < platformConfig.minimumChangeOrderAmount) {
    throw createAppError(
      `Change order total must be at least ${Math.floor(platformConfig.minimumChangeOrderAmount)} centavos.`,
      400,
    );
  }
  if (resolvedAmount > CHANGE_ORDER_HARD_CAP_CENTAVOS) {
    throw createAppError('Change-order amount exceeds platform sanity cap.', 400);
  }

  // Phase 14 Dispatch 05 — Bug 1219.
  // Enforce 50% relative cap (was previously a warn-only log, allowing
  // a malicious or compromised provider to submit, e.g., ₱5,000 above
  // a ₱500 booking). Combined with the hard ₱10K sanity cap above, this
  // bounds the change-order amount to a realistic fraction of the
  // original service price.
  const FIFTY_PERCENT_OF_SERVICE = booking.service_price * 0.5;
  if (resolvedAmount > FIFTY_PERCENT_OF_SERVICE) {
    throw createAppError(
      `Change order cannot exceed 50% of the original service price (max ${Math.floor(FIFTY_PERCENT_OF_SERVICE)} centavos).`,
      400,
    );
  }

  // Insert the change order and its line items atomically.
  const created = await db.transaction(async (client) => {
    const coResult = await client.query<ChangeOrderRow>(
      `INSERT INTO change_orders (booking_id, provider_id, description, additional_amount, photos)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [bookingId, providerId, data.description, resolvedAmount, data.photos ?? []],
    );
    const co = coResult.rows[0]!;

    if (lineItemTotals.length > 0) {
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let idx = 1;
      for (const item of lineItemTotals) {
        placeholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
        values.push(co.id, item.description, item.quantity, item.unit, item.unitPrice, item.lineTotal, item.itemType ?? 'materials');
      }
      await client.query(
        `INSERT INTO change_order_line_items (change_order_id, description, quantity, unit, unit_price, line_total, item_type)
         VALUES ${placeholders.join(', ')}`,
        values,
      );
    }
    return co;
  });

  logger.info('Change order created', { bookingId, changeOrderId: created.id, lineItems: lineItemTotals.length });
  return formatChangeOrder(created, null, null, lineItemTotals.map((i) => ({
    description: i.description,
    quantity: i.quantity,
    unit: i.unit,
    unitPrice: i.unitPrice,
    lineTotal: i.lineTotal,
    itemType: i.itemType ?? 'materials',
  })));
}

export async function respondToChangeOrder(
  changeOrderId: string,
  customerId: string,
  approved: boolean,
): Promise<Record<string, unknown>> {
  const newStatus = approved ? 'approved' : 'declined';

  return db.transaction(async (client) => {
    const coResult = await client.query<ChangeOrderRow>(
      `SELECT co.* FROM change_orders co
       JOIN bookings b ON b.id = co.booking_id
       WHERE co.id = $1 AND b.customer_id = $2 AND co.status = 'pending'
       FOR UPDATE OF co, b`,
      [changeOrderId, customerId],
    );
    if (coResult.rows.length === 0) {
      throw createAppError('Change order not found or already resolved.', 404);
    }
    const co = coResult.rows[0]!;

    const updateResult = await client.query(
      `UPDATE change_orders SET status = $2, customer_responded_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'pending' RETURNING id`,
      [changeOrderId, newStatus],
    );
    if ((updateResult.rowCount ?? 0) === 0) {
      throw createAppError('Change order already resolved (concurrent update).', 409);
    }

    if (!approved) {
      logger.info('Change order declined', { changeOrderId });
      return { id: changeOrderId, status: newStatus, paymentRequired: false };
    }

    const bookingResult = await client.query<{ service_price: number; service_fee: number; total_amount: number }>(
      `SELECT service_price, service_fee, total_amount FROM bookings WHERE id = $1 FOR UPDATE`,
      [co.booking_id],
    );
    const current = bookingResult.rows[0];
    if (!current) throw createAppError('Booking not found.', 404);

    const terms = await financialTermsService.getLatestFinalTermsInTransaction(client, co.booking_id);
    const newServicePrice = current.service_price + co.additional_amount;
    const newServiceFee = financialTermsService.calculateServiceFeeFromTerms(newServicePrice, terms);
    const newTotalAmount = newServicePrice + newServiceFee;
    const additionalTotal = newTotalAmount - current.total_amount;
    const additionalServiceFee = additionalTotal - co.additional_amount;

    logger.info('Change order approved — awaiting additional payment', {
      changeOrderId,
      bookingId: co.booking_id,
      additionalAmount: co.additional_amount,
      additionalServiceFee,
      additionalTotal,
    });
    return {
      id: changeOrderId,
      status: newStatus,
      bookingId: co.booking_id,
      paymentRequired: true,
      additionalAmount: co.additional_amount,
      additionalServiceFee,
      additionalTotal,
    };
  });
}

/**
 * MED-N70 fix — auto-expire change orders that were customer-approved
 * but never had `finalizeChangeOrderPayment` called within the
 * configured window (default 24 hours).
 *
 * Pre-fix: respondToChangeOrder(approved=TRUE) committed the
 * status='approved' update, returned `paymentRequired: true`, and
 * relied on the customer to call finalizeChangeOrderPayment. If the
 * customer closed the app, lost network, or simply forgot, the
 * change_order sat in 'approved' state forever, and the provider
 * could (mis-)read this as authorization to do additional work that
 * was never paid for.
 *
 * Post-fix: this worker runs in the cron schedule (alongside
 * processRecurringBookings, expireBlockedIps, etc.). It flips any
 * approved change_orders older than the window to 'expired' and
 * notifies both the customer and the provider so they know the
 * change-order amount has been canceled.
 *
 * Returns the count of expired rows.
 */
export async function expireApprovedChangeOrders(): Promise<number> {
  // Read the window from settings; fallback to 24 h. Defensive: if
  // the setting fetch fails (Redis/DB blip), default to the safe
  // value rather than blocking the worker.
  let windowHours = 24;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const settingsService = require('./settings.service');
    if (typeof settingsService.getSettingNumber === 'function') {
      const fetched = await settingsService.getSettingNumber('change_order_approval_expiry_hours');
      if (Number.isFinite(fetched) && fetched > 0) windowHours = Number(fetched);
    }
  } catch {
    /* fall through to default */
  }

  // Single UPDATE for atomicity. RETURNING gives us the rows for
  // notification. Filter on customer_responded_at since that's the
  // moment the approval clock starts (approvals immediately set it).
  const expired = await db.query<{ id: string; booking_id: string; provider_id: string; additional_amount: number }>(
    `UPDATE change_orders
        SET status = 'expired', updated_at = NOW()
      WHERE status = 'approved'
        AND customer_responded_at IS NOT NULL
        AND customer_responded_at < NOW() - make_interval(hours => $1)
      RETURNING id, booking_id, provider_id, additional_amount`,
    [windowHours],
  );

  if (expired.rowCount && expired.rowCount > 0) {
    logger.info('Change orders auto-expired', { count: expired.rowCount, windowHours });

    // Best-effort notification to both sides; failures here must NOT
    // roll back the expiry since the worker is fire-and-forget and
    // we don't want a notification outage to leave change_orders in
    // 'approved' forever.
    for (const row of expired.rows) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const notif = require('./notification.service');
        const customerLookup = await db.query<{ customer_id: string; provider_user_id: string | null }>(
          `SELECT b.customer_id, p.user_id AS provider_user_id
             FROM bookings b
             LEFT JOIN providers p ON p.id = $2
            WHERE b.id = $1`,
          [row.booking_id, row.provider_id],
        );
        const ids = customerLookup.rows[0];
        if (!ids) continue;
        await notif.createPushNotification({
          userId: ids.customer_id,
          type: 'change_order_expired',
          title: 'Change order expired',
          body: `An approved change order on your booking expired without payment and has been canceled.`,
          data: { bookingId: row.booking_id, changeOrderId: row.id },
        });
        if (ids.provider_user_id) {
          await notif.createPushNotification({
            userId: ids.provider_user_id,
            type: 'change_order_expired',
            title: 'Change order expired',
            body: `A customer-approved change order expired without payment. Do not perform the additional work.`,
            data: { bookingId: row.booking_id, changeOrderId: row.id },
          });
        }
      } catch (err) {
        logger.warn('Failed to dispatch change-order expiry notification', {
          changeOrderId: row.id,
          error: (err as Error).message,
        });
      }
    }
  }

  return expired.rowCount ?? 0;
}

/**
 * Phase B CRIT-15 fix — finalize change order payment now requires
 * verified payment proof. Two payment paths supported:
 *
 *   { kind: 'paymongo', intentId: string }
 *     - The intent must exist, status === 'succeeded', amount ===
 *       additionalTotal, AND belong to this booking (either
 *       intent.booking_id matches OR intent.metadata.change_order_id
 *       matches).
 *
 *   { kind: 'wallet' }
 *     - Customer wallet is debited inside the same trx as the
 *       change_order/booking updates. Wallet must hold >=
 *       additionalTotal in available_balance. The wallet movement
 *       is irreversible-on-success and the booking update is in
 *       lockstep.
 *
 * Pre-fix: the function took (changeOrderId, customerId) only — no
 * payment intent ID, no payment proof, no integration with
 * payment.service. The customer (or anyone with their session) could
 * call this endpoint without paying, the booking total would
 * increase, and at escrow release the platform would silently pay
 * the extra out of platform_escrow → silent platform loss.
 *
 * Plus: the booking must be in a finalizable status. A change-order
 * finalization on a cancelled / disputed / completed booking is
 * rejected (CRIT-17 family follow-up).
 */
export type ChangeOrderPaymentProof =
  | { kind: 'paymongo'; intentId: string }
  | { kind: 'wallet' };

export async function finalizeChangeOrderPayment(
  changeOrderId: string,
  customerId: string,
  paymentProof: ChangeOrderPaymentProof,
): Promise<{
  bookingId: string;
  newServicePrice: number;
  newServiceFee: number;
  newTotalAmount: number;
  additionalTotal: number;
}> {
  if (!paymentProof || (paymentProof.kind !== 'paymongo' && paymentProof.kind !== 'wallet')) {
    throw createAppError('paymentProof of kind "paymongo" or "wallet" is required.', 400);
  }
  if (paymentProof.kind === 'paymongo' && (!paymentProof.intentId || typeof paymentProof.intentId !== 'string')) {
    throw createAppError('paymentProof.intentId is required for PayMongo finalize.', 400);
  }

  return db.transaction(async (client) => {
    const coResult = await client.query<ChangeOrderRow>(
      `SELECT co.* FROM change_orders co
       JOIN bookings b ON b.id = co.booking_id
       WHERE co.id = $1 AND b.customer_id = $2 AND co.status = 'approved'
       FOR UPDATE`,
      [changeOrderId, customerId],
    );
    if (coResult.rows.length === 0) {
      throw createAppError('Approved change order not found or already paid.', 404);
    }
    const co = coResult.rows[0]!;

    const bookingResult = await client.query<{ service_price: number; service_fee: number; total_amount: number; status: string }>(
      `SELECT service_price, service_fee, total_amount, status FROM bookings WHERE id = $1 FOR UPDATE`,
      [co.booking_id],
    );
    const current = bookingResult.rows[0];
    if (!current) throw createAppError('Booking not found.', 404);

    // CRIT-15 follow-up — booking must still be in a state that
    // accepts a change-order finalization.
    const FINALIZABLE = new Set(['in_progress', 'paid', 'matched', 'provider_en_route', 'provider_arrived']);
    if (!FINALIZABLE.has(current.status)) {
      throw createAppError(
        `Cannot finalize change order on booking in status '${current.status}'.`,
        409,
      );
    }

    const currentTerms = await financialTermsService.getLatestFinalTermsInTransaction(client, co.booking_id);
    const newServicePrice = current.service_price + co.additional_amount;
    const newServiceFee = financialTermsService.calculateServiceFeeFromTerms(newServicePrice, currentTerms);
    const newTotalAmount = newServicePrice + newServiceFee;
    const additionalTotal = newTotalAmount - current.total_amount;

    // CRIT-15 — verify the payment proof.
    if (paymentProof.kind === 'paymongo') {
      interface PaymentIntentVerifyRow {
        id: string;
        booking_id: string;
        amount: string | number;
        status: string;
        metadata: Record<string, unknown> | null;
      }
      const intentResult = await client.query<PaymentIntentVerifyRow>(
        `SELECT id, booking_id, amount, status, metadata
           FROM payment_intents WHERE id = $1 FOR UPDATE`,
        [paymentProof.intentId],
      );
      const intent = intentResult.rows[0];
      if (!intent) {
        throw createAppError('Payment intent not found for change order.', 404);
      }
      if (intent.status !== 'succeeded') {
        throw createAppError(
          `Cannot finalize change order — payment intent status is '${intent.status}', expected 'succeeded'.`,
          409,
        );
      }
      const metadataChangeOrderId = (intent.metadata as { change_order_id?: string } | null)?.change_order_id;
      const matchesBooking = intent.booking_id === co.booking_id;
      const matchesChangeOrder = metadataChangeOrderId === changeOrderId;
      if (!matchesBooking && !matchesChangeOrder) {
        throw createAppError(
          'Payment intent does not match this booking or change order.',
          409,
        );
      }
      if (Number(intent.amount) !== additionalTotal) {
        throw createAppError(
          `Payment intent amount ${Number(intent.amount)} does not match expected change-order total ${additionalTotal}.`,
          409,
        );
      }
    } else {
      // Wallet path — debit the customer's wallet inside this trx.
      // We hand-roll the SQL (rather than calling walletService.debit)
      // so it joins the open trx instead of opening a nested one.
      const walletResult = await client.query<{ id: string; available_balance: string }>(
        `SELECT id, available_balance::text AS available_balance
           FROM wallets
          WHERE user_id = $1 AND type = 'customer'
          FOR UPDATE`,
        [customerId],
      );
      const wallet = walletResult.rows[0];
      if (!wallet) {
        throw createAppError('Customer wallet not found.', 404);
      }
      if (Number(wallet.available_balance) < additionalTotal) {
        throw createAppError(
          `Insufficient wallet balance for change order (need ${additionalTotal}, have ${wallet.available_balance}).`,
          400,
        );
      }
      await client.query(
        `UPDATE wallets SET available_balance = available_balance - $1, updated_at = NOW() WHERE id = $2`,
        [additionalTotal, wallet.id],
      );
      await client.query(
        `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description, reference_id)
         VALUES ($1, $2, 'payment', $3,
                 (SELECT available_balance FROM wallets WHERE id = $1),
                 'Change order additional payment', $4)`,
        [wallet.id, co.booking_id, -additionalTotal, changeOrderId],
      );
    }

    await client.query(
      `UPDATE change_orders SET status = 'paid', updated_at = NOW() WHERE id = $1`,
      [changeOrderId],
    );

    await client.query(
      `UPDATE bookings SET
         service_price = $2,
         service_fee = $3,
         total_amount = $4,
         updated_at = NOW()
       WHERE id = $1`,
      [co.booking_id, newServicePrice, newServiceFee, newTotalAmount],
    );

    // E50: an authorized change order appends a new immutable terms version
    // using the booking's original commission and fee agreement. The added
    // escrow hold is part of this same transaction, so price, customer debit,
    // financial evidence, and held funds cannot diverge.
    await financialTermsService.appendAmendedTermsInTransaction(
      client,
      {
        bookingId: co.booking_id,
        event: 'change_order_authorized',
        sourceEventId: changeOrderId,
        createdBy: customerId,
        metadata: {
          paymentKind: paymentProof.kind,
          additionalServiceAmountCentavos: co.additional_amount,
          additionalTotalCentavos: additionalTotal,
        },
      },
    );
    await escrowService.holdInEscrowInTransaction(client, co.booking_id, additionalTotal);

    logger.info('Change order payment finalized — booking amounts updated', {
      changeOrderId,
      bookingId: co.booking_id,
      paymentKind: paymentProof.kind,
      paymentIntentId: paymentProof.kind === 'paymongo' ? paymentProof.intentId : undefined,
      additionalAmount: co.additional_amount,
      newServicePrice,
      newServiceFee,
      newTotalAmount,
    });

    return { bookingId: co.booking_id, newServicePrice, newServiceFee, newTotalAmount, additionalTotal };
  });
}

interface ChangeOrderLineItemRow {
  id: string;
  change_order_id: string;
  description: string;
  quantity: string;
  unit: string;
  unit_price: number;
  line_total: number;
  item_type: string;
}

function formatChangeOrderLineItem(r: ChangeOrderLineItemRow): Record<string, unknown> {
  return {
    id: r.id,
    description: r.description,
    quantity: Number(r.quantity),
    unit: r.unit,
    unitPrice: r.unit_price,
    lineTotal: r.line_total,
    itemType: r.item_type,
  };
}

export async function getChangeOrders(bookingId: string): Promise<Record<string, unknown>[]> {
  const result = await db.query<ChangeOrderRow>(
    `SELECT * FROM change_orders WHERE booking_id = $1 ORDER BY created_at ASC`,
    [bookingId],
  );

  // D27 Phase 3 — fetch line items for all change orders on this booking in one
  // query and group them by change_order_id (mirrors getBookingQuotes).
  const coIds = result.rows.map((co) => co.id);
  let lineItemsMap: Record<string, Record<string, unknown>[]> = {};
  if (coIds.length > 0) {
    const li = await db.query<ChangeOrderLineItemRow>(
      `SELECT * FROM change_order_line_items WHERE change_order_id = ANY($1) ORDER BY created_at ASC`,
      [coIds],
    );
    lineItemsMap = li.rows.reduce<Record<string, Record<string, unknown>[]>>((acc, r) => {
      (acc[r.change_order_id] ??= []).push(formatChangeOrderLineItem(r));
      return acc;
    }, {});
  }

  // Phase 200 — include the marginal service fee + total for each order so
  // the customer's "pay additional amount" screen can show the real total
  // and enforce the wallet-balance gate when re-paying an already-approved
  // order. Pre-fix only `additionalAmount` was returned, so the re-pay path
  // showed no total and silently bypassed the insufficient-funds check.
  // The baseline is the booking's CURRENT service_price/total_amount, which
  // for an approved-but-unpaid order is the pre-change baseline (the booking
  // is only updated at payment finalization) — so this matches exactly what
  // respondToChangeOrder returned at approval time.
  const bookingRow = await db.query<{ service_price: number; total_amount: number }>(
    `SELECT service_price, total_amount FROM bookings WHERE id = $1`,
    [bookingId],
  );
  const baseline = bookingRow.rows[0];
  const latestTerms = baseline ? await financialTermsService.getLatestTermsOrNull(bookingId) : null;
  const terms = latestTerms?.termsState === 'final' ? latestTerms : null;
  const financialTermsReviewRequired = baseline !== undefined && terms === null;

  return Promise.all(
    result.rows.map(async (co) => {
      let additionalServiceFee: number | null = null;
      let additionalTotal: number | null = null;
      if (baseline && terms) {
        const newServicePrice = baseline.service_price + co.additional_amount;
        const newServiceFee = financialTermsService.calculateServiceFeeFromTerms(newServicePrice, terms);
        additionalTotal = (newServicePrice + newServiceFee) - baseline.total_amount;
        additionalServiceFee = additionalTotal - co.additional_amount;
      }
      return formatChangeOrder(
        co,
        additionalServiceFee,
        additionalTotal,
        lineItemsMap[co.id] ?? [],
        financialTermsReviewRequired,
      );
    }),
  );
}

function formatChangeOrder(
  co: ChangeOrderRow,
  additionalServiceFee: number | null = null,
  additionalTotal: number | null = null,
  lineItems: Record<string, unknown>[] = [],
  financialTermsReviewRequired = false,
): Record<string, unknown> {
  return {
    id: co.id,
    bookingId: co.booking_id,
    providerId: co.provider_id,
    description: co.description,
    additionalAmount: co.additional_amount,
    additionalServiceFee,
    additionalTotal,
    financialTermsReviewRequired,
    lineItems,
    photos: co.photos ?? [],
    status: co.status,
    customerRespondedAt: co.customer_responded_at,
    createdAt: co.created_at,
  };
}
