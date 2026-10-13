// HA-M2-371 (customer human audit 2026-10-13, D38 Milestone 2, package P3
// review fix; P3 overflow number, see HA-M2-370): Chrome's recorder writes a
// WebM with no Duration element, so its length falls back to the length the
// app declared when the upload started. When that declared length is 0 ms
// (a row started before the start check of HA-M2-118, which migration 184
// allows), completing it is refused with 400 duration_unreadable and the row
// becomes rejected with no stored file: a 0 ms voice note must never reach a
// message (migration 185 stores 1-600000 ms). Real router, auth, service,
// WebM reader and migration 184 on the guarded PostgreSQL fixture.
import crypto from 'node:crypto';
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import { mediaHttp, withJobMediaDatabase } from './helpers/job-media-postgres';
import { buildWebm } from './helpers/webm-builder';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-371: a WebM with no Duration and a declared length of 0 ms is rejected as duration_unreadable', async () => {
  await withJobMediaDatabase(async ({ database }) => {
    const customer = mediaHttp(customerA, 'customer');
    const bytes = buildWebm(); // no Duration element, Opus audio, as Chrome records
    const started = await customer.start({
      kind: 'voice', mime: 'audio/webm;codecs=opus', totalBytes: bytes.length,
      clientUploadId: crypto.randomUUID(), durationMs: 4000,
    });
    expect(started.status).toBe(201);
    const id = started.body.data.id as string;
    expect((await customer.chunk(id, 0, bytes)).status).toBe(200);
    await database.query('UPDATE job_media SET declared_duration_ms = 0 WHERE id = $1', [id]);

    const completed = await customer.complete(id);
    expect(completed.status).toBe(400);
    expect(completed.body.error.code).toBe('duration_unreadable');
    expect((await database.query(
      'SELECT status, rejection_code, duration_ms, storage_key FROM job_media WHERE id = $1', [id],
    )).rows).toEqual([{ status: 'rejected', rejection_code: 'duration_unreadable', duration_ms: null, storage_key: null }]);
  });
}, 60000);
