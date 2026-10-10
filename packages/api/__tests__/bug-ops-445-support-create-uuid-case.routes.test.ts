import express from 'express';
import request from 'supertest';

const createTicket = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = { userId: 'admin-445', role: 'admin' };
    next();
  },
}));
jest.mock('../src/middleware/rbac.middleware', () => ({
  rbacMiddleware: () => (_req: express.Request, _res: express.Response, next: express.NextFunction): void => next(),
}));
jest.mock('../src/services/support-ticket.service', () => ({
  createTicket: (...args: unknown[]) => createTicket(...args),
}));

import supportTicketRouter from '../src/routes/support-ticket.routes';

it('Bug OPS-445 - agent-created support ownership and booking UUIDs are canonical before linkage checks', async () => {
  const userId = '44500000-abcd-4abc-8def-000000000445';
  const bookingId = '44500000-abcd-4abc-8def-000000000446';
  createTicket.mockResolvedValue({ id: 'ticket-445', ticket_number: 'TKT-445' });
  const app = express();
  app.use(express.json());
  app.use('/support-tickets', supportTicketRouter);

  const response = await request(app)
    .post('/support-tickets/admin')
    .send({
      userId: userId.toUpperCase(),
      bookingId: bookingId.toUpperCase(),
      type: 'booking_issue',
      priority: 'high',
      subject: 'Review booking linkage',
      description: 'The customer asked support to inspect this booking.',
    });

  expect(response.status).toBe(201);
  expect(createTicket).toHaveBeenCalledWith(expect.objectContaining({
    userId,
    bookingId,
    createdByAdminId: 'admin-445',
  }));
});
