// Segregation of duties for the generic DSR status PATCH.
// Terminal DSR decisions (completed / rejected) are super_admin-only,
// matching the dedicated /dsr/:id/{complete,reject,escalate} endpoints.
// Pre-fix a base admin could reach the terminal state through the generic
// PATCH /dsr/:id, bypassing the super_admin gate on those endpoints
// (NPC RA 10173 segregation of duties).

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

  it('allows a base admin to set the non-terminal in_progress status', async () => {
    updateMock.mockResolvedValueOnce({ id: 'd1', status: 'in_progress' });
    const res = await request(buildApp()).patch('/api/v1/admin/compliance/dsr/d1').send({ newStatus: 'in_progress' });
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalled();
  });

  it('allows a super_admin to set the terminal completed status', async () => {
    CURRENT_USER = { userId: 's1', role: 'super_admin' };
    const res = await request(buildApp()).patch('/api/v1/admin/compliance/dsr/d1').send({ newStatus: 'completed' });
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalled();
  });
});
