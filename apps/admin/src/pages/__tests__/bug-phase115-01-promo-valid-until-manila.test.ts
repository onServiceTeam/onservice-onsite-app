// BUG-PHASE115-01 — admin MarketingPage promo `validUntil` was
// stamped with `T23:59:59Z` (UTC midnight - 1 second). For a Manila
// admin entering "Valid until 2026-05-31", the suffix made the promo
// expire at 2026-05-31T23:59:59 UTC = 2026-06-01T07:59:59+08:00
// Manila — effectively giving the promo 8 extra hours of validity
// into the morning of the following Manila day. Customers booking
// before 8 AM on June 1 could still apply a "May only" promo. Same
// Manila-tz pattern as Phase 105 (calendar) and Phase 113 (recurring
// cron), but on the WRITE side: this is the value the API persists,
// so the leak is durable rather than just cosmetic.
//
// Two call sites — CreatePromoDialog and EditPromoDialog — both
// fixed. Anchoring to +08:00 makes "valid until day X" mean what the
// admin typed: midnight-end-of-day Manila.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MARKETING = readFileSync(
  resolve(__dirname, '../MarketingPage.tsx'),
  'utf8',
);

describe('BUG-PHASE115-01 — promo validUntil anchored to Manila, not UTC', () => {
  it('BUG-PHASE115-01 — both call sites use +08:00 Manila offset', () => {
    const matches = MARKETING.match(/`\$\{[^}]+\.validUntil\}T23:59:59\+08:00`/g);
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('BUG-PHASE115-01 — neither call site still uses Z (UTC) suffix', () => {
    expect(MARKETING).not.toMatch(/`\$\{[^}]+\.validUntil\}T23:59:59Z`/);
  });

  it('BUG-PHASE115-01 — wiring through to API body.validUntil preserved (regression guard)', () => {
    expect(MARKETING).toMatch(/body\.validUntil = `\$\{input\.validUntil\}T23:59:59\+08:00`/);
    expect(MARKETING).toMatch(/body\.validUntil = form\.validUntil \? `\$\{form\.validUntil\}T23:59:59\+08:00` : null/);
  });
});
