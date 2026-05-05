// BUG-PHASE169-01 — apps/mobile/app/(tabs)/home.tsx Active Booking
// section was hardcoded singular and `slice(0, 1)`-capped — only
// ever showed the FIRST active booking. If a customer had 2+ active
// bookings (e.g., paid booking with provider en route AND a matched
// booking waiting), the second was invisible from home.
//
// Fix:
//   - Show up to 3 active bookings (slice(0, 3))
//   - Section title singular when 1, plural when 2+
//   - "See all >" link to (tabs)/bookings when count > 3
//
// UX gap, not a server-side bug. Real but non-launch-blocking.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../app/(tabs)/home.tsx'),
  'utf8',
);

describe('BUG-PHASE169-01 — home shows multiple active bookings', () => {
  it('slices to 3 (not 1)', () => {
    expect(SOURCE).toMatch(/activeBookings\.slice\(0, 3\)\.map/);
  });

  it('regression guard: pre-fix slice(0, 1) is gone for activeBookings', () => {
    expect(SOURCE).not.toMatch(/activeBookings\.slice\(0, 1\)\.map/);
  });

  it('section title pluralizes based on count', () => {
    expect(SOURCE).toMatch(
      /activeBookings\.length === 1 \? 'Active Booking' : 'Active Bookings'/,
    );
  });

  it('shows See all > link when more than 3 active', () => {
    expect(SOURCE).toMatch(
      /activeBookings\.length > 3[\s\S]+?Routes\.TABS\.BOOKINGS[\s\S]+?See all/,
    );
  });

  it('PHASE169 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE169-01 fix/);
  });
});
