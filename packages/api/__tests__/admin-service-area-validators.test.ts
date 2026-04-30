// Phase 14 Dispatch 05 — admin service-area validator tests
// (Bug 320 + Bug 322).

import {
  createServiceAreaSchema,
  updateServiceAreaSchema,
} from '../src/validators/admin-service-area.validators';

const valid = {
  name: 'Boracay',
  city: 'Malay',
  province: 'Aklan',
  region: 'Western Visayas',
  centerLat: 11.9694,
  centerLng: 121.9272,
  radiusKm: 10,
  minProvidersToLaunch: 5,
};

describe('Bug 320 — service area latitude bounds (PH 4.5..21.5)', () => {
  it('bug-320-ph-bounds: rejects latitude below 4.5', () => {
    expect(
      createServiceAreaSchema.safeParse({ ...valid, centerLat: 4.0 }).success,
    ).toBe(false);
  });

  it('rejects latitude above 21.5', () => {
    expect(
      createServiceAreaSchema.safeParse({ ...valid, centerLat: 22 }).success,
    ).toBe(false);
  });

  it('rejects latitude that previously slipped through (e.g., 14 NY area was OK before)', () => {
    expect(
      createServiceAreaSchema.safeParse({ ...valid, centerLat: 40.7 }).success,
    ).toBe(false);
  });

  it('accepts boundary latitude 4.5', () => {
    expect(
      createServiceAreaSchema.safeParse({ ...valid, centerLat: 4.5 }).success,
    ).toBe(true);
  });

  it('accepts boundary latitude 21.5', () => {
    expect(
      createServiceAreaSchema.safeParse({ ...valid, centerLat: 21.5 }).success,
    ).toBe(true);
  });
});

describe('Bug 320 — service area longitude bounds (PH 116..127.5)', () => {
  it('rejects longitude below 116', () => {
    expect(
      createServiceAreaSchema.safeParse({ ...valid, centerLng: 115 }).success,
    ).toBe(false);
  });

  it('rejects longitude above 127.5', () => {
    expect(
      createServiceAreaSchema.safeParse({ ...valid, centerLng: 128 }).success,
    ).toBe(false);
  });

  it('accepts a valid PH longitude (Boracay 121.9272)', () => {
    expect(createServiceAreaSchema.safeParse(valid).success).toBe(true);
  });
});

describe('Bug 322 — radius_km + min_providers bounds', () => {
  it('bug-322-radius-min-providers: rejects radiusKm < 1', () => {
    expect(
      createServiceAreaSchema.safeParse({ ...valid, radiusKm: 0 }).success,
    ).toBe(false);
  });

  it('rejects radiusKm > 100', () => {
    expect(
      createServiceAreaSchema.safeParse({ ...valid, radiusKm: 200 }).success,
    ).toBe(false);
  });

  it('rejects minProvidersToLaunch < 1', () => {
    expect(
      createServiceAreaSchema.safeParse({ ...valid, minProvidersToLaunch: 0 }).success,
    ).toBe(false);
  });

  it('rejects minProvidersToLaunch > 50', () => {
    expect(
      createServiceAreaSchema.safeParse({ ...valid, minProvidersToLaunch: 100 }).success,
    ).toBe(false);
  });

  it('accepts radiusKm 1 (boundary)', () => {
    expect(
      createServiceAreaSchema.safeParse({ ...valid, radiusKm: 1 }).success,
    ).toBe(true);
  });

  it('accepts radiusKm 100 (boundary)', () => {
    expect(
      createServiceAreaSchema.safeParse({ ...valid, radiusKm: 100 }).success,
    ).toBe(true);
  });

  it('rejects non-integer radiusKm', () => {
    expect(
      createServiceAreaSchema.safeParse({ ...valid, radiusKm: 5.5 }).success,
    ).toBe(false);
  });
});

describe('createServiceAreaSchema — required fields + .strict()', () => {
  it('rejects missing centerLat', () => {
    const { centerLat: _, ...noLat } = valid;
    expect(createServiceAreaSchema.safeParse(noLat).success).toBe(false);
  });

  it('rejects empty name', () => {
    expect(createServiceAreaSchema.safeParse({ ...valid, name: '' }).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(
      createServiceAreaSchema.safeParse({ ...valid, evil: 'x' } as unknown).success,
    ).toBe(false);
  });

  it('rejects NaN coordinates', () => {
    expect(
      createServiceAreaSchema.safeParse({ ...valid, centerLat: Number.NaN }).success,
    ).toBe(false);
  });
});

describe('updateServiceAreaSchema — partial updates honor bounds', () => {
  it('accepts a status-only patch', () => {
    expect(
      updateServiceAreaSchema.safeParse({ status: 'paused' }).success,
    ).toBe(true);
  });

  it('rejects out-of-PH lat in patch', () => {
    expect(
      updateServiceAreaSchema.safeParse({ centerLat: 40 }).success,
    ).toBe(false);
  });

  it('rejects unknown keys via .strict()', () => {
    expect(
      updateServiceAreaSchema.safeParse({ name: 'X', evil: 'x' } as unknown).success,
    ).toBe(false);
  });

  it('rejects invalid status enum value', () => {
    expect(
      updateServiceAreaSchema.safeParse({ status: 'invalid' as unknown }).success,
    ).toBe(false);
  });
});
