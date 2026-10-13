// HA-M2-54 (customer human audit 2026-10-13, D38 Milestone 2, package P2;
// merged plan bad news 8): a provider reading a request's quotes sees only
// their own quote, before acceptance and after it, including the provider
// who was booked (before D38 the booked provider could read every
// competitor's quote and declined amount). The customer still sees every
// quote. Compare mode (request_max_open_quotes 5) so two providers quote.
// Real HTTP on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, upsertPlatformSetting, quoteBody,
  customerA, providerA, providerB, providerUserA, providerUserB,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-54: a provider sees only their own quote, including the assigned provider', async () => {
  await withRequestFlowDatabase(async database => {
    await upsertPlatformSetting(database, 'request_max_open_quotes', '5');
    const bookingId = await insertQuoteRequest(database);
    const providerAHttp = flowHttp(providerUserA, 'provider');
    const providerBHttp = flowHttp(providerUserB, 'provider');
    const quoteA = (await providerAHttp.quote(bookingId)).body.data.id;
    const quoteB = (await providerBHttp.quote(bookingId, quoteBody({ quotedPrice: 95000, earliestTimeWindow: 'afternoon' }))).body.data.id;
    const providerIdsSeenBy = async (http: ReturnType<typeof flowHttp>) =>
      ((await http.quotes(bookingId)).body.data as Array<{ providerId: string }>).map(q => q.providerId);

    expect(await providerIdsSeenBy(providerAHttp)).toEqual([providerA]);
    expect(await providerIdsSeenBy(providerBHttp)).toEqual([providerB]);
    expect((await flowHttp(customerA, 'customer').accept(bookingId, quoteA)).status).toBe(200);

    const assignedView = await providerAHttp.quotes(bookingId);
    expect(assignedView.status).toBe(200);
    expect(assignedView.body.data.map((q: { id: string }) => q.id)).toEqual([quoteA]);
    expect(JSON.stringify(assignedView.body.data)).not.toContain('95000');
    expect(await providerIdsSeenBy(providerBHttp)).toEqual([providerB]);
    expect((await flowHttp(customerA, 'customer').quotes(bookingId)).body.data.map((q: { id: string }) => q.id).sort())
      .toEqual([quoteA, quoteB].sort());
  });
}, 90000);
