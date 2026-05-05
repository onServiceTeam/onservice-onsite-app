// BUG-PHASE135-01 — invoice.service.ts:generateMonthlyInvoices had a
// timestamptz comparison cast at the session TZ (UTC).
//
// The JS-side periodStart/periodEnd were already Manila-anchored
// (Phase 118 fix at L133-143 — uses
// `now.toLocaleDateString('en-CA', {timeZone:'Asia/Manila'})` to
// derive the Manila wall-clock month bounds), but the SQL was:
//
//   AND b.scheduled_at >= $1::date
//   AND b.scheduled_at < ($2::date + INTERVAL '1 day')
//
// `b.scheduled_at` is timestamptz. `$N::date` (without TZ) casts at
// session TZ (UTC), so the comparison happens at UTC midnight = 08:00
// Manila. Net effect: the JS-side correctly resolves "last month" as
// the Manila wall-clock month, but the SQL filter then shifts the
// window by +8 hours, dropping the first 8 hours of the period-start
// day in Manila and including the first 8 hours of the next-month
// day — silently mis-billing every period boundary.
//
// Same Manila TZ correction shape as Phases 132 (marketing filters),
// 133 (audit-log filters), 134 (provider monthly earnings).
//
// Test strategy: source-content regression on the period_bookings CTE.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SVC = readFileSync(
  resolve(__dirname, '../src/services/invoice.service.ts'),
  'utf8',
);

describe('BUG-PHASE135-01 — business invoice period filter Manila-anchored', () => {
  it('period_bookings CTE uses Manila-anchored half-open interval on scheduled_at', () => {
    expect(SVC).toMatch(/b\.scheduled_at >= \(\$1::date AT TIME ZONE 'Asia\/Manila'\)/);
    expect(SVC).toMatch(
      /b\.scheduled_at < \(\(\$2::date \+ INTERVAL '1 day'\) AT TIME ZONE 'Asia\/Manila'\)/,
    );
  });

  it('regression guard: bare `b.scheduled_at >= $1::date` shape is gone', () => {
    expect(SVC).not.toMatch(/b\.scheduled_at >= \$1::date(?! AT TIME ZONE)/);
    expect(SVC).not.toMatch(/b\.scheduled_at < \(\$2::date \+ INTERVAL '1 day'\)(?! AT TIME ZONE)/);
  });

  it('regression guard: JS-side Manila resolution preserved (Phase 118 fix)', () => {
    // generateMonthlyInvoices uses Manila wall-clock to derive the
    // billing month — make sure that fix wasn't accidentally undone.
    expect(SVC).toMatch(
      /toLocaleDateString\('en-CA',\s*\{\s*timeZone:\s*'Asia\/Manila'\s*\}\)/,
    );
  });

  it('regression guard: business_invoices.billing_period_* DATE comparison is unchanged (DATE column, no TZ needed)', () => {
    // billing_period_start / billing_period_end on business_invoices
    // are DATE columns (not timestamptz). DATE-vs-DATE comparison
    // doesn't need Manila anchoring. The earlier query at L156-157
    // is still `bi.billing_period_start = $1::date` — keep it.
    expect(SVC).toMatch(/bi\.billing_period_start = \$1::date/);
    expect(SVC).toMatch(/bi\.billing_period_end = \$2::date/);
  });
});
