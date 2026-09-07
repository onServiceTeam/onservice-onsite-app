import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { draftIntegrationIt as it } from './helpers/provider-draft-postgres';
import { applicantId, applicationAreaId, applicationCategoryId, submissionInput } from './helpers/provider-submission-postgres';
import { appendSyntheticRevision, reviewCredential, revisionReviewApp, withRevisionReviewDatabase } from './helpers/provider-revision-review-postgres';

jest.mock('../src/services/settings.service', () => ({ getMaxProviderServiceRadiusKm: jest.fn().mockResolvedValue(50) }));

it('Bug OPS-510 — admin review reads the exact submitted revision rather than reconstructing it from mutable profile or catalog data', async () => {
  await withRevisionReviewDatabase(async ({ database, providerId, revisionId, legacyProviderId }) => {
    const app = revisionReviewApp();
    const base = `/api/v1/admin/providers/${providerId}/application-revisions`;
    const get = (path: string) => request(app).get(path).auth(reviewCredential(), { type: 'bearer' });
    const first = await get(`${base}/${revisionId}`);
    expect(first.status).toBe(200);
    expect(first.headers['cache-control']).toBe('private, no-store');
    const revision = first.body.data.revision;
    expect(first.body.data).toMatchObject({ providerId, currentStatus: 'pending' });
    expect(revision).toMatchObject({
      id: revisionId, revisionNumber: 1, previousRevisionNumber: null, schemaVersion: 1,
      businessName: submissionInput.businessName, serviceRadiusKm: 15,
      latitude: 10.32, longitude: 123.89, city: 'Cebu City', province: 'Cebu',
      serviceArea: { id: applicationAreaId, name: 'Metro Cebu' },
      categories: [{ id: applicationCategoryId, name: 'Cleaning' }],
      nbiExpiryDate: '2028-02-29', governmentIdNumber: 'TEST-ID-ONLY', yearsExperience: 5,
      vettingAnswers: submissionInput.vettingAnswers,
    });
    expect(revision.submittedAt).toBe(revision.agreementAcceptedAt);
    expect(revision.recordedAt).toBe(revision.submittedAt);
    for (const docType of ['government_id_front', 'government_id_back', 'nbi_clearance', 'selfie']) {
      expect(revision.documents[docType]).toBe(`${base}/${revisionId}/kyc/${docType}`);
    }
    expect(JSON.stringify(first.body)).not.toContain(`onboarding/${applicantId}/`);
    expect(JSON.stringify(first.body)).not.toContain('uploads.example');

    await database.query(`UPDATE providers SET business_name='Changed profile',years_experience=9,
      government_id_front_url=$2,vetting_answers='{}',status='rejected' WHERE id=$1`, [providerId, `onboarding/${applicantId}/replacement.jpg`]);
    await database.query("UPDATE service_categories SET name='Renamed category',is_active=FALSE WHERE id=$1", [applicationCategoryId]);
    await database.query("UPDATE service_areas SET name='Renamed market' WHERE id=$1", [applicationAreaId]);
    const changed = await get(`${base}/${revisionId}`);
    expect(changed.status).toBe(200);
    expect(changed.body.data.currentStatus).toBe('rejected');
    expect(changed.body.data.revision).toEqual(revision);

    const secondId = await appendSyntheticRevision(database, providerId, 2);
    const thirdId = await appendSyntheticRevision(database, providerId, 3);
    const page = await get(`${base}?limit=2`);
    expect(page.status).toBe(200);
    expect(page.body.data).toMatchObject({ providerId, currentStatus: 'rejected', historyState: 'recorded', nextBeforeRevision: 2 });
    expect(page.body.data.revisions.map((row: { id: string }) => row.id)).toEqual([thirdId, secondId]);
    expect(Object.keys(page.body.data.revisions[0]).sort()).toEqual(['id', 'revisionNumber', 'submittedAt']);
    // Inserting newer evidence while paging must not duplicate or skip older rows.
    await appendSyntheticRevision(database, providerId, 4);
    const older = await get(`${base}?limit=2&beforeRevision=2`);
    expect(older.body.data.revisions).toEqual([{ id: revisionId, revisionNumber: 1, submittedAt: revision.submittedAt }]);
    expect(older.body.data.nextBeforeRevision).toBeNull();
    const emptyPage = await get(`${base}?beforeRevision=1`);
    expect(emptyPage.body.data).toMatchObject({ historyState: 'recorded', revisions: [], nextBeforeRevision: null });
    const omitted = await get(`${base}/${secondId}`);
    expect(omitted.body.data.revision).toMatchObject({ nbiExpiryDate: null, governmentIdNumber: null, yearsExperience: null, vettingAnswers: null });

    const legacy = await get(`/api/v1/admin/providers/${legacyProviderId}/application-revisions`);
    expect(legacy.status).toBe(200);
    expect(legacy.body.data).toEqual({ providerId: legacyProviderId, currentStatus: 'pending', historyState: 'not_recorded', revisions: [], nextBeforeRevision: null });
    for (const path of [`/api/v1/admin/providers/${randomUUID()}/application-revisions`, `${base}/${randomUUID()}`,
      `/api/v1/admin/providers/${legacyProviderId}/application-revisions/${revisionId}`]) {
      const absent = await get(path);
      expect(absent.status).toBe(404);
      expect(absent.headers['cache-control']).toBe('private, no-store');
    }
    for (const query of ['limit=0', 'limit=101', 'limit=1.2', 'limit[]=2', 'limit=1&limit=2', 'beforeRevision=0', 'beforeRevision=-1', 'beforeRevision=2147483648']) {
      expect((await get(`${base}?${query}`)).status).toBe(400);
    }
    expect((await get(`${base}/not-a-uuid`)).status).toBe(400);
    expect((await database.query('SELECT role FROM users WHERE id=$1', [applicantId])).rows).toEqual([{ role: 'customer' }]);
    expect((await database.query('SELECT * FROM admin_actions')).rows).toEqual([]);
    expect((await database.query('SELECT * FROM notifications')).rows).toEqual([]);

    // Missing deployment schema is not an apparently empty historical record.
    await database.query('ALTER TABLE provider_application_revisions RENAME TO test_unavailable_revisions');
    for (const path of [base, `${base}/${revisionId}`]) {
      const unavailable = await get(path);
      expect(unavailable.status).toBe(503);
      expect(unavailable.body.error.code).toBe('provider_application_schema_unavailable');
      expect(unavailable.headers['cache-control']).toBe('private, no-store');
      expect(JSON.stringify(unavailable.body)).not.toContain('test_unavailable_revisions');
    }
  });
}, 30000);
