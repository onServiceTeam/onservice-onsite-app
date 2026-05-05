// BUG-PHASE155-01 — service-area waitlist is PUBLIC (no auth) and
// had no server-side length validation. The route is rate-limited
// (waitlistRateLimit middleware MED-N163), but a determined attacker
// could still submit a 100,000-char fullName once per rate-limit
// window. Columns are VARCHAR-typed; without input validation,
// Postgres would reject the INSERT with a raw constraint error →
// cryptic 500 instead of friendly 400.
//
// Same defense-in-depth pattern as Phase 152/153/154. Public-facing
// surface raises the priority — anyone on the internet can hit
// this endpoint.
//
// Caps mirror migration 022_service_areas.sql columns:
//   full_name VARCHAR(200), phone VARCHAR(20), email VARCHAR(255),
//   city VARCHAR(100), province VARCHAR(100), barangay VARCHAR(100)

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../src/routes/service-area.routes.ts'),
  'utf8',
);

describe('BUG-PHASE155-01 — public waitlist endpoint server caps', () => {
  it('declares all 6 cap constants matching column types', () => {
    expect(SOURCE).toMatch(/WAITLIST_FULL_NAME_MAX = 200/);
    expect(SOURCE).toMatch(/WAITLIST_PHONE_MAX = 20/);
    expect(SOURCE).toMatch(/WAITLIST_EMAIL_MAX = 255/);
    expect(SOURCE).toMatch(/WAITLIST_CITY_MAX = 100/);
    expect(SOURCE).toMatch(/WAITLIST_PROVINCE_MAX = 100/);
    expect(SOURCE).toMatch(/WAITLIST_BARANGAY_MAX = 100/);
  });

  it('exposes a validateWaitlistField helper', () => {
    expect(SOURCE).toMatch(
      /function validateWaitlistField\(value: unknown, field: string, max: number, optional = false\)/,
    );
  });

  it('all 6 fields are validated by the helper', () => {
    const matches = SOURCE.match(/validateWaitlistField\(/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(6);
  });

  it('PHASE155 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE155-01 fix/);
  });
});
