import { db } from '../models/db';
import { logger } from '../utils/logger';
import * as templateService from './notification-template.service';
import { formatPHP } from '../utils/currency';
import { emitToUser } from './socket.service';

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
  | 'booking_confirmed' | 'booking_expired' | 'provider_assigned' | 'provider_en_route'
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
  const enrichedData = { ...params.data, type: params.type };
  const result = await db.query<NotificationRow>(
    `INSERT INTO notifications (user_id, type, title, body, data)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [params.userId, params.type, params.title, params.body, JSON.stringify(enrichedData)],
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

interface PushTokenRow { token: string; platform: string }

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

async function deliverPushToDevice(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const tokenResult = await db.query<PushTokenRow>(
    `SELECT token, platform FROM push_tokens WHERE user_id = $1`,
    [userId],
  );

  if (tokenResult.rows.length === 0) {
    logger.debug('No push tokens for user — skipping device push', { userId });
    return;
  }

  const messages = tokenResult.rows.map((row) => ({
    to: row.token,
    title,
    body,
    data: data ?? {},
    sound: 'default' as const,
    priority: 'high' as const,
    channelId: 'default',
  }));

  try {
    const response = await globalThis.fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(process.env.EXPO_ACCESS_TOKEN
          ? { 'Authorization': `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(messages),
    });

    const result = (await response.json()) as { data: ExpoPushTicket[] };

    for (let i = 0; i < (result.data?.length ?? 0); i++) {
      const ticket = result.data[i];
      if (ticket?.status === 'error') {
        logger.warn('Push delivery failed', {
          userId,
          token: tokenResult.rows[i]?.token?.slice(0, 20),
          error: ticket.details?.error ?? ticket.message,
        });
        if (ticket.details?.error === 'DeviceNotRegistered') {
          await db.query(
            `DELETE FROM push_tokens WHERE user_id = $1 AND token = $2`,
            [userId, tokenResult.rows[i]?.token],
          );
          logger.info('Removed stale push token', { userId });
        }
      }
    }

    logger.info('Push notification sent', { userId, tokenCount: messages.length });
  } catch (err) {
    logger.error('Expo push API call failed', {
      userId,
      error: err instanceof Error ? err.message : 'Unknown',
    });
  }
}

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  type: NotificationType = 'booking_confirmed',
  data?: Record<string, unknown>,
): Promise<void> {
  const notification = await createNotification({ userId, type, title, body, data });

  void deliverPushToDevice(userId, title, body, { ...data, notificationId: notification.id, type });
}

export async function notifyProviderNewJob(
  providerUserId: string,
  bookingId: string,
  serviceName: string,
  amount: number,
  city: string,
): Promise<void> {
  const amountStr = formatPHP(amount);
  const { title, body } = await resolveTemplate(
    'new_job_available',
    { bookingId, serviceName, amount: amountStr, city },
    'New Job Available',
    `${serviceName} in ${city} — ${amountStr}`,
  );
  const n = await createNotification({
    userId: providerUserId,
    type: 'new_job_available',
    title,
    body,
    data: { bookingId, serviceName, amount },
  });

  void deliverPushToDevice(providerUserId, title, body, { bookingId, serviceName, amount, notificationId: n.id, type: 'new_job_available' });

  // Also emit real-time socket event so the in-app modal fires immediately
  emitToUser(providerUserId, 'new:job', { bookingId, serviceName, amount, city, title, body });
}

export async function notifyCustomerProviderAssigned(
  customerId: string,
  bookingId: string,
  providerName: string,
): Promise<void> {
  const { title, body } = await resolveTemplate(
    'booking_matched',
    { bookingId, providerName },
    'Provider Assigned',
    `${providerName} has been assigned to your booking. They will contact you shortly.`,
  );
  const n = await createNotification({
    userId: customerId,
    type: 'provider_assigned',
    title,
    body,
    data: { bookingId, providerName },
  });

  void deliverPushToDevice(customerId, title, body, { bookingId, providerName, notificationId: n.id, type: 'provider_assigned' });
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
      body: 'The provider has marked the job as complete. Please confirm within 48 hours.',
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

  const n = await createNotification({
    userId,
    type: msg.type,
    title: msg.title,
    body: msg.body,
    data: { bookingId, status },
  });

  void deliverPushToDevice(userId, msg.title, msg.body, { bookingId, status, notificationId: n.id, type: msg.type });
}

export function formatNotification(n: NotificationRow): Record<string, unknown> {
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

// ─── Notification Preferences ──────────────────────────────

interface NotificationPrefRow {
  user_id: string;
  booking_updates: boolean;
  provider_activity: boolean;
  payment_alerts: boolean;
  messages: boolean;
  promotions: boolean;
  suki_rewards: boolean;
  reminders: boolean;
  system: boolean;
}

const PREF_COLUMNS: (keyof Omit<NotificationPrefRow, 'user_id'>)[] = [
  'booking_updates', 'provider_activity', 'payment_alerts', 'messages',
  'promotions', 'suki_rewards', 'reminders', 'system',
];

export interface NotificationPrefs {
  bookingUpdates: boolean;
  providerActivity: boolean;
  paymentAlerts: boolean;
  messages: boolean;
  promotions: boolean;
  sukiRewards: boolean;
  reminders: boolean;
  system: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  bookingUpdates: true,
  providerActivity: true,
  paymentAlerts: true,
  messages: true,
  promotions: false,
  sukiRewards: true,
  reminders: true,
  system: true,
};

function formatPrefs(row: NotificationPrefRow): NotificationPrefs {
  return {
    bookingUpdates: row.booking_updates,
    providerActivity: row.provider_activity,
    paymentAlerts: row.payment_alerts,
    messages: row.messages,
    promotions: row.promotions,
    sukiRewards: row.suki_rewards,
    reminders: row.reminders,
    system: row.system,
  };
}

export async function getNotificationPreferences(userId: string): Promise<NotificationPrefs> {
  const result = await db.query<NotificationPrefRow>(
    `SELECT * FROM notification_preferences WHERE user_id = $1`,
    [userId],
  );
  if (result.rows.length === 0) return { ...DEFAULT_PREFS };
  return formatPrefs(result.rows[0]!);
}

export async function updateNotificationPreferences(
  userId: string,
  prefs: Partial<NotificationPrefs>,
): Promise<NotificationPrefs> {
  const mapping: Record<string, keyof NotificationPrefRow> = {
    bookingUpdates: 'booking_updates',
    providerActivity: 'provider_activity',
    paymentAlerts: 'payment_alerts',
    messages: 'messages',
    promotions: 'promotions',
    sukiRewards: 'suki_rewards',
    reminders: 'reminders',
    system: 'system',
  };

  const sets: string[] = [];
  const params: unknown[] = [userId];
  let idx = 2;

  for (const [camel, snake] of Object.entries(mapping)) {
    const value = prefs[camel as keyof NotificationPrefs];
    if (value !== undefined) {
      sets.push(`${snake} = $${idx++}`);
      params.push(value);
    }
  }

  if (sets.length === 0) return getNotificationPreferences(userId);

  sets.push('updated_at = NOW()');

  const insertCols = PREF_COLUMNS.map((c) => c).join(', ');
  const insertVals = PREF_COLUMNS.map((col) => {
    const camelKey = Object.entries(mapping).find(([, v]) => v === col)?.[0];
    const val = camelKey ? prefs[camelKey as keyof NotificationPrefs] : undefined;
    return val !== undefined ? val : DEFAULT_PREFS[camelKey as keyof NotificationPrefs];
  });
  const insertPlaceholders = insertVals.map((_, i) => `$${idx + i}`).join(', ');

  const result = await db.query<NotificationPrefRow>(
    `INSERT INTO notification_preferences (user_id, ${insertCols})
     VALUES ($1, ${insertPlaceholders})
     ON CONFLICT (user_id) DO UPDATE SET ${sets.join(', ')}
     RETURNING *`,
    [...params, ...insertVals],
  );

  logger.info('Notification preferences updated', { userId });
  return formatPrefs(result.rows[0]!);
}
