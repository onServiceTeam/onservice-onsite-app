// HA-M2-366 (customer human audit 2026-10-13, D38 Milestone 2, W3 step I1;
// W3-A fix-round overflow number, split out of HA-M2-323): a later retry of
// "Send request" with the same clientRequestId and the same photo is
// answered from the replay check before the photo is locked (critique 2.3:
// the replay check runs before media is locked, so a replay never touches
// the media the first attempt attached).
// Proof: after the first request is stored with the photo attached, the test
// holds the photo's row lock in another transaction (as the cleanup job or a
// second request would) and sends the retry. The retry must come back with
// 200 and the first request while the lock is still held. If createJobRequest
// locked the media before the replay check, the retry would block on the row
// lock instead; the test watches pg_stat_activity for that. The lock is then
// released. Real HTTP on the guarded PostgreSQL fixture with the real
// migrations 183 and 184; the background fan-out is awaited before the
// fixture is dropped.
import crypto from 'node:crypto';
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import { flowHttp, quoteService } from './helpers/request-flow-postgres';
import { jobRequestBody } from './helpers/job-request-postgres';
import {
  insertStoredMedia, lockWaiterCount, mediaStates, requestCount, waitForRequestFanOut, withRequestMediaDatabase,
} from './helpers/request-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-366: a later retry with the same clientRequestId and media is answered before the media is locked', async () => {
  await withRequestMediaDatabase(async database => {
    const photo = await insertStoredMedia(database, customerA);
    const customer = flowHttp(customerA, 'customer');
    const body = jobRequestBody({ subcategoryId: quoteService, mediaIds: [photo], clientRequestId: crypto.randomUUID() });
    const first = await customer.jobRequest(body);
    expect(first.status).toBe(201);
    const bookingId = first.body.data.id as string;
    await waitForRequestFanOut(database, bookingId);

    const blocker = await database.connect();
    const seen: { retry?: typeof first; blockedOnMediaLock: boolean } = { blockedOnMediaLock: false };
    let pending: Promise<void> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM job_media WHERE id = $1 FOR UPDATE', [photo]);
      pending = customer.jobRequest(body).then(response => { seen.retry = response; });
      const deadline = Date.now() + 10_000;
      while (!seen.retry && !seen.blockedOnMediaLock) {
        if (Date.now() > deadline) throw new Error('The retry neither answered nor blocked');
        seen.blockedOnMediaLock = (await lockWaiterCount(database)) > 0;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    } finally {
      await blocker.query('COMMIT');
      blocker.release();
      await pending;
    }

    expect(seen.blockedOnMediaLock).toBe(false);
    expect(seen.retry!.status).toBe(200);
    expect(seen.retry!.body.data).toMatchObject({ id: bookingId, replayed: true });
    expect(await requestCount(database, customerA)).toBe(1);
    expect(await mediaStates(database, [photo])).toEqual([{ status: 'attached', booking_id: bookingId }]);
  });
}, 90000);
