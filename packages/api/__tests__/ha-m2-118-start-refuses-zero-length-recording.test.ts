// HA-M2-118 (customer human audit 2026-10-13, D38 Milestone 2, package P3
// review fix; number from the P3 block 80-119): a voice note or video that
// the app declares as 0 ms long is refused when the upload starts, with 400
// duration_required, and nothing is stored. Migration 185 only stores a
// thread voice note's length between 1 and 600000 ms
// (messages_media_duration_check), so a 0 ms recording must never become a
// stored upload that a message send would then fail on with a 500. A 1 ms
// declaration is still accepted. Real router, validation, auth, service,
// settings and migration 184 on the guarded PostgreSQL fixture.
import crypto from 'node:crypto';
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import { mediaHttp, withJobMediaDatabase } from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-118: start refuses a voice note or video declared as 0 ms long', async () => {
  await withJobMediaDatabase(async ({ database }) => {
    const customer = mediaHttp(customerA, 'customer');
    const start = (body: Record<string, unknown>) => customer.start({ clientUploadId: crypto.randomUUID(), ...body });

    for (const body of [
      { kind: 'voice', mime: 'audio/webm;codecs=opus', totalBytes: 1000, durationMs: 0 }, // a web recording that read 0
      { kind: 'voice', mime: 'audio/mp4', totalBytes: 1000, durationMs: 0 },
      { kind: 'video', mime: 'video/mp4', totalBytes: 1000, durationMs: 0 },
    ]) {
      const refused = await start(body);
      expect(refused.status).toBe(400);
      expect(refused.body.error.code).toBe('duration_required');
    }
    expect((await database.query('SELECT count(*)::int AS n FROM job_media')).rows[0].n).toBe(0);

    const accepted = await start({ kind: 'voice', mime: 'audio/webm;codecs=opus', totalBytes: 1000, durationMs: 1 });
    expect(accepted.status).toBe(201);
  });
}, 60000);
