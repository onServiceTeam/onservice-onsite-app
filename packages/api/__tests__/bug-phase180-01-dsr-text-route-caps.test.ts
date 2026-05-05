// BUG-PHASE180-01 — DSR action routes (request-info, reject, escalate)
// silently truncated overlong reason/infoNeeded via service-level
// slice(0, 500). Same server-cap shape as Phase 152-168 + Phase 179.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../src/routes/compliance-admin.routes.ts'),
  'utf8',
);

describe('BUG-PHASE180-01 — DSR text fields have explicit route caps', () => {
  it('defines DSR_TEXT_MAX = 5000 and validateDsrText helper', () => {
    expect(SOURCE).toMatch(/DSR_TEXT_MAX\s*=\s*5000/);
    expect(SOURCE).toMatch(/function\s+validateDsrText/);
  });

  it('applies validateDsrText to infoNeeded in request-info route', () => {
    expect(SOURCE).toMatch(
      /infoNeeded[\s\S]+?validateDsrText\(infoNeeded[\s\S]+?requestDsrMoreInfo/,
    );
  });

  it('applies validateDsrText to reason in reject route', () => {
    expect(SOURCE).toMatch(
      /reason\s*=[\s\S]+?validateDsrText\(reason[\s\S]+?rejectDsr/,
    );
  });

  it('caps npcReference at 200 chars in escalate route', () => {
    expect(SOURCE).toMatch(
      /npcReference[\s\S]+?length\s*>\s*200[\s\S]+?cannot exceed 200/,
    );
  });

  it('PHASE180-01 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE180-01 fix/);
  });
});
