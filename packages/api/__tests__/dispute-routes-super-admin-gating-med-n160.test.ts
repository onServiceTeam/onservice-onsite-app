import express from 'express';
import request from 'supertest';

const listDisputesMock = jest.fn();
const getDisputeByIdMock = jest.fn();
const getDisputeEvidenceMock = jest.fn();
const resolveDisputeMock = jest.fn();
const escalateDisputeMock = jest.fn();
const assignDisputeMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    const role = req.header('x-test-role') ?? 'admin';
    (req as express.Request & { user: unknown }).user = {
      userId: `${role}-user`, role, iat: 0, exp: 0,
    };
    next();
  },
}));
jest.mock('../src/services/dispute.service', () => ({
  listDisputes: (...args: unknown[]) => listDisputesMock(...args),
  getDisputeById: (...args: unknown[]) => getDisputeByIdMock(...args),
  getDisputeEvidence: (...args: unknown[]) => getDisputeEvidenceMock(...args),
  resolveDispute: (...args: unknown[]) => resolveDisputeMock(...args),
  escalateDispute: (...args: unknown[]) => escalateDisputeMock(...args),
  assignDispute: (...args: unknown[]) => assignDisputeMock(...args),
  formatDispute: (value: unknown) => value,
  formatEvidence: (value: unknown) => value,
}));
jest.mock('../src/models/db', () => ({ db: { query: jest.fn() } }));
jest.mock('../src/services/dispute-party-settlement-hold.service', () => ({
  assertDisputePartySettlementEnabled: jest.fn(),
}));

import disputeRouter from '../src/routes/dispute.routes';

it('MED-N160 - ordinary admins can inspect disputes but only super admins can mutate them', async () => {
  const dispute = { id: 'dispute-med-n160', booking_id: 'booking-med-n160', filed_by: 'customer-1' };
  listDisputesMock.mockResolvedValue({ disputes: [dispute], total: 1 });
  getDisputeByIdMock.mockResolvedValue(dispute);
  getDisputeEvidenceMock.mockResolvedValue([]);
  resolveDisputeMock.mockResolvedValue({ ...dispute, status: 'resolved' });
  escalateDisputeMock.mockResolvedValue({ ...dispute, tier: 2 });
  assignDisputeMock.mockResolvedValue({ ...dispute, assigned_to: 'assignee-med-n160' });

  const app = express();
  app.use(express.json());
  app.use('/disputes', disputeRouter);
  app.use((
    error: { statusCode?: number; message?: string },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => res.status(error.statusCode ?? 500).json({ error: error.message ?? 'error' }));

  const adminList = await request(app).get('/disputes');
  const adminDetail = await request(app).get('/disputes/dispute-med-n160');
  expect(adminList.status).toBe(200);
  expect(adminDetail.status).toBe(200);

  const adminResolve = await request(app).put('/disputes/dispute-med-n160/resolve').send({
    resolutionType: 'full_refund',
    decisionNotes: 'The customer evidence supports a complete refund.',
  });
  const adminEscalate = await request(app).post('/disputes/dispute-med-n160/escalate').send({
    reason: 'Senior financial review is required.',
  });
  const adminAssign = await request(app).put('/disputes/dispute-med-n160/assign').send({
    assigneeId: '20000000-0000-4000-8000-000000000160',
  });

  expect([adminResolve.status, adminEscalate.status, adminAssign.status]).toEqual([403, 403, 403]);
  expect(resolveDisputeMock).not.toHaveBeenCalled();
  expect(escalateDisputeMock).not.toHaveBeenCalled();
  expect(assignDisputeMock).not.toHaveBeenCalled();

  const superAdminHeaders = { 'x-test-role': 'super_admin' };
  const superResolve = await request(app)
    .put('/disputes/dispute-med-n160/resolve')
    .set(superAdminHeaders)
    .send({
      resolutionType: 'full_refund',
      decisionNotes: 'The customer evidence supports a complete refund.',
    });
  const superEscalate = await request(app)
    .post('/disputes/dispute-med-n160/escalate')
    .set(superAdminHeaders)
    .send({ reason: 'Senior financial review is required.' });
  const superAssign = await request(app)
    .put('/disputes/dispute-med-n160/assign')
    .set(superAdminHeaders)
    .send({ assigneeId: '20000000-0000-4000-8000-000000000160' });

  expect([superResolve.status, superEscalate.status, superAssign.status]).toEqual([200, 200, 200]);
  expect(resolveDisputeMock).toHaveBeenCalledWith(
    'dispute-med-n160',
    'super_admin-user',
    {
      resolutionType: 'full_refund',
      decisionNotes: 'The customer evidence supports a complete refund.',
    },
  );
  expect(escalateDisputeMock).toHaveBeenCalledWith(
    'dispute-med-n160',
    'super_admin-user',
    'Senior financial review is required.',
  );
  expect(assignDisputeMock).toHaveBeenCalledWith(
    'dispute-med-n160',
    'super_admin-user',
    '20000000-0000-4000-8000-000000000160',
  );
});
