// BUG-PHASE181-01 — admin-latent decide routes (provider apps,
// service-area-change requests) accepted unbounded reason strings.
// Same server-cap shape as Phase 152-168 + Phase 179 + Phase 180.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../src/routes/admin-latent.routes.ts'),
  'utf8',
);

describe('BUG-PHASE181-01 — admin decide routes have explicit reason cap', () => {
  it('defines DECIDE_REASON_MAX = 5000 and validateDecideReason helper', () => {
    expect(SOURCE).toMatch(/DECIDE_REASON_MAX\s*=\s*5000/);
    expect(SOURCE).toMatch(/function\s+validateDecideReason/);
  });

  it('applies validateDecideReason in provider-applications/decide route', () => {
    expect(SOURCE).toMatch(
      /reason\s*=[\s\S]+?validateDecideReason\(reason\)[\s\S]+?'approved' && decision !== 'rejected' && decision !== 'sent_back'/,
    );
  });

  it('applies validateDecideReason in service-area-changes/decide route', () => {
    expect(SOURCE).toMatch(
      /reason\s*=[\s\S]+?validateDecideReason\(reason\)[\s\S]+?'approved' && decision !== 'rejected'\)/,
    );
  });

  it('PHASE181-01 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE181-01 fix/);
  });
});
