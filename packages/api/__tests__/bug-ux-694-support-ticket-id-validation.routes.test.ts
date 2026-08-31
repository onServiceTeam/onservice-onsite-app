import express from 'express';
import request from 'supertest';

const getTicketByIdMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      role: 'admin',
    };
    next();
  },
}));
jest.mock('../src/middleware/rbac.middleware', () => ({
  rbacMiddleware: () => (_req: express.Request, _res: express.Response, next: express.NextFunction): void => next(),
}));
jest.mock('../src/services/support-ticket.service', () => ({
  getTicketById: (...args: unknown[]) => getTicketByIdMock(...args),
  listTickets: jest.fn(),
  getSupportQueueSummary: jest.fn(),
  listAssignableAgents: jest.fn(),
  listMyTickets: jest.fn(),
  getTicketStatusHistory: jest.fn(),
  getTicketMessages: jest.fn(),
  createTicket: jest.fn(),
  addMessage: jest.fn(),
  updateTicketStatus: jest.fn(),
  updateTicketPriority: jest.fn(),
  assignTicket: jest.fn(),
  maskTicketForRole: (ticket: unknown) => ticket,
}));

import supportRouter from '../src/routes/support-ticket.routes';

it('Bug UX-694 — malformed support-case IDs are rejected before any database-backed service call', async () => {
  const app = express();
  app.use(express.json());
  app.use('/support-tickets', supportRouter);
  app.use((err: Error & { statusCode?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction): void => {
    res.status(err.statusCode ?? 500).json({ message: err.message });
  });

  const response = await request(app).get('/support-tickets/not-a-uuid');

  expect(response.status).toBe(400);
  expect(getTicketByIdMock).not.toHaveBeenCalled();
});
