import { randomUUID } from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import adminRouter from '../src/routes/admin.routes';
import latentRouter from '../src/routes/admin-latent.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { draftIntegrationIt as it } from './helpers/provider-draft-postgres';
import { approvalReview } from './helpers/provider-approval-postgres';
import { applicantId } from './helpers/provider-submission-postgres';
import { reviewCredential, revisionReviewerId } from './helpers/provider-revision-review-postgres';
import { withDecisionDatabase } from './helpers/provider-decision-postgres';

jest.mock('../src/services/settings.service', () => ({ getMaxProviderServiceRadiusKm: jest.fn().mockResolvedValue(50) }));

it('Bug OPS-515 — both authorized HTTP decision routes require and forward the reviewed revision for approval and rejection', async () => {
  for (const compatibility of [false, true]) for (const decision of ['approved', 'rejected'] as const) {
    await withDecisionDatabase(async ({ database, providerId, revisionId }) => {
      await database.query("UPDATE users SET role='super_admin' WHERE id=$1", [revisionReviewerId]);
      const app = express();
      app.use(express.json()); app.use(cookieParser());
      app.use('/api/v1/admin', adminRouter, latentRouter); app.use(errorMiddleware);
      const path = compatibility ? `/api/v1/admin/provider-applications/${applicantId}/decide`
        : `/api/v1/admin/providers/${providerId}/${decision === 'approved' ? 'approve' : 'reject'}`;
      const body = { reason: approvalReview.reason,
        ...(decision === 'approved' ? { checklistConfirmed: true, checklistSummary: approvalReview.checklistSummary } : {}),
        ...(compatibility ? { decision } : {}) };
      const send = (payload: object) => (compatibility ? request(app).post(path) : request(app).put(path))
        .auth(reviewCredential('super_admin'), { type: 'bearer' }).send(payload);
      expect((await send(body)).status).toBe(400);
      const wrong = await send({ ...body, expectedRevisionId: randomUUID() });
      expect(wrong.status).toBe(409);
      expect(wrong.body.error.code).toBe('provider_application_revision_conflict');
      expect((await database.query('SELECT * FROM provider_application_decisions')).rows).toEqual([]);
      const accepted = await send({ ...body, expectedRevisionId: revisionId });
      expect(accepted.status).toBe(200);
      expect((await database.query('SELECT provider_id,revision_id,decision FROM provider_application_decisions')).rows)
        .toEqual([{ provider_id: providerId, revision_id: revisionId, decision }]);
    });
  }
}, 30000);
