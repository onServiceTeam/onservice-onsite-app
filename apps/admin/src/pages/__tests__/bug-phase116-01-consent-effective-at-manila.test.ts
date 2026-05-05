// BUG-PHASE116-01 — admin ConsentVersionsPage's publish dialog
// stamped the picked effective date with `T00:00:00Z` (UTC midnight).
// For a Manila DPO selecting "Effective Wednesday May 5", the value
// persisted to consent_versions.effective_at was 2026-05-05T00:00:00
// UTC = 2026-05-05T08:00:00+08:00 Manila — so customers booking
// between 00:00 and 08:00 Manila on May 5 were still bound by the
// OLD consent version. For a material consent change with legal
// implications (NPC RA 10173), an 8-hour window of "wrong consent
// applied" is not OK; the in-force moment must match the Manila day
// the admin picked.
//
// Pairs with Phase 111 (todayLocalIso default fix on the same page).
// Phase 111 made the picker DEFAULT to the right Manila day; this
// phase makes the SUBMIT preserve that day end-to-end.
//
// Same Manila-tz pattern as Phase 105 (provider calendar) and Phase
// 115 (promo validUntil). Anchor to +08:00 so the in-force instant
// matches the Manila day the admin picked.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const CONSENT = readFileSync(
  resolve(__dirname, '../ConsentVersionsPage.tsx'),
  'utf8',
);

describe('BUG-PHASE116-01 — consent effective date stamps Manila midnight', () => {
  it('BUG-PHASE116-01 — effectiveAt uses +08:00 Manila offset', () => {
    expect(CONSENT).toMatch(
      /new Date\(effectiveDate \+ 'T00:00:00\+08:00'\)\.toISOString\(\)/,
    );
  });

  it('BUG-PHASE116-01 — pre-fix UTC Z suffix is gone from the effectiveDate stamp', () => {
    expect(CONSENT).not.toMatch(/new Date\(effectiveDate \+ 'T00:00:00Z'\)\.toISOString\(\)/);
  });

  it('BUG-PHASE116-01 — fallback to "now" when no date picked still works (regression guard)', () => {
    // The fallback `new Date().toISOString()` is correct as-is
    // because Date#toISOString returns the UTC instant at the moment
    // the admin clicked. That instant maps to the SAME absolute
    // moment regardless of timezone — which is exactly what we want
    // when the admin asked for "right now."
    expect(CONSENT).toMatch(/: new Date\(\)\.toISOString\(\),/);
  });

  it('BUG-PHASE116-01 — publishMutation still wired (regression guard)', () => {
    expect(CONSENT).toMatch(/publishMutation\.mutate\(\{/);
  });
});
