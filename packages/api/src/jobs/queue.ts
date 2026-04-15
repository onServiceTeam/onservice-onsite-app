import { Queue } from 'bullmq';
import { logger } from '../utils/logger';
import { bullMqConnection } from '../config/redis.config';

export const notificationQueue = new Queue('notifications', { connection: bullMqConnection });
export const smsQueue = new Queue('sms', { connection: bullMqConnection });
export const payoutQueue = new Queue('payouts', { connection: bullMqConnection });
export const bookingQueue = new Queue('bookings', { connection: bullMqConnection });

logger.info('BullMQ queues initialized');
