// BUG-PHASE196-01 — tip screen used servicePrice as maxTip but
// ignored the platform-wide tip_max_amount_cents setting (exposed
// via /api/v1/tips/limits). Same UX desync as Phase 145/194.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../app/customer/booking/tip.tsx'),
  'utf8',
);

describe('BUG-PHASE196-01 — tip screen honours platform tip cap', () => {
  it('queries /api/v1/tips/limits', () => {
    expect(SOURCE).toMatch(
      /tipLimitsQuery[\s\S]+?'\/api\/v1\/tips\/limits'/,
    );
  });

  it('caches tip-limits with staleTime 5min', () => {
    expect(SOURCE).toMatch(
      /queryKey:\s*\['tip-limits'\][\s\S]+?staleTime:\s*5\s*\*\s*60\s*\*\s*1000/,
    );
  });

  it('maxTip = min(servicePrice, platformTipMax)', () => {
    expect(SOURCE).toMatch(
      /maxTip\s*=\s*Math\.min\(servicePrice,\s*platformTipMax\)/,
    );
  });

  it('error message distinguishes platform-cap vs service-price cap', () => {
    expect(SOURCE).toMatch(
      /platformTipMax\s*<\s*servicePrice[\s\S]+?platform cap/,
    );
  });

  it('PHASE196-01 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE196-01 fix/);
  });
});
