// HA-M2-39 (customer human audit 2026-10-13, D38 Milestone 2, package P2):
// once the customer has declined every quote in request_max_rounds rounds
// (set to 1 here), the request is flagged for back-office review (reason
// max_rounds) instead of being sent out again: no new-round invites and no
// reopened-request notices, and the customer is told the team is reaching
// out. Real HTTP and real rows on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, notificationsOf, invitesOf, upsertPlatformSetting,
  customerA, providerUserA, providerUserB,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-39: after max rounds the request is flagged, not re-sent, and the customer is told', async () => {
  await withRequestFlowDatabase(async database => {
    await upsertPlatformSetting(database, 'request_max_rounds', '1');
    const bookingId = await insertQuoteRequest(database);
    const quote = await flowHttp(providerUserA, 'provider').quote(bookingId);

    const response = await flowHttp(customerA, 'customer').decline(bookingId, quote.body.data.id, { reason: 'changed_mind' });

    expect(response.body.data).toMatchObject({ bookingStatus: 'requested', round: 2, reopened: false, opsReview: true });
    expect((await database.query(`SELECT request_ops_review_reason, request_ops_review_at IS NOT NULL AS flagged
      FROM bookings WHERE id = $1`, [bookingId])).rows).toEqual([{ request_ops_review_reason: 'max_rounds', flagged: true }]);
    expect((await invitesOf(database, bookingId)).filter(i => i.round === 2)).toEqual([]);
    expect((await notificationsOf(database, providerUserB)).filter(n => n.type === 'job_request_reopened')).toEqual([]);
    expect((await notificationsOf(database, customerA)).filter(n => n.type === 'request_ops_review').map(n => n.body))
      .toEqual(['We\'re reaching out to more pros. Our team may contact you.']);
  });
}, 90000);
