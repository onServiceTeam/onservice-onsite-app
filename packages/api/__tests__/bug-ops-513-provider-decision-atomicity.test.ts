import { approveProvider, rejectProvider } from '../src/services/admin.service';
import { draftIntegrationIt as it } from './helpers/provider-draft-postgres';
import { approvalReview } from './helpers/provider-approval-postgres';
import { applicantId } from './helpers/provider-submission-postgres';
import { revisionReviewerId } from './helpers/provider-revision-review-postgres';
import { withDecisionDatabase } from './helpers/provider-decision-postgres';

jest.mock('../src/services/settings.service', () => ({ getMaxProviderServiceRadiusKm: jest.fn().mockResolvedValue(50) }));

it('Bug OPS-513 — the exact-submission decision, provider status, owner role, audit and notice commit or roll back together', async () => {
  for (const decision of ['approved', 'rejected'] as const) {
    await withDecisionDatabase(async ({ database, providerId, revisionId }) => {
      const reason = decision === 'approved' ? approvalReview.reason : 'Identity evidence could not be verified after review.';
      const decide = () => decision === 'approved'
        ? approveProvider(providerId, revisionReviewerId, { ...approvalReview, expectedRevisionId: revisionId })
        : rejectProvider(providerId, revisionReviewerId, reason, revisionId);
      // Fail the final participant notice after earlier writes have run.
      await database.query(`ALTER TABLE notifications ADD CONSTRAINT synthetic_notice_failure CHECK (type='never_allowed')`);
      await expect(decide()).rejects.toMatchObject({ code: '23514' });
      for (const table of ['provider_application_decisions', 'admin_actions', 'notifications']) {
        expect((await database.query(`SELECT count(*)::int AS count FROM ${table}`)).rows).toEqual([{ count: 0 }]);
      }
      expect((await database.query('SELECT status,reviewed_at FROM providers WHERE id=$1', [providerId])).rows)
        .toEqual([{ status: 'pending', reviewed_at: null }]);
      expect((await database.query('SELECT role FROM users WHERE id=$1', [applicantId])).rows).toEqual([{ role: 'customer' }]);
      await database.query('ALTER TABLE notifications DROP CONSTRAINT synthetic_notice_failure');
      await decide();
      const rows = (await database.query('SELECT * FROM provider_application_decisions')).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ provider_id: providerId, revision_id: revisionId, decided_by: revisionReviewerId,
        decision, reason, checklist_summary: decision === 'approved' ? approvalReview.checklistSummary : null });
      expect(rows[0].decided_at).toBeInstanceOf(Date);
      expect((await database.query('SELECT status FROM providers WHERE id=$1', [providerId])).rows).toEqual([{ status: decision }]);
      expect((await database.query('SELECT role FROM users WHERE id=$1', [applicantId])).rows)
        .toEqual([{ role: decision === 'approved' ? 'provider' : 'customer' }]);
      expect((await database.query('SELECT action_type,details FROM admin_actions')).rows)
        .toEqual([expect.objectContaining({ action_type: `provider_${decision}`, details: expect.objectContaining({ revisionId }) })]);
      expect((await database.query('SELECT type,data FROM notifications')).rows)
        .toEqual([expect.objectContaining({ type: `provider_${decision}`, data: expect.objectContaining({ providerId, revisionId }) })]);
      await expect(decide()).rejects.toMatchObject({ statusCode: 404 });
      // Even corrupting the operational status cannot make this revision decidable twice.
      await database.query("UPDATE providers SET status='pending' WHERE id=$1", [providerId]);
      await expect(decide()).rejects.toMatchObject({ code: 'provider_application_revision_conflict' });
      for (const sql of ['UPDATE provider_application_decisions SET reason=reason',
        'DELETE FROM provider_application_decisions', 'TRUNCATE provider_application_decisions']) {
        await expect(database.query(sql)).rejects.toMatchObject({ code: '55000' });
      }
      expect((await database.query('SELECT count(*)::int AS count FROM provider_application_decisions')).rows).toEqual([{ count: 1 }]);
    });
  }
}, 30000);
