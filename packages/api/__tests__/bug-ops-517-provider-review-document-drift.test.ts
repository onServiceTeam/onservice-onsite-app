import { approveProvider } from '../src/services/admin.service';
import { draftIntegrationIt as it } from './helpers/provider-draft-postgres';
import { approvalReview } from './helpers/provider-approval-postgres';
import { applicantId } from './helpers/provider-submission-postgres';
import { revisionReviewerId } from './helpers/provider-revision-review-postgres';
import { withDecisionDatabase } from './helpers/provider-decision-postgres';

jest.mock('../src/services/settings.service', () => ({ getMaxProviderServiceRadiusKm: jest.fn().mockResolvedValue(50) }));

it('Bug OPS-517 — approval cannot silently substitute a current KYC document for the original reviewed submission', async () => {
  await withDecisionDatabase(async ({ database, providerId, revisionId }) => {
    const original = (await database.query('SELECT * FROM providers WHERE id=$1', [providerId])).rows[0];
    for (const field of ['government_id_front_url', 'government_id_back_url', 'nbi_clearance_url', 'selfie_url']) {
      await database.query(`UPDATE providers SET ${field}=$2 WHERE id=$1`, [providerId, `onboarding/${applicantId}/replacement.jpg`]);
      await expect(approveProvider(providerId, revisionReviewerId, { ...approvalReview, expectedRevisionId: revisionId }))
        .rejects.toMatchObject({ statusCode: 409, code: 'provider_application_revision_conflict' });
      expect((await database.query('SELECT * FROM provider_application_decisions')).rows).toEqual([]);
      expect((await database.query('SELECT status FROM providers WHERE id=$1', [providerId])).rows).toEqual([{ status: 'pending' }]);
      await database.query(`UPDATE providers SET ${field}=$2 WHERE id=$1`, [providerId, original[field]]);
    }
    // A legacy URL for the same exact key is not a different document.
    await database.query('UPDATE providers SET government_id_front_url=$2 WHERE id=$1',
      [providerId, `https://uploads.example/${original.government_id_front_url}`]);
    await approveProvider(providerId, revisionReviewerId, { ...approvalReview, expectedRevisionId: revisionId });
    expect((await database.query('SELECT revision_id FROM provider_application_decisions')).rows).toEqual([{ revision_id: revisionId }]);
  });
}, 30000);
