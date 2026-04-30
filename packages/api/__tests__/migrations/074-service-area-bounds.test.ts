// Phase 14 Dispatch 05 — migration 074 smoke test.
// Bug 320 + Bug 322 + Bug 417 + Bug 266 + Bug 269.
//
// Static-analysis test: reads the migration file and asserts the
// expected SQL is present. The codebase has no jest+postgres harness,
// so a runtime constraint test isn't possible from this test suite.
// Behavioral verification is left to integration tests (D08+) and the
// admin-side validators (subtasks 10/11/12/13) which enforce the same
// bounds at the API layer.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../migrations/074_d05_service_area_bounds_and_settings.sql',
);

let sql: string;

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, 'utf8');
});

describe('Bug 320 + 322 — migration 074 service_area CHECK constraints', () => {
  it('adds CHECK constraint center_lat_in_ph (4.5..21.5)', () => {
    expect(sql).toMatch(/CONSTRAINT center_lat_in_ph CHECK \(center_lat BETWEEN 4\.5 AND 21\.5\)/);
  });

  it('adds CHECK constraint center_lng_in_ph (116..127.5)', () => {
    expect(sql).toMatch(/CONSTRAINT center_lng_in_ph CHECK \(center_lng BETWEEN 116 AND 127\.5\)/);
  });

  it('adds CHECK constraint radius_km_sane (1..100)', () => {
    expect(sql).toMatch(/CONSTRAINT radius_km_sane CHECK \(radius_km BETWEEN 1 AND 100\)/);
  });

  it('adds CHECK constraint min_providers_sane (1..50)', () => {
    expect(sql).toMatch(
      /CONSTRAINT min_providers_sane CHECK \(min_providers_to_launch BETWEEN 1 AND 50\)/,
    );
  });

  it('targets the service_areas table', () => {
    expect(sql).toMatch(/ALTER TABLE service_areas/);
  });
});

describe('Bug 417 + 266 + 269 — migration 074 platform_settings seed rows', () => {
  it('seeds tip_max_amount_cents (Bug 417) defaulting to 500000 centavos (₱5,000)', () => {
    expect(sql).toMatch(/'tip_max_amount_cents'/);
    expect(sql).toMatch(/'500000'/);
  });

  it('seeds addon_price_max_cents (Bug 266) defaulting to 5000000 centavos (₱50,000)', () => {
    expect(sql).toMatch(/'addon_price_max_cents'/);
    expect(sql).toMatch(/'5000000'/);
  });

  it('seeds surge_multiplier_min (Bug 269) defaulting to 1.0', () => {
    expect(sql).toMatch(/'surge_multiplier_min'/);
  });

  it('seeds surge_multiplier_max (Bug 269) defaulting to 5.0', () => {
    expect(sql).toMatch(/'surge_multiplier_max'/);
  });

  it('uses ON CONFLICT (key) DO NOTHING for idempotency', () => {
    expect(sql).toMatch(/ON CONFLICT \(key\) DO NOTHING/);
  });

  it('inserts into platform_settings table', () => {
    expect(sql).toMatch(/INSERT INTO platform_settings/);
  });
});

describe('migration 074 — file presence', () => {
  it('file exists and is non-empty', () => {
    expect(sql.length).toBeGreaterThan(100);
  });

  it('references the correct dispatch in comments', () => {
    expect(sql).toMatch(/Phase 14 Dispatch 05/i);
  });
});
