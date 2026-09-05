import express from 'express';
import request from 'supertest';

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
let actorRole = 'super_admin';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      role: actorRole,
    };
    next();
  },
}));
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (...args: unknown[]) => dbTransactionMock(...args),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import adminLatentRouter from '../src/routes/admin-latent.routes';

it('Bug SEC-070 — a privileged session and reason cannot release arbitrary historical audit evidence', async () => {
  const auditLogId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const app = express();
  app.use(express.json());
  app.use('/admin', adminLatentRouter);
  app.use((
    error: { statusCode?: number; code?: string; message?: string },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => res.status(error.statusCode ?? 500).json({ code: error.code, error: error.message }));

  // A raw row is available if the route accidentally reaches the database.
  dbQueryMock.mockResolvedValue({ rows: [{
    id: auditLogId,
    old_values: { confidential_note: 'synthetic-private-evidence' },
    new_values: { email: 'synthetic-person@example.com' },
  }] });
  const reason = 'Investigating a documented privacy request.';
  for (const body of [
    { reason },
    { reason, caseId: auditLogId, fields: ['old_values', 'new_values'], stepUpVerified: true },
  ]) {
    actorRole = 'super_admin';
    const response = await request(app)
      .post(`/admin/audit-log/${auditLogId}/reveal-pii`)
      .send(body);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('governed_audit_evidence_required');
    expect(response.body.error).toContain('masked audit log remains available');
    expect(response.body).not.toHaveProperty('data');
    expect(response.text).not.toContain('synthetic-private-evidence');
    expect(response.text).not.toContain('synthetic-person@example.com');
  }

  for (const role of ['admin', 'dpo', 'support_agent', 'customer', 'provider']) {
    actorRole = role;
    const response = await request(app)
      .post(`/admin/audit-log/${auditLogId}/reveal-pii`)
      .send({ reason });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Super admin access required.');
  }

  // No payload reads, no fabricated successful-reveal audit, no mutations.
  expect(dbQueryMock).not.toHaveBeenCalled();
  expect(dbTransactionMock).not.toHaveBeenCalled();
});
