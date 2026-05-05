// BUG-PHASE166-01 — /api/v1/catalog/search is PUBLIC (no auth) and
// had no upper bound on the query string length. The endpoint
// ILIKEs against three columns + joins providers — wasteful with
// a 100,000-char query.
//
// Same defense-in-depth pattern as Phase 152-165. Cap at 100 chars
// (real human searches are short).
//
// Mobile match: apps/mobile/app/customer/search.tsx adds
// maxLength={100} on the search input.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROUTE = readFileSync(
  resolve(__dirname, '../src/routes/catalog.routes.ts'),
  'utf8',
);
const MOBILE = readFileSync(
  resolve(__dirname, '../../../apps/mobile/app/customer/search.tsx'),
  'utf8',
);

describe('BUG-PHASE166-01 — search query length cap', () => {
  it('server rejects query > 100 chars', () => {
    expect(ROUTE).toMatch(
      /query\.length > 100[\s\S]+?Search query must be ≤ 100 characters/,
    );
  });

  it('mobile search input has maxLength={100}', () => {
    expect(MOBILE).toMatch(/value=\{query\}[\s\S]+?maxLength=\{100\}/);
  });

  it('PHASE166 fix-comments are preserved on both', () => {
    expect(ROUTE).toMatch(/BUG-PHASE166-01 fix/);
    expect(MOBILE).toMatch(/BUG-PHASE166-01 fix/);
  });
});
