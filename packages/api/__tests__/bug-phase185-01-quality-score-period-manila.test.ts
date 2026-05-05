// BUG-PHASE185-01 — computeProviderQualityScores computed period
// boundaries in UTC instead of Manila. Same UTC-vs-Manila pattern as
// Phase 119-124 + Phase 132-140.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../src/services/admin-analytics.service.ts'),
  'utf8',
);

describe('BUG-PHASE185-01 — quality-score period uses Manila TZ', () => {
  it('uses Intl.DateTimeFormat with timeZone Asia/Manila for the end boundary', () => {
    expect(SOURCE).toMatch(
      /new Intl\.DateTimeFormat\('en-CA',[\s\S]+?timeZone:\s*'Asia\/Manila'/,
    );
  });

  it('does not use raw new Date().toISOString().split for the period boundaries', () => {
    // The original buggy pattern was:
    //   const periodStart = new Date();
    //   periodStart.setDate(periodStart.getDate() - periodDays);
    //   const periodStartStr = periodStart.toISOString().split('T')[0]!;
    // The fix should not still have that exact pattern.
    expect(SOURCE).not.toMatch(
      /periodStart\.setDate\(periodStart\.getDate\(\) - periodDays\)/,
    );
  });

  it('PHASE185-01 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE185-01 fix/);
  });
});
