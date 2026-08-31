type SchedulerProcessor = (job: { name: string }) => Promise<Record<string, unknown>>;

let mockSchedulerProcessor: SchedulerProcessor | undefined;
const mockQueueAdd = jest.fn().mockResolvedValue(undefined);
const mockGetRepeatableJobs = jest.fn().mockResolvedValue([]);
const mockRemoveRepeatableByKey = jest.fn().mockResolvedValue(undefined);

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
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { initScheduledJobs } from '../src/jobs/workers';

it('Bug UX-830 — E47 stops scheduled and already queued quality recomputation jobs from writing snapshots', async () => {
  expect(mockSchedulerProcessor).toBeDefined();
  const result = await mockSchedulerProcessor!({ name: 'quality-score-compute' });
  await initScheduledJobs();

  expect(result).toEqual({ qualityScoresComputed: 0, qualityScoreHold: 'E47' });
  expect(mockQueueAdd).not.toHaveBeenCalledWith(
    'quality-score-compute',
    expect.anything(),
    expect.anything(),
  );
});
