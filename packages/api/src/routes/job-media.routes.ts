/**
 * D38 private job media routes, mounted at /api/v1/job-media (Milestone 2,
 * package P3). Contract: design-media.md section 4 with the merged.md 2.3 and
 * critique.md changes.
 *
 *   POST   /                    start or resume an upload (201 new, 200 resumed)
 *   PUT    /:id/chunks/:index   one chunk, raw bytes (application/octet-stream)
 *   POST   /:id/complete        check and store the finished file
 *   GET    /:id                 upload state, for resuming
 *   DELETE /:id                 remove an unattached upload
 *   GET    /:id/url             a 10-minute signed link (viewer rule)
 *   GET    /booking/:bookingId  a booking's request media with signed links
 *   GET|HEAD /file/:token       stream a signed link (no sign-in; Range aware)
 *
 * /file and /booking come before /:id. Handlers check ids themselves and
 * answer 404 for anything a viewer may not see, so existence never leaks.
 * The chunk and file paths skip the global limiter (see
 * rate-limit.middleware.ts) and use their own: chunks per signed-in user,
 * file reads per token.
 */
import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware';
import {
  jobMediaChunkRateLimitMiddleware,
  jobMediaFileRateLimitMiddleware,
  uploadRateLimitMiddleware,
} from '../middleware/rate-limit.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { createAppError, type AppError } from '../middleware/error.middleware';
import { startJobMediaSchema, type StartJobMediaInput } from '../validators/job-media.validators';
import * as jobMediaService from '../services/job-media.service';
import { JobMediaError } from '../services/job-media.service';
import { JOB_MEDIA_CONFIG } from '../config/job-media.config';
import { logger } from '../utils/logger';
import { isJobMediaFileUrl, redactJobMediaTokensInText } from '../utils/job-media-redaction';

const router = Router();

function viewerOf(req: AuthenticatedRequest): jobMediaService.MediaViewer {
  return { userId: req.user!.userId, role: req.user!.role };
}

function param(req: Request, name: string): string {
  const value = req.params[name];
  return typeof value === 'string' ? value : '';
}

const rawChunk = express.raw({ type: 'application/octet-stream', limit: JOB_MEDIA_CONFIG.chunkBodyLimitBytes });

/** express.raw with clear 413/415 answers instead of the generic body-parser errors. */
function readChunkBody(req: Request, res: Response, next: NextFunction): void {
  if (!req.is('application/octet-stream')) {
    next(new JobMediaError(415, 'unsupported_media_type', 'Send each chunk as application/octet-stream.'));
    return;
  }
  rawChunk(req, res, (error?: unknown) => {
    if (error) {
      const status = (error as { status?: number }).status;
      next(status === 413
        ? new JobMediaError(413, 'chunk_too_large', 'This chunk is larger than allowed.')
        : new JobMediaError(400, 'chunk_unreadable', 'This chunk could not be read.'));
      return;
    }
    next();
  });
}

router.post(
  '/',
  authMiddleware,
  uploadRateLimitMiddleware,
  validationMiddleware(startJobMediaSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { created, upload } = await jobMediaService.startUpload(viewerOf(req), req.body as StartJobMediaInput);
      res.status(created ? 201 : 200).json({ success: true, data: upload });
    } catch (error) {
      next(error);
    }
  },
);

async function serveFile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const range = typeof req.headers.range === 'string' ? req.headers.range : undefined;
    const result = await jobMediaService.openSignedStream(param(req, 'token'), range, req.method);
    res.status(result.status);
    for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value);
    if (!result.stream) {
      res.end();
      return;
    }
    const stream = result.stream as NodeJS.ReadableStream & { destroy?: (error?: Error) => void };
    // A player that stops early closes the connection: stop reading the file.
    res.on('close', () => stream.destroy?.());
    stream.on('error', () => {
      if (!res.headersSent) next(createAppError('File not found.', 404));
      else res.destroy();
    });
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
}

router.get('/file/:token', jobMediaFileRateLimitMiddleware, serveFile);
router.head('/file/:token', jobMediaFileRateLimitMiddleware, serveFile);

router.get('/booking/:bookingId', authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await jobMediaService.listBookingMedia(viewerOf(req), param(req, 'bookingId'));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.put(
  '/:id/chunks/:index',
  authMiddleware,
  jobMediaChunkRateLimitMiddleware,
  readChunkBody,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const indexText = param(req, 'index');
      if (!/^\d{1,5}$/.test(indexText)) throw new JobMediaError(400, 'bad_chunk_index', 'The chunk number is not valid.');
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const data = await jobMediaService.putChunk(viewerOf(req), param(req, 'id'), Number(indexText), body);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.post('/:id/complete', authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await jobMediaService.completeUpload(viewerOf(req), param(req, 'id'));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/url', authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await jobMediaService.createViewUrl(viewerOf(req), param(req, 'id'));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await jobMediaService.getUploadState(viewerOf(req), param(req, 'id'));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await jobMediaService.deleteUpload(viewerOf(req), param(req, 'id'));
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
});

/**
 * Media errors carry extra fields the app acts on (nextIndex to resume,
 * Retry-After while a file is being checked). On the signed file route
 * every error is answered here, whatever its kind: the shared error
 * middleware logs the request path, and there the path is the signed token
 * (critique L11, P3 review fix). Nothing logged here includes the path.
 * Other errors on the other routes go to the shared error middleware
 * unchanged.
 */
router.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
  const fileRoute = isJobMediaFileUrl(req.originalUrl);
  if (!(error instanceof JobMediaError) && !fileRoute) {
    next(error);
    return;
  }
  const appError = error as Partial<AppError>;
  const operational = error instanceof JobMediaError
    || (appError.isOperational === true && typeof appError.statusCode === 'number');
  const statusCode = operational ? appError.statusCode! : 500;
  const code = typeof appError.code === 'string' ? appError.code : statusCode === 404 ? 'not_found' : undefined;
  const message = error instanceof Error ? error.message : 'Unknown';
  if (statusCode >= 500) {
    logger.error('Job media request failed', {
      method: req.method, statusCode, code, error: redactJobMediaTokensInText(message),
    });
  } else if (!(error instanceof JobMediaError)) {
    // A stored file missing behind a valid link, for example.
    logger.warn('Job media file request failed', { method: req.method, statusCode, code });
  }
  if (res.headersSent) {
    res.destroy();
    return;
  }
  if (error instanceof JobMediaError && error.retryAfterSeconds) res.setHeader('Retry-After', String(error.retryAfterSeconds));
  res.status(statusCode).json({
    success: false,
    error: {
      message: operational ? message : 'An unexpected error occurred. Please try again later.',
      statusCode,
      ...(code ? { code } : {}),
      ...(error instanceof JobMediaError ? error.details : {}),
    },
  });
});

export default router;
