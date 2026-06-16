// packages/api/src/routes/feedback.routes.ts
//
// Public UX-tester feedback intake + key-protected exports.
//
//   POST /api/v1/feedback            -> public. Accepts a questionnaire body
//                                       from the /feedback web page. Honeypot +
//                                       per-IP rate limit guard the open route.
//   GET  /api/v1/feedback/export.json?key=  -> all submissions as JSON
//   GET  /api/v1/feedback/export.md?key=    -> Markdown digest (humans + AI coder)
//   GET  /api/v1/feedback/export.csv?key=   -> CSV (spreadsheet)
//
// The export key is FEEDBACK_EXPORT_KEY in the API env. It is NOT the tester
// gate password — it protects the *collected* feedback, which is review-only
// data, from casual access. If the key is unset, exports are disabled (404-ish
// 503) rather than open.

import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import {
  validateAndNormalize,
  createFeedback,
  listFeedback,
  toMarkdown,
  toCsv,
} from '../services/feedback.service';
import { logger } from '../utils/logger';

const router = Router();

// Stay on even when RATE_LIMITS_RELAXED is set: this is bot/flood protection for
// an open endpoint, not an auth/OTP throttle. 40 submissions per hour per IP is
// far above any real tester and well below what a script needs to flood the DB.
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many submissions from this connection. Please try again later.' },
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
  if (!expected) return false;
  const given = (req.query.key ?? req.headers['x-feedback-key'] ?? '').toString();
  // length check first avoids a trivially different-length compare path
  return given.length === expected.length && given === expected;
}

async function guardedExport(
  req: Request,
  res: Response,
  next: NextFunction,
  send: (rows: Awaited<ReturnType<typeof listFeedback>>, res: Response) => void,
): Promise<void> {
  try {
    if (!process.env.FEEDBACK_EXPORT_KEY) {
      res.status(503).json({ success: false, error: 'Exports are not configured (FEEDBACK_EXPORT_KEY unset).' });
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

export default router;
