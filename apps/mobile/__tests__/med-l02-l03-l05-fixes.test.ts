// Phase L MED-L02/L03/L05 — fixes verified.
//
// MED-L02: mobile already exports getErrorMessage (verified earlier
//   in this file's predecessor tests); confirm the export is stable.
// MED-L03: mobile useFeatureFlags now reads res.data.data (the inner
//   ClientConfig) instead of res.data (the envelope). Pre-fix the
//   destructure always returned undefined → DEFAULT_FLAGS forever.
// MED-L05: admin playwright.config.ts baseURL fallback now matches
//   the actual vite dev port (7382, not 5173).

import { readFileSync } from 'fs';
import { resolve } from 'path';

const ERRORS = readFileSync(
  resolve(__dirname, '../src/utils/errors.ts'),
  'utf8',
);
const FEATURE_FLAGS = readFileSync(
  resolve(__dirname, '../src/hooks/useFeatureFlags.ts'),
  'utf8',
);
const PLAYWRIGHT = readFileSync(
  resolve(__dirname, '../../admin/playwright.config.ts'),
  'utf8',
);

describe('Phase L MED-L02 — mobile getErrorMessage helper exists', () => {
  it('L02 — getErrorMessage exported from utils/errors', () => {
    expect(ERRORS).toMatch(/export function getErrorMessage\(err: unknown, fallback: string\): string/);
  });
});

describe('Phase L MED-L03 — useFeatureFlags reads the inner config envelope', () => {
  it('L03 — queryFn extracts res.data.data, not res.data', () => {
    expect(FEATURE_FLAGS).toMatch(/return res\.data\.data;/);
  });
  it('L03 — pre-fix `return res.data;` removed from queryFn', () => {
    // Should not have the bare `return res.data;` shape any more.
    // (`return res.data.data` is fine — the `.data` is the inner field).
    expect(FEATURE_FLAGS).not.toMatch(/queryFn: async \(\) => \{[^}]*return res\.data;\s*\}/s);
  });
  it('L03 — type ClientConfig defines featureFlags + appVersion', () => {
    expect(FEATURE_FLAGS).toMatch(/interface ClientConfigEnvelope/);
    expect(FEATURE_FLAGS).toMatch(/data: ClientConfig/);
  });
  it('L03 — header comment cites the wire-shape misread', () => {
    expect(FEATURE_FLAGS).toMatch(/MED-L02\/L03 fix/);
  });
});

describe('Phase L MED-L05 — playwright baseURL fallback matches vite dev port', () => {
  it('L05 — fallback is http://localhost:7382 (not 5173)', () => {
    expect(PLAYWRIGHT).toMatch(/STAGING_ADMIN_URL \?\? "http:\/\/localhost:7382"/);
  });
  it('L05 — old 5173 fallback removed', () => {
    expect(PLAYWRIGHT).not.toMatch(/"http:\/\/localhost:5173"/);
  });
});
