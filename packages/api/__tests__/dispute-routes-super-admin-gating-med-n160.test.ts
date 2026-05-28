// MED-N160 fix verified — dispute mutation endpoints
// (PUT /:id/resolve, POST /:id/escalate, PUT /:id/assign) now require
// super_admin role. Junior admins keep read access (GET /, GET /:id)
// but cannot mutate dispute state.
//
// Pre-fix: requireAdmin allowed both 'admin' and 'super_admin', so a
// junior admin could resolve a dispute (which writes a refund or
// releases escrow) without elevated approval.
//
// Post-fix: rbacMiddleware('super_admin') is mounted on the three
// money-affecting routes. GET routes still use requireAdmin so the
// admin dashboard's dispute list/detail pages keep working for
// non-elevated staff.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROUTES = readFileSync(
  resolve(__dirname, '../src/routes/dispute.routes.ts'),
  'utf8',
);

describe('MED-N160 — dispute mutation endpoints require super_admin', () => {
  it('imports rbacMiddleware', () => {
    expect(ROUTES).toMatch(/import \{ rbacMiddleware \} from '\.\.\/middleware\/rbac\.middleware'/);
  });

  it('PUT /:id/resolve gated by rbacMiddleware(\'super_admin\')', () => {
    // Anchored to the resolve route definition.
    const block = ROUTES.match(/router\.put\(\s*'\/:id\/resolve',[\s\S]*?\);/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/rbacMiddleware\('super_admin'\)/);
  });

  it('POST /:id/escalate gated by rbacMiddleware(\'super_admin\')', () => {
    const block = ROUTES.match(/router\.post\(\s*'\/:id\/escalate',[\s\S]*?\);/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/rbacMiddleware\('super_admin'\)/);
  });

  it('PUT /:id/assign gated by rbacMiddleware(\'super_admin\')', () => {
    const block = ROUTES.match(/router\.put\(\s*'\/:id\/assign',[\s\S]*?\);/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/rbacMiddleware\('super_admin'\)/);
  });

  it('does NOT remove requireAdmin from read routes (GET /, GET /:id keep junior-admin read access)', () => {
    // The local requireAdmin helper should still exist and be used by
    // the listing endpoint so dashboards keep working for non-super
    // admins.
    expect(ROUTES).toMatch(/function requireAdmin/);
    const listBlock = ROUTES.match(/router\.get\(\s*'\/',[\s\S]*?\);/);
    expect(listBlock).not.toBeNull();
    expect(listBlock![0]).toMatch(/requireAdmin\(req\)/);
  });

  it('mutation routes no longer call requireAdmin (super_admin gate replaces it)', () => {
    // After the fix, the three money-affecting routes use the
    // rbacMiddleware gate instead of the local requireAdmin helper.
    const resolveBlock = ROUTES.match(/router\.put\(\s*'\/:id\/resolve',[\s\S]*?\);/)![0];
    const escalateBlock = ROUTES.match(/router\.post\(\s*'\/:id\/escalate',[\s\S]*?\);/)![0];
    const assignBlock = ROUTES.match(/router\.put\(\s*'\/:id\/assign',[\s\S]*?\);/)![0];
    expect(resolveBlock).not.toMatch(/requireAdmin\(req\)/);
    expect(escalateBlock).not.toMatch(/requireAdmin\(req\)/);
    expect(assignBlock).not.toMatch(/requireAdmin\(req\)/);
  });
});

describe('MED-N160 — rbacMiddleware behavioral contract (defense in depth)', () => {
  // Smoke-test the rbacMiddleware itself to confirm the gate it
  // applies actually blocks non-super_admin requests. This guards
  // against future regressions in the middleware itself.

  const { rbacMiddleware } = require('../src/middleware/rbac.middleware');

  it('rbacMiddleware(\'super_admin\') rejects junior admin (403)', () => {
    const mw = rbacMiddleware('super_admin');
    const next = jest.fn();
    mw(
      { user: { userId: 'junior', role: 'admin' } } as never,
      {} as never,
      next as never,
    );
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it('rbacMiddleware(\'super_admin\') allows super_admin through (no error)', () => {
    const mw = rbacMiddleware('super_admin');
    const next = jest.fn();
    mw(
      { user: { userId: 'sa', role: 'super_admin' } } as never,
      {} as never,
      next as never,
    );
    expect(next).toHaveBeenCalledWith(); // no args = no error
  });

  it('rbacMiddleware(\'super_admin\') rejects unauthenticated request (401)', () => {
    const mw = rbacMiddleware('super_admin');
    const next = jest.fn();
    mw({} as never, {} as never, next as never);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });
});
