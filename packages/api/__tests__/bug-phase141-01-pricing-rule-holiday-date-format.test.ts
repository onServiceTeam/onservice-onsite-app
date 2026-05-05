// BUG-PHASE141-01 — pricing.service.ts:formatPricingRule did
// `r.holiday_date ? String(r.holiday_date).split('T')[0] : null`
// to convert the DATE column to a YYYY-MM-DD string for the admin
// front-end.
//
// Pg-node's default DATE parser returns a JS Date object (UTC midnight
// of the calendar date). `String(date)` calls `Date.prototype.toString()`
// which returns the runtime-local human format like
// "Fri Dec 25 2026 00:00:00 GMT+0000 (Coordinated Universal Time)" —
// with NO 'T' character. `.split('T')[0]` on that returns the WHOLE
// human string instead of the date.
//
// Net effect: the admin Pricing Rules page table row for a holiday
// rule renders the rule's date as a long human-readable timestamp
// instead of "2026-12-25". Found while deep-auditing the page.
//
// Test verifies the Date.toString() output has no 'T' (so the .split
// approach is broken) AND verifies the post-fix shape produces the
// expected YYYY-MM-DD output.

import { formatPricingRule } from '../src/services/pricing.service';

interface PartialPricingRow {
  id: string;
  name: string;
  type: 'rush' | 'holiday' | 'peak_hours';
  multiplier: string;
  rush_hours_threshold: number | null;
  holiday_date: Date | string | null;
  peak_start_time: string | null;
  peak_end_time: string | null;
  peak_days_of_week: number[] | null;
  category_id: string | null;
  service_area_id: string | null;
  is_active: boolean;
  priority: number;
  platform_surge_share: string;
  description: string;
  created_at: Date;
  updated_at: Date;
}

function row(holidayDate: Date | string | null): PartialPricingRow {
  return {
    id: 'rule-1',
    name: 'Christmas',
    type: 'holiday',
    multiplier: '1.5',
    rush_hours_threshold: null,
    holiday_date: holidayDate,
    peak_start_time: null,
    peak_end_time: null,
    peak_days_of_week: null,
    category_id: null,
    service_area_id: null,
    is_active: true,
    priority: 0,
    platform_surge_share: '0.5',
    description: 'Holiday rule',
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
  };
}

describe('BUG-PHASE141-01 — formatPricingRule renders holidayDate as YYYY-MM-DD', () => {
  it('precondition: Date.toString().split("T")[0] does not return YYYY-MM-DD (proves the broken approach)', () => {
    // Pre-fix used `String(date).split('T')[0]`. Date.toString() varies
    // by runtime — on some Node.js builds the timezone label contains
    // 'T' (e.g. "(Coordinated Universal **T**ime)" or "(Singapore
    // Standard **T**ime)"), so the split happens at the wrong place.
    // Either way the result is NEVER a clean "YYYY-MM-DD" — that's
    // the bug the fix repairs.
    const d = new Date(Date.UTC(2026, 11, 25));
    const broken = String(d).split('T')[0];
    expect(broken).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('Date object input is rendered as YYYY-MM-DD', () => {
    // pg-node returns DATE columns as Date objects (UTC midnight).
    const out = formatPricingRule(row(new Date(Date.UTC(2026, 11, 25))) as never);
    expect(out.holidayDate).toBe('2026-12-25');
  });

  it('string input is rendered as YYYY-MM-DD (path through ISO normalization)', () => {
    // Defensive: even if pg returns a string at some point.
    const out = formatPricingRule(row('2026-12-25') as never);
    expect(out.holidayDate).toBe('2026-12-25');
  });

  it('null input remains null', () => {
    const out = formatPricingRule(row(null) as never);
    expect(out.holidayDate).toBeNull();
  });

  it('Date object representing UTC midnight Jan 1 renders as 2026-01-01 (not 2025-12-31 from local TZ skew)', () => {
    // Manila-side admin should not see the holiday date drift across
    // a calendar boundary because of TZ. UTC midnight of Jan 1 is
    // Jan 1 in any TZ from -00:00 to +23:59 if using getUTC dates.
    const out = formatPricingRule(row(new Date(Date.UTC(2026, 0, 1))) as never);
    expect(out.holidayDate).toBe('2026-01-01');
  });
});
