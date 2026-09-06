import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import providerRouter from '../src/routes/provider.routes';
import providerAdminRouter from '../src/routes/provider-admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { draftIntegrationIt as it } from './helpers/provider-draft-postgres';
import { applicantId } from './helpers/provider-submission-postgres';
import { reviewerId, secondApplicantId } from './helpers/provider-review-handoff-postgres';
import { withProviderTeamDatabase } from './helpers/provider-team-postgres';

it('Bug OPS-506 — the provider team URL lists owned staff instead of treating staff as a provider ID', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'provider-team-route-fixture-only-not-a-real-credential';
  const token = (userId: string, role: string) => jwt.sign({ userId, role, sessionVersion: 1, type: 'access' }, process.env.JWT_SECRET!, { expiresIn: '5m' });
  const app = express();
  app.use(express.json());
  app.use('/api/v1/providers', providerRouter);
  app.use('/api/v1/admin/providers', providerAdminRouter);
  app.use(errorMiddleware);
  const readTeam = (userId = applicantId, role = 'provider', query = '') => request(app)
    .get(`/api/v1/providers/staff${query}`).auth(token(userId, role), { type: 'bearer' });
  try {
    await withProviderTeamDatabase(async database => {
      // Synthetic eligibility fixture only, not a real approval/backfill.
      await database.query("UPDATE users SET role='provider' WHERE id IN ($1,$2)", [applicantId, secondApplicantId]);
      const providers = await database.query(`INSERT INTO providers (user_id,business_name,service_radius_km,status)
        VALUES ($1,'First synthetic business',10,'approved'),($2,'Second synthetic business',10,'approved') RETURNING id,user_id`, [applicantId, secondApplicantId]);
      const providerId = providers.rows.find(row => row.user_id === applicantId).id as string;
      const otherProviderId = providers.rows.find(row => row.user_id === secondApplicantId).id as string;
      const invitation = await request(app).post('/api/v1/providers/staff').auth(token(applicantId, 'provider'), { type: 'bearer' })
        .send({ phone: '0917 000 0000', roleTitle: 'Synthetic cleaner' });
      expect(invitation.status).toBe(201);
      const staffId = invitation.body.data.id as string;

      const own = await readTeam();
      expect(own.status).toBe(200);
      expect(own.body).toMatchObject({ success: true, data: [{ id: staffId, providerId, status: 'invited',
        invitePhone: '+639170000000', isAssignable: false,
        performance: { totalJobs: 0, totalReviews: 0, averageRating: 0 } }] });
      expect(own.body.data).toHaveLength(1);
      expect(own.headers['cache-control']).toBe('private, no-store');
      expect((await readTeam(secondApplicantId)).body).toEqual({ success: true, data: [] });
      const otherInvite = await request(app).post('/api/v1/providers/staff').auth(token(secondApplicantId, 'provider'), { type: 'bearer' })
        .send({ email: 'other-team@example.invalid', roleTitle: 'Different business' });
      expect(otherInvite.status).toBe(201);
      const forcedOther = await readTeam(applicantId, 'provider', `?providerId=${otherProviderId}`);
      expect(forcedOther.status).toBe(200);
      expect(forcedOther.body.data.map((row: { id: string }) => row.id)).toEqual([staffId]);
      expect((await readTeam(secondApplicantId)).body.data.map((row: { id: string }) => row.id)).toEqual([otherInvite.body.data.id]);
      // The same pending invite is visible to the authorized operator, with
      // masking still delegated to the actual service, not a second staff list.
      await database.query("UPDATE users SET role='admin' WHERE id=$1", [reviewerId]);
      const admin = await request(app).get(`/api/v1/admin/providers/${providerId}/staff`).auth(token(reviewerId, 'admin'), { type: 'bearer' });
      expect(admin.status).toBe(200);
      expect(admin.body.data).toHaveLength(1);
      expect(admin.body.data[0]).toMatchObject({ id: staffId, status: 'invited', isAssignable: false, contactMasked: true });
      expect(admin.body.data[0].invitePhone).not.toBe('+639170000000');

      const before = (await database.query('SELECT * FROM provider_staff ORDER BY id')).rows;
      expect((await request(app).get('/api/v1/providers/staff')).status).toBe(401);
      for (const role of ['customer', 'provider_staff']) {
        await database.query('UPDATE users SET role=$1 WHERE id=$2', [role, secondApplicantId]);
        expect((await readTeam(secondApplicantId, role)).status).toBe(403);
      }
      await database.query("UPDATE providers SET status='pending' WHERE id=$1", [providerId]);
      expect((await readTeam()).status).toBe(403);
      await database.query("UPDATE providers SET status='approved' WHERE id=$1", [providerId]);
      const missingProfile = await request(app).get('/api/v1/providers/11111111-1111-4111-8111-111111111111')
        .auth(token(applicantId, 'provider'), { type: 'bearer' });
      expect(missingProfile.status).toBe(404);
      expect(missingProfile.body.error.message).toBe('Provider not found.');
      expect((await database.query('SELECT * FROM provider_staff ORDER BY id')).rows).toEqual(before);
      expect((await database.query('SELECT * FROM admin_actions')).rows).toEqual([]);
    });
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
}, 30000);
