// HA-M2-59 (customer human audit 2026-10-13, D38 Milestone 2, package P2): a
// customer with no idea of the price sends "Not sure" (budgetUnknown). It is
// stored and shown to providers on the lead; sending it together with a
// budget is refused with 400 and nothing is stored. Real HTTP (job request,
// then the provider list) on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, invitesOf, waitUntil, customerA, providerUserA,
} from './helpers/request-flow-postgres';
import { jobRequestBody, quoteService } from './helpers/job-request-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-59: budgetUnknown is stored, refused with a budget, and shown in the lead', async () => {
  await withRequestFlowDatabase(async database => {
    const customer = flowHttp(customerA, 'customer');
    const countRequests = async () => (await database.query(`SELECT COUNT(*)::int AS n FROM bookings
      WHERE customer_id = $1 AND booking_type = 'quote_based'`, [customerA])).rows[0].n as number;

    const both = await customer.jobRequest(jobRequestBody({ subcategoryId: quoteService, budgetUnknown: true, budgetMax: 90000 }));
    expect(both.status).toBe(400);
    expect(await countRequests()).toBe(0);

    const unsure = await customer.jobRequest(jobRequestBody({ subcategoryId: quoteService, budgetUnknown: true }));
    expect(unsure.status).toBe(201);
    const bookingId = unsure.body.data.id as string;
    await waitUntil(async () => (await invitesOf(database, bookingId)).length === 2, 'the fan-out');
    expect(unsure.body.data).toMatchObject({ budgetUnknown: true, budgetMin: null, budgetMax: null, requestRound: 1 });
    expect((await database.query('SELECT budget_unknown, budget_min, budget_max FROM bookings WHERE id = $1', [bookingId])).rows)
      .toEqual([{ budget_unknown: true, budget_min: null, budget_max: null }]);

    const lead = (await flowHttp(providerUserA, 'provider').leads()).body.requests[0];
    expect(lead).toMatchObject({ id: bookingId, budgetUnknown: true, budgetMin: null, budgetMax: null });
  });
}, 90000);
