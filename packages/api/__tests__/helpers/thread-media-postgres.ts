// HA-M2 (customer human audit 2026-10-13, D38 Milestone 2 wave 3, package
// W3-B) helpers: photo and voice messages in request threads on the guarded
// PostgreSQL fixture.
//
// Combines the two fixtures waves 1-2 built, without copying either:
//   - withRequestThreadDatabase (helpers/request-thread-postgres): the REAL
//     migrations 006, 123, 138, 183, 184 and 185, synthetic names ("Ana R."),
//     the admin action names the thread routes record (conversation_viewed,
//     job_media_viewed) and push turned off;
//   - the job-media environment helpers/job-media-postgres sets up: a fresh
//     temporary UPLOAD_DIR (removed afterwards), a synthetic export secret to
//     sign links with, and a cleared viewer cache.
// Uploads go through the real job-media router (start, chunks, complete), so
// every attached item was really measured and stored on disk.
//
// Added by the W3-B review fix: withThreadMediaEnvironment (the job-media
// environment alone, to wrap another thread fixture such as
// helpers/reassign-postgres), and holdRowLock + waitForLockWaiters, which pin
// a concurrent interleaving (a held row lock pauses one transaction at a
// known statement; the wait polls pg_stat_activity for this fixture's own
// connections) for the lock-order and race tests HA-M2-346, 347 and 351.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Pool } from 'pg';
import * as jobMediaService from '../../src/services/job-media.service';
import { withRequestThreadDatabase, type RequestThreadFixtureOptions } from './request-thread-postgres';
import { mediaHttp, syntheticExportSecret, syntheticJpeg, uploadThroughApi } from './job-media-postgres';
import { buildMp4 } from './mp4-builder';

export interface ThreadMediaFixture {
  database: Pool;
  uploadDir: string;
}

export async function withThreadMediaDatabase(
  run: (fixture: ThreadMediaFixture) => Promise<void>,
  options: RequestThreadFixtureOptions = {},
): Promise<void> {
  await withThreadMediaEnvironment(async uploadDir => {
    await withRequestThreadDatabase(async database => {
      await run({ database, uploadDir });
    }, options);
  });
}

/**
 * Only the job-media environment (temporary UPLOAD_DIR, synthetic export
 * secret, cleared viewer cache), for a test that builds its database with
 * another thread fixture (e.g. helpers/reassign-postgres withReassignDatabase,
 * which is itself built on withRequestThreadDatabase).
 */
export async function withThreadMediaEnvironment(run: (uploadDir: string) => Promise<void>): Promise<void> {
  const saved = {
    uploadDir: process.env.UPLOAD_DIR,
    secret: process.env.DATA_EXPORT_DOWNLOAD_SECRET,
  };
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onservice-thread-media-'));
  process.env.UPLOAD_DIR = uploadDir;
  process.env.DATA_EXPORT_DOWNLOAD_SECRET = syntheticExportSecret;
  jobMediaService.__clearViewerCacheForTest();
  try {
    await run(uploadDir);
  } finally {
    jobMediaService.__clearViewerCacheForTest();
    if (saved.uploadDir === undefined) delete process.env.UPLOAD_DIR; else process.env.UPLOAD_DIR = saved.uploadDir;
    if (saved.secret === undefined) delete process.env.DATA_EXPORT_DOWNLOAD_SECRET;
    else process.env.DATA_EXPORT_DOWNLOAD_SECRET = saved.secret;
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }
}

/** A JPEG whose scan data has a recognisable length, so a served file can be matched to its upload. */
export function threadPhotoBytes(scanBytes = 900): Buffer {
  return syntheticJpeg({ scanBytes });
}

/** An M4A voice note the server measures at `durationMs`. */
export function threadVoiceBytes(durationMs = 12_000): Buffer {
  return buildMp4({ brand: 'M4A ', durationMs, tracks: [{ handler: 'soun', codec: 'mp4a' }] });
}

/** Upload a photo into a thread through the real job-media routes; returns the stored item's id. */
export async function uploadThreadPhoto(
  userId: string,
  role: string,
  conversationId: string,
  bytes: Buffer = threadPhotoBytes(),
): Promise<string> {
  const upload = await uploadThroughApi(mediaHttp(userId, role), {
    purpose: 'chat', conversationId, kind: 'photo', mime: 'image/jpeg', bytes,
  });
  if (upload.completed.status !== 200) {
    throw new Error(`photo upload failed: ${upload.completed.status} ${JSON.stringify(upload.completed.body)}`);
  }
  return upload.id;
}

/** Upload a voice note into a thread through the real job-media routes; returns the stored item's id. */
export async function uploadThreadVoice(
  userId: string,
  role: string,
  conversationId: string,
  durationMs = 12_000,
): Promise<string> {
  const upload = await uploadThroughApi(mediaHttp(userId, role), {
    purpose: 'chat', conversationId, kind: 'voice', mime: 'audio/mp4', bytes: threadVoiceBytes(durationMs), durationMs,
  });
  if (upload.completed.status !== 200) {
    throw new Error(`voice upload failed: ${upload.completed.status} ${JSON.stringify(upload.completed.body)}`);
  }
  return upload.id;
}

/** The job_media row's state, for "left unattached" and "attached once" checks. */
export async function mediaState(database: Pool, mediaId: string): Promise<{ status: string; booking_id: string | null }> {
  const result = await database.query<{ status: string; booking_id: string | null }>(
    'SELECT status, booking_id FROM job_media WHERE id = $1', [mediaId],
  );
  return result.rows[0]!;
}

/**
 * Hold a row lock on a dedicated fixture connection until release(), so a
 * concurrent send can be paused at a known point (e.g. job_media FOR UPDATE
 * pauses a media send inside its attach). `lockSql` must select one row FOR
 * UPDATE with $1 as its id. release() rolls the holder back.
 */
export async function holdRowLock(
  database: Pool,
  lockSql: string,
  id: string,
): Promise<{ release: () => Promise<void> }> {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(lockSql, [id]);
    if (locked.rowCount !== 1) throw new Error(`holdRowLock locked ${locked.rowCount} rows`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
    throw error;
  }
  let released = false;
  return {
    release: async () => {
      if (released) return;
      released = true;
      try {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    },
  };
}

/**
 * Wait until at least `count` other connections of this fixture are blocked
 * on a lock. The fixture pool names its connections after its own schema
 * (application_name), so parallel test files never count here.
 */
export async function waitForLockWaiters(database: Pool, count: number, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await database.query<{ waiting: number }>(`SELECT COUNT(*)::int AS waiting
        FROM pg_stat_activity
       WHERE application_name = current_setting('application_name')
         AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`);
    if ((result.rows[0]?.waiting ?? 0) >= count) return;
    if (Date.now() > deadline) {
      throw new Error(`expected ${count} connections waiting on a lock, saw ${result.rows[0]?.waiting ?? 0}`);
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}
