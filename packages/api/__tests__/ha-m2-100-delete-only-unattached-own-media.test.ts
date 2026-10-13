// HA-M2-100 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 21): the owner can delete a stored upload before it is
// attached (200, row 'deleted', file removed and purged_at set); once it is
// attached to a request, delete gets 409 already_attached and the file stays;
// another customer gets 404 (never 403, so existence does not leak). Real
// router, auth, service, storage and migration 184 on the guarded PostgreSQL
// fixture.
import fs from 'node:fs';
import { bookingIntegrationIt as it, customerA, customerB } from './helpers/booking-participant-postgres';
import {
  attachRequestMedia, createQuoteRequest, mediaHttp, storePath, syntheticJpeg, uploadThroughApi, withJobMediaDatabase,
} from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-100: owner delete before attach works, delete after attach gets 409, a stranger gets 404', async () => {
  await withJobMediaDatabase(async ({ database, uploadDir }) => {
    const owner = mediaHttp(customerA, 'customer');
    const stranger = mediaHttp(customerB, 'customer');
    const rowOf = async (id: string) => (await database.query(
      'SELECT status, storage_key, deleted_at IS NOT NULL AS deleted, purged_at IS NOT NULL AS purged FROM job_media WHERE id = $1', [id],
    )).rows[0];

    const loose = await uploadThroughApi(owner, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg() });
    const looseKey = (await rowOf(loose.id)).storage_key as string;
    expect(fs.existsSync(storePath(uploadDir, looseKey))).toBe(true);

    const strangerDelete = await stranger.remove(loose.id);
    expect(strangerDelete.status).toBe(404);
    expect((await rowOf(loose.id)).status).toBe('stored');

    const removed = await owner.remove(loose.id);
    expect(removed.status).toBe(200);
    expect(removed.body.data).toEqual({ deleted: true });
    expect(await rowOf(loose.id)).toMatchObject({ status: 'deleted', deleted: true, purged: true });
    expect(fs.existsSync(storePath(uploadDir, looseKey))).toBe(false);

    const sent = await uploadThroughApi(owner, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg() });
    const bookingId = await createQuoteRequest(database);
    await attachRequestMedia(customerA, bookingId, [sent.id]);
    const blocked = await owner.remove(sent.id);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('already_attached');
    const sentRow = await rowOf(sent.id);
    expect(sentRow).toMatchObject({ status: 'attached', deleted: false });
    expect(fs.existsSync(storePath(uploadDir, sentRow.storage_key))).toBe(true);
    expect((await stranger.remove(sent.id)).status).toBe(404);
  });
}, 60000);
