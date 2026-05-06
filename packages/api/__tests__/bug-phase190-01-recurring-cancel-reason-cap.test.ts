// BUG-PHASE190-01 — cancelRecurringBooking accepted unbounded
// reason. Same server-cap shape as Phase 152-168 + 179-181 + 188-189.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../src/services/recurring.service.ts'),
  'utf8',
);

describe('BUG-PHASE190-01 — recurring cancel reason capped at 500', () => {
  it('caps reason at 500 chars', () => {
    expect(SOURCE).toMatch(
      /reason\.length\s*>\s*500[\s\S]+?cannot exceed 500 characters/,
    );
  });

  it('PHASE190-01 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE190-01 fix/);
  });
});
