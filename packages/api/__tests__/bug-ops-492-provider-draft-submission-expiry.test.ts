import { randomUUID } from 'node:crypto';
import { createProviderApplication } from '../src/services/provider.service';
import { saveApplicationDraft } from '../src/services/provider-application-draft.service';
import { draftIntegrationIt as it, expireDraft } from './helpers/provider-draft-postgres';
import { applicantId, assertNoSubmission, submissionInput, withSubmissionDatabase } from './helpers/provider-submission-postgres';

it('Bug OPS-492 — expired or absent draft revisions cannot submit, older clients work only without an active draft, and missing draft schema fails atomically', async () => {
  await withSubmissionDatabase(async database => {
    await expect(createProviderApplication(applicantId, { ...submissionInput, draftRevision: randomUUID() }))
      .rejects.toMatchObject({ statusCode: 409, code: 'provider_application_draft_conflict' });
    await assertNoSubmission(database);
    const saved = await saveApplicationDraft(applicantId, { expectedRevision: null, fields: submissionInput });
    await expireDraft(database, applicantId);
    const expired = (await database.query('SELECT * FROM provider_application_drafts')).rows;
    await expect(createProviderApplication(applicantId, { ...submissionInput, draftRevision: saved.revision }))
      .rejects.toMatchObject({ statusCode: 409, code: 'provider_application_draft_conflict' });
    expect((await database.query('SELECT * FROM provider_application_drafts')).rows).toEqual(expired);
    await assertNoSubmission(database);
    await createProviderApplication(applicantId, submissionInput);
    expect((await database.query('SELECT status FROM providers')).rows).toEqual([{ status: 'pending' }]);
    expect((await database.query('SELECT * FROM provider_application_drafts')).rows).toEqual([]);
  });
  await withSubmissionDatabase(async database => {
    // Only the test-owned table is removed; no production schema is accepted.
    await database.query('DROP TABLE provider_application_drafts');
    await expect(createProviderApplication(applicantId, submissionInput)).rejects.toMatchObject({
      statusCode: 503, code: 'provider_application_schema_unavailable', message: expect.stringContaining('not submitted'),
    });
    await assertNoSubmission(database);
    expect((await database.query('SELECT role,is_active,is_flagged_fraud FROM users')).rows)
      .toEqual([{ role: 'customer', is_active: true, is_flagged_fraud: false }]);
  });
}, 30000);
