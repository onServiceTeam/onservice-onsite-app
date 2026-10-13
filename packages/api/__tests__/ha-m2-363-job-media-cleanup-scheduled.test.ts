// HA-M2-363 (customer human audit 2026-10-13, D38 Milestone 2, W3 step I1;
// W3-A fix-round overflow number, split out of HA-M2-78): the
// job-media-cleanup job is put on the scheduler to repeat every 15 minutes
// (design-media.md section 5) when the API starts its scheduled jobs. The
// real initScheduledJobs runs; only BullMQ's Redis-backed queue is replaced
// by a recorder, so the test reads exactly what would be scheduled. What the
// job does when it runs is HA-M2-78.
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

it('HA-M2-363: the job-media-cleanup job is scheduled every 15 minutes', async () => {
  await initScheduledJobs();

  expect(mockQueueAdd.mock.calls.filter(call => call[0] === 'job-media-cleanup')).toEqual([
    ['job-media-cleanup', {}, { repeat: { pattern: '*/15 * * * *' }, removeOnComplete: 30, removeOnFail: 100 }],
  ]);
});
