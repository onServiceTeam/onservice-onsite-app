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

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');
const BASE_URL = process.env.UPLOAD_BASE_URL || `http://localhost:${process.env.PORT || 7381}/uploads`;

// MED-N144 fix — admin-tunable allowlist. Pre-fix the in-memory Set
// was built from platformConfig at module-load time; admins couldn't
// add a new MIME type (e.g., image/avif as adoption grows) without a
// code deploy. Post-fix `loadAllowedMime()` reads from
// platform_settings.allowed_image_mime_types (comma-separated) with
// the platformConfig list as fallback.
const FALLBACK_ALLOWED_MIME = new Set<string>(platformConfig.allowedImageTypes);
const MAX_SIZE_BYTES = platformConfig.maxImageSizeMB * 1024 * 1024;

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

async function ensureUploadDir(): Promise<void> {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
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

// Sync backwards-compat shim for callers that can't easily go async.
// Uses the in-code FALLBACK_ALLOWED_MIME list (no admin tuning).
export function validateFileSync(
  originalname: string,
  mimetype: string,
  size: number,
): void {
  if (!FALLBACK_ALLOWED_MIME.has(mimetype)) {
    throw createAppError(
      `File type "${mimetype}" is not allowed. Accepted: ${[...FALLBACK_ALLOWED_MIME].join(', ')}`,
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
function detectImageType(buffer: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
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
): Promise<UploadedFile> {
  // §35c — content-sniff every upload before it touches storage/CDN.
  assertImageMagicBytes(buffer, mimetype);
  const ext = path.extname(originalname).toLowerCase();
  const fileId = randomUUID();
  const safeContext = context.replace(/[^a-z0-9_-]/gi, '');
  const safeUser = userId.replace(/[^a-f0-9-]/gi, '');
  const objectKey = `${safeContext}/${safeUser}/${fileId}${ext}`;

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
      CacheControl: 'public, max-age=31536000, immutable',
      ...sseParams,
    }));
    const cdnBase = process.env.S3_CDN_URL || `https://${bucket}.s3.${process.env.S3_REGION || 'ap-southeast-1'}.amazonaws.com`;
    url = `${cdnBase}/${objectKey}`;
    logger.info('File uploaded to S3', { fileId, key: objectKey, bucket, sizeBytes: buffer.length, userId, context });
  } else {
    // Local filesystem fallback (dev only)
    await ensureUploadDir();
    const fullPath = path.join(UPLOAD_DIR, safeContext, safeUser, `${fileId}${ext}`);
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(path.resolve(UPLOAD_DIR))) {
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
      const fullPath = path.resolve(path.join(UPLOAD_DIR, filename));
      if (!fullPath.startsWith(path.resolve(UPLOAD_DIR))) {
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
  return UPLOAD_DIR;
}
