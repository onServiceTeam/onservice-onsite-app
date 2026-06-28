/**
 * Platform configuration — ALL configurable business values.
 * Never hardcode commission rates, fees, timeouts, etc. in code.
 * Reference this config everywhere.
 */
// Phase D CRIT-82 fix — apiUrl no longer silently defaults to
// localhost. Pre-fix: a release build that forgot to set
// EXPO_PUBLIC_API_URL would point at http://localhost:7381 — every
// API call would fail with a connection refused, but the user
// would just see "something went wrong" toasts. Post-fix: in
// production we throw at module load if the env var is missing
// (preventing the broken build from booting at all). In dev/test
// the localhost fallback is preserved.
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  // Production builds MUST have the env var set.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'EXPO_PUBLIC_API_URL is required for production builds. ' +
        'Set it in your build profile (eas.json or app.config.ts extra).',
    );
  }
  // Dev / test fallback — local docker-compose API on 7381.
  return 'http://localhost:7381';
}

export const platformConfig = {
  appVersion: '0.1.0',
  appName: 'onService',
  apiUrl: resolveApiUrl(),

  currency: 'PHP' as const,
  currencySymbol: '₱',
  currencyLocale: 'en-PH',

  timezone: 'Asia/Manila',

  // Phase K MED-K20 fix — 'founding' tier added (matches migration 073
  // CHECK constraint and platform_settings commission_rate_founding=10%).
  // The 5 tiers are: founding, new, verified, pro, elite.
  commissionRates: {
    founding: 0.10,
    new: 0.15,
    verified: 0.13,
    pro: 0.11,
    elite: 0.09,
  } as Record<string, number>,

  // No customer platform fee (Ken, 2026-06-28). The live value still comes from
  // /api/v1/config (service_fee_rate setting, currently 0), so this is only the
  // cold-start / offline default — set to 0 so the customer never sees a fee
  // flash before config loads. Re-enabling a fee is an admin Settings change.
  serviceFeeRate: 0,
  guaranteeFundRate: 0.015,
  minimumServiceFee: 0,
  maximumServiceFee: 50000,

  // Cancellation policy (Bug 1170/1198 fix, Phase 14 Dispatch 02): the tier
  // values now live on the server in cancellation_policies (admin-editable)
  // and are fetched via GET /api/v1/settings/cancellation-policy. Mobile
  // surfaces (terms.tsx, help.tsx) render the policy directly from that
  // endpoint — never reintroduce literal tier values here.

  escrowAutoConfirmHours: 24,
  escrowDisputeWindowHours: 48,

  otpLength: 6,
  otpExpiryMinutes: 5,
  otpMaxAttempts: 3,
  otpCooldownSeconds: 60,

  quoteExpiryHours: 48,
  maxQuotesPerBooking: 5,

  providerNoShowMinutes: 30,
  nbiExpiryWarningDays: 30,
  maxServiceRadius: 50,

  referralBonusDefault: 5000, // ₱50.00 in centavos

  // SiguradoShield (in-house insurance) NOT WIRED for v1.0.
  // Deferred to v1.1+ pending Insurance Commission license OR licensed-insurer
  // partnership. See LAUNCH-LIMITATIONS.md §23 and
  // .ai-coder/decisions/D04-siguradoshield.md (Ken — Option A — 2026-04-30).
  // Do NOT reintroduce siguradoShield* / propertyDamage* / premiumProtection /
  // shieldDeductible constants here without lifting LAUNCH-LIMITATIONS §23 first.
  // Bug 1168 — Phase 14 Dispatch 04.

  minimumPayoutThreshold: 10000, // ₱100.00 in centavos
  minimumQuoteAmount: 10000, // ₱100.00 in centavos
  minimumChangeOrderAmount: 100, // ₱1.00 in centavos
  minTopUp: 10000, // ₱100.00 in centavos
  maxTopUp: 5000000, // ₱50,000.00 in centavos

  sukiPointsPerPeso: 100, // 100 points = ₱1.00
  sukiMinRedeemPoints: 500,

  maxImageSizeMB: 10,
  maxImagesPerBooking: 10,
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'] as const,

  minimumWithdrawalAmount: 10000,
  withdrawalProcessingDays: 3,

  vatRate: 0.12,

  defaultPageSize: 20,
  maxPageSize: 100,
} as const;

export type PlatformConfig = typeof platformConfig;
