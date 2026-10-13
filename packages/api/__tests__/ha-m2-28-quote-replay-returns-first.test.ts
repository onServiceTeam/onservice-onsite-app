// HA-M2-28 (customer human audit 2026-10-13, D38 Milestone 2, package P2):
// a provider app that retries a quote with the same clientRequestId gets the
// first quote back (200, replayed: true), even when the retry carries a
// different price and arrives after the customer already accepted the quote
// (critique L2: the replay is answered before the status checks, so a slow
// retry never reads as "no longer accepting quotes"). No second row is
// stored and the customer is not told twice. Real HTTP on the guarded
// PostgreSQL fixture.
import crypto from 'node:crypto';
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, quoteBody, customerA, providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-28: a clientRequestId replay returns the first quote with 200 and stores no new row', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);
    const clientRequestId = crypto.randomUUID();
    const provider = flowHttp(providerUserA, 'provider');
    const first = await provider.quote(bookingId, quoteBody({ clientRequestId }));
    expect(first.status).toBe(201);
    expect((await flowHttp(customerA, 'customer').accept(bookingId, first.body.data.id)).status).toBe(200);

    const retry = await provider.quote(bookingId, quoteBody({ clientRequestId, quotedPrice: 99000 }));

    expect(retry.status).toBe(200);
    expect(retry.body.data).toMatchObject({
      id: first.body.data.id, quoted_price: 80000, client_request_id: clientRequestId, status: 'accepted', replayed: true,
    });
    expect((await database.query('SELECT id FROM booking_quotes WHERE booking_id = $1', [bookingId])).rows)
      .toEqual([{ id: first.body.data.id }]);
    expect((await database.query(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND type = 'new_quote'`,
      [customerA])).rows[0].n).toBe(1);
  });
}, 90000);
