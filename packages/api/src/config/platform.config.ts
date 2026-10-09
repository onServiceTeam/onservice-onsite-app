/**
 * Platform configuration — ALL configurable business values.
 * Never hardcode commission rates, fees, timeouts, etc. in code.
 * Reference this config everywhere.
 */
export const platformConfig = {
  appVersion: '0.1.0',
  appName: 'onService',

  // --- Commission Rates by Provider Tier ---
  // MED-N32 fix: 'founding' tier added (migration 073 introduced
  // it). These values identify the canonical tier set and seed defaults.
  // Money paths resolve immutable, effective-dated agreements from
  // commission_rate_versions; they must never calculate from this map.
  commissionRates: {
    founding: 0.10,   // 10% — invite-only batch tier (DECISION-003)
    new: 0.15,        // 15% for new providers
    verified: 0.13,   // 13% for verified providers
    pro: 0.11,        // 11% for pro providers
    elite: 0.09,      // 9% for elite providers
  } as Record<string, number>,

  // --- Service Fees ---
  // No customer service fee (Ken, 2026-06-28; mig 137). This is the sync
  // fallback used when a settings read fails, so it must be 0 too.
  serviceFeeRate: 0,              // no customer service fee
  guaranteeFundRate: 0.015,       // 1.5% to guarantee fund
  minimumServiceFee: 0,           // no customer service fee floor
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
  // Internal verified-email linking uses hard account/recipient/IP limits.
  // No relaxed-test bypass; public enablement is a separate acceptance step.
  emailLinkRequestsPerHour: 5,
  emailSignInRequestsPerHour: 5,
  // Engineering default aligned with existing login-attempt metadata, not a
  // legal retention approval. Expired proof hashes clear on the next batch;
  // this longer window applies only to request metadata, never usable codes.
  emailLinkRequestRetentionDays: 90,
  emailSignInRequestRetentionDays: 90,

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

  // Test-mode switch — when on, the global + auth rate limiters and the OTP
  // brute-force lockout are relaxed so QA testers don't get "Too many attempts"
  // mid-test. HARD-GATED on NODE_ENV: it can NEVER take effect in production,
  // so a stray RATE_LIMITS_RELAXED env on a real box cannot disable brute-force
  // protection. Set RATE_LIMITS_RELAXED=1 only on a staging/test box. Remove at
  // the production cutover.
  rateLimitsRelaxed:
    process.env.RATE_LIMITS_RELAXED === '1' && process.env.NODE_ENV !== 'production',

  // --- JWT ---
  jwtExpiresIn: '15m',              // Short-lived access token (15 minutes)
  jwtExpiresInByRole: {
    customer: '15m',
    provider: '15m',
    admin: '15m',
    super_admin: '15m',
    dpo: '15m',
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
  // MED-N62 fix: independent IP-level OTP-failure threshold so an
  // attacker rotating across phones from one IP can't evade per-phone
  // lockout. Set to 2x the highest per-phone threshold.
  ipOtpLockoutThreshold: 20,
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

  // --- INS-002 (SiguradoShield) NOT WIRED for v1.0 ---
  // The in-house insurance product is deferred to v1.1+ pending Insurance
  // Commission license OR licensed-insurer partnership. The peso-amount
  // coverage / deductible / claim-window constants previously here have been
  // removed. No service multiplied a booking total by an insurance premium
  // and no payout subtracted a deductible — the "wiring" was UI copy only,
  // and the UI surfaces have been pulled in customer mobile (Bugs 1168, 860,
  // 889, 920, 538, 983, 686, 834).
  //
  // Do NOT reintroduce an `insurance` block here without:
  //   1. Lifting LAUNCH-LIMITATIONS §23.
  //   2. Securing PH Insurance Commission license + underwriter capital, OR
  //      a partnership with a licensed insurer with explicit rep-agent terms.
  //   3. Building the claims pipeline (POST /claims, settlement, KYC).
  //
  // Bug 1168 + Phase 14 Dispatch 04. See .ai-coder/decisions/D04-siguradoshield.md.
} as const;

export type PlatformConfig = typeof platformConfig;
