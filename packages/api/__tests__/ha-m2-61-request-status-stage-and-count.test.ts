// HA-M2-61 (customer human audit 2026-10-13, D38 Milestone 2, package P2): the
// customer's request status reports the stage ("waiting" until a quote
// arrives, then "quote_ready") and how many providers this round notified,
// with the round limits the screen shows. Real HTTP (job request with its
// fan-out, a quote, then the status) on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, invitesOf, waitUntil, customerA, providerUserA,
} from './helpers/request-flow-postgres';
import { jobRequestBody, quoteService } from './helpers/job-request-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-61: request-status reports the stage and the round\'s notified provider count', async () => {
  await withRequestFlowDatabase(async database => {
    const customer = flowHttp(customerA, 'customer');
    const created = await customer.jobRequest(jobRequestBody({ subcategoryId: quoteService }));
    const bookingId = created.body.data.id as string;
    await waitUntil(async () => (await invitesOf(database, bookingId)).length === 2, 'the fan-out');

    const waiting = await customer.requestStatus(bookingId);

    expect(waiting.status).toBe(200);
    expect(waiting.body.data).toMatchObject({
      bookingId, status: 'requested', stage: 'waiting', serviceName: 'Aircon repair', round: 1, maxRounds: 3,
      notifiedProviderCount: 2, openQuoteCount: 0, maxOpenQuotes: 1, stillLookingAfterMinutes: 30,
      stillLooking: false, opsReviewAt: null,
    });
    await flowHttp(providerUserA, 'provider').quote(bookingId);
    expect((await customer.requestStatus(bookingId)).body.data).toMatchObject({
      status: 'quoted', stage: 'quote_ready', openQuoteCount: 1, notifiedProviderCount: 2,
    });
  });
}, 90000);
