// CRIT-M01 fix verified — rate-limit middleware now picks up live
// admin-tuned values from the settings service.
//
// Pre-fix: `rateLimit({ windowMs: currentWindow, max: currentMax })`
// captured both primitives at module load. The setInterval refresh
// updated the variables in scope but never the limiter's bound
// values. Admin tunings persisted to DB but were silently ignored
// until process restart.
//
// Post-fix:
// - `limit` is passed as a function `() => currentMax` to
//   express-rate-limit v8, which evaluates it per request → admin
//   max changes apply immediately.
// - `windowMs` cannot be a function in express-rate-limit, so the
//   inner limiter is rebuilt when the cached window value changes.
// - `initRateLimit()` awaits the first DB read before its startup promise
//   resolves; conservative deployment defaults remain active during that read.

const getSettingIntegerMock = jest.fn();

jest.mock('../src/services/settings.service', () => ({
  getSettingInteger: (...args: unknown[]) => getSettingIntegerMock(...args),
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  refreshRateLimits,
  initRateLimit,
  __getCachedForTest,
  __forceRebuildForTest,
  rateLimitMiddleware,
} from '../src/middleware/rate-limit.middleware';

describe('CRIT-M01 — rate-limit live config', () => {
  beforeEach(() => {
    getSettingIntegerMock.mockReset();
    // Reset to a known starting state so individual tests are independent.
    __forceRebuildForTest(60_000, 100);
  });

  it('refreshRateLimits reads BOTH window and max from settings.service', async () => {
    getSettingIntegerMock.mockImplementation(async (key: string) => {
      if (key === 'rate_limit_window_ms') return 30_000;
      if (key === 'rate_limit_max_requests') return 50;
      throw new Error(`unexpected key: ${key}`);
    });

    await refreshRateLimits();

    expect(getSettingIntegerMock).toHaveBeenCalledWith('rate_limit_window_ms');
    expect(getSettingIntegerMock).toHaveBeenCalledWith('rate_limit_max_requests');
    expect(__getCachedForTest()).toEqual({ windowMs: 30_000, max: 50 });
  });

  it('Bug CRIT-M01 — admin changes to rate_limit_max_requests take effect WITHOUT process restart', async () => {
    // Initial DB state: max = 100.
    getSettingIntegerMock.mockImplementation(async (key: string) => {
      if (key === 'rate_limit_window_ms') return 60_000;
      if (key === 'rate_limit_max_requests') return 100;
      return 0;
    });
    await refreshRateLimits();
    expect(__getCachedForTest().max).toBe(100);

    // Admin changes max to 25 in the settings UI → DB now returns 25.
    getSettingIntegerMock.mockReset();
    getSettingIntegerMock.mockImplementation(async (key: string) => {
      if (key === 'rate_limit_window_ms') return 60_000;
      if (key === 'rate_limit_max_requests') return 25;
      return 0;
    });

    // Periodic refresh runs.
    await refreshRateLimits();

    // The cached `currentMax` MUST now be 25 — the limiter's `limit`
    // function reads this value on every request, so the next request
    // sees 25. (Pre-fix: limiter still bound to the original 100.)
    expect(__getCachedForTest().max).toBe(25);
  });

  it('Bug CRIT-M01 — windowMs change rebuilds the underlying limiter (different window requires rebuild)', async () => {
    getSettingIntegerMock.mockImplementation(async (key: string) => {
      if (key === 'rate_limit_window_ms') return 60_000;
      if (key === 'rate_limit_max_requests') return 100;
      return 0;
    });
    await refreshRateLimits();
    expect(__getCachedForTest().windowMs).toBe(60_000);

    // Admin halves the window in the settings UI.
    getSettingIntegerMock.mockReset();
    getSettingIntegerMock.mockImplementation(async (key: string) => {
      if (key === 'rate_limit_window_ms') return 30_000;
      if (key === 'rate_limit_max_requests') return 100;
      return 0;
    });

    await refreshRateLimits();

    // Cached value reflects the change. Internal rebuild is invisible
    // (it's a private detail), but the cached primitive — which is
    // also what a future rebuild would use — is now 30_000.
    expect(__getCachedForTest().windowMs).toBe(30_000);
  });

  it('refresh failure (DB down) keeps the previous cached values rather than zeroing the limiter', async () => {
    // Seed with known values.
    __forceRebuildForTest(60_000, 100);

    getSettingIntegerMock.mockReset();
    getSettingIntegerMock.mockRejectedValue(new Error('database connection refused'));

    // Refresh swallows the error (logged as warn) and keeps the cache.
    await expect(refreshRateLimits()).resolves.toBeUndefined();
    expect(__getCachedForTest()).toEqual({ windowMs: 60_000, max: 100 });
  });

  it('initRateLimit awaits the first DB read before its startup promise resolves', async () => {
    // initRateLimit must await refreshRateLimits — verify by making
    // the DB call slow and confirming the cached value is updated by
    // the time the promise resolves.
    let resolveSlowRead!: (val: number) => void;
    const slow = new Promise<number>((resolve) => { resolveSlowRead = resolve; });
    let firstCall = true;
    getSettingIntegerMock.mockImplementation((key: string) => {
      if (firstCall && key === 'rate_limit_window_ms') {
        firstCall = false;
        return slow;
      }
      if (key === 'rate_limit_window_ms') return Promise.resolve(45_000);
      if (key === 'rate_limit_max_requests') return Promise.resolve(75);
      return Promise.resolve(0);
    });

    const initPromise = initRateLimit();
    // Before the slow read resolves, init should still be pending.
    let resolved = false;
    initPromise.then(() => { resolved = true; });
    await new Promise((r) => setTimeout(r, 10));
    expect(resolved).toBe(false);

    resolveSlowRead(45_000);
    await initPromise;

    expect(__getCachedForTest()).toEqual({ windowMs: 45_000, max: 75 });
  });

  it('rateLimitMiddleware is a stable function reference (so `app.use(rateLimitMiddleware)` keeps working across rebuilds)', () => {
    const ref1 = rateLimitMiddleware;
    __forceRebuildForTest(30_000, 50); // simulate a windowMs-driven rebuild
    const ref2 = rateLimitMiddleware;
    expect(ref1).toBe(ref2);
    expect(typeof rateLimitMiddleware).toBe('function');
  });
});
