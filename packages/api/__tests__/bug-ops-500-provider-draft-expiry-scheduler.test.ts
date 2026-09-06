type SchedulerProcessor = (job: { name: string; data?: Record<string, unknown> }) => Promise<Record<string, unknown>>;

let mockSchedulerProcessor: SchedulerProcessor | undefined;
const mockQueueAdd = jest.fn().mockResolvedValue(undefined);
const mockInfo = jest.fn();

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
jest.mock('../src/utils/logger', () => ({
  logger: { info: (...args: unknown[]) => mockInfo(...args), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { initScheduledJobs } from '../src/jobs/workers';
import * as drafts from '../src/services/provider-application-draft.service';
import { draftIntegrationIt, withDraftDatabase, draftOwner, otherDraftOwner, expireDraft } from './helpers/provider-draft-postgres';

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

it('Bug OPS-500 — provider draft expiry is scheduled and executes one fixed bounded cleanup without trusting queued payloads', async () => {
  const purge = jest.spyOn(drafts, 'purgeExpiredApplicationDrafts').mockResolvedValue(100);
  await initScheduledJobs();
  expect(mockQueueAdd.mock.calls.filter(call => call[0] === 'provider-application-draft-expiry')).toEqual([
    ['provider-application-draft-expiry', {}, {
      repeat: { pattern: '*/5 * * * *' }, attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: 30, removeOnFail: 100,
    }],
  ]);
  const result = await mockSchedulerProcessor!({ name: 'provider-application-draft-expiry',
    data: { limit: 500000, applicant: 'do-not-log-fixture-applicant', expiresBefore: '2999-01-01' } });
  expect(purge).toHaveBeenCalledTimes(1);
  expect(purge).toHaveBeenCalledWith(100);
  expect(result).toEqual({ applicationDraftsPurged: 100 });
  expect(mockInfo).toHaveBeenLastCalledWith('Scheduler job completed', {
    name: 'provider-application-draft-expiry', results: { applicationDraftsPurged: 100 },
  });
  expect(JSON.stringify(mockInfo.mock.calls)).not.toContain('do-not-log-fixture-applicant');
});

it('draft cleanup failures propagate to the scheduler instead of reporting false completion', async () => {
  const failure = new Error('fixture cleanup unavailable');
  const purge = jest.spyOn(drafts, 'purgeExpiredApplicationDrafts').mockRejectedValue(failure);
  await expect(mockSchedulerProcessor!({ name: 'provider-application-draft-expiry' })).rejects.toBe(failure);
  expect(purge).toHaveBeenCalledTimes(1);
  expect(mockInfo).not.toHaveBeenCalledWith('Scheduler job completed', expect.anything());
});

draftIntegrationIt('the actual scheduled cleanup removes at most 100 unlocked expired rows and preserves active drafts and provider identities', async () => {
  // Real processor, service, migration and PostgreSQL. Only BullMQ delivery is
  // substituted. The helper refuses anything except isolated localhost *_test.
  await withDraftDatabase(async database => {
    await drafts.saveApplicationDraft(draftOwner, { expectedRevision: null, fields: {} });
    const active = await drafts.saveApplicationDraft(otherDraftOwner, {
      expectedRevision: null, fields: { businessName: 'Keep active draft' },
    });
    await expireDraft(database);
    await database.query(`
      WITH owners AS (
        INSERT INTO users (id,role) SELECT gen_random_uuid(),'customer' FROM generate_series(1,101) RETURNING id
      )
      INSERT INTO provider_application_drafts (user_id,revision,application_fields,created_at,saved_at,expires_at)
      SELECT id,gen_random_uuid(),'{}'::jsonb,NOW()-INTERVAL '32 days',NOW()-INTERVAL '31 days',NOW()-INTERVAL '1 day' FROM owners
    `);
    await database.query(`INSERT INTO users (id,role) VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','provider')`);
    await database.query(`INSERT INTO providers (user_id,status) VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','approved')`);
    const usersBefore = (await database.query('SELECT * FROM users ORDER BY id')).rows;
    const providersBefore = (await database.query('SELECT * FROM providers ORDER BY id')).rows;
    const blocker = await database.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT user_id FROM provider_application_drafts WHERE user_id=$1 FOR UPDATE', [draftOwner]);
      expect(await mockSchedulerProcessor!({ name: 'provider-application-draft-expiry' })).toEqual({ applicationDraftsPurged: 100 });
      expect((await database.query('SELECT count(*)::int AS count FROM provider_application_drafts')).rows).toEqual([{ count: 3 }]);
      expect((await database.query('SELECT user_id FROM provider_application_drafts WHERE user_id=$1', [draftOwner])).rows).toEqual([{ user_id: draftOwner }]);
      await blocker.query('COMMIT');
    } finally { await blocker.query('ROLLBACK'); blocker.release(); }
    expect(await mockSchedulerProcessor!({ name: 'provider-application-draft-expiry' })).toEqual({ applicationDraftsPurged: 2 });
    expect(await mockSchedulerProcessor!({ name: 'provider-application-draft-expiry' })).toEqual({ applicationDraftsPurged: 0 });
    expect(await drafts.getApplicationDraft(otherDraftOwner)).toEqual(active);
    expect((await database.query('SELECT * FROM users ORDER BY id')).rows).toEqual(usersBefore);
    expect((await database.query('SELECT * FROM providers ORDER BY id')).rows).toEqual(providersBefore);
    expect((await database.query('SELECT count(*)::int AS count FROM provider_application_drafts')).rows).toEqual([{ count: 1 }]);
  });
}, 30000);
