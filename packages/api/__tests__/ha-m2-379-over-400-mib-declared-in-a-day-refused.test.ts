// HA-M2-379 (customer human audit 2026-10-13, D38 Milestone 2, package P3
// review fix; P3 overflow number, see HA-M2-370): one account may declare at
// most 400 MiB of uploads in 24 hours (design-media.md section 6 quota). Five
// 80 MiB request videos reach exactly 400 MiB and are accepted; one more
// byte (a 1000-byte photo) gets 429 job_media_quota and no row is written,
// although only five uploads are open. Real router, validation, auth,
// service, settings and migration 184 on the guarded PostgreSQL fixture.
import crypto from 'node:crypto';
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import { mediaHttp, withJobMediaDatabase } from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const MIB = 1024 * 1024;

it('HA-M2-379: declaring more than 400 MiB in 24 hours gets 429 job_media_quota', async () => {
  await withJobMediaDatabase(async ({ database }) => {
    const customer = mediaHttp(customerA, 'customer');
    for (let count = 0; count < 5; count += 1) {
      const started = await customer.start({
        kind: 'video', mime: 'video/mp4', totalBytes: 80 * MIB, durationMs: 20_000, clientUploadId: crypto.randomUUID(),
      });
      expect(started.status).toBe(201);
    }
    const declared = await database.query('SELECT count(*)::int AS n, sum(declared_bytes)::text AS total FROM job_media');
    expect(declared.rows[0]).toEqual({ n: 5, total: String(400 * MIB) });

    const refused = await customer.start({ kind: 'photo', mime: 'image/jpeg', totalBytes: 1000, clientUploadId: crypto.randomUUID() });
    expect(refused.status).toBe(429);
    expect(refused.body.error.code).toBe('job_media_quota');
    expect((await database.query('SELECT count(*)::int AS n FROM job_media')).rows[0].n).toBe(5);
  });
}, 60000);
