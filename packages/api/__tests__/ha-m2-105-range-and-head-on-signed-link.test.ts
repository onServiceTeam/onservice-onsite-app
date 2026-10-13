// HA-M2-105 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 30): the signed file route serves byte ranges for video
// players. A Range request gets 206 with exactly those bytes, Content-Range
// and Content-Length; a range past the end gets 416 with bytes */size; HEAD
// sends the headers and no body; every answer is private, no-store, nosniff
// and same-site. HEAD never opens the stored file. Real router, service and
// storage, with an uploaded request video, on the guarded PostgreSQL fixture.
import fs from 'node:fs';
import * as uploadService from '../src/services/upload.service';
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import { fetchSigned, mediaHttp, storePath, uploadThroughApi, withJobMediaDatabase } from './helpers/job-media-postgres';
import { buildMp4 } from './helpers/mp4-builder';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-105: a Range request returns 206 with the exact bytes, HEAD has no body, and private, no-store is set', async () => {
  await withJobMediaDatabase(async ({ database, uploadDir }) => {
    const customer = mediaHttp(customerA, 'customer');
    const video = buildMp4({ durationMs: 8_000, mdatBytes: Buffer.alloc(5000, 0x61) });
    const { id, completed } = await uploadThroughApi(customer, { kind: 'video', mime: 'video/mp4', bytes: video, durationMs: 8_000 });
    expect(completed.status).toBe(200);
    const key = (await database.query('SELECT storage_key FROM job_media WHERE id = $1', [id])).rows[0].storage_key;
    const stored = fs.readFileSync(storePath(uploadDir, key));
    const link = (await customer.url(id)).body.data.url as string;

    const common = (headers: Record<string, string>): void => {
      expect(headers['cache-control']).toBe('private, no-store');
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['cross-origin-resource-policy']).toBe('same-site');
      expect(headers['accept-ranges']).toBe('bytes');
      expect(headers['content-type']).toBe('video/mp4');
    };

    const partial = await fetchSigned(link, 'GET', 'bytes=100-1123');
    expect(partial.status).toBe(206);
    expect(partial.headers['content-range']).toBe(`bytes 100-1123/${stored.length}`);
    expect(partial.headers['content-length']).toBe('1024');
    expect(partial.body).toEqual(stored.subarray(100, 1124));
    common(partial.headers);

    const tail = await fetchSigned(link, 'GET', 'bytes=-200');
    expect(tail.status).toBe(206);
    expect(tail.body).toEqual(stored.subarray(stored.length - 200));

    const whole = await fetchSigned(link);
    expect(whole.status).toBe(200);
    expect(whole.headers['content-length']).toBe(String(stored.length));
    expect(whole.body).toEqual(stored);

    const outside = await fetchSigned(link, 'GET', `bytes=${stored.length}-`);
    expect(outside.status).toBe(416);
    expect(outside.headers['content-range']).toBe(`bytes */${stored.length}`);

    const opened = jest.spyOn(uploadService, 'getPrivateArtifactRange');
    try {
      const head = await fetchSigned(link, 'HEAD');
      expect(head.status).toBe(200);
      expect(head.headers['content-length']).toBe(String(stored.length));
      expect(head.text ?? '').toBe('');
      common(head.headers);
      expect(opened).not.toHaveBeenCalled();
      const headRange = await fetchSigned(link, 'HEAD', 'bytes=0-99');
      expect(headRange.status).toBe(206);
      expect(headRange.headers['content-range']).toBe(`bytes 0-99/${stored.length}`);
      expect(opened).not.toHaveBeenCalled();
      // The same link read with GET does open the file (so the spy is live).
      expect((await fetchSigned(link, 'GET', 'bytes=0-99')).body).toEqual(stored.subarray(0, 100));
      expect(opened).toHaveBeenCalledTimes(1);
    } finally {
      opened.mockRestore();
    }
  });
}, 60000);
