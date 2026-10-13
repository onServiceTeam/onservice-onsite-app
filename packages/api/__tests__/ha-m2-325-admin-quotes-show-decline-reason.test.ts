// HA-M2-325 (customer human audit 2026-10-13, D38 Milestone 2; W3-A overflow
// number): the admin Booking 360 quotes endpoint (GET
// /admin/bookings/:id/quotes) shows the customer's decline reason on a quote
// the customer declined, so support can see why a request reopened. The
// customer's free-text decline note (which may hold contact details) is never
// returned. The decline goes through the customer's real route; the admin
// endpoint is the real router behind the real authentication middleware. The
// change-order tables it also reads come from the real migrations 018 and
// 141. Guarded PostgreSQL fixture.
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { bookingIntegrationIt as it, operatorId, syntheticSecret } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuote, insertQuoteRequest, customerA, providerA,
} from './helpers/request-flow-postgres';
import { readMigration } from './helpers/request-engine-postgres';
import bookingAdminRouter from '../src/routes/booking-admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

function adminQuotes(bookingId: string) {
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/v1/admin/bookings', bookingAdminRouter);
  app.use(errorMiddleware);
  const token = jwt.sign({ userId: operatorId, role: 'super_admin', sessionVersion: 1, type: 'access' }, syntheticSecret, { expiresIn: '5m' });
  return request(app).get(`/api/v1/admin/bookings/${bookingId}/quotes`).set('Authorization', `Bearer ${token}`);
}

it('HA-M2-325: the admin quotes endpoint shows the customer\'s decline reason and never the note', async () => {
  await withRequestFlowDatabase(async database => {
    await database.query(readMigration('018_quotes_change_orders.sql'));
    await database.query(readMigration('141_change_order_line_items.sql'));
    const bookingId = await insertQuoteRequest(database, { status: 'quoted' });
    const quoteId = await insertQuote(database, { bookingId, providerId: providerA });
    const note = 'Too slow for me, text me on 0917 555 0101 instead';
    expect((await flowHttp(customerA, 'customer').decline(bookingId, quoteId, { reason: 'timing', note })).status).toBe(200);

    const response = await adminQuotes(bookingId);

    expect(response.status).toBe(200);
    expect(response.body.data.quotes.map((q: { id: string; status: string; declineReason: string | null }) =>
      [q.id, q.status, q.declineReason])).toEqual([[quoteId, 'declined', 'timing']]);
    expect(JSON.stringify(response.body)).not.toContain('0917');
  });
}, 90000);
