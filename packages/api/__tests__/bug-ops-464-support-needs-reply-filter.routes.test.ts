import express from 'express';
import request from 'supertest';

const listTickets = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'admin-464', role: 'admin' };
    next();
  },
}));
jest.mock('../src/middleware/rbac.middleware', () => ({
  rbacMiddleware: () => (_req: express.Request, _res: express.Response, next: express.NextFunction): void => next(),
}));
jest.mock('../src/services/support-ticket.service', () => ({
  listTickets: (...args: unknown[]) => listTickets(...args),
  maskTicketForRole: (ticket: unknown) => ticket,
}));

import supportTicketRouter from '../src/routes/support-ticket.routes';

it('Bug OPS-464 - Admin needsReply query input reaches the Support service only as a validated boolean', async () => {
  listTickets.mockResolvedValue({ tickets: [], total: 0 });
  const app = express();
  app.use('/support-tickets', supportTicketRouter);

  const response = await request(app).get('/support-tickets?needsReply=true');

  expect(response.status).toBe(200);
  expect(listTickets).toHaveBeenCalledWith(expect.objectContaining({ needsReply: true }));
});
