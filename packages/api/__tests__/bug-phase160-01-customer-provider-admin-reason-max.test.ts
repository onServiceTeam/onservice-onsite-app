// BUG-PHASE160-01 — Three customer/provider admin services had a
// min(5) reason check but no max cap. The reasons persist to
// admin_actions.reason (TEXT, unbounded by Postgres).
//
// Sites:
//   customer-admin.service.ts updateCustomerStatus
//   customer-admin.service.ts creditCustomerWallet
//   provider-admin.service.ts adjustProviderWallet
//
// Same defense-in-depth pattern as Phase 152-159. Cap at 2000.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const CUST_SVC = readFileSync(
  resolve(__dirname, '../src/services/customer-admin.service.ts'),
  'utf8',
);
const PROV_SVC = readFileSync(
  resolve(__dirname, '../src/services/provider-admin.service.ts'),
  'utf8',
);

describe('BUG-PHASE160-01 — customer/provider admin reason max(2000)', () => {
  it('customer-admin caps reason at 2000 chars (≥ 2 sites)', () => {
    const matches = CUST_SVC.match(
      /\.length > 2000[\s\S]+?reason must be ≤ 2000 characters/g,
    );
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it('provider-admin caps reason at 2000 chars (≥ 1 site)', () => {
    expect(PROV_SVC).toMatch(
      /trimmedReason\.length > 2000[\s\S]+?reason must be ≤ 2000 characters/,
    );
  });

  it('PHASE160 fix-comments are preserved on both services', () => {
    expect(CUST_SVC).toMatch(/BUG-PHASE160-01 fix/);
    expect(PROV_SVC).toMatch(/BUG-PHASE160-01 fix/);
  });
});
