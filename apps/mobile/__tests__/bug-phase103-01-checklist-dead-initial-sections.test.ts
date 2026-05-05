// BUG-PHASE103-01 — provider job checklist had a dead INITIAL_SECTIONS
// constant (~48 lines) plus its makeItem helper sitting at the top of
// the file. Pre-fix the screen fetched the canonical checklist from
// /api/v1/jobs/:id/checklist (Phase E CRIT-105), and useState was
// already initialized to []. Nothing read INITIAL_SECTIONS — but the
// constant still contained the very strings the CRIT-105 comment
// block calls out as the bug ("Living Room → Kitchen → Bedroom →
// Bathroom"). A future maintainer wiring the screen back to a fallback
// could grab the dead constant and re-introduce the pre-fix
// hardcoded-cleaning-only behavior on plumbing/electrical jobs.
//
// Fix: remove both the makeItem helper and the INITIAL_SECTIONS
// constant. Server data is now the only source of truth.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const CHECKLIST = readFileSync(
  resolve(__dirname, '../app/provider/job/[id]/checklist.tsx'),
  'utf8',
);

describe('BUG-PHASE103-01 — provider checklist dead INITIAL_SECTIONS removed', () => {
  it('BUG-PHASE103-01 — INITIAL_SECTIONS constant is gone', () => {
    expect(CHECKLIST).not.toMatch(/INITIAL_SECTIONS/);
  });

  it('BUG-PHASE103-01 — makeItem helper is gone (only consumer was the dead constant)', () => {
    expect(CHECKLIST).not.toMatch(/function makeItem\(/);
  });

  it('BUG-PHASE103-01 — pre-fix hardcoded "Living Room" + "Kitchen" + "Bathroom" + "Bedrooms" section titles are gone from the file', () => {
    expect(CHECKLIST).not.toMatch(/title: 'Living Room'/);
    expect(CHECKLIST).not.toMatch(/title: 'Kitchen'/);
    expect(CHECKLIST).not.toMatch(/title: 'Bathroom'/);
    expect(CHECKLIST).not.toMatch(/title: 'Bedrooms'/);
  });

  it('BUG-PHASE103-01 — pre-fix hardcoded item labels (vacuum/scrub-toilet/etc) are gone', () => {
    expect(CHECKLIST).not.toMatch(/'Vacuum floor'/);
    expect(CHECKLIST).not.toMatch(/'Scrub toilet'/);
  });

  it('BUG-PHASE103-01 — useState still initializes sections to [] (server is sole source)', () => {
    expect(CHECKLIST).toMatch(/useState<ChecklistSection\[\]>\(\[\]\)/);
  });

  it('BUG-PHASE103-01 — server fetch path still wired (regression guard)', () => {
    expect(CHECKLIST).toMatch(/\/api\/v1\/jobs\/\$\{id\}\/checklist/);
  });
});
