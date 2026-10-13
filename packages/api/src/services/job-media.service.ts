/**
 * D38 private job media (Ken's human audit 2026-10-13, Milestone 2 package
 * P3): photos, a short video and a voice note on a job request, and photos
 * and voice notes in request threads.
 *
 * Plan: qa-frameworks/human-audit-2026-10-13/design-media.md sections 2-10,
 * merged.md sections 2.3 and 3 (P3), and the critique.md corrections, which
 * win where they differ:
 *   - the signed file URL has no extension (/api/v1/job-media/file/<token>);
 *     the name goes in Content-Disposition, because nginx sends any URL
 *     ending in .jpg/.png/.webp on the web and admin hosts to disk (H3);
 *   - links live at most 10 minutes;
 *   - non-admin booking listings return request media only; chat media is
 *     reached only through its conversation (M7);
 *   - MP4/MOV location metadata is removed (M14, utils/isobmff.ts).
 *
 * Life of an item (job_media.status, migration 184):
 *   uploading -> processing (complete claimed) -> stored | rejected
 *   stored -> attached (job request or thread message)
 *   uploading/stored -> deleted (owner delete, or 24 h unattached)
 *   processing -> deleted (stuck 15 min: crash recovery)
 *   attached -> deleted (account anonymisation only)
 *   deleted -> files removed, purged_at set (cleanupJobMedia)
 * Every status change is a conditional UPDATE, so of two racing writers
 * exactly one wins, and files are deleted only after the row change commits.
 *
 * Who may view an item (canView):
 *   - its owner, while it is stored or attached;
 *   - admin and super_admin, attached items only; minting a link writes one
 *     admin_actions row (job_media_viewed) per booking for request media and
 *     one per conversation for thread media;
 *   - request media: the assigned provider or the approved performer staff of
 *     the booking, a provider holding a live (submitted, unexpired) quote, or
 *     a provider with no quote on it who can currently see the lead
 *     (jobLeadsService.getOpenJobRequestForProvider resolves). A provider whose
 *     quote was declined, expired or withdrawn, or who is locked out by the
 *     open-quote cap, matches none of these;
 *   - chat media: the two participants of its conversation.
 * dpo, other customers and provider staff outside their assigned job get 404.
 *
 * No money, booking status or quote is ever changed here.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '../models/db';
import { createAppError, type AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { isPrivateExportSecretUsable } from '../config/boot-guards';
import {
  DECLARABLE_MIME_BY_KIND, EXTENSION_BY_MIME, JOB_MEDIA_CONFIG, VIDEO_CODECS, VOICE_MP4_CODECS,
  VOICE_WEBM_CODECS, type JobMediaKind, type JobMediaPurpose,
} from '../config/job-media.config';
import * as settingsService from './settings.service';
import * as uploadService from './upload.service';
import * as jobLeadsService from './job-leads.service';
import { sniffContainer, type MediaContainer } from '../utils/media-sniff';
import { inspectAndScrubIsoBmff, IsoBmffError, type IsoBmffReport } from '../utils/isobmff';
import { ContainerError, inspectOgg, inspectWebm } from '../utils/webm-ogg';
import { stripImageMetadata } from '../utils/image-metadata';
import { parseSingleRange } from '../utils/http-range';

// ── Types ──

export type TxClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface MediaViewer {
  userId: string;
  role: string;
}

export type JobMediaStatus = 'uploading' | 'processing' | 'stored' | 'attached' | 'rejected' | 'deleted';

interface JobMediaRow {
  id: string;
  owner_user_id: string;
  purpose: JobMediaPurpose;
  booking_id: string | null;
  conversation_id: string | null;
  kind: JobMediaKind;
  client_upload_id: string;
  declared_mime: string;
  declared_bytes: number | string;
  declared_duration_ms: number | null;
  limit_bytes: number | string;
  limit_duration_ms: number | null;
  chunk_bytes: number;
  bytes_received: number | string;
  mime: string | null;
  size_bytes: number | string | null;
  duration_ms: number | null;
  duration_source: 'container' | 'client' | null;
  width: number | null;
  height: number | null;
  codec: string | null;
  storage_key: string | null;
  status: JobMediaStatus;
  rejection_code: string | null;
  created_at: Date;
  updated_at: Date;
  stored_at: Date | null;
  attached_at: Date | null;
  deleted_at: Date | null;
  purged_at: Date | null;
}

export interface UploadState {
  id: string;
  status: JobMediaStatus;
  kind: JobMediaKind;
  purpose: JobMediaPurpose;
  chunkBytes: number;
  totalChunks: number;
  bytesReceived: number;
  nextIndex: number;
  rejectionCode: string | null;
  limits: { bytes: number; durationMs: number | null };
}

export interface JobMediaDto {
  id: string;
  purpose: JobMediaPurpose;
  kind: JobMediaKind;
  status: JobMediaStatus;
  mime: string | null;
  sizeBytes: number | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface MediaViewUrl {
  url: string;
  expiresAt: string;
  kind: JobMediaKind;
  mime: string;
  durationMs: number | null;
}

export interface StartUploadInput {
  purpose?: JobMediaPurpose;
  conversationId?: string;
  kind: JobMediaKind;
  mime: string;
  totalBytes: number;
  clientUploadId: string;
  durationMs?: number;
  width?: number;
  height?: number;
}

export interface SignedStreamResult {
  status: 200 | 206 | 416;
  headers: Record<string, string>;
  stream: NodeJS.ReadableStream | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADMIN_ROLES = new Set(['admin', 'super_admin']);
const VIEWABLE = new Set<JobMediaStatus>(['stored', 'attached']);

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

// ── Errors ──

/**
 * An AppError that can carry extra fields for the client (nextIndex) and a
 * Retry-After hint. The job-media router renders these itself; anything else
 * goes to the shared error middleware.
 */
export class JobMediaError extends Error implements AppError {
  readonly statusCode: number;
  readonly isOperational = true;
  readonly code: string;
  readonly details: Record<string, unknown>;
  readonly retryAfterSeconds?: number;

  constructor(statusCode: number, code: string, message: string, details: Record<string, unknown> = {}, retryAfterSeconds?: number) {
    super(message);
    this.name = 'JobMediaError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function mediaError(statusCode: number, code: string, message: string, details?: Record<string, unknown>): JobMediaError {
  return new JobMediaError(statusCode, code, message, details);
}

function notFound(): JobMediaError {
  return mediaError(404, 'not_found', 'Media not found.');
}

/** Upload refused after the file was checked. The row becomes 'rejected' with this code. */
class MediaRejection extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'MediaRejection';
  }
}

const REJECTION_MESSAGES: Record<string, string> = {
  unsupported_type: 'This file type is not supported. Choose a photo, video or voice note from your phone.',
  kind_mismatch: 'This file is not the kind of media it was added as.',
  too_long: 'This recording is longer than allowed.',
  too_large: 'This file is larger than allowed.',
  malformed: 'This file could not be read. Choose another file.',
  codec_not_supported: 'This recording format cannot be played on other phones. Record it again in the app.',
  duration_unreadable: 'The length of this recording could not be read. Record it again in the app.',
  location_not_removable: 'This video carries location data that could not be removed. Choose another video.',
  photo_malformed: 'This photo could not be read. Choose another photo.',
};

function reject(code: string): never {
  throw new MediaRejection(code, REJECTION_MESSAGES[code] ?? REJECTION_MESSAGES.malformed!);
}

// ── Helpers ──

function toNumber(value: number | string | null): number {
  return value === null ? 0 : Number(value);
}

/** Lowercase, drop parameters ("audio/webm;codecs=opus"), and read audio/x-m4a as audio/mp4. */
export function normaliseMime(value: string): string {
  const base = value.split(';')[0]!.trim().toLowerCase();
  if (base === 'audio/x-m4a' || base === 'audio/m4a') return 'audio/mp4';
  if (base === 'image/jpg') return 'image/jpeg';
  return base;
}

function totalChunks(row: Pick<JobMediaRow, 'declared_bytes' | 'chunk_bytes'>): number {
  return Math.ceil(toNumber(row.declared_bytes) / row.chunk_bytes);
}

function nextIndexOf(row: JobMediaRow): number {
  const received = toNumber(row.bytes_received);
  if (received >= toNumber(row.declared_bytes)) return totalChunks(row);
  return Math.floor(received / row.chunk_bytes);
}

function uploadState(row: JobMediaRow): UploadState {
  return {
    id: row.id,
    status: row.status,
    kind: row.kind,
    purpose: row.purpose,
    chunkBytes: row.chunk_bytes,
    totalChunks: totalChunks(row),
    bytesReceived: toNumber(row.bytes_received),
    nextIndex: nextIndexOf(row),
    rejectionCode: row.rejection_code,
    limits: { bytes: toNumber(row.limit_bytes), durationMs: row.limit_duration_ms },
  };
}

export function formatJobMedia(row: JobMediaRow): JobMediaDto {
  return {
    id: row.id,
    purpose: row.purpose,
    kind: row.kind,
    status: row.status,
    mime: row.mime,
    sizeBytes: row.size_bytes === null ? null : toNumber(row.size_bytes),
    durationMs: row.duration_ms,
    width: row.width,
    height: row.height,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function tempPathFor(mediaId: string): string {
  return path.join(uploadService.getJobMediaTempDir(), `${mediaId}.part`);
}

function cleanPhotoPathFor(mediaId: string): string {
  return path.join(uploadService.getJobMediaTempDir(), `${mediaId}.clean`);
}

async function removeQuietly(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn('job media temp file could not be removed', { file: path.basename(filePath) });
    }
  }
}

async function loadOwnedRow(ownerUserId: string, mediaId: string): Promise<JobMediaRow> {
  if (!isUuid(mediaId)) throw notFound();
  const result = await db.query<JobMediaRow>(
    'SELECT * FROM job_media WHERE id = $1 AND owner_user_id = $2',
    [mediaId, ownerUserId],
  );
  const row = result.rows[0];
  if (!row) throw notFound();
  return row;
}

// ── Request threads (chat media) ──

interface ConversationAccessRow {
  id: string;
  booking_id: string;
  customer_id: string;
  provider_id: string;
  stored_state: string | null;
  booking_status: string;
  booked_provider_id: string | null;
  booked_provider_user_id: string | null;
  thread_quote_status: string | null;
  thread_quote_lapsed: boolean | null;
}

/**
 * The effective thread state from merged.md section 2.2, read with HEAD
 * columns only: conversations.state arrives with migration 185 (package P4),
 * so it is read through to_jsonb(c), which is simply NULL before 185. A
 * thread is read-only when it was closed (reassignment), when the request
 * was cancelled with nobody booked, when another provider is booked, or when
 * this provider has no booking on it and their quote was declined, withdrawn
 * or has expired (a submitted quote past expires_at counts as expired, as in
 * request-thread.service THREAD_STATE_SQL). Once migration 185 is everywhere
 * (W3) this can delegate to THREAD_STATE_SQL so there is one definition.
 */
async function loadConversationAccess(conversationId: string): Promise<ConversationAccessRow | null> {
  if (!isUuid(conversationId)) return null;
  const result = await db.query<ConversationAccessRow>(
    `SELECT c.id, c.booking_id, c.customer_id, c.provider_id,
            to_jsonb(c) ->> 'state' AS stored_state,
            b.status AS booking_status, b.provider_id AS booked_provider_id,
            bp.user_id AS booked_provider_user_id,
            tq.status AS thread_quote_status,
            (tq.status = 'submitted' AND tq.expires_at <= NOW()) AS thread_quote_lapsed
       FROM conversations c
       JOIN bookings b ON b.id = c.booking_id
       LEFT JOIN providers bp ON bp.id = b.provider_id
       LEFT JOIN LATERAL (
         SELECT q.status, q.expires_at FROM booking_quotes q
           JOIN providers qp ON qp.id = q.provider_id
          WHERE q.booking_id = c.booking_id AND qp.user_id = c.provider_id
          ORDER BY q.created_at DESC LIMIT 1) tq ON TRUE
      WHERE c.id = $1`,
    [conversationId],
  );
  return result.rows[0] ?? null;
}

function conversationIsReadOnly(row: ConversationAccessRow): boolean {
  if (row.stored_state === 'read_only') return true;
  if (!row.booked_provider_id && row.booking_status.startsWith('cancelled')) return true;
  const isBookedProvider = row.booked_provider_user_id === row.provider_id;
  if (row.booked_provider_id && !isBookedProvider) return true;
  if (!isBookedProvider && ['declined', 'expired', 'withdrawn'].includes(row.thread_quote_status ?? '')) return true;
  if (!isBookedProvider && row.thread_quote_lapsed === true) return true;
  return false;
}

function isConversationParticipant(row: Pick<ConversationAccessRow, 'customer_id' | 'provider_id'>, viewer: MediaViewer): boolean {
  if (viewer.role === 'customer') return row.customer_id === viewer.userId;
  if (viewer.role === 'provider') return row.provider_id === viewer.userId;
  return false;
}

// ── Starting an upload ──

function limitsFor(kind: JobMediaKind, limits: settingsService.JobMediaLimits): { bytes: number; durationMs: number | null } {
  if (kind === 'photo') return { bytes: limits.photoMaxBytes, durationMs: null };
  if (kind === 'video') return { bytes: limits.videoMaxBytes, durationMs: limits.videoMaxSeconds * 1000 };
  return { bytes: limits.voiceMaxBytes, durationMs: limits.voiceMaxSeconds * 1000 };
}

function sameUpload(row: JobMediaRow, values: {
  purpose: JobMediaPurpose; conversationId: string | null; kind: JobMediaKind; mime: string; totalBytes: number; durationMs: number | null;
}): boolean {
  return row.purpose === values.purpose
    && (row.conversation_id ?? null) === values.conversationId
    && row.kind === values.kind
    && row.declared_mime === values.mime
    && toNumber(row.declared_bytes) === values.totalBytes
    && (row.declared_duration_ms ?? null) === values.durationMs;
}

function resumeOrRefuse(row: JobMediaRow, values: Parameters<typeof sameUpload>[1]): { created: boolean; upload: UploadState } {
  if (!sameUpload(row, values)) {
    throw mediaError(409, 'client_upload_id_reused', 'This upload ID was already used for a different file.');
  }
  if (row.status === 'deleted') {
    throw mediaError(410, 'upload_removed', 'This upload was removed. Add the file again.');
  }
  return { created: false, upload: uploadState(row) };
}

export async function startUpload(owner: MediaViewer, input: StartUploadInput): Promise<{ created: boolean; upload: UploadState }> {
  const purpose: JobMediaPurpose = input.purpose ?? 'job_request';
  const kind = input.kind;
  const mime = normaliseMime(input.mime);
  const conversationId = purpose === 'chat' ? (input.conversationId ?? null) : null;

  if (purpose === 'job_request') {
    if (owner.role !== 'customer') {
      throw mediaError(403, 'forbidden', 'Only customers can add photos, videos or voice notes to a job request.');
    }
    if (input.conversationId) {
      throw mediaError(400, 'conversation_not_allowed', 'A job-request upload does not belong to a conversation.');
    }
  } else {
    if (!conversationId) throw mediaError(400, 'conversation_required', 'Choose the conversation this file belongs to.');
    const conversation = await loadConversationAccess(conversationId);
    if (!conversation || !isConversationParticipant(conversation, owner)) {
      throw mediaError(404, 'THREAD_NOT_FOUND', 'Conversation not found.');
    }
    if (conversationIsReadOnly(conversation)) {
      throw mediaError(403, 'THREAD_READ_ONLY', 'This conversation is closed. You can still read it, but not send to it.');
    }
    if (kind !== 'photo' && kind !== 'voice') {
      throw mediaError(400, 'type_not_allowed', 'Only photos and voice notes can be sent in a conversation.');
    }
  }

  // A resumed upload keeps the limits it started with (the snapshot on its
  // row), and is not refused by a lowered setting, the quota or the disk guard.
  const declaredDuration = kind === 'photo' ? null : (input.durationMs ?? null);
  const values = { purpose, conversationId, kind, mime, totalBytes: input.totalBytes, durationMs: declaredDuration };
  const existing = await db.query<JobMediaRow>(
    'SELECT * FROM job_media WHERE owner_user_id = $1 AND client_upload_id = $2',
    [owner.userId, input.clientUploadId],
  );
  if (existing.rows[0]) return resumeOrRefuse(existing.rows[0], values);

  if (!DECLARABLE_MIME_BY_KIND[kind].has(mime)) {
    throw mediaError(400, 'type_not_allowed', 'This file type is not supported for this kind of media.');
  }
  if (kind === 'photo' && !(await uploadService.getAllowedImageMimeTypes()).has(mime)) {
    throw mediaError(400, 'type_not_allowed', 'This photo format is not accepted right now. Choose a JPG, PNG or WebP photo.');
  }

  const limits = limitsFor(kind, await settingsService.getJobMediaLimits());
  if (input.totalBytes > limits.bytes) {
    throw mediaError(400, 'too_large', 'This file is larger than allowed.', { limitBytes: limits.bytes });
  }
  const durationMs = declaredDuration;
  if (kind !== 'photo') {
    // A 0 ms recording is no recording: request threads store a voice note's
    // length as 1-600000 ms (migration 185), so it is refused here, before
    // anything is uploaded (P3 review fix).
    if (durationMs === null || durationMs < 1) {
      throw mediaError(400, 'duration_required', 'The length of the recording is required.');
    }
    if (durationMs > limits.durationMs! + JOB_MEDIA_CONFIG.durationToleranceMs) {
      throw mediaError(400, 'too_long', 'This recording is longer than allowed.', { limitDurationMs: limits.durationMs });
    }
  }

  const freeBytes = await uploadService.getUploadVolumeFreeBytes();
  if (freeBytes !== null && freeBytes < JOB_MEDIA_CONFIG.minFreeDiskBytes) {
    logger.error('Job media upload refused: the uploads volume is nearly full', { freeBytes });
    throw mediaError(507, 'job_media_storage_full', 'Uploads are paused for a moment. Please try again later.');
  }

  return db.transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('job_media:' || $1::text, 0))", [owner.userId]);
    const again = await client.query<JobMediaRow>(
      'SELECT * FROM job_media WHERE owner_user_id = $1 AND client_upload_id = $2',
      [owner.userId, input.clientUploadId],
    );
    if (again.rows[0]) return resumeOrRefuse(again.rows[0], values);

    const quota = await client.query<{ open_items: number; declared_24h: string }>(
      `SELECT count(*) FILTER (WHERE status IN ('uploading','processing','stored'))::int AS open_items,
              COALESCE(sum(declared_bytes) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'), 0)::text AS declared_24h
         FROM job_media WHERE owner_user_id = $1`,
      [owner.userId],
    );
    const openItems = Number(quota.rows[0]?.open_items ?? 0);
    const declared24h = Number(quota.rows[0]?.declared_24h ?? 0);
    if (openItems >= JOB_MEDIA_CONFIG.maxOpenItemsPerOwner
        || declared24h + input.totalBytes > JOB_MEDIA_CONFIG.maxDeclaredBytesPer24h) {
      throw mediaError(429, 'job_media_quota', 'You have too many uploads in progress. Finish or remove some, then try again.');
    }

    const inserted = await client.query<JobMediaRow>(
      `INSERT INTO job_media (owner_user_id, purpose, conversation_id, kind, client_upload_id,
              declared_mime, declared_bytes, declared_duration_ms, limit_bytes, limit_duration_ms,
              chunk_bytes, width, height)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (owner_user_id, client_upload_id) DO NOTHING
       RETURNING *`,
      [owner.userId, purpose, conversationId, kind, input.clientUploadId, mime, input.totalBytes,
        durationMs, limits.bytes, limits.durationMs, JOB_MEDIA_CONFIG.chunkBytes,
        input.width ?? null, input.height ?? null],
    );
    if (!inserted.rows[0]) {
      const raced = await client.query<JobMediaRow>(
        'SELECT * FROM job_media WHERE owner_user_id = $1 AND client_upload_id = $2',
        [owner.userId, input.clientUploadId],
      );
      return resumeOrRefuse(raced.rows[0]!, values);
    }
    return { created: true, upload: uploadState(inserted.rows[0]) };
  });
}

// ── Chunks ──

export async function putChunk(
  owner: MediaViewer,
  mediaId: string,
  index: number,
  body: Buffer,
): Promise<{ bytesReceived: number; nextIndex: number; complete: boolean }> {
  if (!isUuid(mediaId)) throw notFound();
  if (!Number.isInteger(index) || index < 0 || index > 99_999) {
    throw mediaError(400, 'bad_chunk_index', 'The chunk number is not valid.');
  }
  return db.transaction(async client => {
    const result = await client.query<JobMediaRow>(
      'SELECT * FROM job_media WHERE id = $1 AND owner_user_id = $2 FOR UPDATE',
      [mediaId, owner.userId],
    );
    const row = result.rows[0];
    if (!row) throw notFound();
    if (row.status !== 'uploading') {
      throw mediaError(409, 'not_uploading', 'This upload is no longer accepting chunks.', { status: row.status });
    }
    const declared = toNumber(row.declared_bytes);
    const received = toNumber(row.bytes_received);
    const expected = nextIndexOf(row);
    const progress = { bytesReceived: received, nextIndex: expected, complete: received >= declared };
    if (index < expected) return progress; // A re-sent chunk: already stored.
    if (index > expected) {
      throw mediaError(409, 'chunk_out_of_order', 'Send the chunks in order.', { nextIndex: expected });
    }
    const expectedLength = Math.min(row.chunk_bytes, declared - index * row.chunk_bytes);
    if (body.length !== expectedLength) {
      throw mediaError(400, 'chunk_length_mismatch', 'This chunk is not the expected size.', { expectedBytes: expectedLength });
    }

    // A retry after a crash rewrites the same bytes at the same place.
    await fs.mkdir(uploadService.getJobMediaTempDir(), { recursive: true, mode: 0o700 });
    const handle = await fs.open(tempPathFor(mediaId), fs.constants.O_WRONLY | fs.constants.O_CREAT, 0o600);
    try {
      await handle.write(body, 0, body.length, index * row.chunk_bytes);
      await handle.datasync();
    } finally {
      await handle.close();
    }
    const updated = await client.query<JobMediaRow>(
      `UPDATE job_media SET bytes_received = bytes_received + $2, updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [mediaId, body.length],
    );
    const next = updated.rows[0]!;
    return {
      bytesReceived: toNumber(next.bytes_received),
      nextIndex: nextIndexOf(next),
      complete: toNumber(next.bytes_received) >= declared,
    };
  });
}

// ── Checking a finished file ──

export interface InspectedMedia {
  mime: string;
  ext: string;
  durationMs: number | null;
  durationSource: 'container' | 'client' | null;
  width: number | null;
  height: number | null;
  codec: string | null;
  /** The file to store (a cleaned copy for photos, the scrubbed original otherwise). */
  storePath: string;
}

export interface InspectTarget {
  id: string;
  kind: JobMediaKind;
  declaredDurationMs: number | null;
  limitDurationMs: number | null;
  width?: number | null;
  height?: number | null;
}

async function readHead(handle: fs.FileHandle, size: number, length: number): Promise<Buffer> {
  const buf = Buffer.alloc(Math.min(size, length));
  if (buf.length === 0) return buf;
  await handle.read(buf, 0, buf.length, 0);
  return buf;
}

async function readTail(handle: fs.FileHandle, size: number, length: number): Promise<Buffer> {
  const take = Math.min(size, length);
  const buf = Buffer.alloc(take);
  if (take === 0) return buf;
  await handle.read(buf, 0, take, size - take);
  return buf;
}

/**
 * The measured (or, for a Chrome WebM, declared) length of a recording, or a
 * duration_unreadable rejection when there is none or it is under 1 ms. A
 * 0 ms length can come from an Ogg whose last granule equals its pre-skip,
 * an mvhd that rounds to 0 or a WebM Duration under half a millisecond, and
 * migration 185 cannot store it on a thread message (P3 review fix).
 */
function requireDuration(durationMs: number | null): number {
  if (durationMs === null || durationMs < 1) reject('duration_unreadable');
  return durationMs;
}

function overLimit(durationMs: number, limitDurationMs: number | null): boolean {
  return limitDurationMs !== null && durationMs > limitDurationMs + JOB_MEDIA_CONFIG.durationToleranceMs;
}

function isoMime(report: IsoBmffReport, kind: 'video' | 'voice'): { mime: string; ext: string } {
  const brand = report.majorBrand;
  if (kind === 'video') {
    if (brand === 'qt  ') return { mime: 'video/quicktime', ext: 'mov' };
    if (brand.startsWith('3gp') || brand.startsWith('3g2')) return { mime: 'video/3gpp', ext: '3gp' };
    return { mime: 'video/mp4', ext: 'mp4' };
  }
  if (brand.startsWith('3gp') || brand.startsWith('3g2')) return { mime: 'audio/3gpp', ext: '3gp' };
  return { mime: 'audio/mp4', ext: 'm4a' };
}

async function inspectIsoFile(filePath: string, size: number, target: InspectTarget): Promise<InspectedMedia> {
  const handle = await fs.open(filePath, 'r+');
  let report: IsoBmffReport;
  try {
    report = await inspectAndScrubIsoBmff(handle, size);
  } catch (error) {
    if (error instanceof IsoBmffError) reject('malformed');
    throw error;
  } finally {
    await handle.close();
  }
  if (report.locationRemaining > 0) reject('location_not_removable');

  const video = report.tracks.filter(track => track.handler === 'vide');
  const sound = report.tracks.filter(track => track.handler === 'soun');
  let codec: string | null;
  let width: number | null = null;
  let height: number | null = null;
  if (target.kind === 'video') {
    const main = video[0];
    if (!main) reject('kind_mismatch');
    if (!main.codec || !VIDEO_CODECS.has(main.codec)) reject('codec_not_supported');
    codec = main.codec;
    width = main.width ?? null;
    height = main.height ?? null;
  } else {
    if (video.length > 0) reject('kind_mismatch');
    const main = sound[0];
    if (!main) reject('kind_mismatch');
    if (!main.codec || !VOICE_MP4_CODECS.has(main.codec)) reject('codec_not_supported');
    codec = main.codec;
  }
  const durationMs = requireDuration(report.durationMs);
  if (overLimit(durationMs, target.limitDurationMs)) reject('too_long');
  const { mime, ext } = isoMime(report, target.kind === 'video' ? 'video' : 'voice');
  return {
    mime, ext, durationMs, durationSource: 'container',
    width: width !== null && width <= 20_000 ? width : null,
    height: height !== null && height <= 20_000 ? height : null,
    codec: codec.trim() || null, storePath: filePath,
  };
}

/**
 * Check a fully uploaded file against its kind and limits (no database
 * access). Throws MediaRejection with a stable code when the file must be
 * refused; on success the returned storePath is ready to be stored.
 */
export async function inspectUploadedFile(filePath: string, target: InspectTarget): Promise<InspectedMedia> {
  const stat = await fs.stat(filePath);
  const size = stat.size;
  const readHandle = await fs.open(filePath, 'r');
  let head: Buffer;
  let tail: Buffer;
  try {
    head = await readHead(readHandle, size, 64 * 1024);
    tail = await readTail(readHandle, size, 64 * 1024);
  } finally {
    await readHandle.close();
  }
  const container: MediaContainer | null = sniffContainer(head);
  if (!container) reject('unsupported_type');
  const isImage = container === 'jpeg' || container === 'png' || container === 'webp';

  if (target.kind === 'photo') {
    if (!isImage) reject('kind_mismatch');
    const mime = container === 'jpeg' ? 'image/jpeg' : container === 'png' ? 'image/png' : 'image/webp';
    if (!(await uploadService.getAllowedImageMimeTypes()).has(mime)) reject('unsupported_type');
    if (size > JOB_MEDIA_CONFIG.maxPhotoReadBytes) reject('too_large');
    const original = await fs.readFile(filePath);
    let cleaned: Buffer;
    try {
      cleaned = stripImageMetadata(original, mime, { keepOrientation: true });
    } catch {
      reject('photo_malformed');
    }
    const storePath = cleanPhotoPathFor(target.id);
    await fs.writeFile(storePath, cleaned, { mode: 0o600 });
    return {
      mime, ext: EXTENSION_BY_MIME[mime]!, durationMs: null, durationSource: null,
      // Display hints from the app; the file itself is never resized.
      width: target.width ?? null, height: target.height ?? null, codec: null, storePath,
    };
  }

  if (isImage) reject('kind_mismatch');

  if (container === 'isobmff') return inspectIsoFile(filePath, size, target);

  if (target.kind === 'video') reject('unsupported_type'); // WebM and Ogg video are not accepted.

  try {
    if (container === 'webm') {
      const report = inspectWebm(head);
      if (report.docType !== 'webm') reject('unsupported_type');
      if (report.hasVideo) reject('kind_mismatch');
      if (!report.hasAudio) reject('malformed');
      if (!report.audioCodecs.every(codec => VOICE_WEBM_CODECS.has(codec))) reject('codec_not_supported');
      let measured = report.durationMs;
      let durationSource: 'container' | 'client' = 'container';
      if (measured === null) {
        // Chrome writes no duration: rely on the app's declared length, which
        // was bounded at start, plus the size limit snapshot.
        measured = target.declaredDurationMs;
        durationSource = 'client';
      }
      const durationMs = requireDuration(measured);
      if (overLimit(durationMs, target.limitDurationMs)) reject('too_long');
      return {
        mime: 'audio/webm', ext: 'webm', durationMs, durationSource, width: null, height: null,
        codec: report.audioCodecs[0] ?? null, storePath: filePath,
      };
    }
    // Ogg
    const report = inspectOgg(head.subarray(0, Math.min(head.length, 4096)), tail);
    if (report.firstCodec !== 'opus') reject('codec_not_supported');
    if (report.hasOtherStream) reject('kind_mismatch');
    const durationMs = requireDuration(report.durationMs);
    if (overLimit(durationMs, target.limitDurationMs)) reject('too_long');
    return {
      mime: 'audio/ogg', ext: 'ogg', durationMs, durationSource: 'container',
      width: null, height: null, codec: 'opus', storePath: filePath,
    };
  } catch (error) {
    if (error instanceof ContainerError) reject('malformed');
    throw error;
  }
}

// ── Completing an upload ──

async function markRejected(mediaId: string, code: string): Promise<void> {
  await db.query(
    `UPDATE job_media SET status = 'rejected', rejection_code = $2, updated_at = NOW()
      WHERE id = $1 AND status = 'processing'`,
    [mediaId, code],
  );
}

export async function completeUpload(owner: MediaViewer, mediaId: string): Promise<JobMediaDto> {
  if (!isUuid(mediaId)) throw notFound();
  const claimed = await db.query<JobMediaRow>(
    `UPDATE job_media SET status = 'processing', updated_at = NOW()
      WHERE id = $1 AND owner_user_id = $2 AND status = 'uploading' AND bytes_received = declared_bytes
      RETURNING *`,
    [mediaId, owner.userId],
  );
  const row = claimed.rows[0];
  if (!row) {
    const current = await loadOwnedRow(owner.userId, mediaId);
    if (current.status === 'processing') {
      throw new JobMediaError(409, 'processing', 'This file is still being checked.', {}, 2);
    }
    if (current.status === 'stored' || current.status === 'attached') return formatJobMedia(current);
    if (current.status === 'uploading') {
      throw mediaError(409, 'upload_incomplete', 'Some chunks are still missing.', { nextIndex: nextIndexOf(current) });
    }
    if (current.status === 'rejected') {
      const code = current.rejection_code ?? 'malformed';
      throw mediaError(400, code, REJECTION_MESSAGES[code] ?? REJECTION_MESSAGES.malformed!);
    }
    throw mediaError(410, 'upload_removed', 'This upload was removed. Add the file again.');
  }

  const tempPath = tempPathFor(mediaId);
  let inspected: InspectedMedia;
  try {
    const stat = await fs.stat(tempPath).catch(() => null);
    if (!stat || stat.size !== toNumber(row.declared_bytes)) reject('malformed');
    inspected = await inspectUploadedFile(tempPath, {
      id: row.id,
      kind: row.kind,
      declaredDurationMs: row.declared_duration_ms,
      limitDurationMs: row.limit_duration_ms,
      width: row.width,
      height: row.height,
    });
  } catch (error) {
    if (error instanceof MediaRejection) {
      await markRejected(mediaId, error.code);
      await removeQuietly(tempPath);
      await removeQuietly(cleanPhotoPathFor(mediaId));
      throw mediaError(400, error.code, error.message);
    }
    // Not the file's fault (disk, storage): let the app try complete again.
    await db.query("UPDATE job_media SET status = 'uploading', updated_at = NOW() WHERE id = $1 AND status = 'processing'", [mediaId]);
    throw error;
  }

  const storageKey = `private-artifacts/job-media/${row.owner_user_id}/${row.id}.${inspected.ext}`;
  // Record where the file is going before it moves (P3 review fix). Whatever
  // fails after this point (the move, the final update below, or the process
  // itself), the row points at the stored file, so every clean-up path finds
  // it: owner delete, the 24 h expiry, the stuck-processing recovery and
  // account anonymisation all delete storage_key. The key stays on the row
  // when it goes back to 'uploading', so a later delete still removes it.
  const keyed = await db.query<{ id: string }>(
    `UPDATE job_media SET storage_key = $2, updated_at = NOW()
      WHERE id = $1 AND status = 'processing' RETURNING id`,
    [mediaId, storageKey],
  );
  if (!keyed.rows[0]) {
    // Cleanup recovered it while it was being checked: nothing was stored.
    await removeQuietly(tempPath);
    await removeQuietly(cleanPhotoPathFor(mediaId));
    throw mediaError(410, 'upload_removed', 'This upload was removed. Add the file again.');
  }
  let storedBytes: number;
  try {
    // What is stored can be smaller than the upload (a photo loses its metadata).
    storedBytes = (await fs.stat(inspected.storePath)).size;
    await uploadService.savePrivateArtifactFromFile(inspected.storePath, storageKey, inspected.mime);
  } catch (error) {
    // The move may have got part way (renamed, then the permission change
    // failed): remove any stored copy so nothing private is left that the
    // row no longer stands for. The app may try complete again; a photo's
    // original is still in the temp file, a recording's may have moved.
    await uploadService.deletePrivateArtifact(storageKey).catch(() => undefined);
    await db.query("UPDATE job_media SET status = 'uploading', updated_at = NOW() WHERE id = $1 AND status = 'processing'", [mediaId]);
    await removeQuietly(cleanPhotoPathFor(mediaId));
    throw error;
  }
  if (inspected.storePath !== tempPath) await removeQuietly(tempPath);

  // If this update fails (or the process stops first), the row stays
  // 'processing' with its storage key: after 15 minutes cleanupJobMedia
  // marks it deleted and removes the stored file.
  const stored = await db.query<JobMediaRow>(
    `UPDATE job_media
        SET status = 'stored', mime = $2, size_bytes = $3, duration_ms = $4, duration_source = $5,
            width = $6, height = $7, codec = $8, storage_key = $9, stored_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND status = 'processing'
      RETURNING *`,
    [mediaId, inspected.mime, storedBytes, inspected.durationMs, inspected.durationSource,
      inspected.width, inspected.height, inspected.codec, storageKey],
  );
  if (!stored.rows[0]) {
    // The owner deleted it (or cleanup recovered it) while it was being checked.
    await uploadService.deletePrivateArtifact(storageKey).catch(() => undefined);
    throw mediaError(410, 'upload_removed', 'This upload was removed. Add the file again.');
  }
  return formatJobMedia(stored.rows[0]);
}

export async function getUploadState(owner: MediaViewer, mediaId: string): Promise<UploadState> {
  return uploadState(await loadOwnedRow(owner.userId, mediaId));
}

export async function deleteUpload(owner: MediaViewer, mediaId: string): Promise<void> {
  if (!isUuid(mediaId)) throw notFound();
  const deleted = await db.query<JobMediaRow>(
    `UPDATE job_media SET status = 'deleted', deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND owner_user_id = $2 AND status IN ('uploading','stored','rejected')
      RETURNING *`,
    [mediaId, owner.userId],
  );
  if (deleted.rows[0]) {
    await purgeFiles(deleted.rows[0]);
    return;
  }
  const current = await loadOwnedRow(owner.userId, mediaId);
  if (current.status === 'attached') throw mediaError(409, 'already_attached', 'This file is already part of a sent request or message.');
  if (current.status === 'processing') throw new JobMediaError(409, 'processing', 'This file is still being checked.', {}, 2);
  // Already deleted: nothing left to do.
}

/** Remove a deleted item's files and record it. Failures are left for the cleanup worker. */
async function purgeFiles(row: Pick<JobMediaRow, 'id' | 'storage_key'>): Promise<boolean> {
  try {
    await removeQuietly(tempPathFor(row.id));
    await removeQuietly(cleanPhotoPathFor(row.id));
    if (row.storage_key) await uploadService.deletePrivateArtifact(row.storage_key);
    await db.query(
      `UPDATE job_media SET purged_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND status = 'deleted' AND purged_at IS NULL`,
      [row.id],
    );
    return true;
  } catch (error) {
    logger.warn('job media file removal failed; the cleanup worker will retry', {
      mediaId: row.id, error: error instanceof Error ? error.message : 'Unknown',
    });
    return false;
  }
}

// ── Viewer rule ──

interface BookingAccessRow {
  id: string;
  customer_id: string;
  assigned: boolean;
  performer: boolean;
  live_quote: boolean;
  any_quote: boolean;
}

async function loadBookingAccess(bookingId: string, viewerUserId: string): Promise<BookingAccessRow | null> {
  const result = await db.query<BookingAccessRow>(
    `SELECT b.id, b.customer_id,
            EXISTS (SELECT 1 FROM providers p WHERE p.id = b.provider_id AND p.user_id = $2) AS assigned,
            EXISTS (SELECT 1 FROM provider_staff ps
                     WHERE ps.id = b.performer_staff_id AND ps.provider_id = b.provider_id
                       AND ps.user_id = $2 AND ps.status = 'approved') AS performer,
            EXISTS (SELECT 1 FROM booking_quotes q JOIN providers p ON p.id = q.provider_id
                     WHERE q.booking_id = b.id AND p.user_id = $2 AND p.status = 'approved'
                       AND q.status = 'submitted' AND q.expires_at > NOW()) AS live_quote,
            EXISTS (SELECT 1 FROM booking_quotes q JOIN providers p ON p.id = q.provider_id
                     WHERE q.booking_id = b.id AND p.user_id = $2) AS any_quote
       FROM bookings b WHERE b.id = $1`,
    [bookingId, viewerUserId],
  );
  return result.rows[0] ?? null;
}

/** May this viewer see the request media of this booking (attached items)? */
async function canViewRequestMediaOfBooking(viewer: MediaViewer, bookingId: string): Promise<boolean> {
  if (ADMIN_ROLES.has(viewer.role)) return true;
  if (viewer.role !== 'customer' && viewer.role !== 'provider' && viewer.role !== 'provider_staff') return false;
  const access = await loadBookingAccess(bookingId, viewer.userId);
  if (!access) return false;
  if (viewer.role === 'customer') return access.customer_id === viewer.userId;
  if (viewer.role === 'provider_staff') return access.performer;
  if (access.assigned || access.live_quote) return true;
  if (access.any_quote) return false; // Declined, expired or withdrawn: no lead access either.
  try {
    await jobLeadsService.getOpenJobRequestForProvider(viewer.userId, bookingId);
    return true;
  } catch {
    return false;
  }
}

async function canViewRow(viewer: MediaViewer, row: JobMediaRow): Promise<boolean> {
  if (!VIEWABLE.has(row.status)) return false;
  if (row.owner_user_id === viewer.userId) return true;
  if (row.status !== 'attached' || !row.booking_id) return false;
  if (ADMIN_ROLES.has(viewer.role)) return true;
  if (row.purpose === 'chat') {
    if (!row.conversation_id) return false;
    const conversation = await db.query<{ customer_id: string; provider_id: string }>(
      'SELECT customer_id, provider_id FROM conversations WHERE id = $1',
      [row.conversation_id],
    );
    return !!conversation.rows[0] && isConversationParticipant(conversation.rows[0], viewer);
  }
  return canViewRequestMediaOfBooking(viewer, row.booking_id);
}

// The file route re-checks the viewer on every read, cached for a minute.
const viewerDecisionCache = new Map<string, { allowed: boolean; at: number }>();

async function cachedCanView(viewer: MediaViewer, row: JobMediaRow): Promise<boolean> {
  const key = `${viewer.userId}:${row.id}`;
  const now = Date.now();
  const hit = viewerDecisionCache.get(key);
  if (hit && now - hit.at < JOB_MEDIA_CONFIG.viewerCacheTtlMs) return hit.allowed;
  const allowed = await canViewRow(viewer, row);
  viewerDecisionCache.delete(key);
  viewerDecisionCache.set(key, { allowed, at: now });
  while (viewerDecisionCache.size > JOB_MEDIA_CONFIG.viewerCacheMaxEntries) {
    const oldest = viewerDecisionCache.keys().next().value;
    if (oldest === undefined) break;
    viewerDecisionCache.delete(oldest);
  }
  return allowed;
}

// ── Signed links ──

function signingKey(): Buffer {
  const secret = process.env.DATA_EXPORT_DOWNLOAD_SECRET;
  if (!isPrivateExportSecretUsable(secret)) {
    throw mediaError(503, 'media_links_unavailable', 'Private media links are not securely configured.');
  }
  // A key of its own, derived from the export secret, so a data-export or
  // project-document signature can never be replayed as a media link.
  return Buffer.from(crypto.hkdfSync('sha256', secret, 'onservice', 'job-media-url-v1', 32));
}

function signature(key: Buffer, mediaId: string, viewerId: string, exp: number): string {
  return crypto.createHmac('sha256', key).update(`job-media:v1:${mediaId}:${viewerId}:${exp}`).digest('hex');
}

/** token = mediaId.viewerId.exp.sig (exp in Unix seconds). */
export function signMediaToken(mediaId: string, viewerId: string, exp: number): string {
  return `${mediaId}.${viewerId}.${exp}.${signature(signingKey(), mediaId, viewerId, exp)}`;
}

function mediaUrl(token: string): string {
  // Root-relative: native apps put their API base in front; the web app and
  // admin call the API on their own origin. No file extension (critique H3).
  return `/api/v1/job-media/file/${token}`;
}

function mint(row: JobMediaRow, viewerId: string): MediaViewUrl {
  const exp = Math.floor(Date.now() / 1000) + JOB_MEDIA_CONFIG.urlTtlSeconds;
  return {
    url: mediaUrl(signMediaToken(row.id, viewerId, exp)),
    expiresAt: new Date(exp * 1000).toISOString(),
    kind: row.kind,
    mime: row.mime!,
    durationMs: row.duration_ms,
  };
}

/**
 * Private request and thread media is personal data: no admin link without
 * the ledger row. One job_media_viewed row (target: the booking) per
 * booking for its request media, details {mediaIds}, and one per
 * conversation for its thread media, details {mediaIds, purpose: 'chat',
 * conversationId}. Thread media was added in the P3 review: the admin
 * job-media routes (GET /:id/url, GET /booking/:id) can open it, and only
 * the threads' own admin view logs conversation_viewed.
 */
async function auditAdminViews(viewer: MediaViewer, rows: JobMediaRow[]): Promise<void> {
  if (!ADMIN_ROLES.has(viewer.role)) return;
  const groups = new Map<string, { bookingId: string; details: Record<string, unknown> & { mediaIds: string[] } }>();
  for (const row of rows) {
    if (row.owner_user_id === viewer.userId || !row.booking_id) continue;
    const conversationId = row.purpose === 'chat' ? row.conversation_id : null;
    const key = conversationId ? `chat:${conversationId}` : `request:${row.booking_id}`;
    const group = groups.get(key) ?? {
      bookingId: row.booking_id,
      details: conversationId ? { mediaIds: [], purpose: 'chat', conversationId } : { mediaIds: [] },
    };
    group.details.mediaIds.push(row.id);
    groups.set(key, group);
  }
  if (groups.size === 0) return;
  // Gate C (money-in-transaction): admin_actions writes go through a
  // transaction, which also makes the rows for one view all-or-nothing.
  await db.transaction(async client => {
    for (const { bookingId, details } of groups.values()) {
      await client.query(
        `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details)
         VALUES ($1, 'job_media_viewed', 'booking', $2, $3::jsonb)`,
        [viewer.userId, bookingId, JSON.stringify(details)],
      );
    }
  });
}

/**
 * Signed links for the items this viewer may see; others are left out of the
 * map. Used by GET /:id/url and by request threads (package P4) for chat media.
 */
export async function createViewUrls(viewer: MediaViewer, mediaIds: readonly string[]): Promise<Map<string, MediaViewUrl>> {
  const ids = [...new Set(mediaIds.filter(isUuid))];
  const out = new Map<string, MediaViewUrl>();
  if (ids.length === 0) return out;
  signingKey(); // 503 before any work when links cannot be signed.
  const result = await db.query<JobMediaRow>('SELECT * FROM job_media WHERE id = ANY($1::uuid[])', [ids]);
  const allowed: JobMediaRow[] = [];
  for (const row of result.rows) {
    if (await canViewRow(viewer, row)) allowed.push(row);
  }
  await auditAdminViews(viewer, allowed);
  for (const row of allowed) out.set(row.id, mint(row, viewer.userId));
  return out;
}

export async function createViewUrl(viewer: MediaViewer, mediaId: string): Promise<MediaViewUrl> {
  if (!isUuid(mediaId)) throw notFound();
  const urls = await createViewUrls(viewer, [mediaId]);
  const url = urls.get(mediaId);
  if (!url) throw notFound(); // Never 403: existence is not revealed.
  return url;
}

export async function listBookingMedia(
  viewer: MediaViewer,
  bookingId: string,
): Promise<{ items: Array<JobMediaDto & { url: string; expiresAt: string }>; legacyPhotos: string[] }> {
  if (!isUuid(bookingId)) throw notFound();
  signingKey();
  const booking = await db.query<{ id: string; job_photos: string[] | null }>(
    'SELECT id, job_photos FROM bookings WHERE id = $1',
    [bookingId],
  );
  if (!booking.rows[0]) throw notFound();
  if (!(await canViewRequestMediaOfBooking(viewer, bookingId))) throw notFound();

  const admin = ADMIN_ROLES.has(viewer.role);
  // Chat media also carries the booking id once sent; outside admin it is
  // reached only through its own conversation (critique M7).
  const rows = await db.query<JobMediaRow>(
    `SELECT * FROM job_media
      WHERE booking_id = $1 AND status = 'attached' ${admin ? '' : "AND purpose = 'job_request'"}
      ORDER BY kind, created_at, id`,
    [bookingId],
  );
  await auditAdminViews(viewer, rows.rows);
  return {
    items: rows.rows.map(row => {
      const link = mint(row, viewer.userId);
      return { ...formatJobMedia(row), url: link.url, expiresAt: link.expiresAt };
    }),
    legacyPhotos: booking.rows[0].job_photos ?? [],
  };
}

// ── Serving a signed link ──

function parseToken(token: string): { mediaId: string; viewerId: string; exp: number; sig: string } | null {
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [mediaId, viewerId, expText, sig] = parts as [string, string, string, string];
  if (!isUuid(mediaId) || !isUuid(viewerId) || !/^\d{1,12}$/.test(expText) || !/^[0-9a-f]{64}$/.test(sig)) return null;
  return { mediaId, viewerId, exp: Number(expText), sig };
}

function forbidden(): JobMediaError {
  return mediaError(403, 'forbidden', 'This link is not valid.');
}

/**
 * Stream a stored item for a signed link. Order of checks: signature, expiry,
 * the row, then the viewer rule again (cached for a minute). No database work
 * happens before the signature verifies.
 */
export async function openSignedStream(token: string, rangeHeader: string | undefined, method: string): Promise<SignedStreamResult> {
  const parsed = parseToken(token);
  if (!parsed) throw forbidden();
  const key = signingKey();
  const expected = Buffer.from(signature(key, parsed.mediaId, parsed.viewerId, parsed.exp), 'utf8');
  const provided = Buffer.from(parsed.sig, 'utf8');
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) throw forbidden();
  const now = Math.floor(Date.now() / 1000);
  if (parsed.exp > now + JOB_MEDIA_CONFIG.urlMaxFutureSeconds) throw forbidden();
  if (parsed.exp < now) throw mediaError(410, 'link_expired', 'This link has expired. Open the media again.');

  const rowResult = await db.query<JobMediaRow>('SELECT * FROM job_media WHERE id = $1', [parsed.mediaId]);
  const row = rowResult.rows[0];
  if (!row || !VIEWABLE.has(row.status) || !row.storage_key || !row.mime) throw notFound();
  const viewer = await db.query<{ id: string; role: string; is_active: boolean }>(
    'SELECT id, role, is_active FROM users WHERE id = $1',
    [parsed.viewerId],
  );
  const account = viewer.rows[0];
  if (!account || account.is_active === false) throw forbidden();
  if (!(await cachedCanView({ userId: account.id, role: account.role }, row))) throw forbidden();

  const size = toNumber(row.size_bytes);
  const ext = EXTENSION_BY_MIME[row.mime] ?? 'bin';
  const headers: Record<string, string> = {
    'Content-Type': row.mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `inline; filename="request-media.${ext}"`,
    'Cross-Origin-Resource-Policy': 'same-site',
    'X-Accel-Buffering': 'no',
  };
  const range = parseSingleRange(rangeHeader, size);
  if (range === 'unsatisfiable') {
    return { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}`, 'Content-Length': '0' }, stream: null };
  }
  const status: 200 | 206 = range ? 206 : 200;
  const length = range ? range.end - range.start + 1 : size;
  headers['Content-Length'] = String(length);
  if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`;
  if (method === 'HEAD') return { status, headers, stream: null };
  const object = await uploadService.getPrivateArtifactRange(row.storage_key, range, row.mime);
  return { status, headers, stream: object.body };
}

// ── Attaching (package P2: job requests; package P4: thread messages) ──

/**
 * Lock the owner's media for a new job request (inside the request's
 * transaction). Every id must be the owner's request media and stored.
 * Returns kinds so the caller can enforce the photo/video/voice counts.
 */
export async function lockAttachableMediaInTransaction(
  client: TxClient,
  ownerUserId: string,
  mediaIds: readonly string[],
): Promise<Array<{ id: string; kind: JobMediaKind }>> {
  const ids = [...new Set(mediaIds)];
  if (ids.length === 0) return [];
  const unavailable = (): AppError => Object.assign(
    createAppError('One of the photos or recordings is no longer available. Remove it and try again.', 400),
    { code: 'JOB_MEDIA_UNAVAILABLE' },
  );
  if (!ids.every(isUuid)) throw unavailable();
  const result = await client.query<{ id: string; kind: JobMediaKind; status: JobMediaStatus }>(
    `SELECT id, kind, status FROM job_media
      WHERE id = ANY($1::uuid[]) AND owner_user_id = $2 AND purpose = 'job_request'
      ORDER BY id FOR UPDATE`,
    [ids, ownerUserId],
  );
  if (result.rows.length !== ids.length) throw unavailable();
  if (result.rows.some(row => row.status === 'uploading' || row.status === 'processing')) {
    throw Object.assign(
      createAppError('Some photos or recordings are still uploading. Wait for them to finish.', 409),
      { code: 'JOB_MEDIA_NOT_READY' },
    );
  }
  if (result.rows.some(row => row.status === 'attached')) {
    throw Object.assign(
      createAppError('One of the photos or recordings is already part of another request.', 409),
      { code: 'JOB_MEDIA_ALREADY_USED' },
    );
  }
  if (result.rows.some(row => row.status !== 'stored')) throw unavailable();
  return result.rows.map(row => ({ id: row.id, kind: row.kind }));
}

/** Attach the locked media to the new booking (same transaction). All or nothing. */
export async function attachMediaInTransaction(client: TxClient, bookingId: string, mediaIds: readonly string[]): Promise<void> {
  const ids = [...new Set(mediaIds)];
  if (ids.length === 0) return;
  const updated = await client.query(
    `UPDATE job_media SET status = 'attached', booking_id = $1, attached_at = NOW(), updated_at = NOW()
      WHERE id = ANY($2::uuid[]) AND status = 'stored' AND purpose = 'job_request' AND booking_id IS NULL`,
    [bookingId, ids],
  );
  if ((updated.rowCount ?? 0) !== ids.length) {
    throw Object.assign(
      createAppError('Some photos or recordings could not be attached. Try again.', 409),
      { code: 'JOB_MEDIA_NOT_READY' },
    );
  }
}

/**
 * Attach a thread upload to the message being sent (inside the message's
 * transaction). The item must be the sender's own chat upload for this
 * conversation, stored, and of the expected kind; a voice note must have a
 * length of at least 1 ms (else MEDIA_INVALID) and be within the length
 * limit it was uploaded under (else VOICE_TOO_LONG). Both are 422.
 */
export async function attachChatMediaInTransaction(
  client: TxClient,
  input: { mediaId: string; conversationId: string; senderId: string; expectedKind: 'photo' | 'voice' },
): Promise<{ kind: JobMediaKind; durationMs: number | null }> {
  const invalid = (): AppError => Object.assign(
    createAppError('This photo or voice note cannot be sent here.', 422),
    { code: 'MEDIA_INVALID' },
  );
  if (!isUuid(input.mediaId) || !isUuid(input.conversationId)) throw invalid();
  const locked = await client.query<JobMediaRow>(
    `SELECT * FROM job_media
      WHERE id = $1 AND purpose = 'chat' AND conversation_id = $2 AND owner_user_id = $3
      FOR UPDATE`,
    [input.mediaId, input.conversationId, input.senderId],
  );
  const row = locked.rows[0];
  if (!row || row.status !== 'stored' || row.kind !== input.expectedKind) throw invalid();
  if (row.kind === 'voice') {
    // The message stores this length, and migration 185 accepts only
    // 1-600000 ms (messages_media_duration_check): never hand P4 a value the
    // INSERT would refuse with a 500 (P3 review fix).
    if (row.duration_ms === null || row.duration_ms < 1) throw invalid();
    if (row.limit_duration_ms !== null && row.duration_ms > row.limit_duration_ms + JOB_MEDIA_CONFIG.durationToleranceMs) {
      throw Object.assign(createAppError('This voice note is longer than allowed.', 422), { code: 'VOICE_TOO_LONG' });
    }
  }
  const updated = await client.query<{ kind: JobMediaKind; duration_ms: number | null }>(
    `UPDATE job_media jm
        SET status = 'attached', booking_id = c.booking_id, attached_at = NOW(), updated_at = NOW()
       FROM conversations c
      WHERE jm.id = $1 AND c.id = jm.conversation_id AND jm.status = 'stored'
      RETURNING jm.kind, jm.duration_ms`,
    [input.mediaId],
  );
  if (!updated.rows[0]) throw invalid();
  return { kind: updated.rows[0].kind, durationMs: updated.rows[0].duration_ms };
}

// ── Account anonymisation and data export ──

async function jobMediaTableExists(executor: Pick<TxClient, 'query'>): Promise<boolean> {
  const result = await executor.query<{ present: boolean }>(
    "SELECT to_regclass('job_media') IS NOT NULL AS present",
  );
  return result.rows[0]?.present === true;
}

/**
 * Anonymisation cascade (data-management.service anonymizeUser): every item
 * the user uploaded, attached ones included, becomes 'deleted' in the same
 * transaction; cleanupJobMedia then removes the files. Returns the count.
 */
export async function markUserMediaDeleted(client: TxClient, userId: string): Promise<number> {
  if (!(await jobMediaTableExists(client))) return 0; // Schemas that predate migration 184.
  const result = await client.query(
    `UPDATE job_media SET status = 'deleted', deleted_at = NOW(), updated_at = NOW()
      WHERE owner_user_id = $1 AND status <> 'deleted'`,
    [userId],
  );
  return result.rowCount ?? 0;
}

/** Metadata (never the files or links) of everything the user uploaded, for their data export. */
export async function listUserMediaForExport(userId: string): Promise<Record<string, unknown>[]> {
  if (!(await jobMediaTableExists(db))) return [];
  const result = await db.query(
    `SELECT id, purpose, booking_id, conversation_id, kind, status, mime, size_bytes, duration_ms,
            width, height, created_at, stored_at, attached_at, deleted_at
       FROM job_media WHERE owner_user_id = $1 ORDER BY created_at, id`,
    [userId],
  );
  return result.rows;
}

// ── Cleanup worker ──

export interface CleanupResult {
  expired: number;
  recovered: number;
  purged: number;
  orphans: number;
}

/**
 * Run by the job-media-cleanup job (package P2 schedules it every 15 minutes):
 *  1. uploads idle for 24 h, and stored items never attached within 24 h,
 *     become deleted;
 *  2. items stuck in processing for 15 min (a crash mid-check) become deleted;
 *     a file already moved into storage is found through the storage_key
 *     that completeUpload records before the move, and purged in step 3;
 *  3. deleted items lose their files and get purged_at (retried until it works);
 *  4. temp files older than 48 h with no upload in progress are removed.
 * Locked rows are skipped, so an item being attached at the same moment is
 * never touched.
 */
export async function cleanupJobMedia(limit = 200): Promise<CleanupResult> {
  const batch = Math.max(1, Math.min(1000, Math.floor(limit)));
  const expired = await db.query(
    `UPDATE job_media SET status = 'deleted', deleted_at = NOW(), updated_at = NOW()
      WHERE id IN (
        SELECT id FROM job_media
         WHERE (status = 'uploading' AND updated_at < NOW() - make_interval(hours => $2))
            OR (status = 'stored' AND booking_id IS NULL AND stored_at < NOW() - make_interval(hours => $3))
         ORDER BY updated_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED)
        AND ((status = 'uploading' AND updated_at < NOW() - make_interval(hours => $2))
          OR (status = 'stored' AND booking_id IS NULL AND stored_at < NOW() - make_interval(hours => $3)))`,
    [batch, JOB_MEDIA_CONFIG.staleUploadingHours, JOB_MEDIA_CONFIG.unattachedStoredHours],
  );
  const recovered = await db.query(
    `UPDATE job_media SET status = 'deleted', deleted_at = NOW(), updated_at = NOW()
      WHERE id IN (
        SELECT id FROM job_media
         WHERE status = 'processing' AND updated_at < NOW() - make_interval(mins => $2)
         ORDER BY updated_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED)
        AND status = 'processing' AND updated_at < NOW() - make_interval(mins => $2)`,
    [batch, JOB_MEDIA_CONFIG.staleProcessingMinutes],
  );

  const toPurge = await db.query<Pick<JobMediaRow, 'id' | 'storage_key'>>(
    `SELECT id, storage_key FROM job_media
      WHERE status = 'deleted' AND purged_at IS NULL
      ORDER BY deleted_at LIMIT $1`,
    [batch],
  );
  let purged = 0;
  for (const row of toPurge.rows) {
    if (await purgeFiles(row)) purged += 1;
  }

  let orphans = 0;
  try {
    const dir = uploadService.getJobMediaTempDir();
    const names = (await fs.readdir(dir)).filter(name => /^[0-9a-f-]{36}\.(part|clean)$/i.test(name));
    const cutoff = Date.now() - JOB_MEDIA_CONFIG.orphanTempHours * 3600_000;
    const old: Array<{ name: string; id: string }> = [];
    for (const name of names) {
      if (old.length >= JOB_MEDIA_CONFIG.orphanTempMaxPerRun) break;
      const stat = await fs.stat(path.join(dir, name)).catch(() => null);
      if (stat && stat.mtimeMs < cutoff) old.push({ name, id: name.slice(0, 36).toLowerCase() });
    }
    if (old.length > 0) {
      const active = await db.query<{ id: string }>(
        "SELECT id FROM job_media WHERE id = ANY($1::uuid[]) AND status IN ('uploading','processing')",
        [[...new Set(old.map(item => item.id))]],
      );
      const busy = new Set(active.rows.map(row => row.id));
      for (const item of old) {
        if (busy.has(item.id)) continue;
        await removeQuietly(path.join(dir, item.name));
        orphans += 1;
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn('job media temp sweep failed', { error: error instanceof Error ? error.message : 'Unknown' });
    }
  }

  return { expired: expired.rowCount ?? 0, recovered: recovered.rowCount ?? 0, purged, orphans };
}

/** Test-only: forget cached viewer decisions. */
export function __clearViewerCacheForTest(): void {
  viewerDecisionCache.clear();
}
