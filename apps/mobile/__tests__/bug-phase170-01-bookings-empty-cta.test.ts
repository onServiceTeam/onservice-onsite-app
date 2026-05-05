// BUG-PHASE170-01 — apps/mobile/app/(tabs)/bookings.tsx empty
// state had no action button. A new customer with zero bookings
// saw "No bookings yet" with no path forward — they had to
// navigate back to (tabs)/home to find the categories.
//
// Real UX gap, same family as Phase 169 (home active-bookings
// hidden).
//
// Fix: add "Browse Services" CTA on the all-filter empty state
// (when filter is genuinely "no history yet"). Filter-specific
// empty states ("No active bookings found") don't get the CTA —
// those are about a sub-filter, not the genuine no-history case.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../app/(tabs)/bookings.tsx'),
  'utf8',
);

describe('BUG-PHASE170-01 — bookings empty state has CTA when no bookings', () => {
  it('shows Browse Services CTA on filter === "all"', () => {
    expect(SOURCE).toMatch(
      /filter === 'all' && \([\s\S]+?Routes\.TABS\.HOME[\s\S]+?Browse Services/,
    );
  });

  it('PHASE170 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE170-01 fix/);
  });
});
