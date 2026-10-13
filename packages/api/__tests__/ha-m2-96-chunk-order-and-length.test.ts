// HA-M2-96 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 17): chunk uploads stay in order. Re-sending the chunk that
// was just stored is a 200 with nothing changed (a retry after a lost
// response), skipping ahead gets 409 chunk_out_of_order with the server's
// nextIndex, a chunk of the wrong length gets 400 chunk_length_mismatch, and
// one not sent as raw bytes (application/octet-stream) gets 415.
// Real router, auth, service and migration 184 on the guarded PostgreSQL
// fixture, with a throwaway uploads volume.
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import { CHUNK, bearer, mediaHttp, syntheticJpeg, tempDir, withJobMediaDatabase } from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-96: re-sending a stored chunk changes nothing, skipping ahead gets 409 with nextIndex, a wrong length or type is refused', async () => {
  await withJobMediaDatabase(async ({ database, uploadDir }) => {
    const customer = mediaHttp(customerA, 'customer');
    const photo = syntheticJpeg({ scanBytes: 2 * CHUNK + 1000 }); // three chunks
    const started = await customer.start({
      kind: 'photo', mime: 'image/jpeg', totalBytes: photo.length, clientUploadId: '96000000-0000-4000-8000-000000000001',
    });
    expect(started.status).toBe(201);
    const id = started.body.data.id as string;
    const chunk = (index: number): Buffer => photo.subarray(index * CHUNK, (index + 1) * CHUNK);
    const progress = async () => (await database.query('SELECT bytes_received, updated_at FROM job_media WHERE id = $1', [id])).rows[0];

    const first = await customer.chunk(id, 0, chunk(0));
    expect(first.status).toBe(200);
    expect(first.body.data).toEqual({ bytesReceived: CHUNK, nextIndex: 1, complete: false });
    const afterFirst = await progress();

    // The same chunk again (even with different bytes) is acknowledged and ignored.
    const again = await customer.chunk(id, 0, Buffer.alloc(CHUNK, 0x00));
    expect(again.status).toBe(200);
    expect(again.body.data).toEqual({ bytesReceived: CHUNK, nextIndex: 1, complete: false });
    expect(await progress()).toEqual(afterFirst);
    const partFile = path.join(tempDir(uploadDir), `${id}.part`);
    expect(fs.readFileSync(partFile)).toEqual(chunk(0));

    const skipped = await customer.chunk(id, 2, chunk(2));
    expect(skipped.status).toBe(409);
    expect(skipped.body.error).toMatchObject({ code: 'chunk_out_of_order', nextIndex: 1 });

    const short = await customer.chunk(id, 1, chunk(1).subarray(0, CHUNK - 1));
    expect(short.status).toBe(400);
    expect(short.body.error).toMatchObject({ code: 'chunk_length_mismatch', expectedBytes: CHUNK });
    expect(await progress()).toEqual(afterFirst);

    const asJson = await request(customer.app).put(`/api/v1/job-media/${id}/chunks/1`)
      .set('Authorization', bearer(customerA, 'customer')).send({ bytes: 'not raw bytes' });
    expect(asJson.status).toBe(415);
    expect(asJson.body.error.code).toBe('unsupported_media_type');
    expect(await progress()).toEqual(afterFirst);

    // The upload carries on from where the server says.
    expect((await customer.chunk(id, 1, chunk(1))).body.data).toEqual({ bytesReceived: 2 * CHUNK, nextIndex: 2, complete: false });
    expect((await customer.chunk(id, 2, chunk(2))).body.data).toEqual({ bytesReceived: photo.length, nextIndex: 3, complete: true });
    expect(fs.readFileSync(partFile)).toEqual(photo);
  });
}, 60000);
