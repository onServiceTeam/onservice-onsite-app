import express from 'express';
import request from 'supertest';

const maskTicketForRoleMock = jest.fn((ticket: Record<string, unknown>) => ({
  ...ticket,
  user_email: 'j***@example.com',
}));
const TICKET_ID = '11111111-1111-4111-8111-111111111111';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'admin-1', role: 'admin' };
    next();
  },
}));
jest.mock('../src/middleware/rbac.middleware', () => ({
  rbacMiddleware:
    () =>
    (_req: express.Request, _res: express.Response, next: express.NextFunction): void =>
      next(),
}));
jest.mock('../src/services/support-ticket.service', () => ({
  listTickets: jest.fn(),
  maskTicketForRole: (...args: unknown[]) =>
    maskTicketForRoleMock(...(args as [Record<string, unknown>])),
  listAssignableAgents: jest.fn(),
  listMyTickets: jest.fn(),
  getTicketById: jest.fn().mockResolvedValue({ id: TICKET_ID, user_email: 'jane@example.com' }),
  getTicketMessages: jest.fn().mockResolvedValue([{ id: 'message-1', message: 'Help' }]),
  createTicket: jest.fn(),
  addMessage: jest.fn(),
  updateTicketStatus: jest.fn(),
  assignTicket: jest.fn(),
}));

import supportRouter from '../src/routes/support-ticket.routes';

it('Bug UX-006 — masks customer contact data in the admin support case response', async () => {
  const app = express();
  app.use(express.json());
  app.use('/support-tickets', supportRouter);

  const response = await request(app).get(`/support-tickets/${TICKET_ID}`);

  expect(response.status).toBe(200);
  expect(maskTicketForRoleMock).toHaveBeenCalledWith(
    expect.objectContaining({ id: TICKET_ID }),
    'admin',
  );
  expect(response.body.data.user_email).toBe('j***@example.com');
  expect(response.body.data.messages).toHaveLength(1);
});
