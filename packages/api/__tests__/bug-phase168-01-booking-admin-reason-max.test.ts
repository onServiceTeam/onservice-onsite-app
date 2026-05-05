// BUG-PHASE168-01 — booking-admin.service.ts requireReason helper
// validated reason >= minLength but had no max cap. The helper feeds
// reason into admin_actions.full_notes (TEXT, unbounded) across 5
// booking-admin actions (manualReleaseEscrow, refundFromEscrow,
// reassignBookingProvider, cancelBookingAsAdmin, forceCompleteBooking).
//
// One-line fix in the helper caps all 5 callers at once.
//
// Same defense-in-depth pattern as Phase 152-167. Cap at 5000.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../src/services/booking-admin.service.ts'),
  'utf8',
);

describe('BUG-PHASE168-01 — requireReason caps at 5000 chars', () => {
  it('declares REASON_MAX_LENGTH = 5000', () => {
    expect(SOURCE).toMatch(/REASON_MAX_LENGTH = 5000/);
  });

  it('requireReason rejects > REASON_MAX_LENGTH', () => {
    expect(SOURCE).toMatch(
      /trimmed\.length > REASON_MAX_LENGTH[\s\S]+?reason must be ≤ \$\{REASON_MAX_LENGTH\} characters/,
    );
  });

  it('PHASE168 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE168-01 fix/);
  });
});
