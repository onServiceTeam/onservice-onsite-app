import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { logger } from '../utils/logger';
import { platformConfig } from '../config/platform.config';
import { createAppError } from '../middleware/error.middleware';
// MED-N144 fix — admin-tunable allowed MIME types via platform_settings.
import * as settingsService from './settings.service';

// --- Storage Backend Selection ---
// When S3_BUCKET is set, use S3-compatible storage (AWS S3 or DigitalOcean Spaces).
// Otherwise, fall back to local filesystem (dev only).
const USE_S3 = !!process.env.S3_BUCKET;

// Read on each use rather than once at import, so the private job-media tests
// can point a fresh temporary volume at the real storage code. In a running
// server UPLOAD_DIR never changes, so every path resolves exactly as before.
function uploadDir(): string {
  return process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');
}
const BASE_URL = process.env.UPLOAD_BASE_URL || `http://localhost:${process.env.PORT || 7381}/uploads`;

// MED-N144 fix — admin-tunable allowlist. `loadAllowedMime()` reads the
// selected subset of JPEG, PNG, and WebP from platform settings, with the
// platformConfig list as fallback. Adding a new format still requires a
// coordinated code/client/storage release because extension and magic-byte
// validation intentionally support only these three formats.
const FALLBACK_ALLOWED_MIME = new Set<string>(platformConfig.allowedImageTypes);
const MAX_SIZE_BYTES = platformConfig.maxImageSizeMB * 1024 * 1024;

/**
 * The admin-selected image formats (allowed_image_mime_types). D38 request and
 * chat photos use the same list, so it stays the single source for formats.
 */
export async function getAllowedImageMimeTypes(): Promise<ReadonlySet<string>> {
  return loadAllowedMime();
}

async function loadAllowedMime(): Promise<Set<string>> {
  try {
    const raw = await settingsService.getSetting('allowed_image_mime_types');
    if (typeof raw === 'string' && raw.trim()) {
      const arr = raw.split(',').map((s) => s.trim()).filter(Boolean);
      if (arr.length > 0) return new Set(arr);
    }
  } catch {
    // fall through to in-code fallback
  }
  return FALLBACK_ALLOWED_MIME;
}

// --- Lazy S3 client initialization ---
let s3Client: {
  send: (command: unknown) => Promise<unknown>;
} | null = null;
let s3Commands: {
  PutObjectCommand: new (params: Record<string, unknown>) => unknown;
  DeleteObjectCommand: new (params: Record<string, unknown>) => unknown;
  GetObjectCommand: new (params: Record<string, unknown>) => unknown;
} | null = null;

async function getS3(): Promise<{
  client: typeof s3Client;
  commands: typeof s3Commands;
}> {
  if (!s3Client) {
    const { S3Client } = await import('@aws-sdk/client-s3');
    const cmds = await import('@aws-sdk/client-s3');
    s3Client = new S3Client({
      region: process.env.S3_REGION || 'ap-southeast-1',
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}),
      credentials: process.env.S3_ACCESS_KEY_ID
        ? {
          accessKeyId: process.env.S3_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
        }
        : undefined,
    });
    s3Commands = {
      PutObjectCommand: cmds.PutObjectCommand,
      DeleteObjectCommand: cmds.DeleteObjectCommand,
      GetObjectCommand: cmds.GetObjectCommand,
    };
  }
  return { client: s3Client, commands: s3Commands };
}

export interface UploadedFile {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export function getUploadVisibility(context: string): 'public' | 'private' {
  return context === 'onboarding' ? 'private' : 'public';
}

async function ensureUploadDir(): Promise<void> {
  try {
    await fs.mkdir(uploadDir(), { recursive: true });
  } catch {
    // already exists
  }
}

// MED-N144 fix — async to read the admin-tunable allowlist. Callers
// already lived inside async handlers so the change ripples cleanly.
export async function validateFile(
  originalname: string,
  mimetype: string,
  size: number,
): Promise<void> {
  const allowedMime = await loadAllowedMime();
  if (!allowedMime.has(mimetype)) {
    throw createAppError(
      `File type "${mimetype}" is not allowed. Accepted: ${[...allowedMime].join(', ')}`,
      400,
    );
  }
  if (size > MAX_SIZE_BYTES) {
    throw createAppError(
      `File is too large (${(size / 1024 / 1024).toFixed(1)}MB). Maximum: ${platformConfig.maxImageSizeMB}MB.`,
      400,
    );
  }

  const ext = path.extname(originalname).toLowerCase();
  const allowedExts = new Set(['.jpg', '.jpeg', '.png', '.webp']);
  if (!allowedExts.has(ext)) {
    throw createAppError(`File extension "${ext}" is not allowed.`, 400);
  }
}

// §35c fix — magic-byte (content-sniffing) validation. The MIME type and
// file extension are both CLIENT-SUPPLIED and trivially spoofable: an
// attacker could upload an HTML page, SVG-with-script, or executable while
// declaring `image/jpeg` + `.jpg`, and we would happily store it and serve
// it from our CDN. This inspects the actual leading bytes of the buffer and
// confirms it is genuinely one of the three allowed image formats. We do NOT
// add an external dependency (file-type is ESM-only and would be a new dep);
// the three signatures we accept are short and stable.
// Exported for the D38 job-media container sniffer (utils/media-sniff.ts).
export function detectImageType(buffer: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buffer.length < 12) return null;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

export function assertImageMagicBytes(buffer: Buffer, declaredMime: string): void {
  const detected = detectImageType(buffer);
  if (!detected) {
    throw createAppError('Uploaded file content is not a valid image (JPEG, PNG, or WebP).', 400);
  }
  // Cross-check the declared MIME against the real content so a file can't
  // be stored under a type that doesn't match its bytes.
  if (declaredMime && declaredMime !== detected) {
    throw createAppError(
      `File content (${detected}) does not match its declared type (${declaredMime}).`,
      400,
    );
  }
}

export async function saveUploadedFile(
  buffer: Buffer,
  originalname: string,
  mimetype: string,
  userId: string,
  context: string,
  // §35a — KYC/identity uploads pass 'private' so the object is written with a
  // private ACL and is never publicly readable by its storage URL; it can only
  // be reached through the authenticated proxy or a short-lived presigned URL.
  // Defaults to 'public' so booking photos and other uploads are unchanged.
  visibility: 'public' | 'private' = 'public',
): Promise<UploadedFile> {
  // §35c — content-sniff every upload before it touches storage/CDN.
  assertImageMagicBytes(buffer, mimetype);
  const ext = path.extname(originalname).toLowerCase();
  const fileId = randomUUID();
  const safeContext = context.replace(/[^a-z0-9_-]/gi, '');
  const safeUser = userId.replace(/[^a-f0-9-]/gi, '');
  const objectKey = `${safeContext}/${safeUser}/${fileId}${ext}`;
  const isPrivate = visibility === 'private';

  let url: string;

  if (USE_S3) {
    const { client, commands } = await getS3();
    const bucket = process.env.S3_BUCKET!;
    // Bug 1325 fix: every uploaded object must be server-side encrypted.
    // Prefer SSE-KMS when a key id is configured (auditable, rotatable),
    // fall back to SSE-S3 (AES256) otherwise. The Terraform-level bucket
    // policy denies any PutObject without one of these headers, so missing
    // this would manifest as a 403 from AWS — fail closed.
    const sseParams = process.env.S3_KMS_KEY_ID
      ? { ServerSideEncryption: 'aws:kms', SSEKMSKeyId: process.env.S3_KMS_KEY_ID }
      : { ServerSideEncryption: 'AES256' };
    await client!.send(new commands!.PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: buffer,
      ContentType: mimetype,
      // Private objects must NOT be cached by any shared/CDN cache, and carry a
      // private ACL so the storage URL is not anonymously readable.
      CacheControl: isPrivate ? 'private, no-store' : 'public, max-age=31536000, immutable',
      ...(isPrivate ? { ACL: 'private' } : {}),
      ...sseParams,
    }));
    const cdnBase = process.env.S3_CDN_URL || `https://${bucket}.s3.${process.env.S3_REGION || 'ap-southeast-1'}.amazonaws.com`;
    url = `${cdnBase}/${objectKey}`;
    logger.info('File uploaded to S3', { fileId, key: objectKey, bucket, sizeBytes: buffer.length, userId, context });
  } else {
    // Local filesystem fallback (dev only)
    await ensureUploadDir();
    const fullPath = path.join(uploadDir(), safeContext, safeUser, `${fileId}${ext}`);
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(path.resolve(uploadDir()))) {
      throw createAppError('Invalid file path.', 400);
    }
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, buffer);
    url = `${BASE_URL}/${objectKey}`;
    logger.info('File uploaded locally', { fileId, filename: objectKey, sizeBytes: buffer.length, userId, context });
  }

  return {
    id: fileId,
    url,
    filename: objectKey,
    mimeType: mimetype,
    sizeBytes: buffer.length,
  };
}

/**
 * Store a non-image private artifact such as a customer data export. The
 * returned value is an opaque storage key, never a public URL. It uses the
 * same encrypted S3 backend as uploads when configured and the protected
 * uploads volume otherwise.
 */
export async function savePrivateArtifact(
  buffer: Buffer,
  objectKey: string,
  contentType: string,
): Promise<string> {
  const cleanKey = extractObjectKey(objectKey);
  if (!cleanKey
    || cleanKey !== objectKey.replace(/^\/+/, '')
    || !cleanKey.startsWith('private-artifacts/')) {
    throw createAppError('Invalid private artifact path.', 400);
  }

  if (USE_S3) {
    const { client, commands } = await getS3();
    const sseParams = process.env.S3_KMS_KEY_ID
      ? { ServerSideEncryption: 'aws:kms', SSEKMSKeyId: process.env.S3_KMS_KEY_ID }
      : { ServerSideEncryption: 'AES256' };
    await client!.send(new commands!.PutObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: cleanKey,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'private, no-store',
      ACL: 'private',
      ...sseParams,
    }));
  } else {
    const fullPath = path.resolve(path.join(uploadDir(), cleanKey));
    if (!fullPath.startsWith(path.resolve(uploadDir()))) {
      throw createAppError('Invalid private artifact path.', 400);
    }
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
  }

  logger.info('Private artifact stored', { key: cleanKey, sizeBytes: buffer.length, contentType });
  return cleanKey;
}

export async function deleteUploadedFile(filename: string): Promise<void> {
  try {
    if (USE_S3) {
      const { client, commands } = await getS3();
      const bucket = process.env.S3_BUCKET!;
      await client!.send(new commands!.DeleteObjectCommand({
        Bucket: bucket,
        Key: filename,
      }));
      logger.info('File deleted from S3', { filename, bucket });
    } else {
      const fullPath = path.resolve(path.join(uploadDir(), filename));
      if (!fullPath.startsWith(path.resolve(uploadDir()))) {
        logger.warn('Path traversal attempt in deleteUploadedFile', { filename });
        return;
      }
      await fs.unlink(fullPath);
      logger.info('File deleted locally', { filename });
    }
  } catch (err) {
    logger.warn('File deletion failed (may not exist)', { filename, error: err instanceof Error ? err.message : 'Unknown' });
  }
}

export function getUploadDir(): string {
  return uploadDir();
}

// ─────────────────────────────────────────────────────────────────
// §35a — private KYC document serving.
//
// KYC docs (gov ID, NBI, selfie) were stored with direct CDN/S3 URLs and
// handed to clients on upload — a bearer URL anyone could read. The fix is
// to serve them ONLY through an authenticated proxy (owner + admin), reading
// the object server-side with the API's own credentials. These helpers do
// the storage side; authorization lives in kyc-document.service.ts.
//
// KYC objects live in a PRIVATE bucket. KYC_S3_BUCKET overrides S3_BUCKET for
// reads when the operator provisions a separate private bucket (see
// docs/runbooks/kyc-private-bucket.md). Until then it falls back to S3_BUCKET.
// ─────────────────────────────────────────────────────────────────

const KYC_BUCKET = process.env.KYC_S3_BUCKET || process.env.S3_BUCKET || '';

/**
 * Derive the storage object key from a value that may be either a full
 * public URL (legacy rows) or an already-bare object key. Strips any known
 * base prefix (CDN, S3 virtual-host, or the local upload base URL) and a
 * leading slash. Returns null for empty / unparseable input.
 */
export function extractObjectKey(urlOrKey: string | null | undefined): string | null {
  if (!urlOrKey || typeof urlOrKey !== 'string') return null;
  let v = urlOrKey.trim();
  if (!v) return null;

  // First strip a known configured base, INCLUDING its path component. This
  // matters for the local-FS backend where UPLOAD_BASE_URL is e.g.
  // https://api.onservice.ph/uploads — the object key is `onboarding/u/f.jpg`,
  // NOT `uploads/onboarding/u/f.jpg`, so a bare scheme://host strip would leave
  // a stray `uploads/` segment and the file lookup would miss.
  const cdnBase = process.env.S3_CDN_URL;
  for (const base of [BASE_URL, cdnBase]) {
    if (base && v.startsWith(base)) {
      v = v.slice(base.length);
      break;
    }
  }

  // Otherwise, if it still looks like a URL, drop scheme://host and keep the path.
  const schemeMatch = v.match(/^https?:\/\/[^/]+\/(.*)$/i);
  if (schemeMatch) {
    v = schemeMatch[1] ?? '';
  }
  // Strip any leading slash and a stray query string / fragment.
  v = v.replace(/^\/+/, '').split('?')[0]!.split('#')[0]!;

  if (!v) return null;
  // Defense-in-depth: never allow path traversal in a key.
  if (v.includes('..')) return null;
  return v;
}

export interface ObjectStream {
  body: NodeJS.ReadableStream;
  contentType: string;
  contentLength?: number;
}

function guessContentType(key: string): string {
  const ext = path.extname(key).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.json') return 'application/json';
  if (ext === '.csv') return 'text/csv; charset=utf-8';
  return 'image/jpeg';
}

/** Delete a private artifact and surface failures so retention jobs can retry. */
export async function deletePrivateArtifact(filename: string): Promise<void> {
  const cleanKey = extractObjectKey(filename);
  if (!cleanKey || !cleanKey.startsWith('private-artifacts/')) {
    throw createAppError('Invalid private artifact path.', 400);
  }
  if (USE_S3) {
    const { client, commands } = await getS3();
    await client!.send(new commands!.DeleteObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: cleanKey }));
    return;
  }
  const fullPath = path.resolve(path.join(uploadDir(), cleanKey));
  if (!fullPath.startsWith(path.resolve(uploadDir()))) {
    throw createAppError('Invalid private artifact path.', 400);
  }
  try {
    await fs.unlink(fullPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

/** Open a private artifact from the standard upload bucket/volume. */
export async function getPrivateArtifactStream(key: string): Promise<ObjectStream> {
  const cleanKey = extractObjectKey(key);
  if (!cleanKey || !cleanKey.startsWith('private-artifacts/')) {
    throw createAppError('File not found.', 404);
  }

  if (USE_S3) {
    const { client, commands } = await getS3();
    try {
      const out = (await client!.send(new commands!.GetObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: cleanKey,
      }))) as { Body?: NodeJS.ReadableStream; ContentType?: string; ContentLength?: number };
      if (!out.Body) throw createAppError('File not found.', 404);
      return { body: out.Body, contentType: out.ContentType || guessContentType(cleanKey), contentLength: out.ContentLength };
    } catch {
      throw createAppError('File not found.', 404);
    }
  }

  const fullPath = path.resolve(path.join(uploadDir(), cleanKey));
  if (!fullPath.startsWith(path.resolve(uploadDir()))) throw createAppError('File not found.', 404);
  try {
    const stat = await fs.stat(fullPath);
    const { createReadStream } = await import('node:fs');
    return { body: createReadStream(fullPath), contentType: guessContentType(cleanKey), contentLength: stat.size };
  } catch {
    throw createAppError('File not found.', 404);
  }
}

/**
 * Open a read stream for a stored object by key, from the PRIVATE KYC bucket
 * (S3) or the local upload dir (dev). Throws a 404 AppError if missing.
 */
export async function getObjectStream(key: string): Promise<ObjectStream> {
  const cleanKey = extractObjectKey(key);
  if (!cleanKey) throw createAppError('Document not found.', 404);

  if (USE_S3) {
    const { client, commands } = await getS3();
    try {
      const out = (await client!.send(new commands!.GetObjectCommand({
        Bucket: KYC_BUCKET,
        Key: cleanKey,
      }))) as { Body?: NodeJS.ReadableStream; ContentType?: string; ContentLength?: number };
      if (!out.Body) throw createAppError('Document not found.', 404);
      return {
        body: out.Body,
        contentType: out.ContentType || guessContentType(cleanKey),
        contentLength: out.ContentLength,
      };
    } catch (err) {
      logger.warn('KYC object fetch failed', { key: cleanKey, error: err instanceof Error ? err.message : 'Unknown' });
      throw createAppError('Document not found.', 404);
    }
  }

  // Local filesystem fallback (dev only).
  const fullPath = path.resolve(path.join(uploadDir(), cleanKey));
  if (!fullPath.startsWith(path.resolve(uploadDir()))) {
    throw createAppError('Document not found.', 404);
  }
  try {
    const stat = await fs.stat(fullPath);
    const { createReadStream } = await import('node:fs');
    return {
      body: createReadStream(fullPath),
      contentType: guessContentType(cleanKey),
      contentLength: stat.size,
    };
  } catch {
    throw createAppError('Document not found.', 404);
  }
}

/**
 * §35a (presigned-URL option) — mint a short-lived, signed GET URL for a
 * private KYC object, so an authorized client can load it directly from
 * storage for a brief window instead of streaming through the API. Returns
 * null when S3 is not configured (local dev), so the caller falls back to the
 * streaming proxy. Authorization MUST be enforced by the caller before this is
 * called — a presigned URL is itself a bearer token for its short lifetime.
 */
export async function getKycPresignedUrl(
  key: string,
  expiresInSeconds = 120,
): Promise<string | null> {
  const cleanKey = extractObjectKey(key);
  if (!cleanKey) throw createAppError('Document not found.', 404);
  if (!USE_S3) return null;

  const { client, commands } = await getS3();
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const command = new commands!.GetObjectCommand({ Bucket: KYC_BUCKET, Key: cleanKey });
  // The client/command are structurally compatible with the presigner; the
  // lazy-import type stub keeps them loosely typed, so cast at the boundary.
  return getSignedUrl(
    client as unknown as Parameters<typeof getSignedUrl>[0],
    command as unknown as Parameters<typeof getSignedUrl>[1],
    { expiresIn: Math.max(30, Math.min(expiresInSeconds, 900)) },
  );
}

// ─────────────────────────────────────────────────────────────────
// D38 private job media (Milestone 2, package P3).
//
// Request and request-thread photos, videos and voice notes are uploaded in
// chunks to a temporary file on the uploads volume, checked, and then moved
// to private-artifacts/job-media/<owner>/<id>.<ext>. They are only ever read
// back through the signed /api/v1/job-media/file/<token> route. Folders are
// 0700 and files 0600, so the web server's user cannot read them even if a
// location block were wrong (a second line of defence behind the existing
// /uploads/private-artifacts/ 404 blocks in nginx).
// ─────────────────────────────────────────────────────────────────

const JOB_MEDIA_PREFIX = 'private-artifacts/job-media/';

/** Final private folder for job media. */
export function getJobMediaStoreDir(): string {
  return path.join(uploadDir(), 'private-artifacts', 'job-media');
}

/**
 * Chunks are written here. It is on the uploads volume so finishing an upload
 * is a same-volume rename; the container's /tmp is a different filesystem
 * (rename fails with EXDEV) and lives in the container layer.
 */
export function getJobMediaTempDir(): string {
  return path.join(uploadDir(), 'private-artifacts', 'job-media-tmp');
}

/** Create (or re-tighten) both job-media folders. Called when the server starts listening. */
export async function ensurePrivateJobMediaDirs(): Promise<void> {
  for (const dir of [getJobMediaStoreDir(), getJobMediaTempDir()]) {
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    await fs.chmod(dir, 0o700);
  }
}

/** Free bytes on the uploads volume, or null when the platform cannot say. */
export async function getUploadVolumeFreeBytes(): Promise<number | null> {
  try {
    await ensureUploadDir();
    const stats = await fs.statfs(uploadDir());
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return null;
  }
}

function assertJobMediaKey(objectKey: string): string {
  const cleanKey = extractObjectKey(objectKey);
  if (!cleanKey || cleanKey !== objectKey || !cleanKey.startsWith(JOB_MEDIA_PREFIX)) {
    throw createAppError('Invalid private artifact path.', 400);
  }
  return cleanKey;
}

function localPrivatePath(cleanKey: string): string {
  const root = path.resolve(uploadDir());
  const fullPath = path.resolve(root, cleanKey);
  const relative = path.relative(root, fullPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw createAppError('Invalid private artifact path.', 400);
  }
  return fullPath;
}

function s3EncryptionParams(): Record<string, string> {
  return process.env.S3_KMS_KEY_ID
    ? { ServerSideEncryption: 'aws:kms', SSEKMSKeyId: process.env.S3_KMS_KEY_ID }
    : { ServerSideEncryption: 'AES256' };
}

/**
 * Move a finished, checked temp file into private storage under `objectKey`
 * (private-artifacts/job-media/...). Local disk: same-volume rename into a
 * 0700 folder, then the file is set to 0600. S3: a private, encrypted,
 * no-store object streamed from the temp file, which is then removed.
 */
export async function savePrivateArtifactFromFile(
  tempPath: string,
  objectKey: string,
  contentType: string,
): Promise<string> {
  const cleanKey = assertJobMediaKey(objectKey);
  const stat = await fs.stat(tempPath);

  if (USE_S3) {
    const { client, commands } = await getS3();
    const { createReadStream } = await import('node:fs');
    await client!.send(new commands!.PutObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: cleanKey,
      Body: createReadStream(tempPath),
      ContentLength: stat.size,
      ContentType: contentType,
      CacheControl: 'private, no-store',
      ACL: 'private',
      ...s3EncryptionParams(),
    }));
    await fs.unlink(tempPath).catch(() => undefined);
  } else {
    const fullPath = localPrivatePath(cleanKey);
    const ownerDir = path.dirname(fullPath);
    await fs.mkdir(ownerDir, { recursive: true, mode: 0o700 });
    await fs.chmod(ownerDir, 0o700);
    await fs.rename(tempPath, fullPath);
    await fs.chmod(fullPath, 0o600);
  }

  logger.info('Private job media stored', { key: cleanKey, sizeBytes: stat.size, contentType });
  return cleanKey;
}

/**
 * Open a stored job-media object, optionally for one inclusive byte range.
 * Throws a 404 AppError when the object is missing.
 */
export async function getPrivateArtifactRange(
  key: string,
  range: { start: number; end: number } | null,
  contentType: string,
): Promise<ObjectStream> {
  let cleanKey: string;
  try {
    cleanKey = assertJobMediaKey(key);
  } catch {
    throw createAppError('File not found.', 404);
  }

  if (USE_S3) {
    const { client, commands } = await getS3();
    try {
      const out = (await client!.send(new commands!.GetObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: cleanKey,
        ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
      }))) as { Body?: NodeJS.ReadableStream; ContentLength?: number };
      if (!out.Body) throw createAppError('File not found.', 404);
      return { body: out.Body, contentType, contentLength: out.ContentLength };
    } catch {
      throw createAppError('File not found.', 404);
    }
  }

  const fullPath = localPrivatePath(cleanKey);
  try {
    const stat = await fs.stat(fullPath);
    const { createReadStream } = await import('node:fs');
    const body = range
      ? createReadStream(fullPath, { start: range.start, end: range.end })
      : createReadStream(fullPath);
    return {
      body,
      contentType,
      contentLength: range ? range.end - range.start + 1 : stat.size,
    };
  } catch {
    throw createAppError('File not found.', 404);
  }
}
