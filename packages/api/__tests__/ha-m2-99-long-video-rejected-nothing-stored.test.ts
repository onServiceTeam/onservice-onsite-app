// HA-M2-99 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 20): a request video that the app declared as 29 s but
// whose file says 35 s is refused when the upload is completed: the response
// is 400 too_long, the row becomes 'rejected' with rejection_code too_long
// (so the app does not retry), the temp file is removed and nothing is
// stored. Real router, auth, service and migration 184 on the guarded
// PostgreSQL fixture.
import fs from 'node:fs';
import path from 'node:path';
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import { mediaHttp, tempDir, uploadThroughApi, withJobMediaDatabase } from './helpers/job-media-postgres';
import { buildMp4 } from './helpers/mp4-builder';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-99: a 35 s video becomes rejected with too_long, the temp file is removed and nothing is stored', async () => {
  await withJobMediaDatabase(async ({ database, uploadDir }) => {
    const customer = mediaHttp(customerA, 'customer');
    const video = buildMp4({ durationMs: 35_000 });
    const { id, completed } = await uploadThroughApi(customer, { kind: 'video', mime: 'video/mp4', bytes: video, durationMs: 29_000 });
    expect(completed.status).toBe(400);
    expect(completed.body.error.code).toBe('too_long');

    const row = (await database.query(
      'SELECT status, rejection_code, storage_key, stored_at, mime FROM job_media WHERE id = $1', [id],
    )).rows[0];
    expect(row).toEqual({ status: 'rejected', rejection_code: 'too_long', storage_key: null, stored_at: null, mime: null });
    expect(fs.readdirSync(tempDir(uploadDir))).toEqual([]);
    expect(fs.existsSync(path.join(uploadDir, 'private-artifacts', 'job-media', customerA))).toBe(false);

    // Completing again reports the same refusal instead of re-processing.
    const again = await customer.complete(id);
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('too_long');
    expect((await customer.state(id)).body.data).toMatchObject({ status: 'rejected', rejectionCode: 'too_long' });
  });
}, 60000);
