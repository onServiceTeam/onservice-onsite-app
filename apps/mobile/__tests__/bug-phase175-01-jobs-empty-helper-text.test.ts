// BUG-PHASE175-01 — provider Jobs tab empty state had no helper
// text. Same UX-gap family as Phase 169/170/172/173/174.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../app/(provider-tabs)/jobs.tsx'),
  'utf8',
);

describe('BUG-PHASE175-01 — provider Jobs empty state has helper text', () => {
  it('shows helper text for the active filter empty state', () => {
    expect(SOURCE).toMatch(
      /filter === 'active'[\s\S]+?Make sure you(?:&apos;|')re online[\s\S]+?Dashboard/,
    );
  });

  it('shows helper text for the completed filter empty state', () => {
    expect(SOURCE).toMatch(
      /filter === 'completed'[\s\S]+?Completed jobs will show here[\s\S]+?customer confirms/,
    );
  });

  it('shows helper text for the cancelled filter empty state', () => {
    expect(SOURCE).toMatch(
      /filter === 'cancelled'[\s\S]+?Cancelled jobs will appear here/,
    );
  });

  it('PHASE175 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE175-01 fix/);
  });

  it('emptyHint style is defined', () => {
    expect(SOURCE).toMatch(/emptyHint:\s*\{[\s\S]+?textAlign/);
  });
});
