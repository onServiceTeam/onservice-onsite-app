import fs from 'node:fs';
import path from 'node:path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

/**
 * Android APK updates (Ken, 2026-10-11): the tester APK checks here for a newer
 * signed build and downloads it, so installed phones stay aligned with the web
 * app. This is the account-free path agreed in docs/qa/NATIVE-BUILD-REQUIREMENTS.md:
 * a small release manifest plus immutable APK files on our own HTTPS origin.
 *
 * Files live in the API's persistent upload volume, written only by the
 * reviewed publish script (scripts/release/publish-android-apk.sh):
 *   <UPLOAD_DIR>/releases/android/latest.json
 *   <UPLOAD_DIR>/releases/android/onService-<versionName>-<versionCode>.apk
 * The API serves them itself so the APK carries the Android package type
 * (the shared web server has no APK type mapping).
 *
 *   GET /api/v1/app-releases/android/latest        -> manifest (never cached)
 *   GET /api/v1/app-releases/android/files/<name>  -> the APK (immutable)
 */

export const ANDROID_PACKAGE = 'ph.onservice.app';
const FILE_NAME = /^onService-\d{1,3}\.\d{1,3}\.\d{1,3}-\d{1,9}\.apk$/;

const manifestSchema = z.object({
  packageName: z.literal(ANDROID_PACKAGE),
  channel: z.literal('tester'),
  versionCode: z.number().int().min(1).max(2_100_000_000),
  versionName: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/),
  minimumVersionCode: z.number().int().min(1),
  file: z.string().regex(FILE_NAME),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  size: z.number().int().min(1_000_000).max(300_000_000),
  certificateSha256: z.string().regex(/^[A-F0-9]{64}$/),
  publishedAt: z.string().datetime(),
  notes: z.string().max(500).default(''),
}).strict().refine(m => m.minimumVersionCode <= m.versionCode, 'minimumVersionCode above versionCode')
  .refine(m => m.file === `onService-${m.versionName}-${m.versionCode}.apk`, 'file name does not match the version');

export type AndroidReleaseManifest = z.infer<typeof manifestSchema>;

export function releaseDir(): string {
  return path.join(process.env.UPLOAD_DIR || path.resolve('uploads'), 'releases', 'android');
}

/** Read and validate the published manifest; null when none is published. */
export async function readAndroidManifest(dir = releaseDir()): Promise<AndroidReleaseManifest | null> {
  let raw: string;
  try {
    raw = await fs.promises.readFile(path.join(dir, 'latest.json'), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const parsed = manifestSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error('Published Android manifest is invalid');
  const stat = await fs.promises.stat(path.join(dir, parsed.data.file));
  if (!stat.isFile() || stat.size !== parsed.data.size) throw new Error('Published Android APK does not match its manifest');
  return parsed.data;
}

const router = Router();

router.get('/android/latest', async (_req: Request, res: Response, next: NextFunction) => {
  res.set('Cache-Control', 'no-store');
  try {
    const manifest = await readAndroidManifest();
    if (!manifest) {
      res.status(404).json({ success: false, error: { message: 'No Android release is published.', statusCode: 404, code: 'no_release' } });
      return;
    }
    res.json({ success: true, data: {
      packageName: manifest.packageName,
      channel: manifest.channel,
      versionCode: manifest.versionCode,
      versionName: manifest.versionName,
      minimumVersionCode: manifest.minimumVersionCode,
      downloadPath: `/api/v1/app-releases/android/files/${manifest.file}`,
      sha256: manifest.sha256,
      size: manifest.size,
      certificateSha256: manifest.certificateSha256,
      publishedAt: manifest.publishedAt,
      notes: manifest.notes,
    } });
  } catch (error) {
    logger.error('Android release manifest could not be served', { error: (error as Error).message });
    next(createAppError('Update information is temporarily unavailable.', 503));
  }
});

router.get('/android/files/:file', (req: Request, res: Response, next: NextFunction) => {
  const file = String(req.params.file);
  if (!FILE_NAME.test(file)) {
    next(createAppError('Not found.', 404));
    return;
  }
  // The name pattern has no separators, so the path cannot leave the folder.
  res.sendFile(file, {
    root: releaseDir(),
    dotfiles: 'deny',
    headers: {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Disposition': `attachment; filename="${file}"`,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  }, error => {
    if (!error) return;
    if (res.headersSent) return;
    const status = (error as { status?: number; statusCode?: number }).status ?? 404;
    next(createAppError(status === 404 ? 'Not found.' : 'Download failed.', status === 404 ? 404 : 500));
  });
});

export default router;
