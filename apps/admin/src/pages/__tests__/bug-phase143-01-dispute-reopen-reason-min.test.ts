// BUG-PHASE143-01 — DisputeDetailPage's super-admin "Reopen" action
// validated reopenReason at >= 10 characters, but the server's
// dispute-admin.service.ts:reopenDispute calls
// `requireText(reason, 'reason', 20)` — requires 20 chars.
//
// Same client/server validation-mismatch pattern as:
//   - Phase 142-01 (booking force-complete: 10/20)
//   - Phase 77-02  (booking cancel: 5/10)
//
// Pre-fix: admin types 10-19 char reason → button enables → click →
// server returns generic 400 with no clear "needs 20 chars" message.
// Post-fix: client gate matches server floor; placeholder hint
// surfaces the higher bar.
//
// Test strategy: source-content regression. Behavioral path requires
// rendering the full DisputeDetailPage with super-admin auth + dispute
// query mocks. Source-level assertion is the most direct way to prove
// the gate matches the server and to catch a regression where someone
// reverts to `< 10`.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(
  resolve(__dirname, '../DisputeDetailPage.tsx'),
  'utf8',
);

describe('BUG-PHASE143-01 — DisputeDetailPage reopen uses 20-char gate', () => {
  it('reopen button gates on reopenReason.trim().length >= 20', () => {
    expect(SOURCE).toMatch(/reopenReason\.trim\(\)\.length\s*<\s*20/);
  });

  it('regression guard: reopen button no longer gates on < 10', () => {
    expect(SOURCE).not.toMatch(/reopenReason\.trim\(\)\.length\s*<\s*10/);
  });

  it('placeholder hint mentions the 20-character minimum', () => {
    expect(SOURCE).toMatch(/min 20 characters[^"]*?reopened|reopened[\s\S]{0,200}min 20 characters/);
  });

  it('PHASE143 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE143-01 fix/);
  });
});
