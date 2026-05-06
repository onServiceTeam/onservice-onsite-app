// BUG-PHASE191-01 — dispute-admin requireText helper had min but no
// max. Same defense-in-depth pattern as Phase 168 (requireReason).

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../src/services/dispute-admin.service.ts'),
  'utf8',
);

describe('BUG-PHASE191-01 — dispute-admin requireText caps at 5000', () => {
  it('defines REQUIRE_TEXT_MAX = 5000', () => {
    expect(SOURCE).toMatch(/REQUIRE_TEXT_MAX\s*=\s*5000/);
  });

  it('rejects text exceeding REQUIRE_TEXT_MAX', () => {
    expect(SOURCE).toMatch(
      /trimmed\.length\s*>\s*REQUIRE_TEXT_MAX[\s\S]+?must be ≤[\s\S]+?REQUIRE_TEXT_MAX/,
    );
  });

  it('PHASE191-01 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE191-01 fix/);
  });
});
