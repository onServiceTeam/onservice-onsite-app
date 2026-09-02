// packages/api/src/routes/feedback.routes.ts
//
// Public UX-tester feedback intake + key-protected exports.
//
//   POST /api/v1/feedback            -> public. Accepts a questionnaire body
//                                       from the /feedback web page. Honeypot +
//                                       per-IP rate limit guard the open route.
//   GET  /api/v1/feedback/export.json -> all submissions as JSON
//   GET  /api/v1/feedback/export.md   -> Markdown digest (humans + AI coder)
//   GET  /api/v1/feedback/export.csv  -> CSV (spreadsheet)
//
// The export key is FEEDBACK_EXPORT_KEY in the API env. It is NOT the tester
// gate password — it protects the *collected* feedback, which is review-only
// data, from casual access. If the key is unset, exports are disabled (404-ish
// 503) rather than open.

import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import multer from 'multer';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { redis } from '../config/redis.config';
import {
  validateAndNormalize,
  createFeedback,
  listFeedback,
  toMarkdown,
  toCsv,
} from '../services/feedback.service';
import { validateFileSync, assertImageMagicBytes, getUploadDir } from '../services/upload.service';
import { platformConfig } from '../config/platform.config';
import { logger } from '../utils/logger';
import { isPrivateExportSecretUsable } from '../config/boot-guards';
import { getFeedbackScreenshotStream } from '../services/feedback-screenshot.service';

interface MulterFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const router = Router();

// Redis-backed store so the per-IP flood counters survive container restarts
// and are shared across API replicas (a MemoryStore resets to zero on every
// redeploy and is per-replica, multiplying the effective limit). Mirrors the
// buildRedisStore pattern in rate-limit.middleware.ts; ioredis queues commands while
// reconnecting per its retryStrategy, so the limiter degrades gracefully if
// Redis is briefly unavailable. Distinct prefix per limiter keeps counters
// separate from the global `rl:global:` and auth `rl:auth:` namespaces.
type RedisStoreOpts = ConstructorParameters<typeof RedisStore>[0];
function buildFeedbackStore(prefix: string): InstanceType<typeof RedisStore> {
  const opts = {
    prefix,
    sendCommand: (...args: string[]): Promise<unknown> =>
      (redis as unknown as { call: (...a: string[]) => Promise<unknown> }).call(...args),
  } as unknown as RedisStoreOpts;
  return new RedisStore(opts);
}

// Stay on even when RATE_LIMITS_RELAXED is set: this is bot/flood protection for
// an open endpoint, not an auth/OTP throttle. 40 submissions per hour per IP is
// far above any real tester and well below what a script needs to flood the DB.
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  store: buildFeedbackStore('rl:feedback-submit:'),
  message: { success: false, error: 'Too many submissions from this connection. Please try again later.' },
});

// Public screenshot upload for the feedback page. Stored under
// uploads/feedback/, whose direct Nginx path is blocked. The public form keeps
// only the storage identifier and previews the local File object; authorized
// Admin/private-export routes retrieve the evidence. Image-only, magic-byte
// verified, size-capped, rate-limited.
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 80,
  standardHeaders: true,
  legacyHeaders: false,
  store: buildFeedbackStore('rl:feedback-upload:'),
  message: { success: false, error: 'Too many uploads from this connection. Please try again later.' },
});

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: platformConfig.maxImageSizeMB * 1024 * 1024, files: 1 },
});

const MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

router.post('/upload', uploadLimiter, imageUpload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = (req as Request & { file?: MulterFile }).file;
    if (!file) {
      res.status(400).json({ success: false, error: 'No file provided.' });
      return;
    }
    // Both checks throw a 400 AppError (handled by error.middleware) on bad input.
    validateFileSync(file.originalname, file.mimetype, file.size);
    assertImageMagicBytes(file.buffer, file.mimetype);

    const ext = MIME_EXT[file.mimetype] ?? '.jpg';
    const filename = `${randomUUID()}${ext}`;
    const dir = path.join(getUploadDir(), 'feedback');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, filename), file.buffer);

    // This is a storage identifier, not a public download URL. The tester page
    // previews its local File object; authenticated Admin/private-export routes
    // stream the stored evidence after submission.
    const url = `/uploads/feedback/${filename}`;
    logger.info('feedback screenshot uploaded', { filename });
    res.status(201).json({ success: true, url });
  } catch (err) {
    next(err);
  }
});

function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return (fwd.split(',')[0] ?? '').trim().slice(0, 100) || null;
  return req.ip ? String(req.ip).slice(0, 100) : null;
}

router.post('/', submitLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = validateAndNormalize(req.body);

    // Honeypot tripped — pretend success so the bot learns nothing, store nothing.
    if (!result.ok && result.spam) {
      res.status(201).json({ success: true });
      return;
    }
    if (!result.ok) {
      res.status(400).json({ success: false, error: result.reason });
      return;
    }

    const meta = {
      userAgent: (req.headers['user-agent'] ?? '').toString().slice(0, 500) || null,
      ip: clientIp(req),
    };
    const saved = await createFeedback(result.value, meta);
    logger.info('feedback received', { id: saved.id, items: result.value.itemCount, areas: result.value.areas });
    res.status(201).json({ success: true, id: saved.id });
  } catch (err) {
    next(err);
  }
});

function keyOk(req: Request): boolean {
  const expected = process.env.FEEDBACK_EXPORT_KEY;
  if (!isPrivateExportSecretUsable(expected)) return false;
  // Private feedback exports may contain tester PII. Secrets in query strings
  // can enter browser history, proxy logs, and referrers, so only the dedicated
  // request header is accepted.
  const given = (req.headers['x-feedback-key'] ?? '').toString();
  // Constant-time compare to avoid leaking the key byte-by-byte via a timing
  // side-channel. timingSafeEqual requires equal-length buffers, so the length
  // check stays as a (non-secret) precondition.
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function guardedExport(
  req: Request,
  res: Response,
  next: NextFunction,
  send: (rows: Awaited<ReturnType<typeof listFeedback>>, res: Response) => void,
): Promise<void> {
  try {
    if (!isPrivateExportSecretUsable(process.env.FEEDBACK_EXPORT_KEY)) {
      res.status(503).json({ success: false, error: 'Exports are not securely configured.' });
      return;
    }
    if (!keyOk(req)) {
      res.status(401).json({ success: false, error: 'Invalid or missing key.' });
      return;
    }
    const limit = Math.min(5000, Math.max(1, Number(req.query.limit) || 1000));
    const rows = await listFeedback(limit);
    send(rows, res);
  } catch (err) {
    next(err);
  }
}

router.get('/export.json', (req, res, next) =>
  guardedExport(req, res, next, (rows, r) => {
    r.json({ success: true, count: rows.length, submissions: rows });
  }),
);

router.get('/export.md', (req, res, next) =>
  guardedExport(req, res, next, (rows, r) => {
    r.type('text/markdown; charset=utf-8').send(toMarkdown(rows));
  }),
);

router.get('/export.csv', (req, res, next) =>
  guardedExport(req, res, next, (rows, r) => {
    r.type('text/csv; charset=utf-8').send(toCsv(rows));
  }),
);

router.get('/export-screenshot/:filename', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isPrivateExportSecretUsable(process.env.FEEDBACK_EXPORT_KEY)) {
      res.status(503).json({ success: false, error: 'Exports are not securely configured.' });
      return;
    }
    if (!keyOk(req)) {
      res.status(401).json({ success: false, error: 'Invalid or missing key.' });
      return;
    }
    const stream = await getFeedbackScreenshotStream(req.params.filename);
    res.setHeader('Content-Type', stream.contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (stream.contentLength != null) res.setHeader('Content-Length', String(stream.contentLength));
    stream.body.on('error', (error: Error) => next(error));
    stream.body.pipe(res);
  } catch (error) {
    next(error);
  }
});

export default router;
