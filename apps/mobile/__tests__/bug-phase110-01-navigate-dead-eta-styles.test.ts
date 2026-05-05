// BUG-PHASE110-01 — provider/job/[id]/navigate.tsx had three dead
// styles (etaCard, etaLabel, etaValue) sitting in StyleSheet.create
// after Phase 59-02 ripped out the hardcoded "ETA: ~25 min" card
// that misled providers. The fix-comment at line ~161 already calls
// out that the fake card was removed; the styles were just left
// behind.
//
// Same dead-code pattern as Phase 103 (INITIAL_SECTIONS) and Phase
// 107 (imageUrl useState): a feature was deleted from the JSX but
// scaffolding around it wasn't. Risk: a future maintainer wiring an
// ETA back in would grab the dead style names and re-introduce the
// pre-fix card before the real distance/duration query is wired,
// re-introducing the misleading static "ETA" the original fix
// removed.
//
// Fix: delete etaCard, etaLabel, etaValue from styles.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const NAVIGATE = readFileSync(
  resolve(__dirname, '../app/provider/job/[id]/navigate.tsx'),
  'utf8',
);

describe('BUG-PHASE110-01 — provider navigate.tsx dead ETA styles removed', () => {
  it('BUG-PHASE110-01 — etaCard style is gone', () => {
    expect(NAVIGATE).not.toMatch(/etaCard:/);
  });

  it('BUG-PHASE110-01 — etaLabel style is gone', () => {
    expect(NAVIGATE).not.toMatch(/etaLabel:/);
  });

  it('BUG-PHASE110-01 — etaValue style is gone', () => {
    expect(NAVIGATE).not.toMatch(/etaValue:/);
  });

  it('BUG-PHASE110-01 — pre-fix successDark color reference (only consumer was the dead styles) is gone', () => {
    expect(NAVIGATE).not.toMatch(/colors\.successDark/);
  });

  it('BUG-PHASE110-01 — google maps + waze buttons still wired (regression guard)', () => {
    expect(NAVIGATE).toMatch(/Open in Google Maps/);
    expect(NAVIGATE).toMatch(/Open in Waze/);
  });
});
