/**
 * apps/mobile/src/config/navigation.ts
 *
 * Bug 1185 fix verified — single source of truth for mobile route paths.
 * Phase 14 Dispatch 02 Part 4.
 *
 * All screen routes defined here. Navigation calls everywhere else use
 * `Routes.X.Y` (or `buildRoute(Routes.X.Y, { id })` for dynamic segments)
 * — never raw strings. Gate `a-cross-source-routes.sh` enforces this.
 *
 * Why this matters: when a screen renames or moves, you change the path
 * once here, not 30 places. When a typo lands in a string, TypeScript
 * catches it instead of a runtime 404 in production.
 */

export const Routes = {
  ROOT: '/',

  TABS: {
    HOME: '/(tabs)/home',
    BOOKINGS: '/(tabs)/bookings',
    PROFILE: '/(tabs)/profile',
    WALLET: '/(tabs)/wallet',
  },

  PROVIDER_TABS: {
    DASHBOARD: '/(provider-tabs)/dashboard',
    JOBS: '/(provider-tabs)/jobs',
    EARNINGS: '/(provider-tabs)/earnings',
    PROVIDER_PROFILE: '/(provider-tabs)/provider-profile',
  },

  AUTH: {
    SPLASH: '/',
    ONBOARDING: '/onboarding',
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    OTP_VERIFY: '/auth/otp-verify',
  },

  CUSTOMER: {
    HOME: '/customer/home',
    SEARCH: '/customer/search',
    CATEGORY: '/customer/category/[id]',
    SUBCATEGORY: '/customer/subcategory/[id]',
    BOOKING_FORM: '/customer/booking/form',
    CHECKOUT: '/customer/booking/checkout',
    BOOKING_CONFIRM: '/customer/booking/confirm',
    BOOKING_TRACKER: '/customer/booking/[id]/tracker',
    BOOKING_HISTORY: '/customer/bookings',
    BOOKING_DETAIL: '/customer/booking/[id]',
    BOOKING_CONFIGURE: '/customer/booking/configure',
    BOOKING_JOB_REQUEST: '/customer/booking/job-request',
    BOOKING_QUOTES: '/customer/booking/quotes',
    BOOKING_MAKE_RECURRING: '/customer/booking/make-recurring',
    CHAT: '/customer/chat/[bookingId]',
    RATE_REVIEW: '/customer/booking/[id]/review',
    // BUG-PHASE81-01 fix (same dead-route pattern as CRIT-80) — pre-fix
    // this pointed at '/customer/wallet' which has no corresponding
    // file. The (tabs)/wallet.tsx "+ Top Up" button uses this route
    // and so navigated to a dead screen. The actual file is
    // wallet-topup.tsx; point at it directly so the link works and
    // matches the button label.
    WALLET: '/customer/wallet-topup',
    PROFILE: '/customer/profile',
    // BUG-PHASE64-05 fix (CRIT-80 from 2026-05-01 audit) — pre-fix this
    // pointed at '/customer/settings', which has no corresponding file.
    // The profile.tsx menu row labelled "Notification Settings" used
    // this route and so navigated to a dead screen. The actual file
    // is notification-settings.tsx; point at it directly so the link
    // works and matches the menu label.
    SETTINGS: '/customer/notification-settings',
    NOTIFICATIONS: '/customer/notifications',
    PROVIDER_PROFILE: '/customer/provider/[id]',
    PROVIDER_LIST: '/customer/providers',
    RECURRING_BOOKINGS: '/customer/recurring',
    RECURRING_SETUP: '/customer/recurring/setup',
    RECURRING_DETAIL: '/customer/recurring/[id]',
    BUSINESS_ACCOUNTS: '/customer/business',
    BUSINESS_DETAIL: '/customer/business/[id]',
    BUSINESS_CREATE: '/customer/business/create',
    BUSINESS_MEMBERS: '/customer/business/[id]/members',
    BUSINESS_CONTRACTS: '/customer/business/[id]/contracts',
    BUSINESS_INVOICES: '/customer/business/[id]/invoices',
    BUSINESS_INVOICE_DETAIL: '/customer/business/[id]/invoices/[invoiceId]',
    SERVICE_AREAS: '/customer/service-areas',
    SERVICE_AREA_DETAIL: '/customer/service-areas/[slug]',
    WAITLIST: '/customer/service-areas/waitlist',
    REBOOKING: '/customer/booking/[id]/rebook',
    SLOT_WAITLIST: '/customer/slot-waitlist',
    DATA_PRIVACY: '/customer/data-privacy',
    DATA_EXPORT: '/customer/data-export',
    ACCOUNT_DELETION: '/customer/account-deletion',
    SECURITY_SETTINGS: '/customer/security',
    DEVICE_MANAGEMENT: '/customer/security/devices',
    ACCESSIBILITY_SETTINGS: '/customer/settings/accessibility',
    SAFETY: '/customer/safety-and-support',
    SUKI_PROS: '/customer/suki-pros',
    ADDRESS_PICKER: '/customer/address-picker',
    ADDRESSES: '/customer/addresses',
    ADD_ADDRESS: '/customer/add-address',
    ADD_PAYMENT: '/customer/add-payment',
    PAYMENT_METHODS: '/customer/payment-methods',
    REFERRAL: '/customer/referral',
    PROMOTIONS: '/customer/promotions',
    HELP: '/customer/help',
    TERMS: '/customer/terms',
    SUPPORT: '/customer/support',
    ACCOUNT_MANAGEMENT: '/customer/account-management',
    EMAIL_VERIFICATION: '/customer/email-verification',
  },

  PROVIDER: {
    HOME: '/provider/home',
    JOB_DETAIL: '/provider/job/[id]',
    JOB_COMPLETE: '/provider/job/[id]/complete',
    QUOTE_BUILDER: '/provider/job/[id]/quote',
    ACTIVE_JOB: '/provider/job/[id]/active',
    WALLET: '/provider/wallet',
    EARNINGS: '/provider/earnings',
    EARNINGS_GOALS: '/provider/earnings/goals',
    DEMAND_INSIGHTS: '/provider/demand-insights',
    MONTHLY_SUMMARY: '/provider/monthly-summary',
    RECEIPT: '/provider/receipt/[bookingId]',
    MATERIALS_LIST: '/provider/job/[id]/materials',
    SCHEDULE: '/provider/schedule',
    PROFILE: '/provider/profile',
    SETTINGS: '/provider/settings',
    REVIEWS: '/provider/reviews',
    // BUG-PHASE81-02 fix — pre-fix the path was '/provider/service-areas'
    // (plural) but the actual file is service-area.tsx (singular). No
    // current consumers, but leaving the wrong path is a landmine for
    // future code that calls Routes.PROVIDER.SERVICE_AREAS expecting
    // it to work. Renamed key to SERVICE_AREA to match the file.
    SERVICE_AREA: '/provider/service-area',
    NOTIFICATIONS: '/provider/notifications',
    SERVICES: '/provider/services',
    CALENDAR: '/provider/calendar',
    AVAILABILITY: '/provider/availability',
    PORTFOLIO: '/provider/portfolio',
    CERTIFICATIONS: '/provider/certifications',
    PAYOUTS: '/provider/payouts',
    PAYOUT_SETTINGS: '/provider/payout-settings',
    SUKI_CUSTOMERS: '/provider/suki-customers',
    HELP: '/provider/help',
    TIER_PROGRESSION: '/provider/tier-progression',
    WITHDRAW: '/provider/withdraw',
    ACCOUNT_MANAGEMENT: '/provider/account-management',
  },

  PROVIDER_ONBOARDING: {
    ROLE_SELECT: '/provider-onboarding/role-select',
    CATEGORIES: '/provider-onboarding/categories',
    SERVICE_AREA: '/provider-onboarding/service-area',
    DOCUMENTS: '/provider-onboarding/documents',
    SELFIE: '/provider-onboarding/selfie',
    TERMS: '/provider-onboarding/terms',
    REVIEW_PENDING: '/provider-onboarding/review-pending',
    IDENTITY_VERIFICATION: '/provider-onboarding/identity-verification',
    BACKGROUND_CHECK_STATUS: '/provider-onboarding/background-check-status',
  },
} as const;

/**
 * Substitute dynamic params (e.g. [id], [slug], [bookingId]) into a route
 * template. Use this anywhere a route has a [param] segment:
 *
 *   buildRoute(Routes.CUSTOMER.BOOKING_DETAIL, { id: bookingId })
 *   // → '/customer/booking/abc-123'
 *
 *   buildRoute(Routes.CUSTOMER.BUSINESS_INVOICE_DETAIL,
 *              { id: 'biz-1', invoiceId: 'inv-9' })
 *   // → '/customer/business/biz-1/invoices/inv-9'
 *
 * Throws if the template still has unfilled [params] after substitution —
 * a missing param is a programmer error, not a runtime URL.
 */
export function buildRoute(
  template: string,
  params: Record<string, string | number>,
): string {
  let out = template;
  for (const [key, value] of Object.entries(params)) {
    out = out.replace(`[${key}]`, encodeURIComponent(String(value)));
  }
  if (/\[[a-zA-Z]+\]/.test(out)) {
    const missing = out.match(/\[([a-zA-Z]+)\]/g);
    throw new Error(`buildRoute: template "${template}" missing params ${missing?.join(', ')}`);
  }
  return out;
}
