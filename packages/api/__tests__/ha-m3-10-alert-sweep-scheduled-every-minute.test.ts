// HA-M3-10 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API):
// the marketplace-alerts-sweep job is put on the scheduler to repeat every
// minute when the API starts its scheduled jobs, so a request with no quote
// is flagged within a minute of the 5- and 10-minute marks. The real
// initScheduledJobs runs; only BullMQ's Redis-backed queue is replaced by a
// recorder, so the test reads exactly what would be scheduled. What the job
// does when it runs is HA-M3-11.
const mockQueueAdd = jest.fn();
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: mockQueueAdd, getRepeatableJobs: jest.fn().mockResolvedValue([]), removeRepeatableByKey: jest.fn(),
  })),
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn() })),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { initScheduledJobs } from '../src/jobs/workers';

it('HA-M3-10: the marketplace alert sweep is scheduled every minute', async () => {
  await initScheduledJobs();

  expect(mockQueueAdd.mock.calls.filter(call => call[0] === 'marketplace-alerts-sweep')).toEqual([
    ['marketplace-alerts-sweep', {}, { repeat: { pattern: '* * * * *' }, removeOnComplete: 30, removeOnFail: 100 }],
  ]);
});
