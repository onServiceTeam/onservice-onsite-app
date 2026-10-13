// HA-M2-319 (customer human audit 2026-10-13, D38 Milestone 2; W3-A overflow
// number for an item the P2 build report left untested): GET
// /api/v1/bookings/requests/summary gives the Bookings-tab badge, the number
// of the customer's open quote requests that have at least one live quote
// waiting for their decision. Counted for customer A: a request with two live
// quotes (counts once) and a request with one live quote. Not counted: a
// request whose only quote expired, one whose only quote the customer
// declined, a cancelled request that still has a live quote row, a request
// with no quote, and customer B's request with a live quote. Real HTTP on the
// guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuote, insertQuoteRequest, customerA, customerB, providerA, providerB,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-319: the request summary counts the customer\'s requests with a quote awaiting their decision', async () => {
  await withRequestFlowDatabase(async database => {
    const twoLive = await insertQuoteRequest(database, { status: 'quoted' });
    await insertQuote(database, { bookingId: twoLive, providerId: providerA });
    await insertQuote(database, { bookingId: twoLive, providerId: providerB });
    const oneLive = await insertQuoteRequest(database, { status: 'quoted' });
    await insertQuote(database, { bookingId: oneLive, providerId: providerA });
    const expiredOnly = await insertQuoteRequest(database, { status: 'quoted' });
    await insertQuote(database, { bookingId: expiredOnly, providerId: providerA, expiresAtSql: "NOW() - INTERVAL '1 minute'" });
    const declinedOnly = await insertQuoteRequest(database);
    await insertQuote(database, { bookingId: declinedOnly, providerId: providerA, status: 'declined', declineReason: 'timing' });
    const cancelled = await insertQuoteRequest(database, { status: 'cancelled_by_customer' });
    await insertQuote(database, { bookingId: cancelled, providerId: providerA });
    await insertQuoteRequest(database);
    const otherCustomer = await insertQuoteRequest(database, { customerId: customerB, status: 'quoted' });
    await insertQuote(database, { bookingId: otherCustomer, providerId: providerA });

    const summary = await flowHttp(customerA, 'customer').requestSummary();

    expect(summary.status).toBe(200);
    expect(summary.body.data).toEqual({ awaitingDecisionCount: 2 });
  });
}, 90000);
