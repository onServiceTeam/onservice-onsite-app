// HA-M2-365 (customer human audit 2026-10-13, D38 Milestone 2, W3 step I1;
// W3-A fix-round overflow number, the third case of merged.md test 73): a
// job request that names a photo still uploading is refused with 409
// JOB_MEDIA_NOT_READY as a whole: no request is stored, the finished photo
// in the same request is not attached, and the unfinished one is left
// uploading. Real HTTP on the guarded PostgreSQL fixture (real migrations
// 183 and 184).
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import { flowHttp, quoteService } from './helpers/request-flow-postgres';
import { jobRequestBody } from './helpers/job-request-postgres';
import {
  insertStoredMedia, mediaStates, requestCount, withRequestMediaDatabase,
} from './helpers/request-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-365: a request naming a still-uploading photo is refused with JOB_MEDIA_NOT_READY and no booking is written', async () => {
  await withRequestMediaDatabase(async database => {
    const stored = await insertStoredMedia(database, customerA, { kind: 'photo' });
    const uploading = await insertStoredMedia(database, customerA, { kind: 'photo', status: 'uploading' });

    const response = await flowHttp(customerA, 'customer')
      .jobRequest(jobRequestBody({ subcategoryId: quoteService, mediaIds: [stored, uploading] }));

    expect([response.status, response.body.error?.code]).toEqual([409, 'JOB_MEDIA_NOT_READY']);
    expect(await requestCount(database, customerA)).toBe(0);
    expect(await mediaStates(database, [stored, uploading])).toEqual([
      { status: 'stored', booking_id: null }, { status: 'uploading', booking_id: null },
    ]);
  });
}, 90000);
