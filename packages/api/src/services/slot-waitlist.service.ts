import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { platformConfig } from '../config/platform.config';

// --- Interfaces ---

interface SlotWaitlistRow {
  id: string;
  customer_id: string;
  category_id: string;
  subcategory_id: string | null;
  preferred_date: string;
  preferred_time_start: string;
  preferred_time_end: string;
  city: string;
  province: string;
  status: 'waiting' | 'notified' | 'booked' | 'expired' | 'cancelled';
  notified_at: Date | null;
  booked_booking_id: string | null;
  expires_at: Date;
  created_at: Date;
}

interface WaitlistJoinParams {
  customerId: string;
  categoryId: string;
  subcategoryId?: string;
  preferredDate: string;
  preferredTimeStart: string;
  preferredTimeEnd: string;
  city: string;
  province: string;
}

// --- Slot Waitlist ---

export async function joinSlotWaitlist(params: WaitlistJoinParams): Promise<SlotWaitlistRow> {
  const preferredDate = new Date(params.preferredDate);
  if (isNaN(preferredDate.getTime())) {
    throw createAppError('Invalid preferred date.', 400);
  }

  const now = new Date();
  if (preferredDate < now) {
    throw createAppError('Preferred date must be in the future.', 400);
  }

  const existing = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM booking_slot_waitlist
     WHERE customer_id = $1 AND category_id = $2 AND preferred_date = $3
       AND status = 'waiting'`,
    [params.customerId, params.categoryId, params.preferredDate],
  );

  if (Number(existing.rows[0]?.count ?? 0) > 0) {
    throw createAppError('You are already on the waitlist for this date and category.', 409);
  }

  const expiresAt = new Date(preferredDate);
  expiresAt.setDate(expiresAt.getDate() + 1);

  const result = await db.query<SlotWaitlistRow>(
    `INSERT INTO booking_slot_waitlist
       (customer_id, category_id, subcategory_id, preferred_date,
        preferred_time_start, preferred_time_end, city, province, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      params.customerId,
      params.categoryId,
      params.subcategoryId ?? null,
      params.preferredDate,
      params.preferredTimeStart,
      params.preferredTimeEnd,
      params.city,
      params.province,
      expiresAt.toISOString(),
    ],
  );

  logger.info('Customer joined slot waitlist', {
    customerId: params.customerId,
    categoryId: params.categoryId,
    date: params.preferredDate,
  });

  return result.rows[0]!;
}

export async function cancelSlotWaitlist(waitlistId: string, customerId: string): Promise<void> {
  const result = await db.query(
    `UPDATE booking_slot_waitlist SET status = 'cancelled'
     WHERE id = $1 AND customer_id = $2 AND status = 'waiting'`,
    [waitlistId, customerId],
  );

  if ((result.rowCount ?? 0) === 0) {
    throw createAppError('Waitlist entry not found or already processed.', 404);
  }
}

export async function getCustomerSlotWaitlist(
  customerId: string,
  status?: string,
): Promise<SlotWaitlistRow[]> {
  const conditions = ['w.customer_id = $1'];
  const params: unknown[] = [customerId];

  if (status) {
    conditions.push('w.status = $2');
    params.push(status);
  }

  const result = await db.query<SlotWaitlistRow>(
    `SELECT w.* FROM booking_slot_waitlist w
     WHERE ${conditions.join(' AND ')}
     ORDER BY w.preferred_date ASC, w.created_at ASC`,
    params,
  );

  return result.rows;
}

export async function processSlotAvailability(
  categoryId: string,
  city: string,
  availableDate: string,
): Promise<number> {
  const waitlistEntries = await db.query<SlotWaitlistRow>(
    `SELECT * FROM booking_slot_waitlist
     WHERE category_id = $1 AND city ILIKE $2 AND preferred_date = $3
       AND status = 'waiting' AND expires_at > NOW()
     ORDER BY created_at ASC
     LIMIT 10`,
    [categoryId, `%${city}%`, availableDate],
  );

  if (waitlistEntries.rows.length === 0) return 0;

  const ids = waitlistEntries.rows.map((e) => e.id);
  await db.query(
    `UPDATE booking_slot_waitlist SET status = 'notified', notified_at = NOW()
     WHERE id = ANY($1)`,
    [ids],
  );

  logger.info('Slot waitlist entries notified', {
    categoryId,
    city,
    date: availableDate,
    count: ids.length,
  });

  return ids.length;
}

export async function markWaitlistAsBooked(
  waitlistId: string,
  bookingId: string,
): Promise<void> {
  await db.query(
    `UPDATE booking_slot_waitlist SET status = 'booked', booked_booking_id = $2
     WHERE id = $1 AND status IN ('waiting', 'notified')`,
    [waitlistId, bookingId],
  );
}

export async function expireOldWaitlistEntries(): Promise<number> {
  const result = await db.query(
    `UPDATE booking_slot_waitlist SET status = 'expired'
     WHERE status = 'waiting' AND expires_at <= NOW()`,
  );

  const count = result.rowCount ?? 0;
  if (count > 0) {
    logger.info('Expired stale slot waitlist entries', { count });
  }

  return count;
}

export async function getSlotWaitlistStats(
  city?: string,
  page = 1,
  pageSize = 20,
): Promise<{
  items: Array<{
    categoryId: string;
    categoryName: string;
    preferredDate: string;
    city: string;
    waitingCount: number;
  }>;
  total: number;
}> {
  const safePageSize = Math.min(pageSize, platformConfig.maxPageSize);
  const offset = (page - 1) * safePageSize;
  const conditions = ["w.status = 'waiting'"];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (city) {
    conditions.push(`w.city ILIKE $${paramIndex++}`);
    params.push(`%${city}%`);
  }

  const whereClause = conditions.join(' AND ');

  const [dataResult, countResult] = await Promise.all([
    db.query<{
      category_id: string;
      category_name: string;
      preferred_date: string;
      city: string;
      waiting_count: string;
    }>(
      `SELECT w.category_id, COALESCE(sc.name, 'Unknown') AS category_name,
              w.preferred_date::text, w.city, COUNT(*)::text AS waiting_count
       FROM booking_slot_waitlist w
       LEFT JOIN service_categories sc ON w.category_id = sc.id
       WHERE ${whereClause}
       GROUP BY w.category_id, sc.name, w.preferred_date, w.city
       ORDER BY COUNT(*) DESC, w.preferred_date ASC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, safePageSize, offset],
    ),
    db.query<{ count: string }>(
      `SELECT COUNT(DISTINCT (w.category_id, w.preferred_date, w.city))::text AS count
       FROM booking_slot_waitlist w
       WHERE ${whereClause}`,
      params,
    ),
  ]);

  return {
    items: dataResult.rows.map((r) => ({
      categoryId: r.category_id,
      categoryName: r.category_name,
      preferredDate: r.preferred_date,
      city: r.city,
      waitingCount: Number(r.waiting_count),
    })),
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

// --- Formatter ---

export function formatWaitlistEntry(w: SlotWaitlistRow): Record<string, unknown> {
  return {
    id: w.id,
    customerId: w.customer_id,
    categoryId: w.category_id,
    subcategoryId: w.subcategory_id,
    preferredDate: String(w.preferred_date).split('T')[0],
    preferredTimeStart: w.preferred_time_start,
    preferredTimeEnd: w.preferred_time_end,
    city: w.city,
    province: w.province,
    status: w.status,
    notifiedAt: w.notified_at,
    bookedBookingId: w.booked_booking_id,
    expiresAt: w.expires_at,
    createdAt: w.created_at,
  };
}
