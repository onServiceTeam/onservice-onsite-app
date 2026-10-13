// HA-M2-370 (customer human audit 2026-10-13, D38 Milestone 2, package P3
// review fix; P3 overflow number: the P3 range 80-119 is used up, so the P3
// review fixes number their extra tests from 370, after P2's 310 and P4's
// 330): an MP4/M4A whose movie header (mvhd) gives a length that rounds to
// 0 ms (duration 1 at timescale 48000 for a voice note, 1 at 90000 for a
// video) is refused on complete with 400 duration_unreadable, and the row
// becomes rejected with no stored file, whatever length the app declared.
// Migration 185 cannot store a 0 ms voice note on a message. Real router,
// auth, service, box walker and migration 184 on the guarded PostgreSQL
// fixture.
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import { mediaHttp, uploadThroughApi, withJobMediaDatabase } from './helpers/job-media-postgres';
import { buildMp4 } from './helpers/mp4-builder';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-370: an MP4 whose mvhd length rounds to 0 ms is rejected as duration_unreadable', async () => {
  await withJobMediaDatabase(async ({ database }) => {
    const customer = mediaHttp(customerA, 'customer');
    const voice = await uploadThroughApi(customer, {
      kind: 'voice', mime: 'audio/mp4', durationMs: 5000,
      bytes: buildMp4({ brand: 'M4A ', timescale: 48_000, rawDuration: 1, tracks: [{ handler: 'soun', codec: 'mp4a' }] }),
    });
    const video = await uploadThroughApi(customer, {
      kind: 'video', mime: 'video/mp4', durationMs: 5000,
      bytes: buildMp4({ timescale: 90_000, rawDuration: 1 }),
    });

    for (const upload of [voice, video]) {
      expect(upload.completed.status).toBe(400);
      expect(upload.completed.body.error.code).toBe('duration_unreadable');
    }
    expect((await database.query(
      'SELECT kind, status, rejection_code, duration_ms, storage_key FROM job_media ORDER BY kind',
    )).rows).toEqual([
      { kind: 'video', status: 'rejected', rejection_code: 'duration_unreadable', duration_ms: null, storage_key: null },
      { kind: 'voice', status: 'rejected', rejection_code: 'duration_unreadable', duration_ms: null, storage_key: null },
    ]);
  });
}, 60000);
