import { randomUUID } from 'node:crypto';
import { approveProvider } from '../src/services/admin.service';
import { draftIntegrationIt as it } from './helpers/provider-draft-postgres';
import { approvalReview } from './helpers/provider-approval-postgres';
import { applicantId } from './helpers/provider-submission-postgres';
import { appendSyntheticRevision, revisionReviewerId } from './helpers/provider-revision-review-postgres';
import { withDecisionDatabase } from './helpers/provider-decision-postgres';

jest.mock('../src/services/settings.service', () => ({ getMaxProviderServiceRadiusKm: jest.fn().mockResolvedValue(50) }));

it('Bug OPS-512 — approval refuses absent, unrelated and stale submitted revisions without granting a role or recording a decision', async () => {
  await withDecisionDatabase(async ({ database, providerId, revisionId, legacyProviderId }) => {
    await appendSyntheticRevision(database, providerId, 2);
    for (const expectedRevisionId of [revisionId, randomUUID()]) {
      const review = { ...approvalReview, expectedRevisionId };
      await expect(approveProvider(providerId, revisionReviewerId, review))
        .rejects.toMatchObject({ statusCode: 409, code: 'provider_application_revision_conflict' });
    }
    for (const expectedRevisionId of [undefined, null, '', 'not-a-uuid']) {
      const review = { ...approvalReview, expectedRevisionId };
      await expect(approveProvider(providerId, revisionReviewerId, review))
        .rejects.toMatchObject({ statusCode: 400 });
    }
    const legacyReview = { ...approvalReview, expectedRevisionId: revisionId };
    await expect(approveProvider(legacyProviderId, revisionReviewerId, legacyReview))
      .rejects.toMatchObject({ statusCode: 409, code: 'provider_application_revision_conflict' });
    expect((await database.query('SELECT status,reviewed_at FROM providers WHERE id=$1', [providerId])).rows)
      .toEqual([{ status: 'pending', reviewed_at: null }]);
    expect((await database.query('SELECT role FROM users WHERE id=$1', [applicantId])).rows).toEqual([{ role: 'customer' }]);
    expect((await database.query('SELECT * FROM provider_application_decisions')).rows).toEqual([]);
    expect((await database.query('SELECT * FROM admin_actions')).rows).toEqual([]);
    expect((await database.query('SELECT * FROM notifications')).rows).toEqual([]);
  });
}, 30000);
