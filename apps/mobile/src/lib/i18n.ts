/**
 * Phase 14 Dispatch 11 — i18n shim.
 *
 * v1.0 ships English-only. The shim is a key→string lookup that the
 * customer screens invoke as `i18n.t('auth.no_account_found')` so that
 * v1.1 can swap in a real i18n library (i18next / Tagalog/Cebuano
 * locales) without touching every call site.
 *
 * Spec PART-3 §"Dispatch 11" pattern 4: hardcoded copy → i18n.t().
 */

const EN: Record<string, string> = {
  // Auth (Bugs 868–887)
  'auth.no_account_found': 'No account found for this phone number. Sign up?',
  'auth.rate_limited': 'Too many attempts. Try again in a few minutes.',
  'auth.unknown_error': 'Something went wrong. Please try again.',
  'auth.otp_resent': 'Code sent. Check your messages.',
  'auth.otp_invalid': 'Code does not match. Try again.',
  // Bookings (Bugs 889–924)
  'bookings.empty_title': 'No bookings yet',
  'bookings.empty_body': 'Browse services and book your first appointment.',
  'bookings.empty_cta': 'Browse services',
  'bookings.cancelled_label': 'Cancelled',
  'bookings.completed_label': 'Completed',
  // Common
  'common.retry': 'Retry',
  'common.confirm': 'Confirm',
  'common.cancel': 'Cancel',
  'common.continue': 'Continue',
  'common.back': 'Back',
  'common.error_generic': 'An error occurred. Please try again.',
  'common.loading': 'Loading…',
  'common.refreshed': 'Refreshed',
  'common.network_error': 'Network connection lost. Check your internet.',
  // Payment (Bugs 894 + others)
  'payment.processing': 'Processing payment…',
  'payment.declined': 'Payment was declined. Try a different method.',
  // Account (Bugs 975 + chain)
  'account.signed_out': 'You have been signed out.',
  'account.session_expired': 'Session expired. Please sign in again.',
};

type Locale = 'en' | 'tl' | 'ceb';

let currentLocale: Locale = 'en';

export const i18n = {
  /**
   * Translate a key. Returns the key itself if missing (so a typo
   * surfaces visibly during development without crashing the screen).
   * v1.1+ swaps this body for i18next + locale-aware lookup.
   */
  t(key: string, params?: Record<string, string | number>): string {
    let str = EN[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(`{${k}}`, String(v));
      }
    }
    return str;
  },

  setLocale(locale: Locale): void {
    currentLocale = locale;
    // v1.1+ reloads the locale catalog here.
  },

  getLocale(): Locale {
    return currentLocale;
  },
};

export type I18nKey = keyof typeof EN;
