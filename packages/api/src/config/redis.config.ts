import { Redis } from 'ioredis';
import { logger } from '../utils/logger';

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = Number(process.env.REDIS_PORT) || 7385;
const redisPassword = process.env.REDIS_PASSWORD || undefined;

const redisConfig = {
  host: redisHost,
  port: redisPort,
  password: redisPassword,
  maxRetriesPerRequest: null as null,
  enableReadyCheck: true,
  retryStrategy: (times: number): number | null => {
    if (times > 10) {
      logger.error('Redis connection failed after 10 retries');
      return null;
    }
    return Math.min(times * 200, 5000);
  },
};

export const redis = new Redis(redisConfig);

export const bullMqConnection = {
  host: redisHost,
  port: redisPort,
  password: redisPassword,
};

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (err: Error) => {
  logger.error('Redis connection error', { error: err.message });
});
