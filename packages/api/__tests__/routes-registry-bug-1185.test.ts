// Bug 1185 fix verified.
// Phase 14 Dispatch 02 Part 4 — routes registry single source of truth.
//
// Asserts:
//   1. The Routes constants registry is the canonical source — every static
//      raw path used in router.push / router.replace under apps/mobile/{app,src}
//      is gone (the `a-cross-source-routes.sh` gate is the runtime check).
//   2. The buildRoute helper substitutes [param] segments and throws on
//      unfilled params.

import fs from 'node:fs';
import path from 'node:path';
import { Routes, buildRoute } from '../../../apps/mobile/src/config/navigation';

const REPO_ROOT = path.resolve(__dirname, '../../../');

describe('Bug 1185 fix verified — Routes registry shape', () => {
  it('exports the canonical hierarchy', () => {
    expect(Routes.TABS).toBeDefined();
    expect(Routes.PROVIDER_TABS).toBeDefined();
    expect(Routes.AUTH).toBeDefined();
    expect(Routes.CUSTOMER).toBeDefined();
    expect(Routes.PROVIDER).toBeDefined();
    expect(Routes.PROVIDER_ONBOARDING).toBeDefined();
  });

  it('AUTH.LOGIN matches the file-system route', () => {
    expect(Routes.AUTH.LOGIN).toBe('/auth/login');
  });

  it('TABS.HOME matches the (tabs) route group', () => {
    expect(Routes.TABS.HOME).toBe('/(tabs)/home');
  });

  it('CUSTOMER.BOOKING_DETAIL is a [id] template — must be built with buildRoute', () => {
    expect(Routes.CUSTOMER.BOOKING_DETAIL).toContain('[id]');
  });
});

describe('Bug 1185 fix verified — buildRoute helper', () => {
  it('substitutes a single [id] param', () => {
    const out = buildRoute(Routes.CUSTOMER.BOOKING_DETAIL, { id: 'abc-123' });
    expect(out).toBe('/customer/booking/abc-123');
  });

  it('substitutes multiple params on the same template', () => {
    // E55 restores this route at the same time as its real customer screen.
    const out = buildRoute(Routes.CUSTOMER.BUSINESS_INVOICE_DETAIL, {
      id: 'biz-1',
      invoiceId: 'inv-9',
    });
    expect(out).toBe('/customer/business/biz-1/invoices/inv-9');
  });

  it('throws when a [param] is missing', () => {
    expect(() => buildRoute(Routes.CUSTOMER.BOOKING_DETAIL, {})).toThrow(/missing params/);
  });

  it('URL-encodes param values that contain reserved characters', () => {
    const out = buildRoute(Routes.CUSTOMER.CATEGORY, { id: 'home & garden' });
    expect(out).toBe('/customer/category/home%20%26%20garden');
  });
});

describe('Bug 1185 fix verified — no raw static paths in router calls', () => {
  it('a-cross-source-routes.sh exists and refuses raw quoted paths', () => {
    const gate = fs.readFileSync(
      path.join(REPO_ROOT, 'scripts/gates/a-cross-source-routes.sh'),
      'utf8',
    );
    expect(gate).toMatch(/router\\\.\(push\|replace\)/);
  });

  // Phase 14 D04 renamed `customer/safety.tsx` → `customer/safety-and-support.tsx`
  // (per `LAUNCH-LIMITATIONS.md` §23 SiguradoShield pull). Updated in D05
  // subtask 18 audit chain because the rename was missed by D04.
  it('migrated files import Routes (sample: customer/safety-and-support.tsx)', () => {
    const file = fs.readFileSync(
      path.join(REPO_ROOT, 'apps/mobile/app/customer/safety-and-support.tsx'),
      'utf8',
    );
    expect(file).toMatch(/from ['"]@\/config\/navigation['"]/);
  });

  it('migrated files no longer use raw quoted paths in router.push (sample: tabs/home.tsx)', () => {
    const file = fs.readFileSync(
      path.join(REPO_ROOT, 'apps/mobile/app/(tabs)/home.tsx'),
      'utf8',
    );
    // Must not have `router.push('/customer/...')` or `router.push("/customer/...")`
    expect(file).not.toMatch(/router\.(push|replace)\(['"]\/customer\//);
    expect(file).not.toMatch(/router\.(push|replace)\(['"]\/\(tabs\)/);
    // Must reference Routes constants instead.
    expect(file).toMatch(/Routes\./);
  });
});
