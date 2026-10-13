// HA-M2-323 (customer human audit 2026-10-13, D38 Milestone 2, W3 step I1;
// W3-A overflow number): two taps on "Send request" at the same moment, with
// the same clientRequestId and the same photo, store one request; the losing
// tap gets the winner's request back as a replay, never a media error.
// The race is forced: the test holds the photo's row lock until both
// requests are blocked on it inside their transactions, so both have passed
// the replay check (which found nothing yet). The loser then finds the photo
// attached by the winner (JOB_MEDIA_ALREADY_USED inside createJobRequest)
// and must answer with the winner's request (critique 2.3). One request is
// stored, the photo is attached to it, and providers are invited once. A
// later retry, answered before the photo is locked, is HA-M2-366. Real
// concurrent HTTP on the guarded PostgreSQL fixture; the winner's background
// fan-out is awaited before the fixture is dropped.
import crypto from 'node:crypto';
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import { flowHttp, invitesOf, quoteService } from './helpers/request-flow-postgres';
import { jobRequestBody } from './helpers/job-request-postgres';
import {
  insertStoredMedia, mediaStates, requestCount, waitForLockWaiters, waitForRequestFanOut, withRequestMediaDatabase,
} from './helpers/request-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-323: two simultaneous taps with the same clientRequestId and media store one request; the loser gets a replay', async () => {
  await withRequestMediaDatabase(async database => {
    const photo = await insertStoredMedia(database, customerA);
    const customer = flowHttp(customerA, 'customer');
    const body = jobRequestBody({ subcategoryId: quoteService, mediaIds: [photo], clientRequestId: crypto.randomUUID() });

    const blocker = await database.connect();
    let taps;
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM job_media WHERE id = $1 FOR UPDATE', [photo]);
      const both = Promise.all([customer.jobRequest(body), customer.jobRequest(body)]);
      await waitForLockWaiters(database, 2);
      await blocker.query('COMMIT');
      taps = await both;
    } finally {
      blocker.release();
    }

    expect(taps.map(r => r.status).sort()).toEqual([200, 201]);
    const bookingId = taps.find(r => r.status === 201)!.body.data.id as string;
    expect(taps.find(r => r.status === 200)!.body.data).toMatchObject({ id: bookingId, replayed: true });
    await waitForRequestFanOut(database, bookingId);
    expect(await requestCount(database, customerA)).toBe(1);
    expect(await mediaStates(database, [photo])).toEqual([{ status: 'attached', booking_id: bookingId }]);
    expect(await invitesOf(database, bookingId)).toHaveLength(2);
  });
}, 90000);
