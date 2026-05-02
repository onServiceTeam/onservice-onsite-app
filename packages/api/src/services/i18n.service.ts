/**
 * MED-N58 fix — minimal i18n catalog for notification bodies.
 *
 * Static dict keyed by message-id, then by locale. Translate falls
 * back to English if the requested locale is missing OR the key has
 * no translation in that locale (defensive — a missing translation
 * should never block a notification from going out).
 *
 * Why a static dict and not a DB table:
 *   - Translation keys are tied to code paths; adding a key needs
 *     a code change anyway. Storing them in DB adds round-trips
 *     and a migration for every new notification.
 *   - Admin doesn't need to edit notification copy at runtime.
 *   - Catalog stays under 200 lines for v1.0.
 *
 * Locales supported v1.0: en (English), tl (Filipino/Tagalog).
 * Adding a locale: extend Locale type + add entries to every key
 * in NOTIFICATION_CATALOG.
 */

export type Locale = 'en' | 'tl';

export const SUPPORTED_LOCALES: Locale[] = ['en', 'tl'];

const FALLBACK_LOCALE: Locale = 'en';

interface Translation {
  title: string;
  body: string;
}

type LocaleMap = Record<Locale, Translation>;

/**
 * Notification translation catalog. Keys mirror the
 * `notifyBookingStatusChange` statusMessages keys.
 */
export const NOTIFICATION_CATALOG: Record<string, LocaleMap> = {
  matched: {
    en: { title: 'Provider Matched', body: 'A provider has been matched to your booking.' },
    tl: { title: 'May Provider Na', body: 'May provider na nakatakda para sa iyong booking.' },
  },
  paid: {
    en: { title: 'Payment Confirmed', body: 'Your payment has been confirmed and held in escrow.' },
    tl: { title: 'Bayad Na-confirm', body: 'Ang iyong bayad ay na-confirm at hawak sa escrow.' },
  },
  provider_en_route: {
    en: { title: 'Provider On The Way', body: 'Your service provider is heading to your location.' },
    tl: { title: 'Papunta na ang Provider', body: 'Ang iyong service provider ay papunta na sa lokasyon mo.' },
  },
  provider_arrived: {
    en: { title: 'Provider Has Arrived', body: 'Your service provider has arrived at your location.' },
    tl: { title: 'Dumating na ang Provider', body: 'Ang iyong service provider ay nasa lokasyon mo na.' },
  },
  completed_by_provider: {
    en: { title: 'Job Completed', body: 'The provider has marked the job as complete. Please confirm within 48 hours.' },
    tl: { title: 'Tapos na ang Trabaho', body: 'Tinanda ng provider na tapos na ang trabaho. Pakikumpirma sa loob ng 48 oras.' },
  },
  confirmed: {
    en: { title: 'Payment Released', body: 'Thank you for confirming! Payment has been released to the provider.' },
    tl: { title: 'Naipasa na ang Bayad', body: 'Salamat sa iyong pagkumpirma! Naipasa na ang bayad sa provider.' },
  },
  cancelled_by_customer: {
    en: { title: 'Booking Cancelled', body: 'The customer has cancelled this booking.' },
    tl: { title: 'Kinansela ang Booking', body: 'Kinansela ng customer ang booking na ito.' },
  },
  cancelled_by_provider: {
    en: { title: 'Booking Cancelled', body: 'The provider has cancelled this booking.' },
    tl: { title: 'Kinansela ang Booking', body: 'Kinansela ng provider ang booking na ito.' },
  },
  disputed: {
    en: { title: 'Dispute Filed', body: 'A dispute has been filed for this booking. Our team will review it.' },
    tl: { title: 'May Reklamo', body: 'May reklamong na-file para sa booking na ito. Susuriin ng aming team.' },
  },
};

/**
 * Translate a notification key. Returns { title, body } in the
 * requested locale, falling back to English if the locale is
 * unsupported or the key has no translation in that locale.
 *
 * Returns null if the key is not in the catalog at all (caller
 * decides whether to skip the notification or use a default).
 */
export function translate(key: string, locale: Locale | string | null | undefined): Translation | null {
  const entry = NOTIFICATION_CATALOG[key];
  if (!entry) return null;
  const lc = (locale && SUPPORTED_LOCALES.includes(locale as Locale)) ? (locale as Locale) : FALLBACK_LOCALE;
  return entry[lc] ?? entry[FALLBACK_LOCALE];
}

/** Test-only convenience: list every key the catalog knows. */
export function listKeys(): string[] {
  return Object.keys(NOTIFICATION_CATALOG);
}
