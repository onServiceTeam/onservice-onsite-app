import { createProviderApplication } from '../src/services/provider.service';
import { saveApplicationDraft, getApplicationDraft } from '../src/services/provider-application-draft.service';
import { logger } from '../src/utils/logger';
import { draftIntegrationIt as it } from './helpers/provider-draft-postgres';
import { applicantId, assertNoSubmission, submissionInput, withSubmissionDatabase } from './helpers/provider-submission-postgres';

it('Bug OPS-503 — failed submitted-evidence capture preserves the draft and rolls back admission while concurrent retries record only one revision', async () => {
  await withSubmissionDatabase(async database => {
    const draft = await saveApplicationDraft(applicantId, { expectedRevision: null, fields: submissionInput });
    const input = { ...submissionInput, draftRevision: draft.revision };
    const info = jest.spyOn(logger, 'info');
    try {
      await database.query('ALTER TABLE provider_application_revisions ADD CONSTRAINT reject_fixture_capture CHECK (FALSE)');
      await expect(createProviderApplication(applicantId, input)).rejects.toMatchObject({ code: '23514' });
      await assertNoSubmission(database);
      expect(await getApplicationDraft(applicantId)).toEqual(draft);
      await database.query('ALTER TABLE provider_application_revisions DROP CONSTRAINT reject_fixture_capture');

      // A successful SQL command with zero inserted rows is not evidence.
      await database.query(`CREATE FUNCTION skip_fixture_capture() RETURNS trigger LANGUAGE plpgsql
        AS $$ BEGIN RETURN NULL; END $$;
        CREATE TRIGGER skip_fixture_capture BEFORE INSERT ON provider_application_revisions
        FOR EACH ROW EXECUTE FUNCTION skip_fixture_capture()`);
      await expect(createProviderApplication(applicantId, input)).rejects.toMatchObject({ statusCode: 503 });
      await assertNoSubmission(database);
      expect(await getApplicationDraft(applicantId)).toEqual(draft);
      await database.query('DROP TRIGGER skip_fixture_capture ON provider_application_revisions; DROP FUNCTION skip_fixture_capture()');

      await database.query('ALTER TABLE provider_application_revisions RENAME TO hidden_fixture_revisions');
      await expect(createProviderApplication(applicantId, input)).rejects.toMatchObject({
        statusCode: 503, code: 'provider_application_schema_unavailable', message: expect.stringContaining('not submitted'),
      });
      await database.query('ALTER TABLE hidden_fixture_revisions RENAME TO provider_application_revisions');
      await assertNoSubmission(database);
      expect(await getApplicationDraft(applicantId)).toEqual(draft);
      expect(info).not.toHaveBeenCalledWith('Provider application submitted', expect.anything());

      const results = await Promise.allSettled([createProviderApplication(applicantId, input), createProviderApplication(applicantId, input)]);
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter(result => result.status === 'rejected'))
        .toEqual([{ status: 'rejected', reason: expect.objectContaining({ statusCode: 409 }) }]);
      expect((await database.query('SELECT revision_number,submitted_by FROM provider_application_revisions')).rows)
        .toEqual([{ revision_number: 1, submitted_by: applicantId }]);
      expect((await database.query('SELECT * FROM provider_application_drafts')).rows).toEqual([]);
      expect((await database.query('SELECT role FROM users')).rows).toEqual([{ role: 'customer' }]);
    } finally { info.mockRestore(); }
  });
}, 30000);
