// BUG-PHASE99-01 — admin CompliancePage Regulatory Reports tab no
// longer makes a stale "ETA Phase 14" promise.
//
// Pre-fix the Generate button toasted "Regulatory posture report
// not yet implemented — ETA Phase 14." Phase 14 (and its D14
// dispatches) shipped weeks before this audit; the ETA was stale.
// Operators saw a date-stamped promise of a feature that was
// already past its quoted milestone.
//
// Fix: copy refreshed to reflect that the report is v1.1+ and that
// the underlying data is already exportable from Audit Log +
// Financials → BIR Reports for the v1.0 launch. No baked-in ETA
// that will rot again.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const COMPLIANCE = readFileSync(
  resolve(__dirname, '../CompliancePage.tsx'),
  'utf8',
);

describe('BUG-PHASE99-01 — Regulatory Reports tab drops the stale ETA', () => {
  it('BUG-PHASE99-01 — pre-fix "ETA Phase 14" string is gone', () => {
    expect(COMPLIANCE).not.toMatch(/ETA Phase 14/);
  });

  it('BUG-PHASE99-01 — pre-fix toast wording "not yet implemented" is gone', () => {
    expect(COMPLIANCE).not.toMatch(/Regulatory posture report not yet implemented/);
  });

  it('BUG-PHASE99-01 — copy points operators at the existing v1.0 surfaces', () => {
    // The new toast / paragraph must direct admins to Audit Log +
    // Financials → BIR Reports as the v1.0 escape hatch.
    expect(COMPLIANCE).toMatch(/v1\.1\+/);
    expect(COMPLIANCE).toMatch(/Audit Log/);
    expect(COMPLIANCE).toMatch(/Financials → BIR Reports/);
  });
});
