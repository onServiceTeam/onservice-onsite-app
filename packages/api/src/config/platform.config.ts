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
    new: 0.20,        // 20% for new providers
    verified: 0.18,   // 18% for verified providers
    pro: 0.15,        // 15% for pro providers
    elite: 0.12,      // 12% for elite providers
  } as Record<string, number>,

  // --- Service Fees ---
  serviceFeeRate: 0.05,           // 5% service fee charged to customer
  guaranteeFundRate: 0.015,       // 1.5% of service fee to guarantee fund
  minimumServiceFee: 2500,        // ₱25.00 minimum (stored in centavos)
  maximumServiceFee: 50000,       // ₱500.00 maximum (stored in centavos)

  // --- Cancellation Fees ---
  cancellationFees: {
    beforeMatch: 0,               // Free cancellation before provider match
    afterMatch: 0.05,             // 5% if cancelled after match
    afterPayment: 0.10,           // 10% if cancelled after payment
    afterEnRoute: 0.25,           // 25% if provider already en route
    noShow: 1.0,                  // 100% for customer no-show
  },

  // --- Escrow ---
  escrowAutoConfirmHours: 24,     // Auto-confirm after 24 hours
  escrowDisputeWindowHours: 24,   // Customer has 24h to dispute after completion

  // --- OTP ---
  otpLength: 6,
  otpExpiryMinutes: 5,
  otpMaxAttempts: 3,
  otpCooldownSeconds: 60,

  // --- Quotes ---
  quoteExpiryHours: 48,           // Quotes expire after 48 hours
  maxQuotesPerBooking: 5,         // Max providers who can quote

  // --- Provider ---
  providerNoShowMinutes: 30,      // No-show if not checked in within 30 min
  nbiExpiryWarningDays: 30,       // Warn 30 days before NBI clearance expires
  maxServiceRadius: 50,           // Maximum 50km provider service radius
  defaultServiceAreaRadius: 15,   // Default radius for new service areas (km)
  maxServiceAreaRadius: 50,       // Maximum radius for a service area (km)

  // --- Upload Limits ---
  maxImageSizeMB: 10,
  maxImagesPerBooking: 10,
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],

  // --- Wallet ---
  minimumWithdrawalAmount: 50000, // ₱500.00 minimum withdrawal (in centavos)
  withdrawalProcessingDays: 3,    // 3 business days to process

  // --- Rate Limiting ---
  rateLimitWindowMs: 15 * 60 * 1000,  // 15 minutes
  rateLimitMaxRequests: 100,

  // --- JWT ---
  jwtExpiresIn: '7d',
  jwtRefreshExpiresIn: '30d',

  // --- Tax ---
  vatRate: 0.12,                    // 12% Philippine VAT on services

  // --- Currency ---
  currency: 'PHP',
  currencySymbol: '₱',
  currencyLocale: 'en-PH',

  // --- Timezone ---
  timezone: 'Asia/Manila',

  // --- Pagination ---
  defaultPageSize: 20,
  maxPageSize: 100,

  // --- Security ---
  otpLockoutThresholds: [
    { failures: 5, lockoutMinutes: 15 },
    { failures: 10, lockoutMinutes: 60 },
    { failures: 20, lockoutMinutes: 1440 },
  ] as ReadonlyArray<{ failures: number; lockoutMinutes: number }>,
  captchaThreshold: 3,
  suspiciousIpThreshold: 50,
  loginAttemptRetentionDays: 90,
  adminSessionTimeoutHours: 8,

  // --- Cache TTLs (seconds) ---
  cacheTtl: {
    categories: 86400,
    subcategories: 86400,
    providerProfile: 1800,
    providerRating: 300,
    userProfile: 3600,
    bookingStatus: 300,
    searchResults: 300,
    serviceAreas: 3600,
  },
} as const;

export type PlatformConfig = typeof platformConfig;
