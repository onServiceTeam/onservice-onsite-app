import express from 'express';
import request from 'supertest';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'staff-1',
      role: 'provider_staff',
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

const getTicketByIdMock = jest.fn();
const addMessageMock = jest.fn();
jest.mock('../src/services/support-ticket.service', () => ({
  getTicketById: (...args: unknown[]) => getTicketByIdMock(...args),
  addMessage: (...args: unknown[]) => addMessageMock(...args),
  listTickets: jest.fn(),
  listAssignableAgents: jest.fn(),
  listMyTickets: jest.fn(),
  getTicketMessages: jest.fn(),
  createTicket: jest.fn(),
  updateTicketStatus: jest.fn(),
  assignTicket: jest.fn(),
  maskTicketForRole: (ticket: unknown) => ticket,
}));

import supportRouter from '../src/routes/support-ticket.routes';

it('Bug UX-057 — stores provider staff support replies under the database-supported provider sender role', async () => {
  getTicketByIdMock.mockResolvedValueOnce({ id: 'ticket-1', user_id: 'staff-1' });
  addMessageMock.mockResolvedValueOnce({ id: 'message-1' });
  const app = express();
  app.use(express.json());
  app.use('/support-tickets', supportRouter);

  const response = await request(app)
    .post('/support-tickets/ticket-1/messages')
    .send({ message: 'Please help with this assigned job.' });

  expect(response.status).toBe(201);
  expect(addMessageMock).toHaveBeenCalledWith(expect.objectContaining({
    senderId: 'staff-1',
    senderRole: 'provider',
  }));
});
