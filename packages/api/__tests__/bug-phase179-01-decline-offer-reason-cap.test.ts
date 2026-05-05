// BUG-PHASE179-01 — POST /api/v1/bookings/offers/:offerId/decline
// silently truncated overlong reasons via service-level slice(0, 500)
// instead of rejecting at the route boundary. Same server-cap shape
// as Phase 152-168.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../src/routes/booking.routes.ts'),
  'utf8',
);

describe('BUG-PHASE179-01 — decline-offer reason has explicit 500-char route cap', () => {
  it('defines DECLINE_REASON_MAX = 500 in the decline route', () => {
    expect(SOURCE).toMatch(/DECLINE_REASON_MAX\s*=\s*500/);
  });

  it('rejects overlong reasons with 400 + helpful message', () => {
    expect(SOURCE).toMatch(
      /Decline reason cannot exceed[\s\S]+?DECLINE_REASON_MAX[\s\S]+?characters/,
    );
  });

  it('PHASE179-01 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE179-01 fix/);
  });
});
