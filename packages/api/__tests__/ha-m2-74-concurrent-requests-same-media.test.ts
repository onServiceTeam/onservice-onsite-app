// HA-M2-74 (customer human audit 2026-10-13, D38 Milestone 2, W3 step I1):
// two job requests sent at the same moment with the same photo: exactly one
// is stored and gets the photo; the other is refused with 409
// JOB_MEDIA_ALREADY_USED and stores nothing. The race is forced, not hoped
// for: the test holds the photo's row lock while both requests are sent,
// waits until both are blocked on it inside their transactions, then lets
// them through. The winner's background fan-out is awaited before the
// fixture is dropped (waitForRequestFanOut). Real concurrent HTTP on the
// guarded PostgreSQL fixture with the real migrations 183 and 184.
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import { flowHttp, quoteService } from './helpers/request-flow-postgres';
import { jobRequestBody } from './helpers/job-request-postgres';
import {
  insertStoredMedia, mediaStates, requestCount, waitForLockWaiters, waitForRequestFanOut, withRequestMediaDatabase,
} from './helpers/request-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-74: concurrent requests with the same media: exactly one succeeds', async () => {
  await withRequestMediaDatabase(async database => {
    const photo = await insertStoredMedia(database, customerA);
    const customer = flowHttp(customerA, 'customer');

    const blocker = await database.connect();
    let responses;
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM job_media WHERE id = $1 FOR UPDATE', [photo]);
      const both = Promise.all([
        customer.jobRequest(jobRequestBody({ subcategoryId: quoteService, mediaIds: [photo] })),
        customer.jobRequest(jobRequestBody({ subcategoryId: quoteService, mediaIds: [photo], urgency: 'flexible' })),
      ]);
      await waitForLockWaiters(database, 2);
      await blocker.query('COMMIT');
      responses = await both;
    } finally {
      blocker.release();
    }

    expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
    const winner = responses.find(r => r.status === 201)!;
    const loser = responses.find(r => r.status === 409)!;
    expect(loser.body.error).toMatchObject({ statusCode: 409, code: 'JOB_MEDIA_ALREADY_USED' });
    const bookingId = winner.body.data.id as string;
    await waitForRequestFanOut(database, bookingId);
    expect(await requestCount(database, customerA)).toBe(1);
    expect(await mediaStates(database, [photo])).toEqual([{ status: 'attached', booking_id: bookingId }]);
  });
}, 90000);
