import rateLimit from 'express-rate-limit';
import { platformConfig } from '../config/platform.config';
import * as settingsService from '../services/settings.service';
import { logger } from '../utils/logger';

// Phase 03: rate-limit middleware reads tunable values from settings service,
// but rate-limit's options must be sync at construction. We use a periodic
// refresh pattern: cache the most recent values and use them in the limiter
// callbacks; refresh from settings service every 60s.
let currentWindow: number = platformConfig.rateLimitWindowMs;
let currentMax: number = platformConfig.rateLimitMaxRequests;

async function refreshRateLimits(): Promise<void> {
  try {
    currentWindow = await settingsService.getSettingInteger('rate_limit_window_ms');
    currentMax = await settingsService.getSettingInteger('rate_limit_max_requests');
  } catch (err) {
    logger.warn('Rate-limit settings refresh failed; keeping current values', {
      error: (err as Error).message,
    });
  }
}

void refreshRateLimits();
setInterval(() => { void refreshRateLimits(); }, 60_000).unref();

export const rateLimitMiddleware = rateLimit({
  windowMs: currentWindow,
  max: currentMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message: 'Too many requests. Please try again later.',
      statusCode: 429,
    },
  },
});
