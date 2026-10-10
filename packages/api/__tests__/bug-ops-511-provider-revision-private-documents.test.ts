import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import request from 'supertest';
import { createAppError } from '../src/middleware/error.middleware';
import * as uploads from '../src/services/upload.service';
import { draftIntegrationIt as it } from './helpers/provider-draft-postgres';
import { applicantId } from './helpers/provider-submission-postgres';
import { appendSyntheticRevision, reviewCredential, revisionReviewerId, revisionReviewApp, withRevisionReviewDatabase } from './helpers/provider-revision-review-postgres';

jest.mock('../src/services/settings.service', () => ({ getMaxProviderServiceRadiusKm: jest.fn().mockResolvedValue(50) }));

it('Bug OPS-511 — historical KYC access is bound to its exact provider and revision with current operations authority and no public document link', async () => {
  // Real HTTP/auth/PostgreSQL/key selection; only object storage is substituted.
  // Distinct streamed bytes prove that current evidence is not used as fallback.
  const storage = jest.spyOn(uploads, 'getObjectStream').mockImplementation(async key => {
    const bytes = Buffer.from(`Synthetic document fixture: ${key}`);
    return { body: Readable.from(bytes), contentType: 'image/jpeg', contentLength: bytes.length };
  });
  const presign = jest.spyOn(uploads, 'getKycPresignedUrl');
  try {
    await withRevisionReviewDatabase(async ({ database, providerId, revisionId, legacyProviderId }) => {
      const app = revisionReviewApp();
      const base = `/api/v1/admin/providers/${providerId}/application-revisions`;
      const get = (path: string, role = 'admin') => request(app).get(path).set('Cookie', `admin_session=${reviewCredential(role)}`);
      const url = `${base}/${revisionId}/kyc/government_id_front`;
      const before = (await database.query('SELECT * FROM provider_application_revisions WHERE id=$1', [revisionId])).rows;
      await database.query('UPDATE providers SET government_id_front_url=$2 WHERE id=$1', [providerId, `onboarding/${applicantId}/current-front.jpg`]);
      const secondId = await appendSyntheticRevision(database, providerId, 2);
      for (const [id, file] of [[revisionId, 'front.jpg'], [secondId, 'later-front.jpg']]) {
        const response = await get(`${base}/${id}/kyc/government_id_front?mode=link`);
        expect(response.status).toBe(200);
        expect(response.headers['cache-control']).toBe('private, no-store');
        expect(response.body).toEqual(Buffer.from(`Synthetic document fixture: onboarding/${applicantId}/${file}`));
        expect(response.headers['content-type']).toMatch(/^image\/jpeg/);
      }
      expect(presign).not.toHaveBeenCalled();
      for (const [type, file] of [['government_id_back', 'back.jpg'], ['nbi_clearance', 'nbi.jpg'], ['selfie', 'selfie.jpg']]) {
        expect((await get(`${base}/${revisionId}/kyc/${type}`)).body).toEqual(Buffer.from(`Synthetic document fixture: onboarding/${applicantId}/${file}`));
      }
      const readsBeforeDenials = storage.mock.calls.length;
      for (const role of ['customer', 'provider', 'provider_staff', 'dpo']) {
        await database.query('UPDATE users SET role=$2 WHERE id=$1', [revisionReviewerId, role]);
        for (const path of [base, `${base}/${revisionId}`, url]) {
          const denied = await get(path, role);
          expect(denied.status).toBe(403);
          expect(denied.headers['cache-control']).toBe('private, no-store');
        }
      }
      const ownerDenied = await request(app).get(url).auth(reviewCredential('customer', applicantId), { type: 'bearer' });
      expect(ownerDenied.status).toBe(403);
      const anonymous = await request(app).get(url);
      expect(anonymous.status).toBe(401);
      expect(anonymous.headers['cache-control']).toBe('private, no-store');
      await database.query("UPDATE users SET role='super_admin',session_version=2 WHERE id=$1", [revisionReviewerId]);
      expect((await get(url, 'super_admin')).status).toBe(401);
      await database.query('UPDATE users SET session_version=1,must_rotate_password=TRUE WHERE id=$1', [revisionReviewerId]);
      expect((await get(url, 'super_admin')).status).toBe(428);
      await database.query('UPDATE users SET must_rotate_password=FALSE,is_active=FALSE WHERE id=$1', [revisionReviewerId]);
      expect((await get(url, 'super_admin')).status).toBe(401);
      await database.query('UPDATE users SET is_active=TRUE WHERE id=$1', [revisionReviewerId]);
      for (const [path, status] of [
        [`/api/v1/admin/providers/${legacyProviderId}/application-revisions/${revisionId}/kyc/government_id_front`, 404],
        [`${base}/${randomUUID()}/kyc/government_id_front`, 404],
        [`${base}/${revisionId}/kyc/unknown`, 400], [`${base}/invalid/kyc/selfie`, 400],
      ] as const) {
        const invalid = await get(path, 'super_admin');
        expect(invalid.status).toBe(status);
        expect(invalid.headers['cache-control']).toBe('private, no-store');
      }
      expect(storage).toHaveBeenCalledTimes(readsBeforeDenials);
      expect((await get(url, 'super_admin')).status).toBe(200);
      storage.mockRejectedValueOnce(createAppError('Document not found.', 404));
      const missingBytes = await get(url, 'super_admin');
      expect(missingBytes.status).toBe(404);
      expect(missingBytes.headers['cache-control']).toBe('private, no-store');
      expect((await database.query('SELECT * FROM provider_application_revisions WHERE id=$1', [revisionId])).rows).toEqual(before);
      expect((await database.query('SELECT * FROM admin_actions')).rows).toEqual([]);
    });
  } finally { storage.mockRestore(); presign.mockRestore(); }
}, 30000);
