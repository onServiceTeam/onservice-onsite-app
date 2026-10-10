import { approveProvider, rejectProvider } from '../src/services/admin.service';
import { draftIntegrationIt as it } from './helpers/provider-draft-postgres';
import { approvalReview, waitForBlockedApproval } from './helpers/provider-approval-postgres';
import { applicantId } from './helpers/provider-submission-postgres';
import { revisionReviewerId } from './helpers/provider-revision-review-postgres';
import { withDecisionDatabase } from './helpers/provider-decision-postgres';

jest.mock('../src/services/settings.service', () => ({ getMaxProviderServiceRadiusKm: jest.fn().mockResolvedValue(50) }));

it('Bug OPS-518 — review waits for the owner without holding the provider and rechecks the committed application before either decision', async () => {
  for (const outcome of ['approved', 'rejected'] as const) {
    await withDecisionDatabase(async ({ database, providerId, revisionId }) => {
      // Rejection also repairs legacy, prematurely promoted applicants.
      // Exercise that account write, not a no-op UPDATE on a customer.
      if (outcome === 'rejected') await database.query("UPDATE users SET role='provider' WHERE id=$1", [applicantId]);
      const ownerRole = outcome === 'rejected' ? 'provider' : 'customer';
      const blocker = await database.connect();
      let pending: Promise<unknown> | undefined;
      try {
        await blocker.query('BEGIN');
        const pid = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [applicantId]);
        pending = (outcome === 'approved'
          ? approveProvider(providerId, revisionReviewerId, { ...approvalReview, expectedRevisionId: revisionId })
          : rejectProvider(providerId, revisionReviewerId, 'The submitted identity evidence does not match.', revisionId)
        ).then(() => 'decided', error => error);
        await waitForBlockedApproval(database, pid);

        // This owner-first writer is a concurrency fixture, NOT a resubmission
        // endpoint. NOWAIT proves the reviewing transaction has not inverted
        // the order by retaining a provider lock while waiting for this owner.
        await blocker.query('SELECT id FROM providers WHERE id=$1 FOR UPDATE NOWAIT', [providerId]);
        await blocker.query("UPDATE providers SET status='deactivated' WHERE id=$1", [providerId]);
        await blocker.query('COMMIT');
        expect(await pending).toMatchObject({ statusCode: 404 });
        expect((await database.query('SELECT status FROM providers WHERE id=$1', [providerId])).rows)
          .toEqual([{ status: 'deactivated' }]);
        expect((await database.query('SELECT role FROM users WHERE id=$1', [applicantId])).rows)
          .toEqual([{ role: ownerRole }]);
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
