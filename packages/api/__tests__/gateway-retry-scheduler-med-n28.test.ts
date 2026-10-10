type SchedulerProcessor = (job: { name: string }) => Promise<Record<string, unknown>>;

let mockSchedulerProcessor: SchedulerProcessor | undefined;
const mockQueueAdd = jest.fn().mockResolvedValue(undefined);
const mockGetRepeatableJobs = jest.fn().mockResolvedValue([]);
const mockRemoveRepeatableByKey = jest.fn().mockResolvedValue(undefined);
const mockProcessRetries = jest.fn().mockResolvedValue({
  attempted: 2,
  succeeded: 1,
  failedAndRetrying: 1,
  failedPermanent: 0,
});

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
jest.mock('../src/services/gateway-retry.service', () => ({
  processRetries: (...args: unknown[]) => mockProcessRetries(...args),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { initScheduledJobs } from '../src/jobs/workers';

it('MED-N28 - the scheduler executes gateway retries in bounded batches every five minutes', async () => {
  expect(mockSchedulerProcessor).toBeDefined();

  const result = await mockSchedulerProcessor!({ name: 'gateway-retry' });
  await initScheduledJobs();

  expect(mockProcessRetries).toHaveBeenCalledWith(25);
  expect(result).toEqual({
    gatewayRetry: {
      attempted: 2,
      succeeded: 1,
      failedAndRetrying: 1,
      failedPermanent: 0,
    },
  });
  expect(mockQueueAdd).toHaveBeenCalledWith('gateway-retry', {}, {
    repeat: { pattern: '*/5 * * * *' },
    removeOnComplete: 30,
    removeOnFail: 30,
  });
});
