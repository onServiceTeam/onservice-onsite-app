// HA-M2-80 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 1): an HTML page uploaded while declaring video/mp4 (and a
// .mp4 name the server never sees) is refused when the upload is completed:
// the bytes are sniffed, not the declared type, so the answer is 400
// unsupported_type, the row is 'rejected' and nothing is stored or servable.
// Real router, auth, service and migration 184 on the guarded PostgreSQL
// fixture.
import fs from 'node:fs';
import path from 'node:path';
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import { mediaHttp, uploadThroughApi, withJobMediaDatabase } from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-80: an HTML file declared as video/mp4 is rejected with unsupported_type', async () => {
  await withJobMediaDatabase(async ({ database, uploadDir }) => {
    const customer = mediaHttp(customerA, 'customer');
    const html = Buffer.from('<!doctype html><html><body><script>alert(document.cookie)</script></body></html>', 'utf8');
    const { id, completed } = await uploadThroughApi(customer, { kind: 'video', mime: 'video/mp4', bytes: html, durationMs: 5_000 });
    expect(completed.status).toBe(400);
    expect(completed.body.error.code).toBe('unsupported_type');
    const row = (await database.query('SELECT status, rejection_code, storage_key, mime FROM job_media WHERE id = $1', [id])).rows[0];
    expect(row).toEqual({ status: 'rejected', rejection_code: 'unsupported_type', storage_key: null, mime: null });
    expect(fs.existsSync(path.join(uploadDir, 'private-artifacts', 'job-media', customerA))).toBe(false);
    expect((await customer.url(id)).status).toBe(404);
  });
}, 60000);
