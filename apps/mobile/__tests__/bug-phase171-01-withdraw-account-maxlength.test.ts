// BUG-PHASE171-01 — provider withdraw screen's account/phone Input
// had no maxLength. Server's withdrawalSchema caps destinationAccount
// at 255 (wallet.validators.ts:16).
//
// Same fix shape as Phase 145-150 mobile maxLength sweep.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../app/provider/withdraw.tsx'),
  'utf8',
);

describe('BUG-PHASE171-01 — withdraw account input maxLength=255', () => {
  it('Input has maxLength={255}', () => {
    expect(SOURCE).toMatch(
      /value=\{account\}[\s\S]+?maxLength=\{255\}/,
    );
  });

  it('PHASE171 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE171-01 fix/);
  });
});
