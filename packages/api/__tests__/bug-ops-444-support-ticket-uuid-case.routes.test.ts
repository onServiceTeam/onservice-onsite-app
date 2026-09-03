import express from 'express';
import request from 'supertest';

const getTicketById = jest.fn();
const getTicketMessages = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'admin-444', role: 'admin' };
    next();
  },
}));
jest.mock('../src/middleware/rbac.middleware', () => ({
  rbacMiddleware: () => (_req: express.Request, _res: express.Response, next: express.NextFunction): void => next(),
}));
jest.mock('../src/services/support-ticket.service', () => ({
  getTicketById: (...args: unknown[]) => getTicketById(...args),
  getTicketMessages: (...args: unknown[]) => getTicketMessages(...args),
  maskTicketForRole: (ticket: unknown) => ticket,
}));

import supportTicketRouter from '../src/routes/support-ticket.routes';

it('Bug OPS-444 - an uppercase support-case UUID reaches exact Admin lookups in canonical form', async () => {
  const ticketId = '44400000-abcd-4abc-8def-000000000444';
  getTicketById.mockResolvedValue({ id: ticketId, user_id: 'customer-444' });
  getTicketMessages.mockResolvedValue([]);
  const app = express();
  app.use('/support-tickets', supportTicketRouter);

  const response = await request(app).get(`/support-tickets/${ticketId.toUpperCase()}`);

  expect(response.status).toBe(200);
  expect(getTicketById).toHaveBeenCalledWith(ticketId);
  expect(getTicketMessages).toHaveBeenCalledWith(ticketId);
});
