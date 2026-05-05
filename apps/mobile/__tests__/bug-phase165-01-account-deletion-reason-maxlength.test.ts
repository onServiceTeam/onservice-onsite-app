// BUG-PHASE165-01 — customer + provider account-management deletion
// reason inputs had no maxLength. Server caps at 1000 (Phase 156).
//
// Same fix shape as Phase 145-150 mobile maxLength sweep.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const CUSTOMER = readFileSync(
  resolve(__dirname, '../app/customer/account-management.tsx'),
  'utf8',
);
const PROVIDER = readFileSync(
  resolve(__dirname, '../app/provider/account-management.tsx'),
  'utf8',
);

describe('BUG-PHASE165-01 — account deletion reason maxLength=1000', () => {
  it('customer/account-management has maxLength={1000}', () => {
    expect(CUSTOMER).toMatch(
      /Tell us why you're leaving[\s\S]+?maxLength=\{1000\}/,
    );
  });

  it('provider/account-management has maxLength={1000}', () => {
    expect(PROVIDER).toMatch(
      /Tell us why you're leaving[\s\S]+?maxLength=\{1000\}/,
    );
  });

  it('PHASE165 fix-comments are preserved on both', () => {
    expect(CUSTOMER).toMatch(/BUG-PHASE165-01 fix/);
    expect(PROVIDER).toMatch(/BUG-PHASE165-01 fix/);
  });
});
