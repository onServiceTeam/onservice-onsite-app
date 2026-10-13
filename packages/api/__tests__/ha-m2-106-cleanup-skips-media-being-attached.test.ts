// HA-M2-106 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 31): cleanupJobMedia removes stale unattached media (a
// stored photo never attached within 24 h, an upload idle for 24 h, an item
// stuck in processing for 15 min, and a stray temp file older than 48 h) and
// deletes their files only after the row change, while a stale photo that a
// job request is attaching at that same moment (row locked inside the
// request's transaction) is skipped and ends up attached with its file
// intact. Real service, storage and migration 184 on the guarded PostgreSQL
// fixture.
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/models/db';
import {
  attachMediaInTransaction, cleanupJobMedia, lockAttachableMediaInTransaction,
} from '../src/services/job-media.service';
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import {
  CHUNK, createQuoteRequest, mediaHttp, storePath, syntheticJpeg, tempDir, uploadThroughApi, withJobMediaDatabase,
} from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-106: cleanup removes stale unattached media and never touches media attached at the same moment', async () => {
  await withJobMediaDatabase(async ({ database, uploadDir }) => {
    const customer = mediaHttp(customerA, 'customer');
    const stale = await uploadThroughApi(customer, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg({ scanBytes: 100 }) });
    const racing = await uploadThroughApi(customer, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg({ scanBytes: 200 }) });
    const fresh = await uploadThroughApi(customer, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg({ scanBytes: 300 }) });
    await database.query("UPDATE job_media SET stored_at = NOW() - INTERVAL '25 hours' WHERE id = ANY($1::uuid[])", [[stale.id, racing.id]]);

    const idlePhoto = syntheticJpeg({ scanBytes: CHUNK + 10 });
    const idle = await customer.start({ kind: 'photo', mime: 'image/jpeg', totalBytes: idlePhoto.length, clientUploadId: '10600000-0000-4000-8000-000000000001' });
    await customer.chunk(idle.body.data.id, 0, idlePhoto.subarray(0, CHUNK));
    await database.query("UPDATE job_media SET updated_at = NOW() - INTERVAL '25 hours' WHERE id = $1", [idle.body.data.id]);

    const stuckPhoto = syntheticJpeg({ scanBytes: 400 });
    const stuck = await customer.start({ kind: 'photo', mime: 'image/jpeg', totalBytes: stuckPhoto.length, clientUploadId: '10600000-0000-4000-8000-000000000002' });
    await customer.chunk(stuck.body.data.id, 0, stuckPhoto);
    await database.query("UPDATE job_media SET status = 'processing', updated_at = NOW() - INTERVAL '20 minutes' WHERE id = $1", [stuck.body.data.id]);

    const orphan = path.join(tempDir(uploadDir), '10600000-0000-4000-8000-0000000000ff.part');
    fs.writeFileSync(orphan, 'left behind by a crash');
    const old = new Date(Date.now() - 49 * 3600_000);
    fs.utimesSync(orphan, old, old);

    const keyOf = async (id: string) => (await database.query('SELECT storage_key FROM job_media WHERE id = $1', [id])).rows[0].storage_key as string;
    const staleFile = storePath(uploadDir, await keyOf(stale.id));
    const racingFile = storePath(uploadDir, await keyOf(racing.id));
    const freshFile = storePath(uploadDir, await keyOf(fresh.id));
    const bookingId = await createQuoteRequest(database);

    // The job request locks and attaches `racing`; cleanup runs before it commits.
    const result = await db.transaction(async client => {
      await lockAttachableMediaInTransaction(client, customerA, [racing.id]);
      await attachMediaInTransaction(client, bookingId, [racing.id]);
      return cleanupJobMedia();
    });
    expect(result).toEqual({ expired: 2, recovered: 1, purged: 3, orphans: 1 });

    const rows = (await database.query(`SELECT id, status, booking_id, purged_at IS NOT NULL AS purged
      FROM job_media ORDER BY created_at`)).rows;
    const byId = new Map(rows.map(row => [row.id, row]));
    expect(byId.get(stale.id)).toMatchObject({ status: 'deleted', purged: true });
    expect(byId.get(idle.body.data.id)).toMatchObject({ status: 'deleted', purged: true });
    expect(byId.get(stuck.body.data.id)).toMatchObject({ status: 'deleted', purged: true });
    expect(byId.get(racing.id)).toMatchObject({ status: 'attached', booking_id: bookingId, purged: false });
    expect(byId.get(fresh.id)).toMatchObject({ status: 'stored', purged: false });

    expect(fs.existsSync(staleFile)).toBe(false);
    expect(fs.existsSync(racingFile)).toBe(true);
    expect(fs.existsSync(freshFile)).toBe(true);
    expect(fs.readdirSync(tempDir(uploadDir))).toEqual([]);

    // A second run finds nothing left to do.
    expect(await cleanupJobMedia()).toEqual({ expired: 0, recovered: 0, purged: 0, orphans: 0 });
  });
}, 60000);
