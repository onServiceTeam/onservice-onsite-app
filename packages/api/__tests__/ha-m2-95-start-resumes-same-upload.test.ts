// HA-M2-95 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 16): starting an upload twice with the same clientUploadId
// and the same file details resumes it (200, same id, the chunks already
// received are kept, and it keeps the size limit it started with even if the
// admin lowers the setting meanwhile), while the same clientUploadId with a
// different size is refused with 409 client_upload_id_reused. Real router,
// auth, service, settings and migration 184 on the guarded PostgreSQL fixture.
import crypto from 'node:crypto';
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import { CHUNK, mediaHttp, syntheticJpeg, withJobMediaDatabase } from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-95: the same clientUploadId and metadata resumes the upload, a different size gets 409', async () => {
  await withJobMediaDatabase(async ({ database }) => {
    const customer = mediaHttp(customerA, 'customer');
    const photo = syntheticJpeg({ scanBytes: CHUNK + 4096 }); // two chunks
    const clientUploadId = crypto.randomUUID();
    const body = { purpose: 'job_request', kind: 'photo', mime: 'image/jpeg', totalBytes: photo.length, clientUploadId };

    const first = await customer.start(body);
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({
      status: 'uploading', chunkBytes: CHUNK, totalChunks: 2, bytesReceived: 0, nextIndex: 0, kind: 'photo',
    });
    const id = first.body.data.id as string;
    expect((await customer.chunk(id, 0, photo.subarray(0, CHUNK))).status).toBe(200);

    // The admin lowers the photo limit below this file; then the app restarts
    // and starts the same file again.
    await database.query("UPDATE platform_settings SET value = '1048576' WHERE key = 'job_media_photo_max_bytes'");
    expect((await customer.start({ ...body, clientUploadId: crypto.randomUUID() })).body.error.code).toBe('too_large');
    const resumed = await customer.start(body);
    expect(resumed.status).toBe(200);
    expect(resumed.body.data).toMatchObject({ id, status: 'uploading', bytesReceived: CHUNK, nextIndex: 1 });

    const conflicting = await customer.start({ ...body, totalBytes: photo.length + 1 });
    expect(conflicting.status).toBe(409);
    expect(conflicting.body.error.code).toBe('client_upload_id_reused');

    const rows = await database.query('SELECT id, declared_bytes, bytes_received FROM job_media WHERE owner_user_id = $1', [customerA]);
    expect(rows.rows).toEqual([{ id, declared_bytes: photo.length, bytes_received: CHUNK }]);
  });
}, 60000);
