import { Queue } from 'bullmq';
import { logger } from '../utils/logger';
// Phase 16 fix — pre-fix this file duplicated the REDIS_HOST/PORT
// env-var read, ignoring REDIS_URL. Use the shared bullMqConnection
// from redis.config so all BullMQ queues + the jobs/workers use one
// canonical place to derive the connection.
import { bullMqConnection } from '../config/redis.config';

export const notificationQueue = new Queue('notifications', { connection: bullMqConnection });
export const smsQueue = new Queue('sms', { connection: bullMqConnection });
export const payoutQueue = new Queue('payouts', { connection: bullMqConnection });
export const bookingQueue = new Queue('bookings', { connection: bullMqConnection });

logger.info('BullMQ queues initialized');
