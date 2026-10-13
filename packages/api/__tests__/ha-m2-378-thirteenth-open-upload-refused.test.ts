// HA-M2-378 (customer human audit 2026-10-13, D38 Milestone 2, package P3
// review fix; P3 overflow number, see HA-M2-370): one account may have at
// most 12 uploads open (uploading, processing or stored and not yet sent)
// at once (design-media.md section 6 quota). The 13th start gets 429
// job_media_quota and no row is written; once one open upload is removed a
// new one starts again. Real router, validation, auth, service and
// migration 184 on the guarded PostgreSQL fixture.
import crypto from 'node:crypto';
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import { mediaHttp, withJobMediaDatabase } from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-378: the 13th open upload of one account gets 429 job_media_quota', async () => {
  await withJobMediaDatabase(async ({ database }) => {
    const customer = mediaHttp(customerA, 'customer');
    const start = () => customer.start({ kind: 'photo', mime: 'image/jpeg', totalBytes: 1000, clientUploadId: crypto.randomUUID() });
    const ids: string[] = [];
    for (let count = 0; count < 12; count += 1) {
      const started = await start();
      expect(started.status).toBe(201);
      ids.push(started.body.data.id as string);
    }
    const count = async () => (await database.query('SELECT count(*)::int AS n FROM job_media')).rows[0].n;

    const refused = await start();
    expect(refused.status).toBe(429);
    expect(refused.body.error.code).toBe('job_media_quota');
    expect(await count()).toBe(12);

    expect((await customer.remove(ids[0]!)).status).toBe(200);
    expect((await start()).status).toBe(201);
  });
}, 60000);
