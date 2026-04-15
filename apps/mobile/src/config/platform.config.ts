/**
 * Platform configuration — ALL configurable business values.
 * Never hardcode commission rates, fees, timeouts, etc. in code.
 * Reference this config everywhere.
 */
export const platformConfig = {
  appVersion: '0.1.0',
  appName: 'onService',
  apiUrl: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:7381',

  currency: 'PHP' as const,
  currencySymbol: '₱',
  currencyLocale: 'en-PH',

  timezone: 'Asia/Manila',

  commissionRates: {
    new: 0.20,
    verified: 0.18,
    pro: 0.15,
    elite: 0.12,
  } as Record<string, number>,

  serviceFeeRate: 0.05,
  guaranteeFundRate: 0.015,
  minimumServiceFee: 2500,
  maximumServiceFee: 50000,

  cancellationFees: {
    beforeMatch: 0,
    afterMatch: 0.05,
    afterPayment: 0.10,
    afterEnRoute: 0.25,
    noShow: 1.0,
  } as const,

  escrowAutoConfirmHours: 24,
  escrowDisputeWindowHours: 24,

  otpLength: 6,
  otpExpiryMinutes: 5,
  otpMaxAttempts: 3,
  otpCooldownSeconds: 60,

  quoteExpiryHours: 48,
  maxQuotesPerBooking: 5,

  providerNoShowMinutes: 30,
  nbiExpiryWarningDays: 30,
  maxServiceRadius: 50,

  maxImageSizeMB: 10,
  maxImagesPerBooking: 10,
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'] as const,

  minimumWithdrawalAmount: 50000,
  withdrawalProcessingDays: 3,

  vatRate: 0.12,

  defaultPageSize: 20,
  maxPageSize: 100,
} as const;

export type PlatformConfig = typeof platformConfig;
