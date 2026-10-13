// HA-M2-364 (customer human audit 2026-10-13, D38 Milestone 2, W3 step I1;
// W3-A fix-round overflow number, the second case of merged.md test 73): a
// job request may carry at most 1 video. A request with one photo and two of
// the customer's own stored videos is refused with 400 JOB_MEDIA_LIMIT as a
// whole: no request is stored and nothing is attached, the photo included.
// Real HTTP on the guarded PostgreSQL fixture (real migrations 183 and 184).
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import { flowHttp, quoteService } from './helpers/request-flow-postgres';
import { jobRequestBody } from './helpers/job-request-postgres';
import {
  insertStoredMedia, mediaStates, requestCount, withRequestMediaDatabase,
} from './helpers/request-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-364: a request with 2 videos is refused with JOB_MEDIA_LIMIT and no booking is written', async () => {
  await withRequestMediaDatabase(async database => {
    const media = [
      await insertStoredMedia(database, customerA, { kind: 'photo' }),
      await insertStoredMedia(database, customerA, { kind: 'video' }),
      await insertStoredMedia(database, customerA, { kind: 'video' }),
    ];

    const response = await flowHttp(customerA, 'customer')
      .jobRequest(jobRequestBody({ subcategoryId: quoteService, mediaIds: media }));

    expect([response.status, response.body.error?.code]).toEqual([400, 'JOB_MEDIA_LIMIT']);
    expect(await requestCount(database, customerA)).toBe(0);
    expect(await mediaStates(database, media)).toEqual(media.map(() => ({ status: 'stored', booking_id: null })));
  });
}, 90000);
