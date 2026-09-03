import express from 'express';
import request from 'supertest';

const listTickets = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'admin-443', role: 'admin' };
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

it('Bug OPS-443 - uppercase support queue UUID filters reach the service in canonical form', async () => {
  const bookingId = '44300000-abcd-4abc-8def-000000000443';
  const userId = '44300000-abcd-4abc-8def-000000000444';
  const providerId = '44300000-abcd-4abc-8def-000000000445';
  const agentId = '44300000-abcd-4abc-8def-000000000446';
  listTickets.mockResolvedValue({ tickets: [], total: 0 });
  const app = express();
  app.use('/support-tickets', supportTicketRouter);

  const response = await request(app).get('/support-tickets').query({
    bookingId: bookingId.toUpperCase(),
    userId: userId.toUpperCase(),
    relatedProviderId: providerId.toUpperCase(),
    assignedAgentId: agentId.toUpperCase(),
  });

  expect(response.status).toBe(200);
  expect(listTickets).toHaveBeenCalledWith(expect.objectContaining({
    bookingId,
    userId,
    relatedProviderId: providerId,
    assignedAgentId: agentId,
  }));
});
