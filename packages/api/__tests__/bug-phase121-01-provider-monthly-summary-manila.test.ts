// BUG-PHASE121-01 — provider monthly-summary endpoint
// (GET /providers/me/monthly-summary) defaulted year/month to
// device-local UTC. Server runs UTC, so a provider opening
// "this month's summary" at 01:00 Manila June 1 (= 17:00 UTC May 31)
// got safeMonth=5 (May UTC) instead of 6 (June Manila) — they saw
// May's summary even though their wall-clock said June. Same
// applies on Jan 1 — a provider opening on Jan 1 morning Manila
// (Dec 31 UTC) would see December's summary by default.
//
// Same Manila-tz pattern as Phases 105/113/115/116/117/118/119/120.
// Anchor to Manila year/month so the default matches the calendar
// month the provider is currently looking at.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const PROVIDER_ROUTES = readFileSync(
  resolve(__dirname, '../src/routes/provider.routes.ts'),
  'utf8',
);

describe('BUG-PHASE121-01 — provider monthly-summary defaults to Manila year/month', () => {
  it('BUG-PHASE121-01 — manilaYM extracted via Asia/Manila', () => {
    expect(PROVIDER_ROUTES).toMatch(
      /const manilaYM = now\.toLocaleDateString\('en-CA', \{ timeZone: 'Asia\/Manila' \}\)/,
    );
  });

  it('BUG-PHASE121-01 — manilaYear + manilaMonth derived from the Manila YYYY-MM-DD slice', () => {
    expect(PROVIDER_ROUTES).toMatch(/const manilaYear = Number\(manilaYM\.slice\(0, 4\)\);/);
    expect(PROVIDER_ROUTES).toMatch(/const manilaMonth = Number\(manilaYM\.slice\(5, 7\)\);/);
  });

  it('BUG-PHASE121-01 — safeYear default falls back to manilaYear (not now.getFullYear())', () => {
    expect(PROVIDER_ROUTES).toMatch(/\?\s*Math\.floor\(requestedYear\)\s*:\s*manilaYear;/);
  });

  it('BUG-PHASE121-01 — safeMonth default falls back to manilaMonth (not now.getMonth() + 1)', () => {
    expect(PROVIDER_ROUTES).toMatch(/\?\s*Math\.floor\(requestedMonth\)\s*:\s*manilaMonth;/);
  });

  it('BUG-PHASE121-01 — safeYear upper bound uses manilaYear + 1 (not now.getFullYear() + 1)', () => {
    expect(PROVIDER_ROUTES).toMatch(/requestedYear <= manilaYear \+ 1/);
  });

  it('BUG-PHASE121-01 — pre-fix `now.getFullYear()` and `now.getMonth() + 1` defaults are gone from the handler', () => {
    // The block that sets safeYear/safeMonth must not reference
    // now.getFullYear() or now.getMonth() in the fallback paths.
    const block = PROVIDER_ROUTES.match(/const requestedYear[\s\S]+?const summary = await/);
    expect(block).not.toBeNull();
    expect(block?.[0]).not.toMatch(/: now\.getFullYear\(\);/);
    expect(block?.[0]).not.toMatch(/: now\.getMonth\(\) \+ 1;/);
    expect(block?.[0]).not.toMatch(/<= now\.getFullYear\(\) \+ 1/);
  });

  it('BUG-PHASE121-01 — MED-N98 sanity floor of 2024 preserved (regression guard)', () => {
    expect(PROVIDER_ROUTES).toMatch(/requestedYear >= 2024/);
  });
});
