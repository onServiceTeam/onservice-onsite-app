// Tester feedback version 2, public routes (mounted at /api/v1/feedback/v2).
//
//   GET  /study                         the versioned study definition
//   POST /sessions                      start a session -> { sessionId, token }
//   GET  /sessions/:id/progress         what this session has saved so far
//   POST /sessions/:id/entries          save a first impression, mission,
//                                       problem report or wrap-up
//   POST /sessions/:id/uploads          one screenshot (metadata removed)
//   GET  /export.json                   everything, for the private pull
//                                       script (x-feedback-key header only)
//
// Session routes need the session's token in the x-feedback-session header.

import { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import multer from 'multer';
import { timingSafeEqual } from 'node:crypto';
import { redis } from '../config/redis.config';
import { platformConfig } from '../config/platform.config';
import { publicStudy } from '../config/feedback-study';
import { isPrivateExportSecretUsable } from '../config/boot-guards';
import { validateFile, assertImageMagicBytes } from '../services/upload.service';
import {
  authenticateSession, createSession, saveEntry, saveUpload, sessionProgress,
} from '../services/feedback-study.service';
import { exportStudyData } from '../services/feedback-study-admin.service';
import { logger } from '../utils/logger';

const router = Router();

type RedisStoreOpts = ConstructorParameters<typeof RedisStore>[0];
function limiter(prefix: string, limit: number, error: string) {
  const store = new RedisStore({
    prefix,
    sendCommand: (...args: string[]): Promise<unknown> =>
      (redis as unknown as { call: (...a: string[]) => Promise<unknown> }).call(...args),
  } as unknown as RedisStoreOpts);
  // Always on, like the version 1 limits: flood protection for open routes.
  return rateLimit({ windowMs: 60 * 60 * 1000, limit, standardHeaders: true, legacyHeaders: false, store,
    message: { success: false, error } });
}

// Testers often share one office or home connection, so the per-address
// limits are generous; per-session caps live in the service.
const sessionLimiter = limiter('rl:feedback2-session:', 30, 'Too many new sessions from this connection. Please try again later.');
const entryLimiter = limiter('rl:feedback2-entry:', 400, 'Too many saves from this connection. Please try again later.');
const uploadLimiter = limiter('rl:feedback2-upload:', 150, 'Too many uploads from this connection. Please try again later.');

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: platformConfig.maxImageSizeMB * 1024 * 1024, files: 1 },
});

// The address Express derives through the trusted proxy setting; a browser
// cannot choose it (version 1 stored the first X-Forwarded-For entry).
function requestIp(req: Request): string | null {
  return req.ip ? String(req.ip).replace(/^::ffff:/, '').slice(0, 100) : null;
}

async function sessionFrom(req: Request) {
  return authenticateSession(req.params.id, req.headers['x-feedback-session']);
}

router.get('/study', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.json({ success: true, data: publicStudy() });
});

router.post('/sessions', sessionLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Honeypot: a filled hidden field means a bot. Pretend success, store nothing.
    if (req.body && typeof req.body === 'object' && typeof req.body.website === 'string' && req.body.website.length) {
      res.status(201).json({ success: true, data: { sessionId: null, token: null } });
      return;
    }
    const { website: _ignored, ...body } = (req.body ?? {}) as Record<string, unknown>;
    const created = await createSession(body, {
      ip: requestIp(req),
      userAgent: (req.headers['user-agent'] ?? '').toString() || null,
    });
    logger.info('feedback session started', { sessionId: created.sessionId });
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    next(error);
  }
});

router.get('/sessions/:id/progress', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await sessionFrom(req);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: await sessionProgress(session) });
  } catch (error) {
    next(error);
  }
});

router.post('/sessions/:id/entries', entryLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await sessionFrom(req);
    const saved = await saveEntry(session, req.body);
    res.status(201).json({ success: true, data: saved });
  } catch (error) {
    next(error);
  }
});

router.post('/sessions/:id/uploads', uploadLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check the session before reading the file into memory.
    const session = await sessionFrom(req);
    await new Promise<void>((resolve, reject) => imageUpload.single('file')(req, res, error => (error ? reject(error) : resolve())));
    const file = (req as Request & { file?: { originalname: string; mimetype: string; size: number; buffer: Buffer } }).file;
    if (!file) {
      res.status(400).json({ success: false, error: 'No screenshot was received. Please try again.' });
      return;
    }
    await validateFile(file.originalname, file.mimetype, file.size);
    assertImageMagicBytes(file.buffer, file.mimetype);
    const saved = await saveUpload(session, file);
    res.status(201).json({ success: true, data: saved });
  } catch (error) {
    next(error);
  }
});

function exportKeyOk(req: Request): boolean {
  const expected = process.env.FEEDBACK_EXPORT_KEY;
  if (!isPrivateExportSecretUsable(expected)) return false;
  const given = Buffer.from((req.headers['x-feedback-key'] ?? '').toString());
  const wanted = Buffer.from(expected as string);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

router.get('/export.json', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isPrivateExportSecretUsable(process.env.FEEDBACK_EXPORT_KEY)) {
      res.status(503).json({ success: false, error: 'Exports are not securely configured.' });
      return;
    }
    if (!exportKeyOk(req)) {
      res.status(401).json({ success: false, error: 'Invalid or missing key.' });
      return;
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ success: true, data: await exportStudyData() });
  } catch (error) {
    next(error);
  }
});

export default router;
