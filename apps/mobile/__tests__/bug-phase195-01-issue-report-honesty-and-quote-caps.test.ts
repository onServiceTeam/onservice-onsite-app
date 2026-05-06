// BUG-PHASE195-01 — provider checklist Report Issue button posted
// to a non-existent endpoint and faked a "saved locally" success.
// Escalation E05 documents the full backend build needed.
// This test proves the band-aid (Option C from E05) is in place —
// catch-block surfaces real error and TextInputs are bounded to
// match server reality.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const CHECKLIST = readFileSync(
  resolve(__dirname, '../app/provider/job/[id]/checklist.tsx'),
  'utf8',
);

const QUOTE = readFileSync(
  resolve(__dirname, '../app/provider/job/[id]/quote.tsx'),
  'utf8',
);

describe('BUG-PHASE195-01 — checklist issue-report honesty patch', () => {
  it('catch-block no longer fabricates "saved locally"', () => {
    expect(CHECKLIST).not.toMatch(
      /Issue saved locally; will sync when you are back online/,
    );
  });

  it('catch-block uses getErrorMessage with honest fallback', () => {
    expect(CHECKLIST).toMatch(
      /catch\s*\(err\)[\s\S]+?Could not send report[\s\S]+?getErrorMessage\(err/,
    );
  });

  it('issueText TextInput has maxLength=2000', () => {
    expect(CHECKLIST).toMatch(
      /value=\{issueText\}[\s\S]+?maxLength=\{2000\}/,
    );
  });

  it('PHASE195-01 fix-comment is preserved (checklist)', () => {
    expect(CHECKLIST).toMatch(/BUG-PHASE195-01 fix/);
  });
});

describe('BUG-PHASE195-01 — quote line-item TextInputs match server caps', () => {
  it('line-item description has maxLength=500', () => {
    expect(QUOTE).toMatch(
      /value=\{item\.description\}[\s\S]+?maxLength=\{500\}/,
    );
  });

  it('line-item unit has maxLength=30', () => {
    expect(QUOTE).toMatch(
      /value=\{item\.unit\}[\s\S]+?maxLength=\{30\}/,
    );
  });

  it('PHASE195-01 fix-comment is preserved (quote)', () => {
    expect(QUOTE).toMatch(/BUG-PHASE195-01 fix/);
  });
});
