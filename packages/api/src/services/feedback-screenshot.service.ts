import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createAppError } from '../middleware/error.middleware';
import { db } from '../models/db';
import { getUploadDir, type ObjectStream } from './upload.service';

const FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.(?:jpe?g|png|webp)$/i;
const STORAGE_PATH_RE = /^(?:https?:\/\/(?:[a-z0-9-]+\.)*onservice(?:\.com)?\.ph)?\/uploads\/feedback\/([A-Za-z0-9][A-Za-z0-9._-]{0,199}\.(?:jpe?g|png|webp))$/i;

type FeedbackPayload = {
  screenshots?: unknown;
  items?: unknown;
};

export function feedbackScreenshotFilename(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(STORAGE_PATH_RE);
  return match?.[1] ?? null;
}

export function validateFeedbackScreenshotFilename(value: unknown): string {
  if (typeof value !== 'string' || !FILENAME_RE.test(value)) {
    throw createAppError('Feedback screenshot not found.', 404);
  }
  return value;
}

function payloadReferencesFilename(payload: unknown, filename: string): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const typed = payload as FeedbackPayload;
  const references: unknown[] = [];
  if (Array.isArray(typed.screenshots)) references.push(...typed.screenshots);
  if (Array.isArray(typed.items)) {
    for (const item of typed.items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const typedItem = item as { screenshot?: unknown; screenshots?: unknown };
      references.push(typedItem.screenshot);
      if (Array.isArray(typedItem.screenshots)) references.push(...typedItem.screenshots);
    }
  }
  return references.some((reference) => feedbackScreenshotFilename(reference) === filename);
}

function contentType(filename: string): string {
  const extension = path.extname(filename).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  return 'image/jpeg';
}

export async function getFeedbackScreenshotStream(filenameValue: unknown): Promise<ObjectStream> {
  const filename = validateFeedbackScreenshotFilename(filenameValue);
  const directory = path.resolve(getUploadDir(), 'feedback');
  const fullPath = path.resolve(directory, filename);
  if (path.dirname(fullPath) !== directory) {
    throw createAppError('Feedback screenshot not found.', 404);
  }

  try {
    const stat = await fs.lstat(fullPath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw createAppError('Feedback screenshot not found.', 404);
    }
    return {
      body: createReadStream(fullPath),
      contentType: contentType(filename),
      contentLength: stat.size,
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    throw createAppError('Feedback screenshot not found.', 404);
  }
}

export async function getFeedbackScreenshotForAdmin(
  feedbackId: string,
  filenameValue: unknown,
): Promise<ObjectStream> {
  const filename = validateFeedbackScreenshotFilename(filenameValue);
  const result = await db.query<{ payload: unknown }>(
    'SELECT payload FROM feedback_submissions WHERE id = $1',
    [feedbackId],
  );
  const row = result.rows[0];
  if (!row || !payloadReferencesFilename(row.payload, filename)) {
    throw createAppError('Feedback screenshot not found.', 404);
  }
  return getFeedbackScreenshotStream(filename);
}
