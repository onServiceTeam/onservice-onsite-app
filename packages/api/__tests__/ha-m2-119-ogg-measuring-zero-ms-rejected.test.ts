// HA-M2-119 (customer human audit 2026-10-13, D38 Milestone 2, package P3
// review fix; number from the P3 block 80-119): an Ogg Opus voice note whose
// last granule position equals its pre-skip measures 0 ms. Completing it is
// refused with 400 duration_unreadable and the row becomes rejected with no
// stored file, even though the app declared 5000 ms: the server trusts the
// file, and migration 185 cannot store a 0 ms voice note on a message. The
// same voice note with a real length is stored. Real router, auth, service,
// Ogg reader and migration 184 on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import { mediaHttp, uploadThroughApi, withJobMediaDatabase } from './helpers/job-media-postgres';
import { buildOggOpus } from './helpers/webm-builder';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-119: an Ogg voice note that measures 0 ms is rejected as duration_unreadable', async () => {
  await withJobMediaDatabase(async ({ database }) => {
    const customer = mediaHttp(customerA, 'customer');

    const zero = await uploadThroughApi(customer, {
      kind: 'voice', mime: 'audio/ogg', bytes: buildOggOpus({ durationMs: 0 }), durationMs: 5000,
    });
    expect(zero.completed.status).toBe(400);
    expect(zero.completed.body.error.code).toBe('duration_unreadable');
    expect((await database.query(
      'SELECT status, rejection_code, duration_ms, storage_key FROM job_media WHERE id = $1', [zero.id],
    )).rows).toEqual([{ status: 'rejected', rejection_code: 'duration_unreadable', duration_ms: null, storage_key: null }]);

    const real = await uploadThroughApi(customer, {
      kind: 'voice', mime: 'audio/ogg', bytes: buildOggOpus({ durationMs: 5000 }), durationMs: 5000,
    });
    expect(real.completed.status).toBe(200);
    expect(real.completed.body.data).toMatchObject({ status: 'stored', durationMs: 5000 });
  });
}, 60000);
