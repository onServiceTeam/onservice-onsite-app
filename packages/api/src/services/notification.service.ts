import { db } from '../models/db';
import { logger } from '../utils/logger';
import * as templateService from './notification-template.service';

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  is_read: boolean;
  created_at: Date;
}

interface CountRow { count: string }

type NotificationType =
  | 'booking_confirmed' | 'provider_assigned' | 'provider_en_route'
  | 'provider_arrived' | 'job_completed' | 'auto_confirmed'
  | 'refund_processed' | 'dispute_update' | 'payment_released'
  | 'new_job_available' | 'job_accepted' | 'customer_cancelled'
  | 'rating_received' | 'tier_upgrade' | 'nbi_expiring'
  | 'new_message' | 'new_quote' | 'quote_accepted' | 'quote_expired'
  | 'recurring_update' | 'business_update' | 'area_launch';

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function createNotification(params: CreateNotificationParams): Promise<NotificationRow> {
  const result = await db.query<NotificationRow>(
    `INSERT INTO notifications (user_id, type, title, body, data)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [params.userId, params.type, params.title, params.body, params.data ? JSON.stringify(params.data) : null],
  );

  logger.debug('Notification created', { userId: params.userId, type: params.type });
  return result.rows[0]!;
}

export async function getUserNotifications(
  userId: string,
  page = 1,
  pageSize = 20,
): Promise<{ notifications: NotificationRow[]; total: number; unread: number }> {
  const offset = (page - 1) * pageSize;

  const [countResult, unreadResult, dataResult] = await Promise.all([
    db.query<CountRow>(
      `SELECT COUNT(*)::text as count FROM notifications WHERE user_id = $1`,
      [userId],
    ),
    db.query<CountRow>(
      `SELECT COUNT(*)::text as count FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
      [userId],
    ),
    db.query<NotificationRow>(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, pageSize, offset],
    ),
  ]);

  return {
    notifications: dataResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
    unread: Number(unreadResult.rows[0]?.count ?? 0),
  };
}

export async function markNotificationRead(notificationId: string, userId: string): Promise<void> {
  await db.query(
    `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`,
    [notificationId, userId],
  );
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const result = await db.query(
    `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`,
    [userId],
  );
  return result.rowCount ?? 0;
}

async function resolveTemplate(
  slug: string,
  variables: Record<string, string>,
  fallbackTitle: string,
  fallbackBody: string,
): Promise<{ title: string; body: string }> {
  try {
    const template = await templateService.getTemplateBySlug(slug);
    if (template.is_active) {
      return templateService.renderTemplate(template, variables);
    }
  } catch {
    // Template not found or inactive — use hardcoded fallback
  }
  return { title: fallbackTitle, body: fallbackBody };
}

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  type: NotificationType = 'booking_confirmed',
  data?: Record<string, unknown>,
): Promise<void> {
  logger.info('Push notification (FCM pending)', { userId, title, type });

  await createNotification({ userId, type, title, body, data });
}

export async function notifyProviderNewJob(
  providerUserId: string,
  bookingId: string,
  serviceName: string,
  amount: number,
  city: string,
): Promise<void> {
  const amountStr = `₱${(amount / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  const { title, body } = await resolveTemplate(
    'new_job_available',
    { bookingId, serviceName, amount: amountStr, city },
    'New Job Available',
    `${serviceName} in ${city} — ${amountStr}`,
  );
  await createNotification({
    userId: providerUserId,
    type: 'new_job_available',
    title,
    body,
    data: { bookingId, serviceName, amount },
  });
}

export async function notifyCustomerProviderAssigned(
  customerId: string,
  bookingId: string,
  providerName: string,
): Promise<void> {
  const { title, body } = await resolveTemplate(
    'provider_assigned',
    { bookingId, providerName },
    'Provider Assigned',
    `${providerName} has been assigned to your booking. They will contact you shortly.`,
  );
  await createNotification({
    userId: customerId,
    type: 'provider_assigned',
    title,
    body,
    data: { bookingId, providerName },
  });
}

export async function notifyBookingStatusChange(
  userId: string,
  bookingId: string,
  status: string,
): Promise<void> {
  const statusMessages: Record<string, { title: string; body: string; type: NotificationType }> = {
    matched: {
      title: 'Provider Matched',
      body: 'A provider has been matched to your booking.',
      type: 'provider_assigned',
    },
    paid: {
      title: 'Payment Confirmed',
      body: 'Your payment has been confirmed and held in escrow.',
      type: 'booking_confirmed',
    },
    provider_en_route: {
      title: 'Provider On The Way',
      body: 'Your service provider is heading to your location.',
      type: 'provider_en_route',
    },
    provider_arrived: {
      title: 'Provider Has Arrived',
      body: 'Your service provider has arrived at your location.',
      type: 'provider_arrived',
    },
    completed_by_provider: {
      title: 'Job Completed',
      body: 'The provider has marked the job as complete. Please confirm within 24 hours.',
      type: 'job_completed',
    },
    confirmed: {
      title: 'Payment Released',
      body: 'Thank you for confirming! Payment has been released to the provider.',
      type: 'payment_released',
    },
    cancelled_by_customer: {
      title: 'Booking Cancelled',
      body: 'The customer has cancelled this booking.',
      type: 'customer_cancelled',
    },
    cancelled_by_provider: {
      title: 'Booking Cancelled',
      body: 'The provider has cancelled this booking.',
      type: 'customer_cancelled',
    },
    disputed: {
      title: 'Dispute Filed',
      body: 'A dispute has been filed for this booking. Our team will review it.',
      type: 'dispute_update',
    },
  };

  const msg = statusMessages[status];
  if (!msg) return;

  await createNotification({
    userId,
    type: msg.type,
    title: msg.title,
    body: msg.body,
    data: { bookingId, status },
  });
}

export function formatNotification(n: NotificationRow) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    data: n.data,
    isRead: n.is_read,
    createdAt: n.created_at,
  };
}
