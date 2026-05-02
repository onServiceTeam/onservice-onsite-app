import { db } from '../models/db';
import { logger } from '../utils/logger';
import * as templateService from './notification-template.service';
import * as i18n from './i18n.service';
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

// MED-N72 fix — pre-fix the union was missing many types that the rest
// of the codebase (admin.service, booking-admin.service, admin-
// analytics.service, recurring.service, etc.) was already passing into
// `createNotification` or writing directly via raw INSERT. The
// notifications.type column is `VARCHAR(50)` with no CHECK so DB
// silently accepts any string — meaning the type-mismatch only ever
// surfaced at compile time at the few callers that go through
// createNotification(). After this fix the union enumerates EVERY
// notification.type value that any service in this package emits;
// callers that emit something not in the union now get a TS compile
// error and the audit can keep using a single source of truth.
export type NotificationType =
  // Booking lifecycle
  | 'booking_created' | 'booking_confirmed' | 'booking_expired'
  | 'booking_cancelled' | 'customer_cancelled'
  | 'provider_assigned' | 'provider_en_route' | 'provider_arrived'
  | 'job_completed' | 'auto_confirmed'
  // Payments + disputes
  | 'refund_processed' | 'dispute_update' | 'payment_released'
  // Provider-side
  | 'new_job_available' | 'job_accepted'
  | 'rating_received' | 'tier_upgrade' | 'nbi_expiring'
  | 'provider_approved' | 'provider_rejected' | 'provider_suspended'
  | 'provider_reactivated' | 'provider_tier_changed'
  // Chat / messaging
  | 'new_message' | 'chat_started' | 'chat_last_message'
  // Quotes
  | 'new_quote' | 'quote_accepted' | 'quote_expired'
  // Recurring + business
  | 'recurring_update' | 'business_update' | 'area_launch'
  // E02 / D22 — recurring auto-charge lifecycle
  | 'recurring_auto_charge_succeeded'
  | 'recurring_auto_charge_failed'
  | 'recurring_auto_charge_suspended'
  // Compliance / data subject rights
  | 'dsr_info_requested'
  // Admin operational alerts (raw-INSERT in admin-analytics.service)
  | 'provider_consecutive_one_star' | 'paymongo_webhook_failure'
  | 'provider_nbi_expiring' | 'customer_chronic_disputes'
  | 'city_low_provider_count' | 'guarantee_fund_low';

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function createNotification(params: CreateNotificationParams): Promise<NotificationRow> {
  // MED-N60 fix — old code did `{ ...params.data, type: params.type }`
  // which let params.type silently OVERWRITE any 'type' key the caller
  // had explicitly set in data. Now:
  //
  //   1. params.type is also written under `notificationType` — the
  //      canonical, never-collides field. Push handlers and admin UIs
  //      should read `data.notificationType` going forward.
  //   2. We still write `data.type = params.type` BEFORE caller spread
  //      for back-compat with mobile clients that already read it. If
  //      the caller intentionally put a different `type` in data, their
  //      value wins (the spread is after).
  //   3. The row's own `type` column is unchanged and remains the
  //      authoritative source of the notification type.
  const callerData = params.data ?? {};
  const enrichedData = {
    type: params.type, // back-compat for older mobile readers
    ...callerData,     // caller wins for any colliding keys
    notificationType: params.type, // canonical, always set, never overridden
  };
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
    // MED-N57 fix — pre-fix this catch only logger.error()'d. The
    // notification ROW already exists in DB from createNotification
    // upstream, but the immediate push that wakes the device never
    // arrived. Critical alerts ("provider arrived", "refund processed")
    // silently failed.
    //
    // Post-fix: enqueue a row in push_retry_queue. A scheduled worker
    // (push-retry.service.processPushRetries) picks pending rows up
    // and retries with exponential backoff; after 5 attempts the row
    // is marked failed_permanent for admin ops.
    //
    // require() instead of top-level import to avoid a circular dep:
    // push-retry.service is a small leaf module but the worker invokes
    // deliverPushToDevice via callback so the cycle would be created
    // if either side imported the other up-front.
    logger.error('Expo push API call failed', {
      userId,
      error: err instanceof Error ? err.message : 'Unknown',
    });
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { enqueuePushRetry } = require('./push-retry.service');
      await enqueuePushRetry({
        userId,
        notificationId: (data?.notificationId as string | undefined) ?? null,
        title,
        body,
        data: data ?? {},
        initialError: err instanceof Error ? err.message : String(err),
      });
    } catch (enqueueErr) {
      logger.error('FAILED to enqueue push retry; original push failure remains primary record', {
        userId,
        enqueueError: enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr),
      });
    }
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
  // MED-N58 fix: titles + bodies are now sourced from
  // i18n.service.NOTIFICATION_CATALOG. The notification type stays
  // hardcoded per status (it's not user-facing copy — it's the
  // discriminator the mobile UI uses to pick an icon + screen).
  const statusToType: Record<string, NotificationType> = {
    matched: 'provider_assigned',
    paid: 'booking_confirmed',
    provider_en_route: 'provider_en_route',
    provider_arrived: 'provider_arrived',
    completed_by_provider: 'job_completed',
    confirmed: 'payment_released',
    cancelled_by_customer: 'customer_cancelled',
    cancelled_by_provider: 'customer_cancelled',
    disputed: 'dispute_update',
  };

  const type = statusToType[status];
  if (!type) return;

  // Look up the user's preferred locale (default 'en' from migration 094).
  let locale: i18n.Locale = 'en';
  try {
    const result = await db.query<{ preferred_locale: string }>(
      `SELECT preferred_locale FROM users WHERE id = $1`,
      [userId],
    );
    if (result.rows[0]?.preferred_locale) {
      locale = result.rows[0].preferred_locale as i18n.Locale;
    }
  } catch (err) {
    // Pre-094 deployments may not have the column — log and fall
    // through to English so notifications keep flowing.
    logger.debug('preferred_locale lookup failed; defaulting to en', {
      userId, error: err instanceof Error ? err.message : String(err),
    });
  }

  const translation = i18n.translate(status, locale);
  if (!translation) return; // Unknown status — same behavior as pre-fix.

  const { title, body } = translation;

  const n = await createNotification({
    userId,
    type,
    title,
    body,
    data: { bookingId, status, locale },
  });

  void deliverPushToDevice(userId, title, body, { bookingId, status, notificationId: n.id, type });
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
  // Phase 14 Dispatch 08 — Bug 969 granular marketing consent.
  marketing_push_enabled: boolean;
  marketing_sms_enabled: boolean;
  marketing_email_enabled: boolean;
  marketing_consent_acknowledged_at: Date | null;
  marketing_consent_version: number | null;
}

const PREF_COLUMNS: (keyof Omit<NotificationPrefRow, 'user_id' | 'marketing_consent_acknowledged_at' | 'marketing_consent_version'>)[] = [
  'booking_updates', 'provider_activity', 'payment_alerts', 'messages',
  'promotions', 'suki_rewards', 'reminders', 'system',
  'marketing_push_enabled', 'marketing_sms_enabled', 'marketing_email_enabled',
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
  // D08 Bug 969 additions
  marketingPushEnabled: boolean;
  marketingSmsEnabled: boolean;
  marketingEmailEnabled: boolean;
  marketingConsentAcknowledgedAt: string | null;
  marketingConsentVersion: number | null;
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
  marketingPushEnabled: false,
  marketingSmsEnabled: false,
  marketingEmailEnabled: false,
  marketingConsentAcknowledgedAt: null,
  marketingConsentVersion: null,
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
    marketingPushEnabled: row.marketing_push_enabled,
    marketingSmsEnabled: row.marketing_sms_enabled,
    marketingEmailEnabled: row.marketing_email_enabled,
    marketingConsentAcknowledgedAt: row.marketing_consent_acknowledged_at?.toISOString() ?? null,
    marketingConsentVersion: row.marketing_consent_version,
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
    // D08 Bug 969 additions
    marketingPushEnabled: 'marketing_push_enabled',
    marketingSmsEnabled: 'marketing_sms_enabled',
    marketingEmailEnabled: 'marketing_email_enabled',
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

  const insertCols = PREF_COLUMNS.map((c) => c).join(', '); // SAFE-N+1: in-memory column-name string projection for INSERT statement (no DB calls).
  const insertVals = PREF_COLUMNS.map((col) => { // SAFE-N+1: in-memory value projection feeding parameterized INSERT (no DB calls inside map).
    const camelKey = Object.entries(mapping).find(([, v]) => v === col)?.[0];
    const val = camelKey ? prefs[camelKey as keyof NotificationPrefs] : undefined;
    return val !== undefined ? val : DEFAULT_PREFS[camelKey as keyof NotificationPrefs];
  });
  const insertPlaceholders = insertVals.map((_, i) => `$${idx + i}`).join(', '); // SAFE-N+1: in-memory placeholder string assembly (no DB calls).

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

// Phase 14 Dispatch 08 — Bug 969 marketing consent enforcement helpers.
// Any future marketing-blast worker MUST go through one of these helpers
// to determine the eligible audience. Sending marketing communications
// to users without `marketing_consent_acknowledged_at IS NOT NULL` is
// an NPC violation.

export type MarketingChannel = 'push' | 'sms' | 'email';

/**
 * Acknowledge marketing consent for a user. Stamps the
 * marketing_consent_acknowledged_at + marketing_consent_version columns.
 * Subsequent sendMarketing* helpers will include this user in audiences
 * (subject to per-channel toggles).
 */
export async function acknowledgeMarketingConsent(
  userId: string,
  consentVersion: number,
): Promise<void> {
  await db.query(
    `INSERT INTO notification_preferences
       (user_id, marketing_consent_acknowledged_at, marketing_consent_version)
     VALUES ($1, NOW(), $2)
     ON CONFLICT (user_id) DO UPDATE
       SET marketing_consent_acknowledged_at = NOW(),
           marketing_consent_version = $2,
           updated_at = NOW()`,
    [userId, consentVersion],
  );
  logger.info('Marketing consent acknowledged', { userId, consentVersion });
}

/**
 * Returns true if the user is eligible to receive marketing on the given
 * channel: per-channel toggle is TRUE AND
 * marketing_consent_acknowledged_at IS NOT NULL. Used by future marketing
 * blast workers to filter the audience.
 */
export async function isMarketingChannelEligible(
  userId: string,
  channel: MarketingChannel,
): Promise<boolean> {
  const column = channel === 'push'
    ? 'marketing_push_enabled'
    : channel === 'sms'
      ? 'marketing_sms_enabled'
      : 'marketing_email_enabled';
  const result = await db.query<{ eligible: boolean }>(
    `SELECT (${column} = TRUE
              AND marketing_consent_acknowledged_at IS NOT NULL) AS eligible
       FROM notification_preferences
      WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0]?.eligible ?? false;
}

/**
 * Returns user IDs that are eligible for marketing on the given channel.
 * Used by marketing blast workers to filter the campaign audience without
 * N+1 lookups.
 */
export async function listMarketingEligibleUsers(
  channel: MarketingChannel,
  limit = 1000,
  offset = 0,
): Promise<string[]> {
  const column = channel === 'push'
    ? 'marketing_push_enabled'
    : channel === 'sms'
      ? 'marketing_sms_enabled'
      : 'marketing_email_enabled';
  const result = await db.query<{ user_id: string }>(
    `SELECT user_id FROM notification_preferences
      WHERE ${column} = TRUE
        AND marketing_consent_acknowledged_at IS NOT NULL
      ORDER BY user_id
      LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return result.rows.map((r) => r.user_id);
}
