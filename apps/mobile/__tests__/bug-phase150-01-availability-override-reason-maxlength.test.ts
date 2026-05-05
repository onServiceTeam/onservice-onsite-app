// BUG-PHASE150-01 — apps/mobile/app/provider/availability.tsx
// overrideReason TextInput had no maxLength. Server's
// availabilityOverrideSchema caps reason at max(500)
// (provider.validators.ts:76).
//
// Final entry in the Phase 145-150 mobile maxLength sweep.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../app/provider/availability.tsx'),
  'utf8',
);

describe('BUG-PHASE150-01 — availability override reason enforces server max(500)', () => {
  it('overrideReason has maxLength={500}', () => {
    expect(SOURCE).toMatch(
      /value=\{overrideReason\}[\s\S]+?maxLength=\{500\}/,
    );
  });

  it('PHASE150 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE150-01 fix/);
  });
});
