// HA-M2-308 (customer human audit 2026-10-13, D38 Milestone 2, package P3,
// critique M14): a request video shaped like an iPhone recording (qt brand,
// HEVC video rotated to portrait, AAC sound, moov at the end, location in
// moov/udta/(c)xyz and in the mdta keys com.apple.quicktime.location.*)
// uploaded through the real chunked API is stored with every location value
// removed, while make, model and the media itself are unchanged: same length,
// same mdat bytes, same stco offsets. It is stored as video/quicktime with the
// portrait size and the hvc1 codec. Real router, auth, service and storage on
// the guarded PostgreSQL fixture.
import fs from 'node:fs';
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import { mediaHttp, storePath, uploadThroughApi, withJobMediaDatabase } from './helpers/job-media-postgres';
import {
  IPHONE_LOCATION, IPHONE_MAKE, IPHONE_MODEL, buildIphoneMov, findAll, readChunkOffsets,
} from './helpers/mp4-builder';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-308: video upload removes the location boxes from an iPhone MOV fixture', async () => {
  await withJobMediaDatabase(async ({ database, uploadDir }) => {
    const original = buildIphoneMov({ durationMs: 12_000 });
    expect(findAll(original, IPHONE_LOCATION)).toHaveLength(2); // udta (c)xyz and the mdta item
    const customer = mediaHttp(customerA, 'customer');
    const { id, completed } = await uploadThroughApi(customer, {
      kind: 'video', mime: 'video/quicktime', bytes: original, durationMs: 12_000,
    });
    expect(completed.status).toBe(200);
    expect(completed.body.data).toMatchObject({
      kind: 'video', status: 'stored', mime: 'video/quicktime', durationMs: 12_000, width: 1080, height: 1920,
    });

    const row = (await database.query('SELECT storage_key, codec, size_bytes, duration_source FROM job_media WHERE id = $1', [id])).rows[0];
    expect(row).toMatchObject({ codec: 'hvc1', size_bytes: original.length, duration_source: 'container' });
    expect(row.storage_key).toBe(`private-artifacts/job-media/${customerA}/${id}.mov`);
    const stored = fs.readFileSync(storePath(uploadDir, row.storage_key));

    expect(stored.length).toBe(original.length);
    expect(findAll(stored, IPHONE_LOCATION)).toHaveLength(0);
    expect(findAll(stored, '©xyz')).toHaveLength(0);
    expect(stored.includes(Buffer.from('4.766546'))).toBe(false);
    for (const kept of [IPHONE_MAKE, IPHONE_MODEL, 'com.apple.quicktime.make', 'com.apple.quicktime.model']) {
      expect(stored.indexOf(Buffer.from(kept))).toBe(original.indexOf(Buffer.from(kept)));
    }
    const mdatType = findAll(original, 'mdat')[0]!;
    const mdatSize = original.readUInt32BE(mdatType - 4);
    expect(stored.subarray(mdatType - 4, mdatType - 4 + mdatSize)).toEqual(original.subarray(mdatType - 4, mdatType - 4 + mdatSize));
    expect(readChunkOffsets(stored)).toEqual(readChunkOffsets(original));
  });
}, 60000);
