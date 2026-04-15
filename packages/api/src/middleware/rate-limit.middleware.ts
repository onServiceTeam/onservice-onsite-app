import rateLimit from 'express-rate-limit';
import { platformConfig } from '../config/platform.config';

export const rateLimitMiddleware = rateLimit({
  windowMs: platformConfig.rateLimitWindowMs,
  max: platformConfig.rateLimitMaxRequests,
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
