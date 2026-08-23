import express from 'express';
import request from 'supertest';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      role: 'admin',
    };
    next();
  },
}));
jest.mock('../src/middleware/rbac.middleware', () => ({
  rbacMiddleware: () => (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => next(),
}));

const createTicketMock = jest.fn();
jest.mock('../src/services/support-ticket.service', () => ({
  createTicket: (...args: unknown[]) => createTicketMock(...args),
  listTickets: jest.fn(),
  listAssignableAgents: jest.fn(),
  listMyTickets: jest.fn(),
  getTicketById: jest.fn(),
  getTicketMessages: jest.fn(),
  addMessage: jest.fn(),
  updateTicketStatus: jest.fn(),
  assignTicket: jest.fn(),
  maskTicketForRole: (ticket: unknown) => ticket,
}));

import supportRouter from '../src/routes/support-ticket.routes';

it('Bug UX-061 — creates an account-owned case with the acting admin recorded', async () => {
  createTicketMock.mockResolvedValueOnce({ id: 'ticket-1' });
  const app = express();
  app.use(express.json());
  app.use('/support-tickets', supportRouter);

  const response = await request(app).post('/support-tickets/admin').send({
    userId: '11111111-1111-4111-8111-111111111111',
    type: 'general_inquiry',
    priority: 'medium',
    subject: 'Messenger follow-up',
    description: 'Customer contacted support through Messenger.',
  });

  expect(response.status).toBe(201);
  expect(createTicketMock).toHaveBeenCalledWith(expect.objectContaining({
    userId: '11111111-1111-4111-8111-111111111111',
    createdByAdminId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  }));
});
