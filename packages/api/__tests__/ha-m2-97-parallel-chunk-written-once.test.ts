// HA-M2-97 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 18): two PUTs of the same chunk sent at the same moment (a
// retry racing the original) produce exactly one write: both get 200, the
// chunk file is opened for writing once, and bytes_received counts the chunk
// once. The row lock in putChunk serialises them. Real router, auth, service
// and migration 184 on the guarded PostgreSQL fixture.
import fsPromises from 'node:fs/promises';
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import { CHUNK, mediaHttp, syntheticJpeg, withJobMediaDatabase } from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-97: two parallel PUTs of the same chunk produce exactly one write', async () => {
  await withJobMediaDatabase(async ({ database }) => {
    const customer = mediaHttp(customerA, 'customer');
    const photo = syntheticJpeg({ scanBytes: CHUNK + 5000 });
    const started = await customer.start({
      kind: 'photo', mime: 'image/jpeg', totalBytes: photo.length, clientUploadId: '97000000-0000-4000-8000-000000000001',
    });
    const id = started.body.data.id as string;
    const opens = jest.spyOn(fsPromises, 'open');
    try {
      const [one, two] = await Promise.all([
        customer.chunk(id, 0, photo.subarray(0, CHUNK)),
        customer.chunk(id, 0, photo.subarray(0, CHUNK)),
      ]);
      expect([one.status, two.status]).toEqual([200, 200]);
      expect(one.body.data).toEqual({ bytesReceived: CHUNK, nextIndex: 1, complete: false });
      expect(two.body.data).toEqual({ bytesReceived: CHUNK, nextIndex: 1, complete: false });
      const chunkOpens = opens.mock.calls.filter(call => String(call[0]).endsWith(`${id}.part`));
      expect(chunkOpens).toHaveLength(1);
    } finally {
      opens.mockRestore();
    }
    const row = await database.query('SELECT bytes_received, status FROM job_media WHERE id = $1', [id]);
    expect(row.rows).toEqual([{ bytes_received: CHUNK, status: 'uploading' }]);
  });
}, 60000);
