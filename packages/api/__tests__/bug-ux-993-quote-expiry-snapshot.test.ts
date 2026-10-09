type SchedulerProcessor = (job: { name: string }) => Promise<Record<string, unknown>>;

let mockSchedulerProcessor: SchedulerProcessor | undefined;
const mockQueueAdd = jest.fn().mockResolvedValue(undefined);
const mockDbQuery = jest.fn();
const mockGetQuotePolicy = jest.fn().mockResolvedValue({ expiryHours: 1, maxPerBooking: 5 });
const mockNotify = jest.fn().mockResolvedValue({ id: 'quote-expired-notification' });

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    getRepeatableJobs: jest.fn().mockResolvedValue([]),
    removeRepeatableByKey: jest.fn().mockResolvedValue(undefined),
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
  getQuotePolicy: (...args: unknown[]) => mockGetQuotePolicy(...args),
}));
jest.mock('../src/services/notification.service', () => ({
  createPushNotification: (...args: unknown[]) => mockNotify(...args),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import '../src/jobs/workers';

it('Bug UX-993 — quote expiry worker honors each submitted quote snapshot instead of later settings', async () => {
  mockDbQuery
    .mockResolvedValueOnce({
      rows: [{ id: 'quote-1', booking_id: 'booking-1', provider_id: 'provider-1' }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({ rows: [{ user_id: 'provider-user-1' }], rowCount: 1 });

  expect(mockSchedulerProcessor).toBeDefined();
  await expect(mockSchedulerProcessor!({ name: 'expire-quotes' })).resolves.toEqual({ expired: 1 });

  expect(mockDbQuery.mock.calls[0]![0]).toMatch(
    /UPDATE booking_quotes[\s\S]*status = 'submitted'[\s\S]*expires_at < NOW\(\)/,
  );
  expect(mockDbQuery.mock.calls[0]).toHaveLength(1);
  expect(mockDbQuery.mock.calls[0]![0]).not.toMatch(/created_at|INTERVAL/);
  expect(mockGetQuotePolicy).not.toHaveBeenCalled();
  expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
    userId: 'provider-user-1',
    type: 'quote_expired',
    data: { bookingId: 'booking-1', quoteId: 'quote-1' },
  }));
  expect(mockQueueAdd).not.toHaveBeenCalled();
});
