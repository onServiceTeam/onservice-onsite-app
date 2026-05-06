// BUG-PHASE194-01 — provider complete screen Notes TextInput had
// no maxLength. The server-side completionNotes Zod validator caps
// at 2000. Same pattern as Phase 145's review-screen fix.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../app/provider/job/[id]/complete.tsx'),
  'utf8',
);

describe('BUG-PHASE194-01 — complete screen notes has maxLength=2000', () => {
  it('TextInput maxLength is 2000', () => {
    expect(SOURCE).toMatch(
      /maxLength=\{2000\}[\s\S]+?placeholder="Anything the customer should know/,
    );
  });

  it('shows char counter when notes is non-empty', () => {
    expect(SOURCE).toMatch(
      /\{notes\.length\s*>\s*0\s*&&[\s\S]+?\{notes\.length\}\/2000/,
    );
  });

  it('PHASE194-01 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE194-01 fix/);
  });
});
