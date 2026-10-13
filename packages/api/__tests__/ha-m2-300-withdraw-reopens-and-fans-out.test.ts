// HA-M2-300 (customer human audit 2026-10-13, D38 Milestone 2, package P2;
// critique M13): a provider can withdraw their own live quote. The quote
// becomes 'withdrawn' and its invite 'passed', and with no live quote left
// the request reopens for round 2 and goes out to the other eligible
// providers, never back to the provider who withdrew. The customer is told.
// Real HTTP on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, addProvider, invitesOf, notificationsOf,
  customerA, providerA, providerB, providerC, providerUserA, providerUserC,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-300: withdraw reopens and fans out, excluding the withdrawing provider', async () => {
  await withRequestFlowDatabase(async database => {
    await addProvider(database, { providerId: providerC, userId: providerUserC });
    const bookingId = await insertQuoteRequest(database);
    const quoteId = (await flowHttp(providerUserA, 'provider').quote(bookingId)).body.data.id;

    const response = await flowHttp(providerUserA, 'provider').withdraw(bookingId, quoteId);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ quoteId, bookingStatus: 'requested', round: 2, reopened: true });
    expect((await database.query('SELECT status FROM booking_quotes WHERE id = $1', [quoteId])).rows[0].status).toBe('withdrawn');
    const invites = await invitesOf(database, bookingId);
    expect(invites.find(i => i.provider_id === providerA && i.round === 1)).toMatchObject({ status: 'passed' });
    expect(invites.filter(i => i.round === 2).map(i => i.provider_id).sort()).toEqual([providerB, providerC].sort());
    expect((await notificationsOf(database, customerA)).filter(n => n.type === 'quote_withdrawn').map(n => n.body))
      .toEqual(['Synthetic Aircon Team A withdrew their quote. We\'ve sent your request to more pros.']);
  });
}, 90000);
