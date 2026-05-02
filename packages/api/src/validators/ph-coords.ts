import { z } from 'zod';

/**
 * MED-M06 fix — single source of truth for Philippine geographic
 * coordinate bounds, used by every validator that accepts lat/lng.
 *
 * Bounds match migration 074 CHECK constraints:
 *   - latitude:  4.5 .. 21.5  (south Tawi-Tawi to north Batanes)
 *   - longitude: 116 .. 127.5 (west Palawan to east Mindanao)
 *
 * Pre-fix the codebase had two bands floating around — the tight
 * version above (matches DB) used by service-area / booking /
 * recurring / provider-application validators, and a looser
 * 4..22 / 116..128 version used by address + provider-update. The
 * loose version would let users submit coords the DB would reject,
 * causing confusing 500s instead of clean 400s. This helper
 * eliminates that drift.
 */
export const phLatitude = z
  .number()
  .min(4.5, 'Latitude must be within Philippine bounds (4.5..21.5).')
  .max(21.5, 'Latitude must be within Philippine bounds (4.5..21.5).');

export const phLongitude = z
  .number()
  .min(116, 'Longitude must be within Philippine bounds (116..127.5).')
  .max(127.5, 'Longitude must be within Philippine bounds (116..127.5).');

/** Convenience pair for `{ latitude, longitude }` shaped objects. */
export const phLatLng = {
  latitude: phLatitude,
  longitude: phLongitude,
} as const;
