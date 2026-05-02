// Phase C CRIT-50 + CRIT-46 verification — graceful shutdown +
// auth-specific rate limit tunable.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SERVER = readFileSync(
  resolve(__dirname, '../src/server.ts'),
  'utf8',
);
const RATE_LIMIT = readFileSync(
  resolve(__dirname, '../src/middleware/rate-limit.middleware.ts'),
  'utf8',
);

describe('Phase C CRIT-50 — graceful shutdown on SIGTERM/SIGINT', () => {
  it('CRIT-50 — gracefulShutdown function defined + exported', () => {
    expect(SERVER).toMatch(/function gracefulShutdown\(signal: NodeJS\.Signals\): void/);
    expect(SERVER).toMatch(/export \{ httpServer, gracefulShutdown \}/);
  });
  it('CRIT-50 — handler attached to BOTH SIGTERM and SIGINT', () => {
    expect(SERVER).toMatch(/process\.on\('SIGTERM', gracefulShutdown\)/);
    expect(SERVER).toMatch(/process\.on\('SIGINT', gracefulShutdown\)/);
  });
  it('CRIT-50 — shutdown is idempotent via SHUTTING_DOWN flag', () => {
    expect(SERVER).toMatch(/let SHUTTING_DOWN = false/);
    expect(SERVER).toMatch(/if \(SHUTTING_DOWN\)/);
  });
  it('CRIT-50 — has a 30-second force-exit cap to prevent stuck handlers', () => {
    expect(SERVER).toMatch(/SHUTDOWN_TIMEOUT_MS = 30_000/);
    expect(SERVER).toMatch(/Graceful shutdown timed out/);
  });
  it('CRIT-50 — calls httpServer.close to drain in-flight requests', () => {
    expect(SERVER).toMatch(/httpServer\.close\(\(err\) => \{/);
  });
  it('CRIT-50 — unhandledRejection logged but does NOT crash', () => {
    expect(SERVER).toMatch(/process\.on\('unhandledRejection'/);
    // unhandledRejection handler does NOT call process.exit
    const start = SERVER.indexOf("process.on('unhandledRejection'");
    const end = SERVER.indexOf("process.on('uncaughtException'", start);
    const body = SERVER.slice(start, end);
    expect(body).not.toMatch(/process\.exit\(1\)/);
  });
  it('CRIT-50 — uncaughtException IS fatal (logged then process.exit(1))', () => {
    expect(SERVER).toMatch(/process\.on\('uncaughtException'/);
    const start = SERVER.indexOf("process.on('uncaughtException'");
    const body = SERVER.slice(start, start + 800);
    expect(body).toMatch(/process\.exit\(1\)/);
  });
});

describe('Phase C CRIT-46 — auth-specific rate limiter is settings-tunable', () => {
  it('CRIT-46 — buildAuthLimiter exists with separate authCurrentWindow/authCurrentMax', () => {
    expect(RATE_LIMIT).toMatch(/function buildAuthLimiter\(windowMs: number\): RateLimitRequestHandler/);
    expect(RATE_LIMIT).toMatch(/let authCurrentWindow: number = 60_000/);
    expect(RATE_LIMIT).toMatch(/let authCurrentMax: number = 10/);
  });
  it('CRIT-46 — refreshAuthRateLimits reads auth_rate_limit_window_ms + auth_rate_limit_max_requests', () => {
    expect(RATE_LIMIT).toMatch(/getSettingInteger\('auth_rate_limit_window_ms'\)/);
    expect(RATE_LIMIT).toMatch(/getSettingInteger\('auth_rate_limit_max_requests'\)/);
  });
  it('CRIT-46 — initAuthRateLimit + authRateLimitMiddleware exported for routes to mount', () => {
    expect(RATE_LIMIT).toMatch(/export async function initAuthRateLimit\(\)/);
    expect(RATE_LIMIT).toMatch(/export function authRateLimitMiddleware\(/);
  });
  it('CRIT-46 — auth limiter rebuilds when windowMs changes (preserves counters when nothing changed)', () => {
    expect(RATE_LIMIT).toMatch(/if \(authCurrentWindow !== authActiveWindow\) \{[\s\S]+?authActiveLimiter = buildAuthLimiter/);
  });
  it('CRIT-46 — refresh runs every 60s with .unref() so test timers don\'t leak', () => {
    expect(RATE_LIMIT).toMatch(/setInterval\(\(\) => \{ void refreshAuthRateLimits\(\); \}, 60_000\)\.unref\(\)/);
  });
});
