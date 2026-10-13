// HA-M2-361 (customer human audit 2026-10-13, D38 Milestone 2, W3 step I1;
// W3-A fix-round overflow number for a review finding): the photo cap on a
// job request is the admin-editable job_media_max_photos setting, read live
// through getJobMediaLimits, not a fixed 6. With the setting lowered to 2, a
// request with 3 of the customer's own stored photos is refused with 400
// JOB_MEDIA_LIMIT as a whole: no request is stored and no photo is attached.
// Real HTTP on the guarded PostgreSQL fixture (real migrations 183 and 184;
// the platform_settings row is written directly, where the admin settings
// page stores it).
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import { flowHttp, quoteService, upsertPlatformSetting } from './helpers/request-flow-postgres';
import { jobRequestBody } from './helpers/job-request-postgres';
import {
  insertStoredMedia, mediaStates, requestCount, withRequestMediaDatabase,
} from './helpers/request-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-361: with job_media_max_photos set to 2, a request with 3 photos is refused with JOB_MEDIA_LIMIT', async () => {
  await withRequestMediaDatabase(async database => {
    await upsertPlatformSetting(database, 'job_media_max_photos', '2');
    const photos = [
      await insertStoredMedia(database, customerA, { kind: 'photo' }),
      await insertStoredMedia(database, customerA, { kind: 'photo' }),
      await insertStoredMedia(database, customerA, { kind: 'photo' }),
    ];

    const response = await flowHttp(customerA, 'customer')
      .jobRequest(jobRequestBody({ subcategoryId: quoteService, mediaIds: photos }));

    expect([response.status, response.body.error?.code]).toEqual([400, 'JOB_MEDIA_LIMIT']);
    expect(await requestCount(database, customerA)).toBe(0);
    expect(await mediaStates(database, photos)).toEqual(photos.map(() => ({ status: 'stored', booking_id: null })));
  });
}, 90000);
