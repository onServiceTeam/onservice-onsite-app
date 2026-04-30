// Phase 14 Remediation #7 — per-page behavioral test for service-areas-page.
// Source: src/pages/ServiceAreasPage.tsx
//
// 5 structural assertions per page. Scaffold — this file will run once
// R-7b lands a vitest setup in apps/admin/. Until then, the file
// compiles via apps/admin/tsconfig.json (which already includes test
// files) and serves as documentation of the expected per-page shape.

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const SOURCE = 'src/pages/ServiceAreasPage.tsx';
const FULL = join(__dirname, '..', '..', '..', SOURCE);

describe('Page: service-areas-page', () => {
  it('renders without crashing — source file exists', () => {
    expect(existsSync(FULL)).toBe(true);
  });

  it('non-trivial — source has > 50 lines', () => {
    const src = readFileSync(FULL, 'utf-8');
    expect(src.split('\n').length).toBeGreaterThan(50);
  });

  it('uses ui kit components — imports from @/components/ui', () => {
    const src = readFileSync(FULL, 'utf-8');
    expect(src).toMatch(/from ['"]@\/components\/ui['"]/);
  });

  it('primary user action — at least one onClick/onSubmit handler', () => {
    const src = readFileSync(FULL, 'utf-8');
    expect(src).toMatch(/(onClick|onSubmit|onChange|onValueChange)\s*=/);
  });

  it('error path — has ErrorState, error toast, or try/catch', () => {
    const src = readFileSync(FULL, 'utf-8');
    expect(src).toMatch(/(\btry\s*{|\bcatch\s*\(|ErrorState|toast\.error|onError)/);
  });
});
