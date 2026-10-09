type Processor = (job: { name: string; data?: Record<string, unknown> }) => Promise<Record<string, unknown>>;
let mockProcessor: Processor;
const mockAdd = jest.fn().mockResolvedValue(undefined);
const mockInfo = jest.fn();
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: mockAdd,
    getRepeatableJobs: jest.fn().mockResolvedValue([]), removeRepeatableByKey: jest.fn() })),
  Worker: jest.fn().mockImplementation((_name: string, processor: Processor) => {
    mockProcessor = processor; return { on: jest.fn() };
  }),
}));
jest.mock('../src/config/redis.config', () => ({ bullMqConnection: {} }));
jest.mock('../src/utils/logger', () => ({ logger: {
  info: (...args: unknown[]) => mockInfo(...args), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
} }));

import { initScheduledJobs } from '../src/jobs/workers';
import * as cleanup from '../src/services/email-link-cleanup.service';
import * as signInCleanup from '../src/services/email-sign-in-cleanup.service';

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

it('email-link cleanup uses the existing scheduler with a fixed bounded invocation and private count-only result', async () => {
  const result = { proofsExpired: 100, requestsPurged: 100 };
  const purge = jest.spyOn(cleanup, 'cleanupEmailLinkChallenges').mockResolvedValue(result);
  const signInPurge = jest.spyOn(signInCleanup, 'cleanupEmailSignInChallenges').mockResolvedValue(result);
  await initScheduledJobs();
  expect(mockAdd.mock.calls.filter(call => call[0] === 'email-link-cleanup')).toEqual([
    ['email-link-cleanup', {}, { repeat: { pattern: '*/5 * * * *' }, attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 }, removeOnComplete: 30, removeOnFail: 100 }],
  ]);
  expect(await mockProcessor({ name: 'email-link-cleanup', data: {
    limit: 999999, before: '2999-01-01', email: 'private@example.invalid',
  } })).toEqual({ emailLinkCleanup: result, emailSignInCleanup: result });
  expect(purge).toHaveBeenCalledTimes(1);
  expect(purge).toHaveBeenCalledWith(100);
  expect(signInPurge).toHaveBeenCalledTimes(1);
  expect(signInPurge).toHaveBeenCalledWith(100);
  expect(mockInfo).toHaveBeenLastCalledWith('Scheduler job completed', {
    name: 'email-link-cleanup', results: { emailLinkCleanup: result, emailSignInCleanup: result },
  });
  expect(JSON.stringify(mockInfo.mock.calls)).not.toContain('private@example.invalid');
});

it('email-link cleanup failure propagates without logging a false scheduler completion', async () => {
  const failure = new Error('Synthetic database failure');
  jest.spyOn(cleanup, 'cleanupEmailLinkChallenges').mockRejectedValue(failure);
  await expect(mockProcessor({ name: 'email-link-cleanup' })).rejects.toBe(failure);
  expect(mockInfo).not.toHaveBeenCalledWith('Scheduler job completed', expect.anything());
});

it('email sign-in cleanup failure remains a failed job even after link cleanup committed', async () => {
  jest.spyOn(cleanup, 'cleanupEmailLinkChallenges').mockResolvedValue({ proofsExpired: 0, requestsPurged: 0 });
  const failure = new Error('Synthetic sign-in cleanup failure');
  jest.spyOn(signInCleanup, 'cleanupEmailSignInChallenges').mockRejectedValue(failure);
  await expect(mockProcessor({ name: 'email-link-cleanup' })).rejects.toBe(failure);
  expect(mockInfo).not.toHaveBeenCalledWith('Scheduler job completed', expect.anything());
});
