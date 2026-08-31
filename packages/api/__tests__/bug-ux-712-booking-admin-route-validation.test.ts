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

const detailMock = jest.fn();
jest.mock('../src/services/booking-admin.service', () => ({
  getBookingDetail: (...args: unknown[]) => detailMock(...args),
}));

import bookingAdminRouter from '../src/routes/booking-admin.routes';

it('Bug UX-712 — Booking 360 accepts modern UUID versions while malformed identifiers fail before database work', async () => {
  const app = express();
  app.use('/admin/bookings', bookingAdminRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ error: error.message });
  });

  const response = await request(app).get('/admin/bookings/not-a-booking-id');

  expect(response.status).toBe(400);
  expect(response.body.error).toMatch(/valid UUID/i);
  expect(detailMock).not.toHaveBeenCalled();

  const uuidV7 = '0198f711-c7c8-7a42-8c86-43f49d91f2d0';
  detailMock.mockResolvedValueOnce({ id: uuidV7 });
  const validResponse = await request(app).get(`/admin/bookings/${uuidV7}`);

  expect(validResponse.status).toBe(200);
  expect(detailMock).toHaveBeenCalledWith(uuidV7, 'admin');
});
