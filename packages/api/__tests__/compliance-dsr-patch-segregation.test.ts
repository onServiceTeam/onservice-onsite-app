// Retirement and segregation of duties for the generic DSR status PATCH.
// D34 makes the dedicated DPO role (plus super-admin fallback) the owner of
// every DSR read and transition. Plain operations admins never receive a
// partially writable DSR surface.

import express from 'express';
import request from 'supertest';

let CURRENT_USER: { userId: string; role: string } = { userId: 'a1', role: 'admin' };
jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = CURRENT_USER;
    next();
  },
}));
jest.mock('../src/services/compliance.service', () => ({
  updateDsrStatus: jest.fn().mockResolvedValue({ id: 'd1', status: 'completed' }),
}));
jest.mock('../src/services/compliance-admin.service', () => ({}));

import complianceAdminRouter from '../src/routes/compliance-admin.routes';
import * as compliance from '../src/services/compliance.service';

const updateMock = compliance.updateDsrStatus as jest.Mock;

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/admin/compliance', complianceAdminRouter);
  app.use((err: Error & { statusCode?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction): void => {
    res.status(err.statusCode ?? 500).json({ success: false, error: { message: err.message } });
  });
  return app;
}

beforeEach(() => {
  CURRENT_USER = { userId: 'a1', role: 'admin' };
  updateMock.mockClear().mockResolvedValue({ id: 'd1', status: 'completed' });
});

describe('DSR PATCH — segregation of duties', () => {
  it('blocks a base admin from setting completed (403) and never updates', async () => {
    const res = await request(buildApp()).patch('/api/v1/admin/compliance/dsr/d1').send({ newStatus: 'completed' });
    expect(res.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('blocks a base admin from setting rejected (403) and never updates', async () => {
    const res = await request(buildApp()).patch('/api/v1/admin/compliance/dsr/d1').send({ newStatus: 'rejected' });
    expect(res.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('blocks a base admin from setting the non-terminal in_progress status', async () => {
    updateMock.mockResolvedValueOnce({ id: 'd1', status: 'in_progress' });
    const res = await request(buildApp()).patch('/api/v1/admin/compliance/dsr/d1').send({ newStatus: 'in_progress' });
    expect(res.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('Bug UX-802 — generic DPO mutation is retired so dedicated audited actions cannot be bypassed', async () => {
    CURRENT_USER = { userId: 'dpo-1', role: 'dpo' };
    const res = await request(buildApp())
      .patch('/api/v1/admin/compliance/dsr/00000000-0000-0000-0000-000000000001')
      .send({ newStatus: 'completed' });
    expect(res.status).toBe(410);
    expect(res.body.error.message).toMatch(/dedicated complete, request-info, reject, or escalate/i);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
