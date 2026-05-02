// Phase 16 fix — explicitly load dotenv at module-load time.
// tsx's auto-injection happens AFTER module imports evaluate (verified
// 2026-05-03 by adding a console.log of process.env.REDIS_URL at the
// top of this file — saw `undefined` even though tsx logged "injected
// env (29)"). The result was that this file always saw default
// localhost:6379 regardless of REDIS_URL/REDIS_HOST/REDIS_PORT in .env.
// Loading dotenv synchronously here forces env to be ready before
// the Redis client is constructed below.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '..', '..', '.env') });

import Redis, { RedisOptions } from 'ioredis';
import { logger } from '../utils/logger';

// Phase 16 fix — support REDIS_URL (e.g.
// `redis://user:pass@host:port/db`) as the canonical way to point
// at non-default Redis instances. Falls back to REDIS_HOST/REDIS_PORT
// for environments that prefer them. Pre-fix the URL was silently
// ignored and any non-default port required setting REDIS_HOST +
// REDIS_PORT separately.
const redisUrl = process.env.REDIS_URL;

const redisOptions: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  retryStrategy: (times: number): number | null => {
    if (times > 10) {
      logger.error('Redis connection failed after 10 retries');
      return null;
    }
    return Math.min(times * 200, 5000);
  },
};

export const redis = redisUrl
  ? new Redis(redisUrl, redisOptions)
  : new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
      ...redisOptions,
    });

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (err) => {
  logger.error('Redis connection error', { error: err.message });
});

// BullMQ wants explicit host/port. Parse REDIS_URL when set.
function parseBullConnection(): { host: string; port: number } {
  if (redisUrl) {
    try {
      const u = new URL(redisUrl);
      return {
        host: u.hostname || 'localhost',
        port: u.port ? Number(u.port) : 6379,
      };
    } catch {
      // malformed URL — fall through to host/port env vars
    }
  }
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
  };
}

export const bullMqConnection = parseBullConnection();
