/**
 * Phase 03 — Mobile-side runtime config bridge.
 *
 * Fetches the public /api/v1/config bundle so the mobile app can mirror the
 * admin-controlled values when online. Always falls back to the hardcoded
 * `platformConfig` defaults so the app works fully offline.
 *
 * Out of scope for Phase 03: rewriting every screen to use `getConfig()`.
 * Existing `import { platformConfig } from '@/config/platform.config'` calls
 * remain functional.
 */

import axios from 'axios';
import { platformConfig } from '@/config/platform.config';

export type Config = Record<string, unknown> & typeof platformConfig;

let cachedConfig: Config = platformConfig as Config;
let lastFetchedAt = 0;

interface RemoteConfigResponse {
  success: boolean;
  data?: {
    appVersion?: string;
    currency?: string;
    currencySymbol?: string;
    timezone?: string;
    serviceFeeRate?: number;
    serviceFeeMin?: number;
    serviceFeeMax?: number;
    escrowAutoConfirmHours?: number;
    escrowDisputeWindowHours?: number;
    otpLength?: number;
    otpCooldownSeconds?: number;
    minimumPaymentAmount?: number;
    minimumWithdrawalAmount?: number;
    quoteExpiryHours?: number;
    maxQuotesPerBooking?: number;
    maxServiceRadiusKm?: number;
  };
}

/**
 * Fetch the public client-config bundle and merge over the hardcoded defaults.
 * Errors are swallowed — the cached/default config is returned unchanged.
 */
export async function fetchPlatformConfig(): Promise<Config> {
  const baseUrl = platformConfig.apiUrl;
  try {
    const res = await axios.get<RemoteConfigResponse>(`${baseUrl}/api/v1/config`, {
      timeout: 5000,
    });
    const remote = res.data?.data ?? {};
    cachedConfig = {
      ...platformConfig,
      appVersion: remote.appVersion ?? platformConfig.appVersion,
      currency: remote.currency ?? platformConfig.currency,
      currencySymbol: remote.currencySymbol ?? platformConfig.currencySymbol,
      timezone: remote.timezone ?? platformConfig.timezone,
      serviceFeeRate: remote.serviceFeeRate ?? platformConfig.serviceFeeRate,
      minimumServiceFee: remote.serviceFeeMin ?? platformConfig.minimumServiceFee,
      maximumServiceFee: remote.serviceFeeMax ?? platformConfig.maximumServiceFee,
      escrowAutoConfirmHours: remote.escrowAutoConfirmHours ?? platformConfig.escrowAutoConfirmHours,
      escrowDisputeWindowHours:
        remote.escrowDisputeWindowHours ?? platformConfig.escrowDisputeWindowHours,
      otpLength: remote.otpLength ?? platformConfig.otpLength,
      otpCooldownSeconds: remote.otpCooldownSeconds ?? platformConfig.otpCooldownSeconds,
      quoteExpiryHours: remote.quoteExpiryHours ?? platformConfig.quoteExpiryHours,
      maxQuotesPerBooking: remote.maxQuotesPerBooking ?? platformConfig.maxQuotesPerBooking,
      maxServiceRadius: remote.maxServiceRadiusKm ?? platformConfig.maxServiceRadius,
    } as Config;
    lastFetchedAt = Date.now();
  } catch {
    // Silent fallback — keep last successful (or hardcoded) values.
  }
  return cachedConfig;
}

/**
 * Synchronous accessor for the merged config.
 * Returns the last successfully fetched config or the hardcoded defaults.
 */
export function getConfig(): Config {
  return cachedConfig;
}

/**
 * Diagnostic — when did the last successful fetch happen (epoch ms, 0 if never).
 */
export function getConfigLastFetchedAt(): number {
  return lastFetchedAt;
}
