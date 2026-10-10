import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  code?: string;
}

export function createAppError(message: string, statusCode: number): AppError {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
}

// BUG-PHASE26 follow-up: multer raises errors with `.code` like
// 'LIMIT_FILE_SIZE', 'LIMIT_UNEXPECTED_FILE', 'LIMIT_FILE_COUNT' that
// extend Error but lack our isOperational/statusCode shape. Pre-fix
// they bubbled to the generic 500 branch so a client uploading a 20MB
// file got "An unexpected error occurred" instead of a clear 400.
// Post-fix: the lookup below normalizes multer errors to 400 with the
// message preserved.
const MULTER_4XX_CODES = new Set([
  'LIMIT_PART_COUNT',
  'LIMIT_FILE_SIZE',
  'LIMIT_FILE_COUNT',
  'LIMIT_FIELD_KEY',
  'LIMIT_FIELD_VALUE',
  'LIMIT_FIELD_COUNT',
  'LIMIT_UNEXPECTED_FILE',
]);

function isMulterError(err: Error): boolean {
  return (err as { name?: string }).name === 'MulterError'
    || MULTER_4XX_CODES.has((err as { code?: string }).code ?? '');
}

export function errorMiddleware(
  err: AppError | Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  let statusCode = 'statusCode' in err ? err.statusCode : 500;
  let isOperational = 'isOperational' in err ? err.isOperational : false;

  // Multer errors are user-input issues — normalize to 400 with the
  // multer message preserved so clients get an actionable error.
  if (statusCode === 500 && isMulterError(err)) {
    statusCode = 400;
    isOperational = true;
  }

  const logAsServerError = statusCode >= 500 || !isOperational;
  const logContext = {
    method: req.method,
    path: req.path,
    statusCode,
    error: err.message,
    stack: logAsServerError && process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    requestId: req.headers['x-request-id'],
  };

  // Operational 4xx responses are expected request rejections, not server
  // failures. Keep them searchable at warning level without triggering the
  // production error signal used by support and incident alerting.
  if (logAsServerError) {
    logger.error('Request error', logContext);
  } else {
    logger.warn('Request rejected', logContext);
  }

  // Never expose internal errors to client
  const clientMessage = isOperational
    ? err.message
    : 'An unexpected error occurred. Please try again later.';
  const errorCode = isOperational && 'code' in err && typeof err.code === 'string'
    ? err.code
    : undefined;

  res.status(statusCode).json({
    success: false,
    error: {
      message: clientMessage,
      statusCode,
      ...(errorCode ? { code: errorCode } : {}),
    },
  });
}
