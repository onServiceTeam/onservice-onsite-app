import { createProviderApplication, updateProfile } from '../src/services/provider.service';
import { saveApplicationDraft } from '../src/services/provider-application-draft.service';
import { draftIntegrationIt as it } from './helpers/provider-draft-postgres';
import { applicantId, applicationAreaId, applicationCategoryId, submissionInput, withSubmissionDatabase } from './helpers/provider-submission-postgres';

it('Bug OPS-502 — submission preserves its original private evidence and catalog labels independently of subsequent profile or catalog changes', async () => {
  await withSubmissionDatabase(async database => {
    expect((await database.query('SELECT * FROM provider_application_revisions')).rows).toEqual([]);
    const draft = await saveApplicationDraft(applicantId, { expectedRevision: null, fields: submissionInput });
    const provider = await createProviderApplication(applicantId, { ...submissionInput, draftRevision: draft.revision });
    const read = () => database.query('SELECT *, nbi_expiry_date::text AS nbi_expiry_date FROM provider_application_revisions WHERE provider_id=$1', [provider.id]);
    const before = (await read()).rows;
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({
      provider_id: provider.id, submitted_by: applicantId, revision_number: 1, previous_revision_number: null,
      schema_version: 1, business_name: submissionInput.businessName,
      service_radius_km: 15, latitude: '10.32', longitude: '123.89', city: 'Cebu City', province: 'Cebu',
      service_area_id: applicationAreaId, service_area_name: 'Metro Cebu',
      category_ids: [applicationCategoryId], category_names: ['Cleaning'],
      government_id_front_key: `onboarding/${applicantId}/front.jpg`,
      government_id_back_key: `onboarding/${applicantId}/back.jpg`,
      nbi_clearance_key: `onboarding/${applicantId}/nbi.jpg`, selfie_key: `onboarding/${applicantId}/selfie.jpg`,
      nbi_expiry_date: '2028-02-29', government_id_number: 'TEST-ID-ONLY', years_experience: 5,
      vetting_answers: submissionInput.vettingAnswers,
    });
    const canonical = (await database.query('SELECT applied_at,ic_agreement_accepted_at FROM providers WHERE id=$1', [provider.id])).rows[0];
    expect(before[0].submitted_at).toEqual(canonical.applied_at);
    expect(before[0].agreement_accepted_at).toEqual(canonical.ic_agreement_accepted_at);
    expect(before[0].recorded_at).toEqual(canonical.applied_at);
    expect((await database.query('SELECT * FROM provider_application_drafts')).rows).toEqual([]);
    // Real mutable profile operation, then catalog/legacy evidence changes.
    // No claimed approval or review is manufactured by this fixture.
    await updateProfile(provider.id, { yearsExperience: 9 });
    await database.query("UPDATE providers SET government_id_front_url=$2, vetting_answers='{}' WHERE id=$1", [provider.id, `onboarding/${applicantId}/replacement.jpg`]);
    await database.query("UPDATE service_areas SET name='Renamed market',city='Renamed city' WHERE id=$1", [applicationAreaId]);
    await database.query("UPDATE service_categories SET name='Renamed category',is_active=FALSE WHERE id=$1", [applicationCategoryId]);
    expect((await read()).rows).toEqual(before);
    expect((await database.query('SELECT role FROM users WHERE id=$1', [applicantId])).rows).toEqual([{ role: 'customer' }]);
    expect((await database.query('SELECT * FROM admin_actions')).rows).toEqual([]);
  });
  await withSubmissionDatabase(async database => {
    // An older client omitted these answers. Do not manufacture a zero,
    // false questionnaire response, agreement version or ID metadata.
    await createProviderApplication(applicantId, { ...submissionInput,
      nbiExpiryDate: undefined, governmentIdNumber: undefined, yearsExperience: undefined, vettingAnswers: undefined,
    });
    expect((await database.query(`SELECT nbi_expiry_date,government_id_number,years_experience,vetting_answers
      FROM provider_application_revisions`)).rows).toEqual([{
      nbi_expiry_date: null, government_id_number: null, years_experience: null, vetting_answers: null,
    }]);
  });
}, 30000);
