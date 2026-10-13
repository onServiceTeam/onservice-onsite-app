// HA-M2-63 (customer human audit 2026-10-13, D38 Milestone 2, package P2): the
// customer gets exactly one "new quote" notice when a quote is admitted, sent
// after the commit, naming the provider, price and service; a refused quote
// (the request was already taken) sends nothing. Before D38 the new_quote
// type existed but was never sent. Real HTTP and real notification rows on
// the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, notificationsOf, customerA, providerUserA, providerUserB,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-63: exactly one new_quote after commit, none for a failed submit', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);
    const admitted = await flowHttp(providerUserA, 'provider').quote(bookingId);
    expect(admitted.status).toBe(201);

    const refused = await flowHttp(providerUserB, 'provider').quote(bookingId);
    expect(refused.status).toBe(409);

    const newQuotes = (await notificationsOf(database, customerA)).filter(n => n.type === 'new_quote');
    expect(newQuotes).toHaveLength(1);
    expect(newQuotes[0]).toMatchObject({
      title: 'New quote from Synthetic Aircon Team A',
      body: 'Synthetic Aircon Team A quoted ₱800.00 for Aircon repair. Tap to review.',
      data: expect.objectContaining({ bookingId, quoteId: admitted.body.data.id }),
    });
  });
}, 90000);
