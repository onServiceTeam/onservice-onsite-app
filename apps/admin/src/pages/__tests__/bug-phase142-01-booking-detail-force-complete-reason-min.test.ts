// BUG-PHASE142-01 — BookingDetailPage's super-admin actions panel
// gated all five mutations (release / refund / reassign / cancel /
// force-complete) behind a single `reasonOk = reason.trim().length >= 10`
// check. That works for 4 of the 5 actions (release/refund/cancel
// require 10 chars server-side; reassign requires 5).
//
// But the server's force-complete validator is stricter:
//   booking-admin.service.ts:984 → requireReason(reason, 20)
//
// So an admin typing a 10-19 character reason on the force-complete
// dialog passed the client check, hit the server, and got a generic
// 400 with no clear message about the 20-char floor. Same client/server
// validation-mismatch pattern as BUG-PHASE77-02 (cancel was 5/10
// pre-fix). Now: separate `reasonOkForce` gate that matches the
// server's 20-char floor + label hint that explains the higher bar.
//
// Test strategy: source-content regression. The full behavioral test
// (typing 15 chars, seeing button stay disabled, typing 20+ chars,
// seeing button enable) requires rendering the full BookingDetailPage
// with a query mock + super-admin auth state. Source-level assertion
// is the most direct way to prove the fix and catch a regression
// where someone collapses `reasonOkForce` back into `reasonOk`.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(
  resolve(__dirname, '../BookingDetailPage.tsx'),
  'utf8',
);

describe('BUG-PHASE142-01 — BookingDetailPage force-complete uses 20-char gate', () => {
  it('introduces a separate reasonOkForce gate (>= 20 chars)', () => {
    expect(SOURCE).toMatch(/const\s+reasonOkForce\s*=\s*reason\.trim\(\)\.length\s*>=\s*20/);
  });

  it('keeps the 10-char reasonOk gate for the other 4 actions', () => {
    expect(SOURCE).toMatch(/const\s+reasonOk\s*=\s*reason\.trim\(\)\.length\s*>=\s*10/);
  });

  it('force-complete button uses reasonOkForce (not reasonOk)', () => {
    // Match the force_complete branch and assert the disabled prop
    // gates on `!reasonOkForce`.
    expect(SOURCE).toMatch(
      /open === 'force_complete'[\s\S]+?disabled=\{!reasonOkForce \|\| forceMut\.isPending\}/,
    );
  });

  it('regression guard: force-complete button no longer gates on reasonOk', () => {
    // The pre-fix shape was `disabled={!reasonOk || forceMut.isPending}`
    // for the force_complete branch. Make sure that exact pairing is
    // gone (i.e., `forceMut` is not adjacent to `!reasonOk` anymore).
    expect(SOURCE).not.toMatch(/disabled=\{!reasonOk \|\| forceMut\.isPending\}/);
  });

  it('label hint surfaces the 20-char floor when force_complete is open', () => {
    // The reason textarea label now branches on the open mode. When
    // force_complete, it says "min 20 characters".
    expect(SOURCE).toMatch(/open === 'force_complete'\s*\?\s*'Reason \(min 20 characters/);
  });
});
