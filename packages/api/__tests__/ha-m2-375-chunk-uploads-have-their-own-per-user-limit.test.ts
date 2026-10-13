// HA-M2-375 (customer human audit 2026-10-13, D38 Milestone 2, package P3
// review fix; P3 overflow number, see HA-M2-370): chunk uploads skip the
// global rate limiter (HA-M2-109), so PUT /api/v1/job-media/:id/chunks/:index
// must answer to its own limiter: 240 chunks per 10 minutes per signed-in
// user, counted in Redis under rl:jobmedia:chunk:u:<userId>. At 241 the
// chunk gets 429 and nothing is written (bytes_received stays 0, no temp
// file); at 240 the same chunk is accepted. Real router, auth, express-rate-
// limit and rate-limit-redis, service and migration 184 on the guarded
// PostgreSQL fixture; the shared Redis mock answers each counter increment
// with the hit count this test sets.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { redis } from '../src/config/redis.config';
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import { mediaHttp, syntheticJpeg, tempDir, withJobMediaDatabase } from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-375: the chunk route has its own per-user limit of 240 per 10 minutes', async () => {
  await withJobMediaDatabase(async ({ database, uploadDir }) => {
    let chunkHits = 1;
    const counted: string[] = [];
    jest.mocked(redis.call).mockImplementation((async (...command: unknown[]) => {
      const operation = String(command[0] ?? '').toUpperCase();
      if (operation === 'SCRIPT') return 'ha-m2-375-script-sha';
      if (operation === 'EVALSHA') {
        const key = String(command[3]);
        counted.push(key);
        return [key.startsWith('rl:jobmedia:chunk:') ? chunkHits : 1, 600_000];
      }
      return null;
    }) as never);

    const customer = mediaHttp(customerA, 'customer');
    const bytes = syntheticJpeg();
    const started = await customer.start({ kind: 'photo', mime: 'image/jpeg', totalBytes: bytes.length, clientUploadId: crypto.randomUUID() });
    expect(started.status).toBe(201);
    const id = started.body.data.id as string;

    chunkHits = 241;
    counted.length = 0;
    const limited = await customer.chunk(id, 0, bytes);
    expect(limited.status).toBe(429);
    expect(counted).toEqual([`rl:jobmedia:chunk:u:${customerA}`]);
    expect(Number((await database.query('SELECT bytes_received FROM job_media WHERE id = $1', [id])).rows[0].bytes_received)).toBe(0);
    expect(fs.existsSync(path.join(tempDir(uploadDir), `${id}.part`))).toBe(false);

    chunkHits = 240;
    const accepted = await customer.chunk(id, 0, bytes);
    expect(accepted.status).toBe(200);
    expect(accepted.body.data).toMatchObject({ bytesReceived: bytes.length, complete: true });
  });
}, 60000);
