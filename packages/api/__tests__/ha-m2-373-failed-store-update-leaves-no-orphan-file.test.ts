// HA-M2-373 (customer human audit 2026-10-13, D38 Milestone 2, package P3
// review fix; P3 overflow number, see HA-M2-370): when completing an upload
// moves the checked file into private storage but the final database update
// to 'stored' fails (a dropped connection, or the API restarting during a
// deploy), the row already records where the file went. It stays
// 'processing' with its storage key, and once it has been stuck 15 minutes
// cleanupJobMedia recovers it and deletes the stored file, so no customer
// photo is left on the server with no row pointing at it. Real router, auth,
// service, storage on a throwaway uploads volume and migration 184 on the
// guarded PostgreSQL fixture; only the one 'stored' UPDATE is made to fail.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { db } from '../src/models/db';
import { cleanupJobMedia } from '../src/services/job-media.service';
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import { mediaHttp, storePath, syntheticJpeg, withJobMediaDatabase } from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-373: a failed final update after the file moved leaves no orphan file once cleanup runs', async () => {
  await withJobMediaDatabase(async ({ database, uploadDir }) => {
    const customer = mediaHttp(customerA, 'customer');
    const bytes = syntheticJpeg();
    const started = await customer.start({ kind: 'photo', mime: 'image/jpeg', totalBytes: bytes.length, clientUploadId: crypto.randomUUID() });
    const id = started.body.data.id as string;
    expect((await customer.chunk(id, 0, bytes)).status).toBe(200);

    const realQuery = db.query.bind(db);
    const query = jest.spyOn(db, 'query').mockImplementation((async (sql: string, params?: unknown[]) => {
      if (sql.includes("SET status = 'stored'")) throw new Error('synthetic connection reset');
      return realQuery(sql, params);
    }) as typeof db.query);
    let completedStatus: number;
    try {
      completedStatus = (await customer.complete(id)).status;
    } finally {
      query.mockRestore();
    }
    expect(completedStatus).toBe(500);

    const expectedKey = `private-artifacts/job-media/${customerA}/${id}.jpg`;
    const stuck = (await database.query('SELECT status, storage_key FROM job_media WHERE id = $1', [id])).rows[0];
    expect(stuck).toEqual({ status: 'processing', storage_key: expectedKey });
    expect(fs.existsSync(storePath(uploadDir, expectedKey))).toBe(true);

    await database.query("UPDATE job_media SET updated_at = NOW() - INTERVAL '20 minutes' WHERE id = $1", [id]);
    expect(await cleanupJobMedia()).toMatchObject({ recovered: 1, purged: 1 });

    expect(fs.existsSync(storePath(uploadDir, expectedKey))).toBe(false);
    const after = (await database.query('SELECT status, purged_at IS NOT NULL AS purged FROM job_media WHERE id = $1', [id])).rows[0];
    expect(after).toEqual({ status: 'deleted', purged: true });
  });
}, 60000);
