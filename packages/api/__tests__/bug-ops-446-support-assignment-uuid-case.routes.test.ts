import express from 'express';
import request from 'supertest';

const assignTicket = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'admin-446', role: 'admin' };
    next();
  },
}));
jest.mock('../src/middleware/rbac.middleware', () => ({
  rbacMiddleware: () => (_req: express.Request, _res: express.Response, next: express.NextFunction): void => next(),
}));
jest.mock('../src/services/support-ticket.service', () => ({
  assignTicket: (...args: unknown[]) => assignTicket(...args),
}));

import supportTicketRouter from '../src/routes/support-ticket.routes';

it('Bug OPS-446 - support assignment canonicalizes both case and agent UUIDs before mutation', async () => {
  const ticketId = '44600000-abcd-4abc-8def-000000000446';
  const agentId = '44600000-abcd-4abc-8def-000000000447';
  assignTicket.mockResolvedValue({ id: ticketId, assigned_agent_id: agentId });
  const app = express();
  app.use(express.json());
  app.use('/support-tickets', supportTicketRouter);

  const response = await request(app)
    .patch(`/support-tickets/${ticketId.toUpperCase()}/assign`)
    .send({ agentId: agentId.toUpperCase() });

  expect(response.status).toBe(200);
  expect(assignTicket).toHaveBeenCalledWith(ticketId, agentId, 'admin-446');
});
