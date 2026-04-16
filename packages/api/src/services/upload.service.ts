import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { logger } from '../utils/logger';
import { platformConfig } from '../config/platform.config';
import { createAppError } from '../middleware/error.middleware';

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');
const BASE_URL = process.env.UPLOAD_BASE_URL || `http://localhost:${process.env.PORT || 7381}/uploads`;

const ALLOWED_MIME = new Set<string>(platformConfig.allowedImageTypes);
const MAX_SIZE_BYTES = platformConfig.maxImageSizeMB * 1024 * 1024;

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

export function validateFile(
  originalname: string,
  mimetype: string,
  size: number,
): void {
  if (!ALLOWED_MIME.has(mimetype)) {
    throw createAppError(
      `File type "${mimetype}" is not allowed. Accepted: ${[...ALLOWED_MIME].join(', ')}`,
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

export async function saveUploadedFile(
  buffer: Buffer,
  originalname: string,
  mimetype: string,
  userId: string,
  context: string,
): Promise<UploadedFile> {
  await ensureUploadDir();

  const ext = path.extname(originalname).toLowerCase();
  const fileId = randomUUID();
  const safeContext = context.replace(/[^a-z0-9_-]/gi, '');
  const safeUser = userId.replace(/[^a-f0-9-]/gi, '');
  const relativePath = `${safeContext}/${safeUser}/${fileId}${ext}`;
  const fullPath = path.join(UPLOAD_DIR, safeContext, safeUser, `${fileId}${ext}`);

  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(UPLOAD_DIR))) {
    throw createAppError('Invalid file path.', 400);
  }

  const dir = path.dirname(fullPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(fullPath, buffer);

  const url = `${BASE_URL}/${relativePath}`;

  logger.info('File uploaded', { fileId, filename: relativePath, mimeType: mimetype, sizeBytes: buffer.length, userId, context });

  return {
    id: fileId,
    url,
    filename: relativePath,
    mimeType: mimetype,
    sizeBytes: buffer.length,
  };
}

export async function deleteUploadedFile(filename: string): Promise<void> {
  try {
    const fullPath = path.resolve(path.join(UPLOAD_DIR, filename));
    if (!fullPath.startsWith(path.resolve(UPLOAD_DIR))) {
      logger.warn('Path traversal attempt in deleteUploadedFile', { filename });
      return;
    }
    await fs.unlink(fullPath);
    logger.info('File deleted', { filename });
  } catch (err) {
    logger.warn('File deletion failed (may not exist)', { filename, error: err instanceof Error ? err.message : 'Unknown' });
  }
}

export function getUploadDir(): string {
  return UPLOAD_DIR;
}
