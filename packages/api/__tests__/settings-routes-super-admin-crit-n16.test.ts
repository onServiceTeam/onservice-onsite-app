// CRIT-N16 fix verified — settings.routes mutations gated to super_admin only.
//
// Pre-fix: router.use(rbacMiddleware('admin', 'super_admin')) covered EVERY
// route, including PUT / (bulk update), PUT /:key (single update),
// POST /:key/reset, POST /cache/flush. Junior admin could change ANY
// platform_setting (commission rates, fees, refund tiers, etc.).
// Post-fix: read routes (GET /, GET /:category, GET /:key/history) remain
// at admin level. Mutations (PUT, POST except read) are super_admin only.

import { rbacMiddleware } from '../src/middleware/rbac.middleware';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROUTES = readFileSync(
  resolve(__dirname, '../src/routes/settings.routes.ts'),
  'utf8',
);

describe('CRIT-N16 — settings mutations require super_admin', () => {
  it('CRIT-N16 — PUT / (bulk update) has rbacMiddleware(\'super_admin\') guard', () => {
    // Find the PUT / declaration block.
    const putIdx = ROUTES.indexOf("router.put('/'");
    expect(putIdx).toBeGreaterThan(0);
    const blockEnd = ROUTES.indexOf('});', putIdx);
    expect(blockEnd).toBeGreaterThan(putIdx);
    const block = ROUTES.slice(putIdx, blockEnd);
    expect(block).toMatch(/rbacMiddleware\('super_admin'\)/);
  });

  it('CRIT-N16 — PUT /:key (single update) has rbacMiddleware(\'super_admin\') guard', () => {
    const putKeyIdx = ROUTES.indexOf("router.put('/:key'");
    expect(putKeyIdx).toBeGreaterThan(0);
    const blockEnd = ROUTES.indexOf('});', putKeyIdx);
    const block = ROUTES.slice(putKeyIdx, blockEnd);
    expect(block).toMatch(/rbacMiddleware\('super_admin'\)/);
  });

  it('CRIT-N16 — POST /:key/reset has rbacMiddleware(\'super_admin\') guard', () => {
    const resetIdx = ROUTES.indexOf("router.post('/:key/reset'");
    expect(resetIdx).toBeGreaterThan(0);
    const blockEnd = ROUTES.indexOf('});', resetIdx);
    const block = ROUTES.slice(resetIdx, blockEnd);
    expect(block).toMatch(/rbacMiddleware\('super_admin'\)/);
  });

  it('CRIT-N16 — POST /cache/flush has rbacMiddleware(\'super_admin\') guard', () => {
    const flushIdx = ROUTES.indexOf("router.post(");
    expect(flushIdx).toBeGreaterThan(0);
    // Find the cache/flush specifically (could be multiple POST routes).
    const cacheFlushIdx = ROUTES.indexOf("'/cache/flush'");
    expect(cacheFlushIdx).toBeGreaterThan(0);
    // Slice from the router.post just before /cache/flush.
    const startIdx = ROUTES.lastIndexOf('router.post(', cacheFlushIdx);
    const blockEnd = ROUTES.indexOf('});', startIdx);
    const block = ROUTES.slice(startIdx, blockEnd);
    expect(block).toMatch(/rbacMiddleware\('super_admin'\)/);
  });

  it('CRIT-N16 — read routes (GET /, GET /:category, GET /:key/history) do NOT require super_admin', () => {
    // Read routes still inherit the global rbacMiddleware('admin', 'super_admin')
    // mount. They must NOT have a per-route super_admin guard.
    const get1Idx = ROUTES.indexOf("router.get('/'");
    expect(get1Idx).toBeGreaterThan(0);
    const get1End = ROUTES.indexOf('});', get1Idx);
    const get1Block = ROUTES.slice(get1Idx, get1End);
    // The block should call the handler directly (no second-arg
    // rbacMiddleware('super_admin') wrapper).
    expect(get1Block).not.toMatch(/rbacMiddleware\('super_admin'\)/);

    const getCategoryIdx = ROUTES.indexOf("router.get('/:category'");
    expect(getCategoryIdx).toBeGreaterThan(0);
    const getCategoryEnd = ROUTES.indexOf('});', getCategoryIdx);
    const getCategoryBlock = ROUTES.slice(getCategoryIdx, getCategoryEnd);
    expect(getCategoryBlock).not.toMatch(/rbacMiddleware\('super_admin'\)/);

    const getHistoryIdx = ROUTES.indexOf("router.get('/:key/history'");
    expect(getHistoryIdx).toBeGreaterThan(0);
    const getHistoryEnd = ROUTES.indexOf('});', getHistoryIdx);
    const getHistoryBlock = ROUTES.slice(getHistoryIdx, getHistoryEnd);
    expect(getHistoryBlock).not.toMatch(/rbacMiddleware\('super_admin'\)/);
  });

  it('CRIT-N16 — rbacMiddleware(\'super_admin\') rejects junior admin role at runtime', () => {
    // Smoke test on the middleware itself: even though we wired the
    // routes correctly, this verifies the middleware actually enforces
    // role-mismatch.
    const guard = rbacMiddleware('super_admin');

    // junior admin
    let nextErr: Error | undefined;
    guard(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { user: { userId: 'admin-1', role: 'admin' } } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      (e?: unknown) => { if (e instanceof Error) nextErr = e; },
    );
    expect(nextErr).toBeDefined();
    expect(nextErr!.message).toMatch(/permission/i);

    // super_admin
    let okCalled = false;
    guard(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { user: { userId: 'admin-1', role: 'super_admin' } } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      () => { okCalled = true; },
    );
    expect(okCalled).toBe(true);
  });
});
