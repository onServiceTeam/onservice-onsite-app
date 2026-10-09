import { createProviderApplication } from '../src/services/provider.service';
import { logger } from '../src/utils/logger';
import { approvalIntegrationIt as it } from './helpers/provider-approval-postgres';
import { applicantId, assertNoSubmission, submissionInput, withSubmissionDatabase } from './helpers/provider-submission-postgres';

it('Bug OPS-483 — a missing application column or failed linkage rolls back the whole submission without dropping evidence or logging success', async () => {
  await withSubmissionDatabase(async database => {
    const info = jest.spyOn(logger, 'info');
    try {
      await database.query('ALTER TABLE providers DROP COLUMN government_id_number');
      await expect(createProviderApplication(applicantId, submissionInput)).rejects.toMatchObject({
        statusCode: 503, code: 'provider_application_schema_unavailable', message: expect.stringContaining('not submitted'),
      });
      await assertNoSubmission(database);
      expect(info).not.toHaveBeenCalledWith('Provider application submitted', expect.anything());
      await database.query('ALTER TABLE providers ADD COLUMN government_id_number text');

      // Force a genuine downstream database failure after provider + area
      // insertion. All earlier writes and the owner lock must roll back.
      await database.query('ALTER TABLE provider_services ADD CONSTRAINT reject_test_link CHECK (is_active = FALSE)');
      await expect(createProviderApplication(applicantId, submissionInput)).rejects.toMatchObject({ code: '23514' });
      await assertNoSubmission(database);
      expect(info).not.toHaveBeenCalledWith('Provider application submitted', expect.anything());
      expect((await database.query('SELECT role,is_active,is_flagged_fraud FROM users')).rows)
        .toEqual([{ role: 'customer', is_active: true, is_flagged_fraud: false }]);
      await database.query('ALTER TABLE provider_services DROP CONSTRAINT reject_test_link');

      // Same request now succeeds, retaining every optional review field.
      const result = await createProviderApplication(applicantId, submissionInput);
      expect((await database.query('SELECT government_id_number,years_experience,vetting_answers FROM providers')).rows)
        .toEqual([{ government_id_number: submissionInput.governmentIdNumber, years_experience: 5, vetting_answers: submissionInput.vettingAnswers }]);
      expect((await database.query('SELECT count(*)::int AS count FROM provider_service_areas')).rows).toEqual([{ count: 1 }]);
      expect((await database.query('SELECT count(*)::int AS count FROM provider_services')).rows).toEqual([{ count: 1 }]);
      expect(info).toHaveBeenCalledWith('Provider application submitted', { userId: applicantId, providerId: result.id, categories: 1 });
    } finally { info.mockRestore(); }
  });
}, 30000);
