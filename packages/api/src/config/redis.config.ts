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
//
// Phase 200 fix — CRITICAL: this previously returned ONLY host + port and
// dropped the password. When Redis runs with `requirepass` (as in production),
// every BullMQ queue and worker connected unauthenticated and failed with
// "NOAUTH Authentication required" — so the entire background-job system was
// down: the scheduler worker (offer-cascade sweep / re-kick, NBI-expiry
// checks, recurring auto-charges) plus the notification/SMS/payout queues
// never ran. The offer sweep being dead meant auto-dispatch stalled after the
// first provider's 45s offer expired (no re-kick to the next provider). Now we
// carry the password (and username, if any) through from REDIS_URL or the
// REDIS_PASSWORD env var so BullMQ authenticates like the main client does.
export interface BullConnection {
  host: string;
  port: number;
  password?: string;
  username?: string;
}

export function parseBullConnection(
  url: string | undefined = redisUrl,
  env: NodeJS.ProcessEnv = process.env,
): BullConnection {
  if (url) {
    try {
      const u = new URL(url);
      const conn: BullConnection = {
        host: u.hostname || 'localhost',
        port: u.port ? Number(u.port) : 6379,
      };
      if (u.password) conn.password = decodeURIComponent(u.password);
      // Redis `requirepass` uses the implicit "default" user; only forward an
      // explicit non-default username to avoid breaking password-only auth.
      if (u.username && u.username !== 'default') conn.username = decodeURIComponent(u.username);
      return conn;
    } catch {
      // malformed URL — fall through to host/port env vars
    }
  }
  const conn: BullConnection = {
    host: env.REDIS_HOST || 'localhost',
    port: Number(env.REDIS_PORT) || 6379,
  };
  if (env.REDIS_PASSWORD) conn.password = env.REDIS_PASSWORD;
  return conn;
}

export const bullMqConnection = parseBullConnection();
