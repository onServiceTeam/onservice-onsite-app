import { createProviderApplication } from '../src/services/provider.service';
import { getApplicationDraft, saveApplicationDraft } from '../src/services/provider-application-draft.service';
import { draftIntegrationIt as it } from './helpers/provider-draft-postgres';
import { applicantId, applicationCategoryId, assertNoSubmission, submissionInput, withSubmissionDatabase } from './helpers/provider-submission-postgres';

it('Bug OPS-490 — submission consumes only the exact saved draft atomically and preserves it through stale requests or failed linkage', async () => {
  await withSubmissionDatabase(async database => {
    const conflict = { statusCode: 409, code: 'provider_application_draft_conflict' };
    const first = await saveApplicationDraft(applicantId, { expectedRevision: null, fields: submissionInput });
    await expect(createProviderApplication(applicantId, submissionInput)).rejects.toMatchObject(conflict);
    for (const fields of [{ businessName: 'Unsaved change' }, { governmentIdNumber: 'DIFFERENT-FIXTURE' },
      { governmentIdFrontUrl: `onboarding/${applicantId}/different-front.jpg` },
      { vettingAnswers: { mainSkills: 'Different answer' } }]) {
      await expect(createProviderApplication(applicantId, { ...submissionInput, ...fields, draftRevision: first.revision }))
        .rejects.toMatchObject(conflict);
    }
    expect(await getApplicationDraft(applicantId)).toEqual(first);
    await assertNoSubmission(database);
    const current = await saveApplicationDraft(applicantId, { expectedRevision: first.revision, fields: submissionInput });
    await expect(createProviderApplication(applicantId, { ...submissionInput, draftRevision: first.revision })).rejects.toMatchObject(conflict);
    const input = { ...submissionInput, draftRevision: current.revision };

    await database.query('UPDATE service_categories SET is_active=FALSE WHERE id=$1', [applicationCategoryId]);
    await expect(createProviderApplication(applicantId, input)).rejects.toMatchObject({ statusCode: 400 });
    expect(await getApplicationDraft(applicantId)).toEqual(current);
    await assertNoSubmission(database);
    await database.query('UPDATE service_categories SET is_active=TRUE WHERE id=$1', [applicationCategoryId]);

    // Fail the final draft DELETE after provider and category/area inserts.
    // This proves that failed consumption also rolls back those earlier writes.
    await database.query('CREATE TABLE draft_fixture_blocker (user_id uuid REFERENCES provider_application_drafts(user_id))');
    await database.query('INSERT INTO draft_fixture_blocker (user_id) VALUES ($1)', [applicantId]);
    await expect(createProviderApplication(applicantId, input)).rejects.toMatchObject({ code: '23503' });
    await assertNoSubmission(database);
    expect(await getApplicationDraft(applicantId)).toEqual(current);
    await database.query('DROP TABLE draft_fixture_blocker');

    const submissions = await Promise.allSettled([
      createProviderApplication(applicantId, input), createProviderApplication(applicantId, input),
    ]);
    expect(submissions.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(submissions.filter(result => result.status === 'rejected'))
      .toEqual([{ status: 'rejected', reason: expect.objectContaining({ statusCode: 409 }) }]);
    expect((await database.query('SELECT * FROM provider_application_drafts')).rows).toEqual([]);
    expect((await database.query('SELECT business_name,status,government_id_number,vetting_answers FROM providers')).rows)
      .toEqual([{ business_name: submissionInput.businessName, status: 'pending', government_id_number: submissionInput.governmentIdNumber,
        vetting_answers: submissionInput.vettingAnswers }]);
    expect((await database.query('SELECT role,is_active,is_flagged_fraud FROM users')).rows)
      .toEqual([{ role: 'customer', is_active: true, is_flagged_fraud: false }]);
    expect((await database.query('SELECT count(*)::int AS count FROM provider_service_areas')).rows).toEqual([{ count: 1 }]);
    expect((await database.query('SELECT count(*)::int AS count FROM provider_services')).rows).toEqual([{ count: 1 }]);
    await expect(saveApplicationDraft(applicantId, { expectedRevision: null, fields: {} }))
      .rejects.toMatchObject({ statusCode: 409, code: 'provider_application_already_submitted' });
  });
}, 30000);
