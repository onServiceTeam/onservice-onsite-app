import express from 'express';
import request from 'supertest';

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

const sendMessageMock = jest.fn();
jest.mock('../src/services/booking-admin.service', () => ({
  sendAdminMessageToBookingParticipants: (...args: unknown[]) => sendMessageMock(...args),
}));

import bookingAdminRouter from '../src/routes/booking-admin.routes';

it('Bug UX-481 — a support admin can post an audited booking-participant update without receiving super-admin money authority', async () => {
  sendMessageMock.mockResolvedValueOnce({ bookingId: 'booking-1', messageId: 'message-1' });
  const app = express();
  app.use(express.json());
  app.use('/admin/bookings', bookingAdminRouter);

  const response = await request(app)
    .post('/admin/bookings/booking-1/message')
    .send({ message: 'Support is checking this booking with both parties.' });

  expect(response.status).toBe(200);
  expect(sendMessageMock).toHaveBeenCalledWith(
    'booking-1',
    'Support is checking this booking with both parties.',
    'admin-1',
  );
});
