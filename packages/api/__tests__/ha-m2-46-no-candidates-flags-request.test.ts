// HA-M2-46 (customer human audit 2026-10-13, D38 Milestone 2, package P2):
// when round 1 of a new request finds no provider to notify (here both
// eligible providers are switched offline), the request is flagged for the
// back office with reason no_eligible_providers and the customer is told the
// team is reaching out. Real HTTP (the job request and its background
// fan-out) on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, notificationsOf, waitUntil, customerA, providerA, providerB,
} from './helpers/request-flow-postgres';
import { jobRequestBody, quoteService } from './helpers/job-request-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-46: zero candidates in round 1 flags no_eligible_providers and tells the customer', async () => {
  await withRequestFlowDatabase(async database => {
    await database.query('UPDATE providers SET is_available = FALSE WHERE id IN ($1, $2)', [providerA, providerB]);

    const created = await flowHttp(customerA, 'customer').jobRequest(jobRequestBody({ subcategoryId: quoteService }));
    expect(created.status).toBe(201);
    const bookingId = created.body.data.id as string;
    await waitUntil(async () => (await notificationsOf(database, customerA)).some(n => n.type === 'request_ops_review'),
      'the back-office notice');

    expect((await database.query(`SELECT request_ops_review_reason, request_ops_review_at IS NOT NULL AS flagged, status
      FROM bookings WHERE id = $1`, [bookingId])).rows)
      .toEqual([{ request_ops_review_reason: 'no_eligible_providers', flagged: true, status: 'requested' }]);
    expect((await database.query('SELECT COUNT(*)::int AS n FROM job_request_invites WHERE booking_id = $1', [bookingId])).rows[0].n).toBe(0);
  });
}, 90000);
