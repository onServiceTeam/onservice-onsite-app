// HA-M2-295 (customer human audit 2026-10-13, D38 Milestone 2, package P2;
// critique M9): a double tap on "Send request" with the same clientRequestId
// stores one request. Two taps sent at the same moment and a later retry all
// answer with the same booking: one 201 and two 200 with replayed: true. A
// tap that loses the race at the database's unique index gets the winner's
// request back, and a later retry is answered before anything is checked.
// Providers are invited and notified once. Real concurrent HTTP (job
// requests and the background fan-out) on the guarded PostgreSQL fixture.
import crypto from 'node:crypto';
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, invitesOf, notificationsOf, waitUntil, customerA, providerUserA, providerUserB,
} from './helpers/request-flow-postgres';
import { jobRequestBody, quoteService } from './helpers/job-request-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-295: a clientRequestId replay of job-request returns the same booking and invites once', async () => {
  await withRequestFlowDatabase(async database => {
    const customer = flowHttp(customerA, 'customer');
    const body = jobRequestBody({ subcategoryId: quoteService, clientRequestId: crypto.randomUUID() });

    const taps = await Promise.all([customer.jobRequest(body), customer.jobRequest(body)]);
    const winner = taps.find(r => r.status === 201)!;
    expect(winner).toBeDefined();
    const bookingId = winner.body.data.id as string;
    await waitUntil(async () => (await invitesOf(database, bookingId)).length === 2, 'the fan-out');
    const retry = await customer.jobRequest(body);
    await new Promise(resolve => setTimeout(resolve, 300));

    expect([...taps, retry].map(r => r.status).sort()).toEqual([200, 200, 201]);
    for (const replay of [...taps, retry].filter(r => r.status === 200)) {
      expect(replay.body.data).toMatchObject({ id: bookingId, replayed: true });
    }
    expect((await database.query(`SELECT COUNT(*)::int AS n FROM bookings WHERE customer_id = $1 AND booking_type = 'quote_based'`,
      [customerA])).rows[0].n).toBe(1);
    expect(await invitesOf(database, bookingId)).toHaveLength(2);
    for (const userId of [providerUserA, providerUserB]) {
      expect((await notificationsOf(database, userId)).map(n => n.type)).toEqual(['new_job_request']);
    }
  });
}, 90000);
