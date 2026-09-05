import express from 'express';
import request from 'supertest';

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
const approveMock = jest.fn();
const rejectMock = jest.fn();
let actorRole = 'super_admin';
const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const providerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const adminId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (...args: unknown[]) => dbTransactionMock(...args),
  },
}));
jest.mock('../src/services/admin.service', () => ({
  approveProvider: (...args: unknown[]) => approveMock(...args),
  rejectProvider: (...args: unknown[]) => rejectMock(...args),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: adminId, role: actorRole };
    next();
  },
}));

import adminLatentRouter from '../src/routes/admin-latent.routes';

it('Bug OPS-473 — the compatibility decision route uses Provider 360 validation and cannot decide a separate progress record', async () => {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminLatentRouter);
  app.use((error: { statusCode?: number; code?: string; message?: string },
    _req: express.Request, res: express.Response, _next: express.NextFunction,
  ) => res.status(error.statusCode ?? 500).json({ code: error.code, error: error.message }));
  const endpoint = `/admin/provider-applications/${userId}/decide`;
  const reason = 'Documents and identity were reviewed against the supplied evidence.';
  const checklistSummary = 'Identity, background clearance and service qualifications reviewed.';
  dbQueryMock.mockResolvedValue({ rows: [{ id: providerId }] });
  approveMock.mockResolvedValue(undefined);
  rejectMock.mockResolvedValue(undefined);

  const approved = await request(app).post(endpoint).send({
    decision: 'approved', reason, checklistConfirmed: true, checklistSummary,
  });
  expect(approved.status).toBe(200);
  expect(approved.body.data).toEqual({ providerId, userId, status: 'approved' });
  expect(approveMock).toHaveBeenLastCalledWith(providerId, adminId, {
    reason, checklistConfirmed: true, checklistSummary,
  });

  // Canonical failures propagate; the adapter must not write an independent
  // approval when KYC/checklist validation or the pending-state guard fails.
  approveMock.mockRejectedValueOnce(Object.assign(new Error('Checklist required'), { statusCode: 400 }));
  const missingChecklist = await request(app).post(endpoint).send({ decision: 'approved', reason });
  expect(missingChecklist.status).toBe(400);
  expect(approveMock).toHaveBeenLastCalledWith(providerId, adminId, {
    reason, checklistConfirmed: undefined, checklistSummary: undefined,
  });
  approveMock.mockRejectedValueOnce(Object.assign(new Error('Already decided'), { statusCode: 404 }));
  expect((await request(app).post(endpoint).send({ decision: 'approved', reason })).status).toBe(404);

  const rejected = await request(app).post(endpoint).send({ decision: 'rejected', reason });
  expect(rejected.status).toBe(200);
  expect(rejectMock).toHaveBeenLastCalledWith(providerId, adminId, reason);
  expect(rejected.body.data.status).toBe('rejected');

  const readsBeforeInvalid = dbQueryMock.mock.calls.length;
  const sentBack = await request(app).post(endpoint).send({ decision: 'sent_back', reason });
  expect(sentBack.status).toBe(409);
  expect(sentBack.body.code).toBe('provider_application_resubmission_required');
  expect((await request(app).post(endpoint).send({ decision: 'rejected', reason: 'short' })).status).toBe(400);
  expect((await request(app).post(endpoint).send({ decision: 'rejected', reason: 'x'.repeat(1001) })).status).toBe(400);
  expect((await request(app).post('/admin/provider-applications/invalid/decide')
    .send({ decision: 'approved', reason })).status).toBe(400);
  actorRole = 'customer';
  expect((await request(app).post(endpoint).send({ decision: 'approved', reason })).status).toBe(403);
  expect(dbQueryMock).toHaveBeenCalledTimes(readsBeforeInvalid);

  actorRole = 'super_admin';
  dbQueryMock.mockResolvedValueOnce({ rows: [] });
  expect((await request(app).post(endpoint).send({ decision: 'approved', reason })).status).toBe(404);
  expect(approveMock).toHaveBeenCalledTimes(3);
  expect(rejectMock).toHaveBeenCalledTimes(1);
  for (const [sql, params] of dbQueryMock.mock.calls) {
    expect(sql).toBe('SELECT id FROM providers WHERE user_id = $1');
    expect(params).toEqual([userId]);
  }
  expect(dbTransactionMock).not.toHaveBeenCalled();
});
