import { approveProvider, rejectProvider } from '../src/services/admin.service';
import { draftIntegrationIt as it } from './helpers/provider-draft-postgres';
import { approvalReview, waitForBlockedApproval } from './helpers/provider-approval-postgres';
import { appendSyntheticRevision, revisionReviewerId } from './helpers/provider-revision-review-postgres';
import { withDecisionDatabase } from './helpers/provider-decision-postgres';

jest.mock('../src/services/settings.service', () => ({ getMaxProviderServiceRadiusKm: jest.fn().mockResolvedValue(50) }));

it('Bug OPS-514 — a decision rechecks the latest revision after a real concurrent writer and cannot race a second decision', async () => {
  await withDecisionDatabase(async ({ database, providerId, revisionId }) => {
    const blocker = await database.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await blocker.query('BEGIN');
      const pid = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await blocker.query('SELECT id FROM providers WHERE id=$1 FOR UPDATE', [providerId]);
      pending = approveProvider(providerId, revisionReviewerId, { ...approvalReview, expectedRevisionId: revisionId }).catch(error => error);
      await waitForBlockedApproval(database, pid);
      // Simulate a future submission writer on the SAME locked transaction.
      // No resubmission endpoint exists yet; this is a concurrency fixture.
      await appendSyntheticRevision(blocker, providerId, 2);
      await blocker.query('COMMIT');
      expect(await pending).toMatchObject({ code: 'provider_application_revision_conflict' });
      expect((await database.query('SELECT * FROM provider_application_decisions')).rows).toEqual([]);
    } finally {
      await blocker.query('ROLLBACK'); blocker.release();
      if (pending) await pending;
    }
  });
  await withDecisionDatabase(async ({ database, providerId, revisionId }) => {
    const results = await Promise.allSettled([
      approveProvider(providerId, revisionReviewerId, { ...approvalReview, expectedRevisionId: revisionId }),
      rejectProvider(providerId, revisionReviewerId, 'Review confirmed that the submission cannot be accepted.', revisionId),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    for (const table of ['provider_application_decisions', 'admin_actions', 'notifications']) {
      expect((await database.query(`SELECT count(*)::int AS count FROM ${table}`)).rows).toEqual([{ count: 1 }]);
    }
    const saved = (await database.query('SELECT decision,revision_id FROM provider_application_decisions')).rows[0];
    expect(saved.revision_id).toBe(revisionId);
    expect((await database.query('SELECT status FROM providers WHERE id=$1', [providerId])).rows[0].status).toBe(saved.decision);
  });
}, 30000);
