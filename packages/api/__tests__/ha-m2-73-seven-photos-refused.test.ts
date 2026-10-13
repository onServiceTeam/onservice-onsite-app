// HA-M2-73 (customer human audit 2026-10-13, D38 Milestone 2, W3 step I1;
// merged.md section 4 test 73, first of its three cases): a job request with
// 7 of the customer's own stored photos, one over job_media_max_photos (6,
// the value migration 184 seeds), is refused with 400 JOB_MEDIA_LIMIT as a
// whole: no request is stored and no photo is attached. The plan's other two
// cases are their own tests: 2 videos (HA-M2-364) and a photo still
// uploading (HA-M2-365); the admin-lowered photo cap is HA-M2-361. Real HTTP
// on the guarded PostgreSQL fixture (real migrations 183 and 184).
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import { flowHttp, quoteService } from './helpers/request-flow-postgres';
import { jobRequestBody } from './helpers/job-request-postgres';
import {
  insertStoredMedia, mediaStates, requestCount, withRequestMediaDatabase,
} from './helpers/request-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-73: a request with 7 photos is refused with JOB_MEDIA_LIMIT and no booking is written', async () => {
  await withRequestMediaDatabase(async database => {
    const photos: string[] = [];
    for (let i = 0; i < 7; i += 1) photos.push(await insertStoredMedia(database, customerA, { kind: 'photo' }));

    const response = await flowHttp(customerA, 'customer')
      .jobRequest(jobRequestBody({ subcategoryId: quoteService, mediaIds: photos }));

    expect([response.status, response.body.error?.code]).toEqual([400, 'JOB_MEDIA_LIMIT']);
    expect(await requestCount(database, customerA)).toBe(0);
    expect(await mediaStates(database, photos)).toEqual(photos.map(() => ({ status: 'stored', booking_id: null })));
  });
}, 90000);
