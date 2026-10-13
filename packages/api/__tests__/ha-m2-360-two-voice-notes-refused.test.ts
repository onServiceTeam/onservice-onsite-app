// HA-M2-360 (customer human audit 2026-10-13, D38 Milestone 2, W3 step I1;
// W3-A fix-round overflow number for a review finding): a job request may
// carry at most 1 voice note (merged plan 2.3). A request with two of the
// customer's own stored voice notes is refused with 400 JOB_MEDIA_LIMIT as a
// whole: no request is stored and neither recording is attached. Real HTTP
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

it('HA-M2-360: a request with 2 voice notes is refused with JOB_MEDIA_LIMIT and no booking is written', async () => {
  await withRequestMediaDatabase(async database => {
    const voiceNotes = [
      await insertStoredMedia(database, customerA, { kind: 'voice' }),
      await insertStoredMedia(database, customerA, { kind: 'voice' }),
    ];

    const response = await flowHttp(customerA, 'customer')
      .jobRequest(jobRequestBody({ subcategoryId: quoteService, mediaIds: voiceNotes }));

    expect([response.status, response.body.error?.code]).toEqual([400, 'JOB_MEDIA_LIMIT']);
    expect(await requestCount(database, customerA)).toBe(0);
    expect(await mediaStates(database, voiceNotes)).toEqual(voiceNotes.map(() => ({ status: 'stored', booking_id: null })));
  });
}, 90000);
