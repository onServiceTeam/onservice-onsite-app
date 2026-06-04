import { createRequire } from 'node:module';
import { logger } from '../utils/logger';

const esmRequire = createRequire(import.meta.url);

interface SentryLike {
  init: (options: Record<string, unknown>) => void;
  captureException: (err: unknown, context?: Record<string, unknown>) => void;
  captureMessage: (msg: string, level?: string) => void;
  close: (timeout?: number) => Promise<boolean>;
}

let sentry: SentryLike | null = null;

export function initSentry(): void {
  // Accept either env name (the launch-cutover runbook uses SENTRY_API_DSN).
  const dsn = process.env.SENTRY_DSN || process.env.SENTRY_API_DSN;
  if (!dsn) {
    logger.info('Sentry DSN not configured — error tracking disabled');
    return;
  }

  try {
    const Sentry = esmRequire('@sentry/node') as SentryLike;
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? 'development',
      release: `onservice-api@${process.env.npm_package_version ?? '0.1.0'}`,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    });
    sentry = Sentry;
    logger.info('Sentry error tracking initialized');
  } catch {
    logger.warn('Sentry SDK not installed — error tracking unavailable. Run: npm install @sentry/node');
  }
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (sentry) {
    sentry.captureException(err, context ? { extra: context } : undefined);
  }
}

export function captureMessage(msg: string, level = 'info'): void {
  if (sentry) {
    sentry.captureMessage(msg, level);
  }
}

export async function closeSentry(timeout = 2000): Promise<void> {
  if (sentry) {
    await sentry.close(timeout);
  }
}
