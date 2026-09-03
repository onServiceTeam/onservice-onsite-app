import { db } from '../models/db';

import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import * as notificationService from './notification.service';
import { calculateServiceFee } from './booking.service';
import { formatPHP } from '../utils/currency';

interface RecurringBookingRow {
  id: string;
  customer_id: string;
  provider_id: string | null;
  category_id: string;
  subcategory_id: string | null;
  original_booking_id: string | null;
  frequency: 'weekly' | 'bi_weekly' | 'monthly';
  preferred_day: number;
  preferred_time: string;
  address: string;
  barangay: string;
  city: string;
  province: string;
  latitude: string | null;
  longitude: string | null;
  service_price: number;
  service_fee: number;
  total_amount: number;
  status: string;
  next_booking_date: string;
  last_booking_date: string | null;
  skip_dates: string[];
  auto_charge: boolean;
  // E02 / D22 — auto-charge state.
  payment_method_id?: string | null;
  payment_method_label?: string | null;
  auto_charge_status?: string | null;
  auto_charge_consecutive_failures?: number;
  auto_charge_suspended_at?: string | null;
  auto_charge_last_attempt_at?: string | null;
  allow_substitute: boolean;
  total_instances: number;
  cancelled_at: Date | null;
  cancellation_reason: string | null;
  created_at: Date;
  updated_at: Date;
  // BUG-PHASE85-01 — joined display fields for the customer recurring
  // list/detail screens. Pre-fix the screens read `categoryName`,
  // `subcategoryName`, `providerName`, `nextScheduledDate`,
  // `totalCompleted`, and `totalSkipped` — none of which the bare
  // `SELECT *` query returned. The list rendered the title row
  // empty, the "Next:" date never appeared, and counters showed
  // "undefined". The enriched query below populates these.
  category_name?: string | null;
  subcategory_name?: string | null;
  provider_name?: string | null;
  total_completed?: number;
  total_skipped?: number;
}

interface RecurringInstanceRow {
  id: string;
  recurring_booking_id: string;
  booking_id: string | null;
  scheduled_date: string;
  status: string;
  substitute_provider_id: string | null;
  failure_reason: string | null;
  created_at: Date;
  booking_status?: string | null;
}

interface RecurringSourceBookingRow {
  customer_id: string;
  category_id: string;
  subcategory_id: string | null;
  booking_type: string;
  status: string;
}

interface AdminRecurringDetailRow extends RecurringBookingRow {
  customer_name: string | null;
  provider_name: string | null;
  original_booking_status: string | null;
  original_booking_total: number | null;
  failed_instances: number;
  skipped_instances: number;
  generated_instances: number;
  open_support_tickets: number;
}

interface AdminRecurringInstanceRow extends RecurringInstanceRow {
  booking_total_amount: number | null;
  booking_scheduled_at: string | null;
  booking_provider_id: string | null;
  booking_provider_name: string | null;
  open_support_tickets: number;
}

export interface AdminRecurringDetail extends Record<string, unknown> {
  customerName: string | null;
  originalBookingStatus: string | null;
  originalBookingTotal: number | null;
  operationalPaymentMode: 'manual_per_booking';
  providerAssignmentState: 'legacy_provider_link' | 'unassigned';
  legacyAutoChargePreference: boolean;
  failedInstances: number;
  skippedInstances: number;
  generatedInstances: number;
  openSupportTickets: number;
}

export interface AdminRecurringInstance extends Record<string, unknown> {
  bookingTotalAmount: number | null;
  bookingScheduledAt: string | null;
  bookingProviderId: string | null;
  bookingProviderName: string | null;
  openSupportTickets: number;
}

interface CountRow { count: string }

// Phase 14 Dispatch 05 — Bug 208 + Bug 1132.
// `servicePrice` removed; server resolves canonical price from
// service_subcategories.base_price at creation time.
// `subcategoryId` is now REQUIRED (no fallback path that could trust
// a client-supplied price).
interface CreateRecurringParams {
  customerId: string;
  providerId?: string;
  categoryId: string;
  subcategoryId: string;
  originalBookingId: string;
  frequency: 'weekly' | 'bi_weekly' | 'monthly';
  preferredDay: number;
  preferredTime: string;
  address: string;
  barangay: string;
  city: string;
  province: string;
  latitude?: number;
  longitude?: number;
}

export interface RecurringPricePreview {
  categoryId: string;
  subcategoryId: string;
  servicePrice: number;
  serviceFee: number;
  totalAmount: number;
}

export async function getRecurringPricePreview(
  subcategoryId: string,
): Promise<RecurringPricePreview> {
  const subcatResult = await db.query<{
    category_id: string;
    base_price: string | null;
    pricing_type: string;
  }>(
    `SELECT category_id, base_price, pricing_type
       FROM service_subcategories
      WHERE id = $1 AND is_active = TRUE`,
    [subcategoryId],
  );
  if (subcatResult.rows.length === 0) {
    throw createAppError('Subcategory not found or inactive.', 404);
  }
  const subcat = subcatResult.rows[0]!;
  if (subcat.pricing_type === 'hourly') {
    throw createAppError('subcategory_pricing_type_unsupported', 400);
  }
  if (subcat.pricing_type === 'quote') {
    throw createAppError('Quote-based subcategory cannot be set as a recurring booking.', 400);
  }
  if (subcat.pricing_type !== 'fixed') {
    throw createAppError('Only fixed-price services can be set as recurring bookings.', 400);
  }
  if (subcat.base_price == null) {
    throw createAppError('Service price could not be determined for this subcategory.', 400);
  }
  const servicePrice = Number(subcat.base_price);
  if (!Number.isFinite(servicePrice) || servicePrice <= 0) {
    throw createAppError('Service price could not be determined for this subcategory.', 400);
  }
  const serviceFee = await calculateServiceFee(servicePrice);
  return {
    categoryId: subcat.category_id,
    subcategoryId,
    servicePrice,
    serviceFee,
    totalAmount: servicePrice + serviceFee,
  };
}

// BUG-PHASE118-01 fix — pre-fix this function did weekday/month math
// using server-local TZ via setHours(0,0,0,0) + getDay/getDate.
// With the API container running on UTC (no `TZ=Asia/Manila` set in
// docker-compose), the function's "today" was UTC's today — which
// can be one calendar day BEHIND Manila between 16:00 and 23:59 UTC
// (= 00:00–07:59 Manila of the next day).
//
// Concrete bug: customer creates a "weekly Thursday" recurring at
// 01:00 Manila Thursday (= 17:00 UTC Wednesday). Server thinks
// today = Wed, computes next-Thursday = +1 day = today UTC = today
// Manila — schedules the FIRST instance for the SAME Manila day
// the customer is already in. The customer expected "next Thursday"
// to mean a week from today (since today is already Thursday). Same
// off-by-one applies to bi-weekly and monthly.
//
// Same Manila-tz pattern as Phase 113/117. Fix: anchor the math to
// the Manila calendar day. Build `result` as UTC midnight of the
// Manila day (so result.toISOString().split('T')[0] in callers
// returns the Manila YYYY-MM-DD they expect), and use UTC methods
// throughout — Manila is +08:00 with no DST, so UTC arithmetic on
// a Manila-anchored UTC-midnight Date is equivalent to Manila
// arithmetic.
function calculateNextDate(frequency: string, preferredDay: number, fromDate?: Date): Date {
  const ref = fromDate ?? new Date();
  // Get the Manila calendar day for `ref` as YYYY-MM-DD.
  const manilaDateStr = ref.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  // UTC-midnight of the Manila day. result.toISOString() yields
  // `${manilaDateStr}T00:00:00.000Z`; callers' .split('T')[0] gives
  // them the Manila YYYY-MM-DD without further conversion.
  const result = new Date(`${manilaDateStr}T00:00:00Z`);
  const manilaDay = result.getUTCDay(); // weekday of the Manila day

  if (frequency === 'weekly') {
    const offset = ((7 + preferredDay - manilaDay) % 7) || 7;
    result.setUTCDate(result.getUTCDate() + offset);
  } else if (frequency === 'bi_weekly') {
    const offset = ((7 + preferredDay - manilaDay) % 7) || 7;
    result.setUTCDate(result.getUTCDate() + offset + 7);
  } else if (frequency === 'monthly') {
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + 1);
    while (result.getUTCDay() !== preferredDay) {
      result.setUTCDate(result.getUTCDate() + 1);
    }
  }

  return result;
}

export async function createRecurringBooking(
  params: CreateRecurringParams,
): Promise<RecurringBookingRow> {
  // Phase 14 Dispatch 05 — Bug 208.
  // Resolve the canonical service price server-side from
  // service_subcategories.base_price. Reject hourly subcats per
  // LAUNCH-LIMITATIONS §24, and quote-based subcats (the recurring
  // path is fixed-price-only in v1.0).
  const pricing = await getRecurringPricePreview(params.subcategoryId);
  if (pricing.categoryId !== params.categoryId) {
    throw createAppError('Subcategory does not belong to the selected category.', 400);
  }

  // BUG-SEC-021 — recurring setup is an extension of one eligible booking,
  // not an unaudited way to manufacture a schedule from arbitrary IDs. The
  // customer UI has always opened this flow from a completed booking, but the
  // API previously trusted originalBookingId (or allowed it to be omitted),
  // including when it belonged to another customer or service. Verify the
  // source record server-side without changing the E41/D29 provider-assignment
  // behavior that remains under an explicit architecture hold.
  const sourceResult = await db.query<RecurringSourceBookingRow>(
    `SELECT customer_id, category_id, subcategory_id, booking_type, status
       FROM bookings
      WHERE id = $1 AND customer_id = $2`,
    [params.originalBookingId, params.customerId],
  );
  if (sourceResult.rows.length === 0) {
    throw createAppError('Eligible source booking not found.', 404);
  }
  const source = sourceResult.rows[0]!;
  if (!['confirmed', 'resolved', 'payout_ready', 'paid_out'].includes(source.status)) {
    throw createAppError('Recurring setup requires a customer-confirmed completed booking.', 409);
  }
  if (source.booking_type !== 'fixed_price') {
    throw createAppError('Only completed fixed-price bookings can become recurring.', 409);
  }
  if (source.category_id !== params.categoryId || source.subcategory_id !== params.subcategoryId) {
    throw createAppError('Recurring service must match the completed source booking.', 409);
  }
  const { servicePrice, serviceFee, totalAmount } = pricing;
  const nextDate = calculateNextDate(params.frequency, params.preferredDay);

  const result = await db.query<RecurringBookingRow>(
    `INSERT INTO recurring_bookings (
      customer_id, provider_id, category_id, subcategory_id, original_booking_id,
      frequency, preferred_day, preferred_time,
      address, barangay, city, province, latitude, longitude,
      service_price, service_fee, total_amount,
      next_booking_date, auto_charge
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    RETURNING *`,
    [
      params.customerId, params.providerId ?? null, params.categoryId,
      params.subcategoryId, params.originalBookingId ?? null,
      params.frequency, params.preferredDay, params.preferredTime,
      params.address, params.barangay, params.city, params.province,
      params.latitude ?? null, params.longitude ?? null,
      servicePrice, serviceFee, totalAmount,
      nextDate.toISOString().split('T')[0],
      false,
    ],
  );

  logger.info('Recurring booking created', {
    recurringId: result.rows[0]!.id,
    customerId: params.customerId,
    frequency: params.frequency,
  });

  return result.rows[0]!;
}

// BUG-PHASE85-01 — shared SELECT list that JOINs the names + completed
// + skipped counts the customer screens render. Used by both the
// detail-by-id query and the list query so the two endpoints can't
// drift back to the bare `SELECT *` shape.
const RECURRING_SELECT_WITH_JOINS = `
  SELECT rb.*,
         sc.name AS category_name,
         ssc.name AS subcategory_name,
         CASE
           WHEN p.id IS NOT NULL THEN TRIM(BOTH FROM CONCAT(u.first_name, ' ', u.last_name))
           ELSE NULL
         END AS provider_name,
         (
           SELECT COUNT(*)::int
             FROM recurring_instances ri
             JOIN bookings b ON b.id = ri.booking_id
            WHERE ri.recurring_booking_id = rb.id
              AND b.status = 'completed'
         ) AS total_completed,
         (
           SELECT COUNT(*)::int
             FROM recurring_instances ri
            WHERE ri.recurring_booking_id = rb.id
              AND ri.status = 'skipped'
         ) AS total_skipped
    FROM recurring_bookings rb
    LEFT JOIN service_categories sc ON sc.id = rb.category_id
    LEFT JOIN service_subcategories ssc ON ssc.id = rb.subcategory_id
    LEFT JOIN providers p ON p.id = rb.provider_id
    LEFT JOIN users u ON u.id = p.user_id
`;

export async function getRecurringBooking(
  recurringId: string,
  userId: string,
): Promise<RecurringBookingRow> {
  const result = await db.query<RecurringBookingRow>(
    `${RECURRING_SELECT_WITH_JOINS} WHERE rb.id = $1 AND rb.customer_id = $2`,
    [recurringId, userId],
  );

  if (result.rows.length === 0) {
    throw createAppError('Recurring booking not found.', 404);
  }

  return result.rows[0]!;
}

export async function getCustomerRecurringBookings(
  customerId: string,
  page = 1,
  pageSize = 20,
): Promise<{ items: RecurringBookingRow[]; total: number }> {
  const offset = (page - 1) * pageSize;

  const [dataResult, countResult] = await Promise.all([
    db.query<RecurringBookingRow>(
      `${RECURRING_SELECT_WITH_JOINS}
       WHERE rb.customer_id = $1
       ORDER BY rb.status ASC, rb.next_booking_date ASC
       LIMIT $2 OFFSET $3`,
      [customerId, pageSize, offset],
    ),
    db.query<CountRow>(
      `SELECT COUNT(*)::text as count FROM recurring_bookings WHERE customer_id = $1`,
      [customerId],
    ),
  ]);

  return {
    items: dataResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

export async function pauseRecurringBooking(
  recurringId: string,
  userId: string,
): Promise<RecurringBookingRow> {
  const result = await db.query<RecurringBookingRow>(
    `UPDATE recurring_bookings
     SET status = 'paused', updated_at = NOW()
     WHERE id = $1 AND customer_id = $2 AND status = 'active'
     RETURNING *`,
    [recurringId, userId],
  );

  if (result.rows.length === 0) {
    throw createAppError('Recurring booking not found or not active.', 404);
  }

  logger.info('Recurring booking paused', { recurringId });
  return result.rows[0]!;
}

export async function resumeRecurringBooking(
  recurringId: string,
  userId: string,
): Promise<RecurringBookingRow> {
  const existing = await db.query<RecurringBookingRow>(
    `SELECT * FROM recurring_bookings WHERE id = $1 AND customer_id = $2 AND status = 'paused'`,
    [recurringId, userId],
  );

  if (existing.rows.length === 0) {
    throw createAppError('Recurring booking not found or not paused.', 404);
  }

  const rb = existing.rows[0]!;
  const nextDate = calculateNextDate(rb.frequency, rb.preferred_day);

  const result = await db.query<RecurringBookingRow>(
    `UPDATE recurring_bookings
     SET status = 'active', next_booking_date = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [nextDate.toISOString().split('T')[0], recurringId],
  );

  logger.info('Recurring booking resumed', { recurringId });
  return result.rows[0]!;
}

export async function cancelRecurringBooking(
  recurringId: string,
  userId: string,
  reason?: string,
): Promise<RecurringBookingRow> {
  // BUG-PHASE190-01 fix — pre-fix the optional `reason` was passed
  // straight to recurring_bookings.cancellation_reason which is TEXT
  // (migration 020) — unbounded by Postgres. The route had no Zod
  // validator. Same defense-in-depth pattern as Phase 152-168 + 179-
  // 181 + 188-189. Mirror the booking cancellationReason cap (500
  // chars from booking.validators.ts) so customer cancellation flows
  // are consistent.
  if (reason !== undefined && reason.length > 500) {
    throw createAppError('cancellation reason cannot exceed 500 characters.', 400);
  }

  const result = await db.query<RecurringBookingRow>(
    `UPDATE recurring_bookings
     SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = $3, updated_at = NOW()
     WHERE id = $1 AND customer_id = $2 AND status IN ('active', 'paused')
     RETURNING *`,
    [recurringId, userId, reason ?? null],
  );

  if (result.rows.length === 0) {
    throw createAppError('Recurring booking not found or already cancelled.', 404);
  }

  logger.info('Recurring booking cancelled', { recurringId, reason });
  return result.rows[0]!;
}

export async function skipNextInstance(
  recurringId: string,
  userId: string,
  skipDate: string,
): Promise<RecurringBookingRow> {
  const rb = await getRecurringBooking(recurringId, userId);

  if (rb.status !== 'active') {
    throw createAppError('Can only skip active recurring bookings.', 409);
  }

  // A customer may skip only the next scheduled occurrence shown by the
  // recurring series. Pre-fix, an authenticated caller could submit any date,
  // append it to skip_dates, and advance the recurring clock from that
  // caller-selected date.
  const nextBookingDate = String(rb.next_booking_date).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(skipDate) || skipDate !== nextBookingDate) {
    throw createAppError('Only the next scheduled recurring date can be skipped.', 409);
  }

  const nextDate = calculateNextDate(
    rb.frequency,
    rb.preferred_day,
    new Date(`${skipDate}T00:00:00Z`),
  ).toISOString().split('T')[0];

  // Keep the series clock and its history row atomic. Pre-fix, the UPDATE
  // committed before the INSERT; an insert failure left the schedule advanced
  // with no audit/history record explaining why.
  const result = await db.transaction(async (client) => {
    const updated = await client.query<RecurringBookingRow>(
      `UPDATE recurring_bookings
       SET skip_dates = CASE
             WHEN $1::date = ANY(skip_dates) THEN skip_dates
             ELSE array_append(skip_dates, $1::date)
           END,
           next_booking_date = $2,
           updated_at = NOW()
       WHERE id = $3
         AND customer_id = $4
         AND status = 'active'
         AND next_booking_date = $1::date
       RETURNING *`,
      [skipDate, nextDate, recurringId, userId],
    );
    if (updated.rows.length === 0) {
      throw createAppError('Recurring schedule changed. Refresh and try again.', 409);
    }

    await client.query(
      `INSERT INTO recurring_instances (recurring_booking_id, scheduled_date, status)
       VALUES ($1, $2, 'skipped')
       ON CONFLICT (recurring_booking_id, scheduled_date) DO NOTHING`,
      [recurringId, skipDate],
    );
    return updated;
  });

  logger.info('Recurring instance skipped', { recurringId, skipDate });
  return result.rows[0]!;
}

export async function updateRecurringPrice(
  recurringId: string,
  newServicePrice: number,
): Promise<void> {
  // MED-N113 fix — pre-fix: caller-supplied newServicePrice was
  // accepted unchecked. This bypassed Bug 1132 server-canonical
  // pricing (the customer-app or admin UI could pass any number,
  // including a negative or out-of-range value, and the recurring
  // row would happily store it). Post-fix: validate the price
  // against the linked subcategory's base_price ± an admin-tunable
  // tolerance window. If the recurring row has no subcategory_id
  // (legacy data), accept any non-negative price within a sane
  // hard cap (₱500,000 = 50,000,000 centavos).
  if (!Number.isInteger(newServicePrice) || newServicePrice < 0) {
    throw createAppError('newServicePrice must be a non-negative integer (centavos).', 400);
  }
  const HARD_CAP_CENTAVOS = 50_000_000;
  if (newServicePrice > HARD_CAP_CENTAVOS) {
    throw createAppError('newServicePrice exceeds maximum allowed.', 400);
  }

  const rb = await db.query<RecurringBookingRow & { subcategory_id: string | null }>(
    `SELECT customer_id, next_booking_date, subcategory_id FROM recurring_bookings WHERE id = $1`,
    [recurringId],
  );
  if (rb.rows.length === 0) return;

  // If linked to a subcategory, anchor the price to its canonical
  // base_price ± 50% (admin can adjust within that band; bigger
  // changes need a new recurring row to make the customer aware).
  const subId = rb.rows[0]!.subcategory_id;
  if (subId) {
    const subRow = await db.query<{ base_price: number | null }>(
      `SELECT base_price FROM service_subcategories WHERE id = $1`,
      [subId],
    );
    const basePrice = subRow.rows[0]?.base_price ?? null;
    if (basePrice !== null && basePrice > 0) {
      const min = Math.round(Number(basePrice) * 0.5);
      const max = Math.round(Number(basePrice) * 1.5);
      if (newServicePrice < min || newServicePrice > max) {
        throw createAppError(
          `newServicePrice ${newServicePrice} is outside the allowed range [${min}, ${max}] for this subcategory's base_price ${basePrice}.`,
          400,
        );
      }
    }
  }

  const serviceFee = await calculateServiceFee(newServicePrice);
  const totalAmount = newServicePrice + serviceFee;

  await db.query(
    `UPDATE recurring_bookings
     SET service_price = $1, service_fee = $2, total_amount = $3, updated_at = NOW()
     WHERE id = $4`,
    [newServicePrice, serviceFee, totalAmount, recurringId],
  );

  await notificationService.createPushNotification({
    userId: rb.rows[0]!.customer_id,
    type: 'recurring_update',
    title: 'Recurring Service Price Updated',
    body: `Your recurring service price has been updated to ${formatPHP(totalAmount)}. This applies starting ${rb.rows[0]!.next_booking_date}.`,
    data: { recurringBookingId: recurringId, newTotal: totalAmount },
  });

  logger.info('Recurring booking price updated', { recurringId, newServicePrice });
}

export async function getRecurringInstances(
  recurringId: string,
  page = 1,
  pageSize = 20,
): Promise<{ items: RecurringInstanceRow[]; total: number }> {
  const offset = (page - 1) * pageSize;

  const [dataResult, countResult] = await Promise.all([
    db.query<RecurringInstanceRow>(
      `SELECT ri.*, b.status AS booking_status
       FROM recurring_instances ri
       LEFT JOIN bookings b ON b.id = ri.booking_id
       WHERE ri.recurring_booking_id = $1
       ORDER BY scheduled_date DESC
       LIMIT $2 OFFSET $3`,
      [recurringId, pageSize, offset],
    ),
    db.query<CountRow>(
      `SELECT COUNT(*)::text as count FROM recurring_instances WHERE recurring_booking_id = $1`,
      [recurringId],
    ),
  ]);

  return {
    items: dataResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

export async function getAdminRecurringBooking(
  recurringId: string,
): Promise<AdminRecurringDetail> {
  const result = await db.query<AdminRecurringDetailRow>(
    `SELECT rb.*,
            NULLIF(TRIM(CONCAT(cu.first_name, ' ', cu.last_name)), '') AS customer_name,
            COALESCE(
              NULLIF(TRIM(p.business_name), ''),
              NULLIF(TRIM(CONCAT(pu.first_name, ' ', pu.last_name)), '')
            ) AS provider_name,
            sc.name AS category_name,
            ssc.name AS subcategory_name,
            ob.status AS original_booking_status,
            ob.total_amount AS original_booking_total,
            (SELECT COUNT(*)::int FROM recurring_instances ri
              WHERE ri.recurring_booking_id = rb.id AND ri.status = 'failed') AS failed_instances,
            (SELECT COUNT(*)::int FROM recurring_instances ri
              WHERE ri.recurring_booking_id = rb.id AND ri.status = 'skipped') AS skipped_instances,
            (SELECT COUNT(*)::int FROM recurring_instances ri
              WHERE ri.recurring_booking_id = rb.id AND ri.booking_id IS NOT NULL) AS generated_instances,
            (SELECT COUNT(*)::int
               FROM recurring_instances ri
               JOIN support_tickets st ON st.booking_id = ri.booking_id
              WHERE ri.recurring_booking_id = rb.id
                AND st.status NOT IN ('resolved', 'closed')) AS open_support_tickets
       FROM recurring_bookings rb
       LEFT JOIN users cu ON cu.id = rb.customer_id
       LEFT JOIN providers p ON p.id = rb.provider_id
       LEFT JOIN users pu ON pu.id = p.user_id
       LEFT JOIN service_categories sc ON sc.id = rb.category_id
       LEFT JOIN service_subcategories ssc ON ssc.id = rb.subcategory_id
       LEFT JOIN bookings ob ON ob.id = rb.original_booking_id
      WHERE rb.id = $1`,
    [recurringId],
  );
  if (result.rows.length === 0) {
    throw createAppError('Recurring booking not found.', 404);
  }
  const row = result.rows[0]!;
  return {
    ...formatRecurringBooking(row),
    customerName: row.customer_name,
    providerName: row.provider_name,
    originalBookingStatus: row.original_booking_status,
    originalBookingTotal: row.original_booking_total == null ? null : Number(row.original_booking_total),
    operationalPaymentMode: 'manual_per_booking',
    providerAssignmentState: row.provider_id ? 'legacy_provider_link' : 'unassigned',
    legacyAutoChargePreference: row.auto_charge,
    failedInstances: Number(row.failed_instances ?? 0),
    skippedInstances: Number(row.skipped_instances ?? 0),
    generatedInstances: Number(row.generated_instances ?? 0),
    openSupportTickets: Number(row.open_support_tickets ?? 0),
  };
}

export async function getAdminRecurringInstances(
  recurringId: string,
  page = 1,
  pageSize = 20,
): Promise<{ items: AdminRecurringInstance[]; total: number }> {
  // Resolve the parent first so an empty history cannot masquerade as a valid
  // series. The Admin support panel needs a reliable not-found distinction.
  const parent = await db.query<{ id: string }>(
    `SELECT id FROM recurring_bookings WHERE id = $1`,
    [recurringId],
  );
  if (parent.rows.length === 0) {
    throw createAppError('Recurring booking not found.', 404);
  }
  const offset = (page - 1) * pageSize;
  const [dataResult, countResult] = await Promise.all([
    db.query<AdminRecurringInstanceRow>(
      `SELECT ri.*, b.status AS booking_status,
              b.total_amount AS booking_total_amount,
              b.scheduled_at AS booking_scheduled_at,
              b.provider_id AS booking_provider_id,
              COALESCE(
                NULLIF(TRIM(p.business_name), ''),
                NULLIF(TRIM(CONCAT(pu.first_name, ' ', pu.last_name)), '')
              ) AS booking_provider_name,
              (SELECT COUNT(*)::int FROM support_tickets st
                WHERE st.booking_id = b.id
                  AND st.status NOT IN ('resolved', 'closed')) AS open_support_tickets
         FROM recurring_instances ri
         LEFT JOIN bookings b ON b.id = ri.booking_id
         LEFT JOIN providers p ON p.id = b.provider_id
         LEFT JOIN users pu ON pu.id = p.user_id
        WHERE ri.recurring_booking_id = $1
        ORDER BY ri.scheduled_date DESC
        LIMIT $2 OFFSET $3`,
      [recurringId, pageSize, offset],
    ),
    db.query<CountRow>(
      `SELECT COUNT(*)::text AS count
         FROM recurring_instances
        WHERE recurring_booking_id = $1`,
      [recurringId],
    ),
  ]);
  return {
    items: dataResult.rows.map((row) => ({
      ...formatRecurringInstance(row),
      bookingTotalAmount: row.booking_total_amount == null ? null : Number(row.booking_total_amount),
      bookingScheduledAt: row.booking_scheduled_at,
      bookingProviderId: row.booking_provider_id,
      bookingProviderName: row.booking_provider_name,
      openSupportTickets: Number(row.open_support_tickets ?? 0),
    })),
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

/**
 * Process all active recurring bookings due today.
 * Called by background job scheduler daily.
 */
export async function processRecurringBookings(): Promise<number> {
  // BUG-PHASE113-01 fix — pre-fix `today` was the UTC date. The
  // recurring cron compares it to `next_booking_date`, which is
  // populated from a Manila YYYY-MM-DD (instances are scheduled at
  // `${next_booking_date}T${preferred_time}+08:00`, see scheduledAt
  // below). For an early-morning Manila booking (e.g. 06:00 on the
  // 5th = 22:00 UTC on the 4th), the cron had to wait until UTC
  // ticked over to the 5th — by which point Manila was already 8 AM
  // and the customer was 2 hours past their preferred time without
  // a confirmation. Same Manila-tz pattern as Phase 105 (calendar)
  // and Phase 109 (make-recurring). Anchor the comparison to the
  // Manila day so the cron fires at the correct local boundary.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

  // MED-N115 fix — pre-fix the cron created bookings for ALL active
  // recurring rows whose next_booking_date <= today, with NO check
  // that the customer is still active. anonymizeUser sets
  // users.is_active = FALSE but does NOT cancel recurring_bookings,
  // so anonymized users kept getting auto-bookings created against
  // their dead account (which then errored downstream when notifying
  // a non-existent customer, or worse, charged the wallet of an
  // archived account).
  //
  // Post-fix: JOIN users on customer_id and require is_active = TRUE.
  // Defense-in-depth — eventually we should also have anonymizeUser
  // cascade-cancel recurring rows; this guards against the race in
  // the meantime AND against any other future "user disabled but
  // recurring not cleaned up" path.
  const dueBookings = await db.query<RecurringBookingRow>(
    `SELECT rb.*
       FROM recurring_bookings rb
       JOIN users u ON u.id = rb.customer_id
      WHERE rb.status = 'active'
        AND rb.next_booking_date <= $1
        AND NOT ($1 = ANY(rb.skip_dates))
        AND u.is_active = TRUE`,
    [today],
  );

  let created = 0;
  for (const rb of dueBookings.rows) {
    // Idempotency gate — claim this (series, scheduled_date) before doing any
    // work. ON CONFLICT DO NOTHING means a prior/concurrent run already handled
    // this cycle, so we skip rather than create a second booking + charge.
    // (uq_recurring_instances_series_date enforces one instance per cycle.)
    let instanceId: string;
    try {
      const claim = await db.query<{ id: string }>(
        `INSERT INTO recurring_instances (recurring_booking_id, scheduled_date, status)
         VALUES ($1, $2, 'pending')
         ON CONFLICT (recurring_booking_id, scheduled_date) DO NOTHING
         RETURNING id`,
        [rb.id, rb.next_booking_date],
      );
      if (claim.rows.length === 0) {
        logger.info('Recurring cycle already claimed — skipping (idempotent)', {
          recurringId: rb.id, scheduledDate: rb.next_booking_date,
        });
        continue;
      }
      instanceId = claim.rows[0]!.id;
    } catch (claimErr) {
      logger.error('Failed to claim recurring instance — skipping this cycle', {
        recurringId: rb.id,
        error: claimErr instanceof Error ? claimErr.message : String(claimErr),
      });
      continue;
    }

    try {
      const scheduledAt = new Date(`${rb.next_booking_date}T${rb.preferred_time}+08:00`);

      const categoryResult = await db.query<{ name: string }>(
        `SELECT name FROM service_categories WHERE id = $1`,
        [rb.category_id],
      );
      const categoryName = categoryResult.rows[0]?.name ?? 'Scheduled service';
      const description = `Auto-scheduled recurring ${categoryName.toLowerCase()}`;

      const bookingResult = await db.query<{ id: string }>(
        `INSERT INTO bookings (
          customer_id, provider_id, category_id, subcategory_id, booking_type,
          status, description, address, barangay, city, province,
          latitude, longitude, scheduled_at, service_price, service_fee, total_amount
        ) VALUES ($1, $2, $3, $4, 'fixed_price', 'requested', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id`,
        [
          rb.customer_id, rb.provider_id, rb.category_id, rb.subcategory_id,
          description,
          rb.address, rb.barangay, rb.city, rb.province,
          rb.latitude, rb.longitude, scheduledAt.toISOString(),
          rb.service_price, rb.service_fee, rb.total_amount,
        ],
      );

      const bookingId = bookingResult.rows[0]!.id;

      // Attach the booking to the instance we claimed above + mark it created.
      await db.query(
        `UPDATE recurring_instances SET booking_id = $1, status = 'created' WHERE id = $2`,
        [bookingId, instanceId],
      );

      const nextDate = calculateNextDate(rb.frequency, rb.preferred_day, new Date(rb.next_booking_date));

      await db.query(
        `UPDATE recurring_bookings
         SET next_booking_date = $1, last_booking_date = $2,
             total_instances = total_instances + 1, updated_at = NOW()
         WHERE id = $3`,
        [nextDate.toISOString().split('T')[0], rb.next_booking_date, rb.id],
      );

      // E20 containment: recurring instances are manual-payment only. A
      // legacy preference is retained for support/audit and can be cleared,
      // but the scheduler never enters the known-unsafe money path.
      if (rb.auto_charge) {
        logger.warn('Recurring auto-charge preference ignored while feature is disabled', {
          recurringId: rb.id,
          bookingId,
        });
      }

      await notificationService.createPushNotification({
        userId: rb.customer_id,
        type: 'recurring_update',
        title: 'Recurring Booking Created',
        body: `Your recurring service has been scheduled for ${scheduledAt.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })}. Pay manually from the booking before service.`,
        data: { bookingId, recurringBookingId: rb.id },
      });

      created++;
      logger.info('Recurring booking instance created', { recurringId: rb.id, bookingId });
    } catch (err) {
      // The instance was already claimed above — mark it failed rather than
      // inserting a second row (which the unique key would now reject anyway).
      await db.query(
        `UPDATE recurring_instances SET status = 'failed', failure_reason = $1 WHERE id = $2`,
        [err instanceof Error ? err.message : 'Unknown error', instanceId],
      );

      try {
        const nextDate = calculateNextDate(rb.frequency, rb.preferred_day, new Date(rb.next_booking_date));
        await db.query(
          `UPDATE recurring_bookings SET next_booking_date = $1, updated_at = NOW() WHERE id = $2`,
          [nextDate.toISOString().split('T')[0], rb.id],
        );
        logger.error('Failed to create recurring instance — advanced to next date', {
          recurringId: rb.id,
          nextDate: nextDate.toISOString().split('T')[0],
          error: err instanceof Error ? err.message : 'Unknown',
        });
      } catch (advanceErr) {
        logger.error('Failed to advance recurring next_booking_date after instance failure', {
          recurringId: rb.id,
          error: advanceErr instanceof Error ? advanceErr.message : 'Unknown',
        });
      }
    }
  }

  return created;
}

export function formatRecurringBooking(rb: RecurringBookingRow): Record<string, unknown> {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return {
    id: rb.id,
    customerId: rb.customer_id,
    providerId: rb.provider_id,
    categoryId: rb.category_id,
    subcategoryId: rb.subcategory_id,
    originalBookingId: rb.original_booking_id,
    frequency: rb.frequency,
    preferredDay: rb.preferred_day,
    preferredDayName: dayNames[rb.preferred_day],
    preferredTime: rb.preferred_time,
    address: rb.address,
    barangay: rb.barangay,
    city: rb.city,
    province: rb.province,
    latitude: rb.latitude ? Number(rb.latitude) : null,
    longitude: rb.longitude ? Number(rb.longitude) : null,
    servicePrice: rb.service_price,
    serviceFee: rb.service_fee,
    totalAmount: rb.total_amount,
    status: rb.status,
    nextBookingDate: rb.next_booking_date,
    // BUG-PHASE85-01 — alias kept so the customer recurring list/
    // detail screens (which read `nextScheduledDate`) work without a
    // mobile-side rewrite. `nextBookingDate` is preserved for any
    // existing callers/tests already on the canonical name.
    nextScheduledDate: rb.next_booking_date,
    lastBookingDate: rb.last_booking_date,
    skipDates: rb.skip_dates,
    // E20 containment: do not present a legacy stored preference as active.
    autoCharge: false,
    // E02 / D22 — auto-charge surface.
    // Reusable payment/source identifiers never belong in an API response.
    paymentMethodId: null,
    paymentMethodLabel: rb.payment_method_label ?? null,
    autoChargeStatus: rb.auto_charge ? 'disabled' : (rb.auto_charge_status ?? null),
    autoChargeConsecutiveFailures: rb.auto_charge_consecutive_failures ?? 0,
    autoChargeSuspendedAt: rb.auto_charge_suspended_at ?? null,
    autoChargeLastAttemptAt: rb.auto_charge_last_attempt_at ?? null,
    allowSubstitute: rb.allow_substitute,
    totalInstances: rb.total_instances,
    cancelledAt: rb.cancelled_at,
    cancellationReason: rb.cancellation_reason,
    createdAt: rb.created_at,
    updatedAt: rb.updated_at,
    // BUG-PHASE85-01 — joined display fields for the customer
    // recurring screens. `categoryName`/`subcategoryName` populate
    // the title row; `providerName` shows whoever was matched (null
    // when none yet); `totalCompleted`/`totalSkipped` drive the
    // counters on the detail screen. `cancelReason` is a frontend
    // alias for `cancellationReason` so the legacy field name still
    // lights up the cancellation row.
    categoryName: rb.category_name ?? null,
    subcategoryName: rb.subcategory_name ?? null,
    providerName: rb.provider_name && rb.provider_name.length > 0 ? rb.provider_name : null,
    totalCompleted: typeof rb.total_completed === 'number' ? rb.total_completed : 0,
    totalSkipped: typeof rb.total_skipped === 'number' ? rb.total_skipped : 0,
    cancelReason: rb.cancellation_reason,
  };
}

export function formatRecurringInstance(ri: RecurringInstanceRow): Record<string, unknown> {
  const completedBookingStatuses = new Set([
    'completed_by_provider', 'confirmed', 'resolved', 'payout_ready', 'paid_out',
  ]);
  const cancelledBookingStatuses = new Set([
    'cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin',
  ]);
  const displayStatus = ri.booking_status && completedBookingStatuses.has(ri.booking_status)
    ? 'completed'
    : ri.booking_status && cancelledBookingStatuses.has(ri.booking_status)
      ? 'cancelled'
      : ri.status;
  return {
    id: ri.id,
    recurringBookingId: ri.recurring_booking_id,
    bookingId: ri.booking_id,
    scheduledDate: ri.scheduled_date,
    status: displayStatus,
    bookingStatus: ri.booking_status ?? null,
    substituteProviderId: ri.substitute_provider_id,
    failureReason: ri.failure_reason,
    createdAt: ri.created_at,
  };
}
