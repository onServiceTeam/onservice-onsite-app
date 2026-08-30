import { Routes, buildRoute } from '@/config/navigation';

type NotificationRole = 'customer' | 'provider';
type NotificationData = Record<string, unknown> | null | undefined;

function stringValue(data: NotificationData, key: string): string | null {
  const value = data?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function withQuery(path: string, key: string, value: string): string {
  return `${path}?${key}=${encodeURIComponent(value)}`;
}

/** One route contract shared by foreground inbox taps and device push taps. */
export function resolveNotificationRoute(
  type: string,
  data: NotificationData,
  role: NotificationRole,
): string | null {
  const bookingId = stringValue(data, 'bookingId');
  const recurringBookingId = stringValue(data, 'recurringBookingId');
  const providerId = stringValue(data, 'providerId');
  const disputeId = stringValue(data, 'disputeId');
  const isChat = ['new_message', 'chat_started', 'chat_last_message'].includes(type);

  if (role === 'customer') {
    if (disputeId) return buildRoute(Routes.CUSTOMER.DISPUTE_DETAIL, { id: disputeId });
    if (isChat && bookingId) return buildRoute(Routes.CUSTOMER.CHAT, { id: bookingId });
    if (type === 'new_quote' && bookingId) return withQuery(Routes.CUSTOMER.BOOKING_QUOTES, 'bookingId', bookingId);
    if (type === 'job_completed' && bookingId) return withQuery(Routes.CUSTOMER.BOOKING_COMPLETE, 'bookingId', bookingId);
    if (['provider_en_route', 'provider_arrived'].includes(type) && bookingId) {
      return withQuery(Routes.CUSTOMER.BOOKING_TRACKER, 'bookingId', bookingId);
    }
    if (bookingId) return buildRoute(Routes.CUSTOMER.BOOKING_DETAIL, { id: bookingId });
    if (recurringBookingId) return buildRoute(Routes.CUSTOMER.RECURRING_DETAIL, { id: recurringBookingId });
    if (providerId) return buildRoute(Routes.CUSTOMER.PROVIDER_PROFILE, { id: providerId });
    if (type === 'promo' || type === 'referral') return Routes.CUSTOMER.REFERRAL;
    if (type === 'rating_received' || type === 'job_completed') return Routes.TABS.BOOKINGS;
    if (type === 'payment_released') return Routes.TABS.WALLET;
    if (type === 'area_launch') return Routes.TABS.HOME;
    if (type === 'customer_suspended' || type === 'customer_reactivated') {
      return Routes.CUSTOMER.ACCOUNT_MANAGEMENT;
    }
    return null;
  }

  if (disputeId) return buildRoute(Routes.PROVIDER.DISPUTE_DETAIL, { id: disputeId });
  if (isChat && bookingId) return buildRoute(Routes.PROVIDER.CHAT, { id: bookingId });
  if (type === 'new_job_request') return Routes.PROVIDER.LEADS;
  if (type === 'provider_reminder') return Routes.PROVIDER.REMINDERS;
  if (type === 'payout') return Routes.PROVIDER.PAYOUTS;
  if (type === 'rating_received') return Routes.PROVIDER.REVIEWS;
  if (type === 'quality_standing') return Routes.PROVIDER.STANDARDS;
  if (type === 'payment' || type === 'payment_released') return Routes.PROVIDER_TABS.EARNINGS;
  if (type === 'tier_upgrade' || type === 'provider_tier_changed') return Routes.PROVIDER.TIER_PROGRESSION;
  if (type === 'provider_certification_verified' || type === 'provider_certification_unverified') return Routes.PROVIDER.CERTIFICATIONS;
  if (type === 'provider_staff_approved' || type === 'provider_staff_rejected') return Routes.PROVIDER.TEAM;
  if (['nbi_expiring', 'provider_approved', 'provider_rejected', 'provider_suspended', 'provider_reactivated'].includes(type)) {
    return Routes.PROVIDER.ACCOUNT_MANAGEMENT;
  }
  if (type === 'business_update') return Routes.PROVIDER_TABS.DASHBOARD;
  if (bookingId) return buildRoute(Routes.PROVIDER.JOB_DETAIL, { id: bookingId });
  return null;
}
