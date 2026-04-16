import { Queue } from 'bullmq';
import { logger } from '../utils/logger';

const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
};

export const notificationQueue = new Queue('notifications', { connection: redisConnection });
export const smsQueue = new Queue('sms', { connection: redisConnection });
export const payoutQueue = new Queue('payouts', { connection: redisConnection });
export const bookingQueue = new Queue('bookings', { connection: redisConnection });

logger.info('BullMQ queues initialized');
