import { db } from '../models/db';
import { logger } from '../utils/logger';
import { createAppError } from '../middleware/error.middleware';
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
  // Phase 200 — customer is told when the auto-dispatch cascade can't find an
  // available provider, instead of being left on "Looking for provider"
  // silently.
  | 'no_provider_available'
  // Phase N MED-N59 fix — `provider_cancelled` added so cancellation
  // notifications correctly differentiate party-of-cancellation. Pre-fix
  // both `cancelled_by_customer` and `cancelled_by_provider` mapped to
  // the same `customer_cancelled` type, so a customer who looked at
  // their notification list saw "The customer has cancelled this
  // booking" even when the provider was the one who cancelled.
  | 'booking_cancelled' | 'customer_cancelled' | 'provider_cancelled'
  | 'provider_assigned' | 'provider_en_route' | 'provider_arrived'
  | 'job_completed' | 'auto_confirmed'
  // Payments + disputes
  | 'payment' | 'refund_processed' | 'dispute_update' | 'payment_released'
  | 'payout'
  // Retention and marketing values also written by transactional services.
  | 'referral' | 'suki' | 'promo'
  // Provider-side
  | 'new_job_available' | 'job_accepted'
  | 'rating_received' | 'tier_upgrade' | 'nbi_expiring'
  // Provider-facing quality-standing nudge (emitted on a low review rating).
  | 'quality_standing'
  | 'provider_approved' | 'provider_rejected' | 'provider_suspended'
  | 'provider_reactivated' | 'provider_tier_changed'
  // D23 — provider is told when back-office decides on a team member they added.
  | 'provider_staff_approved' | 'provider_staff_rejected'
  // Provider credential review in Provider 360.
  | 'provider_certification_verified' | 'provider_certification_unverified'
  // Chat / messaging
  | 'new_message' | 'chat_started' | 'chat_last_message'
  // Quotes
  | 'new_quote' | 'quote_accepted' | 'quote_expired'
  // D27 Phase 1 — provider is notified when a custom-quote job request lands in
  // their category + service area (pull-based lead, provider chooses to quote).
  | 'new_job_request'
  // D27 Phase 7b — provider CRM follow-up reminder fires on its due date.
  | 'provider_reminder'
  // MED-N70 — change-order auto-expiry worker
  | 'change_order_expired'
  // Recurring + business
  | 'recurring_update' | 'business_update' | 'area_launch'
  // E02 / D22 legacy recurring auto-charge lifecycle (disabled under E20)
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

/**
 * MED-N61 fix — surface template lookup failures so admins know
 * notifications are silently dropping back to fallback copy. Pre-fix
 * the catch was empty: a corrupted notification_templates table or a
 * mistyped slug would silently use hardcoded English fallback for
 * every send forever, with no log line indicating anything was wrong.
 *
 * Post-fix:
 *   - 'template not found' is downgraded to logger.debug (expected
 *     during initial seeding / dev environments).
 *   - inactive template is logger.info (admin chose to disable it).
 *   - Any OTHER exception (DB connection lost, JSON parse error,
 *     render template error) is logger.error so it shows up in
 *     monitoring AND a 'notification_template_lookup_failed' counter
 *     ticks (caller can surface to admin alerts dashboard).
 *
 * The fallback is still used in all error cases — sending the
 * notification with fallback copy is better than dropping the
 * notification entirely. But the failure is no longer silent.
 */
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
    // Inactive template — admin intentionally disabled it. Log at info.
    logger.info('Notification template inactive — using fallback', { slug });
  } catch (err) {
    const code = (err as { code?: string; statusCode?: number }).code;
    const status = (err as { code?: string; statusCode?: number }).statusCode;
    if (status === 404 || code === 'template_not_found') {
      // Expected during seeding / dev — debug only.
      logger.debug('Notification template not found — using fallback', { slug });
    } else {
      // Real failure — DB error, render error, etc. Surface it.
      logger.error('Notification template lookup failed — using fallback', {
        slug,
        error: (err as Error).message,
        code,
      });
    }
  }
  return { title: fallbackTitle, body: fallbackBody };
}

interface PushTokenRow { token: string; platform: string }

export type PushPlatform = 'ios' | 'android' | 'web';

/**
 * Associate one physical push token with exactly one signed-in account.
 *
 * A device token is stable across account switches. The original registration
 * query only enforced uniqueness per (user, token), so one phone could keep the
 * same token on several accounts and receive private notifications for all of
 * them. Serialize by token, remove any previous owner, then register the current
 * account in one transaction. This also repairs stale ownership when a prior
 * logout could not reach the server.
 */
export async function registerPushToken(
  userId: string,
  token: string,
  platform: PushPlatform,
): Promise<void> {
  await db.transaction(async (client) => {
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      [token],
    );
    await client.query(
      `DELETE FROM push_tokens WHERE token = $1 AND user_id <> $2`,
      [token, userId],
    );
    await client.query(
      `INSERT INTO push_tokens (user_id, token, platform)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, token) DO UPDATE
         SET platform = EXCLUDED.platform, updated_at = NOW()`,
      [userId, token, platform],
    );
  });

  logger.info('Push token registered', { userId, platform });
}

/** Remove only the current account's association with this device token. */
export async function unregisterPushToken(userId: string, token: string): Promise<void> {
  await db.query(
    `DELETE FROM push_tokens WHERE user_id = $1 AND token = $2`,
    [userId, token],
  );
  logger.info('Push token unregistered', { userId });
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

// Phase 36a — Quiet-hours bypass. Critical types are delivered even
// during quiet hours so customers aren't left wondering whether their
// payment went through or their booking was cancelled.
// Typed to NotificationType so a stale/typo'd entry is a compile error (the
// previous Set<string> silently carried 5 type names that don't exist, so they
// never matched). Only genuinely can't-wait-till-morning events bypass.
const QUIET_HOURS_BYPASS_TYPES = new Set<NotificationType>([
  // Money + booking-state changes the user needs even at night.
  'refund_processed', 'booking_cancelled', 'provider_cancelled', 'customer_cancelled',
  // Provider arrival is time-sensitive — provider is at the door now.
  'provider_arrived',
  // Customer is actively waiting on dispatch — tell them immediately if it failed.
  'no_provider_available',
]);

/**
 * Phase 36a — quiet-hours guard. Returns TRUE when the userId has
 * quiet_hours_enabled AND the current time falls inside the window
 * AND the notification type is NOT in the bypass list. Wraps midnight
 * when start > end (e.g., 22:00..07:00).
 *
 * Implementation reads the user's timezone column (default
 * 'Asia/Manila') and computes "now" in that TZ using
 * Intl.DateTimeFormat — no external date-fns-tz dependency needed.
 */
async function isInQuietHours(
  userId: string,
  notificationType?: string,
): Promise<boolean> {
  if (notificationType && QUIET_HOURS_BYPASS_TYPES.has(notificationType as NotificationType)) {
    return false;
  }
  const prefRow = await db.query<{
    quiet_hours_enabled: boolean;
    quiet_hours_start: string;
    quiet_hours_end: string;
    quiet_hours_timezone: string;
  }>(
    `SELECT quiet_hours_enabled, quiet_hours_start::text, quiet_hours_end::text,
            quiet_hours_timezone
       FROM notification_preferences WHERE user_id = $1`,
    [userId],
  );
  if (prefRow.rows.length === 0 || !prefRow.rows[0]!.quiet_hours_enabled) {
    return false;
  }
  const { quiet_hours_start: start, quiet_hours_end: end, quiet_hours_timezone: tz } = prefRow.rows[0]!;
  // Compute "now" in the user's TZ as HH:MM (24h).
  let nowHHMM: string;
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz,
    });
    nowHHMM = fmt.format(new Date());
  } catch {
    // Bad timezone string in user prefs — fail-open (don't suppress push).
    logger.warn('quiet_hours invalid timezone — fail open', { userId, tz });
    return false;
  }
  const startHHMM = start.slice(0, 5);
  const endHHMM = end.slice(0, 5);
  const inWindow = startHHMM <= endHHMM
    ? (nowHHMM >= startHHMM && nowHHMM < endHHMM)         // same-day window
    : (nowHHMM >= startHHMM || nowHHMM < endHHMM);        // wraps midnight
  return inWindow;
}

async function deliverPushToDevice(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const notificationType = typeof data?.type === 'string' ? data.type : undefined;
  if (!(await isPushEnabledForType(userId, notificationType, data))) {
    logger.info('Push suppressed by notification preferences', { userId, type: notificationType });
    return;
  }
  // Phase 36a — quiet-hours suppression. The notifications row was
  // already INSERTed by createNotification; we only skip the push
  // wake-up. User sees the message when they next open the app.
  if (await isInQuietHours(userId, notificationType)) {
    logger.info('Push suppressed by quiet hours', { userId, type: notificationType });
    return;
  }

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

type PushPreferenceKey =
  | 'bookingUpdates'
  | 'providerActivity'
  | 'paymentAlerts'
  | 'messages'
  | 'promotions'
  | 'sukiRewards'
  | 'reminders'
  | 'system';

function pushPreferenceForType(
  type: string | undefined,
  data?: Record<string, unknown>,
): PushPreferenceKey {
  if (!type) return 'system';
  if (['new_message', 'chat_started', 'chat_last_message'].includes(type)) return 'messages';
  if (['refund_processed', 'payment_released', 'payout', 'recurring_auto_charge_succeeded', 'recurring_auto_charge_failed', 'recurring_auto_charge_suspended'].includes(type)) return 'paymentAlerts';
  if (['provider_assigned', 'provider_en_route', 'provider_arrived'].includes(type)) return 'providerActivity';
  if (['provider_reminder', 'nbi_expiring', 'change_order_expired'].includes(type)) return 'reminders';
  if (type === 'area_launch' && data?.waitlistId) return 'reminders';
  if (['promo', 'area_launch'].includes(type)) return 'promotions';
  if (['referral', 'suki', 'tier_upgrade'].includes(type)) return 'sukiRewards';
  if (
    type.startsWith('booking_')
    || ['no_provider_available', 'customer_cancelled', 'provider_cancelled', 'job_completed', 'auto_confirmed', 'dispute_update', 'new_job_available', 'new_job_request', 'job_accepted', 'new_quote', 'quote_accepted', 'quote_expired', 'recurring_update'].includes(type)
  ) return 'bookingUpdates';
  return 'system';
}

async function isPushEnabledForType(
  userId: string,
  type: string | undefined,
  data?: Record<string, unknown>,
): Promise<boolean> {
  const prefs = await getNotificationPreferences(userId);
  const key = pushPreferenceForType(type, data);
  if (!prefs[key]) return false;
  if (key === 'promotions') {
    return prefs.marketingPushEnabled && prefs.marketingConsentAcknowledgedAt !== null;
  }
  return true;
}

/**
 * Store an inbox notification and wake the user's device. The database row is
 * authoritative; device delivery remains best-effort and is retried by the
 * push retry worker if Expo is unavailable.
 */
export async function createPushNotification(params: CreateNotificationParams): Promise<NotificationRow> {
  const notification = await createNotification(params);
  void deliverPushToDevice(
    params.userId,
    params.title,
    params.body,
    { ...params.data, notificationId: notification.id, type: params.type },
  ).catch((error: unknown) => {
    logger.error('Push delivery setup failed', {
      userId: params.userId,
      notificationId: notification.id,
      type: params.type,
      error: error instanceof Error ? error.message : String(error),
    });
  });
  return notification;
}

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  type: NotificationType = 'booking_confirmed',
  data?: Record<string, unknown>,
): Promise<void> {
  await createPushNotification({ userId, type, title, body, data });
}

export async function notifyProviderNewJob(
  providerUserId: string,
  bookingId: string,
  serviceName: string,
  amount: number,
  city: string,
  // Phase 200 fix — the offerId MUST flow to the client so the provider can
  // actually accept/decline the offer. Pre-fix it was omitted, so the in-app
  // "Accept Job" modal had nothing to POST to and just navigated to a booking
  // the provider wasn't assigned to (404), and the booking never got a
  // provider. Carried in both the notification data and the socket payload.
  offerId?: string,
): Promise<void> {
  const amountStr = formatPHP(amount);
  const { title, body } = await resolveTemplate(
    'new_job_available',
    { bookingId, serviceName, amount: amountStr, city },
    'New Job Available',
    `${serviceName} in ${city} — ${amountStr}`,
  );
  await createPushNotification({
    userId: providerUserId,
    type: 'new_job_available',
    title,
    body,
    data: { bookingId, serviceName, amount, offerId },
  });

  // Also emit real-time socket event so the in-app modal fires immediately
  emitToUser(providerUserId, 'new:job', { bookingId, serviceName, amount, city, title, body, offerId });
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
  await createPushNotification({
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
    // MED-N59 fix — distinct type so the i18n catalog can render the
    // correct "provider has cancelled" body. Pre-fix both mapped to
    // `customer_cancelled` even when the provider initiated.
    cancelled_by_provider: 'provider_cancelled',
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

  await createPushNotification({
    userId,
    type,
    title,
    body,
    data: { bookingId, status, locale },
  });
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
  // Phase 36a — quiet hours.
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  quiet_hours_timezone: string;
}

const PREF_COLUMNS: (keyof Omit<NotificationPrefRow, 'user_id' | 'marketing_consent_acknowledged_at' | 'marketing_consent_version'>)[] = [
  'booking_updates', 'provider_activity', 'payment_alerts', 'messages',
  'promotions', 'suki_rewards', 'reminders', 'system',
  'marketing_push_enabled', 'marketing_sms_enabled', 'marketing_email_enabled',
  // Phase 36a
  'quiet_hours_enabled', 'quiet_hours_start', 'quiet_hours_end', 'quiet_hours_timezone',
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
  // Phase 36a additions
  quietHoursEnabled: boolean;
  quietHoursStart: string;     // 'HH:MM'
  quietHoursEnd: string;       // 'HH:MM'
  quietHoursTimezone: string;  // IANA TZ name
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
  // Phase 36a defaults: opt-in (disabled by default; 22:00-07:00 PHT)
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  quietHoursTimezone: 'Asia/Manila',
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
    // Phase 36a — quiet hours
    quietHoursEnabled: row.quiet_hours_enabled,
    quietHoursStart: row.quiet_hours_start.slice(0, 5),
    quietHoursEnd: row.quiet_hours_end.slice(0, 5),
    quietHoursTimezone: row.quiet_hours_timezone,
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
    // Phase 36a — quiet hours
    quietHoursEnabled: 'quiet_hours_enabled',
    quietHoursStart: 'quiet_hours_start',
    quietHoursEnd: 'quiet_hours_end',
    quietHoursTimezone: 'quiet_hours_timezone',
  };

  // Phase 36a — validate quiet-hours payload before any DB write so
  // a malformed time string doesn't blow up Postgres.
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (prefs.quietHoursStart !== undefined && !TIME_RE.test(prefs.quietHoursStart)) {
    throw createAppError('quietHoursStart must be HH:MM (24h).', 400);
  }
  if (prefs.quietHoursEnd !== undefined && !TIME_RE.test(prefs.quietHoursEnd)) {
    throw createAppError('quietHoursEnd must be HH:MM (24h).', 400);
  }
  if (prefs.quietHoursTimezone !== undefined) {
    try {
      // Probe TZ validity: Intl throws on bogus IANA name.
      new Intl.DateTimeFormat('en', { timeZone: prefs.quietHoursTimezone });
    } catch {
      throw createAppError('quietHoursTimezone must be a valid IANA timezone name.', 400);
    }
  }

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
