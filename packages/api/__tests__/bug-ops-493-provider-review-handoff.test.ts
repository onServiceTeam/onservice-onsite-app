import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import providerRouter from '../src/routes/provider.routes';
import providerAdminRouter from '../src/routes/provider-admin.routes';
import adminLatentRouter from '../src/routes/admin-latent.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { getProviderByUserId } from '../src/services/provider.service';
import { draftIntegrationIt as it } from './helpers/provider-draft-postgres';
import { applicantId, applicationCategoryId, applicationAreaId, submissionInput } from './helpers/provider-submission-postgres';
import { approvalReview as baseApprovalReview } from './helpers/provider-approval-postgres';
import { reviewerId, secondApplicantId, withReviewHandoffDatabase } from './helpers/provider-review-handoff-postgres';

jest.mock('../src/services/settings.service', () => ({ getMaxProviderServiceRadiusKm: jest.fn().mockResolvedValue(50) }));

it('Bug OPS-493 — submitted category-only evidence survives the applicant to admin decision handoff without becoming a priced service or early provider access', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'review-handoff-fixture-only-not-a-real-credential';
  const token = (userId: string, role: string) => jwt.sign(
    { userId, role, sessionVersion: 1, type: 'access' }, process.env.JWT_SECRET!, { expiresIn: '5m' },
  );
  const customerToken = token(applicantId, 'customer');
  const adminToken = token(reviewerId, 'super_admin');
  const app = express();
  app.use(express.json());
  app.use('/providers', providerRouter);
  app.use('/admin/providers', providerAdminRouter);
  app.use('/admin', adminLatentRouter);
  app.use(errorMiddleware);
  const readQueue = () => request(app).get('/admin/provider-applications').auth(adminToken, { type: 'bearer' });
  try {
    await withReviewHandoffDatabase(async database => {
      const draft = await request(app).put('/providers/application-draft').auth(customerToken, { type: 'bearer' })
        .send({ expectedRevision: null, fields: submissionInput });
      expect(draft.status).toBe(200);
      expect((await readQueue()).body.data).toEqual([]);
      const submitted = await request(app).post('/providers/apply').auth(customerToken, { type: 'bearer' })
        .send({ ...draft.body.data.fields, draftRevision: draft.body.data.revision, icAgreementAccepted: true });
      expect(submitted.status).toBe(201);
      const providerId = submitted.body.data.id as string;
      const captured = await request(app).get(`/admin/providers/${providerId}/application-revisions`).auth(adminToken, { type: 'bearer' });
      expect(captured.status).toBe(200);
      const approvalReview = { ...baseApprovalReview, expectedRevisionId: captured.body.data.revisions[0].id };
      const queue = await readQueue();
      expect(queue.status).toBe(200);
      expect(queue.body.data).toEqual([expect.objectContaining({ providerId, userId: applicantId,
        status: 'pending', submissionTimeMissing: false, reviewPath: `/providers/${providerId}` })]);
      const readProfile = () => request(app).get(`/admin/providers/${providerId}/profile`).auth(adminToken, { type: 'bearer' });
      const reviewed = await readProfile();
      expect(reviewed.status).toBe(200);
      expect(reviewed.body.data.declaredCategories).toEqual([{ id: applicationCategoryId, name: 'Cleaning', isActive: true }]);
      expect(reviewed.body.data.services).toEqual([]);
      expect(reviewed.body.data.categories).toEqual([]);
      expect(reviewed.body.data).toMatchObject({ userId: applicantId, status: 'pending', yearsExperience: 5,
        vettingAnswers: submissionInput.vettingAnswers,
        serviceAreas: [{ id: applicationAreaId, name: 'Metro Cebu', isPrimary: true }] });
      for (const field of ['governmentIdUrl', 'governmentIdBackUrl', 'nbiClearanceUrl', 'selfieUrl']) {
        expect(reviewed.body.data.documents[field]).toMatch(/^\/api\/v1\/admin\//);
        expect(reviewed.body.data.documents[field]).toContain(providerId);
        expect(reviewed.body.data.documents[field]).not.toContain(`onboarding/${applicantId}`);
      }
      expect((await request(app).get(`/admin/providers/${providerId}/profile`).auth(customerToken, { type: 'bearer' })).status).toBe(403);
      expect((await request(app).get('/providers/me').auth(customerToken, { type: 'bearer' })).status).toBe(403);
      expect((await request(app).get('/providers/me').auth(token(applicantId, 'provider'), { type: 'bearer' })).status).toBe(401);
      await expect(getProviderByUserId(applicantId)).rejects.toMatchObject({ statusCode: 403 });

      const pricedCategoryId = '11111111-1111-4111-8111-111111111111';
      const hiddenCategoryId = '22222222-2222-4222-8222-222222222222';
      const subcategoryId = '33333333-3333-4333-8333-333333333333';
      await database.query("INSERT INTO service_categories (id,name) VALUES ($1,'Plumbing'),($2,'Other applicant only')", [pricedCategoryId, hiddenCategoryId]);
      const otherProvider = await database.query("INSERT INTO providers (user_id,business_name,service_radius_km) VALUES ($1,'Other fixture',10) RETURNING id", [secondApplicantId]);
      await database.query(`INSERT INTO provider_services (provider_id,category_id,is_active) VALUES
        ($1,$2,TRUE),($1,$3,FALSE),($4,$3,TRUE)`, [providerId, applicationCategoryId, hiddenCategoryId, otherProvider.rows[0].id]);
      await database.query("INSERT INTO service_subcategories (id,category_id,name,pricing_type,base_price) VALUES ($1,$2,'Pipe repair','fixed',50000)", [subcategoryId, pricedCategoryId]);
      await database.query(`INSERT INTO provider_services (provider_id,category_id,subcategory_id,is_active,base_price)
        VALUES ($1,$2,$3,TRUE,90000)`, [providerId, pricedCategoryId, subcategoryId]);
      await database.query('UPDATE service_categories SET is_active=FALSE WHERE id=$1', [applicationCategoryId]);
      const changed = await readProfile();
      expect(changed.status).toBe(200);
      expect(changed.body.data.declaredCategories).toEqual([{ id: applicationCategoryId, name: 'Cleaning', isActive: false }]);
      expect(changed.body.data.services).toEqual([expect.objectContaining({ id: subcategoryId, name: 'Pipe repair', basePrice: 50000 })]);
      expect(changed.body.data.categories).toEqual([{ id: pricedCategoryId, name: 'Plumbing', basePrice: 50000 }]);

      const decide = (body: object, credential = adminToken) => request(app).post(`/admin/provider-applications/${applicantId}/decide`)
        .auth(credential, { type: 'bearer' }).send(body);
      expect((await decide({ decision: 'approved', ...approvalReview }, customerToken)).status).toBe(403);
      expect((await decide({ decision: 'approved', ...approvalReview, checklistConfirmed: false })).status).toBe(400);
      const pending = await request(app).get('/providers/application-status').auth(customerToken, { type: 'bearer' });
      expect(pending.status).toBe(200);
      expect(pending.body.data).toEqual({ status: 'pending', rejectionReason: null });
      const approved = await decide({ decision: 'approved', ...approvalReview });
      expect(approved.status).toBe(200);
      expect(approved.body.data).toEqual({ providerId, userId: applicantId, status: 'approved' });
      expect((await readQueue()).body.data.map((row: { providerId: string }) => row.providerId)).toEqual([otherProvider.rows[0].id]);
      expect((await request(app).get('/providers/application-status').auth(customerToken, { type: 'bearer' })).status).toBe(401);
      // Fresh provider JWT models re-authentication, not the refresh-token transport.
      const status = await request(app).get('/providers/application-status').auth(token(applicantId, 'provider'), { type: 'bearer' });
      expect(status.status).toBe(200);
      expect(status.body.data).toEqual({ status: 'approved', rejectionReason: null });
      expect(await getProviderByUserId(applicantId)).toMatchObject({ id: providerId, status: 'approved' });
      expect((await decide({ decision: 'approved', ...approvalReview })).status).toBe(404);
      expect((await database.query('SELECT role FROM users WHERE id=$1', [applicantId])).rows).toEqual([{ role: 'provider' }]);
      expect((await database.query('SELECT * FROM provider_application_drafts')).rows).toEqual([]);
      expect((await database.query('SELECT action_type,target_id,admin_id,reason FROM admin_actions')).rows)
        .toEqual([{ action_type: 'provider_approved', target_id: providerId, admin_id: reviewerId, reason: approvalReview.reason }]);
      expect((await database.query('SELECT user_id,type,data FROM notifications')).rows)
        .toEqual([{ user_id: applicantId, type: 'provider_approved', data: { providerId, revisionId: approvalReview.expectedRevisionId } }]);
    });
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
}, 30000);
