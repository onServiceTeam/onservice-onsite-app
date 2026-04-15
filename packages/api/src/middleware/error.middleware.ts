import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface AppError extends Error {
  statusCode: number;
  isOperational: boolean;
}

export function createAppError(message: string, statusCode: number): AppError {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
}

export function errorMiddleware(
  err: AppError | Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = 'statusCode' in err ? err.statusCode : 500;
  const isOperational = 'isOperational' in err ? err.isOperational : false;

  // Log error with structured data
  logger.error('Request error', {
    method: req.method,
    path: req.path,
    statusCode,
    error: err.message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    requestId: req.headers['x-request-id'],
  });

  // Never expose internal errors to client
  const clientMessage = isOperational
    ? err.message
    : 'An unexpected error occurred. Please try again later.';

  res.status(statusCode).json({
    success: false,
    error: {
      message: clientMessage,
      statusCode,
    },
  });
}
