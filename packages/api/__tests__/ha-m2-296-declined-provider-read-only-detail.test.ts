// HA-M2-296 (customer human audit 2026-10-13, D38 Milestone 2, package P2;
// critique M6): a provider whose quote was declined can still open the
// request (for My quotes and their thread), read-only and area-only, with
// their own quote attached (myQuote). Opening it records nothing: no invite
// is created for the reopened round. Real HTTP through the mounted provider
// route on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, invitesOf, customerA, providerA, providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-296: a provider with a declined quote gets the read-only detail with myQuote', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);
    const provider = flowHttp(providerUserA, 'provider');
    const quote = (await provider.quote(bookingId)).body.data;
    await flowHttp(customerA, 'customer').decline(bookingId, quote.id, { reason: 'too_expensive' });
    const invitesBefore = await invitesOf(database, bookingId);

    const detail = await provider.lead(bookingId);

    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({
      id: bookingId, round: 2, city: 'Cebu City',
      myQuote: {
        id: quote.id, status: 'declined', quotedPrice: 80000,
        earliestDate: quote.earliest_date, earliestTimeWindow: 'morning',
      },
    });
    expect(detail.body.data).not.toHaveProperty('address');
    expect(await invitesOf(database, bookingId)).toEqual(invitesBefore);
    expect(invitesBefore.some(i => i.provider_id === providerA && i.round === 2)).toBe(false);
  });
}, 90000);
