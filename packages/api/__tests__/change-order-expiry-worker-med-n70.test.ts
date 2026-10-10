type SchedulerProcessor = (job: { name: string }) => Promise<Record<string, unknown>>;

let mockSchedulerProcessor: SchedulerProcessor | undefined;
const mockQueueAdd = jest.fn().mockResolvedValue(undefined);
const mockGetRepeatableJobs = jest.fn().mockResolvedValue([]);
const mockRemoveRepeatableByKey = jest.fn().mockResolvedValue(undefined);
const mockScheduledExpire = jest.fn().mockResolvedValue(3);
const mockDbQuery = jest.fn();
const mockCreatePushNotification = jest.fn().mockResolvedValue({ id: 'notification-med-n70' });

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    getRepeatableJobs: mockGetRepeatableJobs,
    removeRepeatableByKey: mockRemoveRepeatableByKey,
  })),
  Worker: jest.fn().mockImplementation((_name: string, processor: SchedulerProcessor) => {
    mockSchedulerProcessor = processor;
    return { on: jest.fn() };
  }),
}));
jest.mock('../src/config/redis.config', () => ({ bullMqConnection: {} }));
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => mockDbQuery(...args), transaction: jest.fn() },
}));
jest.mock('../src/services/settings.service', () => ({
  getSettingNumber: jest.fn().mockResolvedValue(6),
}));
jest.mock('../src/services/notification.service', () => ({
  createPushNotification: (...args: unknown[]) => mockCreatePushNotification(...args),
}));
jest.mock('../src/services/booking.service', () => {
  const actual = jest.requireActual('../src/services/booking.service') as object;
  return {
    ...actual,
    expireApprovedChangeOrders: (...args: unknown[]) => mockScheduledExpire(...args),
  };
});
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { initScheduledJobs } from '../src/jobs/workers';

const actualBookingService = jest.requireActual('../src/services/booking.service') as typeof import('../src/services/booking.service');

it('MED-N70 - approved change orders expire by configured age, notify both parties, and run hourly', async () => {
  mockDbQuery
    .mockResolvedValueOnce({
      rows: [{
        id: 'change-order-med-n70',
        booking_id: 'booking-med-n70',
        provider_id: 'provider-med-n70',
        additional_amount: 25_000,
      }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({
      rows: [{
        customer_id: 'customer-med-n70',
        provider_user_id: 'provider-user-med-n70',
      }],
      rowCount: 1,
    });

  const expired = await actualBookingService.expireApprovedChangeOrders();

  expect(expired).toBe(1);
  expect(mockDbQuery.mock.calls[0]![0]).toMatch(
    /UPDATE change_orders[\s\S]*status = 'expired'[\s\S]*customer_responded_at < NOW\(\) - make_interval\(hours => \$1\)/,
  );
  expect(mockDbQuery.mock.calls[0]![1]).toEqual([6]);
  expect(mockCreatePushNotification).toHaveBeenCalledWith(expect.objectContaining({
    userId: 'customer-med-n70',
    type: 'change_order_expired',
    data: { bookingId: 'booking-med-n70', changeOrderId: 'change-order-med-n70' },
  }));
  expect(mockCreatePushNotification).toHaveBeenCalledWith(expect.objectContaining({
    userId: 'provider-user-med-n70',
    type: 'change_order_expired',
    data: { bookingId: 'booking-med-n70', changeOrderId: 'change-order-med-n70' },
  }));

  expect(mockSchedulerProcessor).toBeDefined();
  const workerResult = await mockSchedulerProcessor!({ name: 'change-order-expire' });
  await initScheduledJobs();

  expect(mockScheduledExpire).toHaveBeenCalledTimes(1);
  expect(workerResult).toEqual({ changeOrdersExpired: 3 });
  expect(mockQueueAdd).toHaveBeenCalledWith('change-order-expire', {}, {
    repeat: { pattern: '0 * * * *' },
    removeOnComplete: 30,
    removeOnFail: 30,
  });
});
