import express from 'express';
import request from 'supertest';

const bookingId = '11111111-1111-1111-1111-111111111111';
const checklistId = '22222222-2222-2222-2222-222222222222';
const templateId = '33333333-3333-3333-3333-333333333333';
const staffUserId = '44444444-4444-4444-4444-444444444444';
const now = new Date('2026-08-25T10:00:00.000Z');

const dbQueryMock = jest.fn(async (sql: string) => {
  if (sql.includes('FROM bookings b')) {
    return {
      rows: [{
        id: bookingId,
        category_id: 'category-1',
        provider_user_id: 'provider-owner-1',
        staff_user_id: staffUserId,
        staff_status: 'approved',
        customer_id: 'customer-1',
        status: 'in_progress',
      }],
      rowCount: 1,
    };
  }
  if (sql.includes('FROM booking_checklists')) {
    return {
      rows: [{
        id: checklistId,
        template_id: templateId,
        template_version: 1,
        shown_at: now,
      }],
      rowCount: 1,
    };
  }
  if (sql.includes('AS section_id')) return { rows: [], rowCount: 0 };
  throw new Error(`Unexpected SQL: ${sql}`);
});

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: staffUserId,
      role: 'provider_staff',
      iat: 0,
      exp: 0,
    };
    next();
  },
}));

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...(args as [string])),
    transaction: jest.fn(),
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import checklistRouter from '../src/routes/checklist.routes';

it('Bug UX-301 — assigned approved provider staff can open the booking checklist', async () => {
  const app = express();
  app.use(express.json());
  app.use(checklistRouter);
  app.use((
    error: { statusCode?: number; message?: string },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => res.status(error.statusCode ?? 500).json({ error: error.message ?? 'error' }));

  const response = await request(app).get(`/jobs/${bookingId}/checklist`);

  expect(response.status).toBe(200);
  expect(response.body.data).toMatchObject({
    bookingChecklistId: checklistId,
    templateId,
  });
});
