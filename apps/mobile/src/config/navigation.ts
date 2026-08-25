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
    BOOKING_FORM: '/customer/booking/form',
    CHECKOUT: '/customer/booking/checkout',
    BOOKING_CONFIRM: '/customer/booking/confirm',
    BOOKING_HISTORY: '/customer/bookings',
    BOOKING_DETAIL: '/customer/booking/[id]',
    BOOKING_CONFIGURE: '/customer/booking/configure',
    BOOKING_JOB_REQUEST: '/customer/booking/job-request',
    BOOKING_QUOTES: '/customer/booking/quotes',
    BOOKING_TRACKER: '/customer/booking/tracker',
    BOOKING_COMPLETE: '/customer/booking/complete',
    BOOKING_MAKE_RECURRING: '/customer/booking/make-recurring',
    DISPUTES: '/customer/disputes',
    DISPUTE_DETAIL: '/customer/dispute/[id]',
    CHAT: '/customer/chat/[id]',
    // BUG-PHASE81-01 fix (same dead-route pattern as CRIT-80) — pre-fix
    // this pointed at '/customer/wallet' which has no corresponding
    // file. The (tabs)/wallet.tsx "+ Top Up" button uses this route
    // and so navigated to a dead screen. The actual file is
    // wallet-topup.tsx; point at it directly so the link works and
    // matches the button label.
    WALLET: '/customer/wallet-topup',
    // BUG-PHASE64-05 fix (CRIT-80 from 2026-05-01 audit) — pre-fix this
    // pointed at '/customer/settings', which has no corresponding file.
    // The profile.tsx menu row labelled "Notification Settings" used
    // this route and so navigated to a dead screen. The actual file
    // is notification-settings.tsx; point at it directly so the link
    // works and matches the menu label.
    SETTINGS: '/customer/notification-settings',
    NOTIFICATIONS: '/customer/notifications',
    PROVIDER_PROFILE: '/customer/provider/[id]',
    RECURRING_BOOKINGS: '/customer/recurring',
    RECURRING_DETAIL: '/customer/recurring/[id]',
    // D27 Phase 5 — projects (big multi-stage jobs).
    PROJECTS: '/customer/projects',
    PROJECT_DETAIL: '/customer/projects/[id]',
    PROJECT_NEW: '/customer/projects/new',
    SAFETY: '/customer/safety-and-support',
    SUKI_PROS: '/customer/suki-pros',
    ADDRESS_PICKER: '/customer/address-picker',
    ADDRESSES: '/customer/addresses',
    PAYMENT_METHODS: '/customer/payment-methods',
    REFERRAL: '/customer/referral',
    HELP: '/customer/help',
    TERMS: '/customer/terms',
    ACCOUNT_MANAGEMENT: '/customer/account-management',
    // BUG-PHASE126-01 — pre-fix this block had 24 entries pointing at
    // screens that don't exist on disk and have no consumers anywhere
    // in the app (verified 2026-05-05 via grep across apps/mobile/app
    // + apps/mobile/src for both `Routes.CUSTOMER.X` form and raw
    // `'/customer/...'` literals — zero hits). The file's own header
    // claims "single source of truth"; entries that 404 contradict
    // that contract and would crash any future caller that wired
    // them. Removed:
    //   SUBCATEGORY, RATE_REVIEW, PROFILE,
    //   PROVIDER_LIST, RECURRING_SETUP, BUSINESS_*  (8 entries),
    //   SERVICE_AREAS, SERVICE_AREA_DETAIL, WAITLIST, REBOOKING,
    //   SLOT_WAITLIST, DATA_PRIVACY, DATA_EXPORT, ACCOUNT_DELETION,
    //   SECURITY_SETTINGS, DEVICE_MANAGEMENT, ACCESSIBILITY_SETTINGS,
    //   ADD_ADDRESS, ADD_PAYMENT, PROMOTIONS, SUPPORT, EMAIL_VERIFICATION.
    // If a v1.1+ feature genuinely needs one of these, add the
    // route entry back AT THE SAME TIME as the screen .tsx file.
  },

  PROVIDER: {
    JOB_DETAIL: '/provider/job/[id]',
    DISPUTES: '/provider/disputes',
    DISPUTE_DETAIL: '/provider/dispute/[id]',
    JOB_NAVIGATE: '/provider/job/[id]/navigate',
    CHAT: '/provider/chat/[id]',
    // D27 Phase 1 — open custom-quote requests (leads) the provider can quote.
    LEADS: '/provider/leads',
    JOB_COMPLETE: '/provider/job/[id]/complete',
    JOB_CHECKLIST: '/provider/job/[id]/checklist',
    JOB_PHOTOS: '/provider/job/[id]/photos',
    JOB_CHANGE_ORDER: '/provider/job/[id]/change-order',
    QUOTE_BUILDER: '/provider/job/[id]/quote',
    // BUG-PHASE82-01 fix — pre-fix the path was '/provider/job/[id]/active'
    // but the actual file is /provider/job/active.tsx (a literal route,
    // not a sub-route under [id]). The screen reads bookingId from a
    // query param, so callers should use the literal path with ?bookingId=...
    // No current consumers, but the wrong path is a landmine for any
    // future caller that uses this constant.
    ACTIVE_JOB: '/provider/job/active',
    SCHEDULE: '/provider/schedule',
    SETTINGS: '/provider/settings',
    REVIEWS: '/provider/reviews',
    // BUG-PHASE81-02 fix — pre-fix the path was '/provider/service-areas'
    // (plural) but the actual file is service-area.tsx (singular). No
    // current consumers, but leaving the wrong path is a landmine for
    // future code that calls Routes.PROVIDER.SERVICE_AREAS expecting
    // it to work. Renamed key to SERVICE_AREA to match the file.
    SERVICE_AREA: '/provider/service-area',
    // In-app quality standards / community guidelines.
    STANDARDS: '/provider/standards',
    // D27 Phase 7 — provider CRM: the provider's client book.
    CLIENTS: '/provider/clients',
    // D27 Phase 7b — CRM depth.
    CLIENT_DETAIL: '/provider/clients/[id]',
    REMINDERS: '/provider/reminders',
    QUOTE_TEMPLATES: '/provider/quote-templates',
    INSIGHTS: '/provider/insights',
    NOTIFICATIONS: '/provider/notifications',
    NOTIFICATION_SETTINGS: '/provider/notification-settings',
    SERVICES: '/provider/services',
    CALENDAR: '/provider/calendar',
    AVAILABILITY: '/provider/availability',
    PORTFOLIO: '/provider/portfolio',
    CERTIFICATIONS: '/provider/certifications',
    TEAM: '/provider/team',
    PAYOUTS: '/provider/payouts',
    PAYOUT_SETTINGS: '/provider/payout-settings',
    SUKI_CUSTOMERS: '/provider/suki-customers',
    HELP: '/provider/help',
    TIER_PROGRESSION: '/provider/tier-progression',
    WITHDRAW: '/provider/withdraw',
    ACCOUNT_MANAGEMENT: '/provider/account-management',
    // BUG-PHASE126-01 — pre-fix this block had 8 entries pointing at
    // non-existent screens with no consumers anywhere in the app.
    // Removed (verified 2026-05-05): HOME, WALLET, EARNINGS,
    // EARNINGS_GOALS, DEMAND_INSIGHTS, MONTHLY_SUMMARY, RECEIPT,
    // MATERIALS_LIST, PROFILE.
    // Note: provider's earnings tab lives at PROVIDER_TABS.EARNINGS
    // (/(provider-tabs)/earnings); provider-profile is
    // PROVIDER_TABS.PROVIDER_PROFILE — both tabs, not standalone screens.
  },

  // Shared in-app support inbox/thread, reachable by both customer and
  // provider (app/support group). Added with the screens, per the
  // "add the route entry at the same time as the screen" rule above.
  SUPPORT: {
    INBOX: '/support',
    NEW: '/support/new',
    THREAD: '/support/[id]',
  },

  // D23 — team member ("provider_staff") scoped area.
  STAFF: {
    JOBS: '/staff/jobs',
    INVITES: '/staff/invites',
    JOB_DETAIL: '/staff/job/[id]',
    JOB_CHECKLIST: '/staff/job/[id]/checklist',
    JOB_COMPLETE: '/staff/job/[id]/complete',
  },

  PROVIDER_ONBOARDING: {
    ROLE_SELECT: '/provider-onboarding/role-select',
    CATEGORIES: '/provider-onboarding/categories',
    SERVICE_AREA: '/provider-onboarding/service-area',
    VETTING: '/provider-onboarding/vetting',
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
