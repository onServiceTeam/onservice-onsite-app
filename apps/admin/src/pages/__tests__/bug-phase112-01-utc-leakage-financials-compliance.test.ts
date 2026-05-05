// BUG-PHASE112-01 — UTC date leakage in two more admin surfaces:
//
// 1. apps/admin/src/pages/FinancialsPage.tsx — todayIso() and
//    daysAgoIso() defaulted the `from`/`to` date-range pickers to
//    UTC dates. For an admin in Manila opening the page at 00:30
//    Manila Thursday (= 16:30 UTC Wednesday), the default `to` was
//    Wednesday — Thursday's revenue rows were off-screen until the
//    admin manually pulled the date input one day forward. The
//    revenue / payouts / reconciliation / BIR Reports / Receipts
//    tabs all share the same `from`/`to` so the entire page showed
//    yesterday's window by default.
//
// 2. apps/admin/src/pages/CompliancePage.tsx (audit-log CSV export
//    at line ~621) — `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
//    named the downloaded file with the UTC date. A compliance
//    officer downloading at 00:30 Manila Thursday got a file named
//    `audit-log-2026-05-04.csv` while the page header showed
//    "Thursday, May 5". Searching the local Downloads folder by
//    filename for Thursday's export came up empty.
//
// Same Manila-tz pattern as Phases 105, 109, 111. Both fixes use
// toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) which
// returns the same YYYY-MM-DD shape but anchored to Manila.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FINANCIALS = readFileSync(
  resolve(__dirname, '../FinancialsPage.tsx'),
  'utf8',
);
const COMPLIANCE = readFileSync(
  resolve(__dirname, '../CompliancePage.tsx'),
  'utf8',
);

describe('BUG-PHASE112-01 — admin date defaults / export filenames anchored to Manila', () => {
  describe('FinancialsPage.tsx', () => {
    it('BUG-PHASE112-01 — todayIso uses toLocaleDateString with Asia/Manila', () => {
      // Just check the helper body line; both helpers use the same call.
      expect(FINANCIALS).toMatch(/toLocaleDateString\('en-CA', \{ timeZone: 'Asia\/Manila' \}\)/);
    });

    it('BUG-PHASE112-01 — pre-fix toISOString().slice(0, 10) inside the helpers is gone', () => {
      // Make sure neither todayIso nor daysAgoIso still calls toISOString.
      expect(FINANCIALS).not.toMatch(/return new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
      expect(FINANCIALS).not.toMatch(/return d\.toISOString\(\)\.slice\(0, 10\)/);
    });

    it('BUG-PHASE112-01 — both helpers still exposed (regression guard)', () => {
      expect(FINANCIALS).toMatch(/function todayIso\(\): string/);
      expect(FINANCIALS).toMatch(/function daysAgoIso\(n: number\): string/);
    });
  });

  describe('CompliancePage.tsx', () => {
    it('BUG-PHASE112-01 — audit-log CSV filename uses toLocaleDateString with Asia/Manila', () => {
      expect(COMPLIANCE).toMatch(
        /a\.download = `audit-log-\$\{new Date\(\)\.toLocaleDateString\('en-CA', \{ timeZone: 'Asia\/Manila' \}\)\}\.csv`/,
      );
    });

    it('BUG-PHASE112-01 — pre-fix toISOString().slice(0, 10) on the CSV filename is gone', () => {
      expect(COMPLIANCE).not.toMatch(/audit-log-\$\{new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\}/);
    });
  });
});
