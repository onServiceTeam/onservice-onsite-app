// BUG-PHASE107-01 — provider/portfolio.tsx still carried `imageUrl`
// + `setImageUrl` useState from the pre-fix paste-URL UX, even though
// Phase E CRIT-108 replaced that flow with a picker that uploads
// directly to S3 via uploadImages('onboarding').
//
// Pre-fix: setImageUrl was only called to clear the value (in
// resetForm and handleAdd). imageUrl was read NOWHERE. Pure dead
// state; same shape as Phase 103's INITIAL_SECTIONS — leftover from
// a feature replacement, kept around accidentally. Risk: a future
// maintainer reviving the field and trying to wire it back into the
// upload path could break the picker flow.
//
// Fix: remove the useState, remove both setImageUrl('') call sites.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const PORTFOLIO = readFileSync(
  resolve(__dirname, '../app/provider/portfolio.tsx'),
  'utf8',
);

describe('BUG-PHASE107-01 — provider portfolio dead imageUrl state removed', () => {
  it('BUG-PHASE107-01 — imageUrl useState gone', () => {
    expect(PORTFOLIO).not.toMatch(/const \[imageUrl, setImageUrl\] = useState/);
  });

  it('BUG-PHASE107-01 — setImageUrl call sites gone', () => {
    expect(PORTFOLIO).not.toMatch(/setImageUrl\(/);
  });

  it('BUG-PHASE107-01 — pendingLocalUri (the actual picker state) still wired (regression guard)', () => {
    expect(PORTFOLIO).toMatch(/const \[pendingLocalUri, setPendingLocalUri\] = useState/);
    expect(PORTFOLIO).toMatch(/setPendingLocalUri\(null\)/);
  });

  it('BUG-PHASE107-01 — picker flow still uploads via uploadImages then mutates with the returned URL (regression guard)', () => {
    expect(PORTFOLIO).toMatch(/await uploadImages\(\[pendingLocalUri\], 'onboarding'\)/);
    expect(PORTFOLIO).toMatch(/addMutation\.mutate\(\{ imageUrl: url, caption:/);
  });
});
