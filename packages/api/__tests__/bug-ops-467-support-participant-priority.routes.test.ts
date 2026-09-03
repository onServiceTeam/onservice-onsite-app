import express from 'express';
import request from 'supertest';

const createTicketMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'customer-467', role: 'customer' };
    next();
  },
}));
jest.mock('../src/middleware/rbac.middleware', () => ({
  rbacMiddleware: () => (_req: express.Request, _res: express.Response, next: express.NextFunction): void => next(),
}));
jest.mock('../src/services/support-ticket.service', () => ({
  createTicket: (...args: unknown[]) => createTicketMock(...args),
}));

import supportTicketRouter from '../src/routes/support-ticket.routes';

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/support-tickets', supportTicketRouter);
  app.use((err: Error & { statusCode?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction): void => {
    res.status(err.statusCode ?? 500).json({ success: false, error: { message: err.message } });
  });
  return app;
}

it('Bug OPS-467 - participant Support intake cannot choose queue priority outside the explicit urgent-safety path', async () => {
  createTicketMock.mockImplementation(async (input: Record<string, unknown>) => ({
    id: `ticket-${String(input.priority)}`,
    ticket_number: 'TKT-1467',
    type: input.type,
    status: 'open',
    priority: input.priority,
    subject: input.subject,
    description: input.description,
    booking_id: null,
    project_id: null,
    created_at: '2026-09-04T10:00:00.000Z',
    updated_at: '2026-09-04T10:00:00.000Z',
  }));
  const app = buildApp();
  const ordinary = {
    type: 'general_inquiry',
    subject: 'Account question',
    description: 'Please help me understand this account setting.',
  };

  const injectedHigh = await request(app).post('/support-tickets').send({ ...ordinary, priority: 'high' });
  const defaultRequest = await request(app).post('/support-tickets').send(ordinary);
  const safetyRequest = await request(app).post('/support-tickets').send({
    ...ordinary,
    type: 'booking_issue',
    safetyConcern: true,
    subject: 'Safety concern',
  });

  expect([injectedHigh.status, defaultRequest.status, safetyRequest.status]).toEqual([400, 201, 201]);
  expect(createTicketMock).toHaveBeenCalledTimes(2);
  expect(createTicketMock.mock.calls[0]?.[0]).toMatchObject({ priority: 'medium' });
  expect(createTicketMock.mock.calls[1]?.[0]).toMatchObject({ priority: 'urgent' });
});
