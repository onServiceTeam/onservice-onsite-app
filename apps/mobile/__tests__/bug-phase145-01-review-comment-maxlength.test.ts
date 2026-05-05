// BUG-PHASE145-01 — apps/mobile/app/customer/booking/review.tsx had
// two text inputs (public comment + privateNote) that displayed a
// "X / 1000 characters" hint suggesting a 1000-char cap, but neither
// passed `maxLength={1000}` to the underlying Input/TextInput. So a
// customer could type 1500 chars, see "1500 / 1000 characters" in
// the hint with no error, tap Submit, and get a generic 400 from
// the server's `comment.max(1000)` and `privateNote.max(1000)`
// validators (review.validators.ts:19, :24).
//
// Same client/server validation-mismatch family as Phase 142 / 143
// (admin reason-length gates) but on the mobile side. Fix: add
// `maxLength={1000}` to both Input components so the input hard-stops
// at the cap — the hint now matches reality.
//
// Test strategy: source-content regression on review.tsx. Behavioral
// path requires rendering the screen with input simulation —
// out of scope for a 1-line maxLength fix. Source-level assertion
// is the most direct way to catch a regression where someone strips
// the maxLength back out.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../app/customer/booking/review.tsx'),
  'utf8',
);

describe('BUG-PHASE145-01 — review comment + privateNote enforce 1000-char maxLength', () => {
  it('comment Input has maxLength={1000}', () => {
    // Match the comment Input block (label "Written Review (optional)")
    // and assert it contains maxLength={1000}.
    expect(SOURCE).toMatch(
      /label="Written Review \(optional\)"[\s\S]+?maxLength=\{1000\}/,
    );
  });

  it('privateNote Input has maxLength={1000}', () => {
    expect(SOURCE).toMatch(
      /label="Private Note to onService \(optional\)"[\s\S]+?maxLength=\{1000\}/,
    );
  });

  it('PHASE145 fix-comments are preserved (signposts)', () => {
    const matches = SOURCE.match(/BUG-PHASE145-01 fix/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it('regression guard: hint still says "X / 1000 characters" — semantics unchanged', () => {
    // The fix didn't change the hint text; just enforced the cap
    // the hint already implied. Make sure the hint format is intact.
    const hintMatches = SOURCE.match(/\$\{[a-zA-Z]+\.length\} \/ 1000 characters/g);
    expect(hintMatches).not.toBeNull();
    expect(hintMatches!.length).toBeGreaterThanOrEqual(2);
  });
});
