import express from 'express';
import request from 'supertest';

const TICKET_ID = '46500000-abcd-4abc-8def-000000000465';
const listMyTicketsMock = jest.fn();
const getTicketByIdMock = jest.fn();
const getTicketMessagesMock = jest.fn();
const createTicketMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'customer-465', role: 'customer' };
    next();
  },
}));
jest.mock('../src/middleware/rbac.middleware', () => ({
  rbacMiddleware: () => (_req: express.Request, _res: express.Response, next: express.NextFunction): void => next(),
}));
jest.mock('../src/services/support-ticket.service', () => ({
  listMyTickets: (...args: unknown[]) => listMyTicketsMock(...args),
  getTicketById: (...args: unknown[]) => getTicketByIdMock(...args),
  getTicketMessages: (...args: unknown[]) => getTicketMessagesMock(...args),
  createTicket: (...args: unknown[]) => createTicketMock(...args),
}));

import supportTicketRouter from '../src/routes/support-ticket.routes';

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/support-tickets', supportTicketRouter);
  app.use((err: Error & { statusCode?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction): void => {
    res.status(err.statusCode ?? 500).json({ success: false, error: { message: err.message } });
  });
  return app;
}

it('Bug OPS-465 - participant Support endpoints expose only the participant-safe ticket contract', async () => {
  const rawTicket = {
    id: TICKET_ID,
    ticket_number: 'TKT-1465',
    user_id: 'customer-465',
    assigned_agent_id: 'agent-private-465',
    type: 'general_inquiry',
    status: 'resolved',
    priority: 'medium',
    subject: 'Account access question',
    description: 'Please help me understand my account access.',
    booking_id: null,
    project_id: null,
    business_account_id: null,
    related_business_account_id: null,
    business_account_name: null,
    business_account_status: null,
    project_title: null,
    resolution_notes: 'Internal callback and identity-check details.',
    resolved_at: '2026-09-04T09:30:00.000Z',
    closed_at: null,
    created_at: '2026-09-04T09:00:00.000Z',
    updated_at: '2026-09-04T09:30:00.000Z',
    user_phone: '+639171234567',
    user_email: 'participant@example.com',
    user_first_name: 'Maria',
    user_last_name: 'Santos',
    user_role: 'customer',
    provider_id: null,
    provider_business_name: null,
    agent_first_name: 'Ana',
    agent_last_name: 'Reyes',
    message_count: '2',
    first_agent_reply_at: '2026-09-04T09:10:00.000Z',
    needs_agent_reply: false,
  };
  listMyTicketsMock.mockResolvedValue({ tickets: [rawTicket], total: 1 });
  getTicketByIdMock.mockResolvedValue(rawTicket);
  getTicketMessagesMock.mockResolvedValue([{ id: 'message-465', message: 'Public outcome.' }]);
  createTicketMock.mockResolvedValue({ ...rawTicket, status: 'open', resolution_notes: null });
  const app = buildApp();

  const listResponse = await request(app).get('/api/v1/support-tickets/mine');
  const detailResponse = await request(app).get(`/api/v1/support-tickets/mine/${TICKET_ID}`);
  const createResponse = await request(app).post('/api/v1/support-tickets').send({
    type: 'general_inquiry',
    subject: 'Account access question',
    description: 'Please help me understand my account access.',
  });

  expect([listResponse.status, detailResponse.status, createResponse.status]).toEqual([200, 200, 201]);
  const participantTickets = [listResponse.body.data[0], detailResponse.body.data, createResponse.body.data];
  const internalFields = [
    'user_id',
    'assigned_agent_id',
    'business_account_id',
    'business_account_status',
    'resolution_notes',
    'resolved_at',
    'closed_at',
    'user_phone',
    'user_email',
    'user_first_name',
    'user_last_name',
    'user_role',
    'provider_id',
    'provider_business_name',
    'agent_first_name',
    'agent_last_name',
    'first_agent_reply_at',
    'needs_agent_reply',
  ];
  for (const ticket of participantTickets) {
    expect(ticket).toMatchObject({
      id: TICKET_ID,
      ticket_number: 'TKT-1465',
      subject: 'Account access question',
    });
    for (const field of internalFields) expect(ticket).not.toHaveProperty(field);
  }
  expect(detailResponse.body.data.messages).toEqual([{ id: 'message-465', message: 'Public outcome.' }]);
});
