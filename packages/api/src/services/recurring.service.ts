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
  allow_substitute: boolean;
  total_instances: number;
  cancelled_at: Date | null;
  cancellation_reason: string | null;
  created_at: Date;
  updated_at: Date;
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
}

interface CountRow { count: string }

interface CreateRecurringParams {
  customerId: string;
  providerId?: string;
  categoryId: string;
  subcategoryId?: string;
  originalBookingId?: string;
  frequency: 'weekly' | 'bi_weekly' | 'monthly';
  preferredDay: number;
  preferredTime: string;
  address: string;
  barangay: string;
  city: string;
  province: string;
  latitude?: number;
  longitude?: number;
  servicePrice: number;
}

function calculateNextDate(frequency: string, preferredDay: number, fromDate?: Date): Date {
  const now = fromDate ?? new Date();
  const result = new Date(now);
  result.setHours(0, 0, 0, 0);

  if (frequency === 'weekly') {
    result.setDate(result.getDate() + ((7 + preferredDay - result.getDay()) % 7 || 7));
  } else if (frequency === 'bi_weekly') {
    result.setDate(result.getDate() + ((7 + preferredDay - result.getDay()) % 7 || 7) + 7);
  } else if (frequency === 'monthly') {
    result.setDate(1);
    result.setMonth(result.getMonth() + 1);
    while (result.getDay() !== preferredDay) {
      result.setDate(result.getDate() + 1);
    }
  }

  return result;
}

export async function createRecurringBooking(
  params: CreateRecurringParams,
): Promise<RecurringBookingRow> {
  const serviceFee = calculateServiceFee(params.servicePrice);
  const totalAmount = params.servicePrice + serviceFee;
  const nextDate = calculateNextDate(params.frequency, params.preferredDay);

  const result = await db.query<RecurringBookingRow>(
    `INSERT INTO recurring_bookings (
      customer_id, provider_id, category_id, subcategory_id, original_booking_id,
      frequency, preferred_day, preferred_time,
      address, barangay, city, province, latitude, longitude,
      service_price, service_fee, total_amount,
      next_booking_date
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    RETURNING *`,
    [
      params.customerId, params.providerId ?? null, params.categoryId,
      params.subcategoryId ?? null, params.originalBookingId ?? null,
      params.frequency, params.preferredDay, params.preferredTime,
      params.address, params.barangay, params.city, params.province,
      params.latitude ?? null, params.longitude ?? null,
      params.servicePrice, serviceFee, totalAmount,
      nextDate.toISOString().split('T')[0],
    ],
  );

  logger.info('Recurring booking created', {
    recurringId: result.rows[0]!.id,
    customerId: params.customerId,
    frequency: params.frequency,
  });

  return result.rows[0]!;
}

export async function getRecurringBooking(
  recurringId: string,
  userId: string,
): Promise<RecurringBookingRow> {
  const result = await db.query<RecurringBookingRow>(
    `SELECT * FROM recurring_bookings WHERE id = $1 AND customer_id = $2`,
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
      `SELECT * FROM recurring_bookings
       WHERE customer_id = $1
       ORDER BY status ASC, next_booking_date ASC
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

  const result = await db.query<RecurringBookingRow>(
    `UPDATE recurring_bookings
     SET skip_dates = array_append(skip_dates, $1::date),
         next_booking_date = $2,
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [
      skipDate,
      calculateNextDate(rb.frequency, rb.preferred_day, new Date(skipDate)).toISOString().split('T')[0],
      recurringId,
    ],
  );

  await db.query(
    `INSERT INTO recurring_instances (recurring_booking_id, scheduled_date, status)
     VALUES ($1, $2, 'skipped')`,
    [recurringId, skipDate],
  );

  logger.info('Recurring instance skipped', { recurringId, skipDate });
  return result.rows[0]!;
}

export async function updateRecurringPrice(
  recurringId: string,
  newServicePrice: number,
): Promise<void> {
  const serviceFee = calculateServiceFee(newServicePrice);
  const totalAmount = newServicePrice + serviceFee;

  const rb = await db.query<RecurringBookingRow>(
    `SELECT customer_id, next_booking_date FROM recurring_bookings WHERE id = $1`,
    [recurringId],
  );

  if (rb.rows.length === 0) return;

  await db.query(
    `UPDATE recurring_bookings
     SET service_price = $1, service_fee = $2, total_amount = $3, updated_at = NOW()
     WHERE id = $4`,
    [newServicePrice, serviceFee, totalAmount, recurringId],
  );

  await notificationService.createNotification({
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
      `SELECT * FROM recurring_instances
       WHERE recurring_booking_id = $1
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

/**
 * Process all active recurring bookings due today.
 * Called by background job scheduler daily.
 */
export async function processRecurringBookings(): Promise<number> {
  const today = new Date().toISOString().split('T')[0]!;

  const dueBookings = await db.query<RecurringBookingRow>(
    `SELECT * FROM recurring_bookings
     WHERE status = 'active'
       AND next_booking_date <= $1
       AND NOT ($1 = ANY(skip_dates))`,
    [today],
  );

  let created = 0;
  for (const rb of dueBookings.rows) {
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

      await db.query(
        `INSERT INTO recurring_instances (recurring_booking_id, booking_id, scheduled_date, status)
         VALUES ($1, $2, $3, 'created')`,
        [rb.id, bookingId, rb.next_booking_date],
      );

      const nextDate = calculateNextDate(rb.frequency, rb.preferred_day, new Date(rb.next_booking_date));

      await db.query(
        `UPDATE recurring_bookings
         SET next_booking_date = $1, last_booking_date = $2,
             total_instances = total_instances + 1, updated_at = NOW()
         WHERE id = $3`,
        [nextDate.toISOString().split('T')[0], rb.next_booking_date, rb.id],
      );

      await notificationService.createNotification({
        userId: rb.customer_id,
        type: 'recurring_update',
        title: 'Recurring Booking Created',
        body: `Your recurring service has been scheduled for ${scheduledAt.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })}.`,
        data: { bookingId, recurringBookingId: rb.id },
      });

      created++;
      logger.info('Recurring booking instance created', { recurringId: rb.id, bookingId });
    } catch (err) {
      await db.query(
        `INSERT INTO recurring_instances (recurring_booking_id, scheduled_date, status, failure_reason)
         VALUES ($1, $2, 'failed', $3)`,
        [rb.id, rb.next_booking_date, err instanceof Error ? err.message : 'Unknown error'],
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
    lastBookingDate: rb.last_booking_date,
    skipDates: rb.skip_dates,
    autoCharge: rb.auto_charge,
    allowSubstitute: rb.allow_substitute,
    totalInstances: rb.total_instances,
    cancelledAt: rb.cancelled_at,
    cancellationReason: rb.cancellation_reason,
    createdAt: rb.created_at,
    updatedAt: rb.updated_at,
  };
}

export function formatRecurringInstance(ri: RecurringInstanceRow): Record<string, unknown> {
  return {
    id: ri.id,
    recurringBookingId: ri.recurring_booking_id,
    bookingId: ri.booking_id,
    scheduledDate: ri.scheduled_date,
    status: ri.status,
    substituteProviderId: ri.substitute_provider_id,
    failureReason: ri.failure_reason,
    createdAt: ri.created_at,
  };
}
