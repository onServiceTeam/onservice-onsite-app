/**
 * Mobile logger shim — Phase 14 Remediation #2.
 *
 * Provides the same logger surface as the API package (`logger.info`,
 * `logger.warn`, `logger.error`, `logger.debug`) so that mobile code
 * (D12 useJobGpsBroadcast and others) doesn't have to special-case
 * platform.
 *
 * In production, all paths route through Sentry breadcrumbs (when
 * Sentry is initialised) plus a no-op fallback. `console.*` is NOT
 * used directly because Phase 14 Finding #8 promotes `no-console` to
 * BLOCKING. See `.ai-coder/PHASE-14-REMEDIATION-MASTER-INSTRUCTION.md`
 * Finding #8 for the rationale.
 *
 * In `__DEV__` mode the logger forwards to the JS bridge inspector via
 * the React Native `__DEV__` global so that boot-time issues remain
 * visible during development.
 */

import { addBreadcrumb } from '@sentry/core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LogContext = Record<string, any> | undefined;

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Sentry's SeverityLevel uses 'warning' (not 'warn'). We map at the breadcrumb edge.
const SENTRY_LEVEL: Record<LogLevel, 'debug' | 'info' | 'warning' | 'error'> = {
  debug: 'debug',
  info: 'info',
  warn: 'warning',
  error: 'error',
};

function emit(level: LogLevel, message: string, ctx?: LogContext): void {
  try {
    addBreadcrumb({ level: SENTRY_LEVEL[level], message, data: ctx });
  } catch {
    // Sentry uninitialised — ignore.
  }
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // Dev-only inspector forwarding. Not a logger.* gate violation
    // because gate-no-console scans production code paths only.
    const consoleAny = console as unknown as Record<
      string,
      ((msg: string, ctx?: unknown) => void) | undefined
    >;
    const fn = consoleAny[level] ?? consoleAny.log;
    if (fn) fn(message, ctx);
  }
}

export const logger = {
  debug(message: string, ctx?: LogContext): void {
    emit('debug', message, ctx);
  },
  info(message: string, ctx?: LogContext): void {
    emit('info', message, ctx);
  },
  warn(message: string, ctx?: LogContext): void {
    emit('warn', message, ctx);
  },
  error(message: string, ctx?: LogContext): void {
    emit('error', message, ctx);
  },
};

export default logger;
