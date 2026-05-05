// BUG-PHASE91-01 — provider change-order form must enforce the 50%
// cap client-side and explain the limit accurately.
//
// Pre-fix the form had:
//   1. No knowledge of the original service_price, so no cap warning.
//   2. A bottom note that said "exceeding 50% may require admin
//      approval." There is no admin-approval path. The API
//      (booking.service.createChangeOrder, Phase 14 D05 Bug 1219)
//      rejects amounts >50% of service_price with HTTP 400.
//
// Result: a provider entering 60% would (a) believe they were just
// triggering an admin review, (b) wait through their photo upload,
// then (c) get a 400 error. The note misled them and the cap was
// invisible until submit time.
//
// Fix:
//  - useQuery getBookingById to read service_price.
//  - Render an inline cap line ("Maximum: ₱X (50% of …)").
//  - When amount exceeds the cap, switch the line to red and disable
//    the Submit button via isValid.
//  - Rewrite the bottom note so it matches the actual server rule
//    ("capped at 50%, larger amounts must be rebooked").

import { readFileSync } from 'fs';
import { resolve } from 'path';

const CHANGE_ORDER = readFileSync(
  resolve(__dirname, '../app/provider/job/[id]/change-order.tsx'),
  'utf8',
);

describe('BUG-PHASE91-01 — change-order form enforces the 50% cap', () => {
  it('BUG-PHASE91-01 — getBookingById is imported and used to fetch service price', () => {
    expect(CHANGE_ORDER).toMatch(/getBookingById/);
    expect(CHANGE_ORDER).toMatch(/queryKey:\s*\['booking',\s*bookingId\]/);
  });

  it('BUG-PHASE91-01 — fiftyPercentCap derived from booking.servicePrice', () => {
    expect(CHANGE_ORDER).toMatch(/bookingQuery\.data\?\.servicePrice/);
    expect(CHANGE_ORDER).toMatch(/fiftyPercentCap = Math\.floor\(servicePrice \* 0\.5\)/);
  });

  it('BUG-PHASE91-01 — exceedsCap blocks the Submit button via isValid', () => {
    expect(CHANGE_ORDER).toMatch(/exceedsCap = fiftyPercentCap > 0 && amountCentavos > fiftyPercentCap/);
    // isValid must include !exceedsCap so the disabled prop honors the cap.
    expect(CHANGE_ORDER).toMatch(/isValid =[\s\S]*?!exceedsCap/);
  });

  it('BUG-PHASE91-01 — pre-fix misleading "may require admin approval" note is gone', () => {
    expect(CHANGE_ORDER).not.toMatch(/may require admin approval/);
  });

  it('BUG-PHASE91-01 — note copy matches server behavior (no admin approval path)', () => {
    expect(CHANGE_ORDER).toMatch(/capped at 50%/i);
    expect(CHANGE_ORDER).toMatch(/rebooked/i);
  });

  it('BUG-PHASE91-01 — inline cap line uses red styling when exceeded', () => {
    // The amount-input section renders the cap line; it must conditionally
    // switch to colors.error when exceedsCap is true.
    expect(CHANGE_ORDER).toMatch(/exceedsCap && \{ color: colors\.error/);
  });
});
