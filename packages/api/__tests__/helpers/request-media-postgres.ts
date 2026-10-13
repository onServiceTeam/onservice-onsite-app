// HA-M2 (customer human audit 2026-10-13, D38 Milestone 2, wave 3 package
// W3-A) helpers: job requests that carry private job media (W3 step I1).
//
// withRequestMediaDatabase is P2's withRequestFlowDatabase (Milestone 1 job
// requests, the REAL migrations 183 and 184, providers A and B eligible for
// the Cebu request category) run with a throwaway uploads volume and a
// synthetic link-signing secret, exactly as P3's withJobMediaDatabase sets
// them, so a test can upload real files through the real job-media router
// (helpers/job-media-postgres mediaHttp / uploadThroughApi) and then post a
// job request that attaches them.
//
// insertStoredMedia writes a job_media row that is already 'stored' (the
// state completeUpload leaves it in), for tests about counts and refusals that
// do not need the file itself. The row satisfies every migration 184 CHECK.
//
// A test that posts a request which is stored must call waitForRequestFanOut
// before it returns, so the route's background fan-out is finished before the
// fixture drops its schema.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Pool } from 'pg';
import * as jobMediaService from '../../src/services/job-media.service';
import { syntheticExportSecret } from './job-media-postgres';
import { waitUntil, withRequestFlowDatabase } from './request-flow-postgres';
import type { RequestEngineFixtureOptions } from './request-engine-postgres';

export async function withRequestMediaDatabase(
  run: (database: Pool, uploadDir: string) => Promise<void>,
  options: RequestEngineFixtureOptions = {},
): Promise<void> {
  const saved = { uploadDir: process.env.UPLOAD_DIR, secret: process.env.DATA_EXPORT_DOWNLOAD_SECRET };
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onservice-request-media-'));
  process.env.UPLOAD_DIR = uploadDir;
  process.env.DATA_EXPORT_DOWNLOAD_SECRET = syntheticExportSecret;
  jobMediaService.__clearViewerCacheForTest();
  try {
    await withRequestFlowDatabase(database => run(database, uploadDir), options);
  } finally {
    jobMediaService.__clearViewerCacheForTest();
    if (saved.uploadDir === undefined) delete process.env.UPLOAD_DIR; else process.env.UPLOAD_DIR = saved.uploadDir;
    if (saved.secret === undefined) delete process.env.DATA_EXPORT_DOWNLOAD_SECRET;
    else process.env.DATA_EXPORT_DOWNLOAD_SECRET = saved.secret;
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }
}

const STORED_SHAPE = {
  photo: { mime: 'image/jpeg', ext: 'jpg', bytes: 4096, limitBytes: 10485760, durationMs: null, limitDurationMs: null },
  video: { mime: 'video/mp4', ext: 'mp4', bytes: 1048576, limitBytes: 83886080, durationMs: 12000, limitDurationMs: 30000 },
  voice: { mime: 'audio/mp4', ext: 'm4a', bytes: 65536, limitBytes: 2097152, durationMs: 8000, limitDurationMs: 60000 },
} as const;

export interface StoredMediaSpec {
  kind?: 'photo' | 'video' | 'voice';
  /** 'stored' (default) or an earlier state such as 'uploading'. */
  status?: 'stored' | 'uploading' | 'processing';
  purpose?: 'job_request' | 'chat';
  conversationId?: string;
}

/** A job_media row for `ownerUserId`, as completeUpload leaves it (or still uploading). Returns its id. */
export async function insertStoredMedia(database: Pool, ownerUserId: string, spec: StoredMediaSpec = {}): Promise<string> {
  const kind = spec.kind ?? 'photo';
  const shape = STORED_SHAPE[kind];
  const status = spec.status ?? 'stored';
  const id = crypto.randomUUID();
  const stored = status === 'stored';
  await database.query(`INSERT INTO job_media (id, owner_user_id, purpose, conversation_id, kind, client_upload_id,
        declared_mime, declared_bytes, declared_duration_ms, limit_bytes, limit_duration_ms, chunk_bytes,
        bytes_received, mime, size_bytes, duration_ms, duration_source, storage_key, status, stored_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 2097152, $12, $13, $14, $15, $16, $17, $18, $19)`, [
    id, ownerUserId, spec.purpose ?? 'job_request', spec.conversationId ?? null, kind, crypto.randomUUID(),
    shape.mime, shape.bytes, shape.durationMs, shape.limitBytes, shape.limitDurationMs,
    stored ? shape.bytes : 0,
    stored ? shape.mime : null,
    stored ? shape.bytes : null,
    stored ? shape.durationMs : null,
    stored && shape.durationMs !== null ? 'container' : null,
    stored ? `private-artifacts/job-media/${ownerUserId}/${id}.${shape.ext}` : null,
    status,
    stored ? new Date() : null,
  ]);
  return id;
}

/** Status and booking of each media row, in the order of `ids`. */
export async function mediaStates(database: Pool, ids: string[]): Promise<Array<{ status: string; booking_id: string | null }>> {
  const rows = (await database.query<{ id: string; status: string; booking_id: string | null }>(
    'SELECT id, status, booking_id FROM job_media WHERE id = ANY($1::uuid[])', [ids],
  )).rows;
  return ids.map(id => {
    const row = rows.find(r => r.id === id);
    return { status: row?.status ?? 'missing', booking_id: row?.booking_id ?? null };
  });
}

/** Quote requests stored for one customer. */
export async function requestCount(database: Pool, customerId: string): Promise<number> {
  return (await database.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM bookings WHERE customer_id = $1 AND booking_type = 'quote_based'`, [customerId],
  )).rows[0]!.n;
}

/**
 * How many of the application's own connections are blocked on a lock right
 * now (the fixture pool tags every connection with its schema name as
 * application_name).
 */
export async function lockWaiterCount(database: Pool): Promise<number> {
  return (await database.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM pg_stat_activity
    WHERE application_name = current_setting('application_name') AND wait_event_type = 'Lock' AND state = 'active'`,
  )).rows[0]!.n;
}

/**
 * Wait until `count` of the application's own connections are blocked on a
 * row lock. Used to make two job requests reach the media lock together
 * before the test lets them through.
 */
export async function waitForLockWaiters(database: Pool, count: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const waiting = await lockWaiterCount(database);
    if (waiting >= count) return;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${count} lock waiters (saw ${waiting})`);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

/**
 * Wait until the pool the app shares with the fixture stays free (no client
 * checked out, nobody waiting for one) over 4 timer turns in a row. pg-pool
 * hands a released client to the next query in the same turn, so a chain of
 * awaited queries keeps a client checked out until it ends; a pool that stays
 * free across turns has no such chain left.
 */
export async function waitForPoolIdle(database: Pool): Promise<void> {
  const deadline = Date.now() + 10_000;
  let quietTurns = 0;
  while (quietTurns < 4) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the database pool to go idle');
    await new Promise(resolve => setTimeout(resolve, 25));
    const busy = database.totalCount - database.idleCount + database.waitingCount;
    quietTurns = busy === 0 ? quietTurns + 1 : 0;
  }
}

/**
 * Wait until a posted request's background fan-out has finished, so the
 * fixture's DROP SCHEMA never races it (the W3-A review saw that race end in
 * a teardown deadlock). POST /bookings/job-request answers 201 and then runs
 * the fan-out without waiting: invites, a re-check, the media counts, one
 * notification INSERT per provider, and for each an un-awaited device-push
 * lookup (preferences, quiet hours, push tokens). The invites are written
 * first, so seeing them is not enough. This waits for the `new_job_request`
 * notification of every invited provider, then for the pool to stay free
 * (waitForPoolIdle), which covers the device-push lookups.
 */
export async function waitForRequestFanOut(database: Pool, bookingId: string, providers = 2): Promise<void> {
  await waitUntil(async () => (await database.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM notifications WHERE type = 'new_job_request' AND data->>'bookingId' = $1`,
    [bookingId])).rows[0]!.n >= providers, 'the fan-out notifications');
  await waitForPoolIdle(database);
}
