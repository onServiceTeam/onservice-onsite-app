import { randomUUID } from 'node:crypto';
import { createProviderApplication } from '../src/services/provider.service';
import { draftIntegrationIt as it } from './helpers/provider-draft-postgres';
import { applicantId, submissionInput, withSubmissionDatabase } from './helpers/provider-submission-postgres';

it('Bug OPS-504 — the actual evidence migration rejects routine mutation, wrong ownership and invalid revision chains without inventing legacy evidence', async () => {
  await withSubmissionDatabase(async database => {
    const other = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    await database.query("INSERT INTO users (id,role) VALUES ($1,'customer')", [other]);
    const legacy = (await database.query("INSERT INTO providers (user_id,business_name,service_radius_km,status) VALUES ($1,'Legacy fixture',10,'approved') RETURNING id", [other])).rows[0];
    expect((await database.query('SELECT * FROM provider_application_revisions')).rows).toEqual([]);
    await createProviderApplication(applicantId, submissionInput);
    const original = (await database.query('SELECT * FROM provider_application_revisions')).rows;
    for (const sql of ["UPDATE provider_application_revisions SET business_name='Overwrite'", 'DELETE FROM provider_application_revisions', 'TRUNCATE provider_application_revisions']) {
      await expect(database.query(sql)).rejects.toMatchObject({ code: '55000' });
      expect((await database.query('SELECT * FROM provider_application_revisions')).rows).toEqual(original);
    }
    const insert = (overrides: object) => database.query(`INSERT INTO provider_application_revisions
      SELECT (jsonb_populate_record(NULL::provider_application_revisions, $1::jsonb)).*`,
    [JSON.stringify({ ...original[0], id: randomUUID(), revision_number: 2, previous_revision_number: 1, ...overrides })]);
    const wrongOwnerKeys = {
      government_id_front_key: `onboarding/${other}/front.jpg`, government_id_back_key: `onboarding/${other}/back.jpg`,
      nbi_clearance_key: `onboarding/${other}/nbi.jpg`, selfie_key: `onboarding/${other}/selfie.jpg`,
    };
    await expect(insert({ submitted_by: other, ...wrongOwnerKeys })).rejects.toMatchObject({ code: '23503' });
    await expect(insert({ provider_id: legacy.id, submitted_by: other, ...wrongOwnerKeys })).rejects.toMatchObject({ code: '23503' });
    for (const overrides of [
      { revision_number: 0, previous_revision_number: null }, { previous_revision_number: null },
      { revision_number: 3 }, { schema_version: 2 }, { category_ids: [] }, { category_names: [] },
      { government_id_front_key: `onboarding/${other}/not-yours.jpg` },
      { selfie_key: `https://uploads.example/onboarding/${applicantId}/selfie.jpg` },
      { vetting_answers: { unreviewedField: 'not accepted' } }, { vetting_answers: [] },
      { vetting_answers: { mainSkills: 'x'.repeat(20001) } },
    ]) await expect(insert(overrides)).rejects.toMatchObject({ code: '23514' });
    await expect(insert({ revision_number: 1, previous_revision_number: null })).rejects.toMatchObject({ code: '23505' });
    expect((await database.query('SELECT * FROM provider_application_revisions')).rows).toEqual(original);
    expect((await database.query('SELECT * FROM provider_application_revisions WHERE provider_id=$1', [legacy.id])).rows).toEqual([]);
  });
}, 30000);
