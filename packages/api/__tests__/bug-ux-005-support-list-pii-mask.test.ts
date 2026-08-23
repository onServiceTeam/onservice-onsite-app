import express from 'express';
import request from 'supertest';

const maskTicketForRoleMock = jest.fn((ticket: Record<string, unknown>) => ({
  ...ticket,
  user_phone: '+63 9** *** 4567',
}));

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
  listTickets: jest.fn().mockResolvedValue({
    tickets: [{ id: 'ticket-1', user_phone: '+639171234567' }],
    total: 1,
  }),
  maskTicketForRole: (...args: unknown[]) =>
    maskTicketForRoleMock(...(args as [Record<string, unknown>])),
  listAssignableAgents: jest.fn(),
  listMyTickets: jest.fn(),
  getTicketById: jest.fn(),
  getTicketMessages: jest.fn(),
  createTicket: jest.fn(),
  addMessage: jest.fn(),
  updateTicketStatus: jest.fn(),
  assignTicket: jest.fn(),
}));

import supportRouter from '../src/routes/support-ticket.routes';

it('Bug UX-005 — masks customer contact data in the admin support queue response', async () => {
  const app = express();
  app.use(express.json());
  app.use('/support-tickets', supportRouter);

  const response = await request(app).get('/support-tickets');

  expect(response.status).toBe(200);
  expect(maskTicketForRoleMock).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'ticket-1' }),
    'admin',
  );
  expect(response.body.data[0].user_phone).toBe('+63 9** *** 4567');
});
