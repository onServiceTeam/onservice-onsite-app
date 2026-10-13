// HA-M2-22 (customer human audit 2026-10-13, D38 Milestone 2, package P2):
// only live quotes count toward request_max_open_quotes. A request already
// holding a declined quote, a withdrawn quote and an expired quote (from three
// other providers) still admits a new quote at cap 1. This also fixes the
// pre-D38 bug where declined quotes used up the limit. Real HTTP on the
// guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, insertQuote, addProvider, providerUserA,
  providerC, providerUserC, providerD, providerUserD, providerE, providerUserE,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-22: declined, withdrawn and expired quotes do not use the open-quote cap', async () => {
  await withRequestFlowDatabase(async database => {
    await addProvider(database, { providerId: providerC, userId: providerUserC });
    await addProvider(database, { providerId: providerD, userId: providerUserD });
    await addProvider(database, { providerId: providerE, userId: providerUserE });
    const bookingId = await insertQuoteRequest(database, { round: 2 });
    await insertQuote(database, { bookingId, providerId: providerC, status: 'declined', declineReason: 'too_expensive' });
    await insertQuote(database, { bookingId, providerId: providerD, status: 'withdrawn' });
    await insertQuote(database, { bookingId, providerId: providerE, status: 'expired', expiresAtSql: "NOW() - INTERVAL '1 hour'" });

    const response = await flowHttp(providerUserA, 'provider').quote(bookingId);

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ status: 'submitted', round: 2 });
    expect((await database.query('SELECT status FROM bookings WHERE id = $1', [bookingId])).rows[0].status).toBe('quoted');
  });
}, 90000);
