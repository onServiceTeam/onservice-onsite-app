// BUG-PHASE158-01 — DPA breach-log routes had no length caps on
// 3 TEXT columns (scope, npc_reference, remediation_summary).
// All TEXT, all unbounded by Postgres. DPO-only access reduces
// attack surface but doesn't eliminate it — same defense-in-depth
// pattern as Phase 152-157.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../src/routes/breach-log.routes.ts'),
  'utf8',
);

describe('BUG-PHASE158-01 — breach-log server caps', () => {
  it('declares all 3 cap constants', () => {
    expect(SOURCE).toMatch(/BREACH_SCOPE_MAX = 2000/);
    expect(SOURCE).toMatch(/BREACH_NPC_REFERENCE_MAX = 100/);
    expect(SOURCE).toMatch(/BREACH_REMEDIATION_MAX = 5000/);
  });

  it('POST / rejects scope > 2000 chars', () => {
    expect(SOURCE).toMatch(/scope\.length > BREACH_SCOPE_MAX/);
  });

  it('POST /notify-npc rejects npcReference > 100 chars', () => {
    expect(SOURCE).toMatch(/npcReference\.length > BREACH_NPC_REFERENCE_MAX/);
  });

  it('PATCH /status rejects remediationSummary > 5000 chars', () => {
    expect(SOURCE).toMatch(
      /remediationSummary\.length > BREACH_REMEDIATION_MAX/,
    );
  });

  it('PHASE158 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE158-01 fix/);
  });
});
