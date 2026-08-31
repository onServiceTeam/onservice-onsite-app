import express from 'express';
import request from 'supertest';

const queryMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    const requestedRole = req.header('x-test-role');
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      role: requestedRole === 'super_admin' ? 'super_admin' : 'admin',
    };
    next();
  },
}));

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
  },
}));

import cancellationPolicyRouter from '../src/routes/cancellation-policy-admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/admin/cancellation-policies', cancellationPolicyRouter);
  app.use(errorMiddleware);
  return app;
}

beforeEach(() => {
  queryMock.mockReset();
});

it('Bug UX-793 — an ordinary admin can inspect customer policy versions and the E09 governance state', async () => {
  queryMock.mockResolvedValue({
    rows: [{
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      version: 3,
      effective_from: new Date('2026-08-01T00:00:00.000Z'),
      effective_to: null,
      created_by: null,
      created_at: new Date('2026-08-01T00:00:00.000Z'),
      intro_text: 'Customer-facing cancellation text.',
      legal_disclaimer: 'Customer-facing disclaimer.',
      tiers: [{ min_hours_before: 24, max_hours_before: null, refund_percent: 100, fee_percent: 0, label: '24+ hours' }],
      provider_no_show_credit_php: 200,
      creator_first_name: null,
      creator_last_name: null,
    }],
  });

  const response = await request(buildApp()).get('/admin/cancellation-policies');

  expect(response.status).toBe(200);
  expect(response.body.data).toHaveLength(1);
  expect(response.body.governance).toEqual({
    status: 'held', escalation: 'E09', displayOnly: true, mutationsAllowed: false,
  });
});

it('Bug UX-794 — creating a customer-facing policy version is rejected while E09 is open', async () => {
  const response = await request(buildApp())
    .post('/admin/cancellation-policies')
    .set('x-test-role', 'super_admin')
    .send({ tiers: [] });

  expect(response.status).toBe(409);
  expect(response.body.error.message).toMatch(/E09/);
  expect(queryMock).not.toHaveBeenCalled();
});

it('Bug UX-795 — editing an active customer-facing policy is rejected while E09 is open', async () => {
  const response = await request(buildApp())
    .put('/admin/cancellation-policies/3')
    .set('x-test-role', 'super_admin')
    .send({ tiers: [] });

  expect(response.status).toBe(409);
  expect(response.body.error.message).toMatch(/E09/);
  expect(queryMock).not.toHaveBeenCalled();
});

it('Bug UX-796 — malformed cancellation policy versions are rejected before a database read', async () => {
  const response = await request(buildApp()).get('/admin/cancellation-policies/1e2');

  expect(response.status).toBe(400);
  expect(queryMock).not.toHaveBeenCalled();
});
