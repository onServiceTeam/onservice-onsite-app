type SchedulerProcessor = (job: { name: string }) => Promise<Record<string, unknown>>;

let schedulerProcessor: SchedulerProcessor | undefined;
const dbQueryMock = jest.fn();
const getNbiExpiryWarningDaysMock = jest.fn();

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    getRepeatableJobs: jest.fn(),
    removeRepeatableByKey: jest.fn(),
  })),
  Worker: jest.fn().mockImplementation((_name: string, processor: SchedulerProcessor) => {
    schedulerProcessor = processor;
    return { on: jest.fn() };
  }),
}));

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: jest.fn(),
  },
}));

jest.mock('../src/config/redis.config', () => ({ bullMqConnection: {} }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/settings.service', () => ({
  getNbiExpiryWarningDays: (...args: unknown[]) => getNbiExpiryWarningDaysMock(...args),
}));

import '../src/jobs/workers';

it('Bug UX-842 — the daily NBI worker uses the same admin warning window as provider status', async () => {
  getNbiExpiryWarningDaysMock.mockResolvedValueOnce(45);
  dbQueryMock.mockResolvedValueOnce({ rows: [] });

  const result = await schedulerProcessor!({ name: 'nbi-check' });

  expect(result).toEqual({ notified: 0 });
  expect(getNbiExpiryWarningDaysMock).toHaveBeenCalledTimes(1);
  expect(dbQueryMock).toHaveBeenCalledWith(
    expect.stringContaining("INTERVAL '1 day' * $1"),
    [45],
  );
});
