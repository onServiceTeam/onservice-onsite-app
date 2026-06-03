// Phase E CRIT-111 — provider/service-area.tsx now hits a real
// backend endpoint. Pre-fix: api.post('/api/v1/providers/me/service-area')
// returned 404 every time (the route doesn't exist). Post-fix:
// api.patch('/api/v1/providers/me') with the canonical schema
// fields (latitude / longitude / serviceRadiusKm).

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { FALLBACK_REGION } from '../src/hooks/useServiceAreaDefaults';

const SERVICE_AREA = readFileSync(
  resolve(__dirname, '../app/provider/service-area.tsx'),
  'utf8',
);

describe('Phase E CRIT-111 — service-area save uses canonical PATCH /me', () => {
  it('CRIT-111 — non-existent POST /me/service-area removed (header comment may mention it)', () => {
    expect(SERVICE_AREA).not.toMatch(/api\.post\(['"`]\/api\/v1\/providers\/me\/service-area/);
  });
  it('CRIT-111 — PATCH /api/v1/providers/me wired', () => {
    expect(SERVICE_AREA).toMatch(/api\.patch\(['"`]\/api\/v1\/providers\/me['"`]/);
  });
  it('CRIT-111 — payload uses canonical field names from updateProfileSchema', () => {
    expect(SERVICE_AREA).toMatch(/latitude: centerLat/);
    expect(SERVICE_AREA).toMatch(/longitude: centerLng/);
    expect(SERVICE_AREA).toMatch(/serviceRadiusKm: radiusKm/);
  });
  it('CRIT-111 — old payload field names removed', () => {
    expect(SERVICE_AREA).not.toMatch(/centerLat,\n\s+centerLng,\n\s+radiusKm/);
  });
  it('Multi-city — offline default map center (FALLBACK_REGION) is central Cebu City (default launch market)', () => {
    // The screen's offline default now derives from FALLBACK_REGION rather than
    // its own hardcoded literals; the live default comes from the admin-
    // configured service area. Assert the actual fallback value, not source text.
    expect(FALLBACK_REGION.latitude).toBeCloseTo(10.3157, 4);
    expect(FALLBACK_REGION.longitude).toBeCloseTo(123.8854, 4);
  });
  it('Multi-city — service-area screen sources its default center from FALLBACK_REGION (not a hardcoded city)', () => {
    expect(SERVICE_AREA).toMatch(/DEFAULT_LAT = FALLBACK_REGION\.latitude/);
    expect(SERVICE_AREA).toMatch(/useServiceAreaDefaults/);
  });
});
