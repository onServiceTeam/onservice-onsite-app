import { randomUUID } from 'node:crypto';
import { approveProvider, rejectProvider } from '../src/services/admin.service';
import { draftIntegrationIt as it } from './helpers/provider-draft-postgres';
import { approvalReview, waitForBlockedApproval } from './helpers/provider-approval-postgres';
import { revisionOtherOwnerId, revisionReviewerId } from './helpers/provider-revision-review-postgres';
import { withDecisionDatabase } from './helpers/provider-decision-postgres';

jest.mock('../src/services/settings.service', () => ({ getMaxProviderServiceRadiusKm: jest.fn().mockResolvedValue(50) }));

it('Bug OPS-519 — concurrent legacy ownership drift fails closed before review can use a different unlocked account', async () => {
  for (const outcome of ['approved', 'rejected'] as const) {
    await withDecisionDatabase(async ({ database, legacyProviderId: providerId, revisionId }) => {
      const replacementOwner = randomUUID();
      await database.query("INSERT INTO users (id,role) VALUES ($1,'customer')", [replacementOwner]);
      const blocker = await database.connect();
      let pending: Promise<unknown> | undefined;
      try {
        await blocker.query('BEGIN');
        const pid = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        await blocker.query('SELECT id FROM providers WHERE id=$1 FOR UPDATE', [providerId]);
        pending = (outcome === 'approved'
          ? approveProvider(providerId, revisionReviewerId, { ...approvalReview, expectedRevisionId: revisionId })
          : rejectProvider(providerId, revisionReviewerId, 'The submitted identity evidence does not match.', revisionId)
        ).then(() => 'decided', error => error);
        await waitForBlockedApproval(database, pid);
        // Only a legacy row without a captured revision can be reassigned:
        // migration 173 already prevents this for preserved submissions.
        // Adversarial fixture, NOT an authorized transfer or admission API.
        await blocker.query('UPDATE providers SET user_id=$2 WHERE id=$1', [providerId, replacementOwner]);
        await blocker.query('COMMIT');
        expect(await pending).toMatchObject({ statusCode: 409, code: 'provider_account_owner_conflict' });
        expect((await database.query('SELECT status,user_id FROM providers WHERE id=$1', [providerId])).rows)
          .toEqual([{ status: 'pending', user_id: replacementOwner }]);
        expect((await database.query('SELECT role FROM users WHERE id IN ($1,$2)', [revisionOtherOwnerId, replacementOwner])).rows)
          .toEqual([{ role: 'customer' }, { role: 'customer' }]);
        for (const table of ['provider_application_decisions', 'admin_actions', 'notifications']) {
          expect((await database.query(`SELECT count(*)::int AS count FROM ${table}`)).rows).toEqual([{ count: 0 }]);
        }
      } finally {
        await blocker.query('ROLLBACK');
        blocker.release();
        if (pending) await pending;
      }
    });
  }
}, 30000);
