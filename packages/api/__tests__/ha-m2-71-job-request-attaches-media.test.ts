// HA-M2-71 (customer human audit 2026-10-13, D38 Milestone 2, W3 step I1):
// POST /bookings/job-request with mediaIds attaches the customer's stored
// uploads to the new request inside the same database transaction as the
// request insert. Proof of "same transaction": PostgreSQL's NOW() is the
// transaction start time, so each photo's attached_at equals the request's
// created_at exactly; separate transactions would give different times.
// The photos are real files uploaded through the real job-media router; the
// request goes through the real booking route. The test waits for the
// route's background fan-out to finish before the fixture is dropped
// (waitForRequestFanOut). Guarded PostgreSQL fixture with the real
// migrations 183 and 184.
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import { flowHttp, quoteService } from './helpers/request-flow-postgres';
import { jobRequestBody } from './helpers/job-request-postgres';
import { mediaHttp, syntheticJpeg, uploadThroughApi } from './helpers/job-media-postgres';
import { waitForRequestFanOut, withRequestMediaDatabase } from './helpers/request-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-71: createJobRequest attaches stored media in the same transaction as the request', async () => {
  await withRequestMediaDatabase(async database => {
    const uploads = mediaHttp(customerA, 'customer');
    const first = await uploadThroughApi(uploads, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg({ scanBytes: 600 }) });
    const second = await uploadThroughApi(uploads, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg({ scanBytes: 700 }) });
    expect([first.completed.status, second.completed.status]).toEqual([200, 200]);

    const created = await flowHttp(customerA, 'customer')
      .jobRequest(jobRequestBody({ subcategoryId: quoteService, mediaIds: [first.id, second.id] }));
    expect(created.status).toBe(201);
    const bookingId = created.body.data.id as string;
    await waitForRequestFanOut(database, bookingId);

    const rows = (await database.query(`SELECT m.id, m.status, m.booking_id, m.attached_at = b.created_at AS same_transaction
        FROM job_media m JOIN bookings b ON b.id = $1
       WHERE m.id = ANY($2::uuid[]) ORDER BY m.id`, [bookingId, [first.id, second.id]])).rows;
    expect(rows).toEqual([first.id, second.id].sort().map(id => ({
      id, status: 'attached', booking_id: bookingId, same_transaction: true,
    })));
  });
}, 90000);
