// Regression test for the audit IDOR fixes: GET /tips/booking/:id and
// GET /reviews/booking/:id must only return data to a party of the booking
// (gated via bookingService.getBookingById, which throws for non-parties).
// Admins bypass the gate.

import express from 'express';
import request from 'supertest';

// Mutable auth identity the mocked authMiddleware injects per test.
let CURRENT_USER: { userId: string; role: string } = { userId: 'u1', role: 'customer' };
jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = CURRENT_USER;
    next();
  },
}));

const getBookingByIdMock = jest.fn();
jest.mock('../src/services/booking.service', () => ({
  getBookingById: (...a: unknown[]) => getBookingByIdMock(...a),
}));

const getTipsByBookingMock = jest.fn().mockResolvedValue([{ id: 't1', amount: 5000 }]);
jest.mock('../src/services/tip.service', () => ({
  getTipsByBooking: (...a: unknown[]) => getTipsByBookingMock(...a),
  formatTip: (t: unknown) => t,
}));
jest.mock('../src/services/settings.service', () => ({
  getSettingNumber: jest.fn().mockResolvedValue(100000),
}));

const getReviewByBookingMock = jest.fn().mockResolvedValue({ id: 'r1', rating: 5 });
jest.mock('../src/services/review.service', () => ({
  getReviewByBooking: (...a: unknown[]) => getReviewByBookingMock(...a),
  getReviewImages: jest.fn().mockResolvedValue([]),
  formatReview: (r: unknown) => r,
}));
jest.mock('../src/models/db', () => ({ db: { query: jest.fn() } }));

import { createAppError } from '../src/middleware/error.middleware';
import tipRouter from '../src/routes/tip.routes';
import reviewRouter from '../src/routes/review.routes';

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/tips', tipRouter);
  app.use('/api/v1/reviews', reviewRouter);
  // Minimal error handler mapping AppError.statusCode -> HTTP status.
  app.use((err: Error & { statusCode?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction): void => {
    res.status(err.statusCode ?? 500).json({ success: false, error: { message: err.message } });
  });
  return app;
}

beforeEach(() => {
  CURRENT_USER = { userId: 'u1', role: 'customer' };
  getBookingByIdMock.mockReset();
  getTipsByBookingMock.mockClear();
  getReviewByBookingMock.mockClear();
});

describe('IDOR — tips by booking', () => {
  it('blocks a non-party (getBookingById throws) and never reads tips', async () => {
    getBookingByIdMock.mockRejectedValueOnce(createAppError('Booking not found.', 404));
    const res = await request(buildApp()).get('/api/v1/tips/booking/bk1');
    expect(res.status).toBe(404);
    expect(getTipsByBookingMock).not.toHaveBeenCalled();
  });

  it('allows a party (getBookingById resolves) and returns tips', async () => {
    getBookingByIdMock.mockResolvedValueOnce({ id: 'bk1' });
    const res = await request(buildApp()).get('/api/v1/tips/booking/bk1');
    expect(res.status).toBe(200);
    expect(getBookingByIdMock).toHaveBeenCalledWith('bk1', 'u1');
    expect(getTipsByBookingMock).toHaveBeenCalled();
  });

  it('lets an admin bypass the booking-party check', async () => {
    CURRENT_USER = { userId: 'admin1', role: 'admin' };
    const res = await request(buildApp()).get('/api/v1/tips/booking/bk1');
    expect(res.status).toBe(200);
    expect(getBookingByIdMock).not.toHaveBeenCalled();
  });
});

describe('IDOR — review by booking', () => {
  it('blocks a non-party and never reads the review', async () => {
    getBookingByIdMock.mockRejectedValueOnce(createAppError('Booking not found.', 404));
    const res = await request(buildApp()).get('/api/v1/reviews/booking/bk1');
    expect(res.status).toBe(404);
    expect(getReviewByBookingMock).not.toHaveBeenCalled();
  });

  it('allows a party and returns the review', async () => {
    getBookingByIdMock.mockResolvedValueOnce({ id: 'bk1' });
    const res = await request(buildApp()).get('/api/v1/reviews/booking/bk1');
    expect(res.status).toBe(200);
    expect(getReviewByBookingMock).toHaveBeenCalled();
  });
});
