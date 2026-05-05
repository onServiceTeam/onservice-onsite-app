// BUG-PHASE111-01 — admin ConsentVersionsPage's `todayLocalIso()`
// helper used `new Date().toISOString().slice(0, 10)`, which returns
// the UTC date. For an admin in Manila publishing late at night (e.g.
// 00:30 Manila Thursday = 16:30 UTC Wednesday), the effectiveDate
// field defaulted to "Wednesday" even though the admin saw the screen
// on "Thursday". Same Manila-tz pattern as Phases 105 and 109.
//
// Compliance-relevant: effectiveDate is the legally relevant field
// that determines when a consent version is in force for the
// active-users count and the audit trail. A DPO publishing a material
// consent change late on Wednesday Manila wanted "effective today
// (Wednesday)" but the system used UTC and the publish landed with
// "effective Tuesday" — a one-day shift in legal force.
//
// Fix: replace toISOString().slice with toLocaleDateString('en-CA',
// { timeZone: 'Asia/Manila' }), which produces the same YYYY-MM-DD
// output shape but in Manila TZ.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const CONSENT = readFileSync(
  resolve(__dirname, '../ConsentVersionsPage.tsx'),
  'utf8',
);

describe('BUG-PHASE111-01 — consent versions effective date defaults to Manila day', () => {
  it('BUG-PHASE111-01 — todayLocalIso uses toLocaleDateString with Asia/Manila timeZone', () => {
    expect(CONSENT).toMatch(
      /toLocaleDateString\('en-CA', \{ timeZone: 'Asia\/Manila' \}\)/,
    );
  });

  it('BUG-PHASE111-01 — pre-fix toISOString().slice(0, 10) UTC pattern is gone', () => {
    expect(CONSENT).not.toMatch(/new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  });

  it('BUG-PHASE111-01 — todayLocalIso function name preserved (regression guard)', () => {
    expect(CONSENT).toMatch(/function todayLocalIso\(\): string/);
  });

  it('BUG-PHASE111-01 — todayLocalIso still consumed by initial state + closePublishDialog reset (regression guard)', () => {
    // Two call sites in the original component. Make sure neither was
    // accidentally removed when the helper body was rewritten.
    const matches = CONSENT.match(/todayLocalIso\(\)/g);
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
