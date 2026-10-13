// HA-M2-314 (customer human audit 2026-10-13, D38 Milestone 2, package P2
// review fix; P2 overflow number, see HA-M2-310): a provider who offers the
// requested service only as a subcategory (provider_services.category_id is
// NULL, migration 013) is eligible for the request, through the one shared
// eligibility rule (providerEligibleForRequestSql): the fan-out invites them,
// their Requests list shows the request, and their quote is admitted. The
// old job-leads.test.ts asserted this subcategory roll-up only as SQL text;
// none of the real-database tests that replaced it used such a provider.
//
// Setup: provider C serves "Aircon repair" (the request's subcategory) with
// no category row, 1 km from the request. Real fan-out and real HTTP over
// real rows on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, addProvider, flowHttp, insertQuoteRequest, invitesOf,
  providerC, providerUserC, quoteService,
} from './helpers/request-flow-postgres';
import { notifyProvidersOfJobRequest } from '../src/services/job-leads.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-314: a provider who serves the request only through its subcategory is invited, sees it and may quote', async () => {
  await withRequestFlowDatabase(async database => {
    await addProvider(database, { providerId: providerC, userId: providerUserC, servesCategory: false });
    await database.query('INSERT INTO provider_services (provider_id, category_id, subcategory_id) VALUES ($1, NULL, $2)',
      [providerC, quoteService]);
    const bookingId = await insertQuoteRequest(database);

    await notifyProvidersOfJobRequest({ id: bookingId });

    expect((await invitesOf(database, bookingId)).filter(i => i.provider_id === providerC)
      .map(i => [i.round, i.source, i.status])).toEqual([[1, 'push', 'sent']]);
    const provider = flowHttp(providerUserC, 'provider');
    const leads = await provider.leads();
    expect(leads.status).toBe(200);
    expect((leads.body.requests as Array<{ id: string }>).map(r => r.id)).toEqual([bookingId]);
    const quote = await provider.quote(bookingId);
    expect(quote.status).toBe(201);
    expect(quote.body.data).toMatchObject({ booking_id: bookingId, provider_id: providerC });
  });
}, 90000);
