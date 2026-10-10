import express from 'express';
import request from 'supertest';

const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'operator', role: 'super_admin' };
    next();
  },
}));

import adminLatentRouter from '../src/routes/admin-latent.routes';

it('Bug OPS-472 — the application queue includes real pending providers without legacy onboarding-progress records', async () => {
  const applied = new Date('2026-09-05T00:00:00Z');
  const legacyCreated = new Date('2026-08-01T00:00:00Z');
  const legacyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const newId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  dbQueryMock.mockImplementation(async (sql: string, params: unknown[]) => {
    // The real application path has no progress row to join against. Refuse
    // to make such a query look successful by returning provider fixtures.
    if (!/FROM providers p/.test(sql) || /provider_onboarding_progress/.test(sql)) {
      throw new Error('Queue did not read the submitted provider applications');
    }
    expect(sql).toContain("WHERE p.status = 'pending'");
    expect(sql).toContain('COALESCE(p.applied_at, p.created_at) ASC, p.id ASC');
    expect(params).toEqual([200]);
    return { rows: [
      { id: legacyId, user_id: 'legacy-user', business_name: 'Legacy Cleaner', status: 'pending',
        applied_at: null, created_at: legacyCreated, updated_at: legacyCreated },
      { id: newId, user_id: 'new-user', business_name: 'New Painter', status: 'pending',
        applied_at: applied, created_at: applied, updated_at: applied },
    ] };
  });
  const app = express();
  app.use('/admin', adminLatentRouter);
  const response = await request(app).get('/admin/provider-applications?limit=999');

  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ schemaVersion: 2, source: 'provider_applications', data: [
    { providerId: legacyId, userId: 'legacy-user', status: 'pending',
      submittedForReviewAt: null, submissionTimeMissing: true, reviewPath: `/providers/${legacyId}` },
    { providerId: newId, userId: 'new-user', status: 'pending',
      submittedForReviewAt: applied.toISOString(), submissionTimeMissing: false, reviewPath: `/providers/${newId}` },
  ] });
  expect(response.body.data).toHaveLength(2);
  for (const application of response.body.data) {
    expect(application).not.toHaveProperty('dataSnapshot');
    expect(application).not.toHaveProperty('estimatedDecisionAt');
    expect(application).not.toHaveProperty('stepsCompleted');
  }
  expect(dbQueryMock).toHaveBeenCalledTimes(1);
});
