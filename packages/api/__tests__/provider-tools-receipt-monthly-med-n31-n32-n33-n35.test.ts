// MED-N31 + MED-N32 + MED-N33 + MED-N35 fix verified.
//
// MED-N31 was superseded by E50. Provider receipts now reproduce the
// immutable booking terms, behaviorally covered by bug-ops-254.
//
// MED-N32: founding-tier providers got platformConfig['new']
// commission via the `??` fallback because platformConfig
// didn't include 'founding'. D-J17 added it; settingsService
// also routes through the platform_settings 'commission_rate_founding'
// row (10% per migration 050).
//
// MED-N33: receipt number was `RCP-YYYYMM-<first-8-hex-of-uuid>`.
// 8-char UUID4 prefix has ~50% birthday-collision rate at ~77K
// bookings — very real for a launching marketplace. Two providers
// could get the same receipt number, breaking BIR's uniqueness
// requirement. Now uses the FULL booking UUID.
//
// MED-N35: getMonthlySummary status filter excluded
// 'completed_by_provider' AND keyed only off confirmed_at. A
// booking that completed near month-end but hadn't auto-confirmed
// would be silently dropped from the BIR monthly report. Now:
// includes 'completed_by_provider' AND uses
// COALESCE(confirmed_at, completed_at) so the date filter still
// works for not-yet-confirmed completions.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SVC = readFileSync(
  resolve(__dirname, '../src/services/provider-tools.service.ts'),
  'utf8',
);

describe('MED-N33 — receipt number uses full booking UUID, not 8-char prefix', () => {
  it('receiptNumber template uses bookingId.toUpperCase() with NO .slice(0, 8)', () => {
    const block = SVC.match(/const receiptNumber = `RCP-[\s\S]*?`;/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/bookingId\.toUpperCase\(\)/);
    expect(block![0]).not.toMatch(/bookingId\.slice\(0, 8\)/);
  });

  it('the YYYYMM prefix is preserved (regression guard)', () => {
    // BUG-PHASE120-01 — pre-fix the YYYYMM was extracted via
    // device-local getFullYear/getMonth. Now Manila-anchored via
    // toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) +
    // string slice. Both shapes preserve the RCP-YYYYMM-<uuid>
    // human-readable format.
    expect(SVC).toMatch(/RCP-\$\{manilaDateStr\.slice\(0, 4\)\}\$\{manilaDateStr\.slice\(5, 7\)\}/);
    expect(SVC).toMatch(/manilaDateStr = receiptDate\.toLocaleDateString\('en-CA', \{ timeZone: 'Asia\/Manila' \}\)/);
  });
});

describe('MED-N35 — getMonthlySummary includes completed_by_provider + COALESCE date filter', () => {
  it('status filter includes completed_by_provider', () => {
    // Anchor on the MED-N35 fix comment so we don't accidentally
    // match completed_by_provider in some other unrelated query.
    const block = SVC.match(/MED-N35 fix[\s\S]{0,800}'completed_by_provider'/);
    expect(block).not.toBeNull();
  });

  it('date filter uses COALESCE(b.confirmed_at, b.completed_at) — Manila-anchored half-open interval (BUG-PHASE134-01)', () => {
    // BUG-PHASE134-01 — pre-fix asserted the broken `::date` shape
    // without `AT TIME ZONE 'Asia/Manila'`, which compared at UTC
    // midnight = 08:00 Manila, shifting the monthly window by +8
    // hours and dropping/including the wrong jobs at month boundaries.
    // Now Manila-anchored.
    expect(SVC).toMatch(
      /COALESCE\(b\.confirmed_at, b\.completed_at\) >= \(\$2::date AT TIME ZONE 'Asia\/Manila'\)/,
    );
    expect(SVC).toMatch(
      /COALESCE\(b\.confirmed_at, b\.completed_at\) < \(\(\$3::date \+ INTERVAL '1 day'\) AT TIME ZONE 'Asia\/Manila'\)/,
    );
  });

  it('ORDER BY also uses COALESCE so completed-but-not-confirmed rows sort with their peers', () => {
    expect(SVC).toMatch(/ORDER BY COALESCE\(b\.confirmed_at, b\.completed_at\) ASC/);
  });
});
