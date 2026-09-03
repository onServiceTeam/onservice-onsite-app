import express from 'express';
import request from 'supertest';

const createTicket = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: '44700000-abcd-4abc-8def-000000000447',
      role: 'customer',
    };
    next();
  },
}));
jest.mock('../src/services/support-ticket.service', () => ({
  createTicket: (...args: unknown[]) => createTicket(...args),
}));

import supportTicketRouter from '../src/routes/support-ticket.routes';

it('Bug OPS-447 - participant support creation canonicalizes its linked booking before ownership checks', async () => {
  const customerId = '44700000-abcd-4abc-8def-000000000447';
  const bookingId = '44700000-abcd-4abc-8def-000000000448';
  createTicket.mockResolvedValue({ id: 'ticket-447', ticket_number: 'TKT-447' });
  const app = express();
  app.use(express.json());
  app.use('/support-tickets', supportTicketRouter);

  const response = await request(app)
    .post('/support-tickets')
    .send({
      bookingId: bookingId.toUpperCase(),
      type: 'booking_issue',
      priority: 'medium',
      subject: 'Booking support request',
      description: 'Please help me review this booking record.',
    });

  expect(response.status).toBe(201);
  expect(createTicket).toHaveBeenCalledWith(expect.objectContaining({
    userId: customerId,
    bookingId,
  }));
  expect(createTicket.mock.calls[0]?.[0]).not.toHaveProperty('createdByAdminId');
});
