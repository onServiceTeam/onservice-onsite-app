/**
 * Platform configuration — ALL configurable business values.
 * Never hardcode commission rates, fees, timeouts, etc. in code.
 * Reference this config everywhere.
 */
export const platformConfig = {
  appVersion: '0.1.0',
  appName: 'onService',

  // --- Commission Rates by Provider Tier ---
  commissionRates: {
    new: 0.15,        // 15% for new providers
    verified: 0.13,   // 13% for verified providers
    pro: 0.11,        // 11% for pro providers
    elite: 0.09,      // 9% for elite providers
  } as Record<string, number>,

  // --- Service Fees ---
  serviceFeeRate: 0.10,           // 10% service fee charged to customer
  guaranteeFundRate: 0.015,       // 1.5% of service fee to guarantee fund
  minimumServiceFee: 2500,        // ₱25.00 minimum (stored in centavos)
  maximumServiceFee: 50000,       // ₱500.00 maximum (stored in centavos)

  // --- Cancellation policy ---
  // Bug 1170/1198 fix (Phase 14 Dispatch 02): cancellation tier values are
  // now server-canonical in the `cancellation_policies` table and admin-
  // editable via /admin/settings/cancellation-policy. Read them through
  // services/pricing/cancellation.service.ts — never reintroduce literal
  // tier values here.

  // --- Escrow ---
  escrowAutoConfirmHours: 24,     // Auto-confirm after 24 hours
  escrowDisputeWindowHours: 48,   // Customer has 48h to dispute after completion

  // --- OTP ---
  otpLength: 6,
  otpExpiryMinutes: 5,
  otpMaxAttempts: 3,
  otpCooldownSeconds: 60,

  // --- Quotes ---
  quoteExpiryHours: 48,           // Quotes expire after 48 hours
  maxQuotesPerBooking: 5,         // Max providers who can quote
  unmatchedBookingExpiryHours: 72, // Unmatched 'requested' bookings expire after 72 hours

  // --- Provider ---
  providerNoShowMinutes: 30,      // No-show if not checked in within 30 min
  minimumTimeOnSiteMinutes: 15,   // Provider must be on-site at least 15 min before marking complete
  providerCancellationWarningThreshold: 3,  // Warn provider after 3 cancellations in 30 days
  providerCancellationSuspendThreshold: 5,  // Auto-suspend after 5 cancellations in 30 days
  nbiExpiryWarningDays: 30,       // Warn 30 days before NBI clearance expires
  maxServiceRadius: 50,           // Maximum 50km service radius
  defaultServiceDurationMinutes: 120, // Default assumed service duration for conflict detection

  // --- Upload Limits ---
  maxImageSizeMB: 10,
  maxImagesPerBooking: 10,
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],

  // --- Wallet ---
  minimumWithdrawalAmount: 10000, // ₱100.00 minimum withdrawal (in centavos)
  withdrawalProcessingDays: 3,    // 3 business days to process
  minimumTopUpAmount: 10000,      // ₱100.00 minimum top-up (in centavos)
  maximumTopUpAmount: 5000000,    // ₱50,000.00 maximum top-up per transaction (in centavos)
  minimumPayoutThreshold: 10000,  // ₱100.00 minimum auto-payout threshold (in centavos)

  // --- Payments ---
  minimumPaymentAmount: 10000,    // ₱100.00 minimum payment (in centavos)
  minimumQuoteAmount: 10000,      // ₱100.00 minimum quote (in centavos)
  minimumChangeOrderAmount: 100,  // ₱1.00 minimum change order (in centavos)
  maximumTipAmount: 1000000,      // ₱10,000.00 maximum tip (in centavos)

  // --- Rate Limiting ---
  rateLimitWindowMs: 15 * 60 * 1000,  // 15 minutes
  rateLimitMaxRequests: 100,

  // --- JWT ---
  jwtExpiresIn: '15m',              // Short-lived access token (15 minutes)
  jwtExpiresInByRole: {
    customer: '15m',
    provider: '15m',
    admin: '15m',
    super_admin: '15m',
  } as Record<string, string>,
  jwtRefreshExpiresIn: '30d',

  // --- Currency ---
  currency: 'PHP',
  currencySymbol: '₱',
  currencyLocale: 'en-PH',

  // --- Timezone ---
  timezone: 'Asia/Manila',

  // --- Pagination ---
  defaultPageSize: 20,
  maxPageSize: 100,

  // --- Suki Loyalty Tiers ---
  sukiTiers: {
    new: { minBookings: 0, pointsPerPeso: 1, discount: 0 },
    regular: { minBookings: 3, pointsPerPeso: 1, discount: 0 },
    suki: { minBookings: 10, pointsPerPeso: 2, discount: 5 },
    super_suki: { minBookings: 25, pointsPerPeso: 3, discount: 10 },
  } as Record<string, { minBookings: number; pointsPerPeso: number; discount: number }>,
  sukiPointsRedemptionRate: 100,
  sukiTierUpBonusPoints: 500,

  // --- Cache TTL (seconds) ---
  cacheTtl: {
    categories: 3600,
    subcategories: 3600,
    providerProfile: 300,
    providerRating: 600,
    userProfile: 300,
    bookingStatus: 60,
    searchResults: 120,
    serviceAreas: 1800,
  },

  // --- VAT ---
  vatRate: 0.12,

  // --- Admin ---
  adminSessionTimeoutHours: 8,

  // --- Security ---
  otpLockoutThresholds: [
    { failures: 3, lockoutMinutes: 5 },
    { failures: 5, lockoutMinutes: 15 },
    { failures: 10, lockoutMinutes: 60 },
  ] as { failures: number; lockoutMinutes: number }[],
  captchaThreshold: 3,
  suspiciousIpThreshold: 10,
  loginAttemptRetentionDays: 90,

  // --- Service Areas ---
  defaultServiceAreaRadius: 25,

  // --- Socket.IO ---
  socketPingTimeoutMs: 60000,
  socketPingIntervalMs: 25000,

  // --- Invoicing ---
  invoiceDefaultDueTermsDays: 30,

  // --- Quality Score Weights ---
  qualityScoreWeights: {
    rating: 0.30,
    completion: 0.25,
    timeliness: 0.20,
    cancellation: 0.15,
    response: 0.10,
  },

  // --- No-Show Detection ---
  providerArrivalRadiusMeters: 200, // Provider must be within 200m to mark arrival
  customerNoShowMinutes: 30,     // Minutes customer must wait before declaring provider no-show

  // --- SiguradoShield™ Insurance Coverage (INS-002) ---
  insurance: {
    maxPropertyDamageCoverage: 2500000,   // ₱25,000
    maxTheftCoverage: 1000000,            // ₱10,000
    maxInjuryCoverage: 5000000,           // ₱50,000
    propertyDamageDeductible: 50000,      // ₱500 deductible for claims above ₱5,000
    claimWindowHours: 48,                 // Hours after service to file a claim
    guaranteeFundAlertThreshold: 500000,  // Alert admins when fund falls below ₱5,000
  },
} as const;

export type PlatformConfig = typeof platformConfig;
