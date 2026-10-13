// HA-M2-98 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 19): completing a photo upload removes its GPS data (the
// EXIF orientation is kept) and stores it privately as
// private-artifacts/job-media/<owner>/<id>.jpg, the temp chunk file is gone,
// and the row is 'stored' with the cleaned size. On Linux (CI) the file is
// 0600 and its folders 0700; Windows has no POSIX modes, so that part only
// runs off Windows. Real router, auth, service, storage and migration 184 on
// the guarded PostgreSQL fixture.
import fs from 'node:fs';
import path from 'node:path';
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import {
  GPS_MARKER, mediaHttp, storePath, syntheticJpeg, tempDir, uploadThroughApi, withJobMediaDatabase,
} from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-98: completing a photo strips GPS and stores it privately under the owner with tight permissions', async () => {
  await withJobMediaDatabase(async ({ database, uploadDir }) => {
    const customer = mediaHttp(customerA, 'customer');
    const photo = syntheticJpeg({ orientation: 6 });
    const { id, completed } = await uploadThroughApi(customer, { kind: 'photo', mime: 'image/jpeg', bytes: photo });
    expect(completed.status).toBe(200);
    expect(completed.body.data).toMatchObject({ id, kind: 'photo', status: 'stored', mime: 'image/jpeg', purpose: 'job_request' });

    const row = (await database.query('SELECT status, storage_key, size_bytes, mime FROM job_media WHERE id = $1', [id])).rows[0];
    expect(row.storage_key).toBe(`private-artifacts/job-media/${customerA}/${id}.jpg`);
    const stored = fs.readFileSync(storePath(uploadDir, row.storage_key));
    expect(row.size_bytes).toBe(stored.length);
    expect(stored.length).toBeLessThan(photo.length);
    expect(stored.includes(Buffer.from(GPS_MARKER))).toBe(false);
    expect(stored.includes(Buffer.from([0x88, 0x25]))).toBe(false);
    expect(stored.includes(Buffer.from('Exif\0\0MM', 'latin1'))).toBe(true); // orientation kept
    expect(stored.subarray(-514)).toEqual(photo.subarray(-514)); // picture data unchanged
    expect(fs.readdirSync(tempDir(uploadDir))).toEqual([]);

    if (process.platform !== 'win32') {
      const mode = (target: string): number => fs.statSync(target).mode & 0o777;
      const file = storePath(uploadDir, row.storage_key);
      expect(mode(file)).toBe(0o600);
      expect(mode(path.dirname(file))).toBe(0o700);
      expect(mode(path.dirname(path.dirname(file)))).toBe(0o700);
    }
  });
}, 60000);
