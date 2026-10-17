/**
 * D24 Option A (Ken, 2026-10-18): the server-side Google Maps Platform key
 * for address search (Places API (New) autocomplete and place details, and
 * Geocoding API pin-to-address lookups). See
 * services/geo/address-search.service.ts.
 *
 * Optional. When GOOGLE_MAPS_SERVER_KEY is empty or missing, address search is
 * off: GET /api/v1/config reports addressSearchAvailable=false and the apps
 * keep their own address picker. The key is read on every call (not cached at
 * import), so setting it in the server .env and recreating the API container
 * is enough to switch the feature on.
 *
 * This key is a server secret. It is never logged, never returned by any
 * endpoint (the admin status endpoint reports only "set" or "not set") and
 * never written to a test file: tests use an obviously fake value.
 * It is not the Android map key built into the APK.
 */

// Google API keys are URL-safe strings (today 39 characters starting "AIza").
// Accept any URL-safe value of a plausible length rather than the exact
// shape, so a future key format still works; refuse blanks, spaces and
// template placeholders so a copied example value never looks configured.
const KEY_SHAPE = /^[A-Za-z0-9_-]{30,200}$/;
// Anchored at the start so a real random key can never match by chance.
const PLACEHOLDER = /^(?:(.)\1*$|CHANGE_?ME|YOUR_|PLACEHOLDER|EXAMPLE|XXXX)/i;

/** The configured server key, or null when address search has no usable key. */
export function getGoogleMapsServerKey(): string | null {
  const value = (process.env.GOOGLE_MAPS_SERVER_KEY ?? '').trim();
  if (!value || !KEY_SHAPE.test(value) || PLACEHOLDER.test(value)) return null;
  return value;
}

/** Yes/no only. Safe to report to admins; never reveals the value. */
export function isGoogleMapsServerKeyConfigured(): boolean {
  return getGoogleMapsServerKey() !== null;
}
