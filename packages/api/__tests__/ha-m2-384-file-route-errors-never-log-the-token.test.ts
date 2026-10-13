// HA-M2-384 (customer human audit 2026-10-13, D38 Milestone 2, package P3
// review fix; P3 overflow number, see HA-M2-370): a failure on the signed
// file route never writes the link token to the application log. The token
// works as a viewing link for up to 10 minutes and names the viewer
// (critique L11), so the job-media router answers every error on
// /file/<token> itself and logs only the method, status and code; it never
// hands the error to the shared error middleware, which logs the full path.
// Covered: the stored file is missing (404) and the database fails during
// the row lookup (500, with the generic message). Real router, auth,
// service, storage on a throwaway uploads volume, the shared error
// middleware and migration 184 on the guarded PostgreSQL fixture.
import fs from 'node:fs';
import { db } from '../src/models/db';
import { logger } from '../src/utils/logger';
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import {
  fetchSigned, mediaHttp, storePath, syntheticJpeg, uploadThroughApi, withJobMediaDatabase,
} from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

function everythingLogged(): string {
  return JSON.stringify([logger.info, logger.warn, logger.error, logger.debug].map(fn => jest.mocked(fn).mock.calls));
}

it('HA-M2-384: errors on the signed file route are answered without logging the token', async () => {
  await withJobMediaDatabase(async ({ database, uploadDir }) => {
    const customer = mediaHttp(customerA, 'customer');
    const { id } = await uploadThroughApi(customer, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg() });
    const url = (await customer.url(id)).body.data.url as string;
    const token = url.split('/').pop()!;
    const signature = token.split('.')[3]!;
    const storageKey = (await database.query('SELECT storage_key FROM job_media WHERE id = $1', [id])).rows[0].storage_key;
    for (const fn of [logger.info, logger.warn, logger.error, logger.debug]) jest.mocked(fn).mockClear();

    fs.unlinkSync(storePath(uploadDir, storageKey));
    const missing = await fetchSigned(url);
    expect(missing.status).toBe(404);
    expect(JSON.parse((missing.body as Buffer).toString('utf8'))).toMatchObject({ success: false, error: { statusCode: 404 } });

    const realQuery = db.query.bind(db);
    const query = jest.spyOn(db, 'query').mockImplementation((async (sql: string, params?: unknown[]) => {
      if (sql === 'SELECT * FROM job_media WHERE id = $1') throw new Error('synthetic database failure');
      return realQuery(sql, params);
    }) as typeof db.query);
    let failed: Awaited<ReturnType<typeof fetchSigned>>;
    try {
      failed = await fetchSigned(url);
    } finally {
      query.mockRestore();
    }
    expect(failed.status).toBe(500);
    const failedBody = JSON.parse((failed.body as Buffer).toString('utf8'));
    expect(failedBody.success).toBe(false);
    expect(failedBody.error.message).not.toContain('synthetic database failure');

    // Both failures were logged, without the token or the path that carries it.
    const logged = everythingLogged();
    expect(logged).toContain('"statusCode":404');
    expect(logged).toContain('"statusCode":500');
    expect(logged).not.toContain(signature);
    expect(logged).not.toContain(token);
    expect(logged).not.toContain('/file/');
  });
}, 60000);
