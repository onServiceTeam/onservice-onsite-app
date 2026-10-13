// HA-M2-72 (customer human audit 2026-10-13, D38 Milestone 2, W3 step I1): a
// job request that names another customer's upload is refused with 400
// JOB_MEDIA_UNAVAILABLE. No request is stored, nobody is notified, and both
// customers' uploads stay stored and unattached (the customer's own photo in
// the same request is not attached either). Real HTTP on the guarded
// PostgreSQL fixture with the real migrations 183 and 184.
import { bookingIntegrationIt as it, customerA, customerB } from './helpers/booking-participant-postgres';
import { flowHttp, quoteService } from './helpers/request-flow-postgres';
import { jobRequestBody } from './helpers/job-request-postgres';
import {
  insertStoredMedia, mediaStates, requestCount, withRequestMediaDatabase,
} from './helpers/request-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-72: a foreign media id gets 400 JOB_MEDIA_UNAVAILABLE and no booking is written', async () => {
  await withRequestMediaDatabase(async database => {
    const own = await insertStoredMedia(database, customerA);
    const foreign = await insertStoredMedia(database, customerB);

    const response = await flowHttp(customerA, 'customer')
      .jobRequest(jobRequestBody({ subcategoryId: quoteService, mediaIds: [own, foreign] }));

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ statusCode: 400, code: 'JOB_MEDIA_UNAVAILABLE' });
    expect(await requestCount(database, customerA)).toBe(0);
    expect(await mediaStates(database, [own, foreign])).toEqual([
      { status: 'stored', booking_id: null }, { status: 'stored', booking_id: null },
    ]);
    expect((await database.query('SELECT COUNT(*)::int AS n FROM notifications')).rows[0].n).toBe(0);
  });
}, 90000);
