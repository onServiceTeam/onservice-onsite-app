// HA-M2-78 (customer human audit 2026-10-13, D38 Milestone 2, W3 step I1): the
// job-media-cleanup job cleans up for real when it runs and reports the
// counts: a photo uploaded more than 24 hours ago and never attached to a
// request is marked deleted, its stored file is removed and purged_at is
// set, while a photo uploaded just now is left alone. The photos are real files uploaded through the real job-media
// router into a throwaway uploads volume; the job runs through the
// scheduler's own processor (only BullMQ's Redis connection is replaced). The
// guarded PostgreSQL fixture has the real migrations 183 and 184. That the
// job is on the scheduler every 15 minutes is HA-M2-363.
import fs from 'node:fs';
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import {
  mediaHttp, storePath, syntheticJpeg, uploadThroughApi, withJobMediaDatabase,
} from './helpers/job-media-postgres';

type SchedulerProcessor = (job: { name: string }) => Promise<Record<string, unknown>>;
let mockSchedulerProcessor: SchedulerProcessor | undefined;
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(), getRepeatableJobs: jest.fn().mockResolvedValue([]), removeRepeatableByKey: jest.fn(),
  })),
  Worker: jest.fn().mockImplementation((_name: string, processor: SchedulerProcessor) => {
    mockSchedulerProcessor = processor;
    return { on: jest.fn() };
  }),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import '../src/jobs/workers';

it('HA-M2-78: the job-media-cleanup job cleans up stale media and returns the counts', async () => {
  await withJobMediaDatabase(async ({ database, uploadDir }) => {
    const customer = mediaHttp(customerA, 'customer');
    const stale = await uploadThroughApi(customer, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg({ scanBytes: 900 }) });
    const fresh = await uploadThroughApi(customer, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg({ scanBytes: 901 }) });
    await database.query("UPDATE job_media SET stored_at = NOW() - INTERVAL '25 hours' WHERE id = $1", [stale.id]);
    const fileOf = async (id: string) => storePath(uploadDir,
      (await database.query('SELECT storage_key FROM job_media WHERE id = $1', [id])).rows[0].storage_key as string);
    const staleFile = await fileOf(stale.id);
    const freshFile = await fileOf(fresh.id);
    expect([fs.existsSync(staleFile), fs.existsSync(freshFile)]).toEqual([true, true]);

    expect(await mockSchedulerProcessor!({ name: 'job-media-cleanup' })).toEqual({
      jobMediaCleanup: { expired: 1, recovered: 0, purged: 1, orphans: 0 },
    });

    const rows = (await database.query(`SELECT id, status, purged_at IS NOT NULL AS purged FROM job_media
      WHERE id = ANY($1::uuid[])`, [[stale.id, fresh.id]])).rows;
    expect(rows.find(row => row.id === stale.id)).toEqual({ id: stale.id, status: 'deleted', purged: true });
    expect(rows.find(row => row.id === fresh.id)).toEqual({ id: fresh.id, status: 'stored', purged: false });
    expect([fs.existsSync(staleFile), fs.existsSync(freshFile)]).toEqual([false, true]);
  });
}, 90000);
